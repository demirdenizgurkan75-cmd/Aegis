// Aegis open-source build: only the first 29 of 146 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * SIKI YETKİ KORUMASI (Strict permission guard)
 * Anti-Nuke eşik bekler (10 sn'de 5 kanal silme gibi). Bu koruma tek bir tehlikeli hamlede devreye girer:
 *   - bir role (veya yeni role) yönetici/yönetim yetkisi eklenirse → değişiklik geri alınır
 *   - birine yönetim yetkili bir rol verilirse → rol geri alınır
 *   - sunucunun özel davet adresi (vanity URL) değiştirilirse
 *   - toplu üye temizliği (prune) yapılırsa
 * Hamleyi yapanın yönetim yetkili rolleri alınır, sunucu sahibine DM ve log kanalına rapor gider.
 * Sunucu sahibi, Aegis, Anti-Nuke beyaz listesi ve doğrulanmış yöneticiler muaftır.
 * Ayar: guild.antiNukeConfig.strictGuard (varsayılan kapalı; /antiraid panelindeki düğme). Anti-Nuke kapalıysa çalışmaz.
 */
const { AuditLogEvent, PermissionFlagsBits, PermissionsBitField, MessageFlags } = require('discord.js');
const { getNukeConfig, saveNukeConfig, isWhitelisted } = require('../utils/antiNuke');
const { isVerified } = require('../utils/verifiedAdmins');
const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { tx } = require('./util');

const DANGEROUS = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.MentionEveryone,
];
const MASK = DANGEROUS.reduce((a, p) => a | p, 0n);
const big = (v) => { try { return BigInt(v ?? 0); } catch (_) { return 0n; } };
const permNames = (bits) => new PermissionsBitField(bits).toArray().join(', ');
const roleIsDangerous = (role) => !!role && !role.managed && (role.permissions.bitfield & MASK) !== 0n;

function isOn(gid) { const c = getNukeConfig(gid); return !!(c.enabled && c.strictGuard); }
function setOn(gid, on) { const c = getNukeConfig(gid); c.strictGuard = !!on; saveNukeConfig(gid, c); return c; }

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "onAuditLog": () => undefined,
  "classify": () => undefined,
  "strip": () => undefined,
  "isOn": () => false,
  "setOn": () => undefined,
  "handle": (i) => require('../utils/ossStub').unavailable(i),
  "MASK": 0n,
});
