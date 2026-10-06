// ─── AEGIS BOT KALDIRMA GÜVENLİK DOĞRULAMA SİSTEMİ ───────────────────────────
// Botu sunucudan kaldırmak için sunucu sahibine 6 haneli DM onay kodu gönderilir.
// Sahip kodu Aegis DM'ine yazınca bot ayrılır.

const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');

// Map: code -> { guildId, guildName, ownerId, requestedBy, code, createdAt, expiresAt }
const pendingRequests = new Map();
// Map: guildId -> code (tek aktif istek tutmak için)
const guildToCode = new Map();

/**
 * 6 haneli rastgele onay kodu üretir (Örn: 593821)
 */
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Süresi geçmiş talepleri temizler
 */
function cleanExpired() {
  const now = Date.now();
  for (const [code, req] of pendingRequests.entries()) {
    if (now >= req.expiresAt) {
      guildToCode.delete(req.guildId);
      pendingRequests.delete(code);
    }
  }
}

/**
 * Botu kaldırma talebi oluşturur ve sunucu sahibine DM kodu gönderir
 */
async function createLeaveRequest(guild, requestedByUser, client) {
  if (!guild) {
    return { ok: false, error: 'Sunucu bulunamadı.' };
  }

  cleanExpired();

  // Sunucu sahibini bul
  let owner = null;
  try {
    owner = await guild.fetchOwner();
  } catch (_) {
    try {
      owner = await client.users.fetch(guild.ownerId);
    } catch (_) {}
  }

  if (!owner) {
    return { ok: false, error: 'Sunucu sahibine ulaşılamadı.' };
  }

  const ownerUser = owner.user || owner;

  // Varsa önceki kodu temizle
  const existingCode = guildToCode.get(guild.id);
  if (existingCode) {
    pendingRequests.delete(existingCode);
    guildToCode.delete(guild.id);
  }

  const code = generateCode();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 dakika

  // DM Container hazırla
  const dmContainer = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🚨 Aegis Bot Kaldırma Güvenlik Doğrulaması\n\n` +
        `Merhaba **${ownerUser.username}**,\n\n` +
        `**${guild.name}** sunucunuzdan Aegis botunun kaldırılması için bir talep alındı.\n\n` +
        `• **Talebi Başlatan:** <@${requestedByUser.id}> (${requestedByUser.username})\n` +
        `• **Sunucu:** **${guild.name}** (\`${guild.id}\`)\n` +
        `• **Zaman:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
        `🛡️ **Güvenlik Tedbiri:** Sunucunuzun yetkisiz kişilerce korumasız bırakılmasını önlemek adına, bot yalnızca sunucu sahibinin onayıyla ayrılır.\n\n` +
        `Botun sunucudan çıkarılmasını onaylıyorsanız aşağıdaki **6 haneli onay kodunu doğrudan bu sohbete (Aegis DM) gönderin**:\n\n` +
        `# 🔑 \`${code}\`\n\n` +
        `⏱️ *Bu kod 10 dakika boyunca geçerlidir. Siz onay vermediğiniz sürece bot sunucunuzda kalmaya ve korumaya devam edecektir.*`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('*Aegis Security Bot Removal Protection*'));

  try {
    await ownerUser.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 });
  } catch (err) {
    console.error('[LeaveVerify] DM gönderilemedi:', err.message);
    return {
      ok: false,
      error: `Sunucu sahibinin (${ownerUser.username}) özel mesajları (DM) kapalı olduğu için onay kodu iletilemedi. Lütfen sunucu sahibinin DM ayarlarını açmasını sağlayın.`,
    };
  }

  // İstek kaydet
  pendingRequests.set(code, {
    guildId: guild.id,
    guildName: guild.name,
    ownerId: guild.ownerId,
    requestedBy: requestedByUser.id,
    requestedByName: requestedByUser.username,
    code,
    createdAt: Date.now(),
    expiresAt,
  });
  guildToCode.set(guild.id, code);

  return {
    ok: true,
    code,
    ownerId: guild.ownerId,
    ownerUsername: ownerUser.username,
    expiresAt,
  };
}

/**
 * Aegis'e DM'den gelen mesajı analiz eder; onay kodu ise sunucudan ayrılır
 */
async function handleLeaveVerifyDm(message, client) {
  if (!message || message.guild || message.author.bot) return false;

  cleanExpired();

  const text = message.content.trim();
  // 6 haneli kod kontrolü
  const match = text.match(/\b(\d{6})\b/);
  if (!match) return false;

  const codeCandidate = match[1];
  const req = pendingRequests.get(codeCandidate);

  if (!req) {
    // Eğer kullanıcı özel olarak sadece 6 hane yazdıysa bilgi ver
    if (text === codeCandidate) {
      await message.reply(
        '❌ **Geçersiz veya Süresi Dolmuş Kod:** Girdiğiniz onay kodu bulunamadı veya 10 dakikalık süresi dolmuş.\n' +
        'Botu kaldırmak istiyorsanız lütfen sunucuda `/bot-kaldır` veya `a.ayrıl` komutu ile yeni bir kod talep edin.'
      ).catch(() => {});
      return true;
    }
    return false;
  }

  // Yalnızca sunucu sahibi onaylayabilir
  if (message.author.id !== req.ownerId) {
    await message.reply('❌ **Yetkisiz İşlem:** Bu onay kodu yalnızca ilgili sunucunun sahibi tarafından kullanılabilir.').catch(() => {});
    return true;
  }

  // Kod geçerli ve süresi dolmamış
  pendingRequests.delete(codeCandidate);
  guildToCode.delete(req.guildId);

  const targetGuild = client.guilds.cache.get(req.guildId);
  const guildName = targetGuild ? targetGuild.name : req.guildName;

  const successContainer = new ContainerBuilder()
    .setAccentColor(0x3ba55c)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ✅ Doğrulama Başarılı: Sunucudan Ayrılınıyor\n\n` +
        `Sayın **${message.author.username}**,\n\n` +
        `**${guildName}** sunucusu için verdiğiniz kaldırma onayı doğrulandı.\n` +
        `Aegis botu sunucudan güvenli bir şekilde ayrılıyor.\n\n` +
        `🛡️ Bizi tercih ettiğiniz için teşekkür ederiz. İhtiyaç duyduğunuzda botu tekrar davet edebilirsiniz!`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('*Aegis Security*'));

  await message.reply({ components: [successContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});

  if (targetGuild) {
    try {
      console.log(`[LeaveVerify] ${message.author.username} tarafından onaylandı. Aegis "${guildName}" sunucusundan ayrılıyor...`);
      await targetGuild.leave();
    } catch (leaveErr) {
      console.error(`[LeaveVerify] Ayrılma hatası (${req.guildId}):`, leaveErr.message);
    }
  }

  return true;
}

/**
 * Sunucuya ait aktif kaldırma isteği var mı
 */
function getActiveLeaveRequest(guildId) {
  cleanExpired();
  const code = guildToCode.get(guildId);
  if (!code) return null;
  return pendingRequests.get(code) || null;
}

module.exports = {
  createLeaveRequest,
  handleLeaveVerifyDm,
  getActiveLeaveRequest,
};
