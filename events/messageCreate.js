const channelQueues = new Map();
// Free sunucularda sohbet yapay zekâsı bilgi notunun kanal başına son gönderilme zamanı
const aiUpsellAt = new Map();
const { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuild, getAntiRaidConfig, incrementGlobalStat, recordMessageStat, getTicketByChannelId, checkTicketAiLimit, incrementTicketAiUsage } = require('../utils/database');
const { recordAndCheck } = require('../utils/antiRaidTracker');
const { timeoutRaider } = require('../utils/raidAction');
const { analyzeTone } = require('../utils/aiModeration');
const { checkLinks } = require('../utils/linkSandbox');
const { createTranslator, getGuildLanguage } = require('../utils/i18n');
const { generateResponse, generateAutoReply, checkTicketAiLimit: checkAiLimit, incrementTicketAiUsage: incAiUsage } = require('../utils/ticketAi');
const { checkHoneypot } = require('../utils/antiNuke');
const { recordSignal, SIGNALS } = require('../utils/killChain');

// ─── Message Formatter ──────────────────────────────────────────────────────
// Her satırın başına '> ' ekler (Discord quote style)
function q(text) {
  if (!text) return '';
  return text.split('\n').map(line => '> ' + line).join('\n');
}

// Invite link regex
const inviteRegex = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/\w+/gi;
// URL regex — link sandbox için
const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

async function sendLog(guild, client, title, description, color = 0xff5555, fields = []) {
  const logSettings = getGuild(guild.id);
  if (!logSettings.logChannel) return;

  const logChannel = guild.channels.cache.get(logSettings.logChannel);
  if (!logChannel) return;

  const { getGuildLanguage } = require('../utils/i18n');
  const { translateText, translateTitle } = require('../utils/logger');
  const isEn = getGuildLanguage(guild.id) === 'en';

  if (isEn) {
    title = translateTitle(title);
    description = translateText(description);
    if (fields && fields.length) {
      fields = fields.map(f => ({
        ...f,
        name: translateText(f.name)
          .replace(/^Kullanıcı ID$/i, 'User ID')
          .replace(/^Kanal ID$/i, 'Channel ID')
          .replace(/^İhlal Türü$/i, 'Violation Type')
          .replace(/^Tarih$/i, 'Date'),
        value: translateText(f.value),
      }));
    }
  }

  const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
  const c = new ContainerBuilder().setAccentColor(color);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(description));
  if (fields.length) {
    c.addSeparatorComponents(new SeparatorBuilder());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(fields.map(f => `**${f.name}:** ${f.value}`).join('\n')));
  }
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Aegis Security'));
  await logChannel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // ─── OWNER-ONLY PREFIX COMMANDS (a.help owner, a.siparis-*, a.restart, etc.) ───
    // Check BEFORE guild check so it works in DMs too
    // Bot sahibine özel 'a.' komutları ayrı, herkese açık olmayan bir modülde tutulur.
    // Dosya yoksa (açık kaynak sürüm) bu adım sessizce atlanır.
    if (message.content.startsWith('a.') && !message.author.bot) {
      try {
        const ownerCommands = require('../commands/owner-commands');
        if (await ownerCommands.handle(message, client)) return;
      } catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND') console.error('[owner-commands]', e.message);
      }
    }

    // DM Token Leak Warning & Leave Verification Code
    if (!message.guild) {
      if (!message.author.bot) {
        // ─── BOT KALDIRMA GÜVENLİK ONAY KODU KONTROLÜ (DM) ───
        try {
          const { handleLeaveVerifyDm } = require('../utils/leaveVerify');
          const leaveHandled = await handleLeaveVerifyDm(message, client);
          if (leaveHandled) return;
        } catch (leaveErr) {
          console.error('[LeaveVerify DM error]:', leaveErr.message);
        }
        // ─── kimch.d ÖZEL ASİSTANI: yalnızca kurucunun DM'lerine cevap verir ───
        try {
          const { handleDm } = require('../features/ownerAssistant');
          if (await handleDm(message)) return;
        } catch (assistErr) {
          if (assistErr.code !== 'MODULE_NOT_FOUND') console.error('[owner-assistant DM error]:', assistErr.message);
        }
        // ─── ÖNERİ ÖDÜLÜ: ekran görüntüsü yapay zekâ onayıyla 30 gün Ballad ───
        try {
          const { handleReferralDm } = require('../utils/referralDm');
          if (await handleReferralDm(message, client)) return;
        } catch (refErr) {
          console.error('[ReferralDm error]:', refErr.message);
        }
        try {
          const { scanContent } = require('../utils/tokenSanitizer');
          const leak = scanContent(message.content);
          if (leak) {
            await message.reply(
              `⚠️ **ACİL GÜVENLİK UYARISI:** Gönderdiğin özel mesajda Discord API Token'ı tespit edildi!\n` +
              `Botlara veya şahıslara **asla** token göndermeyiniz. Token'ınız şifreniz gibidir.\n` +
              `Güvenliğiniz için bu token'ı Discord Developer Portal (veya hesap şifrenizi değiştirerek) **derhal sıfırlayınız!**`
            ).catch(() => {});
          }
        } catch (e) {}
      }
      return;
    }

    if (message.author.id === client.user.id) return;

    // ─── AEGIS TOKEN SHIELD & USER-APP THREAT INTERCEPTOR ───
    try {
      const { inspectMessageForTokens, handleTokenLeak, checkUserAppThreat } = require('../utils/tokenSanitizer');
      const tokenLeak = await inspectMessageForTokens(message);
      if (tokenLeak) {
        await handleTokenLeak(message, client, tokenLeak);
        return;
      }

      const userAppThreat = await checkUserAppThreat(message, client);
      if (userAppThreat) {
        return;
      }
    } catch (tokenErr) {
      console.error('[TokenSanitizer] Kontrol hatası:', tokenErr);
    }

    // Honeytoken: Tuzak kanal kontrolü
    const { checkHoneyChannelMessage } = require('../utils/honeytoken');
    await checkHoneyChannelMessage(message, client);

    // ─── Aegis Sahte Link & Nitro Kalkanı ───
    try {
      const { checkMessageLinks } = require('../utils/guardSuite');
      const isScam = await checkMessageLinks(message);
      if (isScam) return;
    } catch (linkErr) {
      console.error('[guardSuite] Link kontrol hatası:', linkErr);
    }

    const settings = getGuild(message.guild.id);
    const guildLang = getGuildLanguage(message.guild.id);
    const isEn = guildLang === "en";
    if (!settings) return;
