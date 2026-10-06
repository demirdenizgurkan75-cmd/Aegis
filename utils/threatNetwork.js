// Aegis open-source build: only the first 90 of 310 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * AEGIS ORTAK TEHDİT AĞI — "Kolektif Bağışıklık" Sistemi
 *
 * Bir raid/nuke hesabı herhangi bir Aegis sunucusunda yakalandığında,
 * bu kullanıcı tüm Aegis sunucuları için ortak tehdit veritabanına eklenir.
 * Yeni bir üye katıldığında, tüm sunucularda tehdit ağı kontrol edilir.
 *
 * Veri yapısı (database.json içinde _globalThreats altında):
 * {
 *   userId: {
 *     reason: string,
 *     severity: 'düşük'|'orta'|'yüksek',
 *     reportedBy: string (guild ID),
 *     reportedByName: string (guild name),
 *     reportedAt: number (timestamp),
 *     flagCount: number (kaç sunucu rapor etti),
 *     guilds: string[] (rapor eden sunucular)
 *   }
 * }
 */
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');


const { readDB, writeDB } = require('./database');

// Otomatik ban için gereken bağımsız sunucu raporu sayısı.
// Tek sunucunun raporu yanlış pozitif olabilir (örn. sunucu sahibi haksız yere
// attı) — o durumda sadece diğer sunucular bilgilendirilir, ban otomatik atılmaz.
const CONFIRM_THRESHOLD = Number(process.env.THREAT_BAN_CONFIRMATIONS || 2);

/**
 * Bir kullanıcıyı global tehdit ağına ekler veya mevcut kaydını günceller.
 *
 * @param {string} userId - Discord kullanıcı ID'si
 * @param {string} guildId - Tespit eden sunucu ID'si
 * @param {string} guildName - Tespit eden sunucu adı
 * @param {string} reason - Tehdit sebebi
 * @param {'düşük'|'orta'|'yüksek'} severity - Tehdit şiddeti
 * @returns {object} Kaydedilen tehdit kaydı
 */
function reportThreat(userId, guildId, guildName, reason, severity = 'orta') {
  const db = readDB();
  if (!db._globalThreats) db._globalThreats = {};

  const existing = db._globalThreats[userId];

  if (existing) {
    // Mevcut kayıt güncelle
    existing.flagCount = (existing.flagCount || 1) + 1;
    existing.guilds = existing.guilds || [existing.reportedBy];
    if (!existing.guilds.includes(guildId)) {
      existing.guilds.push(guildId);
    }
    // Daha yüksek şiddet varsa güncelle
    const severityOrder = { düşük: 0, orta: 1, yüksek: 2 };
    if (severityOrder[severity] > severityOrder[existing.severity]) {
      existing.severity = severity;
    }
    existing.lastUpdatedAt = Date.now();
    db._globalThreats[userId] = existing;
  } else {
    // Yeni kayıt
    db._globalThreats[userId] = {
      userId,
      reason,
      severity,
      reportedBy: guildId,
      reportedByName: guildName,
      reportedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      flagCount: 1,
      guilds: [guildId],
    };
  }

  writeDB(db);
  return db._globalThreats[userId];
}

/**
 * Bir kullanıcının tehdit ağındaki kaydını döndürür.
 *
 * @param {string} userId
 * @returns {object|null} Tehdit kaydı veya null
 */
function getGlobalThreat(userId) {
  const db = readDB();
  if (!db._globalThreats) return null;
  return db._globalThreats[userId] || null;
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "reportThreat": () => null,
  "getGlobalThreat": () => null,
  "removeThreat": () => false,
  "listAllThreats": () => [],
  "notifyAllServers": async () => 0,
  "notifyOwner": () => undefined,
  "checkAndHandleThreat": async () => null,
});
