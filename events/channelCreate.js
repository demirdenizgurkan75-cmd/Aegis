const { getGuild, getAntiRaidConfig } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { recordAndCheck } = require('../utils/antiRaidTracker');
const { punishRaider } = require('../utils/raidAction');

module.exports = {
  name: 'channelCreate',
  async execute(channel, client) {
    if (!channel.guild) return;
    const settings = getGuild(channel.guild.id);

    await sendChannelLog(channel.guild, client, settings.channelLogChannel, {
      title: '📁 Kanal Oluşturuldu',
      description: `**Kanal:** ${channel.name} (${channel.type === 4 ? 'Kategori' : 'Kanal'})\n**ID:** ${channel.id}`,
      color: 0x55ff9f,
    });

    // --- ANTİ-RAİD: Toplu Kanal Oluşturma (Spam) Tespiti ---
    if (!settings.antiRaid) return;
    const cfg = getAntiRaidConfig(channel.guild.id);
    try {
      const auditLogs = await channel.guild.fetchAuditLogs({ type: 10, limit: 5 }); // CHANNEL_CREATE = 10
      const entry = auditLogs.entries.find(e => e.target?.id === channel.id && Date.now() - e.createdTimestamp < 10000);
      if (!entry || !entry.executor) return;
      if (entry.executor.id === client.user.id) return;

      const asildi = recordAndCheck(channel.guild.id, entry.executor.id, 'channelCreate', cfg.channelCreate.threshold, cfg.channelCreate.windowSec * 1000);
      if (asildi) {
        await punishRaider(channel.guild, client, entry.executor.id, 'Anti-Raid: Kısa sürede çok fazla kanal oluşturuldu (spam şüphesi)', settings.banKickLogChannel);
      }
    } catch (e) { /* audit log erişimi yoksa sessizce geç */ }
  },
};
