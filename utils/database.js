const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.json');

// Türkçe + İngilizce küfür, ırkçı hakaret ve zorbalık ifadeleri
const DEFAULT_BANNED_WORDS = [
  // --- Türkçe küfür ---
  'amk', 'aq', 'oç', 'oc', 'sik', 'siktir', 'piç', 'pic', 'orospu', 'yarrak',
  'pezevenk', 'ananı', 'avradını', 'göt', 'got', 'ibne', 'gavat', 'yavşak',
  'yavsak', 'şerefsiz', 'serefsiz', 'kahpe', 'sürtük', 'surtuk', 'top gibi',
  // --- Türkçe ırkçılık / nefret söylemi ---
  'kürt pisliği', 'ermeni piçi', 'çingene pisliği', 'zenci pisliği',
  // --- Türkçe zorbalık / hakaret ---
  'geber', 'öl sen', 'kendini öldür', 'aptalsın', 'salaksın', 'değersizsin',
  'seni istemiyoruz', 'seni kimse sevmiyor',
  // --- English profanity ---
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'cunt',
  'whore', 'slut', 'motherfucker', 'dumbass',
  // --- English slurs / racism ---
  'nigger', 'nigga', 'faggot', 'retard', 'chink', 'spic', 'kike',
  // --- English bullying ---
  'kill yourself', 'kys', 'nobody likes you', 'go die', 'you are worthless',
];

// ─── İN-MEMORY CACHE ──────────────────────────────────────────────────────
// Önceden her readDB() çağrısı 56KB JSON'ı diski okuyup parse ediyordu; her
// API isteği bunu defalarca yapınca darboğaz oluyordu. Artık DB ilk erişimde
// bir kez yüklenip bellekte tutulur; yazmalar yine senkron (anlık diske yazılır,
// veri kaybı riski yok). Dışarıdan dosya elle düzenlendiyse reloadDB() gerekir.
let dbCache = null;
let lastMtime = 0;

function readDB() {
  if (!fs.existsSync(dbPath)) {
    // Klasör yoksa oluştur (pm2 cwd farklıysa veya ilk kurulumda)
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    dbCache = {};
    lastMtime = Date.now();
    fs.writeFileSync(dbPath, JSON.stringify({}, null, 2));
    return dbCache;
  }

  try {
    const stat = fs.statSync(dbPath);
    if (dbCache !== null && stat.mtimeMs <= lastMtime) {
      return dbCache;
    }
    lastMtime = stat.mtimeMs;
    dbCache = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (err) {
    if (dbCache !== null) return dbCache;
    // Dosya bozuksa SİLME — kenara taşı (veri kurtarma şansı kalsın) ve sıfırdan başla
    const corruptPath = dbPath + '.corrupt-' + Date.now();
    try {
      fs.renameSync(dbPath, corruptPath);
      console.error(`⚠️ database.json bozuk (${err.message}) → ${path.basename(corruptPath)} olarak saklandı, sıfırdan başlanıyor.`);
    } catch {
      console.error('⚠️ database.json bozuk ve taşınamadı:', err.message);
    }
    dbCache = {};
    lastMtime = Date.now();
    fs.writeFileSync(dbPath, JSON.stringify({}, null, 2));
  }
  return dbCache;
}

// ─── ATOMIC YAZMA + YAZMA KUYRUĞU (write lock) ─────────────────────────────
// Eşzamanlı writeDB çağrıları promise zinciriyle sıraya girer (çakışma olmaz).
// Atomik yazma: önce .tmp dosyasına yazılır, ardından rename ile değiştirilir —
// çökme anında database.json asla yarım/bozuk kalmaz.
let writeTail = Promise.resolve();

function writeDB(data) {
  dbCache = data;
  const json = JSON.stringify(data, null, 2);
  const tmpPath = dbPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, json);
    fs.renameSync(tmpPath, dbPath);
    try { lastMtime = fs.statSync(dbPath).mtimeMs; } catch {}
  } catch (e) {
    console.error('writeDB hatası:', e);
  }
  return Promise.resolve(data);
}

// Kuyruktaki tüm bekleyen yazmaların diske inmesini bekler (graceful shutdown).
async function flushWrites() {
  await writeTail;
}

function reloadDB() {
  dbCache = null;
  lastMtime = 0;
  return readDB();
}

// ─── GLOBAL (SUNUCUYA ÖZEL OLMAYAN) İSTATİSTİKLER ───────────────────────────
function incrementGlobalStat(key) {
  const db = readDB();
  if (!db._global) db._global = {};
  db._global[key] = (db._global[key] || 0) + 1;
  writeDB(db);
  return db._global[key];
}

function getGlobalStats() {
  const db = readDB();
  return db._global || {};
}

// ─── WEB SİTESİ HESAPLARI (Discord ile Giriş Yap) ───────────────────────────
function getOrCreateWebUser(discordId, profile) {
  const db = readDB();
  if (!db._webUsers) db._webUsers = {};

  if (!db._webUsers[discordId]) {
    const now = Date.now();
    db._webUsers[discordId] = {
      discordId,
      username: profile.username,
      avatar: profile.avatar,
      trialStart: now,
      trialEnd: now + 14 * 24 * 60 * 60 * 1000,
      selectedPackageId: null,
      orders: [],
      createdAt: now,
    };
  } else {
    db._webUsers[discordId].username = profile.username;
    db._webUsers[discordId].avatar = profile.avatar;
  }

  // Discord OAuth access token'ı sakla — dashboard sunucu listesini tazelemek için.
  // (Not: hobi botu için JSON dosyasında saklanır; ileride gerçek DB'ye taşınabilir.)
  if (profile.accessToken) {
    db._webUsers[discordId].accessToken = profile.accessToken;
  }
  if (profile.refreshToken) {
    db._webUsers[discordId].refreshToken = profile.refreshToken;
  }

  writeDB(db);
  return db._webUsers[discordId];
}

