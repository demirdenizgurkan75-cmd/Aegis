// Aegis open-source build: only the first 77 of 234 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * KATILIM KAPISI (Join Gate)
 * Sunucuya giren her hesabı, karşılama mesajından ve otorolden ÖNCE filtrelerden geçirir:
 *   - yeni hesaplar (guardSuite karantinasıyla aynı ayar: guild.guardSuite.karantina.enabled/minDays)
 *   - profil fotoğrafı olmayan hesaplar
 *   - adında davet linki / bağlantı olan hesaplar
 *   - adında engelli bir kelime geçen hesaplar
 *   - Discord tarafından doğrulanmamış botlar (yalnızca sunucu sahibinin eklediği botlar serbest)
 * Yetkisiz bot ekleme ayrıca her zaman engellenir (events/guildMemberAdd.js).
 * Veri: guild.joinGate = { enabled, noAvatar, adName, unverifiedBots, words:[], action: 'timeout'|'kick'|'ban'|'quarantine', timeoutMin }
 * Panel: /protection ve /antiraid panellerindeki "Join Gate" düğmesi; customId'ler "joingate:" ile başlar (Yönetici gerekir).
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits, AuditLogEvent, UserFlagsBitField,
} = require('discord.js');
const { readDB, updateGuild } = require('../utils/database');
const { getGuardConfig, updateGuardConfig, logGuardEvent } = require('../utils/guardSuite');
const { tx, clip } = require('./util');

const DEFAULTS = { enabled: false, noAvatar: false, adName: true, unverifiedBots: false, words: [], action: 'timeout', timeoutMin: 60 };
const AD_RE = /(discord(?:app)?\.com\/invite|discord\.(?:gg|io|me|li)|dsc\.gg|\.gg\/|https?:\/\/|www\.)/i;
const MAX_WORDS = 50;

const ACTIONS = {
  timeout: { tr: 'Sustur', en: 'Timeout' },
  kick: { tr: 'Sunucudan at', en: 'Kick' },
  ban: { tr: 'Banla', en: 'Ban' },
  quarantine: { tr: 'Karantina rolü', en: 'Quarantine role' },
};

function getCfg(gid) {
  const c = readDB()[gid]?.joinGate;
  const cfg = { ...DEFAULTS, ...(c && typeof c === 'object' ? c : {}) };
  cfg.words = Array.isArray(cfg.words) ? cfg.words : [];
  return cfg;
}
function saveCfg(gid, cfg) { return updateGuild(gid, { joinGate: cfg }); }

/** Harf benzeri hileleri sadeleştirir: "Fr3e N1tr0" → "freenitro" */
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5|\$/g, 's').replace(/7/g, 't')
    .replace(/[^a-zЀ-ӿ؀-ۿ぀-ヿ一-鿿]/g, '');
}

/** Botu kim ekledi? (denetim kaydının son BotAdd girdisi) */
async function botAdder(member) {
  const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 3 }).catch(() => null);
  const entry = logs?.entries?.find((e) => e.target?.id === member.id && Date.now() - e.createdTimestamp < 60000);
  return entry?.executor || null;
}

/** Üyenin takıldığı filtreler (boş dizi = geçti). */
async function reasonsFor(member, cfg) {
  const gid = member.guild.id;
  const u = member.user;
  const out = [];
  if (u.bot) {
    if (!cfg.unverifiedBots) return out;
    const flags = u.flags ?? (await u.fetchFlags?.().catch(() => null));
    if (flags && !flags.has(UserFlagsBitField.Flags.VerifiedBot)) {
      const adder = await botAdder(member);
      if (!adder || adder.id !== member.guild.ownerId) out.push(tx(gid, 'Discord tarafından doğrulanmamış bot', 'Bot not verified by Discord'));
    }
    return out;
  }
  if (cfg.noAvatar && !u.avatar) out.push(tx(gid, 'Profil fotoğrafı yok', 'No profile picture'));
  const names = [u.username, u.globalName, member.nickname].filter(Boolean);
  if (cfg.adName && names.some((n) => AD_RE.test(n))) out.push(tx(gid, 'Adında davet linki veya bağlantı var', 'Invite link or URL in the name'));
  if (cfg.words.length) {
    const joined = names.map(norm).join(' ');
    const hit = cfg.words.find((w) => norm(w) && joined.includes(norm(w)));
    if (hit) out.push(tx(gid, `Adında engelli kelime var: "${hit}"`, `Blocked word in the name: "${hit}"`));
  }
  return out;
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "check": async () => false,
  "reasonsFor": () => [],
  "handle": (i) => require('../utils/ossStub').unavailable(i),
  "panel": (i) => require('../utils/ossStub').unavailable(i),
  "getCfg": () => ({ enabled: false }),
  "saveCfg": () => undefined,
  "norm": () => undefined,
  "AD_RE": /$^/,
});
