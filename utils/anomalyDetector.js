// Aegis open-source build: only the first 46 of 295 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * 🛡️ AEGIS AI DAVRANIŞ ANOMALİSİ KALKANI (Predictive Anomaly Anti-Nuke)
 *
 * Klasik botların aksine ("10 kanaldan sonra banla"), yöneticilerin tipik
 * davranış alışkanlıklarını, ani işlem patlamalarını (burst rate) ve gece yarısı
 * saatlerindeki olağandışı hareketleri analiz eder.
 *
 * Eşik aşıldığında:
 * 1. Yetkiliyi anında karantinaya alır (tehlikeli rolleri dondurur).
 * 2. Sunucu sahibine ve güvenlik log kanalına 1-tıkla kurtarma butonuyla acil durum alarmı atar.
 * 3. Dashboard radarında canlı anomali skoru üretir.
 */

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { getGuild, updateGuild } = require('./database');
const { sendChannelLog } = require('./logger');

// Sunucu başına ve kullanıcı başına kayan zaman pencereli işlem geçmişi
// guildId -> Map(userId -> [ { type, time, target, points } ])
const actionHistory = new Map();

// Karantinaya alınan kullanıcıların orijinal rolleri: guildId -> Map(userId -> roleIds[])
const quarantineStore = new Map();

// Son anomali olayları logu (Web Dashboard için)
// guildId -> [ { id, timestamp, executorId, executorTag, score, level, reason, status, details } ]
const anomalyLogs = new Map();

const ACTION_POINTS = {
  CHANNEL_DELETE: 35,
  ROLE_DELETE: 35,
  ROLE_PERM_ESCALATION: 40,
  MEMBER_BAN: 25,
  MEMBER_KICK: 20,
  WEBHOOK_CREATE: 20,
  INTEGRATION_ADD: 30,
};

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "recordAuditEvent": () => undefined,
  "resolveQuarantine": async () => ({ ok: false, message: 'Not included in the open-source build.' }),
  "getGuildAnomalyStatus": () => ({}),
});
