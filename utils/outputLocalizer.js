/**
 * İngilizce sunucularda botun gönderdiği bilinen Türkçe sabit metinleri İngilizceye çevirir (sözlük: utils/enDictionary.js).
 * features/emojiLayer.js içindeki REST kancasından çağrılır, yani komut dosyalarına dokunmadan çalışır.
 * Yalnızca metin alanlarına dokunur: content, title, description, label, placeholder, text, value, name (embed alanı).
 * Sözlükte olmayan metin olduğu gibi gider (kullanıcı içeriği ve şarkı adları etkilenmez).
 */
const { getGuildLanguage } = require('./i18n');
const { translate } = require('./enDictionary');

const TEXT_KEYS = new Set(['content', 'title', 'description', 'label', 'placeholder', 'text', 'value', 'name']);
const SKIP_KEYS = new Set(['files', 'attachments', 'custom_id', 'url', 'icon_url', 'proxy_url', 'filename', 'emoji', 'id']);

function walk(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) { for (const x of node) walk(x, depth + 1); return; }
  if (Buffer.isBuffer(node)) return;
  for (const k of Object.keys(node)) {
    if (SKIP_KEYS.has(k)) continue;
    const v = node[k];
    if (typeof v === 'string') { if (TEXT_KEYS.has(k)) { const t = translate(v); if (t !== v) node[k] = t; } }
    else walk(v, depth + 1);
  }
}

/** body: REST isteğinin gövdesi (yerinde değiştirilir). */
function localizeBody(body, guildId) {
  if (!body || !guildId) return;
  let en = false;
  try { en = getGuildLanguage(guildId) === 'en'; } catch (_) { return; }
  if (en) walk(body);
}

module.exports = { localizeBody, walk };
