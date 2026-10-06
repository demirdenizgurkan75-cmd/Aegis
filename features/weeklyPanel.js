/** /ai paneli, "Haftalık özet kartı": haftalık sunucu kartı paneli (yönetici). customId'ler "weeklyui:" ile başlar. */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, ChannelType, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { getCfg, saveCfg, send, WEEK } = require('./weekly');
const { tx, banner } = require('./util');

const isAdmin = (member) => !!member?.permissions?.has(PermissionFlagsBits.ManageGuild);
const txt = (s) => new TextDisplayBuilder().setContent(s);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

function render(guild, { note = '' } = {}) {
  const gid = guild.id;
  const cfg = getCfg(gid);
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  c.addMediaGalleryComponents(banner('weekly', 'Weekly summary'));
  if (note) c.addTextDisplayComponents(txt(note));
  c.addTextDisplayComponents(txt(
    `## :aegis_chart: ${tx(gid, 'Haftalık Sunucu Kartı', 'Weekly Server Card')}\n` + tx(gid,
      `Durum: ${cfg.enabled ? ':aegis_on: **açık**' : ':aegis_off: **kapalı**'}\nKanal: ${cfg.channelId ? `<#${cfg.channelId}>` : 'ayarlanmamış'}\nSonraki kart: ${cfg.enabled && cfg.nextAt ? `<t:${Math.floor(cfg.nextAt / 1000)}:R>` : '—'}`,
      `Status: ${cfg.enabled ? ':aegis_on: **on**' : ':aegis_off: **off**'}\nChannel: ${cfg.channelId ? `<#${cfg.channelId}>` : 'not set'}\nNext card: ${cfg.enabled && cfg.nextAt ? `<t:${Math.floor(cfg.nextAt / 1000)}:R>` : '—'}`)));
  c.addTextDisplayComponents(txt(tx(gid,
    '-# Her hafta seçtiğin kanala son 7 günün özeti tek bir kartla gider: günlük mesaj grafiği, yeni üyeler ve en aktif kanallar. Veriler botun zaten tuttuğu istatistiklerdir.',
    '-# Every week the last 7 days land in the channel you pick as one card: a daily message chart, new members and the most active channels. The numbers are statistics the bot already keeps.')));
  c.addSeparatorComponents(new SeparatorBuilder());
  const chSel = new ChannelSelectMenuBuilder().setCustomId('weeklyui:chan').setPlaceholder(tx(gid, 'Kartın gideceği kanalı seç…', 'Pick the channel for the card…')).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (cfg.channelId) chSel.setDefaultChannels([cfg.channelId]);
  c.addActionRowComponents(new ActionRowBuilder().addComponents(chSel));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    btn('weeklyui:now', tx(gid, 'Şimdi gönder', 'Send now'), ButtonStyle.Primary, !cfg.channelId),
    btn('weeklyui:toggle', cfg.enabled ? tx(gid, 'Kapat', 'Turn off') : tx(gid, 'Aç', 'Turn on'), cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success)));
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

async function open(interaction) {
  if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
  if (!isAdmin(interaction.member)) return interaction.reply({ content: tx(interaction.guild.id, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral });
  return interaction.reply(render(interaction.guild));
}

async function show(interaction, opts) {
  const p = render(interaction.guild, opts);
  return interaction.update({ components: p.components });
}

async function handle(interaction) {
  const g = interaction.guild;
  if (!g) return;
  const gid = g.id;
  if (!isAdmin(interaction.member)) return interaction.reply({ content: tx(gid, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral }).catch(() => {});
  const cfg = getCfg(gid);
  const id = interaction.customId;

  if (id === 'weeklyui:chan') {
    cfg.channelId = interaction.values[0]; saveCfg(gid, cfg);
    return show(interaction, { note: tx(gid, `✅ Kanal: <#${cfg.channelId}>.`, `✅ Channel: <#${cfg.channelId}>.`) });
  }
  if (id === 'weeklyui:toggle') {
    if (!cfg.enabled && !cfg.channelId) return show(interaction, { note: tx(gid, '❌ Açmadan önce kanalı seç.', '❌ Pick a channel before turning it on.') });
    cfg.enabled = !cfg.enabled;
    cfg.nextAt = cfg.enabled ? Date.now() + WEEK : 0;
    saveCfg(gid, cfg);
    return show(interaction, { note: cfg.enabled ? tx(gid, '✅ Açıldı. İlk kart bir hafta sonra gelir; denemek için **Şimdi gönder**\'e bas.', '✅ Turned on. The first card arrives in a week; press **Send now** to try it.') : tx(gid, '✅ Kapatıldı.', '✅ Turned off.') });
  }
  if (id === 'weeklyui:now') {
    await interaction.deferUpdate();
    const res = await send(g, cfg.channelId).catch((e) => ({ err: e.message }));
    const p = render(g, { note: res.ok
      ? tx(gid, `✅ Kart <#${cfg.channelId}> kanalına gönderildi.`, `✅ The card was sent to <#${cfg.channelId}>.`)
      : tx(gid, '❌ Kartı gönderemedim: kanalda mesaj ve dosya yükleme yetkim olmalı.', '❌ I could not send the card: I need to send messages and attach files in that channel.') });
    return interaction.editReply({ components: p.components });
  }
}

module.exports = { open, handle, render };
