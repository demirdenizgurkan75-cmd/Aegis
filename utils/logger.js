const { EmbedBuilder } = require('discord.js');

const missingLogChannels = new Map(); // guildId:channelId → son uyarı zamanı
const { getGuildLanguage } = require('./i18n');
const { getGuild } = require('./database');

// ─── BAŞLIK ÇEVİRİ TABLOSU ──────────────────────────────────────────────────
const TITLE_MAP_TR_TO_EN = {
  '📁 Kanal Oluşturuldu': '📁 Channel Created',
  '🗑️ Kanal Silindi': '🗑️ Channel Deleted',
  '✏️ Kanal Adı Değiştirildi': '✏️ Channel Renamed',
  '🔨 Üye Banlandı': '🔨 Member Banned',
  '⚪ Ban Kaldırıldı': '⚪ Ban Revoked',
  '📤 Üye Ayrıldı': '📤 Member Left',
  '👢 Üye Atıldı (Kick)': '👢 Member Kicked',
  '🗑️ Mesaj Silindi': '🗑️ Message Deleted',
  '✏️ Mesaj Düzenlendi': '✏️ Message Edited',
  '📨 Davet Linki Oluşturuldu': '📨 Invite Link Created',
  '🗑️ Davet Linki Silindi/Süresi Doldu': '🗑️ Invite Link Deleted / Expired',
  '🗑️ Rol Silindi': '🗑️ Role Deleted',
  '🛡️ Rol Verildi': '🛡️ Role Added',
  '🛡️ Rol Alındı': '🛡️ Role Removed',
  '🛡️ Rol Oluşturuldu': '🛡️ Role Created',
  '✏️ Rol Güncellendi': '✏️ Role Updated',
  '✏️ Kullanıcı Adı / Nick Değiştirildi': '✏️ Nickname Changed',
  '✏️ Kanal Güncellendi': '✏️ Channel Updated',
  '🔊 Ses Kanalına Katıldı': '🔊 Joined Voice Channel',
  '🔇 Ses Kanalından Ayrıldı': '🔇 Left Voice Channel',
  '🔀 Ses Kanalı Değiştirildi': '🔀 Switched Voice Channel',
  '📥 Üye Katıldı': '📥 Member Joined',
  '🚨 Yetkisiz Bot Ekleme Engellendi (Karantina & Kick)': '🚨 Unauthorized Bot Addition Blocked (Quarantined & Kicked)',
  '🤖 Yeni Bot Eklendi — İzleniyor': '🤖 New Bot Added — Monitored',
  '🚨 ANTİ-RAİD TETİKLENDİ': '🚨 ANTI-RAID TRIGGERED',
  '🚨 ANTİ-RAİD: SPAM TESPİT EDİLDİ': '🚨 ANTI-RAID: SPAM DETECTED',
  'Kullanıcı Uyarıldı': 'User Warned',
  'Kullanıcı Banlandı': 'User Banned',
  'Kullanıcıya Timeout Uygulandı': 'User Timed Out',
  'Kullanıcı Sunucudan Atıldı': 'User Kicked From Server',
  'Şüpheli Hesap Tespit Edildi': 'Suspicious Account Detected',
  '🛡️ Otomatik Moderasyon: Küfür / Hakaret Engellendi': '🛡️ AutoMod: Profanity / Inappropriate Language Blocked',
  '🛡️ Otomatik Moderasyon: Reklam / Davet Engellendi': '🛡️ AutoMod: Unauthorized Invite Link Blocked',
  '🛡️ Otomatik Moderasyon: Zararlı Bağlantı Engellendi': '🛡️ AutoMod: Malicious / Unverified Link Blocked',
  '🛡️ Otomatik Moderasyon: Spam Engellendi': '🛡️ AutoMod: Spam Detected & Blocked',
  '🛡️ Otomatik Moderasyon: Aşırı Büyük Harf Engellendi': '🛡️ AutoMod: Excessive Capitalization Filtered',
  '[ AI: Potansiyel İhlal — Şaka/Sarkazm Olarak Değerlendirildi ]': '[ AI: Potential Violation — Evaluated as Humor/Sarcasm ]',
};