if (!settings.aiChatEnabled) return;

    // ─── PREFIX COMMAND HANDLER (a. prefix - works in all languages) ───
    const t = createTranslator(message.guild.id);
    const prefix = 'a.';
    if (message.content.startsWith(prefix) && !message.author.bot) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const cmdName = args.shift().toLowerCase();

      const prefixCommands = {
        'bot-kaldır': {
          execute: async () => {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && message.author.id !== message.guild.ownerId) {
              return message.reply(isEn ? '❌ Administrator permissions or Server Owner required!' : '❌ Bu işlem için Yönetici yetkisi veya Sunucu Sahibi olmanız gerekir!').catch(() => {});
            }
            const { createLeaveRequest } = require('../utils/leaveVerify');
            const res = await createLeaveRequest(message.guild, message.author, client);
            if (!res.ok) return message.reply(`❌ ${res.error}`).catch(() => {});
            return message.reply(
              isEn
                ? `🔒 **Security Verification Dispatched:** A 6-digit confirmation code has been sent via DM to the server owner (<@${message.guild.ownerId}>).\n\nThe owner must send this 6-digit code to **my DM** to authorize server removal.`
                : `🔒 **Güvenlik Doğrulaması Gönderildi:** Sunucu sahibi (<@${message.guild.ownerId}>) kullanıcısına DM üzerinden 6 haneli onay kodu iletildi.\n\nBotun ayrılması için sunucu sahibinin bu kodu **Aegis'in DM kutusuna** yazması gerekiyor.`
            ).catch(() => {});
          }
        },
        ayrıl: {
          execute: async () => {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && message.author.id !== message.guild.ownerId) {
              return message.reply(isEn ? '❌ Administrator permissions or Server Owner required!' : '❌ Bu işlem için Yönetici yetkisi veya Sunucu Sahibi olmanız gerekir!').catch(() => {});
            }
            const { createLeaveRequest } = require('../utils/leaveVerify');
            const res = await createLeaveRequest(message.guild, message.author, client);
            if (!res.ok) return message.reply(`❌ ${res.error}`).catch(() => {});
            return message.reply(
              isEn
                ? `🔒 **Security Verification Dispatched:** A 6-digit confirmation code has been sent via DM to the server owner (<@${message.guild.ownerId}>).\n\nThe owner must send this 6-digit code to **my DM** to authorize server removal.`
                : `🔒 **Güvenlik Doğrulaması Gönderildi:** Sunucu sahibi (<@${message.guild.ownerId}>) kullanıcısına DM üzerinden 6 haneli onay kodu iletildi.\n\nBotun ayrılması için sunucu sahibinin bu kodu **Aegis'in DM kutusuna** yazması gerekiyor.`
            ).catch(() => {});
          }
        },
        leave: {
          execute: async () => {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && message.author.id !== message.guild.ownerId) {
              return message.reply(isEn ? '❌ Administrator permissions or Server Owner required!' : '❌ Bu işlem için Yönetici yetkisi veya Sunucu Sahibi olmanız gerekir!').catch(() => {});
            }
            const { createLeaveRequest } = require('../utils/leaveVerify');
            const res = await createLeaveRequest(message.guild, message.author, client);
            if (!res.ok) return message.reply(`❌ ${res.error}`).catch(() => {});
            return message.reply(
              isEn
                ? `🔒 **Security Verification Dispatched:** A 6-digit confirmation code has been sent via DM to the server owner (<@${message.guild.ownerId}>).\n\nThe owner must send this 6-digit code to **my DM** to authorize server removal.`
                : `🔒 **Güvenlik Doğrulaması Gönderildi:** Sunucu sahibi (<@${message.guild.ownerId}>) kullanıcısına DM üzerinden 6 haneli onay kodu iletildi.\n\nBotun ayrılması için sunucu sahibinin bu kodu **Aegis'in DM kutusuna** yazması gerekiyor.`
            ).catch(() => {});
          }
        },
        help: { execute: async () => { await handlePrefixHelp(message, t); }},
        muzik: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const attachment = message.attachments.find(a => a.contentType?.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(a.name));
            const query = args.join(" ");
            if (!query && !attachment) {
              const helpContainer = musicManager.buildMessageContainer(
                "❓ Şarkı veya Dosya Belirtin",
                "Bir şarkı adı yazmalı veya bir MP3 dosyası yüklemelisin!\nÖrnek: `a.muzik Duman Seni Kendime Sakladim`",
                0xffa500
              );
              return message.reply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 });
            }
            return musicManager.play(message, attachment || query);
          }
        },
        play: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const attachment = message.attachments.find(a => a.contentType?.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(a.name));
            const query = args.join(" ");
            if (!query && !attachment) {
              const helpContainer = musicManager.buildMessageContainer(
                "❓ Şarkı veya Dosya Belirtin",
                "Bir şarkı adı yazmalı veya bir MP3 dosyası yüklemelisin!\nÖrnek: `a.muzik Duman Seni Kendime Sakladim`",
                0xffa500
              );
              return message.reply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 });
            }
            return musicManager.play(message, attachment || query);
          }
        },
        oynat: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const attachment = message.attachments.find(a => a.contentType?.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(a.name));
            const query = args.join(" ");
            if (!query && !attachment) {
              const helpContainer = musicManager.buildMessageContainer(
                "❓ Şarkı veya Dosya Belirtin",
                "Bir şarkı adı yazmalı veya bir MP3 dosyası yüklemelisin!\nÖrnek: `a.muzik Duman Seni Kendime Sakladim`",
                0xffa500
              );
              return message.reply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 });
            }
            return musicManager.play(message, attachment || query);
          }
        },
        durdur: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const res = musicManager.stop(message.guild.id);
            return message.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
          }
        },
        stop: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const res = musicManager.stop(message.guild.id);
            return message.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
          }
        },
        gec: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const res = musicManager.skip(message.guild.id);
            return message.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
          }
        },
        skip: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const res = musicManager.skip(message.guild.id);
            return message.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
          }
        },
        duraklat: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const res = musicManager.pause(message.guild.id);
            return message.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
          }
        },
        pause: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const res = musicManager.pause(message.guild.id);
            return message.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
          }
        },
        devam: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const res = musicManager.resume(message.guild.id);
            return message.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
          }
        },
        resume: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const res = musicManager.resume(message.guild.id);
            return message.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
          }
        },
        kuyruk: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const res = musicManager.getQueue(message.guild.id);
            return message.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
          }
        },
        queue: {
          execute: async () => {
            const musicManager = require("../utils/musicManager");
            const res = musicManager.getQueue(message.guild.id);
            return message.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
          }
        },
      };

      const cmd = prefixCommands[cmdName];
      if (cmd) {
        try {
          await cmd.execute(message);
        } catch (err) {
          console.error(`Prefix command ${cmdName} error:`, err);
          await message.reply(q(t('common.error'))).catch(() => {});
        }
        return; // Stop processing after prefix command
      }
    }

    // ─── AEGIS AI GENEL SOHBET & DOĞAL MODERASYON ARKADAŞI ─────────────────
    if (!message.author.bot && message.guild) {
      const { handleAiModeration, handleAiCommandExecution, generateContextualReply, recordChannelActivity } = require('../utils/chatAi');
      recordChannelActivity(message.channel.id);

      const rawName = message.channel.name || '';
      // Unicode italic/bold fontları ve emojileri temizle (Örn: 𝘎𝘦𝘯𝘦𝘳𝘢𝘭🍂 -> general)
      const normName = rawName.normalize('NFKD').replace(/[^\w\s-]/gi, '').trim().toLowerCase();
      
      const isNamedAiChannel = /aegis[-_]?(chat|sohbet)/i.test(normName);
      const isGeneralChannel = /^(general|genel|sohbet|chat|main)$/i.test(normName);
      const isConfiguredAiChannel = Boolean(settings.aiChatChannelId && message.channel.id === settings.aiChatChannelId);
      
      // Kanal ya ayarlı AI kanalı, ya aegis-chat ya da genel sohbet kanalı
      const isChatChannel = isNamedAiChannel || isConfiguredAiChannel || isGeneralChannel;

      const isMentioned = message.mentions.has(client.user.id);
      
      let isReplyToBot = false;
      if (message.reference && message.reference.messageId) {
        try {
          const refMsg = message.channel.messages.cache.get(message.reference.messageId)
            || await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
          if (refMsg && refMsg.author.id === client.user.id) {
            isReplyToBot = true;
          }
        } catch (_) {}
      }

      const mentionsAegis = /\baegis\b/i.test(message.content);

      // 1. Önce Doğal Dille AI Moderasyon & Komut Çalıştırma Kontrolü
      if (isMentioned || mentionsAegis) {
        try {
          const modHandled = await handleAiModeration(message, client);
          if (modHandled) return;

          const cmdHandled = await handleAiCommandExecution(message, client);
          if (cmdHandled) return;
        } catch (err) {
          console.error('[handleAiMod/Cmd Error]:', err.message);
        }
      }

      // Başka bir kullanıcıya atılan saf pingleri (Örn: Sadece @ZayMc etiketini) bot yanıtlamasın
      const isPureOtherUserPing = /^<@!?\d+>$/.test(message.content.trim()) && !isMentioned;
      if (isPureOtherUserPing) return;

      // ─── AEGIS KANAL İZİNLERİ & FİLTRESİ (Dashboard Ayarları) ───
      const ignoredChannels = Array.isArray(settings.aiChatIgnoredChannels) ? settings.aiChatIgnoredChannels : [];
      const allowedChannels = Array.isArray(settings.aiChatAllowedChannels) ? settings.aiChatAllowedChannels : [];
      const chatMode = settings.aiChatMode || 'single';

      // 1. Yasaklı kanal kontrolü (Blacklist) -> Bot bu kanalda ASLA konuşmaz
      if (ignoredChannels.includes(message.channel.id)) {
        return;
      }

      // 2. Mod bazlı kanal izni
      let isAllowedByChannelRule = false;
      if (chatMode === 'whitelist') {
        isAllowedByChannelRule = allowedChannels.includes(message.channel.id);
      } else if (chatMode === 'blacklist') {
        isAllowedByChannelRule = true; // Yasaklı kanallar zaten yukarıda elendi
      } else {
        isAllowedByChannelRule = isChatChannel;
      }

      // 2. Genel Sohbet Tetikleyici
      const shouldTrigger = (chatMode === 'whitelist' ? isAllowedByChannelRule : (isAllowedByChannelRule || isMentioned || isReplyToBot || mentionsAegis));

      // Komut çağrılarını es geç
      const isCommand = message.content.startsWith('/') || message.content.startsWith('a.') || message.content.startsWith('!') || message.content.startsWith('.');

      const hasAttachments = message.attachments && message.attachments.size > 0;

      // AI sohbet her pakette var ama sınırlı: Free günde 30 yanıt ve yalnızca etiketlenince / bota yanıt verilince;
      // Verse 300, Ballad 1.000, Epic sınırsız. Hak dolunca kanal başına günde bir kez bilgi notu bırakılır.
      if (shouldTrigger && !isCommand && (message.content.trim().length > 0 || hasAttachments)) {
        const tier = require('../utils/tier');
        const freePlan = tier.isFree(message.guild.id);
        if (freePlan && !isMentioned && !isReplyToBot) return;
        const quota = tier.useChatQuota(message.guild.id);
        if (!quota.allowed) {
          const key = `${message.channel.id}:${new Date().toISOString().slice(0, 10)}`;
          if (!aiUpsellAt.has(key) && (isMentioned || isReplyToBot)) {
            aiUpsellAt.set(key, Date.now());
            const en = guildLang === 'en';
            await message.reply({
              content: en
                ? `-# Today's AI chat limit for this server is used up (${quota.limit}/day). It resets tomorrow; higher plans get more: https://betterwithaegis.com/en/pro?ref=ai-limit`
                : `-# Bu sunucunun bugünkü AI sohbet hakkı doldu (günde ${quota.limit}). Yarın yenilenir; üst paketlerde daha fazlası var: https://betterwithaegis.com/pro?ref=ai-limit`,
              allowedMentions: { repliedUser: false },
            }).catch(() => {});
          }
          return;
        }
      }

      if (shouldTrigger && !isCommand && (message.content.trim().length > 0 || hasAttachments)) {
        // Çoklu mesaj karışıklığını önlemek için kanal bazlı sıralı işleme kuyruğu
        const channelKey = message.channel.id;
        const prevTask = channelQueues.get(channelKey) || Promise.resolve();
        const nextTask = prevTask.then(async () => {
          try {
            console.log(`[AiChat] Processing message from ${message.author.username} in #${rawName}: "${message.content.slice(0, 50)}"`);
            const reply = await generateContextualReply(message.guild, message.channel, message, client);
            if (reply) {
              console.log(`[AiChat] Replying to ${message.author.username}: "${reply.slice(0, 50)}"`);
              // repliedUser: true sayesinde Discord spesifik kişiyi etiketleyerek yanıtlar
              await message.reply({ content: reply, allowedMentions: { repliedUser: true } }).catch(async () => {
                await message.channel.send({ content: reply }).catch((e) => console.error('[AiChat Send Error]:', e.message));
              });
            }
          } catch (err) {
            console.error('[AiChat Error]:', err.message);
          }
        }).catch(err => console.error('[ChannelQueue Error]:', err.message));

        channelQueues.set(channelKey, nextTask);
      }
    }

    // ─── ÖZEL KOMUTLAR (sunucu sahibi tanımlı a.komut) ─────────────────────
    if (settings.customCommands && message.content.startsWith('a.') && !message.author.bot) {
      const trigger = message.content.slice(2).split(/\s+/)[0].toLowerCase();
      const yanit = settings.customCommands[trigger];
      if (typeof yanit === 'string') {
        const dolu = yanit
          .replace(/{kullanici}/g, message.author.username)
          .replace(/{sunucu}/g, message.guild.name);
        await message.reply(q(dolu)).catch(() => {});
      }
    }

    // ─── ETİKET MODERASYON KOMUTLARI ────────────────────
    if (message.mentions.has(client.user.id) && !message.author.bot) {
        const lower = message.content.toLowerCase();
        if (lower.includes('kick') || lower.includes('ban')) {
            const words = message.content.split(/\s+/);
            const cmdIndex = words.findIndex(w => /kick|ban/i.test(w));
            if (cmdIndex !== -1 && words.length > cmdIndex + 1) {
                const targetToken = words.slice(cmdIndex + 1).join(' ');
                // Try to resolve a mention first
                const idMatch = targetToken.match(/<@!?(\d+)>/);
                let targetMember = null;
                if (idMatch) {
                    const targetId = idMatch[1];
                    targetMember = await message.guild.members.fetch(targetId).catch(() => null);
                }
                // If not a mention, attempt to find by username or nickname (case‑insensitive)
                if (!targetMember) {
                    const search = targetToken.toLowerCase();
                    targetMember = message.guild.members.cache.find(m =>
                        m.user.username.toLowerCase() === search ||
                        (m.nickname && m.nickname.toLowerCase() === search) ||
                        m.user.username.toLowerCase().includes(search) ||
                        (m.nickname && m.nickname.toLowerCase().includes(search))
                    ) || null;
                }
                if (!targetMember) {
                    return message.reply('❌ Hedef üye bulunamadı veya geçersiz.').catch(() => {});
                }
                const perm = lower.includes('kick') ? PermissionFlagsBits.KickMembers : PermissionFlagsBits.BanMembers;
                if (!message.member.permissions.has(perm)) {
                    return message.reply('❌ Bu işlemi yapmak için gerekli izinlere sahip değilsin.').catch(() => {});
                }
                // Prevent targeting administrators
                if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
                    return message.reply('❌ Yönetici üyeler bu komutla hedef alınamaz.').catch(() => {});
                }
                if (targetMember.roles.highest.position >= message.member.roles.highest.position) {
                    return message.reply('❌ Hedef üye senin rolünden daha yüksek veya eşit.').catch(() => {});
                }
                if (lower.includes('kick')) {
                    const kdm = await require('../features/punishDm').sendPunishDm(message.guild, targetMember.user, 'kick', 'Mention moderation command');
                    await targetMember.kick('Mention moderation command').catch(() => kdm?.undo());
                    await message.reply(`✅ ${targetMember.user.tag} kicklendi.`).catch(() => {});
                } else {
                    const bdm = await require('../features/punishDm').sendPunishDm(message.guild, targetMember.user, 'ban', 'Mention moderation command');
                    await targetMember.ban({ reason: 'Mention moderation command' }).catch(() => bdm?.undo());
                    await message.reply(`✅ ${targetMember.user.tag} banlandı.`).catch(() => {});
                }
                return;
            }
        }
    }


    // ─── MESAJ İSTATİSTİĞİ KAYDET ──────────────────────────────────────────
    try {
      recordMessageStat(message.guild.id, message.channel.id);
    } catch { /* sessizce devam */ }

    // ─── KILL CHAIN SIGNAL RECORDING ────────────────────────────────────────
    if (!message.author.bot) {
      const userId = message.author.id;
      const content = message.content.toLowerCase();

      // İlk mesaj kontrolü
      if (!global._firstMessageSeen) global._firstMessageSeen = new Map();
      if (!global._firstMessageSeen.has(userId)) {
        global._firstMessageSeen.set(userId, Date.now());
        recordSignal(userId, 'no_first_message');
      }

      // DM gönderimi (private message)
      if (message.channel.isDMBased()) {
        recordSignal(userId, 'dm_send');
      }

      // Phishing/Scam link tespiti (link sandbox entegrasyonu)
      if (content.includes('discord.gg') || content.includes('nitro') || content.includes('free') || content.includes('giveaway')) {
        // CheckLinks fonksiyonu zaten çağrılıyor, sonucuna göre sinyal
        // Burada basit pattern
        if (content.includes('discord.gg') && !content.includes(message.guild?.id)) {
          recordSignal(userId, 'invite_link_share');
        }
      }

      // URL paylaşımı
      if (urlRegex.test(message.content)) {
        recordSignal(userId, 'external_link_share');
      }
    }

    // ─── ANTI-NUKE HONEYPOT CHECK (botlar gizli kanala yazarsa ban) ───────
    try {
      await checkHoneypot(message.guild, client, message);
    } catch { /* sessizce devam */ }

    // ─── ANTİ-RAİD ─────────────────────────────────────────────────────────
    if (settings.antiRaid) {
      const cfg = getAntiRaidConfig(message.guild.id);
      const spamEsigiAsildi = recordAndCheck(
        message.guild.id,
        message.author.id,
        'messageSpam',
        cfg.messageSpam.threshold,
        cfg.messageSpam.windowSec * 1000
      );
      if (spamEsigiAsildi) {
        await message.delete().catch(() => {});
        await timeoutRaider(
          message.guild,
          client,
          message.author.id,
          `Anti-Raid: Kısa sürede çok fazla mesaj gönderildi (${message.author.bot ? 'bot' : 'kullanıcı'} spam şüphesi)`,
          cfg.messageSpam.timeoutSec,
          settings.banKickLogChannel
        );
        return;
      }
    }

    if (message.author.bot) return;

    // ─── 1. ANTİ-DAVETİYE ───────────────────────────────────────────────────
    if (settings.antiInvite && inviteRegex.test(message.content)) {
      const isStaff = message.member?.permissions.has(PermissionFlagsBits.ManageMessages);
      if (!isStaff) {
        await message.delete().catch(() => {});
        incrementGlobalStat('blockedThreats');

        const warnMsg = await message.channel.send({
          content: isEn ? `🚫 <@${message.author.id}>, sharing invite links is prohibited on this server!` : `🚫 <@${message.author.id}>, bu sunucuda davet linki paylaşmak yasaktır!`, 
        }).catch(() => {});

        setTimeout(() => warnMsg?.delete().catch(() => {}), 5000);

        await sendLog(
          message.guild,
          client,
          '🚫 Davet Linki Engellendi',
          `**Kullanıcı:** <@${message.author.id}> (${message.author.tag})\n**Kanal:** <#${message.channel.id}>\n**Mesaj:** \`\`\`${message.content.substring(0, 500)}\`\`\``,
          0xff5555,
          [
            { name: 'Kullanıcı ID', value: message.author.id, inline: true },
            { name: 'Kanal', value: `<#${message.channel.id}>`, inline: true },
          ]
        );
        return;
      }
    }

    // ─── 2. LINK SANDBOX ─────────────────────────────────────────────────────
    const hasUrl = urlRegex.test(message.content);
    urlRegex.lastIndex = 0;

    if (settings.linkSandbox && hasUrl) {
      const isStaff = message.member?.permissions.has(PermissionFlagsBits.ManageMessages);
      if (!isStaff) {
        try {
          const linkResult = await checkLinks(message.content);
          if (!linkResult.safe && linkResult.threats.length > 0) {
            // Kill chain signal: phishing/malware link
            recordSignal(message.author.id, 'phishing_link', { guildId: message.guild.id, threats: linkResult.threats.map(t => t.url) });

            await message.delete().catch(() => {});
            incrementGlobalStat('blockedThreats');

            const threatList = linkResult.threats.map(t => `• \`${t.url.slice(0, 60)}...\`\n  ${t.reason}`).join('\n');
            const warnMsg = await message.channel.send({
              content: isEn ? `🔗 <@${message.author.id}>, the link you posted was flagged as **malicious or suspicious** and removed!` : `🔗 <@${message.author.id}>, paylaştığın link **zararlı veya şüpheli** olarak tespit edildi ve silindi!`, 
            }).catch(() => {});
            setTimeout(() => warnMsg?.delete().catch(() => {}), 8000);

            await sendLog(
              message.guild,
              client,
              '🔗 Zararlı Link Engellendi',
              `**Kullanıcı:** <@${message.author.id}> (${message.author.tag})\n**Kanal:** <#${message.channel.id}>\n\n**Tespit Edilen Tehditler:**\n${threatList}`,
              0xff3300,
              [
                { name: 'Kontrol Edilen Link', value: String(linkResult.checkedCount), inline: true },
                { name: 'Tehdit Sayısı', value: String(linkResult.threats.length), inline: true },
              ]
            );
            return;
          }
        } catch (linkErr) {
          console.warn('⚠️ Link sandbox hatası:', linkErr.message);
        }
      }
    }

    // ─── 3. AUTOMOD ─────────────────────────────────────────────────────────
    if (settings.autoMod) {
      const isStaff = message.member?.permissions.has(PermissionFlagsBits.ManageMessages);

      if (!isStaff) {
        const msgLower = message.content.toLocaleLowerCase('tr-TR');
        const words = msgLower.split(/[^\p{L}0-9']+/gu).filter(Boolean);

        let foundWord = null;
        if (settings.bannedWords && settings.bannedWords.length > 0) {
          foundWord = settings.bannedWords.find(bw => {
            const bwLower = bw.toLocaleLowerCase('tr-TR');
            return bwLower.includes(' ') ? msgLower.includes(bwLower) : words.includes(bwLower);
          });
        }
        
        // Sadece kelime listesi kullanmak bypass edilebilir. 
        // Kullanıcı 'Gerçek bir AI kullan' dediği için, eğer aiModeration açıksa HER mesajı (veya bağlamı) AI'a gönderiyoruz.
        if (foundWord || settings.aiModeration) {
          let shouldDelete = foundWord ? true : false;
          let shouldBan = false;
          let aiReasoning = null;
          let aiMode = 'heuristic';
          let aiSeverity = 'low';

          if (settings.aiModeration) {
            try {
              const previousMessages = [];
              try {
                const recent = await message.channel.messages.fetch({ limit: 4, before: message.id });
                const sorted = [...recent.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                for (const m of sorted.slice(0, 3)) {
                  previousMessages.push(`${m.author.username}: ${m.content.slice(0, 100)}`);
                }
              } catch { /* bağlam alınamadı */ }

              const toneResult = await analyzeTone(message.content, {
                username: message.author.username,
                previousMessages,
                channelName: message.channel.name,
              });

              aiMode = toneResult.mode;
              aiReasoning = toneResult.reasoning;
              aiSeverity = toneResult.severity || 'low';

              if (toneResult.isThreat) {
                shouldDelete = true;
                if (aiSeverity === 'extreme') {
                  shouldBan = true;
                }
              } else if (!toneResult.isThreat && toneResult.confidence < 0.6) {
                shouldDelete = false;
              }
            } catch (aiErr) {
              console.warn('⚠️ AI moderasyon hatası:', aiErr.message);
            }
          }

          if (shouldBan && message.member?.bannable) {
            await message.delete().catch(() => {});
            incrementGlobalStat('blockedThreats');
            
            await message.member.ban({ reason: `Aegis Zero-Tolerance AI (Kritik İhlal): ${aiReasoning}` }).catch(() => {});
            
            const banContainer = new ContainerBuilder().setAccentColor(0xed4245);
            banContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent('## [ KRİTİK İHLAL TESPİTİ ]'));
            banContainer.addSeparatorComponents(new SeparatorBuilder());
            banContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Aegis Zero-Tolerance AI, <@${message.author.id}> adlı kullanıcıyı sınırsız banladı.\n**Sebep:** ${aiReasoning}`));

            await message.channel.send({
              components: [banContainer],
              flags: MessageFlags.IsComponentsV2
            }).catch(() => {});

            await sendLog(
              message.guild,
              client,
              '[ KRİTİK İHLAL: SINIRSIZ BAN ]',
              `**Kullanıcı:** <@${message.author.id}> (${message.author.tag})\n**Kanal:** <#${message.channel.id}>\n**AI Kararı:** ${aiReasoning}\n**Mesaj:** \`\`\`${message.content.substring(0, 500)}\`\`\``,
              0xff0000,
              [{ name: 'Kullanıcı ID', value: message.author.id, inline: true }]
            );
          } else if (shouldDelete) {
            await message.delete().catch(() => {});
            incrementGlobalStat('blockedThreats');

            const warnContainer = new ContainerBuilder().setAccentColor(0xf0b232);
            warnContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(isEn ? `[ WARNING ] <@${message.author.id}>, your message contained prohibited or abusive language.` : `[ UYARI ] <@${message.author.id}>, yasaklı kelime veya agresif dil kullandınız.`));

            const warnMsg = await message.channel.send({
              components: [warnContainer],
              flags: MessageFlags.IsComponentsV2
            }).catch(() => {});

            setTimeout(() => warnMsg?.delete().catch(() => {}), 5000);

            const extraFields = [];
            if (aiReasoning) {
              extraFields.push({
                name: `${aiMode === 'ai' ? '[ AI Ton Analizi ]' : '[ Heuristic Analiz ]'}`,
                value: aiReasoning,
                inline: false,
              });
            }

            await sendLog(
              message.guild,
              client,
              '[ YASAKLI KELİME FİLTRELENDİ ]',
              `**Kullanıcı:** <@${message.author.id}> (${message.author.tag})\n**Kanal:** <#${message.channel.id}>\n**Tetikleyici:** \`${foundWord || 'AI Algılaması'}\`\n**Mesaj:** \`\`\`${message.content.substring(0, 500)}\`\`\``,
              0xffaa00,
              [
                { name: 'Kullanıcı ID', value: message.author.id, inline: true },
                ...extraFields,
              ]
            );
          } else {
            if (settings.logChannel && aiReasoning) {
              await sendLog(
                message.guild,
                client,
                '[ AI: Potansiyel İhlal — Şaka/Sarkazm Olarak Değerlendirildi ]',
                `**Kullanıcı:** <@${message.author.id}>\n**Tetikleyici:** \`${foundWord || 'AI Tetikleyicisi'}\`\n**AI Kararı:** ${aiReasoning}\n**Mesaj silinmedi** (düşük tehdit güveni)`,
                0x4488ff
              );
            }
          }
        }
      }
    }

    // ─── AI TICKET ASSISTANT ───────────────────────────────────────────────────
    if (message.guild && !message.author.bot) {
      const settings = getGuild(message.guild.id);
    const guildLang = getGuildLanguage(message.guild.id);
    const isEn = guildLang === "en";
      if (settings.ticketAiEnabled) {
        // Ticket kanalı kontrolü: DB'den VEYA kanal adı "ticket-" VEYA ticket kategorisinde
        const ticketCategory = settings.ticketCategory;
        const isTicketChannel = getTicketByChannelId(message.guild.id, message.channel.id) ||
          message.channel.name?.startsWith('ticket-') ||
          (ticketCategory && message.channel.parentId === ticketCategory);

        if (isTicketChannel) {
          console.log('[TicketAI] ACTIVATED in channel:', message.channel.id, 'name:', message.channel.name, 'by:', message.author.tag);
          const isStaff = settings.ticketStaffRole && message.member?.roles.cache.has(settings.ticketStaffRole);
          const config = settings.ticketAiConfig || {};
          const shouldRespond = (!isStaff && config.respondToUser !== false) ||
                                (isStaff && config.respondToStaff === true);

          if (shouldRespond) {
            try {
              const { processTicketMessage: processMsg, incrementTicketAiUsage: incUsage } = require('../utils/ticketAi');
              const isEn = (settings.language === 'en') || (message.guild?.preferredLocale && !message.guild.preferredLocale.startsWith('tr'));
              const limitCheck = checkTicketAiLimit(message.guild.id);
              if (!limitCheck.allowed) {
                const limitContainer = new ContainerBuilder().setAccentColor(0xed4245);
                limitContainer.addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    isEn
                      ? `⚠️ **Daily AI request limit reached** (${limitCheck.usage}/${limitCheck.limit})`
                      : `⚠️ **Günlük AI istek limitine ulaşıldı** (${limitCheck.usage}/${limitCheck.limit})`
                  )
                );
                limitContainer.addSeparatorComponents(new SeparatorBuilder());
                limitContainer.addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    isEn
                      ? 'Upgrade to a premium plan for unlimited AI assistance!'
                      : '**Epic** paketiyle sınırsız AI asistanı alın!'
                  )
                );
                await message.reply({ components: [limitContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: { repliedUser: false } }).catch(() => {});
              } else {
                const ticketData = getTicketByChannelId(message.guild.id, message.channel.id) || {
                  id: message.channel.name,
                  userId: message.author.id,
                  userTag: message.author.tag,
                  channelId: message.channel.id
                };
                const result = await processMsg(message, ticketData, settings);
                console.log('[TicketAI Debug] processMsg result:', JSON.stringify(result));
                if (result?.limited) {
                  const lc2 = new ContainerBuilder().setAccentColor(0xed4245);
                  lc2.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                      isEn
                        ? `⚠️ **Daily limit reached** (${result.usage}/${result.limit})`
                        : `⚠️ **Günlük limit doldu** (${result.usage}/${result.limit})`
                    )
                  );
                  await message.reply({ components: [lc2], flags: MessageFlags.IsComponentsV2, allowedMentions: { repliedUser: false } }).catch(() => {});
                } else if (result?.error) {
                  // Asistan hata verirse bilet kanalı sessiz kalmasın: kısa bir not (kanal başına 5 dakikada bir)
                  const last = global.__ticketAiErrNotice?.get(message.channel.id) || 0;
                  global.__ticketAiErrNotice = global.__ticketAiErrNotice || new Map();
                  if (Date.now() - last > 5 * 60000) {
                    global.__ticketAiErrNotice.set(message.channel.id, Date.now());
                    await message.reply({ content: isEn ? ':aegis_sad: The AI assistant could not answer just now. A staff member will help you.' : ':aegis_sad: Yapay zeka asistanı şu an cevap veremedi. Bir yetkili sana yardımcı olacak.', allowedMentions: { repliedUser: false } }).catch(() => {});
                  }
                } else if (result?.reply) {
                  // Check if it's a bot_invite JSON
                  let parsed = null;
                  if (result.reply.trim().startsWith('{')) { try { parsed = JSON.parse(result.reply); } catch (e) {} }

                  console.log('[TicketAI] Parsed:', JSON.stringify(parsed));
                  if (parsed?.type === 'bot_invite') {
                    const { ButtonBuilder, ButtonStyle, ActionRowBuilder, TextDisplayBuilder, SeparatorBuilder, ContainerBuilder } = require('discord.js');
                    // Unescape \n\n in text
                    const displayText = (parsed.text || '').replace(/\\n\\n/g, '\n\n').replace(/\\n/g, '\n');
                    const inviteContainer = new ContainerBuilder().setAccentColor(0x0066ff);
                    inviteContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(displayText));
                    inviteContainer.addSeparatorComponents(new SeparatorBuilder());

                    // Components V2: Button in ActionRow (simpler, more compatible)
                    const row = new ActionRowBuilder().addComponents(
                      new ButtonBuilder()
                        .setLabel(parsed.buttonLabel || (isEn ? 'Invite Link' : 'Davet Linki'))
                        .setStyle(ButtonStyle.Link)
                        .setURL(parsed.buttonUrl)
                    );

                    inviteContainer.addActionRowComponents(row);
                    inviteContainer.addTextDisplayComponents(
                      new TextDisplayBuilder().setContent(isEn ? '-# 🤖 Aegis AI Assistant' : '-# 🤖 Aegis AI Asistanı')
                    );

                    await message.reply({
                      components: [inviteContainer],
                      flags: MessageFlags.IsComponentsV2,
                      allowedMentions: { repliedUser: false }
                    }).catch(() => {});
                  } else {
                    const container = new ContainerBuilder().setAccentColor(0x0066ff);
                    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(result.reply));
                    container.addSeparatorComponents(new SeparatorBuilder());
                    container.addTextDisplayComponents(
                      new TextDisplayBuilder().setContent(isEn ? '-# 🤖 Aegis AI Assistant' : '-# 🤖 Aegis AI Asistanı')
                    );
                    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { repliedUser: false } }).catch(() => {});
                  }
                  incUsage(message.guild.id);
                }
              }
            } catch (e) {
              console.error('[TicketAI] Error:', e.message);
            }
          }
        }
      }
    }

    // ─── OYUN MESAJ HANDLER'LARI ────────────────────────────────────────────
    if (message.guild && !message.author.bot) {
      const { activeGames } = require('../utils/gameData');
      const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
      const game = activeGames.get(message.channel.id);

      if (game) {
        const gl = (tr, en) => (require('../utils/i18n').getGuildLanguage(message.guild.id) === 'en' ? en : tr);
        // ─── Kelime Türetmece ───────────────────────────────────────
        if (game.type === 'kelime-turetmece') {
          const content = message.content.trim().toLowerCase();
          if (!/^[a-zçğıöşü]+$/i.test(content)) return;

          const lastLetter = game.lastWord.toLowerCase().slice(-1);

          if (!content.startsWith(lastLetter)) {
            const warn = await message.reply({
              content: gl(`❌ **${message.author.username}**, kelime **${lastLetter.toUpperCase()}** harfiyle başlamalı! (Son kelime: **${game.lastWord}**)`, `❌ **${message.author.username}**, the word must start with **${lastLetter.toUpperCase()}**! (Last word: **${game.lastWord}**)`),
              allowedMentions: { repliedUser: false }
            }).catch(() => {});
            setTimeout(() => warn?.delete().catch(() => {}), 3000);
            return;
          }

          if (game.usedWords.includes(content)) {
            const warn = await message.reply({
              content: gl(`❌ **${message.author.username}**, bu kelime zaten kullanıldı!`, `❌ **${message.author.username}**, that word was already used!`),
              allowedMentions: { repliedUser: false }
            }).catch(() => {});
            setTimeout(() => warn?.delete().catch(() => {}), 3000);
            return;
          }

          game.lastWord = content;
          game.usedWords.push(content);

          const container = new ContainerBuilder().setAccentColor(0x3ba55c);
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔤 ${gl('Kelime Türetmece', 'Word Chain')}`));
          container.addSeparatorComponents(new SeparatorBuilder());
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `✅ **${message.author.username}**: **${content}**\n\n` +
              `${gl('Son harf', 'Last letter')}: **${content.slice(-1).toUpperCase()}**\n` +
              gl('Bu harfle başlayan bir kelime yaz!', 'Write a word that starts with this letter!')
            )
          );
          container.addSeparatorComponents(new SeparatorBuilder());
          container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('game_stop_kelime').setLabel(gl('⏹️ Oyunu Bitir', '⏹️ End game')).setStyle(ButtonStyle.Danger),
            )
          );
          await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
          return;
        }

        // ─── Sayı Tahmin ────────────────────────────────────────────
        if (game.type === 'sayi-tahmin') {
          const guess = parseInt(message.content.trim());
          if (isNaN(guess) || guess < 1 || guess > 100) return;

          game.attempts++;

          if (guess === game.target) {
            activeGames.delete(message.channel.id);

            const container = new ContainerBuilder().setAccentColor(0x3ba55c);
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎉 ${gl('Tebrikler!', 'Congratulations!')}`));
            container.addSeparatorComponents(new SeparatorBuilder());
            container.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                gl(`**${message.author.username}** doğru tahmin etti!\n\n🎯 **Sayı:** ${game.target}\n🔢 **Deneme:** ${game.attempts}`, `**${message.author.username}** guessed it!\n\n🎯 **Number:** ${game.target}\n🔢 **Attempts:** ${game.attempts}`)
              )
            );
            await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            return;
          }

          const hint = guess < game.target ? gl('📈 **Daha büyük!**', '📈 **Higher!**') : gl('📉 **Daha küçük!**', '📉 **Lower!**');

          const container = new ContainerBuilder().setAccentColor(0xffd700);
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔢 ${gl('Sayı Tahmin', 'Number Guess')}`));
          container.addSeparatorComponents(new SeparatorBuilder());
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `${hint}\n\n` +
              gl(`**${message.author.username}** tahmini: **${guess}**\nDeneme: ${game.attempts}\n\n1-100 arası sayı yazarak devam et!`, `**${message.author.username}** guessed **${guess}**\nAttempts: ${game.attempts}\n\nKeep going with a number from 1 to 100!`)
            )
          );
          container.addSeparatorComponents(new SeparatorBuilder());
          container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('game_stop_sayi').setLabel(gl('⏹️ Bitir', '⏹️ End')).setStyle(ButtonStyle.Danger),
            )
          );
          await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
          return;
        }
      }
    }
  }
};

async function handlePrefixHelp(message, t) {
  const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
  } = require('discord.js');

  const container = new ContainerBuilder().setAccentColor(0x0066ff);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('# 🛡️ Aegis RP — Prefix Command Help\nPrefix: `a.`')
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  // Everyone commands
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '**👥 Everyone Commands**\n' +
      '`a.ping` — Check bot latency\n' +
      '`a.giveaway` — Create giveaway (use `/giveaway`)\n' +
      '`a.poll` — Create a poll (use `/poll`)\n' +
      '`a.help` — Show this help message'
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  // Admin commands
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '**👑 Admin Commands**\n' +
      '`a.setup` — Set up bot in server\n' +
      '`a.settings` — View/modify settings\n' +
      '`a.automod` — AutoMod panel (use `/automod`)\n' +
      '`a.antiraid` — Anti-Raid panel (use `/antiraid`)\n' +
      '`a.moderation` — Moderation commands (use `/moderation`)\n' +
      '`a.ticket` — Ticket system (use `/ticket`)\n' +
      '`a.welcome` — Welcome settings (use `/welcome`)\n' +
      '`a.rolepanel` — Role panel (use `/role-panel`)\n' +
      '`a.invite` — Invite bot (use `/invite`)\n' +
      '`a.stats` — Server stats (use `/stats`)\n' +
      '`a.packages` — View packages (use `/packages`)'
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  // Important note
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '💡 **Note:** Slash commands (`/`) are recommended for full functionality.\n' +
      'Prefix commands (`a.`) are shortcuts — most open the slash command panel.\n\n' +
      '🌐 **Language:** Your server language determines command names.\n' +
      'If you want English commands, use `/language` to set server language to English.'
    )
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('📖 Slash Commands Guide')
      .setStyle(ButtonStyle.Link)
      .setURL('https://discord.com/developers/docs/interactions/application-commands')
  );

  await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
}
