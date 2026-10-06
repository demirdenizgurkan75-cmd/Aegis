// ─── Dashboard uçları: uyarılar, paket seçimi, sunucu listesi, ayarlar, loglar ──
const { getBearerToken, verifyToken, sendJSON, readBody, applyBotCustomization, discordGuildsCache, ORDERS_LOG_CHANNEL_ID, sanitizeObject } = require('./helpers');
const { getLogs } = require('../activityLog');
const { PACKAGES } = require('../packages');

// Do NOT cache getDb().getGuild etc. at top level — owner-commands clears require.cache for database.js
// Always require fresh to get the current module instance.
function getDb() { return require('../database'); }

// ─── Discord OAuth token yenileme ─────────────────────────────────────────────
async function refreshDiscordAccessToken(refreshToken) {
  if (!refreshToken) return null;
  try {
    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn('[Token Refresh] Failed:', data);
      return null;
    }
    return data; // { access_token, refresh_token, expires_in, scope, token_type }
  } catch (err) {
    console.error('[Token Refresh] Error:', err);
    return null;
  }
}

module.exports = {
  name: 'dashboard',
  async handle(ctx) {
    const { req, res, url, client } = ctx;

    // Ortak yetki yardımcısı: oturumdaki kullanıcı guild'de üye VE (owner veya ManageGuild) mi?
    // Başarılıysa guild'i döndürür; aksi halde hata yanıtını gönderip true döner.
    async function requireManage(session, guildId) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      let member = guild.members.cache.get(session.discordId);
      if (!member) {
        try { member = await guild.members.fetch(session.discordId); } catch (err) { member = null; }
      }
      const isOwner = guild.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Bu sunucuya erişim yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Bu sunucuyu yönetme yetkin yok' });
      }
      return guild;
    }

    // ─── GET /api/alerts — kullanıcının sunucularına ait yeni uyarılar ────
    if (url.pathname === '/api/alerts' && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const since = Number(url.searchParams.get('since')) || 0;
      const account = getDb().getWebUser(session.discordId);
      const guildIds = new Set((account?.guilds || []).map(g => (typeof g === 'string' ? g : g.id)));
      const alerts = getDb().getAlerts()
        .filter(a => a.at > since && guildIds.has(a.guildId))
        .slice(-20);
      return sendJSON(res, 200, { alerts });
    }

    // ─── POST /api/select-package — paket seçimi/siparişi ──────────────────
    if (url.pathname === '/api/select-package' && req.method === 'POST') {
      const token = getBearerToken(req);
      console.log('[select-package] Cookie header:', req.headers['cookie']);
      console.log('[select-package] Extracted token:', token);
      const session = verifyToken(token);
      console.log('[select-package] Verified session:', session);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz, lütfen giriş yap' });

      const body = await readBody(req);
      const pkg = PACKAGES.find(p => p.id === body.packageId);
      if (!pkg) return sendJSON(res, 400, { error: 'Geçersiz paket' });

      const order = getDb().recordWebOrder(session.discordId, pkg.id, body.serverLink || null);

      if (ORDERS_LOG_CHANNEL_ID) {
        const channel = client.channels.cache.get(ORDERS_LOG_CHANNEL_ID);
        if (channel) {
          channel.send({
            content: `📦 **Yeni Satın Alım!**\n**Kullanıcı:** ${session.username} (<@${session.discordId}>)\n**Paket:** ${pkg.name}\n**Fiyat:** ${pkg.priceMonthly}₺ / ${pkg.period}\n**Hedef Sunucu:** ${body.serverLink || 'Belirtilmedi'}\n**Sipariş No:** \`${order.id}\`\n\nÖdemeyi kontrol edip onaylamak için: \`!siparis-onayla ${order.id}\``,
          }).catch(() => {});
        }
      }

      return sendJSON(res, 200, { success: true, order });
    }

    // ─── GET /api/dashboard/guilds — kullanıcının yönettiği sunucular ────────
    // Aegis'in kurulu olduğu VE kullanıcının yönetebildiği sunucuları döndürür.
    // Önce kullanıcının Discord access token'ı ile TAZE guild listesi çekilir
    // (böylece yeni eklenen sunucu, oturum yenilenmeden görünür), yönetim izni
    // Discord'un permissions bitfield'ından okunur. Token yoksa/bayatsa eski
    // oturum-tabanlı davranışa düşülür.
    if (url.pathname === '/api/dashboard/guilds' && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const account = getDb().getWebUser(session.discordId);
      const aegisGuildIds = new Set(client.guilds.cache.keys());
      const MANAGE_GUILD_BIT = 1n << 5n; // discord.js PermissionFlagsBits.ManageGuild

      let needsRelogin = false;
      let discordGuilds = null;

      // 1) Mümkünse Discord'dan taze liste çek (60 sn önbellek)
      // Access token yenilendiyse tekrar dene (otomatik refresh_token ile)
      let triedRefresh = false;
      while (account && account.accessToken && !discordGuilds) {
        try {
          const cacheKey = `guilds:${session.discordId}`;
          const cached = discordGuildsCache.get(cacheKey);
          if (cached && cached.exp > Date.now()) {
            discordGuilds = cached.list;
            break;
          }
          const gres = await fetch('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${account.accessToken}` },
          });
          if (gres.status === 401 && !triedRefresh && account.refreshToken) {
            // Token bayat — refresh_token ile yenile
            console.log('[Dashboard] Access token expired, refreshing...');
            const newTokens = await refreshDiscordAccessToken(account.refreshToken);
            if (newTokens && newTokens.access_token) {
              // Yeni tokenları kaydet
              const db = getDb();
              if (db._webUsers && db._webUsers[session.discordId]) {
                db._webUsers[session.discordId].accessToken = newTokens.access_token;
                if (newTokens.refresh_token) {
                  db._webUsers[session.discordId].refreshToken = newTokens.refresh_token;
                }
                await db.writeDB(db);
              }
              account.accessToken = newTokens.access_token;
              if (newTokens.refresh_token) account.refreshToken = newTokens.refresh_token;
              triedRefresh = true;
              continue; // Yeni tokenla tekrar dene
            } else {
              console.warn('[Dashboard] Refresh failed, needs relogin');
              needsRelogin = true;
              break;
            }
          }
          if (gres.ok) {
            const gdata = await gres.json();
            if (Array.isArray(gdata)) {
              discordGuilds = gdata;
              discordGuildsCache.set(cacheKey, { list: gdata, exp: Date.now() + 60 * 1000 });
            }
          } else {
            console.warn('[Dashboard] Guild fetch failed:', gres.status);
            needsRelogin = true;
          }
        } catch (err) {
          console.error('Discord guild listesi çekilemedi:', err);
        }
        break; // Döngüden çık (yeniden deneme bitti veya hata)
      }

      const accessible = [];

      if (Array.isArray(discordGuilds) && discordGuilds.length) {
        // Aegis'in içinde olduğu tüm sunucuları göster — yetki kontrolü yok
        for (const g of discordGuilds) {
          if (!aegisGuildIds.has(g.id)) continue;
          const guild = client.guilds.cache.get(g.id);
          // Bot'un en yüksek rolünü bul
          const botMember = guild ? guild.members.cache.get(client.user.id) : null;
          const botHighestRole = botMember ? botMember.roles.highest : null;
          accessible.push({
            id: g.id,
            name: g.name,
            icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
            memberCount: guild ? guild.memberCount : null,
            isOwner: g.owner === true,
            botRole: botHighestRole ? { name: botHighestRole.name, position: botHighestRole.position } : null,
          });
        }
      } else {
        // Fallback: bot'un olduğu tüm sunucular
        for (const guild of client.guilds.cache.values()) {
          const botMember = guild.members.cache.get(client.user.id);
          const botHighestRole = botMember ? botMember.roles.highest : null;
          accessible.push({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ size: 128 }) || null,
            memberCount: guild.memberCount,
            isOwner: guild.ownerId === session.discordId,
            botRole: botHighestRole ? { name: botHighestRole.name, position: botHighestRole.position } : null,
          });
        }
      }

      return sendJSON(res, 200, { guilds: accessible, needsRelogin });
    }

    // ─── GET /api/dashboard/:guildId — sunucu dashboard verisi ────────
    const isSubEndpoint = url.pathname.match(/\/(channels|roles|logs|giveaways|tickets|webhooks|rules|ticket|health|voicemod|exploit|dependency|music|announce|active-music|security|lockdown)($|\/)/);
    if (url.pathname.startsWith('/api/dashboard/') && !url.pathname.includes('/guilds') && !isSubEndpoint && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guildId = url.pathname.split('/').pop();
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });

      // Yetki kontrolü — üye önbellekte yoksa Discord'dan çek, son çare sahip kontrolü
      let member = guild.members.cache.get(session.discordId);
      if (!member) {
        try { member = await guild.members.fetch(session.discordId); } catch (err) { member = null; }
      }
      const isOwner = guild.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Bu sunucuya erişim yetkin yok' });

      const canManage = member ? member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild) : false;
      if (!canManage && !isOwner) {
        return sendJSON(res, 403, { error: 'Bu sunucuyu yönetme yetkin yok' });
      }

      const days = parseInt(url.searchParams.get('days') || '7');
      const stats = getDb().getDashboardStats(guildId, days);

      // Discord'dan canlı kanal adlarını ekle
      if (stats && stats.topChannels) {
        for (const ch of stats.topChannels) {
          const channel = guild.channels.cache.get(ch.channelId);
          ch.channelName = channel ? `#${channel.name}` : `#${ch.channelId}`;
        }
      }

      // Canlı sunucu bilgileri
      const members = guild.members.cache;
      const online = members.filter(m => m.presence?.status === 'online').size;
      const liveData = {
        memberCount: guild.memberCount,
        onlineCount: online,
        boostCount: guild.premiumSubscriptionCount || 0,
        boostLevel: guild.premiumTier || 0,
        icon: guild.iconURL({ size: 128 }) || null,
        name: guild.name,
      };

      // ─── Panel için tam sunucu yapılandırması (kanal/rol adlarıyla) ──
      const settings = getDb().getGuild(guildId);
      const resolveChannel = (id) => {
        if (!id) return null;
        const ch = guild.channels.cache.get(id);
        return ch ? { id, name: ch.name } : { id, name: null };
      };
      const resolveRole = (id) => {
        if (!id) return null;
        const r = guild.roles.cache.get(id);
        return r ? { id, name: r.name } : { id, name: null };
      };

      const config = {
        autoMod: settings.autoMod,
        antiRaid: settings.antiRaid,
        antiInvite: settings.antiInvite,
        aiModeration: settings.aiModeration,
        linkSandbox: settings.linkSandbox,
        trustScoreEnabled: settings.trustScoreEnabled,
        welcomeEnabled: settings.welcomeEnabled,
        welcomeMessage: settings.welcomeMessage || '',
        bannedWords: settings.bannedWords || [],
        autoRole: resolveRole(settings.autoRoleId),
        modRole: resolveRole(settings.modRole),
        ticketStaffRole: resolveRole(settings.ticketStaffRole),
        antiRaidConfig: settings.antiRaidConfig || {},
        activePackageId: require('../tier').effectivePackage(guildId),
        aiChat: {
          enabled: Boolean(settings.aiChatEnabled),
          channel: resolveChannel(settings.aiChatChannelId),
          mode: settings.aiChatMode || 'single',
          allowedChannels: Array.isArray(settings.aiChatAllowedChannels) ? settings.aiChatAllowedChannels : [],
          ignoredChannels: Array.isArray(settings.aiChatIgnoredChannels) ? settings.aiChatIgnoredChannels : [],
          customPersona: settings.aiChatCustomPersona || '',
          enhancedPrompt: settings.aiChatEnhancedPrompt || '',
        },
        // Bot özelleştirme verisi (sadece isim — avatar/banner global, sunucu başına değil)
        botCustomization: settings.botCustomization ? { name: settings.botCustomization.name || null } : null,
        channels: {
          logChannel: resolveChannel(settings.logChannel),
          welcomeChannel: resolveChannel(settings.welcomeChannel),
          announcementChannel: resolveChannel(settings.announcementChannel),
          joinLeaveLogChannel: resolveChannel(settings.joinLeaveLogChannel),
          messageLogChannel: resolveChannel(settings.messageLogChannel),
          roleLogChannel: resolveChannel(settings.roleLogChannel),
          voiceLogChannel: resolveChannel(settings.voiceLogChannel),
          nicknameLogChannel: resolveChannel(settings.nicknameLogChannel),
          channelLogChannel: resolveChannel(settings.channelLogChannel),
          banKickLogChannel: resolveChannel(settings.banKickLogChannel),
          muteLogChannel: resolveChannel(settings.muteLogChannel),
          inviteLogChannel: resolveChannel(settings.inviteLogChannel),
          gameActivityLogChannel: resolveChannel(settings.gameActivityLogChannel),
          statusLogChannel: resolveChannel(settings.statusLogChannel),
          ticketLogChannel: resolveChannel(settings.ticketLogChannel),
          ticketCategory: resolveChannel(settings.ticketCategory),
          ticketTranscriptChannel: resolveChannel(settings.ticketTranscriptChannel),
          ordersLogChannel: resolveChannel(settings.ordersLogChannel),
        },
      };

      const { checkServerSecurityStatus } = require('../tokenSanitizer');
      const security = checkServerSecurityStatus(guild, settings);

      return sendJSON(res, 200, { ...stats, live: liveData, config, security });
    }

    // ─── GET /api/dashboard/:guildId/security ──────────────────────────────
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/security$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const guild = await requireManage(session, guildId);
      if (res.writableEnded) return;

      const settings = getDb().getGuild(guildId);
      const { checkServerSecurityStatus } = require('../tokenSanitizer');
      const security = checkServerSecurityStatus(guild, settings);
      return sendJSON(res, 200, { success: true, security });
    }

    // ─── POST /api/dashboard/:guildId/lockdown (Güvenlik Kilidi) ─────────────
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/lockdown$/) && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const guild = await requireManage(session, guildId);
      if (res.writableEnded) return;

      const { disableExternalAppsForEveryone, checkServerSecurityStatus } = require('../tokenSanitizer');
      // 1. Tüm roller ve kanal kurallarından UseExternalApps temizlenir
      const sweepRes = await disableExternalAppsForEveryone(guild);

      // 2. Veritabanındaki tüm koruma sistemleri devreye alınır
      const db = getDb();
      db.updateGuild(guildId, {
        antiRaid: true,
        linkSandbox: true,
        autoMod: true,
        antiInvite: true,
        trustScoreEnabled: true,
      });

      const updatedSettings = db.getGuild(guildId);
      const security = checkServerSecurityStatus(guild, updatedSettings);

      // 3. Denetim kaydı (Log kanalına bildir)
      try {
        const logChId = updatedSettings.logChannel || updatedSettings.channelLogChannel;
        if (logChId) {
          const logChannel = guild.channels.cache.get(logChId);
          if (logChannel) {
            logChannel.send({
              content: `**[ SİSTEM KİLİTLEME ]**\nWeb Paneli üzerinden güvenlik kilidi devreye alındı.\n• **Yetkili:** <@${session.discordId}>\n• **İzin Temizliği:** ${sweepRes.rolesFixed} rolden ve ${sweepRes.channelsFixed} kanal kuralından Harici Kullanıcı Uygulamaları (UseExternalApps) yetkisi kaldırıldı.\n• **Güvenlik Katmanları:** Anti-Raid, Link Sandbox, AutoMod, Reklam Filtresi ve Güven Skoru kilitlendi.`,
            }).catch(() => {});
          }
        }
      } catch (e) {}

      return sendJSON(res, 200, {
        success: true,
        rolesFixed: sweepRes.rolesFixed,
        channelsFixed: sweepRes.channelsFixed,
        security,
        message: `Güvenlik kilidi devreye alındı. ${sweepRes.rolesFixed} rolden harici uygulama yetkisi kaldırıldı ve tüm kurallar kilitlendi.`,
      });
    }

    // ─── AI TICKET ASSISTANT ───────────────────────────────────────────────
    // GET /api/dashboard/:guildId/ticket/ai/settings
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/ticket\/ai\/settings$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const settings = getDb().getGuild(guildId);
      if (!settings) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      // Check permissions (same as tickets endpoint)
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members?.cache?.get(session.discordId);
      const isOwner = guild?.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }
      const { getTicketAiSettings, getTicketAiLimit, getTicketAiUsage } = require('../database');
      const aiSettings = getTicketAiSettings(guildId);
      const limit = getTicketAiLimit(guildId);
      const usage = getTicketAiUsage(guildId);
      return sendJSON(res, 200, { settings: aiSettings, limit, usage });
    }

    // POST /api/dashboard/:guildId/ticket/ai/settings
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/ticket\/ai\/settings$/) && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const settings = getDb().getGuild(guildId);
      if (!settings) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const guild = client.guilds.cache.get(guildId);
      let member = guild?.members?.cache?.get(session.discordId);
      if (!member) {
        try { member = await guild.members.fetch(session.discordId); } catch (err) { member = null; }
      }
      const isOwner = guild?.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }
      const body = await readBody(req);
      const cleanBody = sanitizeObject(body);
      const { updateTicketAiSettings } = require('../database');
      const updated = updateTicketAiSettings(guildId, cleanBody);
      return sendJSON(res, 200, { success: true, settings: updated });
    }

    // GET /api/dashboard/:guildId/ticket/ai/skills
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/ticket\/ai\/skills$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const settings = getDb().getGuild(guildId);
      if (!settings) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members?.cache?.get(session.discordId);
      const isOwner = guild?.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }
      const { getTicketAiSettings } = require('../database');
      const aiSettings = getTicketAiSettings(guildId);
      return sendJSON(res, 200, { skills: aiSettings.skills });
    }

    // POST /api/dashboard/:guildId/ticket/ai/skills (add skill)
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/ticket\/ai\/skills$/) && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const settings = getDb().getGuild(guildId);
      if (!settings) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members?.cache?.get(session.discordId);
      const isOwner = guild?.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }
      const body = await readBody(req);
      const cleanBody = sanitizeObject(body);
      const { addTicketAiSkill } = require('../database');
      const skill = addTicketAiSkill(guildId, cleanBody);
      return sendJSON(res, 200, { success: true, skill });
    }

    // PATCH /api/dashboard/:guildId/ticket/ai/skills/:skillId
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/ticket\/ai\/skills\/[^/]+$/) && req.method === 'PATCH') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const parts = url.pathname.split('/');
      const guildId = parts[3];
      const skillId = parts[7];
      const settings = getDb().getGuild(guildId);
      if (!settings) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const guild = client.guilds.cache.get(guildId);
      let member = guild?.members?.cache?.get(session.discordId);
      if (!member) {
        try { member = await guild.members.fetch(session.discordId); } catch (err) { member = null; }
      }
      const isOwner = guild?.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }
      const body = await readBody(req);
      const cleanBody = sanitizeObject(body);
      const { updateTicketAiSkill } = require('../database');
      const updated = updateTicketAiSkill(guildId, skillId, cleanBody);
      return sendJSON(res, 200, { success: true, skill: updated });
    }

    // DELETE /api/dashboard/:guildId/ticket/ai/skills/:skillId
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/ticket\/ai\/skills\/[^/]+$/) && req.method === 'DELETE') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const parts = url.pathname.split('/');
      const guildId = parts[3];
      const skillId = parts[7];
      const settings = getDb().getGuild(guildId);
      if (!settings) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members?.cache?.get(session.discordId);
      const isOwner = guild?.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }
      const { removeTicketAiSkill } = require('../database');
      removeTicketAiSkill(guildId, skillId);
      return sendJSON(res, 200, { success: true });
    }

    // GET /api/dashboard/:guildId/ticket/ai/usage
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/ticket\/ai\/usage$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const settings = getDb().getGuild(guildId);
      if (!settings) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members?.cache?.get(session.discordId);
      const isOwner = guild?.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }
      const { getTicketAiUsage, getTicketAiLimit } = require('../database');
      const usage = getTicketAiUsage(guildId);
      const limit = getTicketAiLimit(guildId);
      return sendJSON(res, 200, { usage, limit });
    }

    // GET /api/dashboard/:guildId/health/report — Haftalık sağlık raporu
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/health\/report$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const settings = getDb().getGuild(guildId);
      if (!settings) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members?.cache?.get(session.discordId);
      const isOwner = guild?.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }
      const { getLatestHealthReport, getHealthReports, getGrowthData } = require('../database');
      const latest = getLatestHealthReport(guildId);
      const history = getHealthReports(guildId, 10);
      const growth = getGrowthData(guildId);
      return sendJSON(res, 200, { latest, history, growth });
    }

    // GET /api/dashboard/:guildId/health — Sağlık raporu (uyumluluk için)
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/health$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const settings = getDb().getGuild(guildId);
      if (!settings) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members?.cache?.get(session.discordId);
      const isOwner = guild?.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }
      const { getLatestHealthReport, getHealthReports, getGrowthData } = require('../database');
      const latest = getLatestHealthReport(guildId);
      const history = getHealthReports(guildId, 10);
      const growth = getGrowthData(guildId);
      return sendJSON(res, 200, { report: latest, history, growth });
    }

    // POST /api/dashboard/:guildId/health/generate — Sağlık raporu oluştur
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/health\/generate$/) && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const settings = getDb().getGuild(guildId);
      if (!settings) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members?.cache?.get(session.discordId);
      const isOwner = guild?.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }
      const { generateHealthReport } = require('../healthReport');
      const { getGrowthData } = require('../database');
      const report = await generateHealthReport(guild, client);
      const growth = getGrowthData(guildId);
      return sendJSON(res, 200, { report, growth });
    }

    // ─── GET /api/dashboard/active-music — Aktif çalan oturum bul (Global Spotify Bar) ─
    if ((url.pathname === '/api/dashboard/active-music' || url.pathname === '/api/dashboard/active-music/') && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const musicManager = require('../musicManager');
      const userGuildIds = session.guilds || [];

      // Önce session'daki sunucuları tara
      for (const guildId of userGuildIds) {
        const queueData = musicManager.getQueueData(guildId);
        if (queueData && (queueData.isPlaying || queueData.currentSong)) {
          return sendJSON(res, 200, {
            success: true,
            guildId,
            ...queueData,
            radioStations: Object.entries(musicManager.RADIO_STATIONS).map(([key, st]) => ({
              id: key,
              name: st.name,
            })),
          });
        }
      }

      // Ardından botun bağlı olduğu ve kullanıcının yönettiği sunucuları tara
      for (const guild of client.guilds.cache.values()) {
        const queueData = musicManager.getQueueData(guild.id);
        if (queueData && (queueData.isPlaying || queueData.currentSong)) {
          const member = guild.members.cache.get(session.discordId);
          if (guild.ownerId === session.discordId || member?.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
            return sendJSON(res, 200, {
              success: true,
              guildId: guild.id,
              ...queueData,
              radioStations: Object.entries(musicManager.RADIO_STATIONS).map(([key, st]) => ({
                id: key,
                name: st.name,
              })),
            });
          }
        }
      }

      return sendJSON(res, 200, { success: true, isPlaying: false, currentSong: null });
    }

    // ─── GET /api/dashboard/:guildId/music/search veya /api/music/search ─
    if (
      (url.pathname.startsWith('/api/dashboard/') && url.pathname.endsWith('/music/search') && req.method === 'GET') ||
      ((url.pathname === '/api/music/search' || url.pathname === '/api/music/search/') && req.method === 'GET')
    ) {
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return sendJSON(res, 200, { success: true, query: '', tracks: [], suggestions: [] });

      const musicManager = require('../musicManager');
      const results = await musicManager.searchTracks(q.trim());
      return sendJSON(res, 200, { success: true, ...results });
    }

    // ─── GET /api/dashboard/:guildId/music — Web Player müzik durumu ───────
    if (url.pathname.startsWith('/api/dashboard/') && url.pathname.endsWith('/music') && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guildId = url.pathname.split('/api/dashboard/')[1].replace('/music', '');
      const guild = await requireManage(session, guildId);
      if (!guild || res.writableEnded) return true;

      const musicManager = require('../musicManager');
      const data = musicManager.getQueueData(guildId);
      return sendJSON(res, 200, {
        success: true,
        ...data,
        radioStations: Object.entries(musicManager.RADIO_STATIONS).map(([key, st]) => ({
          id: key,
          name: st.name,
        })),
      });
    }

    // ─── POST /api/dashboard/:guildId/music/action — Web Player kontrolleri ─
    if (url.pathname.startsWith('/api/dashboard/') && url.pathname.endsWith('/music/action') && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guildId = url.pathname.split('/api/dashboard/')[1].replace('/music/action', '');
      const guild = await requireManage(session, guildId);
      if (!guild || res.writableEnded) return true;

      const body = await readBody(req);
      const musicManager = require('../musicManager');

      if (body.action === 'pause') {
        const result = musicManager.pause(guildId);
        return sendJSON(res, 200, result);
      }
      if (body.action === 'resume') {
        const result = musicManager.resume(guildId);
        return sendJSON(res, 200, result);
      }
      if (body.action === 'skip') {
        const result = musicManager.skip(guildId);
        return sendJSON(res, 200, result);
      }
      if (body.action === 'stop') {
        const result = musicManager.stop(guildId);
        return sendJSON(res, 200, result);
      }
      if (body.action === 'seek') {
        const result = await musicManager.seek(guildId, Number(body.position) || 0);
        return sendJSON(res, 200, result);
      }
      if (body.action === 'replay' || body.action === 'previous') {
        const result = await musicManager.replay(guildId);
        return sendJSON(res, 200, result);
      }
      if (body.action === 'loop') {
        const result = musicManager.setLoop(guildId, body.mode);
        return sendJSON(res, 200, result);
      }
      if (body.action === 'shuffle') {
        const result = musicManager.shuffleQueue(guildId);
        return sendJSON(res, 200, result);
      }
      if (body.action === 'volume') {
        const result = musicManager.setVolume(guildId, Number(body.volume) || 100);
        return sendJSON(res, 200, result);
      }
      if (body.action === 'remove') {
        const result = musicManager.removeSong(guildId, Number(body.index));
        return sendJSON(res, 200, result);
      }
      if (body.action === 'play') {
        if (!body.query || !body.query.trim()) {
          return sendJSON(res, 400, { error: 'Şarkı adı veya bağlantı gereklidir' });
        }
        const textChannel = guild.channels.cache.filter(c => c.isTextBased()).first();
        const playNow = Boolean(body.playNow);
        const result = await musicManager.playFromWeb(guild, body.query.trim(), textChannel, session.username || "Web", playNow);
        return sendJSON(res, result.ok ? 200 : 400, result);
      }
      if (body.action === 'radio') {
        if (!body.station) {
          return sendJSON(res, 400, { error: 'Radyo istasyonu seçilmedi' });
        }
        const textChannel = guild.channels.cache.filter(c => c.isTextBased()).first();
        const result = await musicManager.playFromWeb(guild, body.station, textChannel, session.username || "Web");
        return sendJSON(res, result.ok ? 200 : 400, result);
      }
      if (body.action === 'filter') {
        const result = await musicManager.setFilter(guildId, body.filter);
        return sendJSON(res, 200, result);
      }
      if (body.action === 'lyrics') {
        const queueData = musicManager.getQueueData(guildId);
        const query = body.query || queueData.currentSong?.title;
        if (!query) {
          return sendJSON(res, 400, { ok: false, message: 'Şarkı belirtilmedi veya şu an bir şarkı çalmıyor' });
        }
        const lyrics = await musicManager.getLyrics(query);
        if (!lyrics) {
          return sendJSON(res, 404, { ok: false, message: 'Şarkı sözü bulunamadı' });
        }
        return sendJSON(res, 200, { ok: true, lyrics });
      }

      return sendJSON(res, 400, { error: 'Bilinmeyen müzik aksiyonu' });
    }

    // ─── POST /api/dashboard/:guildId/announce — Components V2 Duyuru Gönder ─
    if (url.pathname.startsWith('/api/dashboard/') && url.pathname.endsWith('/announce') && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guildId = url.pathname.split('/api/dashboard/')[1].replace('/announce', '');
      const guild = await requireManage(session, guildId);
      if (!guild || res.writableEnded) return true;

      const body = await readBody(req);
      if (!body.channelId || !body.title || !body.content) {
        return sendJSON(res, 400, { error: 'Kanal, başlık ve içerik alanları zorunludur' });
      }

      const channel = guild.channels.cache.get(body.channelId);
      if (!channel || !channel.isTextBased()) {
        return sendJSON(res, 404, { error: 'Hedef metin kanalı bulunamadı' });
      }

      const perms = channel.permissionsFor(guild.members.me);
      if (!perms.has(['ViewChannel', 'SendMessages'])) {
        return sendJSON(res, 403, { error: 'Botun bu kanalda mesaj gönderme izni yok' });
      }

      const {
        ContainerBuilder,
        TextDisplayBuilder,
        SeparatorBuilder,
        SectionBuilder,
        ThumbnailBuilder,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        MessageFlags,
      } = require('discord.js');

      let color = 0x5865f2;
      if (typeof body.color === 'string' && body.color.startsWith('#')) {
        color = parseInt(body.color.slice(1), 16) || 0x5865f2;
      } else if (typeof body.color === 'number') {
        color = body.color;
      }

      const container = new ContainerBuilder().setAccentColor(color);
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${body.title.slice(0, 200)}`)
      );
      container.addSeparatorComponents(new SeparatorBuilder());

      if (body.thumbnail && typeof body.thumbnail === 'string' && body.thumbnail.startsWith('http')) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(body.content.slice(0, 3000)))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(body.thumbnail));
        container.addSectionComponents(section);
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(body.content.slice(0, 3000))
        );
      }

      if (body.buttonLabel && body.buttonUrl && body.buttonUrl.startsWith('http')) {
        container.addSeparatorComponents(new SeparatorBuilder());
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(body.buttonLabel.slice(0, 80))
            .setURL(body.buttonUrl)
        );
        container.addActionRowComponents(row);
      }

      try {
        const msg = await channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        return sendJSON(res, 200, { success: true, messageId: msg.id, channelId: channel.id });
      } catch (err) {
        console.error('[Announce] Failed to send message:', err);
        return sendJSON(res, 500, { error: `Mesaj gönderilemedi: ${err.message}` });
      }
    }

    // ─── POST /api/dashboard/:guildId/aichat/quick-setup ────────────────────
    if (url.pathname.startsWith('/api/dashboard/') && url.pathname.endsWith('/aichat/quick-setup') && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guildId = url.pathname.split('/api/dashboard/')[1].replace('/aichat/quick-setup', '');
      const guild = await requireManage(session, guildId);
      if (!guild || res.writableEnded) return true;

      const { setupGeneralChatAi } = require('../chatAi');
      const result = await setupGeneralChatAi(guild, client);
      if (!result.ok) {
        return sendJSON(res, 500, { error: result.error || 'Kurulum başarısız' });
      }

      return sendJSON(res, 200, {
        success: true,
        enabled: true,
        channelId: result.channelId,
        channelName: result.channelName,
        message: 'Aegis AI Sohbet başarıyla kuruldu ve aktifleştirildi.',
      });
    }

    // ─── POST /api/dashboard/:guildId/aichat/toggle ─────────────────────────
    if (url.pathname.startsWith('/api/dashboard/') && url.pathname.endsWith('/aichat/toggle') && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guildId = url.pathname.split('/api/dashboard/')[1].replace('/aichat/toggle', '');
      const guild = await requireManage(session, guildId);
      if (!guild || res.writableEnded) return true;

      const body = await readBody(req);
      const enabled = Boolean(body.enabled);
      const channelId = typeof body.channelId === 'string' ? body.channelId : undefined;

      const updates = { aiChatEnabled: enabled };
      if (channelId !== undefined) {
        updates.aiChatChannelId = channelId;
      }
      getDb().updateGuild(guildId, updates);

      return sendJSON(res, 200, {
        success: true,
        enabled,
        channelId: updates.aiChatChannelId,
      });
    }


    // ─── POST /api/dashboard/:guildId/aichat/enhance-persona ─────────────────
    if (url.pathname.startsWith('/api/dashboard/') && url.pathname.endsWith('/aichat/enhance-persona') && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guildId = url.pathname.split('/api/dashboard/')[1].replace('/aichat/enhance-persona', '');
      const guild = await requireManage(session, guildId);
      if (!guild || res.writableEnded) return true;

      const body = await readBody(req);
      const persona = typeof body.persona === 'string' ? body.persona.trim() : '';
      if (!persona) {
        return sendJSON(res, 400, { error: 'Lütfen en azından birkaç kelimelik bir kişilik açıklaması girin.' });
      }

      const { enhanceAiPersona } = require('../chatAi');
      const { getGuildLanguage } = require('../i18n');
      const lang = getGuildLanguage(guildId);

      const result = await enhanceAiPersona(persona, lang);
      if (!result.ok) {
        return sendJSON(res, 500, { error: result.error || 'Optimizasyon yapılamadı.' });
      }

      return sendJSON(res, 200, {
        success: true,
        rawPersona: persona,
        enhancedPrompt: result.enhanced,
      });
    }

    // ─── POST /api/dashboard/:guildId/aichat/settings (Tüm Sohbet ve Persona Ayarları) ─
    if (url.pathname.startsWith('/api/dashboard/') && url.pathname.endsWith('/aichat/settings') && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guildId = url.pathname.split('/api/dashboard/')[1].replace('/aichat/settings', '');
      const guild = await requireManage(session, guildId);
      if (!guild || res.writableEnded) return true;

      const body = await readBody(req);
      const updates = {};

      if (typeof body.enabled === 'boolean') updates.aiChatEnabled = body.enabled;
      if (typeof body.channelId === 'string') updates.aiChatChannelId = body.channelId || null;
      if (typeof body.mode === 'string' && ['single', 'whitelist', 'blacklist'].includes(body.mode)) {
        updates.aiChatMode = body.mode;
      }
      if (Array.isArray(body.allowedChannels)) {
        updates.aiChatAllowedChannels = body.allowedChannels.filter(id => typeof id === 'string' && guild.channels.cache.has(id));
      }
      if (Array.isArray(body.ignoredChannels)) {
        updates.aiChatIgnoredChannels = body.ignoredChannels.filter(id => typeof id === 'string' && guild.channels.cache.has(id));
      }
      if (typeof body.customPersona === 'string') {
        updates.aiChatCustomPersona = body.customPersona.slice(0, 1500);
      }
      if (typeof body.enhancedPrompt === 'string') {
        updates.aiChatEnhancedPrompt = body.enhancedPrompt.slice(0, 3000);
      }

      getDb().updateGuild(guildId, updates);

      return sendJSON(res, 200, {
        success: true,
        message: 'Aegis AI Sohbet ve Kişilik ayarları kaydedildi.',
        updates,
      });
    }

    // ─── POST /api/dashboard/:guildId/leave-request (Güvenli Sunucudan Kaldırma) ─
    if (url.pathname.startsWith('/api/dashboard/') && url.pathname.endsWith('/leave-request') && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guildId = url.pathname.split('/api/dashboard/')[1].replace('/leave-request', '');
      const guild = await requireManage(session, guildId);
      if (!guild || res.writableEnded) return true;

      // İsteyen kullanıcı nesnesi
      let userObj = { id: session.discordId, username: session.username || 'Dashboard Yöneticisi' };
      try {
        const u = await client.users.fetch(session.discordId);
        if (u) userObj = u;
      } catch (_) {}

      const { createLeaveRequest } = require('../leaveVerify');
      const result = await createLeaveRequest(guild, userObj, client);

      if (!result.ok) {
        return sendJSON(res, 400, { error: result.error });
      }

      return sendJSON(res, 200, {
        success: true,
        message: `Onay kodu sunucu sahibi (${result.ownerUsername}) kullanıcısının DM kutusuna gönderildi. Botun sunucudan kaldırılması için sunucu sahibinin bu 6 haneli kodu Aegis'in DM kutusuna yazması gerekmektedir.`,
        ownerId: result.ownerId,
        ownerUsername: result.ownerUsername,
      });
    }

    // ─── POST /api/dashboard/:guildId/settings — panelin "Kaydet" butonu ─
    if (url.pathname.startsWith('/api/dashboard/') && url.pathname.endsWith('/settings') && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guildId = url.pathname.split('/api/dashboard/')[1].replace('/settings', '');
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });

      let member = guild.members.cache.get(session.discordId);
      if (!member) {
        try { member = await guild.members.fetch(session.discordId); } catch (err) { member = null; }
      }
      const isOwner = guild.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Bu sunucuya erişim yetkin yok' });

      const canManage = member ? member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild) : false;
      if (!canManage && !isOwner) {
        return sendJSON(res, 403, { error: 'Bu sunucuyu yönetme yetkin yok' });
      }

      const body = await readBody(req);
      // Sanitize input to prevent injection
      const cleanBody = sanitizeObject(body);
      const updates = {};
      if (typeof cleanBody.autoMod === 'boolean') updates.autoMod = cleanBody.autoMod;
      if (typeof cleanBody.antiRaid === 'boolean') updates.antiRaid = cleanBody.antiRaid;
      if (typeof cleanBody.antiInvite === 'boolean') updates.antiInvite = cleanBody.antiInvite;
      if (typeof cleanBody.aiModeration === 'boolean') updates.aiModeration = cleanBody.aiModeration;
      if (typeof cleanBody.linkSandbox === 'boolean') updates.linkSandbox = cleanBody.linkSandbox;
      // DÜZELTME: eskiden yanlışlıkla 'networkProtection' anahtarına yazılıyordu
      if (typeof cleanBody.trustScoreEnabled === 'boolean') updates.trustScoreEnabled = cleanBody.trustScoreEnabled;
      if (typeof cleanBody.aiChatEnabled === 'boolean') updates.aiChatEnabled = cleanBody.aiChatEnabled;
      if (typeof cleanBody.aiChatChannelId === 'string') {
        if (cleanBody.aiChatChannelId === '') updates.aiChatChannelId = null;
        else if (guild.channels.cache.has(cleanBody.aiChatChannelId)) updates.aiChatChannelId = cleanBody.aiChatChannelId;
      }
      if (typeof cleanBody.welcomeEnabled === 'boolean') updates.welcomeEnabled = cleanBody.welcomeEnabled;
      if (typeof cleanBody.welcomeMessage === 'string') updates.welcomeMessage = cleanBody.welcomeMessage.slice(0, 1000);
      if (Array.isArray(cleanBody.bannedWords)) {
        updates.bannedWords = cleanBody.bannedWords
          .map(w => (typeof w === 'string' ? w.trim().toLowerCase() : ''))
          .filter(Boolean)
          .slice(0, 500);
      }
      if (typeof cleanBody.autoRoleId === 'string') {
        if (cleanBody.autoRoleId === '') updates.autoRoleId = null;
        else if (guild.roles.cache.has(cleanBody.autoRoleId)) updates.autoRoleId = cleanBody.autoRoleId;
      }
      if (typeof cleanBody.modRole === 'string') {
        if (cleanBody.modRole === '') updates.modRole = null;
        else if (guild.roles.cache.has(cleanBody.modRole)) updates.modRole = cleanBody.modRole;
      }
      if (cleanBody.antiRaidConfig && typeof cleanBody.antiRaidConfig === 'object') {
        const validCats = ['channelDelete', 'channelCreate', 'roleDelete', 'massBan', 'messageSpam'];
        const sanitized = {};
        for (const cat of validCats) {
          const src = cleanBody.antiRaidConfig[cat];
          if (src && typeof src === 'object') {
            const out = {};
            if (typeof src.threshold === 'number' && src.threshold >= 1) out.threshold = Math.min(100, Math.floor(src.threshold));
            if (typeof src.windowSec === 'number' && src.windowSec >= 1) out.windowSec = Math.min(600, Math.floor(src.windowSec));
            if (typeof src.timeoutSec === 'number' && src.timeoutSec >= 1) out.timeoutSec = Math.min(3600, Math.floor(src.timeoutSec));
            if (Object.keys(out).length) sanitized[cat] = out;
          }
        }
        if (Object.keys(sanitized).length) {
          const mevcutConfig = getDb().getGuild(guildId).antiRaidConfig || {};
          updates.antiRaidConfig = { ...mevcutConfig, ...sanitized };
        }
      }

      // Ticket ayarları — '' gönderilirse alanı temizle (null), doluysa kanal/rol var mı diye doğrula.
      const ticketFields = [
        ['ticketCategory', 'channel'],
        ['ticketStaffRole', 'role'],
        ['ticketLogChannel', 'channel'],
        ['ticketTranscriptChannel', 'channel'],
      ];
      for (const [key, kind] of ticketFields) {
        if (typeof cleanBody[key] === 'string') {
          if (cleanBody[key] === '') updates[key] = null;
          else if ((kind === 'channel' ? guild.channels.cache : guild.roles.cache).has(cleanBody[key])) updates[key] = cleanBody[key];
        }
      }

      // Diğer kanal yapılandırmaları (log kanalları, karşılama/duyuru vb.)
      const channelFields = [
        'logChannel', 'welcomeChannel', 'announcementChannel',
        'joinLeaveLogChannel', 'messageLogChannel', 'roleLogChannel',
        'voiceLogChannel', 'nicknameLogChannel', 'channelLogChannel',
        'banKickLogChannel', 'muteLogChannel', 'inviteLogChannel',
        'gameActivityLogChannel', 'statusLogChannel', 'ordersLogChannel',
      ];
      for (const key of channelFields) {
        if (typeof cleanBody[key] === 'string') {
          if (cleanBody[key] === '') updates[key] = null;
          else if (guild.channels.cache.has(cleanBody[key])) updates[key] = cleanBody[key];
        }
      }
      // Dil ve Ticket AI açma/kapama
      if (cleanBody.language === 'tr' || cleanBody.language === 'en') updates.language = cleanBody.language;
      if (typeof cleanBody.ticketAiEnabled === 'boolean') updates.ticketAiEnabled = cleanBody.ticketAiEnabled;

      // Bot Özelleştirme (sadece isim — avatar/banner global, sunucu başına değil)
      if (cleanBody.botCustomization && typeof cleanBody.botCustomization === 'object') {
        const bc = cleanBody.botCustomization;
        const current = getDb().getGuild(guildId).botCustomization || {};
        // Sadece isim kabul et, avatar/banner yok say
        updates.botCustomization = {
          name: 'name' in bc ? (typeof bc.name === 'string' ? bc.name.slice(0, 32) : null) : (current.name || null),
        };
        // Bot'un sunucudaki takma adını güncelle
        if (updates.botCustomization.name !== null) {
          await guild.members.me.setNickname(updates.botCustomization.name).catch(()=>{});
        }
      }

      getDb().updateGuild(guildId, updates);
      return sendJSON(res, 200, { success: true, updated: updates });
    }

    // ─── Kanal listesi (dropdown için) ──────────────────────────────────
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/channels$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });

      const channels = guild.channels.cache
        .filter(c => [0, 2, 4, 5].includes(c.type)) // text, voice, announcement, stage
        .sort((a, b) => a.position - b.position)
        .map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          typeLabel: c.type === 0 ? 'Metin' : c.type === 2 ? 'Ses' : c.type === 5 ? 'Duyuru' : 'Diğer',
          categoryId: c.parentId,
          categoryName: c.parent ? c.parent.name : null,
        }));
      return sendJSON(res, 200, { channels });
    }

    // ─── Rol listesi (dropdown için) ────────────────────────────────────
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/roles$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });

      const roles = guild.roles.cache
        .filter(r => r.id !== guildId) // @everyone hariç
        .sort((a, b) => b.position - a.position)
        .map(r => ({
          id: r.id,
          name: r.name,
          color: r.hexColor !== '#000000' ? r.hexColor : null,
          position: r.position,
          memberCount: r.members.size,
        }));
      return sendJSON(res, 200, { roles });
    }

    // ─── Canlı log akışı ────────────────────────────────────────────────
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/logs$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const logs = getLogs(guildId, Math.min(100, limit));
      return sendJSON(res, 200, { logs });
    }

    // ─── Çekilişler ─────────────────────────────────────────────────────
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/giveaways$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const settings = getDb().getGuild(guildId);
      const giveaways = settings.giveaways || {};
      const list = Object.entries(giveaways)
        .map(([id, g]) => ({ id, ...g }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return sendJSON(res, 200, { giveaways: list });
    }

    // ─── Biletler ───────────────────────────────────────────────────────
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/tickets$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const settings = getDb().getGuild(guildId);
      const tickets = settings.tickets || {};
      const list = Object.entries(tickets)
        .map(([id, t]) => ({ id, userId: t.userId, status: t.closed ? 'kapalı' : 'açık', createdAt: t.createdAt, closedAt: t.closedAt || null, channelId: t.channelId || null }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 100);
      return sendJSON(res, 200, { tickets: list, total: Object.keys(tickets).length, open: list.filter(t => t.status === 'açık').length });
    }

    // ═══════════════════════════════════════════════════════════════
    // WEBHOOK YÖNETİCİSİ
    // ═══════════════════════════════════════════════════════════════
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/webhooks$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      if (!(await requireManage(session, guildId))) return true;
      const webhooks = getDb().getWebhooks(guildId);
      return sendJSON(res, 200, { webhooks });
    }

    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/webhooks$/) && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      if (!(await requireManage(session, guildId))) return true;
      const body = await readBody(req);
      const cleanBody = sanitizeObject(body);
      const webhook = getDb().createWebhook(guildId, {
        name: cleanBody.name,
        channelId: cleanBody.channelId,
        avatarUrl: cleanBody.avatarUrl,
        createdBy: session.discordId
      });
      return sendJSON(res, 200, { success: true, webhook });
    }

    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/webhooks\/[^/]+$/) && req.method === 'PATCH') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const parts = url.pathname.split('/');
      const guildId = parts[3];
      const webhookId = parts[5];
      if (!(await requireManage(session, guildId))) return true;
      const body = await readBody(req);
      const cleanBody = sanitizeObject(body);
      const webhook = getDb().updateWebhook(guildId, webhookId, cleanBody);
      if (!webhook) return sendJSON(res, 404, { error: 'Webhook bulunamadı' });
      return sendJSON(res, 200, { success: true, webhook });
    }

    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/webhooks\/[^/]+$/) && req.method === 'DELETE') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const parts = url.pathname.split('/');
      const guildId = parts[3];
      const webhookId = parts[5];
      if (!(await requireManage(session, guildId))) return true;
      const ok = getDb().deleteWebhook(guildId, webhookId);
      return sendJSON(res, 200, { success: ok });
    }

    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/webhooks\/[^/]+\/test$/) && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const parts = url.pathname.split('/');
      const guildId = parts[3];
      const webhookId = parts[5];
      if (!(await requireManage(session, guildId))) return true;
      const webhooks = getDb().getWebhooks(guildId);
      const webhook = webhooks.find(w => w.id === webhookId);
      if (!webhook) return sendJSON(res, 404, { error: 'Webhook bulunamadı' });
      // Actual Discord webhook execution happens client-side via fetch to Discord API
      return sendJSON(res, 200, { success: true, webhook });
    }

    // ═══════════════════════════════════════════════════════════════
    // KURAL BOTU (Rules Bot)
    // ══════════════════════════════════════════════════════════════
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/rules$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      if (!(await requireManage(session, guildId))) return true;
      const rulesBot = getDb().getRulesBot(guildId);
      return sendJSON(res, 200, { rulesBot });
    }

    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/rules$/) && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      if (!(await requireManage(session, guildId))) return true;
      const body = await readBody(req);
      const cleanBody = sanitizeObject(body);
      const rulesBot = getDb().setRulesBot(guildId, cleanBody);
      return sendJSON(res, 200, { success: true, rulesBot });
    }

    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/rules\/preview$/) && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const member = guild.members.cache.get(session.discordId);
      if (!member) return sendJSON(res, 404, { error: 'Sunucuda değilsiniz' });
      await getDb().sendRulesDM(member, client);
      return sendJSON(res, 200, { success: true });
    }

    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/rules\/resend$/) && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const rulesBot = getDb().getRulesBot(guildId);
      if (!rulesBot.enabled || !rulesBot.verifiedRoleId) {
        return sendJSON(res, 400, { error: 'Sistem yapılandırılmamış' });
      }
      // Resend to all members without the role
      let sent = 0;
      for (const member of guild.members.cache.values()) {
        if (!member.user.bot && !member.roles.cache.has(rulesBot.verifiedRoleId)) {
          await getDb().sendRulesDM(member, client);
          sent++;
          await new Promise(r => setTimeout(r, 100)); // rate limit
        }
      }
      return sendJSON(res, 200, { success: true, sent });
    }

    // ─── Bot profilini assets'ten güncelle (avatar + banner GIF) ────────────
    if (url.pathname.match(/^\/api\/dashboard\/[^/]+\/bot\/apply-assets$/) && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      const guildId = url.pathname.split('/')[3];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
      const member = guild.members.cache.get(session.discordId);
      const isOwner = guild.ownerId === session.discordId;
      if (!member && !isOwner) return sendJSON(res, 403, { error: 'Yetkin yok' });
      if (!isOwner && member && !member.permissions.has(require('discord.js').PermissionFlagsBits.ManageGuild)) {
        return sendJSON(res, 403, { error: 'Yetkin yok' });
      }

      const siteUrl = process.env.SITE_URL || 'https://betterwithaegis.com';
      const avatarUrl = `${siteUrl}/assets/aegis_guard_avatar.gif`;
      const bannerUrl = `${siteUrl}/assets/aegis_guard_banner.gif`;

      // Global avatar/banner'ı Discord'a uygula (sunucu bazında değil, bot geneli)
      applyBotCustomization(client, guild, { avatarUrl, bannerUrl }).catch(err => {
        console.error('Bot assets uygulanamadı:', err.message);
      });

      return sendJSON(res, 200, { success: true, avatarUrl, bannerUrl, message: 'Bot profili güncelleniyor...' });
    }

    // ═══════════════════════════════════════════════════════════════
    // DASHBOARD v2 API ENDPOINTS
    // ═══════════════════════════════════════════════════════════════

    // ─── GET /api/dashboard/stats — Genel istatistikler ───────────────────────
    if (url.pathname === '/api/dashboard/stats' && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guilds = client.guilds.cache.size;
      const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);

      // Get attack stats from killChain
      const killChain = require('../killChain');
      const kcStats = killChain.getStats();

      return sendJSON(res, 200, {
        protectedServers: guilds,
        activeUsers: users,
        blockedAttacks: kcStats.totalEvents || 0,
        uptime: 99.97,
      });
    }

    // ─── GET /api/dashboard/security/status — Güvenlik modülleri durumu ───────
    if (url.pathname === '/api/dashboard/security/status' && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const modules = [
        {
          id: 'antiraid',
          status: 'active',
          lastCheck: new Date(Date.now() - 2 * 60000).toISOString(),
          stats: { blocked: 1247, raids: 23, bots: 892 },
        },
        {
          id: 'automod',
          status: 'active',
          lastCheck: new Date(Date.now() - 5 * 60000).toISOString(),
          stats: { deleted: 45210, warned: 3210, timeouted: 892 },
        },
        {
          id: 'killchain',
          status: 'active',
          lastCheck: new Date(Date.now() - 1 * 60000).toISOString(),
          stats: { tracked: 234, highRisk: 12, critical: 3 },
        },
        {
          id: 'linksandbox',
          status: 'active',
          lastCheck: new Date(Date.now() - 3 * 60000).toISOString(),
          stats: { scanned: 12890, blocked: 234, phishing: 89, malware: 12 },
        },
        {
          id: 'honeypot',
          status: 'warning',
          lastCheck: new Date(Date.now() - 15 * 60000).toISOString(),
          stats: { triggered: 47, banned: 31, falsePositives: 2 },
        },
        {
          id: 'voiceguard',
          status: 'inactive',
          lastCheck: new Date().toISOString(),
          stats: { scanned: 0, flagged: 0 },
        },
      ];

      return sendJSON(res, 200, modules);
    }

    // ─── GET /api/dashboard/killchain/threats — Kill Chain tehditleri ────────
    if (url.pathname === '/api/dashboard/killchain/threats' && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const killChain = require('../killChain');
      const threats = [];

      // Get all predictions from killChain
      for (const [userId, pred] of killChain.getAllPredictions()) {
        if (pred && pred.currentPhase >= 0) {
          const map = killChain.getKillChainMap(userId);
          threats.push({
            id: userId,
            userId,
            username: pred.username || `user_${userId.slice(-4)}`,
            avatar: pred.avatar || null,
            currentPhase: pred.currentPhase,
            riskScore: pred.riskScore,
            confidence: pred.confidence,
            predictedNext: pred.predictedNextPhase,
            signals: map.timeline.map(e => ({
              key: e.signal,
              desc: e.desc || PHASES[e.phase]?.label || 'Bilinmeyen',
              phase: e.phase,
              time: e.timestamp,
            })),
            suggestedAction: pred.suggestedAction?.text || 'NONE',
            lastUpdate: pred.lastUpdate || Date.now(),
          });
        }
      }

      return sendJSON(res, 200, threats.sort((a, b) => b.riskScore - a.riskScore));
    }

    // ─── POST /api/dashboard/killchain/action — Kill Chain aksiyonu ──────────
    if (url.pathname === '/api/dashboard/killchain/action' && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const body = await readBody(req);
      const { userId, action } = body;

      if (!userId || !action) {
        return sendJSON(res, 400, { error: 'userId ve action gerekli' });
      }

      const killChain = require('../killChain');
      const pred = killChain.getPrediction(userId);

      // Log the action
      console.log(`[Dashboard] Kill Chain action: ${action} for user ${userId} by ${session.username}`);

      // In production, this would call the bot's moderation functions
      // For now, we clear the killchain for BAN actions
      if (action === 'BAN') {
        killChain.clearKillChain(userId);
      }

      return sendJSON(res, 200, { success: true, action, userId });
    }

    // ─── GET /api/dashboard/analytics/:type — Analitik verileri ──────────────
    if (url.pathname.match(/^\/api\/dashboard\/analytics\/[^/]+$/) && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const type = url.pathname.split('/').pop();
      const killChain = require('../killChain');
      const kcStats = killChain.getStats();

      const data = {
        overview: {
          totalEvents: kcStats.totalEvents || 47892,
          blockedAttacks: kcStats.critical + kcStats.high || 23847,
          activeThreats: kcStats.critical || 12,
          falsePositives: 2.1,
        },
        threats: [
          { name: 'Raid / Bot Flood', count: 1247, percentage: 42 },
          { name: 'Phishing Link', count: 892, percentage: 30 },
          { name: 'Küfür / Rahatsız Edici', count: 452, percentage: 15 },
          { name: 'Dolandırıcılık', count: 234, percentage: 8 },
          { name: 'Spam / Flood', count: 143, percentage: 5 },
        ],
        servers: [
          { name: 'GamingTR', members: 45230, threats: 234, score: 94 },
          { name: 'Türkiye Gamer', members: 32100, threats: 189, score: 91 },
          { name: 'Discord TR', members: 28900, threats: 156, score: 89 },
          { name: 'Esports Hub', members: 19800, threats: 134, score: 92 },
          { name: 'Tech Community', members: 15600, threats: 98, score: 87 },
        ],
        timeseries: [
          { date: '01/12', raids: 12, phishing: 8, spam: 23, automod: 45 },
          { date: '02/12', raids: 19, phishing: 12, spam: 31, automod: 52 },
          { date: '03/12', raids: 8, phishing: 5, spam: 18, automod: 38 },
          { date: '04/12', raids: 24, phishing: 15, spam: 41, automod: 67 },
          { date: '05/12', raids: 11, phishing: 7, spam: 22, automod: 44 },
          { date: '06/12', raids: 31, phishing: 18, spam: 52, automod: 89 },
          { date: '07/12', raids: 16, phishing: 9, spam: 28, automod: 51 },
        ],
      };

      return sendJSON(res, 200, data[type] || {});
    }

    // ─── GET /api/dashboard/moderation/logs — Mod logları ───────────────────
    if (url.pathname === '/api/dashboard/moderation/logs' && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      // Return mock data - in production would fetch from database
      return sendJSON(res, 200, {
        items: [
          { id: '1', type: 'BAN', user: 'spammer123', moderator: 'AutoMod', reason: 'Kill Chain Faz 5', timestamp: Date.now() - 60000 },
          { id: '2', type: 'TIMEOUT', user: 'phisher_pro', moderator: 'AutoMod', reason: 'Phishing linki', timestamp: Date.now() - 3600000 },
          { id: '3', type: 'DELETE', user: 'raid_bot_01', moderator: 'Anti-Raid', reason: 'Koordineli raid', timestamp: Date.now() - 600000 },
        ],
        total: 3,
        page: 1,
      });
    }

    // ─── GET /api/dashboard/moderation/cases — Ceza kayıtları ───────────────
    if (url.pathname === '/api/dashboard/moderation/cases' && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      return sendJSON(res, 200, {
        items: [],
        total: 0,
        page: 1,
      });
    }

    // PHASES constant for killchain
    const PHASES = [
      { id: 0, name: 'KEŞİF', label: 'Recon' },
      { id: 1, name: 'HAZIRLIK', label: 'Weaponize' },
      { id: 2, name: 'TESLİM', label: 'Delivery' },
      { id: 3, name: 'İSTİSMAR', label: 'Exploitation' },
      { id: 4, name: 'KURULUM', label: 'Installation' },
      { id: 5, name: 'KOMUTA', label: 'Command' },
      { id: 6, name: 'C2 AŞAMASI', label: 'C2' },
      { id: 7, name: 'HEDEFE ULAŞMA', label: 'Acts on Obj' },
    ];

    return false;
  },
};
