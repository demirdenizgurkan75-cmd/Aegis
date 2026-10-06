// Aegis open-source build: only the first 66 of 173 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * CEZA KEFARETİ (kural sınavı)
 * Bir üye timeout yediğinde (kim uygularsa uygulasın) özelden kısa bir kural sınavı önerilir.
 * 3 sorudan en az 2'sini bilirse kalan timeout süresi yarıya (ayarlanabilir) iner. Tek hak.
 * Sorular sunucunun kural metninden Gemini ile üretilir; kural metni yoksa teklif yapılmaz.
 *
 * Veri: guild.parole = { enabled, pct, maxHours }
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const { getGuild, updateGuild, getRulesBot } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { getGuildLanguage, LOCALES, getGuildLocale } = require('../utils/i18n');
const { tx, geminiJson, shuffle, clip } = require('./util');
const { em } = require('./mascotEmoji');

const used = new Set();            // gid:uid:until → hak kullanıldı
const sessions = new Map();        // sid → { gid, uid, until, qs, i, correct, exp }

function getCfg(guildId) {
  const p = getGuild(guildId).parole || {};
  return { enabled: !!p.enabled, pct: p.pct || 50, maxHours: p.maxHours || 24 };
}
function saveCfg(guildId, cfg) { return updateGuild(guildId, { parole: cfg }); }

function rulesText(guildId) {
  try {
    const d = getRulesBot(guildId)?.dmContent?.description || '';
    // Hiç özelleştirilmemiş varsayılan metin "kural var" sayılmaz (örnek 5 madde gate mesajına yazılmasın)
    if (String(d).startsWith('Aşağıdaki kuralları okuduysanız')) return '';
    return String(d).replace(/\{server\}/g, '').trim();
  } catch (_) { return ''; }
}

function fmtDuration(ms, guildId) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m >= 60) return `${Math.floor(m / 60)}${tx(guildId, ' sa ', 'h ')}${m % 60 ? m % 60 + tx(guildId, ' dk', 'm') : ''}`.trim();
  return `${m}${tx(guildId, ' dk', ' min')}`;
}

/** guildMemberUpdate: yeni (ya da uzatılmış olmayan) bir timeout mu? → { until, remaining } | null */
function detectNewTimeout(oldM, newM) {
  if (!newM || newM.user?.bot) return null;
  const until = newM.communicationDisabledUntilTimestamp;
  const prev = oldM?.communicationDisabledUntilTimestamp || 0;
  const now = Date.now();
  if (!until || until < now + 60000) return null;
  if (prev && prev > now && until <= prev + 60000) return null; // uzatma değil
  return { until, remaining: until - now };
}

/** Özele eklenecek sınav teklifi: { text, button } | null. Gönderimi features/timeoutDm.js yapar. */
function offer(member, until, remaining) {
  const gid = member.guild.id;
  const cfg = getCfg(gid);
  if (!cfg.enabled) return null;
  if (remaining > cfg.maxHours * 3600000) return null;
  if (rulesText(gid).length < 40) return null;
  return {
    text: tx(gid,
      `📘 **Kural sınavı:** Sunucu kuralları hakkında **3 soruluk** kısa bir sınavı geçersen (en az 2 doğru) süren **%${cfg.pct}** kısalır. Tek hakkın var.`,
      `📘 **Rules quiz:** pass a short **3-question** quiz about the server rules (at least 2 correct) and your timeout drops by **${cfg.pct}%**. You get one attempt.`),
    button: new ButtonBuilder().setCustomId(`parole:s:${gid}:${member.id}:${until}`)
      .setLabel(tx(gid, 'Sınava başla', 'Start the quiz')).setStyle(ButtonStyle.Primary),
  };
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "getCfg": () => ({ enabled: false }),
  "saveCfg": () => undefined,
  "detectNewTimeout": () => null,
  "offer": () => null,
  "handleButton": (i) => require('../utils/ossStub').unavailable(i),
  "rulesText": () => '',
  "makeQuiz": () => null,
  "fmtDuration": (ms) => String(Math.round((ms || 0) / 60000)) + 'm',
});
