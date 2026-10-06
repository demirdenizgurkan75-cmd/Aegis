/**
 * Health Report API Routes
 * /api/dashboard/:guildId/health - GET latest report
 * /api/dashboard/:guildId/health/generate - POST manual generation
 */

const db = require('../database');
const { triggerHealthReport } = require('../report');
const { getBearerToken, verifyToken, sendJSON } = require('./helpers');
const { PermissionFlagsBits } = require('discord.js');

async function checkManage(client, session, guildId, res) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    sendJSON(res, 404, { error: 'Sunucu bulunamadı' });
    return null;
  }
  let member = guild.members.cache.get(session.discordId);
  if (!member) {
    try { member = await guild.members.fetch(session.discordId); } catch (err) { member = null; }
  }
  const isOwner = guild.ownerId === session.discordId;
  if (!member && !isOwner) {
    sendJSON(res, 403, { error: 'Bu sunucuya erişim yetkin yok' });
    return null;
  }
  if (!isOwner && member && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    sendJSON(res, 403, { error: 'Bu sunucuyu yönetme yetkin yok' });
    return null;
  }
  return guild;
}

module.exports = {
  async handle(ctx) {
    const { req, res, url, client } = ctx;
    const path = url.pathname;

    // GET /api/dashboard/:guildId/health
    const healthMatch = path.match(/^\/api\/dashboard\/(\d+)\/health$/);
    if (healthMatch && req.method === 'GET') {
      const guildId = healthMatch[1];
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guild = await checkManage(client, session, guildId, res);
      if (!guild) return true;

      const report = db.getLatestHealthReport(guildId);
      const history = db.getHealthReports(guildId, 10);

      sendJSON(res, 200, {
        success: true,
        report,
        history: history.map(r => ({
          generatedAt: r.generatedAt,
          score: r.analysis.score,
          status: r.analysis.status,
        })),
      });
      return true;
    }

    // POST /api/dashboard/:guildId/health/generate
    const genMatch = path.match(/^\/api\/dashboard\/(\d+)\/health\/generate$/);
    if (genMatch && req.method === 'POST') {
      const guildId = genMatch[1];
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guild = await checkManage(client, session, guildId, res);
      if (!guild) return true;

      try {
        const report = await triggerHealthReport(guild, client);
        sendJSON(res, 200, { success: true, report });
      } catch (e) {
        sendJSON(res, 500, { success: false, error: e.message });
      }
      return true;
    }

    return false;
  },
};
