const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');

module.exports = {
  name: 'inviteDelete',
  async execute(invite, client) {
    const settings = getGuild(invite.guild.id);

    await sendChannelLog(invite.guild, client, settings.inviteLogChannel, {
      title: '🗑️ Davet Linki Silindi/Süresi Doldu',
      description: `**Kod:** ${invite.code}\n**Kanal:** <#${invite.channelId}>`,
      color: 0xff5555,
    });
  },
};
