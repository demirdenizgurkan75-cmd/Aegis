/**
 * /ticket komutunun "canlı çeviri" sekmesi (eskiden ayrı /ticket-translate komutuydu), Components V2 panel (yönetici).
 * Durum, yetkili dili (iki seçim menüsü: 30 dil), aç/kapat, günlük AI kotası.
 * customId'ler "ttui:" ile başlar.
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { getCfg, saveCfg, langName } = require('./ticketTranslate');
const { checkTicketAiLimit } = require('../utils/database');
const { LOCALES } = require('../utils/i18n');
const { tx, banner } = require('./util');

const isAdmin = (member) => !!member?.permissions?.has(PermissionFlagsBits.ManageGuild) || !!member?.permissions?.has(PermissionFlagsBits.Administrator);
const txt = (s) => new TextDisplayBuilder().setContent(s);
const CODES = Object.keys(LOCALES);

function langSelect(id, codes, current, placeholder) {
  return new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).addOptions(
    codes.map((code) => ({ label: `${LOCALES[code]} (${code})`.slice(0, 100), value: code, default: code === current })));
}

function render(guild, { note = '' } = {}) {
  const gid = guild.id;
  const cfg = getCfg(gid);
  const q = checkTicketAiLimit(gid);
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  c.addMediaGalleryComponents(banner('ticket-translate', 'Live Ticket Translation'));
  c.addActionRowComponents(require('./ticketHub').tabRow(gid, 'tr'));
  if (note) c.addTextDisplayComponents(txt(note));
  c.addTextDisplayComponents(txt(
    `## ${tx(gid, 'Çok Dilli Biletler', 'Multilingual Tickets')}\n` +
    tx(gid,
      `Durum: ${cfg.enabled ? ':aegis_on: **açık**' : ':aegis_off: **kapalı**'}\nYetkili dili: **${langName(cfg.staffLang)}**\nBugünkü AI kotası: **${q.usage}/${Number.isFinite(q.limit) ? q.limit : '∞'}** (Ticket AI ile ortak)`,
      `Status: ${cfg.enabled ? ':aegis_on: **on**' : ':aegis_off: **off**'}\nStaff language: **${langName(cfg.staffLang)}**\nToday's AI quota: **${q.usage}/${Number.isFinite(q.limit) ? q.limit : '∞'}** (shared with Ticket AI)`)));
  c.addTextDisplayComponents(txt(tx(gid,
    '-# Nasıl çalışır: üye biletinde kendi dilinde yazar, mesajın altına yetkili dilinde çeviri eklenir. Yetkili cevabı da üyenin diline çevrilir. Dil otomatik algılanır.',
    '-# How it works: a member writes in their own language and a translation in your staff language appears under the message. Staff replies are translated back. The language is detected automatically.')));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(langSelect('ttui:lang1', CODES.slice(0, 25), cfg.staffLang, tx(gid, 'Yetkili dili…', 'Staff language…'))));
  if (CODES.length > 25) c.addActionRowComponents(new ActionRowBuilder().addComponents(langSelect('ttui:lang2', CODES.slice(25), cfg.staffLang, tx(gid, 'Diğer diller…', 'More languages…'))));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ttui:toggle').setLabel(cfg.enabled ? tx(gid, 'Kapat', 'Turn off') : tx(gid, 'Aç', 'Turn on')).setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Primary)));
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

async function open(interaction) {
  const g = interaction.guild;
  if (!g) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
  if (!isAdmin(interaction.member)) return interaction.reply({ content: tx(g.id, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral });
  return interaction.reply(render(g));
}

async function handle(interaction) {
  const g = interaction.guild;
  if (!g) return;
  if (!isAdmin(interaction.member)) return interaction.reply({ content: tx(g.id, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral }).catch(() => {});
  const cfg = getCfg(g.id);
  const show = (opts) => interaction.update({ components: render(g, opts).components });

  if (interaction.customId === 'ttui:toggle') {
    cfg.enabled = !cfg.enabled; saveCfg(g.id, cfg);
    return show({ note: cfg.enabled ? tx(g.id, '✅ Çok dilli biletler açıldı.', '✅ Multilingual tickets are on.') : tx(g.id, '✅ Kapatıldı.', '✅ Turned off.') });
  }
  if (interaction.customId === 'ttui:lang1' || interaction.customId === 'ttui:lang2') {
    const code = interaction.values[0];
    if (!LOCALES[code]) return show({ note: '❌' });
    cfg.staffLang = code; saveCfg(g.id, cfg);
    return show({ note: tx(g.id, `✅ Yetkili dili: **${langName(code)}**`, `✅ Staff language: **${langName(code)}**`) });
  }
}

module.exports = { open, handle, render };
