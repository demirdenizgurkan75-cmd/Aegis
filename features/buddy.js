// Aegis open-source build: only the first 70 of 201 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * SUNUCU MASKOTU (Buddy)
 * Her sunucunun bir kanalda yaşayan kendi Aegis maskotu olur. Mesaj ve ses etkinliğiyle XP kazanır,
 * seviye atlar, aksesuar (pelerin, miğfer, taç) kazanır. Gerçek olaylara tepki verir:
 * raid/nuke engellenince "!" yapar, seviye atlayınca sevinir, 24 saat sessizlik olursa üzülür.
 *
 * Veri: guild.buddy = { enabled, channelId, messageId, name, xp, msgs, voiceMin, createdAt, lastActiveAt,
 *                       recent:[ts], happyUntil, alertUntil, lastAlertSeen, lastShoutAt, level }
 * XP yazmaları bellekte toplanır, dakikada bir diske yazılır (database.json'ı her mesajda yazmamak için).
 */
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { readDB, getGuild, updateGuild, getAlerts } = require('../utils/database');
const { createBuddyCard } = require('../utils/canvas/buddyCard');
const { tx } = require('./util');

const pending = new Map();        // gid → { xp, msgs, voiceMin, recent[] }
const cooldown = new Map();       // gid:uid → ts
const MSG_COOLDOWN_MS = 20000;

const STAGES_TR = ['Yavru', 'Dost', 'Kahraman', 'Şampiyon', 'Efsane'];
const STAGES_EN = ['Hatchling', 'Buddy', 'Hero', 'Champion', 'Legend'];

const xpForLevel = (L) => 25 * Math.pow(L - 1, 2);
const levelFromXp = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1;
const stageOf = (level) => (level < 3 ? 0 : level < 6 ? 1 : level < 10 ? 2 : level < 20 ? 3 : 4);

function getBuddy(guildId) {
  const b = getGuild(guildId).buddy;
  return b && b.enabled ? b : null;
}

function isEnabledFast(guildId) {
  const g = readDB()[guildId];
  return !!(g && g.buddy && g.buddy.enabled);
}

function bucket(gid) {
  if (!pending.has(gid)) pending.set(gid, { xp: 0, msgs: 0, voiceMin: 0, recent: [] });
  return pending.get(gid);
}

function onMessage(message) {
  if (!message.guild || message.author.bot) return;
  if (!isEnabledFast(message.guild.id)) return;
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  if (now - (cooldown.get(key) || 0) < MSG_COOLDOWN_MS) return;
  cooldown.set(key, now);
  const b = bucket(message.guild.id);
  b.xp += 1; b.msgs += 1; b.recent.push(now);
}

function moodOf(b, now = Date.now()) {
  if ((b.alertUntil || 0) > now) return 'alert';
  if ((b.happyUntil || 0) > now) return 'happy';
  if (now - (b.lastActiveAt || b.createdAt || now) > 24 * 3600000) return 'sad';
  const busy = (b.recent || []).filter(t => t > now - 600000).length;
  if (busy >= 8) return 'type';
  return 'idle';
}

function moodLabel(gid, mood) {
  return {
    alert: tx(gid, 'Alarm: saldırı engellendi', 'Alert: attack blocked'),
    happy: tx(gid, 'Mutlu: seviye atladı', 'Happy: leveled up'),
    sad: tx(gid, 'Üzgün: sunucu sessiz', 'Sad: the server is quiet'),
    type: tx(gid, 'Heyecanlı: sohbet hareketli', 'Excited: chat is busy'),
    idle: tx(gid, 'Sakin', 'Calm'),
  }[mood];
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "onMessage": () => undefined,
  "tick": () => undefined,
  "flush": () => undefined,
  "refreshCards": () => undefined,
  "setup": (i) => require('../utils/ossStub').unavailable(i),
  "payloadFor": () => undefined,
  "postOrEdit": () => undefined,
  "getBuddy": () => null,
  "levelFromXp": () => 0,
  "cardFor": () => undefined,
  "STAGES_EN": [],
});
