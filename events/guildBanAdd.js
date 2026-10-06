const { getGuild, getAntiRaidConfig } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { recordAndCheck } = require('../utils/antiRaidTracker');
const { punishRaider } = require('../utils/raidAction');
const { logEvent } = require('../utils/activityLog');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban, client) {
    const settings = getGuild(ban.guild.id);

    let reason = 'Belirtilmedi';
    let executor = null;
    try {
      const auditLogs = await ban.guild.fetchAuditLogs({ type: 22, limit: 5 }); // BAN_ADD = 22
      const entry = auditLogs.entries.find(e => e.target?.id === ban.user.id && Date.now() - e.createdTimestamp < 10000);
      if (entry) {
        reason = entry.reason || reason;
        executor = entry.executor;
      }
    } catch (e) { /* audit log erişimi yoksa sessizce geç */ }

    await sendChannelLog(ban.guild, client, settings.banKickLogChannel, {
      title: '🔨 Üye Banlandı',
      description: `**Kullanıcı:** ${ban.user.tag} (${ban.user.id})\n**Yetkili:** ${executor ? `<@${executor.id}>` : 'Bilinmiyor'}\n**Sebep:** ${reason}`,
      color: 0xff2222,
    });

    logEvent(ban.guild.id, 'ban', `${ban.user.tag} banlandı (${reason})`, { user: ban.user.tag, userId: ban.user.id });

    // --- ANTİ-RAİD: Toplu Ban Tespiti ---
    if (!settings.antiRaid || !executor) return;
    if (executor.id === client.user.id) return;

    const cfg = getAntiRaidConfig(ban.guild.id);
    const asildi = recordAndCheck(ban.guild.id, executor.id, 'massBan', cfg.massBan.threshold, cfg.massBan.windowSec * 1000);
    if (asildi) {
      await punishRaider(ban.guild, client, executor.id, 'Anti-Raid: Kısa sürede çok fazla üye banlandı (nuke şüphesi)', settings.banKickLogChannel);
    }
  },
};
