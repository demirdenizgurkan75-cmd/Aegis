const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { logEvent } = require('../utils/activityLog');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    if (!message.guild || message.author?.bot) return;
    const settings = getGuild(message.guild.id);
    const targetChannel = settings.messageLogChannel || settings.logChannel;
    if (!targetChannel) return;

    const content = message.content && message.content.length > 0
      ? message.content.substring(0, 800)
      : '*(içerik yok / medya)*';

    await sendChannelLog(message.guild, client, targetChannel, {
      title: '🗑️ Mesaj Silindi',
      description: `**Kullanıcı:** <@${message.author?.id}>\n**Kanal:** <#${message.channel.id}>\n**İçerik:**\n\`\`\`${content}\`\`\``,
      color: 0xff5555,
    });

    logEvent(message.guild.id, 'messageDelete', `${message.author?.tag || 'Bilinmiyor'} → #${message.channel.name}: ${content.substring(0, 100)}`, { user: message.author?.tag, userId: message.author?.id, channelId: message.channel.id });
  },
};
