// ─── Genel (kimlik doğrulamasız) uçlar ─────────────────────────────────────
const { sendJSON, readBody } = require('./helpers');
const { getGlobalStats, readDB, writeDB, saveManualOrder } = require('../database');
const { PACKAGES, FREE_FEATURES, TRIAL_DAYS } = require('../packages');
const { listAllThreats } = require('../threatNetwork');
const { getPaymentMode } = require('../payments');

module.exports = {
  name: 'public',
  async handle(ctx) {
    const { req, res, url, client } = ctx;

    // ─── POST /api/order-create — web üzerinden 5 haneli sipariş kaydı ──────
    if (url.pathname === '/api/order-create' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (!body.id) {
          sendJSON(res, 400, { error: 'Sipariş kodu (id) gerekli' });
          return true;
        }
        const order = saveManualOrder({
          id: body.id,
          discordTag: body.discordTag,
          serverInfo: body.serverInfo,
          packageName: body.packageName,
          packageId: body.packageId,
          note: body.note,
        });
        sendJSON(res, 200, { success: true, order });
      } catch (err) {
        console.error('API /api/order-create hatası:', err);
        sendJSON(res, 500, { error: 'Sunucu hatası' });
      }
      return true;
    }

    // ─── GET /api/stats — genel bot istatistikleri ──────────────────────────
    if (url.pathname === '/api/stats' && req.method === 'GET') {
      const globalStats = getGlobalStats();
      let totalMembers = 0;
      client.guilds.cache.forEach(g => { totalMembers += g.memberCount; });
      const ping = client.ws.ping;
      sendJSON(res, 200, {
        servers: client.guilds.cache.size,
        members: totalMembers,
        ping: ping > 0 ? ping : 24,
        blockedThreats: globalStats.blockedThreats || 0,
        aiEnabled: !!process.env.GEMINI_API_KEY,
        threatNetworkSize: listAllThreats().length,
      });
      return true;
    }

    // ─── GET /api/packages — paket listesi ─────────────────────────────────
    if (url.pathname === '/api/packages' && req.method === 'GET') {
      sendJSON(res, 200, { packages: PACKAGES, freeFeatures: FREE_FEATURES, trialDays: TRIAL_DAYS });
      return true;
    }

    // ─── POST /api/track — gizlilik dostu sayfa görüntüleme (çerez yok) ────
    if (url.pathname === '/api/track' && req.method === 'POST') {
      try {
        const db = readDB();
        if (!db._global) db._global = {};
        db._global.pageViews = (db._global.pageViews || 0) + 1;
        let page = '/';
        if (req.headers['referer']) {
          try { page = new URL(req.headers['referer']).pathname; } catch {}
        }
        if (!db._global.pageViewsByPath) db._global.pageViewsByPath = {};
        db._global.pageViewsByPath[page] = (db._global.pageViewsByPath[page] || 0) + 1;
        writeDB(db);
        sendJSON(res, 200, { ok: true });
      } catch {
        sendJSON(res, 200, { ok: false });
      }
      return true;
    }

    // ─── GET /api/payment/status — ödeme modu (manuel / sağlayıcı) ─────────
    if (url.pathname === '/api/payment/status' && req.method === 'GET') {
      sendJSON(res, 200, {
        mode: getPaymentMode(),
        onlineActive: ['iyzico', 'paytr'].includes(getPaymentMode()),
        message: getPaymentMode() === 'manual'
          ? 'Online ödeme henüz aktif değil — manuel havale/EFT ile sipariş oluşturulur.'
          : `${getPaymentMode()} entegrasyonu hazır.`,
      });
      return true;
    }

    return false;
  },
};
