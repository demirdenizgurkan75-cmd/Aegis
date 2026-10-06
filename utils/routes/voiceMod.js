/**
 * Voice Moderation API Routes
 * /api/dashboard/:guildId/voicemod - GET settings
 * /api/dashboard/:guildId/voicemod - POST toggle/logChannel
 */

const db = require('../database');
const { sanitizeObject } = require('./helpers');

module.exports = {
  async handle(ctx) {
    const { req, res, url, client } = ctx;
    const path = url.pathname;

    const match = path.match(/^\/api\/dashboard\/(\d+)\/voicemod$/);
    if (!match) return false;

    const guildId = match[1];

    if (req.method === 'GET') {
      const settings = db.getGuild(guildId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        enabled: settings.voiceModEnabled || false,
        logChannel: settings.voiceModLogChannel || null,
      }));
      return true;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = sanitizeObject(JSON.parse(body));
          const updates = {};

          if (typeof data.enabled === 'boolean') updates.voiceModEnabled = data.enabled;
          if (data.logChannel !== undefined) updates.voiceModLogChannel = data.logChannel || null;

          db.updateGuild(guildId, updates);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...updates }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return true;
    }

    return false;
  },
};
