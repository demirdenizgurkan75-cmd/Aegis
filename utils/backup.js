// ─── DB OTOMATİK YEDEKLEME ─────────────────────────────────────────────────
// database.json (tek dosya, tüm sunucu ayarları + web kullanıcıları) her gün
// zaman damgalı kopyalanır. Ayrıca boot'ta (son yedek >=1 saatse) yedek alınır.
// İsteğe bağlı: BACKUP_WEBHOOK_URL set edilirse kopya bir Discord webhook'una
// gönderilir (sunucu dışı yedek).
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database.json');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

// Kaç yedek tutulacak (en yeni MAX_BACKUPS tanesi)
const MAX_BACKUPS = Number(process.env.MAX_BACKUPS || 14);
// Boot yedeği: son yedek bundan yeni ise atla (hızlı restart spam'ini önler)
const MIN_BOOT_INTERVAL_MS = Number(process.env.MIN_BOOT_INTERVAL_MINUTES || 60) * 60 * 1000;

function pruneOld() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('database-') && f.endsWith('.json'))
    .sort();
  while (files.length > MAX_BACKUPS) {
    const oldest = files.shift();
    try { fs.unlinkSync(path.join(BACKUP_DIR, oldest)); } catch {}
  }
}

async function sendToWebhook(filePath) {
  const boundary = '----AegisBackup' + Math.floor(Date.now() % 1e9);
  const content = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/json\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(process.env.BACKUP_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
}

/**
 * Şimdi bir yedek alır. Dönen: yedek dosya yolu (yoksa null).
 */
function createBackup() {
  if (!fs.existsSync(DB_PATH)) return null;

  const now = new Date();
  const stamp =
    `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_` +
    `${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const dest = path.join(BACKUP_DIR, `database-${stamp}.json`);
  fs.copyFileSync(DB_PATH, dest);
  pruneOld();

  if (process.env.BACKUP_WEBHOOK_URL) {
    sendToWebhook(dest).catch(e => console.error('⚠️ Webhook yedeği gönderilemedi:', e.message));
  }
  return dest;
}

function lastBackupAgeMs() {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('database-'));
    if (!files.length) return Infinity;
    const latest = files.map(f => fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs).sort((a, b) => b - a)[0];
    return Date.now() - latest;
  } catch {
    return Infinity;
  }
}

/**
 * Başlangıçta ve günde bir yedek alır. index.js'in clientReady içinde çağrılır.
 */
function startBackupSchedule() {
  const run = (why) => {
    try {
      const dest = createBackup();
      if (dest) console.log(`💾 DB yedeği alındı (${why}) → ${path.basename(dest)}`);
    } catch (e) {
      console.error('❌ Yedekleme hatası:', e.message);
    }
  };

  // Boot: son yedek MIN_BOOT_INTERVAL kadar eskiyse al (restart spam'ine karşı)
  if (lastBackupAgeMs() >= MIN_BOOT_INTERVAL_MS) run('boot');

  // Günde bir
  setInterval(() => run('günlük'), 24 * 60 * 60 * 1000);
}

module.exports = { createBackup, startBackupSchedule };