// ─── METİN VE ALAN ÇEVİRİ REGEX LİSTESİ ──────────────────────────────────────
const REPLACEMENTS = [
  // Etiketler & Başlıklar
  [/\*\*Kullanıcı:\*\*/g, '**User:**'],
  [/\*\*Kullanıcı ID:\*\*/g, '**User ID:**'],
  [/\*\*Kullanıcı ID\*\*/g, '**User ID**'],
  [/\*\*Yetkili:\*\*/g, '**Moderator:**'],
  [/\*\*Moderatör:\*\*/g, '**Moderator:**'],
  [/\*\*Sebep:\*\*/g, '**Reason:**'],
  [/\*\*Neden:\*\*/g, '**Reason:**'],
  [/\*\*Kanal:\*\*/g, '**Channel:**'],
  [/\*\*Kanal ID:\*\*/g, '**Channel ID:**'],
  [/\*\*Rol:\*\*/g, '**Role:**'],
  [/\*\*Verilen Rol:\*\*/g, '**Role Added:**'],
  [/\*\*Verilen Rol\(ler\):\*\*/g, '**Role(s) Added:**'],
  [/\*\*Alınan Rol:\*\*/g, '**Role Removed:**'],
  [/\*\*Alınan Rol\(ler\):\*\*/g, '**Role(s) Removed:**'],
  [/\*\*Eski Nick:\*\*/g, '**Old Nickname:**'],
  [/\*\*Yeni Nick:\*\*/g, '**New Nickname:**'],
  [/\*\*Renk:\*\*/g, '**Color:**'],
  [/\*\*Eski Renk:\*\*/g, '**Old Color:**'],
  [/\*\*Yeni Renk:\*\*/g, '**New Color:**'],
  [/\*\*Eski Ad:\*\*/g, '**Old Name:**'],
  [/\*\*Yeni Ad:\*\*/g, '**New Name:**'],
  [/\*\*Ayrı Gösterim:\*\*/g, '**Hoisted:**'],
  [/\*\*Etiketlenebilir:\*\*/g, '**Mentionable:**'],
  [/\*\*Değişiklikler:\*\*/g, '**Changes:**'],
  [/\*\*Yetkiler:\*\*/g, '**Permissions:**'],
  [/\bEvet\b/g, 'Yes'],
  [/\bHayır\b/g, 'No'],
  [/\*\*Toplam:\*\*/g, '**Total:**'],
  [/\*\*Toplam Üye:\*\*/g, '**Total Members:**'],
  [/\*\*Hesap Yaşı:\*\*/g, '**Account Age:**'],
  [/\*\*İçerik:\*\*/g, '**Content:**'],
  [/\*\*Önce:\*\*/g, '**Before:**'],
  [/\*\*Sonra:\*\*/g, '**After:**'],
  [/\*\*Kod:\*\*/g, '**Code:**'],
  [/\*\*Oluşturan:\*\*/g, '**Creator:**'],
  [/\*\*Maks\. Kullanım:\*\*/g, '**Max Uses:**'],
  [/\*\*Süre:\*\*/g, '**Duration:**'],
  [/\*\*Şüpheli:\*\*/g, '**Suspect:**'],
  [/\*\*Sonuç:\*\*/g, '**Result:**'],
  [/\*\*Eylem:\*\*/g, '**Action:**'],
  [/\*\*Yürütücü:\*\*/g, '**Executor:**'],
  [/\*\*Saldırgan:\*\*/g, '**Attacker:**'],
  [/\*\*Durum:\*\*/g, '**Status:**'],
  [/\*\*Eklenen Bot:\*\*/g, '**Added Bot:**'],
  [/\*\*Ekleyen Kişi:\*\*/g, '**Added By:**'],
  [/\*\*Ekleyen Yetkili\/Üye:\*\*/g, '**Added By Staff/Member:**'],
  [/\*\*Tetikleyici:\*\*/g, '**Trigger:**'],
  [/\*\*AI Kararı:\*\*/g, '**AI Decision:**'],
  [/\*\*Mesaj:\*\*/g, '**Message:**'],
  [/\*\*İhlal Türü:\*\*/g, '**Violation Type:**'],
  [/\*\*Tarih:\*\*/g, '**Date:**'],
  [/\*\*Güven Skoru:\*\*/g, '**Trust Score:**'],
  [/\*\*Risk Faktörleri:\*\*/g, '**Risk Factors:**'],
  [/\*\*Öneri:\*\*/g, '**Recommendation:**'],

  // Cümle & Durum Çevirileri
  [/sunucudan ayrıldı\./g, 'left the server.'],
  [/sunucuya katıldı\./g, 'joined the server.'],
  [/sunucuya katıldı ancak güven skoru düşük\./g, 'joined the server with a low trust score.'],
  [/\*\(içerik yok \/ medya\)\*/g, '*(no text content / media)*'],
  [/\*\(içerik yok\)\*/g, '*(no content)*'],
  [/\bSınırsız\b/g, 'Unlimited'],
  [/\bSüresiz\b/g, 'Permanent'],
  [/\bsaat\b/g, 'hours'],
  [/\bBilinmiyor\b/g, 'Unknown'],
  [/\bBelirtilmedi\b/g, 'Not specified'],
  [/Sunucudan atıldı\./g, 'Kicked from server.'],
  [/Kullanıcı sunucuda bulunamadı \(zaten ayrılmış olabilir\)\./g, 'User not found in server (may have already left).'],
  [/Sunucu sahibine işlem uygulanamaz\./g, 'Action cannot be applied to server owner.'],
  [/Rol\/izin yetersizliği nedeniyle atılamadı! Botun rolünü yükseltmeni öneririz\./g, 'Failed to kick due to role hierarchy! Please raise the bot\'s role.'],
  [/Rol\/izin yetersizliği nedeniyle susturulamadı! Botun rolünü yükseltmeni öneririz\./g, 'Failed to timeout due to role hierarchy! Please raise the bot\'s role.'],
  [/saniye susturuldu \(timeout\)\./g, 'seconds timed out.'],
  [/Global tehdit ağına eklendi/g, 'Added to global threat network'],
  [/sunucu uyarıldı\./g, 'servers alerted.'],
  [/Bot güvenlik kalkanı tarafından \*\*sunucudan anında atıldı\*\*\./g, 'Bot was **instantly kicked from the server** by the security shield.'],
  [/\*Sunucuya sadece Sunucu Sahibi veya Beyaz Listedeki \(Whitelist\) yöneticiler bot ekleyebilir\.\*/g, '*Only Server Owner or Whitelisted administrators can add bots.*'],
  [/sunucuya bir bot olarak eklendi\./g, 'was added to the server as a bot.'],
  [/Bu bot kanal\/rol silme, toplu ban veya mesaj spamı gibi şüpheli davranış gösterirse Aegis otomatik olarak atacaktır\./g, 'Aegis will automatically kick this bot if it exhibits suspicious behavior such as mass deletes, mass bans, or spam.'],
  [/⚠️ \*\*Bu kullanıcı global tehdit ağında kayıtlı!\*\*/g, '⚠️ **This user is registered in the global threat network!**'],
  [/Bu hesap yüksek risk taşıyor\. Manuel inceleme veya ban düşünebilirsiniz\. \/guven-skoru ile detayları görün\./g, 'This account carries high risk. Manual review or ban is recommended. Use /guven-skoru to view details.'],
  [/Bu hesabı yakından izleyin\. Şüpheli davranış olursa aksiyona geçin\./g, 'Monitor this account closely. Take action if suspicious activity occurs.'],
  [/Faktör yok/g, 'No risk factors detected'],
  [/\(Kategori\)/g, '(Category)'],
  [/\(Kanal\)/g, '(Channel)'],
  [/\bKategori\b/g, 'Category'],
  [/\bMesaj silinmedi \(düşük tehdit güveni\)/g, 'Message not deleted (low threat confidence)'],
  [/Sunucu \*\*kilitlendi\*\*\. Tüm kanallara yazma kapatıldı\.\nNeden: Anti-Nuke tetiklendi\./g, 'Server is **locked down**. Writing across all channels has been suspended.\nReason: Anti-Nuke triggered.'],
  [/Sunucu kilidi \*\*kaldırıldı\*\*\. Normal işleme devam ediliyor\./g, 'Server lockdown **lifted**. Normal operation resumed.'],
];

