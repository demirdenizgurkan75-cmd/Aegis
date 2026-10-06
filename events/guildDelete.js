module.exports = {
  name: 'guildDelete',
  async execute(guild, client) {
    const startTime = Date.now();

    // ─── Sunucu bilgileri (cache'den) ─────────────────────────────────────────
    const memberCount = guild.memberCount;
    const botCount = guild.members.cache.filter(m => m.user.bot).size;
    const humanCount = memberCount - botCount;

    // ─── Neden ayrıldık? (kick mi, ban mı, yoksa sahibi sildi mi?) ───────────
    let leaveReason = 'Sunucudan çıkarıldım / Bot çıkarıldı';
    try {
      const auditLogs = await guild.fetchAuditLogs({ type: 20, limit: 1 }); // BOT_REMOVE
      const entry = auditLogs.entries.first();
      if (entry) {
        const executor = entry.executor;
        const target = entry.target;
        if (target?.id === client.user.id) {
          leaveReason = `🟠 ${executor?.tag || 'Bilinmiyor'} (${executor?.id || '?'}) tarafından **kick/çıkarıldım**`;
        }
      }
    } catch {}

    // ─── DB'de sunucu verisi var mı? ─────────────────────────────────────────
    let hadSettings = false;
    try {
      const { readDB } = require('../utils/database');
      const db = readDB();
      hadSettings = !!db[guild.id];
    } catch {}

    // ─── Log formatı ──────────────────────────────────────────────────────────
    const duration = Date.now() - startTime;
    const lines = [
      '',
      '═══════════════════════════════════════════════════════════════',
      `➖  SUNUCUDAN ÇIKARILDI  —  ${new Date().toLocaleString('tr-TR')}`,
      '═══════════════════════════════════════════════════════════════',
      `📛 Sunucu: ${guild.name} (${guild.id})`,
      `👥 Üyeler: ${memberCount} toplam (${humanCount} insan + ${botCount} bot)`,
      `📋 Sebep: ${leaveReason}`,
      `💾 Ayarlar kaydedilmiş mi: ${hadSettings ? 'Evet' : 'Hayır'}`,
      `⏱️  İşlem süresi: ${duration}ms`,
      `📊 Kalan sunucu sayısı: ${client.guilds.cache.size}`,
      '═══════════════════════════════════════════════════════════════',
      '',
    ];

    console.log(lines.join('\n'));
  },
};