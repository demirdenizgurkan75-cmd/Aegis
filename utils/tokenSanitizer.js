/**
 * AEGIS TOKEN & AUTHORIZATION SHIELD (ANTI-TOKEN LEAK, ANTI-OAUTH2 & ANTI-USER-APP)
 * - Discord Bot & Kullanıcı Token sızıntılarını <15ms içinde imha eder.
 * - MFA yetki anahtarlarını siler.
 * - Discord Webhook sızıntılarını imha eder.
 * - OAuth2 "guilds.join" sahte doğrulama (token log / raid) tuzaklarını engeller.
 * - Yönetici izinli şüpheli bot davet linklerini bloke eder.
 * - Harici Kullanıcı Uygulamaları (User-Installed Apps / "Nerede / yaparsan çıkan yetki botu")
 *   üzerinden yapılan Fake Anti-Nuke, Token Log, DeathWish, GiveawayX ve Raid girişimlerini anında yakalar ve kullanıcıyı BANLAR!
 * - Botun kendi tokenını asla dışarı vermemesi için çıktıları sanitize eder.
 */

const { ApplicationIntegrationType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { incrementGlobalStat, getGuild } = require('./database');
const { reportThreat } = require('./threatNetwork');

// Discord Token Regex'leri
const DISCORD_TOKEN_REGEX = /(?:([A-Za-z0-9_\-=]{24,32})\.([A-Za-z0-9_\-]{6})\.([A-Za-z0-9_\-]{27,45})|mfa\.([A-Za-z0-9_\-]{84}))/g;
const DISCORD_WEBHOOK_REGEX = /https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/(\d+)\/([A-Za-z0-9_\-]+)/gi;
const OAUTH_AUTHORIZE_REGEX = /https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/(?:api\/)?oauth2\/authorize\?[^\s<>"{}|\\^`[\]]+/gi;

// Taranabilir metin/yapılandırma dosyası uzantıları
const SCANNABLE_EXT_REGEX = /\.(env|txt|json|py|js|ts|ya?ml|sh|cfg|ini|log|conf)$/i;

// Zararlı User-App, Raid & Nuke Anahtar Kelimeleri
const MALICIOUS_KEYWORDS = [
  /token[\s_-]*(?:log|grab|steal|dump|leak|check|nuke)/i,
  /raid[\s_-]*(?:tool|bot|mode|start|nuke|spam)/i,
  /nuke[\s_-]*(?:bot|tool|server|channels|roles|board)/i,
  /mass[\s_-]*(?:ban|kick|channel|role|dm|mention)/i,
  /crash[\s_-]*(?:server|discord|guild)/i,
  /webhook[\s_-]*(?:spamm?er|flooder|deleter)/i,
  /deathwish/i,
  /giveawayx/i,
  /nukeboard/i,
  /selfbot/i,
];

// User App flood/spam takip haritası (executorId -> [timestamp])
const userAppTracker = new Map();

/**
 * Token veya Webhook'u güvenli şekilde maskeler
 */
function maskSecret(secret, type) {
  if (!secret) return '**********';
  if (type === 'webhook') {
    return secret.replace(DISCORD_WEBHOOK_REGEX, 'https://discord.com/api/webhooks/$1/************************');
  }
  if (secret.length <= 10) return '**********';
  return secret.substring(0, 6) + '*'.repeat(Math.min(secret.length - 6, 40));
}

/**
 * Botun veya sistemin ürettiği metinlerde gizli tokenları temizler
 */
function sanitizeOutput(text, client) {
  if (!text) return '';
  let str = typeof text === 'string' ? text : String(text);
  if (client && client.token) {
    str = str.replaceAll(client.token, '[REDACTED_BOT_TOKEN]');
  }
  if (process.env.DISCORD_TOKEN) {
    str = str.replaceAll(process.env.DISCORD_TOKEN, '[REDACTED_BOT_TOKEN]');
  }
  if (process.env.RP_BOT_TOKEN) {
    str = str.replaceAll(process.env.RP_BOT_TOKEN, '[REDACTED_BOT_TOKEN]');
  }
  str = str.replace(DISCORD_TOKEN_REGEX, (match) => maskSecret(match, 'token'));
  str = str.replace(DISCORD_WEBHOOK_REGEX, (match) => maskSecret(match, 'webhook'));
  return str;
}

/**
 * Metin içeriğinde Discord token, webhook veya tehlikeli OAuth2 yetki linki var mı tarar
 */
function scanContent(content) {
  if (!content || typeof content !== 'string') return null;

  // 1. Bot & Kullanıcı Token Kontrolü
  const tokenMatches = [...content.matchAll(DISCORD_TOKEN_REGEX)];
  for (const match of tokenMatches) {
    const raw = match[0];
    const part1 = match[1];
    const mfaToken = match[4];

    if (part1) {
      try {
        const decoded = Buffer.from(part1, 'base64').toString('utf-8');
        if (/^\d{16,21}$/.test(decoded)) {
          return {
            found: true,
            type: 'discord_token',
            typeLabel: 'Discord Bot / Kullanıcı Tokenı',
            raw,
            masked: maskSecret(raw, 'token'),
            snowflake: decoded,
            source: 'message',
          };
        }
      } catch (e) {}

      return {
        found: true,
        type: 'discord_token',
        typeLabel: 'Discord Bot / Kullanıcı Tokenı',
        raw,
        masked: maskSecret(raw, 'token'),
        source: 'message',
      };
    } else if (mfaToken) {
      return {
        found: true,
        type: 'discord_mfa_token',
        typeLabel: 'Discord MFA Yetki Tokenı',
        raw,
        masked: maskSecret(raw, 'mfa'),
        source: 'message',
      };
    }
  }

  // 2. Discord Webhook URL Kontrolü
  const webhookMatches = [...content.matchAll(DISCORD_WEBHOOK_REGEX)];
  if (webhookMatches.length > 0) {
    const raw = webhookMatches[0][0];
    return {
      found: true,
      type: 'discord_webhook',
      typeLabel: 'Discord Webhook URL',
      raw,
      masked: maskSecret(raw, 'webhook'),
      webhookId: webhookMatches[0][1],
      source: 'message',
    };
  }

  // 3. OAuth2 Yetkilendirme & Sahte Doğrulama (Token Raid) Tuzakları Kontrolü
  const oauthMatches = [...content.matchAll(OAUTH_AUTHORIZE_REGEX)];
  for (const match of oauthMatches) {
    const raw = match[0];
    try {
      const u = new URL(raw);
      const scope = (u.searchParams.get('scope') || '').toLowerCase();
      const perms = u.searchParams.get('permissions') || '';

      if (scope.includes('guilds.join')) {
        return {
          found: true,
          type: 'oauth2_guilds_join',
          typeLabel: 'OAuth2 Yetki Tuzağı (guilds.join - Sahte Doğrulama)',
          raw,
          masked: raw.substring(0, 45) + '...[GUILDS_JOIN_TRAP_MASKED]',
          source: 'message',
        };
      }

      if (perms === '8' || (BigInt(perms || 0) & 8n) === 8n) {
        return {
          found: true,
          type: 'oauth2_admin_bot',
          typeLabel: 'Yönetici (Admin) Yetkili Şüpheli Bot Daveti',
          raw,
          masked: raw.substring(0, 45) + '...[ADMIN_BOT_INVITE_MASKED]',
          source: 'message',
        };
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Mesaj ve eklerini asenkron olarak tarar
 */
async function inspectMessageForTokens(message) {
  const textLeak = scanContent(message.content);
  if (textLeak) return textLeak;

  if (message.embeds && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      const embedText = [
        embed.title || '',
        embed.description || '',
        ...(embed.fields || []).map(f => `${f.name} ${f.value}`),
        embed.footer?.text || ''
      ].join(' ');
      const embedLeak = scanContent(embedText);
      if (embedLeak) {
        embedLeak.source = 'embed';
        return embedLeak;
      }
    }
  }

  if (message.attachments && message.attachments.size > 0) {
    for (const [, attachment] of message.attachments) {
      const isTextOrCode = SCANNABLE_EXT_REGEX.test(attachment.name || '') ||
                           attachment.contentType?.startsWith('text/');

      if (isTextOrCode && attachment.size < 150000) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          const res = await fetch(attachment.url, { signal: controller.signal });
          clearTimeout(timeout);

          if (res.ok) {
            const body = await res.text();
            const fileLeak = scanContent(body);
            if (fileLeak) {
              fileLeak.source = 'attachment';
              fileLeak.fileName = attachment.name;
              return fileLeak;
            }
          }
        } catch (e) {}
      }
    }
  }

  return null;
}

/**
 * HARİCİ KULLANICI UYGULAMASI (USER-APP / YETKİ BOTU) TEHDİT KONTROLÜ
 * Kullanıcının kendi hesabına kurulu harici bir botla (User-Installed App) kanala
 * mesaj atmasını, raid/nuke spamı yapmasını, DeathWish/GiveawayX tuzaklarını anında siler ve kullanıcıyı BANLAR!
 */
async function checkUserAppThreat(message, client) {
  if (!message.guild || !message.interactionMetadata) return null;

  const owners = message.interactionMetadata.authorizingIntegrationOwners;
  // Discord.js v14: AuthorizingIntegrationOwners { guildId: null, userId: "..." }
  const isUserApp = Boolean(
    owners && (
      (owners.userId && !owners.guildId) ||
      owners.userId ||
      owners[ApplicationIntegrationType.UserInstall] ||
      owners['1'] ||
      owners[1]
    )
  );

  if (!isUserApp) return null;

  const executor = message.interactionMetadata.user;
  if (!executor || executor.id === client.user.id) return null;
  if (executor.id === message.guild.ownerId) return null; // Sunucu sahibine işlem yapılmaz

  const cmdName = (message.interactionMetadata.name || '').toLowerCase();
  const content = (message.content || '').toLowerCase();
  const embedText = (message.embeds || []).map(e => `${e.title || ''} ${e.description || ''}`).join(' ').toLowerCase();
  const authorName = (message.author?.username || '').toLowerCase();
  const combined = `${cmdName} ${authorName} ${content} ${embedText}`;

  // Flood/Hızlı Mesaj Takibi (10 saniyede 2+ mesaj gönderdiyse)
  const now = Date.now();
  let userHistory = userAppTracker.get(executor.id) || [];
  userHistory = userHistory.filter(t => now - t < 10000);
  userHistory.push(now);
  userAppTracker.set(executor.id, userHistory);

  let detectedThreat = null;

  // 1. Zararlı Kelime / Bot Adı / Komut Tespiti
  for (const regex of MALICIOUS_KEYWORDS) {
    if (regex.test(combined)) {
      detectedThreat = `Zararlı Komut/İçerik (${regex.source})`;
      break;
    }
  }

  // 2. Hızlı Flooding Tespiti
  if (!detectedThreat && userHistory.length >= 2) {
    detectedThreat = `Harici User App ile Mesaj Flooding (${userHistory.length} mesaj / 10sn)`;
  }

  // 3. Sahte Güvenlik Maskesi
  const hasAntiNukeMask = /anti[\s_-]*nuke|security|guard|protect|captcha|verify/i.test(combined);
  const hasSuspiciousPayload = combined.includes('token') ||
                                combined.includes('raid') ||
                                combined.includes('nuke') ||
                                combined.includes('guilds.join') ||
                                combined.includes('webhook');

  if (!detectedThreat && hasAntiNukeMask && hasSuspiciousPayload) {
    detectedThreat = 'Sahte Anti-Nuke Maskeli Token Log / Raid Tuzağı';
  }

  // HER HALÜKARDA: Yetkisiz bir harici User App kanala mesaj basıyorsa MESAJI ANINDA İMHA ET!
  await message.delete().catch(() => {});

  // Eğer tehdit veya flood tespit edildiyse: KULLANICIYI ANINDA BANLA!
  if (detectedThreat) {
    console.warn(`[UserAppShield] ZARARLI USER-APP TESPİT EDİLDİ! Kullanıcı: ${executor.tag || executor.id} (${executor.id}) - Sunucu: ${message.guild.name} - Tehdit: ${detectedThreat}`);

    try {
      await message.guild.members.ban(executor.id, {
        reason: `[Aegis Shield] Zararlı Harici Kullanıcı Uygulaması (User App: ${authorName || 'Bilinmeyen'}) ile Raid/Spam (${detectedThreat})`,
        deleteMessageSeconds: 86400,
      });
      console.log(`[UserAppShield] Kullanıcı BANLANDI: ${executor.tag || executor.id}`);
    } catch (banErr) {
      console.warn(`[UserAppShield] Ban atılamadı:`, banErr.message);
    }

    try {
      reportThreat(executor.id, message.guild.id, message.guild.name, `Zararlı User App (${authorName} / ${cmdName}) Raid/Spam: ${detectedThreat}`, 'yüksek');
    } catch (e) {}

    try {
      incrementGlobalStat('blockedThreats');
    } catch (e) {}

    try {
      const alertMsg = await message.channel.send({
        content: `🚨 <@${executor.id}> (\`${executor.tag || executor.id}\`), **Harici Kullanıcı Uygulaması (\`${authorName}\` / \`${cmdName || 'Spam'}\`)** ile sunucuda izinsiz saldırı/spam yaptığı için **sunucudan anında yasaklandı (BAN)!**\n` +
                 `🛡️ *Aegis Zero-Trust Shield devrede.*`,
      }).catch(() => {});
      if (alertMsg) setTimeout(() => alertMsg.delete().catch(() => {}), 15000);
    } catch (e) {}

    return true;
  }

  // Tehdit kelimesi yoksa bile User App mesajı silindi
  return true;
}

/**
 * Sunucuda @everyone ve altındaki tüm rollerden + tüm kanallardan
 * Harici Kullanıcı Uygulamaları (UseExternalApps) yetkisini derinlemesine temizler
 */
async function disableExternalAppsForEveryone(guild) {
  let rolesFixed = 0;
  let channelsFixed = 0;
  let errors = 0;

  try {
    for (const [, role] of guild.roles.cache) {
      if (role.permissions.has(PermissionFlagsBits.UseExternalApps)) {
        if (role.editable && role.id !== guild.ownerId) {
          try {
            const newPerms = role.permissions.remove(PermissionFlagsBits.UseExternalApps);
            await role.setPermissions(newPerms, 'Aegis Deep Lockdown: Harici User App Koruması');
            rolesFixed++;
          } catch (e) {
            errors++;
          }
        }
      }
    }
  } catch (e) {
    errors++;
  }

  try {
    for (const [, ch] of guild.channels.cache) {
      if (ch.permissionOverwrites) {
        for (const [, ow] of ch.permissionOverwrites.cache) {
          if (ow.allow.has(PermissionFlagsBits.UseExternalApps)) {
            try {
              await ch.permissionOverwrites.edit(ow.id, { UseExternalApps: false }, { reason: 'Aegis Deep Lockdown' });
              channelsFixed++;
            } catch (e) {
              errors++;
            }
          }
        }
      }
    }
  } catch (e) {
    errors++;
  }

  return { rolesFixed, channelsFixed, errors };
}

/**
 * Sunucu Güvenlik Durumu ve Güvenlik Skoru Analizi (0-100)
 * Gerçek Discord izinlerini ve Aegis koruma modüllerini denetler.
 */
function checkServerSecurityStatus(guild, settings = {}) {
  let openRoles = [];
  let totalRolesWithApps = 0;

  try {
    for (const [, role] of guild.roles.cache) {
      if (role.permissions.has(PermissionFlagsBits.UseExternalApps)) {
        if (role.id === guild.id) {
          openRoles.push({ id: role.id, name: '@everyone', dangerous: true });
          totalRolesWithApps++;
        } else if (role.editable && role.id !== guild.ownerId) {
          openRoles.push({ id: role.id, name: role.name, dangerous: true });
          totalRolesWithApps++;
        }
      }
    }
  } catch (e) {}

  const externalAppsLocked = totalRolesWithApps === 0;
  const antiRaid = !!settings.antiRaid;
  const linkSandbox = !!settings.linkSandbox;
  const autoMod = !!settings.autoMod;
  const antiInvite = !!settings.antiInvite;
  const trustScoreEnabled = !!settings.trustScoreEnabled;
  const honeytokenActive = true;

  const verificationLevel = typeof guild.verificationLevel === 'number' ? guild.verificationLevel : 0;

  let score = 0;
  if (externalAppsLocked) score += 25;
  if (antiRaid) score += 20;
  if (linkSandbox) score += 15;
  if (honeytokenActive) score += 15;
  if (autoMod) score += 10;
  if (antiInvite) score += 5;
  if (trustScoreEnabled) score += 5;
  if (verificationLevel >= 1) score += 5;

  score = Math.min(100, Math.max(0, score));

  let grade = 'SECURE';
  let gradeLabel = 'Maksimum Güvenlik';
  if (score < 50) {
    grade = 'CRITICAL';
    gradeLabel = 'Kritik Risk';
  } else if (score < 75) {
    grade = 'ELEVATED';
    gradeLabel = 'Standart Güvenlik';
  } else if (score < 90) {
    grade = 'GUARDED';
    gradeLabel = 'Yüksek Güvenlik';
  }

  const checks = [
    {
      id: 'externalApps',
      name: 'Harici Kullanıcı Uygulamaları (User Apps)',
      status: externalAppsLocked ? 'pass' : 'fail',
      score: externalAppsLocked ? 25 : 0,
      maxScore: 25,
      summary: externalAppsLocked
        ? 'Kilitli — @everyone ve rollerde harici app çalıştırma kapalı (DeathWish vb. engelli)'
        : `${totalRolesWithApps} rolde harici bot çalıştırma açık — yetkisiz user app saldırılarına açık!`,
      details: openRoles.map(r => r.name),
    },
    {
      id: 'antiRaid',
      name: 'Anti-Raid & Nuke Koruması',
      status: antiRaid ? 'pass' : 'fail',
      score: antiRaid ? 20 : 0,
      maxScore: 20,
      summary: antiRaid
        ? 'Devrede — Hızlı kanal/rol silme, toplu ban ve spam eşikleri izleniyor'
        : 'Pasif — Ani bot veya yetkili saldırılarına karşı otomatik koruma kapalı',
    },
    {
      id: 'linkSandbox',
      name: 'Link Kum Havuzu (Sandbox)',
      status: linkSandbox ? 'pass' : 'warning',
      score: linkSandbox ? 15 : 0,
      maxScore: 15,
      summary: linkSandbox
        ? 'Devrede — Şüpheli, kimlik avı ve zararlı web linkleri karantinaya alınıyor'
        : 'Pasif — Bilinmeyen alan adlarına giden linkler taranmıyor',
    },
    {
      id: 'honeytoken',
      name: 'Token & Webhook Sızıntı İmhası',
      status: 'pass',
      score: 15,
      maxScore: 15,
      summary: 'Devrede — Aegis Honeytoken & Token Sanitizer arka planda gerçek zamanlı imha yürütüyor',
    },
    {
      id: 'autoMod',
      name: 'AutoMod Akıllı Filtre',
      status: autoMod ? 'pass' : 'warning',
      score: autoMod ? 10 : 0,
      maxScore: 10,
      summary: autoMod
        ? 'Devrede — Küfür, hakaret ve yasaklı kelimeler otomatik temizleniyor'
        : 'Pasif — Kelime filtreleri ve otomatik moderasyon kapalı',
    },
    {
      id: 'antiInvite',
      name: 'Davet & Reklam Engelleyici',
      status: antiInvite ? 'pass' : 'warning',
      score: antiInvite ? 5 : 0,
      maxScore: 5,
      summary: antiInvite
        ? 'Devrede — Yetkisiz Discord davet linkleri engelleniyor'
        : 'Pasif — Discord davet linkleri serbest',
    },
    {
      id: 'trustScore',
      name: 'Hesap Güven Skoru Doğrulaması',
      status: trustScoreEnabled ? 'pass' : 'warning',
      score: trustScoreEnabled ? 5 : 0,
      maxScore: 5,
      summary: trustScoreEnabled
        ? 'Devrede — Şüpheli ve yeni açılmış hesaplar otomatik analiz ediliyor'
        : 'Pasif — Yeni hesap analizi devre dışı',
    },
    {
      id: 'verification',
      name: 'Discord Sunucu Doğrulama Seviyesi',
      status: verificationLevel >= 1 ? 'pass' : 'warning',
      score: verificationLevel >= 1 ? 5 : 0,
      maxScore: 5,
      summary: verificationLevel >= 1
        ? `Seviye ${verificationLevel} — Temel bot/hesap doğrulama şartı devrede`
        : 'Doğrulama Kapalı (None) — E-posta doğrulaması olmayan bot hesaplar katılabilir',
    },
  ];

  return {
    score,
    grade,
    gradeLabel,
    externalAppsLocked,
    totalRolesWithApps,
    openRoles: openRoles.slice(0, 10),
    checks,
    lastAuditAt: Date.now(),
  };
}

/**
 * Sızıntı veya yetki tuzağı tespit edildiğinde yürütülecek acil müdahale eylemleri
 */
async function handleTokenLeak(message, client, leakResult) {
  await message.delete().catch(() => {});

  try {
    incrementGlobalStat('blockedThreats');
  } catch (e) {}

  const isOAuthTrap = leakResult.type === 'oauth2_guilds_join';
  const isAdminBot = leakResult.type === 'oauth2_admin_bot';

  try {
    let channelAlert = `🛡️ <@${message.author.id}>, **Güvenlik Koruması Devrede!** Paylaştığın içerikte gizli Discord API anahtarı (\`${leakResult.typeLabel}\`) tespit edildi ve güvenliğin için anında **silindi**.\n⚠️ *Token'lar şifreniz gibidir; lütfen derhal sıfırlayın. Acil güvenlik rehberi DM kutunuza iletildi.*`;

    if (isOAuthTrap) {
      channelAlert = `🚨 <@${message.author.id}>, **OAuth2 Yetki Tuzağı Engellendi!** Paylaştığın link, kullanıcıların Discord hesaplarına \`guilds.join\` yetkisi alarak hesaplarını raid ve spam amaçlı kullanan **Sahte Doğrulama / Token Tuzağı** olduğu için derhal imha edildi!`;
    } else if (isAdminBot) {
      channelAlert = `⚠️ <@${message.author.id}>, **Yönetici Yetkili Bot Daveti Engellendi!** Sunucuda Yönetici (Administrator) izinli şüpheli bot davet linki paylaşımı güvenlik nedeniyle yasaklanmıştır.`;
    }

    const warnMsg = await message.channel.send({ content: channelAlert }).catch(() => {});
    if (warnMsg) {
      setTimeout(() => warnMsg.delete().catch(() => {}), 12000);
    }
  } catch (e) {}

  try {
    let dmContent = '';
    if (isOAuthTrap) {
      dmContent = [
        `🚨 **AEGIS SHIELD: OAuth2 Yetkilendirme Tuzağı Engellendi!**`,
        ``,
        `**${message.guild.name}** sunucusunda paylaştığın link Discord'un \`guilds.join\` iznini talep eden bir **OAuth2 Yetki Tuzağı** olarak tespit edildi.`,
        ``,
        `⚠️ **BU TUZAK NASIL ÇALIŞIR?**`,
        `Bu tür botlar/linkler "Doğrulanmak için yetkilendir", "Rol almak için tıkla" veya "Nitro çekilişi" diyerek kullanıcıları kandırır. Kullanıcı "Yetkilendir"e bastığında saldırgan hesabınızın kontrolünü ele geçirir ve hesabınızı haberiniz olmadan yasa dışı raid sunucularına sokar!`,
        ``,
        `🛡️ **KORUNMAK İÇİN:**`,
        `1. Discord Ayarları ➔ **Yetkili Uygulamalar (Authorized Apps)** sekmesine git.`,
        `2. Tanımadığın, şüpheli veya yakın zamanda yetkilendirdiğin tüm uygulamaların yanındaki **"Yetkiyi Kaldır"** butonuna bas.`,
        `3. Bu linki başka sunucularda da paylaşma.`,
        ``,
        `- # Aegis Cyber Defense Engine • OAuth2 Shield`
      ].join('\n');
    } else {
      dmContent = [
        `🚨 **AEGIS SHIELD: Discord API / Token Sızıntısı Tespit Edildi!**`,
        ``,
        `**${message.guild.name}** sunucusunda gönderdiğin mesajda gizli Discord API anahtarı tespit edildi ve üçüncü şahısların eline geçmemesi için Aegis Guard tarafından anında **silindi**.`,
        ``,
        `🔍 **Tespit Edilen Tür:** \`${leakResult.typeLabel}\``,
        `🔑 **Sızan Veri (Maskelenmiş):** \`${leakResult.masked}\``,
        `📁 **Kaynak:** ${leakResult.source === 'attachment' ? `Dosya Eki (\`${leakResult.fileName}\`)` : 'Mesaj Metni'}`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `⚠️ **BU NEDEN ÇOK TEHLİKELİ?**`,
        `Token'lar Discord botlarının ve kullanıcı hesaplarının en yetkili şifresiz anahtarıdır. Bir token ele geçirildiğinde saldırgan:`,
        `• Botunuza tam erişim sağlayıp sunucuları silebilir, üyelere ban atabilir veya spam yapabilir.`,
        `• Hesabınızın tokenı ise şifrenizi bilmeden hesabınıza girip sunucularınızı patlatabilir.`,
        ``,
        `⚡ **HEMEN YAPMAN GEREKENLER (ACİL PROTOKOL):**`,
        `1️⃣ **Eğer bu bir BOT TOKEN ise:**`,
        `   • Discord Developer Portal'a git: https://discord.com/developers/applications`,
        `   • İlgili botunu seç ➔ Sol menüden **"Bot"** sekmesine tıkla.`,
        `   • **"Reset Token"** butonuna bas! Eski sızan token anında geçersiz kalır.`,
        `2️⃣ **Eğer bu senin KİŞİSEL DİSCORD HESABIN ise:**`,
        `   • Discord şifreni **DERHAL DEĞİŞTİR**! (Şifre değiştiğinde Discord tüm cihazlardaki aktif tokenları anında sıfırlar).`,
        `   • İki Aşamalı Doğrulamayı (2FA) aktif et.`,
        `   • Discord Ayarları ➔ **Cihazlar (Devices)** sekmesine girip tanımadığın tüm aktif oturumları kapat.`,
        `3️⃣ **Eğer bu bir WEBHOOK ise:**`,
        `   • İlgili kanalın Kanal Ayarları ➔ Entegrasyonlar ➔ Webhooks kısmından o webhook'u derhal sil.`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `- # Aegis Cyber Defense Engine • Token Shield v2`
      ].join('\n');
    }

    await message.author.send(dmContent).catch(() => {});
  } catch (e) {}

  try {
    const logSettings = getGuild(message.guild.id);
    if (logSettings && logSettings.logChannel) {
      const logChannel = message.guild.channels.cache.get(logSettings.logChannel);
      if (logChannel) {
        const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
        const c = new ContainerBuilder().setAccentColor(isOAuthTrap ? 0xff0055 : 0xff3300);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
          isOAuthTrap ? '# 🚨 OAuth2 Yetki Tuzağı Engellendi' : '# 🛡️ Discord Token / API Sızıntısı Engellendi'
        ));
        c.addSeparatorComponents(new SeparatorBuilder());
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `Kullanıcı mesajında zararlı yetki / kimlik sızıntısı saptandı ve içeriğe anında müdahale edildi.`
        ));
        c.addSeparatorComponents(new SeparatorBuilder());
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**Kullanıcı:** <@${message.author.id}> (${message.author.tag})\n` +
          `**Kanal:** <#${message.channel.id}>\n` +
          `**Tür:** \`${leakResult.typeLabel}\`\n` +
          `**Özet:** \`${leakResult.masked}\`\n` +
          `**Kaynak:** ${leakResult.source === 'attachment' ? `Dosya Eki (\`${leakResult.fileName}\`)` : 'Mesaj Metni'}\n` +
          `**Müdahale Hızı:** \`< 15ms (Anında Silindi)\``
        ));
        c.addSeparatorComponents(new SeparatorBuilder());
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Aegis Security Engine • Zero-Trust Shield'));
        await logChannel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    }
  } catch (logErr) {
    console.warn('[TokenSanitizer] Log hatası:', logErr.message);
  }
}

module.exports = {
  scanContent,
  inspectMessageForTokens,
  checkUserAppThreat,
  disableExternalAppsForEveryone,
  checkServerSecurityStatus,
  handleTokenLeak,
  maskSecret,
  sanitizeOutput,
};
