const { sendChannelLog } = require('./logger');
const { resetActor } = require('./antiRaidTracker');
const { reportThreat, notifyAllServers } = require('./threatNetwork');
const { recordAlert } = require('./database');

/**
 * Anti-raid tetiklendiğinde saldırganı (kullanıcı ya da bot) sunucudan atar ve loglar.
 * Aynı zamanda Global Tehdit Ağı'na ekler ve diğer sunucuları uyarır.
 */
async function punishRaider(guild, client, actorId, reason, banKickLogChannel) {
  resetActor(guild.id, actorId);

  const member = await guild.members.fetch(actorId).catch(() => null);

  let sonuc = 'Kullanıcı sunucuda bulunamadı (zaten ayrılmış olabilir).';
  if (member) {
    if (member.id === guild.ownerId) {
      sonuc = 'Sunucu sahibine işlem uygulanamaz.';
    } else if (!member.kickable) {
      sonuc = 'Rol/izin yetersizliği nedeniyle atılamadı! Botun rolünü yükseltmeni öneririz.';
    } else {
      await member.kick(reason).catch(() => {});
      sonuc = 'Sunucudan atıldı.';

      // ─── GLOBAL TEHDİT AĞINA EKLE ────────────────────────────────────────
      // Raid saldırganını tüm Aegis sunucuları için işaretle
      try {
        const threat = reportThreat(
          actorId,
          guild.id,
          guild.name,
          reason,
          'yüksek'  // Sunucudan atılma = yüksek tehdit
        );

        // Diğer tüm sunucuları uyar (bu sunucu hariç)
        const notifiedCount = await notifyAllServers(client, actorId, threat, guild.id);
        if (notifiedCount > 0) {
          sonuc += ` Global tehdit ağına eklendi, ${notifiedCount} sunucu uyarıldı.`;
        }
      } catch (threatErr) {
        console.warn('⚠️ Tehdit ağı güncellenemedi:', threatErr.message);
      }

      // Dashboard web-push bildirimi için uyarı kaydet
      try { recordAlert(guild.id, 'raid', `Anti-raid: ${reason}`); } catch { /* sessiz */ }
    }
  }

  await sendChannelLog(guild, client, banKickLogChannel, {
    title: '🚨 ANTİ-RAİD TETİKLENDİ',
    description: `**Şüpheli:** <@${actorId}> (${actorId})\n**Sebep:** ${reason}\n**Sonuç:** ${sonuc}`,
    color: 0xff0000,
    ...(await raidCardFiles(guild, client, actorId, reason, sonuc)),
  });

  // Owner'a DM bildirimi
  try {
    const { notifyOwner } = require('./threatNetwork');
    await notifyOwner(client, actorId, { severity: 'yüksek', reason, flagCount: 1 }, guild.name);
  } catch { /* sessiz */ }

  return sonuc;
}

/** Olay kartı (çizilemezse boş: log yalnızca metinle gider). */
async function raidCardFiles(guild, client, actorId, reason, result) {
  try {
    const { AttachmentBuilder } = require('discord.js');
    const { raidCard } = require('./canvas/cards');
    const { getGuildLanguage } = require('./i18n');
    const user = await client.users.fetch(actorId).catch(() => null);
    const clean = (x) => String(x || '').replace(/<[^>]+>/g, '').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
    const png = await raidCard({
      actorName: user?.displayName || user?.username || actorId,
      avatarUrl: user?.displayAvatarURL({ extension: 'png', size: 256 }) || null,
      reason: clean(reason), result: clean(result), isEn: getGuildLanguage(guild.id) === 'en',
    });
    return { files: [new AttachmentBuilder(png, { name: 'raid.png' })], image: 'attachment://raid.png' };
  } catch (e) { console.error('[raid card]', e.message); return {}; }
}

/**
 * Spam gibi daha az ciddi ihlallerde saldırganı atmak yerine belirli süre susturur (timeout).
 * Tekrarlanan spam durumunda tehdit ağına eklenir.
 */
async function timeoutRaider(guild, client, actorId, reason, seconds, banKickLogChannel) {
  resetActor(guild.id, actorId);

  const member = await guild.members.fetch(actorId).catch(() => null);

  let sonuc = 'Kullanıcı sunucuda bulunamadı (zaten ayrılmış olabilir).';
  if (member) {
    if (member.id === guild.ownerId) {
      sonuc = 'Sunucu sahibine işlem uygulanamaz.';
    } else if (!member.moderatable) {
      sonuc = 'Rol/izin yetersizliği nedeniyle susturulamadı! Botun rolünü yükseltmeni öneririz.';
    } else {
      await member.timeout(seconds * 1000, reason).catch(() => {});
      sonuc = `${seconds} saniye susturuldu (timeout).`;

      // ─── GLOBAL TEHDİT AĞINA EKLE (orta tehdit - spam) ───────────────────
      try {
        const threat = reportThreat(
          actorId,
          guild.id,
          guild.name,
          reason,
          'orta'  // Spam = orta tehdit (yüksek değil, sadece uyarı)
        );

        // Diğer sunucuları bilgilendir
        const notifiedCount = await notifyAllServers(client, actorId, threat, guild.id);
        if (notifiedCount > 0) {
          sonuc += ` Global tehdit ağına eklendi (orta seviye), ${notifiedCount} sunucu uyarıldı.`;
        }
      } catch (threatErr) {
        console.warn('⚠️ Tehdit ağı güncellenemedi:', threatErr.message);
      }

      // Dashboard web-push bildirimi için uyarı kaydet
      try { recordAlert(guild.id, 'spam', `Spam: ${reason}`); } catch { /* sessiz */ }
    }
  }

  await sendChannelLog(guild, client, banKickLogChannel, {
    title: '🚨 ANTİ-RAİD: SPAM TESPİT EDİLDİ',
    description: `**Şüpheli:** <@${actorId}> (${actorId})\n**Sebep:** ${reason}\n**Sonuç:** ${sonuc}`,
    color: 0xffaa00,
  });

  return sonuc;
}

module.exports = { punishRaider, timeoutRaider };
