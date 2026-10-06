const { getGuild, recordMemberJoin, sendRulesDM, getRulesBot } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { logEvent } = require('../utils/activityLog');
const { calculateTrustScore, getLevelColor, getLevelEmoji } = require('../utils/trustScore');
const { checkAndHandleThreat } = require('../utils/threatNetwork');
const { sendWelcomeDm } = require('../utils/dmSeries');
const { autoAnalyzeNewMember } = require('../utils/killChain');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    const settings = getGuild(member.guild.id);

    // ─── Kill Chain Auto-Analyze ──────────────────────────────────────────────
    try {
      autoAnalyzeNewMember(member);
    } catch (e) {
      console.error('[KillChain] Auto-analyze failed:', e.message);
    }

    // ─── Aegis Şüpheli Hesap Karantinası ───
    try {
      const { checkNewMember } = require('../utils/guardSuite');
      const quarantined = await checkNewMember(member);
      if (quarantined) return;
    } catch (mErr) {
      console.error('[guardSuite] Karantina kontrol hatası:', mErr);
    }

    // ─── Katılım Kapısı (profil fotoğrafı, adında link/kelime, doğrulanmamış bot) ───
    try {
      if (await require('../features/joinGate').check(member, client)) return;
    } catch (gErr) {
      console.error('[joinGate] Kontrol hatası:', gErr.message);
    }

    // ─── Dashboard için üye katılım istatistiği kaydet ───────────────────────
    try {
      recordMemberJoin(member.guild.id);
    } catch { /* sessizce devam */ }

    logEvent(member.guild.id, 'memberJoin', `${member.user.tag} katıldı`, { user: member.user.tag, userId: member.user.id });

    // ─── Karşılama Mesajı & Canvas Kartı ─────────────────────────────────────
    if (settings.welcomeEnabled && settings.welcomeChannel) {
      const channel = member.guild.channels.cache.get(settings.welcomeChannel);
      if (channel) {
        try {
          const { buildWelcomeMessage } = require('../utils/welcomeMessage');
          const msg = await buildWelcomeMessage(member, settings);
          const { fallbackText, fallbackFile, ...payload } = msg;
          await channel.send(payload).catch(async () => {
            // Components V2 gönderilemezse (izin vb.) düz mesaj + kart dosyası
            await channel.send({ content: require('../utils/tier').withBrand(`<@${member.id}>\n${fallbackText}`, member.guild.id), files: [fallbackFile] }).catch(() => {});
          });
        } catch (err) {
          console.error('[Welcome Card Send Error]:', err.message);
        }
      }
    }

    // ─── DM Karşılama Serisi (ayrı, sunucu kanalından bağımsız) ─────────────
    try {
      await sendWelcomeDm(member, settings);
    } catch { /* DM kapalı olabilir */ }

    // ─── Otomatik Rol ────────────────────────────────────────────────────────
    // Panelden kapatılmış otorol (autoRoleEnabled === false) eskiden yine de rol veriyordu
    if (settings.autoRoleId && settings.autoRoleEnabled !== false && !member.user.bot) {
      const role = member.guild.roles.cache.get(settings.autoRoleId);
      if (role) {
        await member.roles.add(role).catch(() => {});
      }
    }

    // ─── Kural Botu DM (Onboarding) ──────────────────────────────────────────
    try {
      const rulesBot = getRulesBot(member.guild.id);
      if (rulesBot.enabled && rulesBot.dmOnJoin && rulesBot.verifiedRoleId) {
        // Don't send if already has the role
        if (!member.roles.cache.has(rulesBot.verifiedRoleId)) {
          await sendRulesDM(member, client);
        }
      }
    } catch { /* DM kapalı */ }

    // ─── 1. ORTAK TEHDİT AĞI KONTROLÜ ────────────────────────────────────────
    // Bu en öncelikli kontrol — bilinen tehditler anında işlem alır
    const threat = await checkAndHandleThreat(member, settings, client);

    // ─── Giriş Logu ──────────────────────────────────────────────────────────
    await sendChannelLog(member.guild, client, settings.joinLeaveLogChannel, {
      title: '📥 Üye Katıldı',
      description: `<@${member.id}> (${member.user.tag}) sunucuya katıldı.\n**Hesap Yaşı:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>\n**Toplam Üye:** ${member.guild.memberCount}${threat ? `\n\n⚠️ **Bu kullanıcı global tehdit ağında kayıtlı!**` : ''}`,
      color: threat ? 0xff3333 : 0x55ff9f,
    });

    // ─── 2. HESAP GÜVEN SKORU HESAPLA ────────────────────────────────────────
    // Güven skoru özelliği aktifse ve log kanalı varsa otomatik analiz yap
    if (settings.trustScoreEnabled !== false) { // varsayılan olarak açık
      try {
        const { score, level, factors } = await calculateTrustScore(member);
        const color = getLevelColor(level);
        const emoji = getLevelEmoji(level);

        // Sadece şüpheli veya tehlikeli hesapları logla (dikkat ve güvenli için log üretme)
        const logChannelId = settings.banKickLogChannel || settings.logChannel;
        if (logChannelId && (level === 'şüpheli' || level === 'tehlikeli')) {
          const logChannel = member.guild.channels.cache.get(logChannelId);
          if (logChannel) {
            const barFilled = Math.round(score / 5);
            const barEmpty = 20 - barFilled;
            const bar = `${'█'.repeat(barFilled)}${'░'.repeat(barEmpty)}`;

            await sendChannelLog(member.guild, client, logChannelId, {
              title: `${emoji} Şüpheli Hesap Tespit Edildi`,
              description: `<@${member.id}> (${member.user.tag}) sunucuya katıldı ancak güven skoru düşük.`,
              color,
              fields: [
                {
                  name: '📊 Güven Skoru',
                  value: `\`\`\`${bar}\`\`\`**${score}/100** — ${level.toUpperCase()}`,
                  inline: false,
                },
                {
                  name: '🔍 Risk Faktörleri',
                  value: factors.join('\n') || 'Faktör yok',
                  inline: false,
                },
                {
                  name: '💡 Öneri',
                  value: level === 'tehlikeli'
                    ? '🔴 Bu hesap yüksek risk taşıyor. Manuel inceleme veya ban düşünebilirsiniz.'
                    : '🟠 Bu hesabı yakından izleyin. Şüpheli davranış olursa aksiyona geçin.',
                  inline: false,
                },
              ],
            });
          }
        }
      } catch (trustErr) {
        console.warn('⚠️ Güven skoru hesaplama hatası:', trustErr.message);
      }
    }

    // ─── ANTİ-RAİD: YETKİSİZ BOT KARANTİNASI & ENGELLEME ──────────────────────
    if (member.user.bot) {
      try {
        const { AuditLogEvent } = require('discord.js');
        const auditLogs = await member.guild.fetchAuditLogs({
          type: AuditLogEvent.BotAdd,
          limit: 1,
        }).catch(() => null);

        const botAddEntry = auditLogs?.entries?.first();
        if (botAddEntry && botAddEntry.target?.id === member.id) {
          const inviter = botAddEntry.executor;
          const isGuildOwner = inviter?.id === member.guild.ownerId;
          const isClientSelf = inviter?.id === client.user.id;

          // Whitelist kontrolü (antiNuke whitelist)
          let isWhitelisted = false;
          try {
            const { isWhitelisted: checkNukeWhitelist } = require('../utils/antiNuke');
            isWhitelisted = checkNukeWhitelist(member.guild.id, inviter?.id);
          } catch (e) {}

          // Eğer botu ekleyen kişi Sunucu Sahibi değilse ve Whitelist'te değilse:
          if (inviter && !isGuildOwner && !isClientSelf && !isWhitelisted) {
            console.warn(`[AntiBotAdd] Yetkisiz bot ekleme engellendi! Bot: ${member.user.tag} (${member.id}) - Ekleyen: ${inviter.tag} (${inviter.id})`);

            // 1. Eklenen yabancı botu sunucudan at
            await member.kick('Aegis Yetkisiz Bot Kalkanı: Sunucu sahibi onayı olmadan bot eklenemez!').catch(() => {});

            // 2. Tehdit sayacını arttır
            try {
              const { incrementGlobalStat } = require('../utils/database');
              incrementGlobalStat('blockedThreats');
            } catch (e) {}

            // 3. Sunucu log kanalına kritik güvenlik alarmı gönder
            await sendChannelLog(member.guild, client, settings.banKickLogChannel || settings.logChannel, {
              title: '🚨 Yetkisiz Bot Ekleme Engellendi (Karantina & Kick)',
              description: `**Eklenen Bot:** <@${member.id}> (${member.user.tag})\n` +
                           `**Ekleyen Kişi:** <@${inviter.id}> (${inviter.tag})\n` +
                           `**Durum:** Bot güvenlik kalkanı tarafından **sunucudan anında atıldı**.\n\n` +
                           `⚠️ *Sunucuya sadece Sunucu Sahibi veya Beyaz Listedeki (Whitelist) yöneticiler bot ekleyebilir.*`,
              color: 0xff0000,
            });

            // 4. Sunucu sahibine DM ile acil uyarı gönder
            try {
              const owner = await member.guild.fetchOwner();
              if (owner) {
                await owner.send(
                  `🚨 **AEGIS ALARMI: Sunucunda Yetkisiz Bot Ekleme Girişimi Engellendi!**\n\n` +
                  `**Sunucu:** ${member.guild.name}\n` +
                  `**Eklenen Bot:** \`${member.user.tag}\` (${member.id})\n` +
                  `**Ekleyen Yetkili/Üye:** <@${inviter.id}> (\`${inviter.tag}\`)\n\n` +
                  `🛡️ **Alınan Önlem:** Bu bot nuke / raid tehlikesine karşı **sunucudan anında atılmıştır**. Lütfen botu eklemeye çalışan yetkilinin hesabını (hesap çalınması riskine karşı) kontrol ediniz.`
                ).catch(() => {});
              }
            } catch (e) {}

            return; // Bot atıldı, normal akışa devam etme
          }
        }
      } catch (botCheckErr) {
        console.warn('[AntiBotAdd] Hata:', botCheckErr.message);
      }

      // Eğer sunucu sahibi veya güvenilir biriyse normal bilgi logu geç
      await sendChannelLog(member.guild, client, settings.banKickLogChannel || settings.logChannel, {
        title: '🤖 Yeni Bot Eklendi — İzleniyor',
        description: `<@${member.id}> (${member.user.tag}) sunucuya bir bot olarak eklendi.\nBu bot kanal/rol silme, toplu ban veya mesaj spamı gibi şüpheli davranış gösterirse Aegis otomatik olarak atacaktır.`,
        color: 0xffaa00,
      });
    }
  },
};
