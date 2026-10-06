const { PermissionFlagsBits, MessageFlags } = require('discord.js');
/**
 * Sesli Kanal AI Moderasyonu
 * Voice state updates + transcript analysis (local/whisper)
 * Components V2 incident logging
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getGuild, updateGuild } = require('./database');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const MODEL = 'gemini-2.0-flash-exp';

// In-memory buffer for voice activity (guildId -> Map<userId, {messages: [], lastUpdate}>)
const voiceBuffers = new Map();

// Buffer size limits
const MAX_BUFFER_MESSAGES = 50;
const BUFFER_FLUSH_INTERVAL = 30000; // 30 seconds
const ANALYSIS_THRESHOLD = 3; // Analyze after 3 messages

function getVoiceBuffer(guildId) {
  if (!voiceBuffers.has(guildId)) {
    voiceBuffers.set(guildId, new Map());
  }
  return voiceBuffers.get(guildId);
}

function addVoiceMessage(guildId, userId, userTag, content) {
  const buffer = getVoiceBuffer(guildId);
  if (!buffer.has(userId)) {
    buffer.set(userId, { messages: [], lastUpdate: Date.now(), userTag });
  }
  const userBuffer = buffer.get(userId);
  userBuffer.messages.push({ content, timestamp: Date.now() });
  userBuffer.lastUpdate = Date.now();

  // Keep only last N messages
  if (userBuffer.messages.length > MAX_BUFFER_MESSAGES) {
    userBuffer.messages = userBuffer.messages.slice(-MAX_BUFFER_MESSAGES);
  }

  // Check if should analyze
  if (userBuffer.messages.length >= ANALYSIS_THRESHOLD) {
    analyzeVoiceBuffer(guildId, userId);
  }
}

async function analyzeVoiceBuffer(guildId, userId) {
  const buffer = getVoiceBuffer(guildId);
  const userBuffer = buffer.get(userId);
  if (!userBuffer || userBuffer.messages.length < ANALYSIS_THRESHOLD) return;

  const settings = getGuild(guildId);
  if (!settings.voiceModEnabled) return;

  // Combine recent messages
  const text = userBuffer.messages.slice(-10).map(m => m.content).join(' ');
  if (text.length < 20) return; // Too short

  // AI Analysis
  const analysis = await analyzeVoiceText(text, userBuffer.userTag);
  if (!analysis) return;

  // Clear analyzed messages
  userBuffer.messages = userBuffer.messages.slice(-5);

  // If violation detected, log incident
  if (analysis.violation) {
    await logVoiceIncident(guildId, userId, userBuffer.userTag, text, analysis);
  }
}

async function analyzeVoiceText(text, userTag) {
  if (!genAI) return null;

  const prompt = `Sen bir Discord sesli sohbet moderatörüsün. Bu metni analiz et (TÜRKÇE).
SADECE şu JSON formatında döndür:
{
  "violation": true/false,
  "type": "<"kufur"|"taciz"|"nefret"|"spam"|"dolandiiciligi"|"diger">",
  "severity": "<"dusuk"|"orta"|"yuksek"|"kritik">",
  "confidence": <0-100>,
  "explanation": "<kisa aciklama>",
  "action": "<"uyari"|"mute"|"kick"|"ban"|"log">"
}

METİN: "${text}"
KULLANICI: ${userTag}

Kurallar:
- Küfür/argo -> kufur
- Cinsel içerik/taciz -> taciz
- Irkçılık/nefret söylemi -> nefret
- Aynı mesaj tekrarlama -> spam
- Dolandırıcılık/link paylaşma -> dolandiricilik`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('[VoiceMod] AI analysis error:', e.message);
    return null;
  }
}

async function logVoiceIncident(guildId, userId, userTag, transcript, analysis) {
  const settings = getGuild(guildId);
  const logChannelId = settings.voiceModLogChannel;
  if (!logChannelId) return;

  const guild = require('../index').client?.guilds?.cache?.get(guildId);
  if (!guild) return;

  const logChannel = guild.channels.cache.get(logChannelId);
  if (!logChannel) return;

  const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
          SectionBuilder, ThumbnailBuilder, ActionRowBuilder,
          ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

  const severityColor = {
    'dusuk': 0xffaa00,
    'orta': 0xff6600,
    'yuksek': 0xff0000,
    'kritik': 0x8b0000
  }[analysis.severity] || 0x5b7cfa;

  const typeEmoji = {
    'kufur': '🤬',
    'taciz': '🚫',
    'nefret': '⚠️',
    'spam': '🔄',
    'dolandiricilik': '🎣',
    'diger': '❓'
  }[analysis.type] || '❓';

  const actionText = {
    'uyari': '⚠️ Uyarı',
    'mute': '🔇 Mute',
    'kick': '👢 Kick',
    'ban': '🔨 Ban',
    'log': '📝 Sadece Log'
  }[analysis.action] || '📝 Log';

  const container = new ContainerBuilder()
    .setAccentColor(severityColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${typeEmoji} **Sesli Moderasyon: ${analysis.type.toUpperCase()}**\n` +
        `**Kullanıcı:** <@${userId}> (${userTag})\n` +
        `**Şiddet:** ${analysis.severity.toUpperCase()} • **Güven:** %${analysis.confidence}\n` +
        `**Öneri Eylem:** ${actionText}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### 📝 **Transcript (Son 10 mesaj)**\n${transcript.slice(0, 1500)}`
          )
        )
        .setThumbnailAccessory({ url: guild.members.cache.get(userId)?.user?.displayAvatarURL({ size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png' })
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### 🤖 **AI Analizi**\n${analysis.explanation}`)
    )
    .addSeparatorComponents(new SeparatorBuilder());

  // Action buttons for moderators
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`voicemod_mute_${userId}_${guildId}_${Date.now()}`)
      .setLabel('🔇 Mute (10dk)')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`voicemod_warn_${userId}_${guildId}_${Date.now()}`)
      .setLabel('⚠️ Uyarı Ver')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`voicemod_kick_${userId}_${guildId}_${Date.now()}`)
      .setLabel('👢 Kick')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`voicemod_dismiss_${Date.now()}`)
      .setLabel('✅ Kapalı')
      .setStyle(ButtonStyle.Success)
  );
  container.addActionRowComponents(row);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# 🤖 Aegis VoiceMod • Otomatik Sesli Moderasyon')
  );

  try {
    await logChannel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (e) {
    console.error('[VoiceMod] Log send error:', e.message);
  }
}

// Periodic buffer cleanup
setInterval(() => {
  const now = Date.now();
  for (const [guildId, userMap] of voiceBuffers.entries()) {
    for (const [userId, buffer] of userMap.entries()) {
      if (now - buffer.lastUpdate > 300000) { // 5 minutes inactive
        userMap.delete(userId);
      }
    }
    if (userMap.size === 0) {
      voiceBuffers.delete(guildId);
    }
  }
}, 60000);

// Handle voice state updates
function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild;
  const settings = getGuild(guild.id);
  if (!settings.voiceModEnabled) return;

  const userId = newState.id;
  const userTag = newState.user.tag;

  // User joined a voice channel
  if (!oldState.channelId && newState.channelId) {
    addVoiceMessage(guild.id, userId, userTag, `[KATILDI: ${newState.channel.name}]`);
  }
  // User left a voice channel
  else if (oldState.channelId && !newState.channelId) {
    addVoiceMessage(guild.id, userId, userTag, `[AYRILDI: ${oldState.channel.name}]`);
    // Analyze remaining buffer on leave
    analyzeVoiceBuffer(guild.id, userId);
  }
  // User switched channels
  else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    addVoiceMessage(guild.id, userId, userTag, `[KANAL DEĞİŞTİ: ${oldState.channel.name} -> ${newState.channel.name}]`);
  }
}

// Simulated transcript input (for testing / external STT integration)
function addTranscript(guildId, userId, userTag, text) {
  addVoiceMessage(guildId, userId, userTag, text);
}

// Admin commands
async function toggleVoiceMod(guildId, enabled) {
  updateGuild(guildId, { voiceModEnabled: enabled });
  return { success: true, enabled };
}

async function setVoiceModLogChannel(guildId, channelId) {
  updateGuild(guildId, { voiceModLogChannel: channelId });
  return { success: true, channelId };
}


async function handleVoiceModButton(interaction) {
  const { customId, guild, member } = interaction;
  if (!member || !member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return interaction.reply({
      content: '❌ Bu butonları kullanmak için Üyeleri Yönet (Moderate Members) yetkisine sahip olmalısınız.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (customId.startsWith('voicemod_dismiss_')) {
    return interaction.update({
      content: `✅ VoiceMod bildirimi <@${interaction.user.id}> tarafından kapatıldı.`,
      components: [],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const parts = customId.split('_');
  const action = parts[1];
  const targetUserId = parts[2];
  const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

  if (!targetMember && action !== 'dismiss') {
    return interaction.reply({ content: '❌ Hedef kullanıcı sunucuda bulunamadı.', flags: MessageFlags.Ephemeral });
  }

  if (action === 'mute') {
    try {
      await targetMember.timeout(10 * 60 * 1000, `VoiceMod: ${interaction.user.tag} tarafından susturuldu`);
      return interaction.update({
        content: `🔇 <@${targetUserId}> kullanıcısı <@${interaction.user.id}> tarafından 10 dakika susturuldu.`,
        components: [],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (err) {
      return interaction.reply({ content: `❌ Susturulamadı: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  if (action === 'warn') {
    const { addWarning } = require('./database');
    addWarning(guild.id, targetUserId, {
      reason: 'VoiceMod: Sesli ihlal uyarısı',
      moderator: interaction.user.id,
      timestamp: Date.now()
    });
    return interaction.update({
      content: `⚠️ <@${targetUserId}> kullanıcısına <@${interaction.user.id}> tarafından uyarı verildi.`,
      components: [],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (action === 'kick') {
    try {
      if (targetMember.voice?.channel) {
        await targetMember.voice.disconnect(`VoiceMod: ${interaction.user.tag} tarafından sesten atıldı`);
      } else {
        await targetMember.kick(`VoiceMod: ${interaction.user.tag} tarafından atıldı`);
      }
      return interaction.update({
        content: `👢 <@${targetUserId}> kullanıcısına <@${interaction.user.id}> tarafından işlem uygulandı.`,
        components: [],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (err) {
      return interaction.reply({ content: `❌ İşlem uygulanamadı: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }
}

module.exports = {
  handleVoiceStateUpdate,
  addTranscript,
  toggleVoiceMod,
  setVoiceModLogChannel,
  addVoiceMessage,
  analyzeVoiceBuffer,
  handleVoiceModButton,
};