const { getGuild, getAntiRaidConfig } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { recordAndCheck } = require('../utils/antiRaidTracker');
const { punishRaider } = require('../utils/raidAction');
const { logEvent } = require('../utils/activityLog');

module.exports = {
  name: 'roleDelete',
  async execute(role, client) {
    if (!role.guild) return;

    // Honeytoken: Tuzak rol silme girişimi kontrolü
    const { checkHoneyRoleDelete } = require('../utils/honeytoken');
    await checkHoneyRoleDelete(role, client).catch(() => {});

    const settings = getGuild(role.guild.id);

    await sendChannelLog(role.guild, client, settings.roleLogChannel, {
      title: '🗑️ Rol Silindi',
      description: `**Rol:** ${role.name}\n**ID:** ${role.id}`,
      color: 0xff5555,
    });

    logEvent(role.guild.id, 'roleDelete', `"${role.name}" rolü silindi`, { channelId: role.id });

    // --- ANTİ-RAİD: Toplu Rol Silme Tespiti ---
    if (!settings.antiRaid) return;
    const cfg = getAntiRaidConfig(role.guild.id);
    try {
      const auditLogs = await role.guild.fetchAuditLogs({ type: 32, limit: 5 }); // ROLE_DELETE = 32
      const entry = auditLogs.entries.find(e => e.target?.id === role.id && Date.now() - e.createdTimestamp < 10000);
      if (!entry || !entry.executor) return;
      if (entry.executor.id === client.user.id) return;

      const asildi = recordAndCheck(role.guild.id, entry.executor.id, 'roleDelete', cfg.roleDelete.threshold, cfg.roleDelete.windowSec * 1000);
      if (asildi) {
        await punishRaider(role.guild, client, entry.executor.id, 'Anti-Raid: Kısa sürede çok fazla rol silindi (nuke şüphesi)', settings.banKickLogChannel);
      }
    } catch (e) { /* audit log erişimi yoksa sessizce geç */ }
  },
};
