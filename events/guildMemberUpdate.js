const { PermissionFlagsBits, AuditLogEvent } = require('discord.js');
const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { logEvent } = require('../utils/activityLog');

function isAdmin(p) {
  return p.has(PermissionFlagsBits.Administrator) || p.has(PermissionFlagsBits.ManageGuild);
}

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, client) {
    if (!newMember || !newMember.guild) return;

    const guild = newMember.guild;
    const settings = getGuild(guild.id);
    const targetLogChannel = settings.roleLogChannel || settings.logChannel;

    // ─── 0. Boost teşekkür kartı (/welcome panelinden açılır) ───────────────
    try {
      if (settings.boostCardEnabled && !oldMember.premiumSince && newMember.premiumSince && !newMember.user.bot) {
        const channel = guild.channels.cache.get(settings.boostChannel || settings.welcomeChannel) || guild.systemChannel;
        if (channel) {
          const { boostCard } = require('../utils/canvas/cards');
          const { cardPayload } = require('../utils/cardMessage');
          const { getGuildLanguage } = require('../utils/i18n');
          const isEn = getGuildLanguage(guild.id) === 'en';
          const png = await boostCard(newMember, isEn);
          await channel.send(cardPayload(png, { name: 'boost.png', text: isEn ? `:aegis_love: Thank you <@${newMember.id}> for boosting **${guild.name}**!` : `:aegis_love: <@${newMember.id}>, **${guild.name}** sunucusunu boost'ladığın için teşekkürler!`, mentionUsers: [newMember.id] })).catch(() => {});
        }
      }
    } catch (e) { console.error('[boost card]', e.message); }

    // ─── 1. Rol Değişiklikleri Kontrolü (Role Add / Remove) ─────────────────
    try {
      const addedRoles = newMember.roles.cache.filter(
        role => !oldMember.roles.cache.has(role.id) && role.id !== guild.id
      );
      const removedRoles = oldMember.roles.cache.filter(
        role => !newMember.roles.cache.has(role.id) && role.id !== guild.id
      );

      if (addedRoles.size > 0 || removedRoles.size > 0) {
        let executor = null;
        try {
          // Audit Log: MEMBER_ROLE_UPDATE = 25
          const auditLogs = await guild.fetchAuditLogs({ type: 25, limit: 5 });
          const entry = auditLogs.entries.find(
            e => e.target?.id === newMember.id && Date.now() - e.createdTimestamp < 15000
          );
          if (entry) {
            executor = entry.executor;
          }
        } catch (_) {}

        // Verilen Rol(ler)
        if (addedRoles.size > 0) {
          const roleList = addedRoles.map(r => `<@&${r.id}>`).join(', ');
          const roleNames = addedRoles.map(r => r.name).join(', ');

          await sendChannelLog(guild, client, targetLogChannel, {
            title: '🛡️ Rol Verildi',
            description: `**Kullanıcı:** ${newMember.user.tag} (<@${newMember.id}>)\n**Verilen Rol(ler):** ${roleList}\n**Yetkili:** ${executor ? `<@${executor.id}>` : 'Bilinmiyor'}`,
            color: 0x55ff9f,
            fields: [
              { name: 'Kullanıcı ID', value: newMember.id, inline: true },
              { name: 'Yetkili ID', value: executor ? executor.id : 'Bilinmiyor', inline: true },
            ],
          });

          logEvent(guild.id, 'roleUpdate', `${newMember.user.tag} kullanıcısına rol verildi: ${roleNames}`, {
            userId: newMember.id,
            executorId: executor?.id,
          });
        }

        // Alınan Rol(ler)
        if (removedRoles.size > 0) {
          const roleList = removedRoles.map(r => `<@&${r.id}>`).join(', ');
          const roleNames = removedRoles.map(r => r.name).join(', ');

          await sendChannelLog(guild, client, targetLogChannel, {
            title: '🛡️ Rol Alındı',
            description: `**Kullanıcı:** ${newMember.user.tag} (<@${newMember.id}>)\n**Alınan Rol(ler):** ${roleList}\n**Yetkili:** ${executor ? `<@${executor.id}>` : 'Bilinmiyor'}`,
            color: 0xff5555,
            fields: [
              { name: 'Kullanıcı ID', value: newMember.id, inline: true },
              { name: 'Yetkili ID', value: executor ? executor.id : 'Bilinmiyor', inline: true },
            ],
          });

          logEvent(guild.id, 'roleUpdate', `${newMember.user.tag} kullanıcısından rol alındı: ${roleNames}`, {
            userId: newMember.id,
            executorId: executor?.id,
          });
        }
      }
    } catch (err) {
      console.error('[guildMemberUpdate] Role logging error:', err.message);
    }

    // ─── 2. Nickname Değişikliği Kontrolü ────────────────────────────────────
    try {
      if (oldMember.nickname !== newMember.nickname) {
        let nickExecutor = null;
        try {
          // Audit Log: MEMBER_UPDATE = 24
          const auditLogs = await guild.fetchAuditLogs({ type: 24, limit: 5 });
          const entry = auditLogs.entries.find(
            e => e.target?.id === newMember.id && Date.now() - e.createdTimestamp < 15000
          );
          if (entry) {
            nickExecutor = entry.executor;
          }
        } catch (_) {}

        const oldNick = oldMember.nickname || oldMember.user.username;
        const newNick = newMember.nickname || newMember.user.username;
        const nickLogChannel = settings.nicknameLogChannel || settings.logChannel;

        await sendChannelLog(guild, client, nickLogChannel, {
          title: '✏️ Kullanıcı Adı / Nick Değiştirildi',
          description: `**Kullanıcı:** ${newMember.user.tag} (<@${newMember.id}>)\n**Eski Nick:** ${oldNick}\n**Yeni Nick:** ${newNick}\n**Yetkili:** ${nickExecutor ? `<@${nickExecutor.id}>` : `<@${newMember.id}>`}`,
          color: 0x8ec3ff,
        });

        logEvent(guild.id, 'nicknameUpdate', `${newMember.user.tag} nicki değiştirildi: ${oldNick} ➔ ${newNick}`, {
          userId: newMember.id,
          executorId: nickExecutor?.id,
        });
      }
    } catch (err) {
      console.error('[guildMemberUpdate] Nickname logging error:', err.message);
    }

    // ─── 3. Yöneticiliğe Yükseltilen Kişiye Doğrulama DM'i ───────────────────
    if (!newMember.user.bot && !isAdmin(oldMember.permissions) && isAdmin(newMember.permissions)) {
      try {
        await newMember.send(
          `🔐 **Yönetici doğrulaması**\n\n**${newMember.guild.name}** sunucusunda artık yönetici yetkine sahipsin.\n` +
          `Aegis'in anti-nuke koruması için hesabını şu linkten doğrula:\nhttps://betterwithaegis.com/verify\n\n` +
          `Doğrulanmayan yönetici hesapların yıkıcı işlemleri otomatik engellenir.`
        );
      } catch (_) {}
    }
  },
};