/**
 * Verilen metni (varsa) İngilizceye çevirir
 */
function translateText(text) {
  if (!text || typeof text !== 'string') return text;
  let res = text;
  for (const [regex, replacement] of REPLACEMENTS) {
    res = res.replace(regex, replacement);
  }
  return res;
}

/**
 * Log başlığını İngilizceye çevirir
 */
function translateTitle(title) {
  if (!title || typeof title !== 'string') return title;
  if (TITLE_MAP_TR_TO_EN[title]) return TITLE_MAP_TR_TO_EN[title];
  for (const [tr, en] of Object.entries(TITLE_MAP_TR_TO_EN)) {
    if (title.includes(tr)) {
      return title.replace(tr, en);
    }
  }
  return translateText(title);
}

/**
 * Belirli bir log kanalına stilize bir embed gönderir.
 * Sunucu dili İngilizce ise otomatik olarak tüm başlıkları, açıklamaları ve alanları İngilizceye çevirir.
 */
async function sendChannelLog(guild, client, channelId, payload = {}) {
  if (!guild) return;

  const isEn = getGuildLanguage(guild.id) === 'en';

  // Alternatif imza desteği: sendChannelLog(guild, 'warn', interaction.user, targetUser, reason, duration)
  if (typeof client === 'string') {
    const action = client;
    const moderator = channelId;
    const targetUser = payload;
    const reason = arguments[4] || (isEn ? 'Not specified' : 'Belirtilmedi');
    const duration = arguments[5];

    const settings = getGuild(guild.id);
    const targetLogChannelId = settings.banKickLogChannel || settings.logChannel;
    if (!targetLogChannelId) return;

    const actionTitles = {
      warn: isEn ? '⚠️ User Warned' : '⚠️ Kullanıcı Uyarıldı',
      timeout: isEn ? '🔇 User Timed Out' : '🔇 Kullanıcıya Timeout Uygulandı',
      kick: isEn ? '👢 User Kicked' : '👢 Kullanıcı Sunucudan Atıldı',
      ban: isEn ? '🔨 User Banned' : '🔨 Kullanıcı Banlandı',
      purge: isEn ? '🧹 Messages Purged' : '🧹 Mesajlar Temizlendi',
    };

    const actionColors = {
      warn: 0xf0b232,
      timeout: 0xf0b232,
      kick: 0xed4245,
      ban: 0xed4245,
      purge: 0x3ba55c,
    };

    const fields = [
      { name: isEn ? 'User' : 'Kullanıcı', value: targetUser ? `${targetUser.tag || targetUser.username} (<@${targetUser.id}>)` : 'N/A', inline: true },
      { name: isEn ? 'Moderator' : 'Moderatör', value: moderator ? `<@${moderator.id}>` : 'N/A', inline: true },
      { name: isEn ? 'Reason' : 'Sebep', value: reason, inline: false },
    ];
    if (duration) {
      fields.push({ name: isEn ? 'Duration' : 'Süre', value: duration, inline: true });
    }

    return sendChannelLog(guild, guild.client || client, targetLogChannelId, {
      title: actionTitles[action] || `Moderation: ${action}`,
      description: isEn ? `Action: **${action.toUpperCase()}**` : `Eylem: **${action.toUpperCase()}**`,
      color: actionColors[action] || 0x0066ff,
      fields,
    });
  }

  const settings = getGuild(guild.id) || {};
  const targetChannelId = channelId || settings.logChannel;
  if (!targetChannelId) return;

  let channel = guild.channels.cache.get(targetChannelId);
  if (!channel) {
    try {
      channel = await guild.channels.fetch(targetChannelId).catch(() => null);
    } catch (_) { }
  }
  if (!channel) {
    // Silinmiş log kanalı her olayda log'u doldurmasın: aynı kanal için 30 dakikada bir uyar
    const key = `${guild.id}:${targetChannelId}`;
    if (Date.now() - (missingLogChannels.get(key) || 0) > 30 * 60000) {
      missingLogChannels.set(key, Date.now());
      console.warn(`[sendChannelLog] Target channel ${targetChannelId} not found in guild ${guild.name} (${guild.id})`);
    }
    return;
  }

  let { title, description, color = 0x0066ff, fields = [] } = payload;

  if (isEn) {
    title = translateTitle(title);
    description = translateText(description);
    if (Array.isArray(fields) && fields.length > 0) {
      fields = fields.map(f => {
        let fName = f.name;
        let fVal = f.value;
        if (fName) {
          fName = translateText(fName)
            .replace(/^Kullanıcı$/i, 'User')
            .replace(/^Moderatör$/i, 'Moderator')
            .replace(/^Sebep$/i, 'Reason')
            .replace(/^Neden$/i, 'Reason')
            .replace(/^Toplam$/i, 'Total')
            .replace(/^Süre$/i, 'Duration')
            .replace(/^Kanal$/i, 'Channel')
            .replace(/^Eylem$/i, 'Action')
            .replace(/^Saldırgan$/i, 'Attacker')
            .replace(/^Durum$/i, 'Status')
            .replace(/^Yürütücü$/i, 'Executor')
            .replace(/^Sonuç$/i, 'Result')
            .replace(/^Güven Skoru$/i, 'Trust Score')
            .replace(/^Risk Faktörleri$/i, 'Risk Factors')
            .replace(/^Öneri$/i, 'Recommendation')
            .replace(/^Verilen Rol(\(ler\))?$/i, 'Role Added')
            .replace(/^Alınan Rol(\(ler\))?$/i, 'Role Removed')
            .replace(/^Eski Nick$/i, 'Old Nickname')
            .replace(/^Yeni Nick$/i, 'New Nickname')
            .replace(/^Eski Ad$/i, 'Old Name')
            .replace(/^Yeni Ad$/i, 'New Name')
            .replace(/^Eski Renk$/i, 'Old Color')
            .replace(/^Yeni Renk$/i, 'New Color')
            .replace(/^Ayrı Gösterim$/i, 'Hoisted')
            .replace(/^Etiketlenebilir$/i, 'Mentionable')
            .replace(/^Değişiklikler$/i, 'Changes')
            .replace(/^Yetkiler$/i, 'Permissions')
            .replace(/^Kullanıcı ID$/i, 'User ID')
            .replace(/^Yetkili ID$/i, 'Moderator ID');
        }
        if (fVal) {
          fVal = translateText(fVal)
            .replace(/^Yasaklandı$/i, 'Banned')
            .replace(/^Yasaklanamadı$/i, 'Failed to ban');
        }
        return { ...f, name: fName, value: fVal };
      });
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(title || (isEn ? 'Aegis Log' : 'Aegis Günlüğü'))
    .setColor(color || 0x4466ff)
    .setTimestamp()
    .setFooter({
      text: 'Aegis Security',
      iconURL: client?.user ? client.user.displayAvatarURL() : undefined,
    });

  if (description) embed.setDescription(description);
  if (fields && fields.length) embed.addFields(fields);

  if (payload.image) embed.setImage(payload.image);
  const messageOptions = { embeds: [embed] };
  if (payload.files) messageOptions.files = payload.files;
  if (payload.content) {
    messageOptions.content = isEn ? translateText(payload.content) : payload.content;
  }

  try {
    await channel.send(messageOptions);
  } catch (err) {
    console.error(`[sendChannelLog] Failed to send to ${channelId}:`, err.message);
  }
}

module.exports = {
  sendChannelLog,
  translateText,
  translateTitle,
};
