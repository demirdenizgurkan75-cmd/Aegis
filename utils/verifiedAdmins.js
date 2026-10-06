// ─── Doğrulanmış yönetici deposu (Aegis + Aegis RP ORTAK) ───────────────────
// betterwithaegis.com/verify üzerinden Discord ile giriş yapan yöneticiler burada tutulur.
// Her iki bot (aegis-bot & aegis-rp) aynı dosyayı okur; antiNuke yalnızca
// doğrulanmış/güvenli listedeki hesaplara güvenir.
const fs = require('fs');
const path = require('path');

const FILE = process.env.VERIFIED_FILE || path.join(__dirname, '..', '..', 'shared', 'verified.json');

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { users: {} }; }
}

function save(db) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function isVerified(discordId) {
  if (!discordId) return false;
  const db = load();
  return !!(db.users && db.users[discordId] && db.users[discordId].verified);
}

function getVerified(discordId) {
  const db = load();
  return (db.users && db.users[discordId]) || null;
}

function addVerified(discordId, info = {}) {
  ensureDir();
  const db = load();
  if (!db.users) db.users = {};
  db.users[discordId] = {
    verified: true,
    verifiedAt: Date.now(),
    username: info.username || null,
    avatar: info.avatar || null,
    lastSeenAt: Date.now(),
  };
  save(db);
  return db.users[discordId];
}

module.exports = { isVerified, getVerified, addVerified };
