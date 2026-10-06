/**
 * Ortak süre yardımcıları — anket, çekiliş ve diğer zamanlayıcı komutlar için.
 * Birimler: sn | dk | saat | gun | hafta  (çıplak sayı = dakika)
 */

/**
 * @param {string} input - "10dk", "2saat", "1gun", "30"
 * @returns {number|null} milisaniye cinsinden süre veya null (geçersizse)
 */
function parseDuration(input) {
  const str = String(input).trim().toLowerCase();
  const match = str.match(/^(\d+)\s*(sn|saniye|dk|dakika|saat|gun|gün|hafta|s|m|h|d|w)?$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  if (value <= 0) return null;
  const unit = match[2];
  if (!unit) return value * 60 * 1000; // çıplak sayı = dakika
  if (unit === 'sn' || unit === 'saniye' || unit === 's') return value * 1000;
  if (unit === 'dk' || unit === 'dakika' || unit === 'm') return value * 60 * 1000;
  if (unit === 'saat' || unit === 'h') return value * 60 * 60 * 1000;
  if (unit === 'gun' || unit === 'gün' || unit === 'd') return value * 24 * 60 * 60 * 1000;
  if (unit === 'hafta' || unit === 'w') return value * 7 * 24 * 60 * 60 * 1000;
  return null;
}

/**
 * @param {number} ms - milisaniye
 * @returns {string} insan-okur süre metni, ör. "2 saat 5 dk"
 */
function formatSure(ms) {
  const gun = Math.floor(ms / 86400000);
  const saat = Math.floor((ms % 86400000) / 3600000);
  const dk = Math.floor((ms % 3600000) / 60000);
  const sn = Math.floor((ms % 60000) / 1000);
  if (gun > 0) return `${gun} gün ${saat} saat`;
  if (saat > 0) return `${saat} saat ${dk} dk`;
  if (dk > 0) return `${dk} dk ${sn} sn`;
  return `${sn} sn`;
}

module.exports = { parseDuration, formatSure };
