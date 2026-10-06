// Aegis open-source build: only the first 76 of 270 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * AEGIS LINK KUM HAVUZU (SANDBOX)
 * Mesajlardaki linkleri arka planda ziyaret eder, phishing/zararlı site mi kontrol eder.
 *
 * Kontrol katmanları (sırasıyla):
 * 1. Beyaz liste — güvenli domainler anında geçer
 * 2. Bilinen phishing domainleri listesi
 * 3. Şüpheli TLD ve desen kontrolü
 * 4. HTTP redirect zinciri takibi (max 5 hop)
 * 5. Google Safe Browsing API (varsa)
 * 6. URLScan.io ücretsiz lookup (varsa)
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const GOOGLE_SAFEBROWSING_KEY = process.env.GOOGLE_SAFEBROWSING_KEY || null;
const URLSCAN_API_KEY = process.env.URLSCAN_API_KEY || null;

// ─── BEYAZ LİSTE (anında güvenli say) ────────────────────────────────────────
const WHITELIST_DOMAINS = new Set([
  'discord.com', 'discord.gg', 'discordapp.com', 'discordstatus.com',
  'youtube.com', 'youtu.be', 'twitch.tv', 'twitter.com', 'x.com',
  'github.com', 'imgur.com', 'reddit.com', 'steamcommunity.com',
  'store.steampowered.com', 'spotify.com', 'open.spotify.com',
  'tenor.com', 'giphy.com', 'i.imgur.com', 'cdn.discordapp.com',
  'media.discordapp.net', 'google.com', 'wikipedia.org', 'roblox.com',
  'minecraft.net', 'twitch.tv', 'instagram.com', 'tiktok.com',
]);

// ─── BİLİNEN PHİSHİNG ALAN ADI DESENLERİ ─────────────────────────────────────
const PHISHING_DOMAIN_PATTERNS = [
  // Discord phishing klasikleri
  /disc[o0]rd\.(gift|gifts|com-gift|claiming|free)/i,
  /discord[.-]nitro[.-]/i,
  /discordnitro\.co(?!m)/i,
  /d[1i!]sc[0o]rd(?!\.com|\.gg|app)/i,
  /free.*nitro/i,
  /nitro.*free/i,
  // Steam phishing
  /st[e3]am(?!powered|community|static)/i,
  /st[e3]am.*tr[a@]d[e3]/i,
  // Genel phishing desenleri
  /paypal.*secure/i,
  /secure.*paypal/i,
  /login.*verify/i,
  /account.*suspended/i,
  /claim.*reward/i,
  /free.*gift/i,
  /verify.*account/i,
];

// ─── ŞÜPHELİ TLD'LER ─────────────────────────────────────────────────────────
const SUSPICIOUS_TLDS = new Set([
  '.tk', '.ml', '.ga', '.cf', '.gq',  // Ücretsiz TLD'ler (kötüye kullanım yüksek)
  '.xyz', '.top', '.click', '.link', '.work', '.party', '.loan', '.win', '.download',
  '.zip', '.mov',  // Yeni, kötüye kullanılan TLD'ler
]);

/**
 * URL'deki tüm linkleri çıkarır.
 * @param {string} text
 * @returns {string[]}
 */
function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return [...new Set(text.match(urlRegex) || [])];
}

/**
 * Domain'i normalize eder (www. önekini kaldırır)
 */
function normalizeDomain(hostname) {
  return hostname.replace(/^www\./, '').toLowerCase();
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "checkLinks": async () => ({ safe: true, threats: [] }),
  "extractUrls": () => [],
});
