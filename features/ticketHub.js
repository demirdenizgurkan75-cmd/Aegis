/**
 * /ticket: tek komut, üç sekmeli Components V2 panel (yönetici).
 *  - Kurulum: kategori, yetkili rolü, log kanalı, otomatik kapanma ve "paneli bu kanala gönder"
 *  - Yapay zeka: ticketAiPanel.js   - Canlı çeviri: ticketTranslatePanel.js
 * Eskiden /ticket settings, /ticket panel, /ticket-ai ve /ticket-translate ayrı komutlardı. customId'ler "tkhub:" ile başlar.
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { getGuild, updateGuild } = require('../utils/database');
const { createTranslator } = require('../utils/i18n');
const { tx, banner } = require('./util');

const P = PermissionFlagsBits;
const canManage = (m) => !!(m?.permissions?.has(P.ManageChannels) || m?.permissions?.has(P.ManageGuild) || m?.permissions?.has(P.Administrator));
const txt = (s) => new TextDisplayBuilder().setContent(s);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const mention = (kind, id, gid) => (id ? `<${kind}${id}>` : tx(gid, '_seçilmedi_', '_not set_'));

/** Üç sekme: kurulum / yapay zeka / çeviri. AI ve çeviri panelleri bunu kendi üstlerine koyar. */
function tabRow(gid, active) {
  const t = (id, tr, en) => btn(`tkhub:tab_${id}`, tx(gid, tr, en), active === id ? ButtonStyle.Primary : ButtonStyle.Secondary, active === id);
  return new ActionRowBuilder().addComponents(t('setup', 'Kurulum', 'Setup'), t('ai', 'Yapay zeka', 'AI assistant'), t('tr', 'Canlı çeviri', 'Live translation'));
}

function renderSetup(guild, { note = '' } = {}) {
  const gid = guild.id;
  const s = getGuild(gid);
  const ready = !!(s.ticketCategory && s.ticketStaffRole);
  const c = new ContainerBuilder().setAccentColor(ready ? 0x0066ff : 0xf0b232);
  c.addMediaGalleryComponents(banner('ticket', 'Support tickets'));
  c.addActionRowComponents(tabRow(gid, 'setup'));
  if (note) c.addTextDisplayComponents(txt(note));
  c.addTextDisplayComponents(txt(
    `## :aegis_ticket: ${tx(gid, 'Destek Biletleri', 'Support Tickets')}\n` + tx(gid,
      `Kategori: ${mention('#', s.ticketCategory, gid)}\nYetkili rolü: ${mention('@&', s.ticketStaffRole, gid)}\nLog kanalı: ${mention('#', s.ticketLogChannel, gid)}\nHareketsiz bilet otomatik kapanma: **${s.ticketAutoCloseHours ? `${s.ticketAutoCloseHours} saat` : 'kapalı'}**`,
      `Category: ${mention('#', s.ticketCategory, gid)}\nStaff role: ${mention('@&', s.ticketStaffRole, gid)}\nLog channel: ${mention('#', s.ticketLogChannel, gid)}\nAuto-close for silent tickets: **${s.ticketAutoCloseHours ? `${s.ticketAutoCloseHours} h` : 'off'}**`)));
  if (!ready) c.addTextDisplayComponents(txt(tx(gid, ':aegis_warn: Önce kategori ve yetkili rolünü seç, sonra paneli gönder.', ':aegis_warn: Pick the category and staff role first, then post the panel.')));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('tkhub:cat').setChannelTypes(ChannelType.GuildCategory).setPlaceholder(tx(gid, 'Bilet kategorisi…', 'Ticket category…'))));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('tkhub:role').setPlaceholder(tx(gid, 'Yetkili destek rolü…', 'Staff support role…'))));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('tkhub:log').setChannelTypes(ChannelType.GuildText).setPlaceholder(tx(gid, 'Log kanalı…', 'Log channel…'))));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    btn('tkhub:post', tx(gid, 'Paneli bu kanala gönder', 'Post the panel in this channel'), ButtonStyle.Success, !ready),
    btn('tkhub:auto', tx(gid, 'Otomatik kapanma', 'Auto-close'))));
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

/** Üyelerin bilet açtığı herkese açık panel. */
async function postPanel(interaction) {
  const { guild } = interaction;
  const gid = guild.id;
  const t = createTranslator(gid);
  const isEn = tx(gid, 'tr', 'en') === 'en';
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  c.addMediaGalleryComponents(banner('ticket', 'Support tickets'));
  c.addTextDisplayComponents(txt(t('ticket.panel_title')));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addTextDisplayComponents(txt(t('ticket.panel_desc')));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addTextDisplayComponents(txt(t('ticket.open_ticket')));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('create_ticket').setLabel(isEn ? '🛠️ General Support' : '🛠️ Genel Destek').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('create_ticket_sikayet').setLabel(isEn ? '💡 Complaints & Suggestions' : '💡 Şikayet & Öneri').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('create_ticket_basvuru').setLabel(isEn ? '🤝 Staff Application' : '🤝 Yetkili & Başvuru').setStyle(ButtonStyle.Secondary)));
  require('../utils/tier').addBrand(c, gid);
  const msg = await interaction.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
  updateGuild(gid, { ticketPanelMessage: msg.id, ticketPanelChannel: interaction.channel.id });
  return msg;
}

