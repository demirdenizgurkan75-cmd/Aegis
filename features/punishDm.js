/**
 * Kick / ban öncesi üyeye sebebi özelden bildirir (kart + kısa metin). Eylem başarısız olursa DM geri silinir.
 * Ayar: guild.punishDm (varsayılan açık). Best-effort: DM kapalıysa sessizce geçer.
 */
const { getGuild, updateGuild } = require('../utils/database');
const { getGuildLanguage } = require('../utils/i18n');
const { cardPayload } = require('../utils/cardMessage');
const { punishCard } = require('../utils/canvas/cards');

const isOn = (guildId) => getGuild(guildId).punishDm !== false;
const setOn = (guildId, on) => updateGuild(guildId, { punishDm: !!on });

/** @returns {Promise<null|{undo:()=>Promise<void>}>} */
async function sendPunishDm(guild, user, type, reason) {
  try {
    if (!isOn(guild.id) || user.bot) return null;
    const isEn = getGuildLanguage(guild.id) === 'en';
    const png = punishCard({ type, guildName: guild.name, reason, isEn });
    const text = type === 'ban'
      ? (isEn ? `You were banned from **${guild.name}**.` : `**${guild.name}** sunucusundan banlandın.`)
      : (isEn ? `You were kicked from **${guild.name}**.` : `**${guild.name}** sunucusundan atıldın.`);
    const msg = await user.send(cardPayload(png, { name: `${type}.png`, text: `${text}\n${isEn ? '**Reason:**' : '**Sebep:**'} ${reason}`, accent: 0xed4245 }));
    return { undo: () => msg.delete().catch(() => {}) };
  } catch (_) { return null; }
}

module.exports = { sendPunishDm, isOn, setOn };
