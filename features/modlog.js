/**
 * MODERASYON DOSYASI
 * /moderation işlemlerine dava numarası verir, her üyenin geçmişini tutar ve istenirse N uyarıda otomatik timeout uygular.
 * Veri: guild.modCases = [{ id, type, userId, modId, reason, at, durationMs }] (en çok 500), guild.modCaseCounter,
 *       guild.warnPolicy = { enabled, threshold, timeoutMin }.
 */
const { getGuild, updateGuild, getWarnings } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { tx } = require('./util');

const MAX_CASES = 500;

function recordCase(guildId, { type, userId, modId, reason, durationMs = 0, warnId = null }) {
  const g = getGuild(guildId);
  const id = (g.modCaseCounter || 0) + 1;
  const entry = { id, type, userId, modId, reason: String(reason || '').slice(0, 300), at: Date.now(), durationMs, ...(warnId ? { warnId } : {}) };
  const cases = [...(g.modCases || []), entry].slice(-MAX_CASES);
  updateGuild(guildId, { modCases: cases, modCaseCounter: id });
  return entry;
}

function getCases(guildId, userId, limit = 10) {
  return (getGuild(guildId).modCases || []).filter((c) => c.userId === userId).slice(-limit).reverse();
}

function getCase(guildId, id) {
  return (getGuild(guildId).modCases || []).find((c) => c.id === Number(id)) || null;
}

/** Davanın sebebini düzenler; "düzenlendi" işareti ve düzenleyen kaydedilir. */
function editCaseReason(guildId, id, reason, editorId) {
  const cases = getGuild(guildId).modCases || [];
  const c = cases.find((x) => x.id === Number(id));
  if (!c) return null;
  c.reason = String(reason || '').slice(0, 300);
  c.edited = { by: editorId, at: Date.now() };
  updateGuild(guildId, { modCases: cases });
  if (c.warnId) { // uyarı kaydındaki sebep de aynı kalsın
    try {
      const { readDB, writeDB } = require('../utils/database');
      const db = readDB();
      const w = db[guildId]?.warnings?.[c.userId]?.find((x) => x.id === c.warnId);
      if (w) { w.reason = c.reason; writeDB(db); }
    } catch (_) {}
  }
  return c;
}

/** Davayı siler. Bir uyarı davasıysa ilgili uyarı kaydı da kaldırılır. */
function deleteCase(guildId, id) {
  const cases = getGuild(guildId).modCases || [];
  const c = cases.find((x) => x.id === Number(id));
  if (!c) return null;
  if (c.warnId) { try { require('../utils/database').removeWarning(guildId, c.userId, c.warnId); } catch (_) {} }
  updateGuild(guildId, { modCases: cases.filter((x) => x !== c) });
  return c;
}

function getPolicy(guildId) {
  const p = getGuild(guildId).warnPolicy || {};
  return { enabled: !!p.enabled, threshold: p.threshold || 3, timeoutMin: p.timeoutMin || 60 };
}
function savePolicy(guildId, p) { return updateGuild(guildId, { warnPolicy: p }); }

/** Uyarı sayısı eşiğe ulaştıysa üyeyi otomatik susturur. Dönüş: { minutes, caseId } | null */
async function applyWarnPolicy(guild, member, client, total) {
  const p = getPolicy(guild.id);
  if (!p.enabled || !member || total < p.threshold || total % p.threshold !== 0) return null;
  if (!member.moderatable) return null;
  const ms = p.timeoutMin * 60000;
  const reason = tx(guild.id, `Otomatik: ${total} uyarı`, `Automatic: ${total} warnings`);
  const ok = await member.timeout(ms, reason).then(() => true).catch(() => false);
  if (!ok) return null;
  const c = recordCase(guild.id, { type: 'timeout', userId: member.id, modId: client.user.id, reason, durationMs: ms });
  try { await sendChannelLog(guild, 'timeout', client.user, member.user, reason, `${p.timeoutMin}${tx(guild.id, 'dk', 'm')}`); } catch (_) {}
  return { minutes: p.timeoutMin, caseId: c.id };
}

const LABEL = {
  warn: ['Uyarı', 'Warning'], timeout: ['Timeout', 'Timeout'], kick: ['Kick', 'Kick'], ban: ['Ban', 'Ban'], purge: ['Temizlik', 'Purge'],
};
const label = (gid, type) => tx(gid, (LABEL[type] || [type, type])[0], (LABEL[type] || [type, type])[1]);

/** Üyenin geçmişi: metin satırları. */
function historyLines(guildId, userId, limit = 10) {
  const cases = getCases(guildId, userId, limit);
  if (!cases.length) return tx(guildId, 'Kayıtlı ceza yok.', 'No recorded penalties.');
  return cases.map((c) => `**#${c.id}** ${label(guildId, c.type)}${c.edited ? ' ✎' : ''} · <t:${Math.floor(c.at / 1000)}:R> · <@${c.modId}>${c.reason ? `\n> ${c.reason}` : ''}`).join('\n');
}

module.exports = { recordCase, getCase, editCaseReason, deleteCase, getCases, getPolicy, savePolicy, applyWarnPolicy, historyLines, label, getWarnings };
