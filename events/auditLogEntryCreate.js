const { AuditLogEvent } = require('discord.js');
const { handleAuditLog } = require('../utils/antiNuke');
const { checkHoneyRoleAudit } = require('../utils/honeytoken');
const { recordAuditEvent } = require('../utils/anomalyDetector');

module.exports = {
  name: 'auditLogEntryCreate',
  async execute(auditLogEntry, guild, client) {
    // 1. AntiNuke klasik kontrol
    try {
      await handleAuditLog(auditLogEntry, client);
    } catch (e) {
      console.error('[AntiNuke] Audit log işleme hatası:', e.message);
    }

    // 1b. Sıkı yetki koruması: tek bir tehlikeli yetki hamlesinde geri alır (features/permGuard.js)
    try {
      await require('../features/permGuard').onAuditLog(auditLogEntry, client);
    } catch (e) {
      console.error('[PermGuard] Audit log işleme hatası:', e.message);
    }

    // 2. Honeytoken tuzak rol kontrolü
    try {
      await checkHoneyRoleAudit(guild, client, auditLogEntry);
    } catch (e) {
      console.error('[Honeytoken] Audit log kontrol hatası:', e.message);
    }

    // 3. AI Davranış Anomalisi Kalkanı (Predictive Anti-Nuke)
    try {
      const { action, executorId, target, changes } = auditLogEntry;
      if (executorId && executorId !== client.user.id) {
        const executor = await client.users.fetch(executorId).catch(() => null);
        if (executor && !executor.bot) {
          let actionType = null;
          const targetName = target?.name || target?.tag || target?.id || '';

          if (action === AuditLogEvent.ChannelDelete) actionType = 'CHANNEL_DELETE';
          else if (action === AuditLogEvent.RoleDelete) actionType = 'ROLE_DELETE';
          else if (action === AuditLogEvent.MemberBanAdd) actionType = 'MEMBER_BAN';
          else if (action === AuditLogEvent.MemberKick) actionType = 'MEMBER_KICK';
          else if (action === AuditLogEvent.WebhookCreate) actionType = 'WEBHOOK_CREATE';
          else if (action === AuditLogEvent.RoleUpdate) {
            const permChange = changes?.find(c => c.key === 'permissions');
            if (permChange) actionType = 'ROLE_PERM_ESCALATION';
          }

          if (actionType) {
            recordAuditEvent(guild, executor, actionType, targetName, { auditId: auditLogEntry.id });
          }
        }
      }
    } catch (err) {
      console.warn('[Anomaly Detector] Audit error:', err.message);
    }
  },
};