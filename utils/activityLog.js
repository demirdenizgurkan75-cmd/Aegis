/* ==========================================================================
   ACTIVITY LOG — In-memory ring buffer (son 200 olay / sunucu)
   Dashboard canlı log akışı için kullanılır.
   Bot restart'ta sıfırlanır (sorun değil — canlı akış yeterli).
   ========================================================================== */

const MAX_PER_GUILD = 200;
const logs = new Map(); // guildId -> [{timestamp, type, message, user, userId, channelId}]

function logEvent(guildId, type, message, extra = {}) {
    if (!logs.has(guildId)) logs.set(guildId, []);
    const arr = logs.get(guildId);
    arr.push({
        timestamp: Date.now(),
        type,
        message,
        user: extra.user || null,
        userId: extra.userId || null,
        channelId: extra.channelId || null,
    });
    // Eski olayları temizle
    while (arr.length > MAX_PER_GUILD) arr.shift();
}

function getLogs(guildId, limit = 50) {
    const arr = logs.get(guildId) || [];
    return arr.slice(-limit).reverse(); // en yeniler üstte
}

function clearLogs(guildId) {
    logs.delete(guildId);
}

module.exports = { logEvent, getLogs, clearLogs };
