// ─── NEXT-GEN FEATURES ROUTE (Anomali Kalkanı, Growth Advisor, Visual Studio) ─
const { getBearerToken, verifyToken, sendJSON, readBody } = require('./helpers');
const { getGuildAnomalyStatus, resolveQuarantine } = require('../anomalyDetector');
const { generateGrowthReport } = require('../growthAdvisor');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { logEvent } = require('../activityLog');

module.exports = {
  name: 'features',
  async handle(ctx) {
    const { req, res, url, client } = ctx;

    // Helper: oturum & yetki kontrolü
    async function checkAuthAndManage(guildId) {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) {
        sendJSON(res, 401, { error: 'Oturum açılmamış veya süresi dolmuş' });
        return null;
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
        return null;
      }

      let member = guild.members.cache.get(session.discordId);
      if (!member) {
        try { member = await guild.members.fetch(session.discordId); } catch { member = null; }
      }

      const isOwner = guild.ownerId === session.discordId;
      const isAdmin = member && member.permissions.has(PermissionFlagsBits.Administrator);
      const canManage = member && member.permissions.has(PermissionFlagsBits.ManageGuild);

      if (!isOwner && !isAdmin && !canManage) {
        sendJSON(res, 403, { error: 'Bu sunucuyu yönetme yetkiniz bulunmuyor' });
        return null;
      }

      return { guild, member: member || { user: { tag: session.username || 'Admin' } }, session };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. AI DAVRANIŞ ANOMALİSİ KALKANI ENDPOINTLERİ
    // ─────────────────────────────────────────────────────────────────────────

    // GET /api/guilds/:guildId/anomalies
    const anmMatch = url.pathname.match(/^\/api\/guilds\/(\d+)\/anomalies$/);
    if (anmMatch && req.method === 'GET') {
      const guildId = anmMatch[1];
      const auth = await checkAuthAndManage(guildId);
      if (!auth) return true;

      const status = getGuildAnomalyStatus(guildId);
      sendJSON(res, 200, status);
      return true;
    }

    // POST /api/guilds/:guildId/anomalies/resolve
    const anmResolveMatch = url.pathname.match(/^\/api\/guilds\/(\d+)\/anomalies\/resolve$/);
    if (anmResolveMatch && req.method === 'POST') {
      const guildId = anmResolveMatch[1];
      const auth = await checkAuthAndManage(guildId);
      if (!auth) return true;

      const body = await readBody(req);
      const { targetUserId, action } = body; // action: 'restore' | 'ban'
      if (!targetUserId || !action) {
        sendJSON(res, 400, { error: 'targetUserId ve action parametreleri zorunludur' });
        return true;
      }

      const result = await resolveQuarantine(auth.guild, targetUserId, action, auth.member);
      logEvent(guildId, 'QUARANTINE_RESOLVE', {
        action,
        targetUserId,
        by: auth.member.user?.tag,
      });

      sendJSON(res, result.ok ? 200 : 400, result);
      return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. AI GROWTH ADVISOR ENDPOINTLERİ
    // ─────────────────────────────────────────────────────────────────────────

    // GET /api/guilds/:guildId/advisor
    const advisorMatch = url.pathname.match(/^\/api\/guilds\/(\d+)\/advisor$/);
    if (advisorMatch && req.method === 'GET') {
      const guildId = advisorMatch[1];
      const auth = await checkAuthAndManage(guildId);
      if (!auth) return true;

      try {
        const report = await generateGrowthReport(auth.guild, false);
        sendJSON(res, 200, report);
      } catch (err) {
        sendJSON(res, 500, { error: 'Rapor üretilemedi: ' + err.message });
      }
      return true;
    }

    // POST /api/guilds/:guildId/advisor/refresh
    const advisorRefreshMatch = url.pathname.match(/^\/api\/guilds\/(\d+)\/advisor\/refresh$/);
    if (advisorRefreshMatch && req.method === 'POST') {
      const guildId = advisorRefreshMatch[1];
      const auth = await checkAuthAndManage(guildId);
      if (!auth) return true;

      try {
        const report = await generateGrowthReport(auth.guild, true);
        logEvent(guildId, 'GROWTH_ADVISOR_REFRESH', { by: auth.member.user?.tag });
        sendJSON(res, 200, report);
      } catch (err) {
        sendJSON(res, 500, { error: 'Yenileme başarısız: ' + err.message });
      }
      return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. GÖRSEL WEB TASARIM STÜDYOSU (VISUAL CANVAS & EMBED PUBLISHER)
    // ─────────────────────────────────────────────────────────────────────────

    // POST /api/guilds/:guildId/studio/publish
    const studioMatch = url.pathname.match(/^\/api\/guilds\/(\d+)\/studio\/publish$/);
    if (studioMatch && req.method === 'POST') {
      const guildId = studioMatch[1];
      const auth = await checkAuthAndManage(guildId);
      if (!auth) return true;

      const body = await readBody(req);
      const { channelId, content, embed, buttons } = body;

      if (!channelId) {
        sendJSON(res, 400, { error: 'Lütfen bir hedef kanal seçin' });
        return true;
      }

      const channel = auth.guild.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        sendJSON(res, 400, { error: 'Seçilen metin kanalı bulunamadı' });
        return true;
      }

      try {
        const messagePayload = {};
        if (content && typeof content === 'string' && content.trim().length > 0) {
          messagePayload.content = content.trim();
        }

        // Discord Components V2 Container oluştur
        if (embed) {
          const container = new ContainerBuilder();
          const colorHex = embed.color ? parseInt(embed.color.replace('#', ''), 16) : 0x5b7cfa;
          container.setAccentColor(isNaN(colorHex) ? 0x5b7cfa : colorHex);

          // Başlık
          if (embed.title) {
            container.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## ${embed.title}`)
            );
          }

          if (embed.title && embed.description) {
            container.addSeparatorComponents(new SeparatorBuilder());
          }

          // Açıklama
          if (embed.description) {
            container.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(embed.description)
            );
          }

          // Yazar & Footer
          if (embed.footer) {
            container.addSeparatorComponents(new SeparatorBuilder());
            container.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`-# ${embed.footer}${embed.timestamp ? ' · ' + new Date().toLocaleTimeString('tr-TR') : ''}`)
            );
          }

          // Butonlar
          if (Array.isArray(buttons) && buttons.length > 0) {
            const row = new ActionRowBuilder();
            for (const btn of buttons.slice(0, 5)) {
              if (!btn.label) continue;
              const button = new ButtonBuilder().setLabel(btn.label);

              if (btn.style === 'link' && btn.url) {
                button.setStyle(ButtonStyle.Link).setURL(btn.url);
              } else {
                const styleMap = {
                  primary: ButtonStyle.Primary,
                  secondary: ButtonStyle.Secondary,
                  success: ButtonStyle.Success,
                  danger: ButtonStyle.Danger,
                };
                button.setStyle(styleMap[btn.style] || ButtonStyle.Primary);
                button.setCustomId(`studio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
              }
              row.addComponents(button);
            }

            if (row.components.length > 0) {
              container.addActionRowComponents(row);
            }
          }

          messagePayload.components = [container];
          messagePayload.flags = MessageFlags.IsComponentsV2;
        }

        const sent = await channel.send(messagePayload);
        logEvent(guildId, 'STUDIO_PUBLISH', {
          channelId,
          channelName: channel.name,
          messageId: sent.id,
          by: auth.member.user?.tag,
        });

        sendJSON(res, 200, {
          success: true,
          messageId: sent.id,
          channelName: channel.name,
          url: `https://discord.com/channels/${guildId}/${channelId}/${sent.id}`,
        });
      } catch (err) {
        console.error('[Studio Publish Error]', err);
        sendJSON(res, 500, { error: 'Mesaj gönderilemedi: ' + err.message });
      }
      return true;
    }

    return false; // Başka route'lara devret
  },
};
