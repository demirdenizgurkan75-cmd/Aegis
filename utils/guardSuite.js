// Aegis open-source build: only the first 54 of 240 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
// ─── utils/guardSuite.js ────────────────────────────────────────────────────
// Aegis Sunucu Koruma Modülleri:
// 1. Şüpheli Hesap Karantinası (Yeni açılan hesapları tecrit eder)
// 2. Yetkili Çift Onay Koruması (Hesap çalınmalarına karşı çift onay)
// 3. Sahte Link & Nitro Kalkanı (Dolandırıcı ve sahte Nitro linklerini imha eder)
// 4. İzinsiz Webhook Koruması (İzinsiz açılan webhook'ları yok eder)

const { AuditLogEvent, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { readDB, writeDB } = require('./database');

const DEFAULT_GUARD_CONFIG = {
  karantina: {
    enabled: false,
    minDays: 3,
    roleId: null,
  },
  ciftOnay: {
    enabled: false,
  },
  linkKorumasi: {
    enabled: true,
    autoTimeout: true,
  },
  webhookKorumasi: {
    enabled: true,
    autoDelete: true,
  },
};

// ─── SAHTE NİTRO & DOLANDIRICI LİNK KALIPLARI ──────────────────────────────
const SCAM_LINK_REGEX = [
  /(?:https?:\/\/)?(?:www\.)?(?:discorcl|dlscord|discoord|discorb|discort|discrod|discord-app|discord-gift|discord-nitro|discord-event|discorde|discordi|nitro-drop|free-nitro|steam-community-nitro|airdrop-discord)\.[a-z0-9.-]+/i,
  /(?:https?:\/\/)?(?:www\.)?(?:steancommunity|steamcomminuty|steamcommuniity|steamcommunity-trade|steam-gift-event)\.[a-z0-9.-]+/i,
  /(?:discord\.gift|discordapp\.com\/gifts)\/[a-zA-Z0-9_-]{10,}/i,
  /(?:ipfs\.io\/ipfs|gateway\.pinata\.cloud\/ipfs)\/[a-zA-Z0-9]+/i,
];

function getGuardConfig(guildId) {
  const db = readDB();
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId].guardSuite) {
    db[guildId].guardSuite = JSON.parse(JSON.stringify(DEFAULT_GUARD_CONFIG));
    writeDB(db);
  }
  return db[guildId].guardSuite;
}

function updateGuardConfig(guildId, newConfig) {
  const db = readDB();
  if (!db[guildId]) db[guildId] = {};
  db[guildId].guardSuite = newConfig;
  writeDB(db);
  return db[guildId].guardSuite;
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "getGuardConfig": () => ({}),
  "updateGuardConfig": () => undefined,
  "checkMessageLinks": async () => false,
  "checkWebhookCreated": () => undefined,
  "sweepWebhooks": () => undefined,
  "checkNewMember": async () => false,
  "logGuardEvent": () => undefined,
});
