// Aegis open-source build: only the first 63 of 285 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * 📈 AEGIS AI GROWTH ADVISOR & SAĞLIK KOÇU
 *
 * Sunucu telemetrisini (üye akışı, kanal doluluğu, ölü kanallar, yetki dengesi)
 * toplayıp Google Gemini AI ile derinlemesine analiz eden ve sunucuyu büyütmek
 * için net stratejik adımlar üreten yeni nesil danışman.
 */

const { GoogleGenAI } = require('@google/genai');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const { getGuild, updateGuild } = require('./database');
const { getGuildLanguage } = require('./i18n');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
];

/**
 * Sunucu telemetrisini toplar
 */
function gatherGuildTelemetry(guild) {
  const memberCount = guild.memberCount || 0;
  const botCount = guild.members.cache.filter(m => m.user.bot).size;
  const humanCount = Math.max(1, memberCount - botCount);

  const channels = Array.from(guild.channels.cache.values());
  const textChannels = channels.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement);
  const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice);

  const roles = Array.from(guild.roles.cache.values());
  const adminRoles = roles.filter(r => r.permissions.has('Administrator') && r.id !== guild.id);

  // Olası inaktif / ölü kanallar (son 50 mesajı eski olan veya genel aktivitesi az kanallar)
  const ghostChannels = textChannels
    .filter(c => c.name.includes('bot-') || c.name.includes('komut') || c.name.includes('spam') || c.name.includes('test'))
    .slice(0, 5)
    .map(c => ({ id: c.id, name: c.name }));

  return {
    guildName: guild.name,
    memberCount,
    humanCount,
    botCount,
    botRatio: Math.round((botCount / Math.max(1, memberCount)) * 100),
    textChannelCount: textChannels.length,
    voiceChannelCount: voiceChannels.length,
    roleCount: roles.length,
    adminRoleCount: adminRoles.length,
    ghostChannels,
  };
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "gatherGuildTelemetry": async () => ({}),
  "generateGrowthReport": async () => ({ error: 'Not included in the open-source build.' }),
  "buildGrowthReportContainer": () => null,
});
