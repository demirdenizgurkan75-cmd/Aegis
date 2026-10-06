/**
 * Aegis emoji seti (49 adet, utils/canvas/emojiArt.js): maskot ruh hâlleri, durum işaretleri ve özellik simgeleri.
 * Botun uygulama emojisi olarak yüklenir (aegis_<ad>); sunucuda emoji yetkisi gerekmez, her sunucuda çalışır.
 * Zaten yüklü olanlar atlanır. Yüklenemezse em() yedek metni (düz Unicode) döndürür.
 */
const { allEmojis } = require('../utils/canvas/emojiArt');

const map = new Map();
const MOODS = ['idle', 'happy', 'sad', 'alert', 'confused', 'type', 'sleep', 'party', 'guard', 'love', 'cool', 'think'];

/** Düz Unicode işaretlerin yerine geçen emoji adları (features/util.js tx() içinde uygulanır). */
const UNICODE_TO_NAME = { '✅': 'ok', '❌': 'no', '⚠️': 'warn', '⚠': 'warn', '⏳': 'wait', '⚖️': 'scales', '⚖': 'scales', '🔒': 'lock', '🔓': 'unlock' };

async function init(client) {
  try {
    const existing = await client.application.emojis.fetch();
    let created = 0;
    for (const { name, png } of allEmojis()) {
      const full = `aegis_${name}`;
      let found = existing.find((e) => e.name === full);
      if (!found) {
        try { found = await client.application.emojis.create({ attachment: png, name: full }); created += 1; }
        catch (e) { console.error(`[mascot-emoji] ${full}:`, e.message); continue; }
      }
      map.set(name, found.toString());
    }
    console.log(`🟦 Aegis emojileri hazır (${map.size}/49${created ? `, ${created} yeni yüklendi` : ''})`);
  } catch (e) {
    console.error('[mascot-emoji]', e.message);
  }
}

/** Emoji ya da yedek metin. */
const em = (name, fallback = '') => map.get(name) || fallback;

/** Metindeki ✅ ❌ ⚠️ ⏳ ⚖️ 🔒 🔓 işaretlerini Aegis emojileriyle değiştirir (yüklüyse). Buton etiketi ve embed başlığında kullanma. */
function decorate(text) {
  if (typeof text !== 'string' || !map.size) return text;
  let out = text;
  for (const [ch, name] of Object.entries(UNICODE_TO_NAME)) {
    const e = map.get(name);
    if (e && out.includes(ch)) out = out.split(ch).join(e);
  }
  return out;
}

module.exports = { init, em, decorate, MOODS };