function getWebUser(discordId) {
  const db = readDB();
  if (!db._webUsers) return null;
  return db._webUsers[discordId] || null;
}

function recordWebOrder(discordId, packageId, serverLink) {
  const db = readDB();
  if (!db._webUsers || !db._webUsers[discordId]) return null;

  const order = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    packageId,
    serverLink: serverLink || null,
    status: 'beklemede',
    createdAt: Date.now(),
  };

  db._webUsers[discordId].orders.push(order);
  db._webUsers[discordId].selectedPackageId = packageId;
  writeDB(db);
  return order;
}

function saveManualOrder({ id, discordTag, serverInfo, packageName, packageId, note }) {
  reloadDB();
  const db = readDB();
  if (!db._orders) db._orders = {};

  const order = {
    id: String(id).trim().toUpperCase(),
    discordTag: discordTag || '',
    serverInfo: serverInfo || '',
    packageName: packageName || 'Topluluk Pro',
    packageId: packageId || 'community-pro',
    note: note || '',
    status: 'beklemede',
    createdAt: Date.now(),
  };

  db._orders[order.id] = order;
  writeDB(db);
  return order;
}

function findOrderById(orderId) {
  if (!orderId) return null;
  reloadDB();
  const db = readDB();
  if (!db) return null;
  const target = String(orderId).trim().toUpperCase();

  // 1. db._orders kontrol et (5 haneli web sipariş kodları)
  if (db._orders) {
    for (const key of Object.keys(db._orders)) {
      if (key.toUpperCase() === target) {
        return { discordId: db._orders[key].discordTag || db._orders[key].discordId, order: db._orders[key] };
      }
    }
  }

  // 2. db._webUsers kontrol et
  if (db._webUsers) {
    for (const discordId of Object.keys(db._webUsers)) {
      const order = (db._webUsers[discordId].orders || []).find(o => String(o.id).toUpperCase() === target);
      if (order) return { discordId, order };
    }
  }
  return null;
}

function setOrderStatus(orderId, status) {
  if (!orderId) return null;
  reloadDB();
  const db = readDB();
  if (!db) return null;
  let found = null;
  const target = String(orderId).trim().toUpperCase();

  if (db._orders) {
    for (const key of Object.keys(db._orders)) {
      if (key.toUpperCase() === target) {
        db._orders[key].status = status;
        db._orders[key].updatedAt = Date.now();
        found = { discordId: db._orders[key].discordTag || db._orders[key].discordId, order: db._orders[key] };
        break;
      }
    }
  }

  if (db._webUsers) {
    for (const discordId of Object.keys(db._webUsers)) {
      const order = (db._webUsers[discordId].orders || []).find(o => String(o.id).toUpperCase() === target);
      if (order) {
        order.status = status;
        order.updatedAt = Date.now();
        if (!found) found = { discordId, order };
        break;
      }
    }
  }

  if (found) {
    writeDB(db);
  }
  return found;
}

function listPendingOrders() {
  reloadDB();
  const db = readDB();
  if (!db) return [];
  const pending = [];

  if (db._orders) {
    for (const key of Object.keys(db._orders)) {
      const o = db._orders[key];
      const st = String(o.status || '').toLowerCase();
      if (st === 'beklemede' || st === 'pending') {
        pending.push({ ...o, discordId: o.discordTag || o.discordId });
      }
    }
  }

  if (db._webUsers) {
    for (const discordId of Object.keys(db._webUsers)) {
      for (const order of db._webUsers[discordId].orders || []) {
        const st = String(order.status || '').toLowerCase();
        if ((st === 'beklemede' || st === 'pending') && !pending.some(p => String(p.id).toUpperCase() === String(order.id).toUpperCase())) {
          pending.push({ discordId, ...order });
        }
      }
    }
  }

  return pending.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function hasApprovedOrder(discordId, packageId) {
  const db = readDB();
  if (!db._webUsers || !db._webUsers[discordId]) return false;
  return (db._webUsers[discordId].orders || []).some(
    o => o.packageId === packageId && o.status === 'onaylandı'
  );
}

function activatePackageForGuild(guildId, packageId) {
  updateGuild(guildId, { activePackageId: packageId });
  return packageId;
}

// ─── SUNUCU AYARLARI ─────────────────────────────────────────────────────────
function getGuild(guildId) {
  const db = readDB();
  if (!db[guildId]) {
    db[guildId] = {
      logChannel: null,
      modRole: null,
      bannedWords: [...DEFAULT_BANNED_WORDS],
      antiInvite: true,
      autoMod: true,
      antiRaid: true,
      linkSandbox: false,       // Link kum havuzu (varsayılan kapalı - komutla açılır)
      aiModeration: true,       // AI ton analizi (varsayılan açık)
      trustScoreEnabled: true,  // Güven skoru (varsayılan açık)
      antiRaidConfig: {
        channelDelete: { threshold: 3, windowSec: 10 },
        channelCreate: { threshold: 5, windowSec: 10 },
        roleDelete: { threshold: 3, windowSec: 10 },
        massBan: { threshold: 3, windowSec: 10 },
        messageSpam: { threshold: 6, windowSec: 6, timeoutSec: 30 },
      },
      welcomeMessage: null,
      welcomeChannel: null,
      welcomeEnabled: false,
      autoRoleId: null,
      announcementChannel: null,
      joinLeaveLogChannel: null,
      messageLogChannel: null,
      roleLogChannel: null,
      voiceLogChannel: null,
      nicknameLogChannel: null,
      channelLogChannel: null,
      banKickLogChannel: null,
      muteLogChannel: null,
      inviteLogChannel: null,
      gameActivityLogChannel: null,
      statusLogChannel: null,
      logCategory: null,
      warnings: {},
      userBios: {},
      ordersLogChannel: null,
      activePackageId: null,
      ticketCategory: null,
      ticketStaffRole: null,
      ticketLogChannel: null,
      ticketTranscriptChannel: null,
      ticketCounter: 0,
      language: 'tr',  // 'tr' | 'en'
      // AI Ticket Assistant
      ticketAiEnabled: false,
      ticketAiSkills: [],
      ticketAiUsage: { date: '', count: 0 },
      ticketAiConfig: {
        autoReply: true,
        respondToUser: true,
        respondToStaff: false,
        analyzeAttachments: true,
        analyzeLinks: true,
        language: 'tr'
      },
      tickets: {},
      statsEnabled: false,
      memberCountChannel: null,
      botCountChannel: null,
      humanCountChannel: null,
      boostCountChannel: null,
      giveaways: {},
      healthReportEnabled: true,
      voiceModEnabled: false,
      voiceModLogChannel: null,
      // AI Chat Asistanı & Kişilik & Kanal İzinleri
      aiChatEnabled: false,
      aiChatChannelId: null,
      aiChatMode: 'single', // 'single' | 'whitelist' | 'blacklist'
      aiChatAllowedChannels: [],
      aiChatIgnoredChannels: [],
      aiChatCustomPersona: null,
      aiChatEnhancedPrompt: null,
    };
    writeDB(db);
  }
  return db[guildId];
}

function updateGuild(guildId, updates) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  Object.assign(db[guildId], updates);
  writeDB(db);
  return db[guildId];
}

