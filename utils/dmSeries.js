// ─── YENİ ÜYE DM KARŞILAMA SERİSİ ─────────────────────────────────────────
// Katılan üyeye anında karşılama DM'i + 2 gün sonra takip mesajı gönderir.
// Takip kuyruğu database.json'da tutulur (restart güvenli); 30 dakikada bir
// işlenir.
const { readDB, writeDB } = require('./database');

const DEFAULT_WELCOME = 'Hoş geldin {kullanici}! 🎉\n{sunucu} sunucusuna katıldın. Kuralları okumayı unutma, aktif ol ve eğlen!';
const DEFAULT_FOLLOWUP = '🚀 {sunucu} sunucusunda 2 gündür bizimlesin! İhtiyacın olursa yetkililere yazmaktan çekinme.';
const FOLLOWUP_DELAY_MS = 48 * 60 * 60 * 1000;

async function sendWelcomeDm(member, settings) {
  const cfg = settings.dmSeries || {};
  if (!cfg.enabled || member.user.bot) return;
  const msg = (cfg.welcome || DEFAULT_WELCOME)
    .replaceAll('{kullanici}', member.user.username)
    .replaceAll('{sunucu}', member.guild.name);
  const ok = await member.send(msg).then(() => true).catch(() => false);
  if (ok) queueFollowUp(member.guild.id, member.id, cfg);
}

function queueFollowUp(guildId, userId, cfg) {
  const db = readDB();
  if (!db[guildId]) return;
  if (!db[guildId]._dmQueue) db[guildId]._dmQueue = [];
  db[guildId]._dmQueue.push({
    userId,
    dueAt: Date.now() + FOLLOWUP_DELAY_MS,
    msg: cfg.followUp || DEFAULT_FOLLOWUP,
  });
  if (db[guildId]._dmQueue.length > 200) db[guildId]._dmQueue = db[guildId]._dmQueue.slice(-200);
  writeDB(db);
}

async function processDmQueue(client) {
  const db = readDB();
  let sent = 0;
  let changed = false;

  for (const [guildId, g] of Object.entries(db)) {
    if (!g || !Array.isArray(g._dmQueue) || !g._dmQueue.length) continue;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) { delete g._dmQueue; changed = true; continue; }

    const pending = [];
    for (const item of g._dmQueue) {
      if (item.dueAt <= Date.now()) {
        const member = guild.members.cache.get(item.userId) || await guild.members.fetch(item.userId).catch(() => null);
        if (member) {
          const ok = await member.send(item.msg).then(() => true).catch(() => false);
          if (ok) sent++;
        }
        changed = true; // due öğe kuyruktan çıkar
      } else {
        pending.push(item);
      }
    }
    if (changed) {
      g._dmQueue = pending;
      writeDB(db);
      changed = false;
    }
  }
  return sent;
}

function startDmSeriesSchedule(client) {
  setInterval(() => { processDmQueue(client).catch(() => {}); }, 30 * 60 * 1000);
}

module.exports = { sendWelcomeDm, processDmQueue, startDmSeriesSchedule, DEFAULT_WELCOME, DEFAULT_FOLLOWUP };
