const { getGuild, getAntiRaidConfig } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { recordAndCheck } = require('../utils/antiRaidTracker');
const { punishRaider } = require('../utils/raidAction');
const { logEvent } = require('../utils/activityLog');

module.exports = {
  name: 'channelDelete',
  async execute(channel, client) {
    if (!channel.guild) return;

    // Honeytoken: Tuzak kanal silme girişimi kontrolü
    const { checkHoneyChannelDelete } = require('../utils/honeytoken');
    await checkHoneyChannelDelete(channel, client).catch(() => {});

    const settings = getGuild(channel.guild.id);

    await sendChannelLog(channel.guild, client, settings.channelLogChannel, {
      title: '🗑️ Kanal Silindi',
      description: `**Kanal:** ${channel.name}\n**ID:** ${channel.id}`,
      color: 0xff5555,
    });

    logEvent(channel.guild.id, 'channelDelete', `#${channel.name} silindi`, { channelId: channel.id });

    // --- ANTİ-RAİD: Toplu Kanal Silme Tespiti ---
    if (!settings.antiRaid) return;
    const cfg = getAntiRaidConfig(channel.guild.id);
    try {
      const auditLogs = await channel.guild.fetchAuditLogs({ type: 12, limit: 5 }); // CHANNEL_DELETE = 12
      const entry = auditLogs.entries.find(e => e.target?.id === channel.id && Date.now() - e.createdTimestamp < 10000);
      if (!entry || !entry.executor) return;
      if (entry.executor.id === client.user.id) return; // botun kendi işlemlerini sayma

      const asildi = recordAndCheck(channel.guild.id, entry.executor.id, 'channelDelete', cfg.channelDelete.threshold, cfg.channelDelete.windowSec * 1000);
      if (asildi) {
        await punishRaider(channel.guild, client, entry.executor.id, 'Anti-Raid: Kısa sürede çok fazla kanal silindi (nuke şüphesi)', settings.banKickLogChannel);
      }
    } catch (e) { /* audit log erişimi yoksa sessizce geç */ }
  },
};