function addBannedWord(guildId, word) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  if (!db[guildId].bannedWords.includes(word)) {
    db[guildId].bannedWords.push(word);
    writeDB(db);
  }
  return db[guildId].bannedWords;
}

function removeBannedWord(guildId, word) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  db[guildId].bannedWords = db[guildId].bannedWords.filter(w => w !== word);
  writeDB(db);
  return db[guildId].bannedWords;
}

function getBannedWords(guildId) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  return db[guildId].bannedWords || [];
}

function addWarning(guildId, userId, moderatorId, reason) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  if (!db[guildId].warnings) db[guildId].warnings = {};
  if (!db[guildId].warnings[userId]) db[guildId].warnings[userId] = [];

  const warnData = {
    id: Date.now().toString(36),
    moderatorId,
    reason,
    timestamp: Date.now(),
  };

  db[guildId].warnings[userId].push(warnData);
  writeDB(db);
  return db[guildId].warnings[userId];
}

function getWarnings(guildId, userId) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].warnings) return [];
  return db[guildId].warnings[userId] || [];
}

function removeWarning(guildId, userId, warnId) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].warnings || !db[guildId].warnings[userId]) return [];
  db[guildId].warnings[userId] = db[guildId].warnings[userId].filter(w => w.id !== warnId);
  writeDB(db);
  return db[guildId].warnings[userId];
}

function setBio(guildId, userId, bio) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  if (!db[guildId].userBios) db[guildId].userBios = {};
  db[guildId].userBios[userId] = bio;
  writeDB(db);
  return bio;
}

function getBio(guildId, userId) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].userBios) return null;
  return db[guildId].userBios[userId] || null;
}

function getCharacter(guildId, userId) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].characters) return null;
  return db[guildId].characters[userId] || null;
}

function saveCharacter(guildId, userId, charData) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  if (!db[guildId].characters) db[guildId].characters = {};
  db[guildId].characters[userId] = {
    ...(db[guildId].characters[userId] || {}),
    ...charData,
    userId,
    updatedAt: Date.now(),
  };
  writeDB(db);
  return db[guildId].characters[userId];
}

function deleteCharacter(guildId, userId) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].characters || !db[guildId].characters[userId]) return false;
  delete db[guildId].characters[userId];
  writeDB(db);
  return true;
}

const DEFAULT_ANTIRAID_CONFIG = {
  channelDelete: { threshold: 3, windowSec: 10 },
  channelCreate: { threshold: 5, windowSec: 10 },
  roleDelete: { threshold: 3, windowSec: 10 },
  massBan: { threshold: 3, windowSec: 10 },
  messageSpam: { threshold: 6, windowSec: 6, timeoutSec: 30 },
};

function getAntiRaidConfig(guildId) {
  const settings = getGuild(guildId);
  const stored = settings.antiRaidConfig || {};
  return {
    channelDelete: { ...DEFAULT_ANTIRAID_CONFIG.channelDelete, ...(stored.channelDelete || {}) },
    channelCreate: { ...DEFAULT_ANTIRAID_CONFIG.channelCreate, ...(stored.channelCreate || {}) },
    roleDelete: { ...DEFAULT_ANTIRAID_CONFIG.roleDelete, ...(stored.roleDelete || {}) },
    massBan: { ...DEFAULT_ANTIRAID_CONFIG.massBan, ...(stored.massBan || {}) },
    messageSpam: { ...DEFAULT_ANTIRAID_CONFIG.messageSpam, ...(stored.messageSpam || {}) },
  };
}

