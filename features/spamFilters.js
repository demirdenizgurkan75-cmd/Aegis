// Aegis open-source build: only the first 43 of 114 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * SPAM FİLTRELERİ
 * Mesaj başına beş filtre: büyük harf seli, emoji seli, metin duvarı, aynı mesajı tekrarlama, art arda dosya yağdırma.
 * Takılan mesaj silinir. İlk ihlalde üyeye kısa bir uyarı gelir; sonraki her ihlalde susturma süresi ikiye katlanır
 * (taban 1 dk ise 1, 2, 4, 8… en çok 1 gün). 10 dakika temiz kalan üyenin sayacı sıfırlanır.
 * Yetkililer (Mesajları Yönet, Sunucuyu Yönet, Yönetici), botlar ve webhook'lar muaf.
 * Veri: guild.spamFilters = { enabled, caps, emoji, wall, repeat, attach, baseMin } (varsayılan kapalı; /automod panelinden açılır)
 */
const { PermissionFlagsBits } = require('discord.js');
const { readDB, updateGuild } = require('../utils/database');
const { tx } = require('./util');

const DEFAULTS = { enabled: false, caps: true, emoji: true, wall: true, repeat: true, attach: true, baseMin: 1 };
const FILTERS = ['caps', 'emoji', 'wall', 'repeat', 'attach'];
const LIMITS = { capsMinLetters: 12, capsRatio: 0.7, emoji: 10, wallLines: 20, wallChars: 1800, repeatCount: 3, repeatWindowMs: 30000, attachCount: 5, attachWindowMs: 10000 };
const STRIKE_RESET_MS = 10 * 60 * 1000;
const EMOJI_RE = /<a?:\w{2,32}:\d{17,20}>|\p{Extended_Pictographic}/gu;

const LABELS = {
  caps: { tr: 'Büyük harf seli', en: 'Excessive caps' },
  emoji: { tr: 'Emoji seli', en: 'Emoji flood' },
  wall: { tr: 'Metin duvarı', en: 'Wall of text' },
  repeat: { tr: 'Aynı mesajı tekrarlama', en: 'Repeated messages' },
  attach: { tr: 'Art arda dosya', en: 'Attachment spam' },
};

function getCfg(gid) {
  const c = readDB()[gid]?.spamFilters;
  return { ...DEFAULTS, ...(c && typeof c === 'object' ? c : {}) };
}
function saveCfg(gid, cfg) { return updateGuild(gid, { spamFilters: cfg }); }

const history = new Map(); // gid:uid → { texts: [{t, s}], files: [{t, n}] }
const strikes = new Map(); // gid:uid → { n, last }

function capsHit(content) {
  const letters = [...content.replace(/<a?:\w+:\d+>|<[@#&!]+\d+>|https?:\/\/\S+/g, '')].filter((ch) => ch.toLowerCase() !== ch.toUpperCase());
  if (letters.length < LIMITS.capsMinLetters) return false;
  const upper = letters.filter((ch) => ch === ch.toUpperCase()).length;
  return upper / letters.length >= LIMITS.capsRatio;
}
const emojiCount = (content) => (content.match(EMOJI_RE) || []).length;
const normText = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "onMessage": async () => false,
  "detect": () => undefined,
  "timeoutFor": () => undefined,
  "capsHit": () => undefined,
  "emojiCount": () => undefined,
  "getCfg": () => ({ enabled: false, baseMin: 5 }),
  "saveCfg": () => undefined,
  "FILTERS": [],
  "LABELS": {},
  "LIMITS": {},
  "_state": {},
});
