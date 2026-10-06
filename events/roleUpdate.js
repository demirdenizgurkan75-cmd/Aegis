const { PermissionFlagsBits } = require('discord.js');
const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { logEvent } = require('../utils/activityLog');

module.exports = {
  name: 'roleUpdate',
  async execute(oldRole, newRole, client) {
    if (!newRole || !newRole.guild) return;

    const guild = newRole.guild;

    // ─── 1. Harici Kullanıcı Uygulamaları (User Apps) Kalkanı ───────────────
    if (newRole.permissions.has(PermissionFlagsBits.UseExternalApps)) {
      if (newRole.editable && newRole.id !== guild.ownerId) {
        try {
          const newPerms = newRole.permissions.remove(PermissionFlagsBits.UseExternalApps);
          await newRole.setPermissions(newPerms, 'Aegis Zero-Trust: Harici User App izni engellendi');
          console.log(`[RoleUpdateShield] ${guild.name} sunucusunda "${newRole.name}" rolüne verilmeye çalışılan UseExternalApps engellendi.`);
        } catch (_) {}
      }
    }

    // ─── 2. Anlamlı Değişiklik Kontrolü ─────────────────────────────────────
    const nameChanged = oldRole.name !== newRole.name;
    const colorChanged = oldRole.hexColor !== newRole.hexColor;
    const hoistChanged = oldRole.hoist !== newRole.hoist;
    const mentionableChanged = oldRole.mentionable !== newRole.mentionable;
    const permsChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;

    // Sadece sıra (position) veya bot dahili güncellemeleri varsa log kirliliği yapma
    if (!nameChanged && !colorChanged && !hoistChanged && !mentionableChanged && !permsChanged) {
      return;
    }

    const settings = getGuild(guild.id);
    const targetLogChannel = settings.roleLogChannel || settings.logChannel;

    // ─── 3. Audit Log İncelemesi (Yetkili Tespiti) ───────────────────────────
    let executor = null;
    try {
      // Audit Log: ROLE_UPDATE = 31
      const auditLogs = await guild.fetchAuditLogs({ type: 31, limit: 5 });
      const entry = auditLogs.entries.find(
        e => e.target?.id === newRole.id && Date.now() - e.createdTimestamp < 15000
      );
      if (entry) {
        executor = entry.executor;
      }
    } catch (_) {}

    // ─── 4. Değişiklik Detaylarını Hazırlama ─────────────────────────────────
    const changes = [];
    if (nameChanged) {
      changes.push(`**Eski Ad:** ${oldRole.name}\n**Yeni Ad:** ${newRole.name}`);
    }
    if (colorChanged) {
      changes.push(`**Renk:** ${oldRole.hexColor} ➔ ${newRole.hexColor}`);
    }
    if (hoistChanged) {
      changes.push(`**Ayrı Gösterim:** ${newRole.hoist ? 'Açıldı' : 'Kapatıldı'}`);
    }
    if (mentionableChanged) {
      changes.push(`**Etiketlenebilir:** ${newRole.mentionable ? 'Açıldı' : 'Kapatıldı'}`);
    }
    if (permsChanged) {
      const addedPerms = newRole.permissions.toArray().filter(p => !oldRole.permissions.has(p));
      const removedPerms = oldRole.permissions.toArray().filter(p => !newRole.permissions.has(p));
      if (addedPerms.length > 0) {
        changes.push(`**Eklenen Yetkiler:** ${addedPerms.join(', ')}`);
      }
      if (removedPerms.length > 0) {
        changes.push(`**Kaldırılan Yetkiler:** ${removedPerms.join(', ')}`);
      }
    }

    try {
      await sendChannelLog(guild, client, targetLogChannel, {
        title: '✏️ Rol Güncellendi',
        description: `**Rol:** ${newRole.name} (<@&${newRole.id}>)\n**Yetkili:** ${executor ? `<@${executor.id}>` : 'Bilinmiyor'}\n\n${changes.join('\n')}`,
        color: 0xffaa00,
        fields: [
          { name: 'Rol ID', value: newRole.id, inline: true },
          { name: 'Yetkili ID', value: executor ? executor.id : 'Bilinmiyor', inline: true },
        ],
      });

      logEvent(guild.id, 'roleUpdate', `"${newRole.name}" rolü güncellendi`, {
        roleId: newRole.id,
        executorId: executor?.id,
      });
    } catch (err) {
      console.error('[roleUpdate] Log error:', err.message);
    }
  },
};
