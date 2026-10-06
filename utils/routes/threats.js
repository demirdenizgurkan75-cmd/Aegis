// ─── Global tehdit ağı yönetimi (sadece bot sahibi) ────────────────────────
const { sendJSON, getBearerToken, verifyToken } = require('./helpers');
const { listAllThreats, removeThreat } = require('../threatNetwork');

function isOwner(session) {
  const ownerIds = (process.env.AEGIS_OWNER_IDS || '').split(',').map(s => s.trim());
  return ownerIds.includes(session.discordId);
}

module.exports = {
  name: 'threats',
  async handle(ctx) {
    const { req, res, url } = ctx;

    // ─── GET /api/threat-network — global tehdit listesi (sadece owner) ────
    if (url.pathname === '/api/threat-network' && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      if (!isOwner(session)) return sendJSON(res, 403, { error: 'Bu endpoint sadece bot sahibine açık' });

      const threats = listAllThreats()
        .sort((a, b) => b.reportedAt - a.reportedAt)
        .slice(0, 100);

      return sendJSON(res, 200, { threats, total: threats.length });
    }

    // ─── GET /api/threat-network/export — CSV dışa aktarım (owner) ─────────
    if (url.pathname === '/api/threat-network/export' && req.method === 'GET') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      if (!isOwner(session)) return sendJSON(res, 403, { error: 'Bu endpoint sadece bot sahibine açık' });

      const threats = listAllThreats().sort((a, b) => b.reportedAt - a.reportedAt);
      const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const rows = [
        ['userId', 'severity', 'reason', 'flagCount', 'reportedBy', 'reportedAt'].join(','),
        ...threats.map(t => [
          t.userId,
          t.severity,
          esc(t.reason),
          t.flagCount || 1,
          esc(t.reportedByName || t.reportedBy || ''),
          new Date(t.reportedAt).toISOString(),
        ].join(',')),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="aegis-threats.csv"');
      res.writeHead(200);
      res.end('﻿' + rows.join('\n')); // BOM: Excel Türkçe karakter düzgün açsın
      return true;
    }

    // ─── POST /api/threat-network/:userId/remove — tehdidi temizle (sahip) ─
    if (url.pathname.startsWith('/api/threat-network/') && url.pathname.endsWith('/remove') && req.method === 'POST') {
      const token = getBearerToken(req);
      const session = verifyToken(token);
      if (!session) return sendJSON(res, 401, { error: 'Oturum geçersiz' });
      if (!isOwner(session)) return sendJSON(res, 403, { error: 'Bu işlem sadece bot sahibine açık' });

      const userId = url.pathname.split('/api/threat-network/')[1].replace('/remove', '');
      const removed = removeThreat(userId, session.discordId);
      if (!removed) return sendJSON(res, 404, { error: 'Tehdit kaydı bulunamadı' });
      return sendJSON(res, 200, { success: true });
    }

    return false;
  },
};
