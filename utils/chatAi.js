// Aegis open-source build: only the first 98 of 719 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
// ─── BU yesil cizgiler kodun ne yaptıgını gosterir ────────────────────────
const { GoogleGenAI } = require('@google/genai');
const { ChannelType, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { getGuild, updateGuild } = require('./database');
const { getGuildLanguage } = require('./i18n');
const { sendChannelLog } = require('./logger');
const { logEvent } = require('./activityLog');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FALLBACK_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash'
];

// Kullanıcı başına spam / çift mesaj engeli (1 saniye)
const userLastMsgTime = new Map();

/**
 * Kanal aktivite takibi
 */
function recordChannelActivity(channelId) {
  // Aktivite kaydı
}

function startDeadChatWatcher(client) {
  // Dead chat watcher
}

async function handleAiCommandExecution(message, client) {
  if (!message || !message.guild || !message.member) return false;

  const content = message.content.toLowerCase();
  const isMentioned = message.mentions.has(client.user.id);
  const startsWithAegis = /^(aegis|hey aegis|@aegis)/i.test(message.content.trim());

  if (!isMentioned && !startsWithAegis) return false;

  // Botu sunucudan kaldırma komutu
  const isLeaveCommand = /\b(botu kaldır|sunucudan ayrıl|sunucudan çık|ayrıl buradan|leave server|remove bot|leave the server)\b/i.test(content);
  if (isLeaveCommand) {
    const isEn = isEnglishGuild(message.guild);
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && message.author.id !== message.guild.ownerId) {
      const denyMsg = isEn
        ? '❌ You must be an Administrator or the Server Owner to request bot removal.'
        : '❌ Botu sunucudan kaldırma talebi oluşturmak için Yönetici yetkisine veya Sunucu Sahibi olmaya ihtiyacın var.';
      await message.reply({ content: denyMsg, allowedMentions: { repliedUser: true } }).catch(() => { });
      return true;
    }

    const { createLeaveRequest } = require('./leaveVerify');
    const res = await createLeaveRequest(message.guild, message.author, client);
    if (!res.ok) {
      await message.reply({ content: `❌ ${res.error}`, allowedMentions: { repliedUser: true } }).catch(() => { });
      return true;
    }

    const replyMsg = isEn
      ? `🔒 **Security Verification Dispatched:** A 6-digit confirmation code has been sent via DM to the server owner (<@${message.guild.ownerId}>).\n\nTo complete removal, the owner must send this 6-digit code to **my DM**.`
      : `🔒 **Güvenlik Doğrulaması Gönderildi:** Sunucu sahibi (<@${message.guild.ownerId}>) kullanıcısına özel mesajla (DM) 6 haneli onay kodu iletildi.\n\nBotun ayrılması için sunucu sahibinin bu kodu **benim DM kutuma** göndermesi gerekiyor.`;

    await message.reply({ content: replyMsg, allowedMentions: { repliedUser: true } }).catch(() => { });
    return true;
  }

  return false;
}

/**
 * Sunucunun dilini tespit eder (Veritabanı ayarı veya Discord preferredLocale)
 */
function isEnglishGuild(guild) {
  if (!guild) return false;
  const guildLang = getGuildLanguage(guild.id);
  if (guildLang === 'en') return true;
  if (guildLang === 'tr') return false;
  // Discord varsayılan olarak sunucuları en-US başlatır. 
  // Sunucu açıkça 'en' olarak ayarlanmadıysa veya adında Türkçe geçiyorsa Türkçe kabul et:
  const name = (guild.name || '').toLowerCase();
  if (/[çğıöşü]/.test(name) || /\b(turk|türk|turkiye|türkiye|topluluk|sohbet|oyun|rp|destek|sunucu|kulup|ekip)\b/i.test(name)) {
    return false;
  }
  // Varsayılan Aegis dili Türkçedir
  return false;
}

/**
 * Promise timeout sarmalayıcı (API'nin asılı kalmasını önler)
 */
function withTimeout(promise, ms = 7000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI generation timed out')), ms))
  ]);
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "generateContextualReply": async () => null,
  "setupGeneralChatAi": async () => ({ ok: false, error: 'Not included in the open-source build.' }),
  "isEnglishGuild": () => false,
  "handleAiModeration": async () => false,
  "handleAiCommandExecution": async () => false,
  "recordChannelActivity": () => undefined,
  "startDeadChatWatcher": () => undefined,
  "enhanceAiPersona": async () => ({ ok: false, error: 'Not included in the open-source build.' }),
});
