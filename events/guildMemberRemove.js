const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { logEvent } = require('../utils/activityLog');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    const settings = getGuild(member.guild.id);

    await sendChannelLog(member.guild, client, settings.joinLeaveLogChannel, {
      title: '📤 Üye Ayrıldı',
      description: `**${member.user.tag}** sunucudan ayrıldı.\n**Toplam Üye:** ${member.guild.memberCount}`,
      color: 0xff5555,
    });

    // Ayrılma kartı (/welcome panelinden açılır): karşılama kanalına üzgün maskotlu kart
    if (settings.leaveCardEnabled && settings.welcomeChannel && !member.user?.bot) {
      try {
        const channel = member.guild.channels.cache.get(settings.welcomeChannel);
        if (channel) {
          const { goodbyeCard } = require('../utils/canvas/cards');
          const { cardPayload } = require('../utils/cardMessage');
          const { getGuildLanguage } = require('../utils/i18n');
          const isEn = getGuildLanguage(member.guild.id) === 'en';
          const png = await goodbyeCard(member, isEn);
          const who = member.user?.displayName || member.user?.username || '—';
          await channel.send(cardPayload(png, { name: 'goodbye.png', text: isEn ? `-# ${who} left the server` : `-# ${who} sunucudan ayrıldı`, accent: 0x0066ff })).catch(() => {});
        }
      } catch (e) { console.error('[goodbye card]', e.message); }
    }

    logEvent(member.guild.id, 'memberLeave', `${member.user.tag} ayrıldı`, { user: member.user.tag, userId: member.user.id });

    // Kick olup olmadığını audit log'dan kontrol et
    try {
      const auditLogs = await member.guild.fetchAuditLogs({ type: 20, limit: 5 }); // MEMBER_KICK = 20
      const entry = auditLogs.entries.find(e => e.target?.id === member.id && Date.now() - e.createdTimestamp < 10000);
      if (entry) {
        await sendChannelLog(member.guild, client, settings.banKickLogChannel, {
          title: '👢 Üye Atıldı (Kick)',
          description: `**Kullanıcı:** ${member.user.tag} (${member.id})\n**Yetkili:** <@${entry.executor.id}>\n**Sebep:** ${entry.reason || 'Belirtilmedi'}`,
          color: 0xff8800,
        });
      }
    } catch (e) { /* audit log erişimi yoksa sessizce geç */ }
  },
};
