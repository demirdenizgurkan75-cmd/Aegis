/**
 * /moderation: tek komut, her şey tek panelde. Üye seç → uyar, sustur, at, banla; "Mesaj temizle" üyeden bağımsız.
 * Eylemlerin kendisi (yetki, rol sırası, ban DM'i, dava kaydı, log) commands/moderasyon.js içindeki perform() ile yapılır.
 * customId'ler "modpanel:" ile başlar; sebep ve süre modal ile sorulur.
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { getWarnings } = require('../utils/database');
const { historyLines } = require('./modlog');
const { tx, banner } = require('./util');

const P = PermissionFlagsBits;
const NEEDS = { warn: P.ModerateMembers, timeout: P.ModerateMembers, kick: P.KickMembers, ban: P.BanMembers, purge: P.ManageMessages };
const has = (m, p) => !!m?.permissions?.has(p);
const isMod = (m) => Object.values(NEEDS).some((p) => has(m, p)) || has(m, P.ManageGuild);
const txt = (s) => new TextDisplayBuilder().setContent(s);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const field = (id, label, o = {}) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label)
  .setStyle(o.long ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!!o.required).setMaxLength(o.max || 400).setPlaceholder(o.ph || ''));

function render(interaction, { userId = null, note = '' } = {}) {
  const gid = interaction.guild.id;
  const m = interaction.member;
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  c.addMediaGalleryComponents(banner('moderation', 'Moderation'));
  if (note) c.addTextDisplayComponents(txt(note));
  if (!userId) {
    c.addTextDisplayComponents(txt(`## :aegis_hammer: ${tx(gid, 'Moderasyon', 'Moderation')}\n` + tx(gid,
      'Bir üye seç; uyar, sustur, at ya da banla. Her işlem bir dava numarası alır ve `/modlog` dosyasına yazılır. Mesaj temizlemek için üye seçmen gerekmez.',
      'Pick a member to warn, time out, kick or ban. Every action gets a case number in the `/modlog` file. Purging messages needs no member.')));
  } else {
    const warns = getWarnings(gid, userId).length;
    c.addTextDisplayComponents(txt(`## :aegis_hammer: <@${userId}>\n${tx(gid, 'Toplam uyarı', 'Total warnings')}: **${warns}**\n${historyLines(gid, userId, 3)}`));
  }
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('modpanel:user')
    .setPlaceholder(userId ? tx(gid, 'Başka bir üye seç…', 'Pick another member…') : tx(gid, 'İşlem yapılacak üyeyi seç…', 'Pick the member…'))));
  if (userId) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      btn(`modpanel:act:warn:${userId}`, tx(gid, 'Uyar', 'Warn'), ButtonStyle.Primary, !has(m, NEEDS.warn)),
      btn(`modpanel:act:timeout:${userId}`, tx(gid, 'Sustur', 'Timeout'), ButtonStyle.Secondary, !has(m, NEEDS.timeout)),
      btn(`modpanel:act:kick:${userId}`, tx(gid, 'At', 'Kick'), ButtonStyle.Danger, !has(m, NEEDS.kick)),
      btn(`modpanel:act:ban:${userId}`, tx(gid, 'Banla', 'Ban'), ButtonStyle.Danger, !has(m, NEEDS.ban))));
  }
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    btn('modpanel:act:purge:0', tx(gid, 'Mesaj temizle', 'Purge messages'), ButtonStyle.Secondary, !has(m, NEEDS.purge)),
    ...(userId ? [btn('modpanel:home', tx(gid, 'Başa dön', 'Start over'))] : [])));
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

async function open(interaction) {
  if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
  if (!isMod(interaction.member)) return interaction.reply({ content: tx(interaction.guild.id, '❌ Moderatör yetkisi gerekli.', '❌ Moderator permission required.'), flags: MessageFlags.Ephemeral });
  return interaction.reply(render(interaction));
}

async function handle(interaction, client) {
  const g = interaction.guild;
  if (!g) return;
  const gid = g.id;
  if (!isMod(interaction.member)) return interaction.reply({ content: tx(gid, '❌ Moderatör yetkisi gerekli.', '❌ Moderator permission required.'), flags: MessageFlags.Ephemeral }).catch(() => {});
  const id = interaction.customId;
  const upd = (opts) => interaction.update({ components: render(interaction, opts).components });

  if (id === 'modpanel:home') return upd();
  if (id === 'modpanel:user') return upd({ userId: interaction.values[0] });

  if (id.startsWith('modpanel:act:')) {
    const [, , action, userId] = id.split(':');
    if (!NEEDS[action] || !has(interaction.member, NEEDS[action])) return interaction.reply({ content: tx(gid, ':aegis_no: Bu eylem için yetkin yok.', ':aegis_no: You do not have permission for this action.'), flags: MessageFlags.Ephemeral }).catch(() => {});
    const m = new ModalBuilder().setCustomId(`modpanel:do:${action}:${userId}`);
    if (action === 'purge') {
      m.setTitle(tx(gid, 'Mesaj temizle', 'Purge messages')).addComponents(field('amount', tx(gid, 'Kaç mesaj? (1-100)', 'How many messages? (1-100)'), { required: true, max: 3, ph: '10' }));
    } else if (action === 'timeout') {
      m.setTitle(tx(gid, 'Sustur', 'Timeout')).addComponents(
        field('duration', tx(gid, 'Süre (30s, 10dk, 2sa, 1g)', 'Duration (30s, 10m, 2h, 1d)'), { required: true, max: 10, ph: '10dk' }),
        field('reason', tx(gid, 'Sebep', 'Reason'), { long: true }));
    } else {
      const titles = { warn: ['Uyar', 'Warn'], kick: ['At', 'Kick'], ban: ['Banla', 'Ban'] }[action];
      m.setTitle(tx(gid, titles[0], titles[1])).addComponents(field('reason', tx(gid, 'Sebep', 'Reason'), { long: true }));
    }
    return interaction.showModal(m);
  }

  if (id.startsWith('modpanel:do:')) {
    const [, , action, userId] = id.split(':');
    const get = (k) => { try { return interaction.fields.getTextInputValue(k); } catch (_) { return ''; } };
    const user = action === 'purge' ? interaction.user : await client.users.fetch(userId).catch(() => null);
    if (!user) return interaction.reply({ content: tx(gid, ':aegis_no: Kullanıcı bulunamadı.', ':aegis_no: User not found.'), flags: MessageFlags.Ephemeral }).catch(() => {});
    const amount = parseInt(get('amount'), 10);
    return require('../commands/moderasyon').perform(interaction, {
      user, action, reason: get('reason'), durationStr: get('duration').trim() || null, amount: Number.isFinite(amount) ? amount : null,
    });
  }
}

module.exports = { open, handle, render };
