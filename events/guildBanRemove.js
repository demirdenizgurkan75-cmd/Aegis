const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');

module.exports = {
  name: 'guildBanRemove',
  async execute(ban, client) {
    const settings = getGuild(ban.guild.id);

    await sendChannelLog(ban.guild, client, settings.banKickLogChannel, {
      title: '⚪ Ban Kaldırıldı',
      description: `**Kullanıcı:** ${ban.user.tag} (${ban.user.id})`,
      color: 0x8ec3ff,
    });
  },
};
