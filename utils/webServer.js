// ─── WEB API GİRİŞ NOKTASI ─────────────────────────────────────────────────
// Monolit yapılarak utils/routes/* modüllerine bölündü:
//   auth.js     — Discord OAuth login/callback/logout, /api/me
//   dashboard.js — uyarılar, paket seçimi, sunucu listesi, ayarlar, kanal/rol/log
//   threats.js  — global tehdit ağı (owner-only)
//   uploads.js  — dosya yükleme, /uploads/*, /panel
//   public.js   — /api/stats, /api/packages, /api/track, /api/payment/status
//   deploy.js   — /github-deploy
// Ortak yardımcılar (imza, session, gövde okuma, CORS, bot özelleştirme):
//   utils/routes/helpers.js
// Bu dosya: CORS/OPTIONS, URL ayrıştırma ve route dağıtıcısı.
const http = require('http');
const helpers = require('./routes/helpers');

const routes = [
  require('./routes/uploads'),
  require('./routes/auth'),
  // Health, VoiceMod, Exploit, Dependency must come BEFORE dashboard to avoid interception
  require('./routes/health'),
  require('./routes/voiceMod'),
  require('./routes/exploit'),
  require('./routes/dependency'),
  require('./routes/features'),
  require('./routes/dashboard'),
  require('./routes/threats'),
  require('./routes/public'),
  require('./routes/deploy'),
];

function startWebServer(client) {
  const PORT = process.env.PORT || process.env.STATS_PORT || 3001;

  // Rate limiting store (in-memory, resets on restart)
  const rateLimitStore = new Map();
  const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  const RATE_LIMIT_MAX = 100; // 100 requests per minute per IP

  function checkRateLimit(ip) {
    const now = Date.now();
    const record = rateLimitStore.get(ip);
    if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
      rateLimitStore.set(ip, { count: 1, windowStart: now });
      return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
    }
    if (record.count >= RATE_LIMIT_MAX) {
      return { allowed: false, remaining: 0, resetAt: record.windowStart + RATE_LIMIT_WINDOW };
    }
    record.count++;
    return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
  }

  // Clean up old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of rateLimitStore.entries()) {
      if (now - record.windowStart > RATE_LIMIT_WINDOW) {
        rateLimitStore.delete(ip);
      }
    }
  }, 5 * 60 * 1000);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Rate limiting
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const rateLimit = checkRateLimit(ip);
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', Math.ceil((rateLimit.resetAt - Date.now()) / 1000));
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }));
      return;
    }

    // CORS: ana site
    const origin = req.headers.origin;
    const allowedOrigins = [
      helpers.SITE_URL,
      'https://betterwithaegis.com',
      'https://www.betterwithaegis.com',
      'https://betterwithaegis.com',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8080',
    ];
    const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const ctx = { req, res, url, client };
    for (const route of routes) {
      if (await route.handle(ctx)) return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, () => {
    console.log(`📊 Web API çalışıyor: http://localhost:${PORT}  (stats, giriş, paketler, dashboard)`);
    if (!process.env.CLIENT_SECRET) {
      console.warn('⚠️  CLIENT_SECRET .env dosyasında tanımlı değil — Discord ile giriş çalışmayacak!');
    }
    if (!process.env.GEMINI_API_KEY) {
      console.warn('⚠️  GEMINI_API_KEY .env dosyasında tanımlı değil — AI ton analizi heuristic moda çalışacak!');
    }
    if (!helpers.ORDERS_LOG_CHANNEL_ID) {
      console.warn('⚠️  ORDERS_LOG_CHANNEL_ID tanımlı değil — siparişler Discord\'a düşmeyecek, sadece kaydedilecek.');
    }
  });

  return server;
}

module.exports = { startWebServer };
