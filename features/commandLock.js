/**
 * KOMUT KİLİDİ: bot komutları yalnızca seçilen kanallarda çalışır; başka kanalda küçük bir kart çıkar.
 * Veri: guild.commandLock = { enabled, channels: [id] }. Sunucuyu Yönet / Yönetici yetkisi olanlar muaf.
 * Panel: /commandlock (customId'ler "cmdlock:" ile başlar).
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
  ChannelType, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { getGuild, updateGuild } = require('../utils/database');
const { getGuildLanguage } = require('../utils/i18n');
const { cardPayload } = require('../utils/cardMessage');
const { lockCard } = require('../utils/canvas/cards');
const { tx, banner } = require('./util');

const EXEMPT_COMMANDS = new Set(['commandlock']);
const canManage = (m) => !!(m?.permissions?.has(PermissionFlagsBits.ManageGuild) || m?.permissions?.has(PermissionFlagsBits.Administrator));
const txt = (s) => new TextDisplayBuilder().setContent(s);

function getCfg(guildId) {
  const c = getGuild(guildId).commandLock || {};
  return { enabled: !!c.enabled, channels: Array.isArray(c.channels) ? c.channels : [] };
}
function saveCfg(guildId, cfg) { return updateGuild(guildId, { commandLock: cfg }); }

/** Kanal (ya da başlığın üst kanalı) izinli mi? */
function channelAllowed(channel, cfg) {
  if (!channel) return true;
  return cfg.channels.includes(channel.id) || (channel.isThread?.() && cfg.channels.includes(channel.parentId));
}

/** Komut bu kanalda engellenmeli mi? Engellenirse kartı yanıtlar ve true döner. */
async function guard(interaction) {
  try {
    if (!interaction.guild || EXEMPT_COMMANDS.has(interaction.commandName)) return false;
    const cfg = getCfg(interaction.guild.id);
    if (!cfg.enabled || !cfg.channels.length) return false;
    if (canManage(interaction.member) || channelAllowed(interaction.channel, cfg)) return false;
    const isEn = getGuildLanguage(interaction.guild.id) === 'en';
    const names = cfg.channels.map((id) => interaction.guild.channels.cache.get(id)?.name).filter(Boolean);
    if (!names.length) return false; // silinmiş kanallar: kilit işlevsiz, kimseyi kilitleme
    const png = lockCard({ channels: names, isEn });
    const mentions = cfg.channels.map((id) => `<#${id}>`).join(' ');
    const payload = cardPayload(png, { name: 'lock.png', text: `${isEn ? 'Use bot commands in' : 'Bot komutlarını şurada kullan'}: ${mentions}`, accent: 0xf0b232 });
    payload.flags |= MessageFlags.Ephemeral;
    payload.__keepEphemeral = true; // yanlış kanaldaki uyarı kanalı doldurmasın
    await interaction.reply(payload);
    return true;
  } catch (_) { return false; }
}

function render(guild, note = '') {
  const gid = guild.id;
  const cfg = getCfg(gid);
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  c.addMediaGalleryComponents(banner('commandlock', 'Command channel lock'));
  if (note) c.addTextDisplayComponents(txt(note));
  const list = cfg.channels.length ? cfg.channels.map((id) => `<#${id}>`).join(' ') : tx(gid, '_henüz kanal seçilmedi_', '_no channel picked yet_');
  c.addTextDisplayComponents(txt(
    `## :aegis_lock: ${tx(gid, 'Komut Kilidi', 'Command Lock')}\n` + tx(gid,
      `Durum: ${cfg.enabled ? ':aegis_on: **açık**' : ':aegis_off: **kapalı**'}\nİzinli kanallar: ${list}\n\n-# Açıkken bot komutları yalnızca bu kanallarda çalışır; başka yerde üye bir kart görür. Sunucuyu Yönet yetkisi olanlar her yerde kullanabilir.${cfg.enabled && !cfg.channels.length ? '\n-# ⚠️ Kanal seçmeden kilit işlemez.' : ''}`,
      `Status: ${cfg.enabled ? ':aegis_on: **on**' : ':aegis_off: **off**'}\nAllowed channels: ${list}\n\n-# When on, bot commands only work in these channels; elsewhere members see a card. People with Manage Server can use commands anywhere.${cfg.enabled && !cfg.channels.length ? '\n-# ⚠️ The lock does nothing until you pick a channel.' : ''}`)));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('cmdlock:channels')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(10)
    .setDefaultChannels(cfg.channels.slice(0, 10)).setPlaceholder(tx(gid, 'Komutların çalışacağı kanalları seç…', 'Pick the channels where commands work…'))));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cmdlock:toggle').setLabel(cfg.enabled ? tx(gid, 'Kilidi kapat', 'Turn the lock off') : tx(gid, 'Kilidi aç', 'Turn the lock on')).setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cmdlock:clear').setLabel(tx(gid, 'Kanalları temizle', 'Clear channels')).setStyle(ButtonStyle.Secondary).setDisabled(!cfg.channels.length)));
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

async function open(interaction) {
  if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
  if (!canManage(interaction.member)) return interaction.reply({ content: tx(interaction.guild.id, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral });
  return interaction.reply(render(interaction.guild));
}

async function handle(interaction) {
  const g = interaction.guild;
  if (!g) return;
  if (!canManage(interaction.member)) return interaction.reply({ content: tx(g.id, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral }).catch(() => {});
  const cfg = getCfg(g.id);
  const id = interaction.customId;
  if (id === 'cmdlock:toggle') cfg.enabled = !cfg.enabled;
  else if (id === 'cmdlock:channels') cfg.channels = interaction.values.slice(0, 10);
  else if (id === 'cmdlock:clear') cfg.channels = [];
  else return;
  // Kilit açıkken seçili kanal yoksa kendini kilitleyen sunucu olmasın: kanal yokken kapalı sayılır (guard bunu zaten yok sayar)
  saveCfg(g.id, cfg);
  return interaction.update({ components: render(g).components });
}

module.exports = { guard, open, handle, getCfg, render };
