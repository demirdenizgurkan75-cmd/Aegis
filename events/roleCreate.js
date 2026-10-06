const { PermissionFlagsBits } = require('discord.js');
const { getGuild, getAntiRaidConfig } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { recordAndCheck } = require('../utils/antiRaidTracker');
const { punishRaider } = require('../utils/raidAction');
const { logEvent } = require('../utils/activityLog');

module.exports = {
  name: 'roleCreate',
  async execute(role, client) {
    if (!role || !role.guild) return;

    const guild = role.guild;
    const settings = getGuild(guild.id);
    const targetLogChannel = settings.roleLogChannel || settings.logChannel;

    // ─── 1. Harici Kullanıcı Uygulamaları (User Apps) Kalkanı ───────────────
    if (role.permissions.has(PermissionFlagsBits.UseExternalApps)) {
      if (role.editable) {
        try {
          const newPerms = role.permissions.remove(PermissionFlagsBits.UseExternalApps);
          await role.setPermissions(newPerms, 'Aegis Zero-Trust: Harici User App izni engellendi');
          console.log(`[RoleCreateShield] ${guild.name} sunucusunda yeni açılan "${role.name}" rolünden UseExternalApps kaldırıldı.`);
        } catch (_) {}
      }
    }

    // ─── 2. Audit Log İncelemesi (Yetkili Tespiti) ───────────────────────────
    let executor = null;
    try {
      // Audit Log: ROLE_CREATE = 30
      const auditLogs = await guild.fetchAuditLogs({ type: 30, limit: 5 });
      const entry = auditLogs.entries.find(
        e => e.target?.id === role.id && Date.now() - e.createdTimestamp < 15000
      );
      if (entry) {
        executor = entry.executor;
      }
    } catch (_) {}

    // ─── 3. Sunucu Log Kanalına Bildirim Gönderme ───────────────────────────
    try {
      await sendChannelLog(guild, client, targetLogChannel, {
        title: '🛡️ Rol Oluşturuldu',
        description: `**Rol:** ${role.name} (<@&${role.id}>)\n**ID:** ${role.id}\n**Yetkili:** ${executor ? `<@${executor.id}>` : 'Bilinmiyor'}\n**Renk:** ${role.hexColor}\n**Ayrı Gösterim:** ${role.hoist ? 'Evet' : 'Hayır'}\n**Etiketlenebilir:** ${role.mentionable ? 'Evet' : 'Hayır'}`,
        color: 0x55ff9f,
        fields: [
          { name: 'Rol ID', value: role.id, inline: true },
          { name: 'Yetkili ID', value: executor ? executor.id : 'Bilinmiyor', inline: true },
        ],
      });

      logEvent(guild.id, 'roleCreate', `"${role.name}" rolü oluşturuldu`, { roleId: role.id, executorId: executor?.id });
    } catch (err) {
      console.error('[roleCreate] Log error:', err.message);
    }

    // ─── 4. ANTİ-RAİD: Toplu Rol Oluşturma Tespiti ───────────────────────────
    if (!settings.antiRaid || !executor) return;
    if (executor.id === client.user.id) return;

    const cfg = getAntiRaidConfig(guild.id);
    if (cfg && cfg.roleCreate) {
      try {
        const asildi = recordAndCheck(guild.id, executor.id, 'roleCreate', cfg.roleCreate.threshold, cfg.roleCreate.windowSec * 1000);
        if (asildi) {
          await punishRaider(guild, client, executor.id, 'Anti-Raid: Kısa sürede çok fazla rol oluşturuldu (nuke şüphesi)', settings.banKickLogChannel || targetLogChannel);
        }
      } catch (_) {}
    }
  },
};
