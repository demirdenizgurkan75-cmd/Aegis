/**
 * Dependency Scanner API Routes
 * /api/dashboard/:guildId/dependency - GET latest scan
 * /api/dashboard/:guildId/dependency/scan - POST manual scan
 * /api/dashboard/:guildId/dependency/:findingId/report - GET report markdown
 */

const db = require('../database');
const { scanDependencies, getFindings, getStats, generateReport, markReported } = require('../dependencyScanner');
const { getBearerToken, verifyToken, sendJSON, sanitizeObject } = require('./helpers');
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

    // GET /api/dashboard/:guildId/dependency
    const depMatch = path.match(/^\/api\/dashboard\/(\d+)\/dependency$/);
    if (depMatch && req.method === 'GET') {
      const guildId = depMatch[1];
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guild = await checkManage(client, session, guildId, res);
      if (!guild) return true;

      const findings = getFindings(guildId);
      const stats = getStats(guildId);
      const lastScan = db.readDB()[guildId]?.dependencyLastScan || null;

      sendJSON(res, 200, {
        success: true,
        findings,
        stats,
        lastScan
      });
      return true;
    }

    // POST /api/dashboard/:guildId/dependency/scan
    const scanMatch = path.match(/^\/api\/dashboard\/(\d+)\/dependency\/scan$/);
    if (scanMatch && req.method === 'POST') {
      const guildId = scanMatch[1];
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guild = await checkManage(client, session, guildId, res);
      if (!guild) return true;

      try {
        const result = await scanDependencies({ force: true, guildId });
        sendJSON(res, 200, { success: true, ...result });
      } catch (e) {
        sendJSON(res, 500, { success: false, error: e.message });
      }
      return true;
    }

    // GET /api/dashboard/:guildId/dependency/:findingId/report
    const reportMatch = path.match(/^\/api\/dashboard\/(\d+)\/dependency\/([^\/]+)\/report$/);
    if (reportMatch && req.method === 'GET') {
      const guildId = reportMatch[1];
      const findingId = reportMatch[2];
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guild = await checkManage(client, session, guildId, res);
      if (!guild) return true;

      const findings = getFindings(guildId);
      const finding = findings.find(f => f.id === findingId);

      if (!finding) {
        sendJSON(res, 404, { success: false, error: 'Finding not found' });
        return true;
      }

      const report = generateReport(finding);
      res.writeHead(200, { 'Content-Type': 'text/markdown' });
      res.end(report);
      return true;
    }

    // POST /api/dashboard/:guildId/dependency/:findingId/mark
    const markMatch = path.match(/^\/api\/dashboard\/(\d+)\/dependency\/([^\/]+)\/mark$/);
    if (markMatch && req.method === 'POST') {
      const guildId = markMatch[1];
      const findingId = markMatch[2];
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });

      const guild = await checkManage(client, session, guildId, res);
      if (!guild) return true;

      const ok = markReported(guildId, findingId);
      sendJSON(res, 200, { success: ok, error: ok ? null : 'Finding not found' });
      return true;
    }

    return false;
  }
};