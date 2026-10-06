// Paylaşılan HTTP yardımcıları — route modülleri ve webServer.js tarafından kullanılır.
const crypto = require('crypto');
const path = require('path');

const SESSION_SECRET = process.env.SESSION_SECRET || 'aegis-dev-secret-DEGISTIR-BUNU';
const SITE_URL = process.env.SITE_URL || '*';
const ORDERS_LOG_CHANNEL_ID = process.env.ORDERS_LOG_CHANNEL_ID || null;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || null;

// Security: CSRF tokens for state-changing operations
const csrfTokens = new Map();
const CSRF_EXPIRY = 60 * 60 * 1000; // 1 hour

function generateCsrfToken(sessionId) {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(token, { sessionId, createdAt: Date.now() });
  return token;
}

function validateCsrfToken(token, sessionId) {
  const record = csrfTokens.get(token);
  if (!record) return false;
  if (Date.now() - record.createdAt > CSRF_EXPIRY) {
    csrfTokens.delete(token);
    return false;
  }
  if (record.sessionId !== sessionId) return false;
  return true;
}

// Clean up expired CSRF tokens
setInterval(() => {
  const now = Date.now();
  for (const [token, record] of csrfTokens.entries()) {
    if (now - record.createdAt > CSRF_EXPIRY) {
      csrfTokens.delete(token);
    }
  }
}, 10 * 60 * 1000);

// Input validation/sanitization
function sanitizeInput(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  return input
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .trim();
}

function sanitizeObject(obj, maxLength = 1000) {
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxLength));
  }
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value, maxLength);
    }
    return sanitized;
  }
  if (typeof obj === 'string') {
    return sanitizeInput(obj, maxLength);
  }
  return obj;
}

// Discord /users/@me/guilds önbelleği: kullanıcıId -> { list, exp }
// Dashboard sunucu listesi için Discord API'yi boş yere yormamak adına 60 sn.
const discordGuildsCache = new Map();

const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Buffer.from(input, 'base64').toString('utf-8');
}

function signToken(payloadObj) {
  const payload = b64url(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(b64urlDecode(payload));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB

function readBody(req, limit = MAX_BODY_SIZE) {
  return new Promise((resolve) => {
    let data = '';
    let size = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      size += chunk.length;
      if (size > limit) {
        aborted = true;
        req.destroy();
        resolve({});
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (aborted) return;
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function readRawBody(req, limit = MAX_BODY_SIZE) {
  return new Promise((resolve) => {
    let data = '';
    let size = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      size += chunk.length;
      if (size > limit) {
        aborted = true;
        req.destroy();
        resolve('');
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (aborted) return;
      resolve(data);
    });
    req.on('error', () => resolve(''));
  });
}

function sendJSON(res, status, obj) {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(obj));
  return true; // route modüllerinde `return sendJSON(...)` → dispatcher'a "handled" sinyali
}

function getBearerToken(req) {
  // Önce httpOnly aegis_session cookie'sinden oku (OAuth sonrası asıl kaynak),
  // yoksa eski tarayıcılar/oturumlar için Authorization header'a düş,
  // yoksa URL query param'dan oku (Discord Activity proxy için)
  const cookieHeader = req.headers['cookie'] || '';
  const m = cookieHeader.match(/(?:^|;\s*)aegis_session=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  // URL query param: ?token=...
  const url = new URL(req.url, `http://${req.headers.host}`);
  const tokenFromQuery = url.searchParams.get('token');
  if (tokenFromQuery) return tokenFromQuery;
  return null;
}

function getPublicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  }
  return `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
}

// Bot uygulama: SADECE sunucuya özel takma ad (nickname) + GLOBAL avatar/banner.
// Avatar/banner global olarak Discord'a uygulanır (client.user.setAvatar/setBanner).
// Kaydedilen avatar/banner dashboard önizlemesinde ve Discord profilinde kullanılır.
async function applyBotCustomization(client, guild, bc) {
  try {
    // Sunucuya özel nickname
    if (bc.name) await guild.members.me.setNickname(bc.name).catch(()=>{});

    // Global avatar güncelleme
    if (bc.avatarUrl) {
      try {
        const avatarBuffer = await fetchImageBuffer(bc.avatarUrl);
        if (avatarBuffer) {
          await client.user.setAvatar(avatarBuffer);
          console.log('✅ Bot avatar güncellendi');
        }
      } catch (err) {
        console.error('Bot avatar güncellenemedi:', err.message);
      }
    }

    // Global banner güncelleme
    if (bc.bannerUrl) {
      try {
        const bannerBuffer = await fetchImageBuffer(bc.bannerUrl);
        if (bannerBuffer) {
          await client.user.setBanner(bannerBuffer);
          console.log('✅ Bot banner güncellendi');
        }
      } catch (err) {
        console.error('Bot banner güncellenemedi:', err.message);
      }
    }
  } catch(e) { console.error('BotCustom err:', e.message); }
}

// Resim URL'ini buffer olarak indir
async function fetchImageBuffer(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('Resim indirilemedi:', err.message);
    return null;
  }
}

module.exports = {
  SESSION_SECRET, SITE_URL, ORDERS_LOG_CHANNEL_ID, GITHUB_WEBHOOK_SECRET,
  discordGuildsCache, uploadsDir,
  b64url, b64urlDecode, signToken, verifyToken, readBody, readRawBody, sendJSON,
  getBearerToken, getPublicBaseUrl, applyBotCustomization,
  generateCsrfToken, validateCsrfToken, sanitizeInput, sanitizeObject,
};
