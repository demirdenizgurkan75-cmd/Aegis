const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { logEvent } = require('../utils/activityLog');

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel, client) {
    if (!newChannel || !newChannel.guild) return;

    const guild = newChannel.guild;
    const nameChanged = oldChannel.name !== newChannel.name;
    const topicChanged = oldChannel.topic !== newChannel.topic;
    const nsfwChanged = oldChannel.nsfw !== newChannel.nsfw;
    const parentChanged = oldChannel.parentId !== newChannel.parentId;

    if (!nameChanged && !topicChanged && !nsfwChanged && !parentChanged) return;

    const settings = getGuild(guild.id);
    const targetLogChannel = settings.channelLogChannel || settings.logChannel;

    let executor = null;
    try {
      // Audit Log: CHANNEL_UPDATE = 11
      const auditLogs = await guild.fetchAuditLogs({ type: 11, limit: 5 });
      const entry = auditLogs.entries.find(
        e => e.target?.id === newChannel.id && Date.now() - e.createdTimestamp < 15000
      );
      if (entry) {
        executor = entry.executor;
      }
    } catch (_) {}

    const changes = [];
    if (nameChanged) {
      changes.push(`**Eski Ad:** ${oldChannel.name}\n**Yeni Ad:** ${newChannel.name}`);
    }
    if (topicChanged) {
      changes.push(`**Eski Konu:** ${oldChannel.topic || 'Yok'}\n**Yeni Konu:** ${newChannel.topic || 'Yok'}`);
    }
    if (nsfwChanged) {
      changes.push(`**NSFW:** ${newChannel.nsfw ? 'Açıldı' : 'Kapatıldı'}`);
    }
    if (parentChanged) {
      const oldParent = oldChannel.parentId ? `<#${oldChannel.parentId}>` : 'Yok';
      const newParent = newChannel.parentId ? `<#${newChannel.parentId}>` : 'Yok';
      changes.push(`**Kategori:** ${oldParent} ➔ ${newParent}`);
    }

    try {
      await sendChannelLog(guild, client, targetLogChannel, {
        title: '✏️ Kanal Güncellendi',
        description: `**Kanal:** <#${newChannel.id}> (${newChannel.name})\n**Yetkili:** ${executor ? `<@${executor.id}>` : 'Bilinmiyor'}\n\n${changes.join('\n')}`,
        color: 0xffaa00,
        fields: [
          { name: 'Kanal ID', value: newChannel.id, inline: true },
          { name: 'Yetkili ID', value: executor ? executor.id : 'Bilinmiyor', inline: true },
        ],
      });

      logEvent(guild.id, 'channelUpdate', `#${newChannel.name} kanalı güncellendi`, {
        channelId: newChannel.id,
        executorId: executor?.id,
      });
    } catch (err) {
      console.error('[channelUpdate] Log error:', err.message);
    }
  },
};