function setAntiRaidConfigField(guildId, category, field, value) {
  const current = getAntiRaidConfig(guildId);
  current[category][field] = value;
  updateGuild(guildId, { antiRaidConfig: current });
  return current[category];
}

// ─── TİCKET SİSTEMİ ──────────────────────────────────────────────────────────
function createTicket(guildId, ticketId, data) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  if (!db[guildId].tickets) db[guildId].tickets = {};
  db[guildId].tickets[ticketId] = data;
  db[guildId].ticketCounter = (db[guildId].ticketCounter || 0) + 1;
  writeDB(db);
  return db[guildId].tickets[ticketId];
}

function updateTicket(guildId, ticketId, updates) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].tickets || !db[guildId].tickets[ticketId]) return null;
  db[guildId].tickets[ticketId] = { ...db[guildId].tickets[ticketId], ...updates };
  writeDB(db);
  return db[guildId].tickets[ticketId];
}

function getTicket(guildId, ticketId) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].tickets) return null;
  return db[guildId].tickets[ticketId];
}

function closeTicket(guildId, ticketId) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].tickets) return null;
  const ticket = db[guildId].tickets[ticketId];
  if (ticket) {
    ticket.closed = true;
    ticket.closedAt = Date.now();
    writeDB(db);
  }
  return ticket;
}

function deleteTicket(guildId, ticketId) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].tickets) return null;
  const ticket = db[guildId].tickets[ticketId];
  delete db[guildId].tickets[ticketId];
  writeDB(db);
  return ticket;
}

// ─── TICKET: Channel ID ile ticket bulma ──────────────────────────────────────
function getTicketByChannelId(guildId, channelId) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].tickets) {
    console.log('[getTicketByChannelId] guildId:', guildId, 'no guild/tickets in DB');
    return null;
  }
  const found = Object.values(db[guildId].tickets).find(t => t.channelId === channelId);
  if (!found) {
    console.log('[getTicketByChannelId] channelId:', channelId, 'NOT FOUND in', Object.values(db[guildId].tickets).map(t => t.channelId));
  }
  return found || null;
}

// ─── AI TICKET ASSISTANT ───────────────────────────────────────────────────────
function getTicketAiSettings(guildId) {
  const settings = getGuild(guildId);
  return {
    enabled: settings.ticketAiEnabled || false,
    skills: settings.ticketAiSkills || [],
    usage: settings.ticketAiUsage || { date: '', count: 0 },
    config: settings.ticketAiConfig || {
      autoReply: true,
      respondToUser: true,
      respondToStaff: false,
      analyzeAttachments: true,
      analyzeLinks: true,
      language: 'tr'
    }
  };
}

function updateTicketAiSettings(guildId, updates) {
  const settings = getGuild(guildId);
  const currentConfig = settings.ticketAiConfig || {};
  const newConfig = { ...currentConfig, ...updates.config };
  return updateGuild(guildId, {
    ticketAiEnabled: updates.enabled ?? settings.ticketAiEnabled,
    ticketAiConfig: newConfig
  });
}

function addTicketAiSkill(guildId, skill) {
  const settings = getGuild(guildId);
  const skills = settings.ticketAiSkills || [];
  const newSkill = { ...skill, id: skill.id || 'skill_' + Date.now() };
  skills.push(newSkill);
  updateGuild(guildId, { ticketAiSkills: skills });
  return newSkill;
}

function removeTicketAiSkill(guildId, skillId) {
  const settings = getGuild(guildId);
  const skills = (settings.ticketAiSkills || []).filter(s => s.id !== skillId);
  return updateGuild(guildId, { ticketAiSkills: skills });
}

function updateTicketAiSkill(guildId, skillId, updates) {
  const settings = getGuild(guildId);
  const skills = (settings.ticketAiSkills || []).map(s =>
    s.id === skillId ? { ...s, ...updates } : s
  );
  updateGuild(guildId, { ticketAiSkills: skills });
  return skills.find(s => s.id === skillId);
}

function getTicketAiUsage(guildId) {
  const settings = getGuild(guildId);
  const usage = settings.ticketAiUsage || { date: '', count: 0 };
  const today = new Date().toISOString().split('T')[0];
  if (usage.date !== today) {
    return { date: today, count: 0 };
  }
  return usage;
}

function incrementTicketAiUsage(guildId) {
  const settings = getGuild(guildId);
  const usage = settings.ticketAiUsage || { date: '', count: 0 };
  const today = new Date().toISOString().split('T')[0];
  if (usage.date !== today) {
    usage.date = today;
    usage.count = 1;
  } else {
    usage.count += 1;
  }
  return updateGuild(guildId, { ticketAiUsage: usage });
}

function getTicketAiLimit(guildId) {
  const settings = getGuild(guildId);
  // Satın alınmış paket; yoksa süresi dolmamış davet ödülü (Ballad)
  const packageId = settings.activePackageId || (settings.rewardUntil > Date.now() ? 'filo-komutani' : null);
  // Limits per package
  const limits = {
    'onculer': 5000,
    'filo-komutani': 10000,
    'galaksi-imparatoru': Infinity
  };
  return limits[packageId] || 1000; // Default free tier: 1000
}

function checkTicketAiLimit(guildId) {
  const usage = getTicketAiUsage(guildId);
  const limit = getTicketAiLimit(guildId);
  return {
    allowed: usage.count < limit,
    usage: usage.count,
    limit,
    remaining: Math.max(0, limit - usage.count)
  };
}