async function open(interaction) {
  if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
  if (!canManage(interaction.member)) return interaction.reply({ content: tx(interaction.guild.id, '❌ Kanalları Yönet yetkisi gerekli.', '❌ Manage Channels permission required.'), flags: MessageFlags.Ephemeral });
  return interaction.reply(renderSetup(interaction.guild));
}

async function handle(interaction, client) {
  const g = interaction.guild;
  if (!g) return;
  const gid = g.id;
  if (!canManage(interaction.member)) return interaction.reply({ content: tx(gid, '❌ Kanalları Yönet yetkisi gerekli.', '❌ Manage Channels permission required.'), flags: MessageFlags.Ephemeral }).catch(() => {});
  const id = interaction.customId;
  const show = (note) => interaction.update({ components: renderSetup(g, { note }).components });

  if (id === 'tkhub:tab_setup') return show();
  if (id === 'tkhub:tab_ai') return interaction.update({ components: require('./ticketAiPanel').render(g).components });
  if (id === 'tkhub:tab_tr') return interaction.update({ components: require('./ticketTranslatePanel').render(g).components });

  const me = g.members.me;
  if (id === 'tkhub:cat') {
    const ch = interaction.channels?.first?.() || g.channels.cache.get(interaction.values[0]);
    if (me && ch && !ch.permissionsFor(me)?.has(P.ManageChannels)) return show(tx(gid, `:aegis_no: ${ch} içinde **Kanalları Yönet** yetkim olmalı.`, `:aegis_no: I need **Manage Channels** in ${ch}.`));
    updateGuild(gid, { ticketCategory: interaction.values[0] });
    return show(tx(gid, ':aegis_ok: Kategori kaydedildi.', ':aegis_ok: Category saved.'));
  }
  if (id === 'tkhub:role') {
    if (interaction.values[0] === gid) return show(tx(gid, ':aegis_no: Yetkili rolü @everyone olamaz.', ':aegis_no: The staff role cannot be @everyone.'));
    updateGuild(gid, { ticketStaffRole: interaction.values[0] });
    return show(tx(gid, ':aegis_ok: Yetkili rolü kaydedildi.', ':aegis_ok: Staff role saved.'));
  }
  if (id === 'tkhub:log') {
    const ch = interaction.channels?.first?.() || g.channels.cache.get(interaction.values[0]);
    if (me && ch && !ch.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages])) return show(tx(gid, `:aegis_no: ${ch} kanalına mesaj gönderemiyorum.`, `:aegis_no: I cannot send messages in ${ch}.`));
    updateGuild(gid, { ticketLogChannel: interaction.values[0] });
    return show(tx(gid, ':aegis_ok: Log kanalı kaydedildi.', ':aegis_ok: Log channel saved.'));
  }
  if (id === 'tkhub:auto') {
    return interaction.showModal(new ModalBuilder().setCustomId('tkhub:autoSave').setTitle(tx(gid, 'Otomatik kapanma', 'Auto-close')).addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel(tx(gid, 'Kaç saat sessiz kalırsa kapansın? 0 = kapalı', 'Close after how many silent hours? 0 = off')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setValue(String(getGuild(gid).ticketAutoCloseHours || 0)))));
  }
  if (id === 'tkhub:autoSave') {
    const n = parseInt(interaction.fields.getTextInputValue('hours'), 10);
    const hours = Number.isFinite(n) ? Math.min(720, Math.max(0, n)) : 0;
    updateGuild(gid, { ticketAutoCloseHours: hours });
    return show(hours ? tx(gid, `:aegis_ok: Hareketsiz biletler **${hours} saat** sonra kapanır.`, `:aegis_ok: Silent tickets close after **${hours} h**.`) : tx(gid, ':aegis_ok: Otomatik kapanma kapatıldı.', ':aegis_ok: Auto-close is off.'));
  }
  if (id === 'tkhub:post') {
    const s = getGuild(gid);
    if (!s.ticketCategory || !s.ticketStaffRole) return show(tx(gid, ':aegis_no: Önce kategori ve yetkili rolünü seç.', ':aegis_no: Pick the category and staff role first.'));
    try { await postPanel(interaction); } catch (_) {
      return show(tx(gid, ':aegis_no: Bu kanala gönderemiyorum. Kanalı Görüntüle ve Mesaj Gönder yetkisi lazım.', ':aegis_no: I cannot post in this channel. I need View Channel and Send Messages.'));
    }
    return show(tx(gid, ':aegis_ok: Bilet paneli bu kanala gönderildi.', ':aegis_ok: The ticket panel was posted in this channel.'));
  }
}

module.exports = { open, handle, renderSetup, tabRow, postPanel, canManage };
