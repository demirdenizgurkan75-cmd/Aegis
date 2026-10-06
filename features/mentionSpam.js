/**
 * ETİKET SPAM KORUMASI
 * Kısa sürede çok fazla kişi/rol etiketleyen üyenin mesajını siler, susturur ve dava kaydı açar.
 * Puan: her etiketlenen kişi 1, her rol 3 (rol etiketi tek mesajda yüzlerce kişiyi uyandırır). ~10 sn içindeki mesajlar toplanır.
 * Veri: guild.mentionSpam = { enabled, limit, timeoutMin } (varsayılan kapalı). Yetkililer (Mesajları Yönet, Yönetici) muaf.
 */
const { PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { getGuildLanguage } = require('../utils/i18n');
const { cardPayload } = require('../utils/cardMessage');
const { mentionCard } = require('../utils/canvas/cards');
const { recordCase } = require('./modlog');
const { tx } = require('./util');

const WINDOW_MS = 10000;
const ROLE_WEIGHT = 3;
const recent = new Map(); // gid:uid → [{ t, points, msg }]

function getCfg(guildId) {
  const c = getGuild(guildId).mentionSpam || {};
  return { enabled: !!c.enabled, limit: c.limit || 8, timeoutMin: c.timeoutMin || 10 };
}
function saveCfg(guildId, cfg) { return updateGuild(guildId, { mentionSpam: cfg }); }

/** Mesajın etiket puanı: kişiler (kendisi ve botlar hariç) + roller × 3 + gerçek @everyone/@here. */
function scoreOf(message) {
  let users = 0;
  for (const u of message.mentions.users.values()) if (u.id !== message.author.id && !u.bot) users += 1;
  const roles = message.mentions.roles.size;
  const everyone = message.mentions.everyone ? 1 : 0;
  return { points: users + roles * ROLE_WEIGHT + everyone * ROLE_WEIGHT * 2, users, roles, everyone };
}

async function onMessage(message) {
  if (!message.guild || !message.member || message.author.bot || message.webhookId) return;
  const cfg = getCfg(message.guild.id);
  if (!cfg.enabled) return;
  const { points } = scoreOf(message);
  if (!points) return;
  const perms = message.member.permissions;
  if (perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageMessages) || perms.has(PermissionFlagsBits.ManageGuild)) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const list = (recent.get(key) || []).filter((e) => now - e.t < WINDOW_MS);
  list.push({ t: now, points, msg: message });
  recent.set(key, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.length || now - v[v.length - 1].t > WINDOW_MS) recent.delete(k);

  const total = list.reduce((a, e) => a + e.points, 0);
  if (total < cfg.limit) return;
  recent.delete(key);
  await punish(message, list, total, cfg);
}

async function punish(message, list, total, cfg) {
  const { guild, member, author, client } = message;
  const isEn = getGuildLanguage(guild.id) === 'en';
  // Penceredeki tüm etiketli mesajları sil (Discord: tek tek, bulk gerekmez)
  for (const e of list) { try { await e.msg.delete(); } catch (_) {} }

  let timedOut = false;
  if (member.moderatable) timedOut = await member.timeout(cfg.timeoutMin * 60000, 'Mention spam').then(() => true).catch(() => false);
  const reason = tx(guild.id, `Etiket spam'i (${total} puan)`, `Mention spam (${total} points)`);
  recordCase(guild.id, { type: 'timeout', userId: author.id, modId: client.user.id, reason, durationMs: timedOut ? cfg.timeoutMin * 60000 : 0 });
  try { await sendChannelLog(guild, 'timeout', client.user, author, reason, `${cfg.timeoutMin}${tx(guild.id, 'dk', 'm')}`); } catch (_) {}

  try {
    const png = await mentionCard({ userName: author.username, avatarUrl: author.displayAvatarURL({ extension: 'png', size: 128 }), count: total, minutes: timedOut ? cfg.timeoutMin : 0, isEn });
    const sent = await message.channel.send(cardPayload(png, { name: 'mention-spam.png', accent: 0xed4245 }));
    setTimeout(() => sent.delete().catch(() => {}), 20000).unref?.();
  } catch (_) {}
}

module.exports = { onMessage, getCfg, saveCfg, scoreOf };