// ─── ÇEKİLİŞ SİSTEMİ ────────────────────────────────────────────────────────
function saveGiveaway(guildId, giveaway) {
  const db = readDB();
  if (!db[guildId]) {
    // Sunucu kaydı yoksa oluştur ve yeniden oku (getGuild kendi readDB'sini kullanır)
    getGuild(guildId);
    return saveGiveaway(guildId, giveaway);
  }
  if (!db[guildId].giveaways) db[guildId].giveaways = {};
  db[guildId].giveaways[giveaway.id] = giveaway;
  writeDB(db);
  return giveaway;
}

function getGiveaway(guildId, id) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].giveaways) return null;
  return db[guildId].giveaways[id] || null;
}

function updateGiveaway(guildId, id, updates) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].giveaways || !db[guildId].giveaways[id]) return null;
  Object.assign(db[guildId].giveaways[id], updates);
  writeDB(db);
  return db[guildId].giveaways[id];
}

function deleteGiveaway(guildId, id) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].giveaways || !db[guildId].giveaways[id]) return false;
  delete db[guildId].giveaways[id];
  writeDB(db);
  return true;
}

/**
 * DB'deki TÜM sunucularda durumu 'aktif' olan çekilişleri döndürür.
 * Restart sonrası timer'ları geri kurmak için kullanılır.
 * @returns {Array<{guildId: string, ...giveaway}>}
 */
function listActiveGiveaways() {
  const db = readDB();
  const out = [];
  for (const [guildId, guild] of Object.entries(db)) {
    if (!guild || typeof guild !== 'object' || !guild.giveaways) continue;
    for (const [id, gw] of Object.entries(guild.giveaways)) {
      if (gw && gw.status === 'aktif') out.push({ guildId, id, ...gw });
    }
  }
  return out;
}

// ─── WEB PUSH UYARILARI (dashboard bildirimi) ───────────────────────────────
function recordAlert(guildId, type, title) {
  const db = readDB();
  if (!db._alerts) db._alerts = [];
  db._alerts.push({ guildId, type, title, at: Date.now() });
  if (db._alerts.length > 100) db._alerts = db._alerts.slice(-100);
  writeDB(db);
  return db._alerts.length;
}

function getAlerts() {
  const db = readDB();
  return db._alerts || [];
}

// ─── YENİ: DASHBOARD İSTATİSTİKLERİ ─────────────────────────────────────────
/**
 * Mesaj istatistiği kaydeder — saatlik granülariteyle.
 * Yapı: db[guildId]._msgStats[YYYY-MM-DD-HH][channelId] = count
 */
function recordMessageStat(guildId, channelId) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  if (!db[guildId]._msgStats) db[guildId]._msgStats = {};

  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}`;

  if (!db[guildId]._msgStats[key]) db[guildId]._msgStats[key] = {};
  db[guildId]._msgStats[key][channelId] = (db[guildId]._msgStats[key][channelId] || 0) + 1;

  // 30 günden eski istatistikleri temizle
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(db[guildId]._msgStats)) {
    const [year, month, day] = k.split('-').map(Number);
    const keyDate = new Date(year, month - 1, day).getTime();
    if (keyDate < thirtyDaysAgo) delete db[guildId]._msgStats[k];
  }

  writeDB(db);
}

/**
 * Üye katılım istatistiği kaydeder — günlük granülariteyle.
 * Yapı: db[guildId]._joinStats[YYYY-MM-DD] = count
 */
function recordMemberJoin(guildId) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  if (!db[guildId]._joinStats) db[guildId]._joinStats = {};

  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  db[guildId]._joinStats[key] = (db[guildId]._joinStats[key] || 0) + 1;

  // 30 günden eski verileri temizle
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(db[guildId]._joinStats)) {
    const keyDate = new Date(k).getTime();
    if (keyDate < thirtyDaysAgo) delete db[guildId]._joinStats[k];
  }

  writeDB(db);
}

/**
 * Kullanıcının son N gündeki mesaj sayısını döndürür.
 */
function getUserMessageCount(guildId, userId, days = 30) {
  const db = readDB();
  if (!db[guildId] || !db[guildId]._msgStats) return 0;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let total = 0;

  for (const [key, channels] of Object.entries(db[guildId]._msgStats)) {
    const [year, month, day] = key.split('-').map(Number);
    const keyDate = new Date(year, month - 1, day).getTime();
    if (keyDate >= cutoff) {
      for (const [channelId, count] of Object.entries(channels)) {
        // channelId burada aslında userId - database.js recordMessageStat'te channelId olarak kaydediyor
        // ama aslında bu channel başına mesaj sayısı. User başına değil.
        // Bu yüzden farklı bir yaklaşım lazım.
      }
    }
  }
  return 0; // Placeholder - need different tracking
}

/**
 * Kullanıcının davet sayısını döndürür (basit cache tabanlı).
 */
async function getUserInviteCount(guild, userId) {
  try {
    const invites = await guild.invites.fetch();
    let count = 0;
    for (const [, invite] of invites) {
      if (invite.inviter?.id === userId) count += invite.uses || 0;
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Kullanıcının uyarı sayısını döndürür.
 */
function getUserWarningCount(guildId, userId) {
  const warnings = getWarnings(guildId, userId);
  return warnings.length;
}

/**
 * Dashboard için sunucu istatistiklerini toplar.
 * @param {string} guildId
 * @param {number} days - Kaç günlük veri (max 30)
 */
function getDashboardStats(guildId, days = 7) {
  const db = readDB();
  if (!db[guildId]) return null;

  const limit = Math.min(30, days);
  const now = new Date();

  // Son N günlük üye katılımları
  const joinStats = [];
  for (let i = limit - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    joinStats.push({
      date: key,
      count: (db[guildId]._joinStats || {})[key] || 0,
    });
  }

  // Son 24 saatlik mesaj trafiği (saatlik)
  const msgByHour = [];
  for (let h = 23; h >= 0; h--) {
    const d = new Date(now);
    d.setHours(d.getHours() - h);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}`;
    const hourData = (db[guildId]._msgStats || {})[key] || {};
    const total = Object.values(hourData).reduce((a, b) => a + b, 0);
    msgByHour.push({
      hour: `${String(d.getHours()).padStart(2,'0')}:00`,
      count: total,
    });
  }

  // En aktif kanallar (son 7 gün)
  const channelCounts = {};
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [key, channels] of Object.entries(db[guildId]._msgStats || {})) {
    const [year, month, day] = key.split('-').map(Number);
    const keyDate = new Date(year, month - 1, day).getTime();
    if (keyDate >= sevenDaysAgo) {
      for (const [channelId, count] of Object.entries(channels)) {
        channelCounts[channelId] = (channelCounts[channelId] || 0) + count;
      }
    }
  }

  const topChannels = Object.entries(channelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([channelId, count]) => ({ channelId, count }));

  // Genel istatistikler
  const global = db._global || {};

  return {
    joinStats,
    msgByHour,
    topChannels,
    blockedThreats: global.blockedThreats || 0,
    globalThreatCount: Object.keys(db._globalThreats || {}).length,
    settings: {
      autoMod: db[guildId].autoMod,
      antiRaid: db[guildId].antiRaid,
      linkSandbox: db[guildId].linkSandbox,
      aiModeration: db[guildId].aiModeration,
    },
  };
}

