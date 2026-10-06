/**
 * BUMP HATIRLATICISI
 * DISBOARD "bump done" mesajını görünce 2 saat sonra aynı kanalda (istenirse bir rolü etiketleyerek) hatırlatır.
 * Veri: guild.bump = { enabled, roleId, channelId, nextAt, lastUserId }. Zamanlayıcı yeniden başlatmaya dayanıklıdır (nextAt kaydedilir).
 */
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { getGuild, updateGuild, readDB } = require('../utils/database');
const { tx } = require('./util');

const DISBOARD_ID = '302050872383242240';
const WAIT_MS = 2 * 3600 * 1000;

function getCfg(guildId) {
  const b = getGuild(guildId).bump || {};
  return { enabled: !!b.enabled, roleId: b.roleId || null, channelId: b.channelId || null, nextAt: b.nextAt || 0, lastUserId: b.lastUserId || null, count: b.count || 0 };
}
function saveCfg(guildId, cfg) { return updateGuild(guildId, { bump: cfg }); }

/** DISBOARD'un başarılı bump mesajı mı? (bekleme uyarısı değil) */
function isBumpDone(message) {
  if (message.author?.id !== DISBOARD_ID) return false;
  const desc = (message.embeds || []).map((e) => e.description || '').join(' ');
  const cmd = message.interactionMetadata?.name || message.interaction?.commandName || '';
  if (/wait|minutes|dakika|bekle|cooldown/i.test(desc)) return false;
  return /bump done|bumped|:thumbsup:|👍/i.test(desc) || (/bump/i.test(cmd) && desc.length > 0);
}

async function onMessage(message) {
  if (!message.guild || !isBumpDone(message)) return;
  const cfg = getCfg(message.guild.id);
  if (!cfg.enabled) return;
  const user = message.interactionMetadata?.user || message.interaction?.user || null;
  cfg.nextAt = Date.now() + WAIT_MS;
  cfg.channelId = cfg.channelId || message.channelId;
  cfg.lastUserId = user?.id || null;
  cfg.count += 1;
  saveCfg(message.guild.id, cfg);
  const c = new ContainerBuilder().setAccentColor(0x3ba55c).addTextDisplayComponents(new TextDisplayBuilder().setContent(
    tx(message.guild.id,
      `:aegis_happy: Teşekkürler${user ? ` <@${user.id}>` : ''}! Sunucu öne çıkarıldı. 2 saat sonra hatırlatırım.`,
      `:aegis_happy: Thanks${user ? ` <@${user.id}>` : ''}! The server was bumped. I will remind you in 2 hours.`)));
  await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { users: user ? [user.id] : [] } }).catch(() => {});
}

async function remind(guild, cfg) {
  const channel = guild.channels.cache.get(cfg.channelId) || await guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel) return false;
  const ping = cfg.roleId ? `<@&${cfg.roleId}> ` : '';
  const c = new ContainerBuilder().setAccentColor(0x0066ff).addTextDisplayComponents(new TextDisplayBuilder().setContent(
    tx(guild.id, `## :aegis_bell: Bump zamanı!\n${ping}Sunucuyu öne çıkarmak için \`/bump\` yaz.`, `## :aegis_bell: Time to bump!\n${ping}Type \`/bump\` to push the server up.`)));
  const sent = await channel.send({ components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: cfg.roleId ? [cfg.roleId] : [] } }).catch(() => null);
  return !!sent;
}

async function tick(client) {
  const db = readDB();
  const now = Date.now();
  for (const gid of Object.keys(db)) {
    if (gid.startsWith('_')) continue;
    const b = db[gid]?.bump;
    if (!b?.enabled || !b.nextAt || b.nextAt > now || !b.channelId) continue;
    const guild = client.guilds.cache.get(gid);
    if (!guild) continue;
    const cfg = getCfg(gid);
    cfg.nextAt = 0; // bir kez hatırlat
    saveCfg(gid, cfg);
    await remind(guild, cfg).catch((e) => console.error('[bump]', e.message));
  }
}

module.exports = { getCfg, saveCfg, onMessage, tick, remind, isBumpDone, DISBOARD_ID, WAIT_MS };
