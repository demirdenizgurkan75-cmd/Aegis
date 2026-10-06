const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');

module.exports = {
  name: 'inviteCreate',
  async execute(invite, client) {
    if (!invite || !invite.guild) return;

    const settings = getGuild(invite.guild.id);
    const targetChannelId = settings.inviteLogChannel || settings.logChannel;
    if (!targetChannelId) return;

    await sendChannelLog(invite.guild, client, targetChannelId, {
      title: '📨 Davet Linki Oluşturuldu',
      description: `**Kod:** ${invite.code}\n**Oluşturan:** ${invite.inviter ? `<@${invite.inviter.id}>` : 'Bilinmiyor'}\n**Kanal:** <#${invite.channelId}>\n**Maks. Kullanım:** ${invite.maxUses || 'Sınırsız'}\n**Süre:** ${invite.maxAge ? `${invite.maxAge / 3600} saat` : 'Süresiz'}`,
      color: 0x55ff9f,
    });
  },
};
