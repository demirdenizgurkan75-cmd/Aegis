/**
 * Emoji katmanı: botun gönderdiği HER mesajda (eski komutlar, olaylar, `a.` komutları dahil) düz Unicode
 * işaretleri Aegis emojileriyle değiştirir ve :aegis_ad: kısa kodlarını açar. client.rest.request'e takılır, yani
 * komut dosyalarına dokunmadan çalışır.
 *
 * Yalnızca emoji gösterebilen alanlara dokunur: mesaj içeriği, embed açıklaması ve alan değerleri, V2 metin blokları.
 * Başlık, altbilgi, buton etiketi, menü ve modal metinlerine DOKUNMAZ (orada özel emoji görünmez).
 * Kod bloklarının içi korunur. Karakter sınırı aşılacaksa o alanda değişiklik geri alınır.
 */
const { em } = require('./mascotEmoji');

// Uzun diziler (VS16'lı) önce gelsin diye uzunluğa göre sıralanır.
const MAP = {
  '✅': 'ok', '✔️': 'ok', '❌': 'no', '❎': 'no', '⚠️': 'warn', '⚠': 'warn', 'ℹ️': 'info', 'ℹ': 'info',
  '⏳': 'wait', '⌛': 'wait', '⚖️': 'scales', '⚖': 'scales', '🔒': 'lock', '🔐': 'lock', '🔓': 'unlock',
  '🛡️': 'shield', '🛡': 'shield', '🎁': 'gift', '👑': 'crown', '🔨': 'hammer',
  '🚫': 'ban', '⛔': 'ban', '🌐': 'globe', '💬': 'chat', '🤖': 'bot', '❤️': 'heart', '❤': 'heart',
  '⭐': 'star', '🌟': 'star', '🔥': 'flame', '🏆': 'trophy', '🎵': 'note', '🎶': 'note', '📊': 'chart',
  '📈': 'chart', '🔑': 'key', '📧': 'mail', '✉️': 'mail', '📩': 'mail', '👁️': 'eye', '👁': 'eye',
  '🗑️': 'trash', '🗑': 'trash', '⚙️': 'gear', '⚙': 'gear', '🔍': 'search', '🔎': 'search', '⚡': 'bolt',
  '🎫': 'ticket', '🏅': 'medal', '🥇': 'medal', '🔔': 'bell', '📌': 'pin', '📍': 'pin', '⏰': 'clock',
  '🕐': 'clock', '⏱️': 'clock', '⏱': 'clock', '🟢': 'on', '🔴': 'off', '🎉': 'party', '🚪': 'gate',
  '🚨': 'alert', '😴': 'sleep', '💤': 'sleep', '🤔': 'think', '😎': 'cool', '😢': 'sad', '😔': 'sad', '😕': 'confused',
  '❓': 'confused', '😀': 'happy', '😄': 'happy', '😊': 'happy', '🙂': 'happy', '🥳': 'party', '🎊': 'party', '⌨️': 'type',
  '🥰': 'love', '😍': 'love', '👀': 'eye',
};
const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);
const SPLIT = /(```[\s\S]*?```|`[^`\n]*`)/;
const SHORT = /(?<!<a?):aegis_([a-z]+):(?!\d)/g;

function fx(text) {
  if (typeof text !== 'string' || !text) return text;
  return text.split(SPLIT).map((seg, i) => {
    if (i % 2 === 1) return seg; // kod
    let out = seg.replace(SHORT, (_, name) => em(name, ''));
    for (const k of KEYS) if (out.includes(k)) { const e = em(MAP[k], ''); if (e) out = out.split(k).join(e); }
    return out;
  }).join('');
}

/** Alanı değiştirir; sınır aşılırsa eskisine döner. */
function apply(obj, key, limit) {
  const before = obj[key];
  const after = fx(before);
  obj[key] = typeof after === 'string' && after.length <= limit ? after : before;
}

function textDisplays(list, acc) {
  for (const c of list || []) {
    if (!c || typeof c !== 'object') continue;
    if (c.type === 10 && typeof c.content === 'string') acc.push(c);
    if (Array.isArray(c.components)) textDisplays(c.components, acc);
  }
  return acc;
}

function fixMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (typeof m.content === 'string') apply(m, 'content', 2000);
  if (Array.isArray(m.embeds)) {
    for (const e of m.embeds) {
      if (!e || typeof e !== 'object') continue;
      const snap = JSON.stringify([e.description, (e.fields || []).map((f) => f.value)]);
      if (typeof e.description === 'string') apply(e, 'description', 4096);
      for (const f of e.fields || []) if (typeof f.value === 'string') apply(f, 'value', 1024);
      const total = (e.title || '').length + (e.description || '').length + (e.footer?.text || '').length + (e.author?.name || '').length
        + (e.fields || []).reduce((n, f) => n + (f.name || '').length + (f.value || '').length, 0);
      if (total > 6000) { const [d, vals] = JSON.parse(snap); e.description = d; (e.fields || []).forEach((f, i) => { f.value = vals[i]; }); }
    }
  }
  if (Array.isArray(m.components)) {
    const nodes = textDisplays(m.components, []);
    if (nodes.length) {
      const orig = nodes.map((n) => n.content);
      nodes.forEach((n) => { n.content = fx(n.content); });
      if (nodes.reduce((s, n) => s + n.content.length, 0) > 4000) nodes.forEach((n, i) => { n.content = orig[i]; });
    }
  }
}

function fixBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  fixMessage(body);
  if (body.data && typeof body.data === 'object' && typeof body.type === 'number') fixMessage(body.data); // etkileşim yanıtı
}

function install(client) {
  if (!client?.rest || client.rest.__aegisEmoji) return;
  client.rest.__aegisEmoji = true;
  const orig = client.rest.request.bind(client.rest);
  client.rest.request = (options) => {
    try {
      if (options && options.body) {
        // 1) Sunucu İngilizceyse bilinen Türkçe metinler İngilizceye çevrilir (utils/outputLocalizer.js)
        const gid = require('../utils/langContext').currentGuildId() || guildFromRoute(client, options.fullRoute || options.route || options.path);
        if (gid) require('../utils/outputLocalizer').localizeBody(options.body, gid);
        // 2) Emoji katmanı
        fixBody(options.body);
      }
    } catch (e) { console.error('[emoji-layer]', e.message); }
    return orig(options);
  };
}

/** /channels/<id>/... rotasından sunucu bulunur (bağlam yoksa: zamanlayıcılar, olay dışı çağrılar). */
function guildFromRoute(client, route) {
  const m = /\/channels\/(\d+)/.exec(String(route || ''));
  return m ? client.channels?.cache?.get(m[1])?.guildId || null : null;
}

module.exports = { install, fx, fixBody, MAP };
