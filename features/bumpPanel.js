/** /bump: bump hatırlatıcı paneli (yönetici). customId'ler "bumpui:" ile başlar. */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { getCfg, saveCfg, remind } = require('./bump');
const { tx, banner } = require('./util');

const isAdmin = (m) => !!m?.permissions?.has(PermissionFlagsBits.ManageGuild);
const txt = (s) => new TextDisplayBuilder().setContent(s);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

function render(guild, { note = '' } = {}) {
  const gid = guild.id;
  const cfg = getCfg(gid);
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  c.addMediaGalleryComponents(banner('bump', 'Bump reminder'));
  if (note) c.addTextDisplayComponents(txt(note));
  c.addTextDisplayComponents(txt(
    `## :aegis_bell: ${tx(gid, 'Bump Hatırlatıcısı', 'Bump Reminder')}\n` + tx(gid,
      `Durum: ${cfg.enabled ? ':aegis_on: **açık**' : ':aegis_off: **kapalı**'}\nHatırlatma kanalı: ${cfg.channelId ? `<#${cfg.channelId}>` : 'ilk bump\'ın yapıldığı kanal'}\nEtiketlenecek rol: ${cfg.roleId ? `<@&${cfg.roleId}>` : 'yok'}\nSonraki hatırlatma: ${cfg.nextAt ? `<t:${Math.floor(cfg.nextAt / 1000)}:R>` : '—'}\nToplam bump: **${cfg.count}**`,
      `Status: ${cfg.enabled ? ':aegis_on: **on**' : ':aegis_off: **off**'}\nReminder channel: ${cfg.channelId ? `<#${cfg.channelId}>` : 'the channel of the first bump'}\nRole to ping: ${cfg.roleId ? `<@&${cfg.roleId}>` : 'none'}\nNext reminder: ${cfg.nextAt ? `<t:${Math.floor(cfg.nextAt / 1000)}:R>` : '—'}\nTotal bumps: **${cfg.count}**`)));
  c.addTextDisplayComponents(txt(tx(gid,
    '-# DISBOARD ile `/bump` yapılınca Aegis bunu görür, 2 saat sonra aynı kanalda hatırlatır. DISBOARD botu sunucuda olmalı.',
    '-# When someone runs `/bump` with DISBOARD, Aegis sees it and reminds the channel 2 hours later. The DISBOARD bot must be in the server.')));
  c.addSeparatorComponents(new SeparatorBuilder());
  const chSel = new ChannelSelectMenuBuilder().setCustomId('bumpui:chan').setPlaceholder(tx(gid, 'Hatırlatma kanalını seç…', 'Pick the reminder channel…')).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (cfg.channelId) chSel.setDefaultChannels([cfg.channelId]);
  const roleSel = new RoleSelectMenuBuilder().setCustomId('bumpui:role').setPlaceholder(tx(gid, 'Etiketlenecek rolü seç (isteğe bağlı)…', 'Pick a role to ping (optional)…'));
  if (cfg.roleId) roleSel.setDefaultRoles([cfg.roleId]);
  c.addActionRowComponents(new ActionRowBuilder().addComponents(chSel));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(roleSel));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    btn('bumpui:test', tx(gid, 'Şimdi hatırlat', 'Remind now'), ButtonStyle.Secondary, !cfg.channelId),
    btn('bumpui:clearrole', tx(gid, 'Rolü kaldır', 'Clear role'), ButtonStyle.Secondary, !cfg.roleId),
    btn('bumpui:toggle', cfg.enabled ? tx(gid, 'Kapat', 'Turn off') : tx(gid, 'Aç', 'Turn on'), cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success)));
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

async function open(interaction) {
  if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
  if (!isAdmin(interaction.member)) return interaction.reply({ content: tx(interaction.guild.id, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral });
  return interaction.reply(render(interaction.guild));
}
const show = (interaction, opts) => { const p = render(interaction.guild, opts); return interaction.update({ components: p.components }); };

async function handle(interaction) {
  const g = interaction.guild;
  if (!g) return;
  const gid = g.id;
  if (!isAdmin(interaction.member)) return interaction.reply({ content: tx(gid, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral }).catch(() => {});
  const cfg = getCfg(gid);
  const id = interaction.customId;
  if (id === 'bumpui:chan') { cfg.channelId = interaction.values[0]; saveCfg(gid, cfg); return show(interaction, { note: tx(gid, `✅ Kanal: <#${cfg.channelId}>.`, `✅ Channel: <#${cfg.channelId}>.`) }); }
  if (id === 'bumpui:role') { cfg.roleId = interaction.values[0]; saveCfg(gid, cfg); return show(interaction, { note: tx(gid, `✅ Rol: <@&${cfg.roleId}>.`, `✅ Role: <@&${cfg.roleId}>.`) }); }
  if (id === 'bumpui:clearrole') { cfg.roleId = null; saveCfg(gid, cfg); return show(interaction, { note: '✅' }); }
  if (id === 'bumpui:toggle') { cfg.enabled = !cfg.enabled; if (!cfg.enabled) cfg.nextAt = 0; saveCfg(gid, cfg); return show(interaction, { note: cfg.enabled ? tx(gid, '✅ Açıldı. İlk `/bump`\'tan sonra hatırlatma başlar.', '✅ Turned on. Reminders start after the first `/bump`.') : tx(gid, '✅ Kapatıldı.', '✅ Turned off.') }); }
  if (id === 'bumpui:test') {
    const ok = await remind(g, cfg);
    return show(interaction, { note: ok ? tx(gid, '✅ Hatırlatma gönderildi.', '✅ Reminder sent.') : tx(gid, '❌ Kanala yazamadım.', '❌ I could not write in that channel.') });
  }
}

module.exports = { open, handle, render };
