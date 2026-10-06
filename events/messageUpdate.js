const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    const settings = getGuild(newMessage.guild.id);
    const targetChannel = settings.messageLogChannel || settings.logChannel;
    if (!targetChannel) return;

    const oldContent = (oldMessage.content || '*(içerik yok)*').substring(0, 400);
    const newContent = (newMessage.content || '*(içerik yok)*').substring(0, 400);

    await sendChannelLog(newMessage.guild, client, targetChannel, {
      title: '✏️ Mesaj Düzenlendi',
      description: `**Kullanıcı:** <@${newMessage.author?.id}>\n**Kanal:** <#${newMessage.channel.id}>\n\n**Önce:**\n\`\`\`${oldContent}\`\`\`\n**Sonra:**\n\`\`\`${newContent}\`\`\``,
      color: 0xffaa00,
    });
  },
};
