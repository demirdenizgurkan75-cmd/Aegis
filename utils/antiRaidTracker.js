/**
 * Anti-Raid / Anti-Nuke Hız Takipçisi
 * Kalıcı veritabanına değil, hafızada (in-memory) tutulur çünkü sadece
 * "son birkaç saniyede kim ne yaptı" bilgisiyle ilgileniyoruz.
 *
 * Yapı: trackers[guildId][actorId][eventType] = [timestamp, timestamp, ...]
 */
const trackers = {};

/**
 * Bir eylemi kaydeder ve verilen zaman aralığında eşik değeri aşılıp aşılmadığını döner.
 * @returns {boolean} eşik aşıldıysa true
 */
function recordAndCheck(guildId, actorId, eventType, threshold, windowMs) {
  if (!trackers[guildId]) trackers[guildId] = {};
  if (!trackers[guildId][actorId]) trackers[guildId][actorId] = {};
  if (!trackers[guildId][actorId][eventType]) trackers[guildId][actorId][eventType] = [];

  const now = Date.now();
  const list = trackers[guildId][actorId][eventType].filter(t => now - t < windowMs);
  list.push(now);
  trackers[guildId][actorId][eventType] = list;

  return list.length >= threshold;
}

/**
 * Bir aktöre karşı alınan aksiyondan sonra sayaçlarını sıfırlar
 * (aynı olay için birden fazla kez tetiklenmesin diye).
 */
function resetActor(guildId, actorId) {
  if (trackers[guildId]) delete trackers[guildId][actorId];
}

module.exports = { recordAndCheck, resetActor };
