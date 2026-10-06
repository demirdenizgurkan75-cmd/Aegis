/**
 * Yeni özellikler (Jüri, Kefaret, Çok Dilli Bilet, Buddy) için ortak yardımcılar.
 * Hiçbir özellik, sunucu yöneticisi açıkça etkinleştirmedikçe bir şey yapmaz.
 */
const https = require('https');
const { MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const { getGuildLanguage } = require('../utils/i18n');

const GEMINI_KEY = () => process.env.GEMINI_API_KEY || null;
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

/** Sunucu diline göre metin seç: Türkçe sunucuda tr, diğerlerinde en. */
function tx(guildId, tr, en) {
  return getGuildLanguage(guildId) === 'tr' ? tr : en;
}

/**
 * Gemini'den JSON bekleyen tek seferlik çağrı. Hata/zaman aşımında null döner (özellikler sessizce atlar).
 */
function geminiJson(prompt, { maxTokens = 600, temperature = 0.2, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    const key = GEMINI_KEY();
    if (!key) return resolve(null);
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          let text = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
          resolve(JSON.parse(text));
        } catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clip(text, max) {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Panelin tepesine konan marka bannerı (site /public/bot/panel-<ad>.gif; hareketli, Remotion projesinde üretilir, durağan PNG sürümü de yanında durur). */
function banner(name, alt = 'Aegis') {
  const base = (process.env.SITE_URL || 'https://betterwithaegis.com').replace(/\/$/, '');
  return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`${base}/bot/panel-${name}.gif`).setDescription(alt));
}

module.exports = { tx, geminiJson, shuffle, clip, banner };
