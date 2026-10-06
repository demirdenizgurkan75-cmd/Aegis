const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { handleVoiceStateUpdate } = require('../utils/voiceMod');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const guild = newState.guild || oldState.guild;
    const settings = getGuild(guild.id);
    const member = newState.member || oldState.member;
    if (!member) return;

    // AI Voice Moderation (if enabled)
    handleVoiceStateUpdate(oldState, newState);
    // Ses kanalına katıldı
    if (!oldState.channelId && newState.channelId) {
      await sendChannelLog(guild, client, settings.voiceLogChannel, {
        title: '🔊 Ses Kanalına Katıldı',
        description: `<@${member.id}> → <#${newState.channelId}>`,
        color: 0x55ff9f,
      });
      return;
    }

    // Ses kanalından ayrıldı
    if (oldState.channelId && !newState.channelId) {
      await sendChannelLog(guild, client, settings.voiceLogChannel, {
        title: '🔇 Ses Kanalından Ayrıldı',
        description: `<@${member.id}> ← <#${oldState.channelId}>`,
        color: 0xff5555,
      });
      return;
    }

    // Ses kanalları arasında geçiş yaptı
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      await sendChannelLog(guild, client, settings.voiceLogChannel, {
        title: '🔀 Ses Kanalı Değiştirildi',
        description: `<@${member.id}>: <#${oldState.channelId}> → <#${newState.channelId}>`,
        color: 0x8ec3ff,
      });
    }
  },
};
