// ─── GitHub webhook otomatik deploy ────────────────────────────────────────
const crypto = require('crypto');
const { exec } = require('child_process');
const { sendJSON, readRawBody, GITHUB_WEBHOOK_SECRET } = require('./helpers');

module.exports = {
  name: 'deploy',
  async handle(ctx) {
    const { req, res, url } = ctx;

    // ─── POST /github-deploy — GitHub webhook otomatik deploy ──────────────
    if (url.pathname === '/github-deploy' && req.method === 'POST') {
      if (!GITHUB_WEBHOOK_SECRET) {
        return sendJSON(res, 403, { error: 'Webhook secret tanımlı değil' });
      }
      const rawBody = await readRawBody(req);
      const signature = req.headers['x-hub-signature-256'];
      if (!signature) return sendJSON(res, 403, { error: 'İmza eksik' });

      const expected = 'sha256=' + crypto
        .createHmac('sha256', GITHUB_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      let match = false;
      try {
        match = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      } catch { match = false; }

      if (!match) return sendJSON(res, 403, { error: 'İmza geçersiz' });

      sendJSON(res, 200, { ok: true });
      setTimeout(() => {
        exec('git pull && npm install && pm2 restart all', (err, stdout, stderr) => {
          if (err) console.error('Deploy hatası:', err);
          else console.log('Deploy başarılı:', stdout);
        });
      }, 500);
      return true;
    }

    return false;
  },
};
