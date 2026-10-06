const { getGuild } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');

const STATUS_LABELS = {
  online: '🟢 Çevrimiçi',
  idle: '🌙 Boşta',
  dnd: '⛔ Rahatsız Etmeyin',
  offline: '⚫ Çevrimdışı',
};

module.exports = {
  name: 'presenceUpdate',
  async execute(oldPresence, newPresence, client) {
    if (!newPresence || !newPresence.guild || newPresence.member?.user?.bot) return;
    const settings = getGuild(newPresence.guild.id);

    // Üye bilgilerini güvenle çek
    let member = newPresence.member;
    if (!member && newPresence.guild) {
      member = await newPresence.guild.members.fetch(newPresence.userId).catch(() => null);
    }
    const displayName = member?.displayName || member?.user?.username || `Kullanıcı (${newPresence.userId})`;
    const userTag = member?.user?.tag || member?.user?.username || displayName;

    // --- Durum (Online/Idle/DND) Değişikliği ---
    const oldStatus = oldPresence?.status || 'offline';
    const newStatus = newPresence.status || 'offline';

    if (oldStatus !== newStatus && settings.statusLogChannel) {
      const textContent = `🟢 **${displayName}** (<@${newPresence.userId}>) durumunu güncelledi: ${STATUS_LABELS[oldStatus] || oldStatus} → ${STATUS_LABELS[newStatus] || newStatus}`;
      await sendChannelLog(newPresence.guild, client, settings.statusLogChannel, {
        content: textContent,
        title: '🟢 Durum Değişti',
        description: textContent,
        color: 0x8ec3ff,
        fields: [
          { name: 'Kullanıcı', value: `${displayName} (${userTag} • <@${newPresence.userId}>)`, inline: false },
          { name: 'Eski Durum', value: STATUS_LABELS[oldStatus] || oldStatus, inline: true },
          { name: 'Yeni Durum', value: STATUS_LABELS[newStatus] || newStatus, inline: true },
          { name: 'Zaman', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
        ],
      });
    }

    // --- Oyun/Aktivite Değişikliği (sadece "Playing" tipindeki aktiviteler) ---
    if (settings.gameActivityLogChannel) {
      const oldActivity = oldPresence?.activities?.find(a => a.type === 0);
      const newActivity = newPresence.activities?.find(a => a.type === 0);
      const oldGame = oldActivity?.name || null;
      const newGame = newActivity?.name || null;

      if (oldGame !== newGame) {
        if (newGame) {
          const textContent = `🎮 **${displayName}** (<@${newPresence.userId}>), **${newGame}** oynamaya başladı.`;
          const fields = [
            { name: 'Kullanıcı', value: `${displayName} (${userTag} • <@${newPresence.userId}>)`, inline: false },
            { name: 'Oyun', value: `🎮 **${newGame}**`, inline: true },
          ];
          if (newActivity?.details) {
            fields.push({ name: 'Detay', value: newActivity.details, inline: true });
          }
          if (newActivity?.state) {
            fields.push({ name: 'Durum', value: newActivity.state, inline: true });
          }
          fields.push({ name: 'Başlangıç', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true });

          await sendChannelLog(newPresence.guild, client, settings.gameActivityLogChannel, {
            content: textContent,
            title: '🎮 Oyuna Başladı',
            description: textContent,
            color: 0x55ff9f,
            fields,
          });
        } else if (oldGame) {
          const textContent = `⏹️ **${displayName}** (<@${newPresence.userId}>), **${oldGame}** oynamayı bıraktı.`;
          const fields = [
            { name: 'Kullanıcı', value: `${displayName} (${userTag} • <@${newPresence.userId}>)`, inline: false },
            { name: 'Oyun', value: `**${oldGame}**`, inline: true },
            { name: 'Bitiş', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
          ];

          await sendChannelLog(newPresence.guild, client, settings.gameActivityLogChannel, {
            content: textContent,
            title: '🎮 Oyunu Bıraktı',
            description: textContent,
            color: 0xff5555,
            fields,
          });
        }
      }
    }
  },
};
