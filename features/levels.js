// Aegis open-source build: only the first 89 of 426 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * SEVİYE SİSTEMİ (Levels)
 * Üyeler mesaj yazarak (isteğe bağlı olarak seste vakit geçirerek) XP kazanır, seviye atlar, seviye rollerini alır.
 * XP: mesaj başına 15-25 (üye başına dakikada en çok bir kez), ses: en az 2 kişinin olduğu kanalda dakikada 5 (sağır/AFK hariç).
 * Eğri: L. seviyeden L+1'e geçmek için 5L² + 50L + 100 XP. Herkes 0. seviyeden başlar.
 * Ayarlar: guild.levels = { enabled, announce: 'here'|'channel'|'dm'|'off', channelId, message, rewards:[{level, roleId}],
 *                           stack, noXpChannels:[], voice } (varsayılan kapalı; yönetici /levels ile açar)
 * XP verisi database.json'a değil data/levels/<guildId>.json dosyasına yazılır: bellekte toplanır, 30 sn'de bir diske iner.
 * Komutlar: /rank (herkes, kart + sıralama) ve /levels (Sunucuyu Yönet: panel; diğer üyelere sıralamayı gösterir).
 * customId'ler: "lvlui:" yönetim paneli, "lvl:" sıralama sayfaları.
 */
const fs = require('fs');
const path = require('path');
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, MessageFlags,
  PermissionFlagsBits, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
} = require('discord.js');
const { readDB, updateGuild } = require('../utils/database');
const { tx, banner, clip } = require('./util');

const DIR = () => path.join(__dirname, '..', 'data', 'levels');
const MSG_COOLDOWN_MS = 60 * 1000;
const VOICE_XP = 5;
const MAX_REWARDS = 20;
const PAGE = 10;
// Seviye ödülü olarak verilemeyecek yetkiler: bir üyeyi sohbetle yönetici yapmak sunucuyu tehlikeye atar
const DANGEROUS = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.MentionEveryone,
];

const DEFAULTS = { enabled: false, announce: 'here', channelId: null, message: null, rewards: [], stack: true, noXpChannels: [], voice: true };

const need = (L) => 5 * L * L + 50 * L + 100;
/** Toplam XP → { level, cur (seviye içi XP), need (sonraki seviyeye gereken) } */
function levelInfo(xp) {
  let level = 0;
  let rest = Math.max(0, Math.floor(xp || 0));
  while (rest >= need(level)) { rest -= need(level); level += 1; }
  return { level, cur: rest, need: need(level) };
}

// ─── Depolama ────────────────────────────────────────────────────────────────
const cache = new Map(); // gid → { users: { uid: { xp, msgs, voice } }, dirty }
const file = (gid) => path.join(DIR(), `${gid}.json`);

function load(gid) {
  let e = cache.get(gid);
  if (e) return e;
  let users = {};
  try { users = JSON.parse(fs.readFileSync(file(gid), 'utf8')).users || {}; } catch (_) { /* dosya yok: boş başla */ }
  e = { users, dirty: false };
  cache.set(gid, e);
  return e;
}

function userRec(gid, uid) {
  const e = load(gid);
  if (!e.users[uid]) e.users[uid] = { xp: 0, msgs: 0, voice: 0 };
  return e.users[uid];
}

function flush() {
  for (const [gid, e] of cache) {
    if (!e.dirty) continue;
    try {
      fs.mkdirSync(DIR(), { recursive: true });
      const tmp = file(gid) + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ users: e.users }));
      fs.renameSync(tmp, file(gid));
      e.dirty = false;
    } catch (err) {
      console.error('[levels] XP dosyası yazılamadı:', err.message);
    }
  }
}

function getCfg(gid) {
  const c = readDB()[gid]?.levels;
  const cfg = { ...DEFAULTS, ...(c && typeof c === 'object' ? c : {}) };
  cfg.rewards = Array.isArray(cfg.rewards) ? cfg.rewards : [];
  cfg.noXpChannels = Array.isArray(cfg.noXpChannels) ? cfg.noXpChannels : [];
  return cfg;
}
function saveCfg(gid, cfg) { return updateGuild(gid, { levels: cfg }); }

// ─── XP kazanma ──────────────────────────────────────────────────────────────
const cooldown = new Map(); // gid:uid → ts

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "onMessage": () => undefined,
  "voiceTick": () => undefined,
  "flush": () => undefined,
  "rank": (i) => require('../utils/ossStub').unavailable(i),
  "open": (i) => require('../utils/ossStub').unavailable(i),
  "handle": (i) => require('../utils/ossStub').unavailable(i),
  "panel": (i) => require('../utils/ossStub').unavailable(i),
  "leaderboard": () => [],
  "levelInfo": () => null,
  "need": () => undefined,
  "getCfg": () => ({ enabled: false }),
  "saveCfg": () => undefined,
  "load": () => undefined,
  "addXp": () => undefined,
  "applyRewards": () => undefined,
});
