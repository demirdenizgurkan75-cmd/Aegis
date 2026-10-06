const { checkWebhookCreated } = require('../utils/guardSuite');

module.exports = {
  name: 'webhookUpdate',
  async execute(channel, client) {
    if (!channel || !channel.guild) return;
    try {
      await checkWebhookCreated(channel);
    } catch (err) {
      console.error('[webhookUpdate] Koruma kontrol hatası:', err);
    }
  },
};