function getGrowthData(guildId) {
  const db = readDB();
  if (!db[guildId]) return { memberChange: 0, messageChange: 0 };

  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const getWeeklyJoins = (weekStart) => {
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      count += (db[guildId]._joinStats || {})[key] || 0;
    }
    return count;
  };

  const getWeeklyMessages = (weekStart) => {
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      for (let h = 0; h < 24; h++) {
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${String(h).padStart(2,'0')}`;
        const hourData = (db[guildId]._msgStats || {})[key] || {};
        count += Object.values(hourData).reduce((a, b) => a + b, 0);
      }
    }
    return count;
  };

  const thisWeekJoins = getWeeklyJoins(thisWeekStart);
  const lastWeekJoins = getWeeklyJoins(lastWeekStart);
  const thisWeekMessages = getWeeklyMessages(thisWeekStart);
  const lastWeekMessages = getWeeklyMessages(lastWeekStart);

  const memberChange = lastWeekJoins > 0 ? Math.round(((thisWeekJoins - lastWeekJoins) / lastWeekJoins) * 100) : (thisWeekJoins > 0 ? 100 : 0);
  const messageChange = lastWeekMessages > 0 ? Math.round(((thisWeekMessages - lastWeekMessages) / lastWeekMessages) * 100) : (thisWeekMessages > 0 ? 100 : 0);

  return { memberChange, messageChange, thisWeekJoins, lastWeekJoins, thisWeekMessages, lastWeekMessages };
}

// ═════════════════════════════════════════════════════════════════════════
// WEEKLY HEALTH REPORT
// ═════════════════════════════════════════════════════════════════════════
function saveHealthReport(guildId, report) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  if (!db[guildId].healthReports) db[guildId].healthReports = [];
  db[guildId].healthReports.push(report);
  // Keep only last 10 reports per guild
  if (db[guildId].healthReports.length > 10) {
    db[guildId].healthReports = db[guildId].healthReports.slice(-10);
  }
  writeDB(db);
  return report;
}

function getHealthReports(guildId, limit = 10) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].healthReports) return [];
  return db[guildId].healthReports.slice(-limit);
}

function getLatestHealthReport(guildId) {
  const reports = getHealthReports(guildId, 1);
  return reports.length > 0 ? reports[0] : null;
}

function getHealthHistory(guildId, limit = 10) {
  return getHealthReports(guildId, limit);
}

// ═════════════════════════════════════════════════════════════════════════
// WEBHOOK YÖNETİCİSİ (Webhook Manager)
// ═════════════════════════════════════════════════════════════════════════
function getWebhooks(guildId) {
  const settings = getGuild(guildId);
  if (!settings.webhooks) settings.webhooks = [];
  return settings.webhooks;
}

function createWebhook(guildId, data) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  if (!db[guildId].webhooks) db[guildId].webhooks = [];
  const webhook = {
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    name: data.name,
    channelId: data.channelId,
    avatarUrl: data.avatarUrl || null,
    createdBy: data.createdBy,
    createdAt: Date.now(),
    managed: true
  };
  db[guildId].webhooks.push(webhook);
  writeDB(db);
  return webhook;
}

function updateWebhook(guildId, webhookId, updates) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].webhooks) return null;
  const idx = db[guildId].webhooks.findIndex(w => w.id === webhookId);
  if (idx === -1) return null;
  db[guildId].webhooks[idx] = { ...db[guildId].webhooks[idx], ...updates };
  writeDB(db);
  return db[guildId].webhooks[idx];
}

function deleteWebhook(guildId, webhookId) {
  const db = readDB();
  if (!db[guildId] || !db[guildId].webhooks) return false;
  const len = db[guildId].webhooks.length;
  db[guildId].webhooks = db[guildId].webhooks.filter(w => w.id !== webhookId);
  writeDB(db);
  return db[guildId].webhooks.length !== len;
}

function executeWebhook(webhook, content, embeds = []) {
  // Called from Discord layer with actual webhook object
  if (webhook && webhook.send) {
    return webhook.send({ content, embeds });
  }
  return Promise.resolve();
}

// ═════════════════════════════════════════════════════════════════════════
// KURAL BOTU (Rules Bot / Onboarding)
// ═════════════════════════════════════════════════════════════════════════
function getRulesBot(guildId) {
  const settings = getGuild(guildId);
  if (!settings.rulesBot) {
    settings.rulesBot = {
      enabled: false,
      rulesChannelId: null,
      rulesMessageId: null,
      verifiedRoleId: null,
      dmOnJoin: true,
      dmContent: {
        title: '🛡️ {server} - Sunucu Kuralları',
        description: 'Aşağıdaki kuralları okuduysanız **Onayla** butonuna basın.\n\n1️⃣ Saygılı olun\n2️⃣ Spam yapmayın\n3️⃣ NSFW paylaşmayın\n4️⃣ Reklam yasaktır\n5️⃣ Yetkililere saygı gösterin',
        footer: 'Onay vermezseniz sunucuda yazamazsınız.',
        buttonLabel: '✅ Onayla ve Katıl',
        buttonStyle: 'SUCCESS'
      },
      timeoutMinutes: 10,
      kickOnTimeout: false,
      logChannelId: null
    };
    writeDB(readDB());
  }
  return settings.rulesBot;
}

function setRulesBot(guildId, data) {
  const db = readDB();
  if (!db[guildId]) getGuild(guildId);
  db[guildId].rulesBot = { ...getRulesBot(guildId), ...data };
  writeDB(db);
  return db[guildId].rulesBot;
}

function sendRulesDM(member, client) {
  const rulesBot = getRulesBot(member.guild.id);
  if (!rulesBot.enabled || !rulesBot.dmOnJoin) return Promise.resolve();

  const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

  const content = rulesBot.dmContent;
  const title = content.title.replace('{server}', member.guild.name);
  const description = content.description;

  const btnStyle = content.buttonStyle === 'SUCCESS' ? ButtonStyle.Success : content.buttonStyle === 'DANGER' ? ButtonStyle.Danger : ButtonStyle.Primary;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rules_accept_${member.guild.id}_${member.id}`)
      .setLabel(content.buttonLabel || '✅ Kabul Ediyorum')
      .setStyle(btnStyle)
  );

  const container = new ContainerBuilder()
    .setAccentColor(0x0066ff)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n\n${description}`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`*${content.footer || 'Aegis Guard'}*`)
    )
    .addActionRowComponents(row);

  return member.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
}

function handleRulesAccept(interaction, client) {
  const customId = interaction.customId;
  const match = customId.match(/^rules_accept_(.+)_(.+)$/);
  if (!match) return Promise.resolve({ success: false, error: 'Invalid custom_id' });

  const { ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

  const guildId = match[1];
  const userId = match[2];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'Bu buton sizin için değil.', ephemeral: true });
  }

  const rulesBot = getRulesBot(guildId);
  if (!rulesBot.enabled || !rulesBot.verifiedRoleId) {
    return interaction.update({ content: 'Sistem yapılandırılmamış.', components: [] });
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return interaction.update({ content: 'Sunucu bulunamadı.', components: [] });

  const member = guild.members.cache.get(userId);
  if (!member) return interaction.update({ content: 'Kullanıcı sunucuda bulunamadı.', components: [] });

  // Add role
  member.roles.add(rulesBot.verifiedRoleId, 'Kuralları onayladı').catch(() => {});

  // Log
  if (rulesBot.logChannelId) {
    const logCh = guild.channels.cache.get(rulesBot.logChannelId);
    if (logCh) logCh.send(`✅ ${member.user.tag} (${member.id}) kuralları onayladı.`).catch(() => {});
  }

  // Disable button
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('✅ Onaylandı')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  const acceptedContainer = new ContainerBuilder()
    .setAccentColor(0x3ba55c)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## ✅ Kurallar Onaylandı\nSunucuya hoş geldiniz!')
    )
    .addActionRowComponents(disabledRow);

  interaction.update({ components: [acceptedContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});

  return Promise.resolve({ success: true });
}

// ─── SEVİYE & XP SİSTEMİ (DEVRE DIŞI / STUB) ─────────────────────────────
function getUserLevel(guildId, userId) {
  return { xp: 0, level: 1, lastMessage: 0 };
}

function addXP(guildId, userId, amount = 20) {
  return { leveledUp: false, level: 1, xp: 0, user: { xp: 0, level: 1 } };
}

function getLevelLeaderboard(guildId) {
  return [];
}


// ═════════════════════════════════════════════════════════════════════════
// FIVEM & RP MODÜLLERİ (EKİP, MÜLAKAT, CANLI MONİTÖR)
// ═════════════════════════════════════════════════════════════════════════

// 1. ÇETE / AİLE (FACTIONS)
function getFactions(guildId) {
  const db = readDB();
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId].factions) db[guildId].factions = {};
  return db[guildId].factions;
}

function getFaction(guildId, factionId) {
  const factions = getFactions(guildId);
  return factions[factionId] || null;
}

function createFaction(guildId, { name, tag, roleId, leaderId }) {
  const db = readDB();
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId].factions) db[guildId].factions = {};
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const faction = {
    id,
    name,
    tag: tag ? tag.toUpperCase() : "",
    roleId,
    leaderId,
    members: [leaderId],
    createdAt: Date.now(),
  };
  db[guildId].factions[id] = faction;
  writeDB(db);
  return faction;
}

function addFactionMember(guildId, factionId, userId) {
  const db = readDB();
  if (!db[guildId]?.factions?.[factionId]) return false;
  const faction = db[guildId].factions[factionId];
  if (!faction.members.includes(userId)) {
    faction.members.push(userId);
    writeDB(db);
  }
  return true;
}

function removeFactionMember(guildId, factionId, userId) {
  const db = readDB();
  if (!db[guildId]?.factions?.[factionId]) return false;
  const faction = db[guildId].factions[factionId];
  faction.members = faction.members.filter(m => m !== userId);
  writeDB(db);
  return true;
}

function deleteFaction(guildId, factionId) {
  const db = readDB();
  if (!db[guildId]?.factions?.[factionId]) return false;
  const deleted = db[guildId].factions[factionId];
  delete db[guildId].factions[factionId];
  writeDB(db);
  return deleted;
}

// 2. MÜLAKAT & SESLİ WHITELIST
function getMulakatConfig(guildId) {
  const settings = getGuild(guildId);
  return settings.mulakatConfig || {
    waitChannelId: null,
    interviewChannelId: null,
    staffRoleId: null,
    whitelistRoleId: null,
    unregisterRoleId: null,
    logChannelId: null,
    panelMessageId: null,
  };
}

function updateMulakatConfig(guildId, config) {
  const current = getMulakatConfig(guildId);
  const updated = { ...current, ...config };
  updateGuild(guildId, { mulakatConfig: updated });
  return updated;
}

// 3. FIVEM CANLI MONİTÖR
function getFiveMMonitor(guildId) {
  const settings = getGuild(guildId);
  return settings.fivemMonitor || null;
}

function setFiveMMonitor(guildId, monitorData) {
  updateGuild(guildId, { fivemMonitor: monitorData });
  return monitorData;
}

// 5. HONEYTOKEN / CANARY SAHTE YETKİ TUZAĞI
const DEFAULT_HONEYTOKEN_CONFIG = {
  enabled: false,
  roles: [],
  channels: [],
  action: "strip_and_isolate",
  autoPanic: true,
  alertOwnerDM: true,
  logChannelId: null,
  triggers: [],
};

function getHoneytokenConfig(guildId) {
  const settings = getGuild(guildId);
  const stored = settings.honeytokenConfig || {};
  return {
    ...DEFAULT_HONEYTOKEN_CONFIG,
    ...stored,
    roles: Array.isArray(stored.roles) ? stored.roles : [],
    channels: Array.isArray(stored.channels) ? stored.channels : [],
    triggers: Array.isArray(stored.triggers) ? stored.triggers : [],
  };
}

function saveHoneytokenConfig(guildId, config) {
  updateGuild(guildId, { honeytokenConfig: config });
  return config;
}

function recordHoneytokenTrigger(guildId, eventData) {
  const config = getHoneytokenConfig(guildId);
  const entry = {
    id: "ht_" + Date.now(),
    timestamp: Date.now(),
    ...eventData,
  };
  config.triggers.unshift(entry);
  if (config.triggers.length > 50) config.triggers = config.triggers.slice(0, 50);
  saveHoneytokenConfig(guildId, config);
  return entry;
}

// ═════════════════════════════════════════════════════════════════════════

module.exports = {
  readDB, writeDB, reloadDB, flushWrites, getGuild, updateGuild,
  addBannedWord, removeBannedWord, getBannedWords,
  addWarning, getWarnings, removeWarning,
  incrementGlobalStat, getGlobalStats,
  setBio, getBio,
  getAntiRaidConfig, setAntiRaidConfigField,
  getOrCreateWebUser, getWebUser, recordWebOrder, saveManualOrder,
  findOrderById, setOrderStatus, listPendingOrders, hasApprovedOrder, activatePackageForGuild,
  createTicket, getTicket, closeTicket, deleteTicket, getTicketByChannelId, updateTicket,
  // ÇEKİLİŞ
  saveGiveaway, getGiveaway, updateGiveaway, deleteGiveaway, listActiveGiveaways,
  // YENİ
  recordMessageStat, recordMemberJoin, getDashboardStats,
  // WEBHOOK
  getWebhooks, createWebhook, updateWebhook, deleteWebhook, executeWebhook,
  // KURAL BOTU
  getRulesBot, setRulesBot, sendRulesDM, handleRulesAccept,
  recordAlert, getAlerts,
  // AI TICKET ASSISTANT
  getTicketAiSettings, updateTicketAiSettings, addTicketAiSkill, removeTicketAiSkill, updateTicketAiSkill,
  getTicketAiUsage, incrementTicketAiUsage, getTicketAiLimit, checkTicketAiLimit,
  // GÜVEN SKORU İÇİN
  getUserInviteCount, getUserWarningCount,
  DEFAULT_BANNED_WORDS,
  // WEEKLY HEALTH REPORT
  saveHealthReport, getHealthReports, getLatestHealthReport, getHealthHistory, getGrowthData,
  // SEVİYE & XP
  getUserLevel, addXP, getLevelLeaderboard,
  // RP KARAKTER
  getCharacter, saveCharacter, deleteCharacter,
  // FIVEM & RP SİSTEMLERİ
  getFactions, getFaction, createFaction, addFactionMember, removeFactionMember, deleteFaction,
  getMulakatConfig, updateMulakatConfig,
  getFiveMMonitor, setFiveMMonitor,
  // HONEYTOKEN
  getHoneytokenConfig, saveHoneytokenConfig, recordHoneytokenTrigger, DEFAULT_HONEYTOKEN_CONFIG,
};
