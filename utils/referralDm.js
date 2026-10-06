// DM ile öneri ödülü: kullanıcı Aegis'i bir arkadaşına önerdiği konuşmanın ekran görüntüsünü Aegis'e
// DM'den gönderir; yapay zekâ görseli inceler, onaylarsa kullanıcının yönettiği sunucu 30 gün Ballad alır.
//
// Kötüye kullanım sınırları:
// - kullanıcı başına 30 günde bir onay
// - aynı görsel (içerik özeti) ikinci kez kabul edilmez
// - ödül yalnızca kullanıcının sahibi olduğu ya da "Sunucuyu Yönet" yetkisi olduğu, Aegis'in bulunduğu sunucuya verilir
const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');
const { PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild, readDB, writeDB } = require('./database');

const REWARD_DAYS = 30;
const COOLDOWN_MS = REWARD_DAYS * 86400000;
const MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Birden fazla sunucusu olan kullanıcı: görsel onaylandıktan sonra hangi sunucu seçilecek
const pendingChoice = new Map(); // userId -> { guildIds, expires }

function store() {
  const db = readDB();
  if (!db._dmReferrals) db._dmReferrals = { users: {}, hashes: [] };
  return db;
}

async function managedGuilds(client, userId) {
  const out = [];
  for (const guild of client.guilds.cache.values()) {
    if (guild.ownerId === userId) {
      out.push(guild);
      continue;
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member?.permissions.has(PermissionFlagsBits.ManageGuild)) out.push(guild);
  }
  return out;
}

function grant(guildId) {
  const s = getGuild(guildId);
  const until = Math.max(Date.now(), s.rewardUntil || 0) + COOLDOWN_MS;
  updateGuild(guildId, { rewardUntil: until });
  return until;
}

async function judgeImage(buffer, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, unavailable: true };
  const ai = new GoogleGenAI({ apiKey: key });
  const prompt =
    'Bu bir ekran görüntüsü. Yalnızca JSON döndür: {"approved": boolean, "reason": "kısa Türkçe gerekçe"}.\n' +
    'approved=true olması için görselde, gönderen kişinin bir başkasına "Aegis" adlı Discord botunu önerdiği bir sohbet ' +
    '(Discord, WhatsApp, Instagram vb.) görünmeli: mesajda "Aegis", "Aegis Guard", "betterwithaegis.com" ya da Aegis davet linki geçmeli ' +
    've bir öneri/tavsiye niteliği taşımalı. Şunlarda approved=false ver: sohbet yoksa, Aegis geçmiyorsa, yalnızca botun kendi ' +
    'sayfası/profili görünüyorsa, görsel boş, okunamaz ya da açıkça düzenlenmiş görünüyorsa.';
  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: buffer.toString('base64') } }] }],
        config: { temperature: 0, responseMimeType: 'application/json' },
      });
      const parsed = JSON.parse(res.text);
      if (typeof parsed.approved === 'boolean') return { ok: true, approved: parsed.approved, reason: String(parsed.reason || '').slice(0, 300) };
    } catch {
      // sıradaki modeli dene
    }
  }
  return { ok: false, unavailable: true };
}

/** DM mesajını işler; öneri akışına aitse true döndürür. */
async function handleReferralDm(message, client) {
  const userId = message.author.id;
  const text = (message.content || '').trim().toLowerCase();
  const image = message.attachments.find((a) => (a.contentType || '').startsWith('image/'));

  // Sunucu seçimi bekleniyorsa: "8", "8." ya da "8)" kabul edilir; anlaşılmazsa nasıl yazılacağı söylenir.
  // Onay zaten kaydedildiği için seçim bitene kadar bekleme durumu korunur.
  const pending = pendingChoice.get(userId);
  if (pending && !image) {
    if (pending.expires < Date.now()) {
      pendingChoice.delete(userId);
      await message.reply('Seçim süresi doldu. Ödülün kaybolmadı: "öneri" yaz, sunucu listesini tekrar göndereyim.').catch(() => {});
      return true;
    }
    const num = text.match(/^\s*(\d{1,2})\s*[.)]?\s*$/);
    const guildId = num && pending.guildIds[Number(num[1]) - 1];
    const guild = guildId && client.guilds.cache.get(guildId);
    if (!guild) {
      await message.reply(`Listeden yalnızca sunucunun **numarasını** yaz (1 ile ${pending.guildIds.length} arası), örneğin: 1`).catch(() => {});
      return true;
    }
    pendingChoice.delete(userId);
    const until = grant(guild.id);
    const db2 = store();
    if (db2._dmReferrals.users[userId]) db2._dmReferrals.users[userId].unclaimed = false;
    writeDB(db2);
    await message.reply(`Tamam! **${guild.name}** sunucusu <t:${Math.floor(until / 1000)}:D> tarihine kadar **Ballad** paketini kullanıyor. Önerdiğin için teşekkürler!`).catch(() => {});
    return true;
  }

  if (!image) {
    if (/\b(öneri|oneri|referans|davet ödülü|ballad)\b/.test(text)) {
      // Onaylanmış ama sunucusu henüz seçilmemiş bir ödül varsa listeyi yeniden gönder
      const rec = store()._dmReferrals.users[userId];
      if (rec?.unclaimed) {
        const gs = (await managedGuilds(client, userId)).slice(0, 20);
        if (gs.length) {
          pendingChoice.set(userId, { guildIds: gs.map((g) => g.id), expires: Date.now() + 30 * 60000 });
          await message.reply('Onaylı ödülün seni bekliyor. Hangi sunucuya gitsin? Numarasını yaz:\n' + gs.map((g, i) => `**${i + 1}.** ${g.name}`).join('\n')).catch(() => {});
          return true;
        }
      }
      await message.reply(
        "Aegis'i bir arkadaşına önerdiysen o konuşmanın **ekran görüntüsünü** buraya gönder. Yapay zekâ kontrol eder; onaylanırsa yönettiğin sunucu " +
        `**${REWARD_DAYS} gün Ballad** paketini ücretsiz alır. Kişi başına ${REWARD_DAYS} günde bir kez geçerlidir.`
      ).catch(() => {});
      return true;
    }
    return false;
  }

  const db = store();
  const userRec = db._dmReferrals.users[userId];
  if (userRec?.lastApprovedAt && Date.now() - userRec.lastApprovedAt < COOLDOWN_MS) {
    const next = Math.floor((userRec.lastApprovedAt + COOLDOWN_MS) / 1000);
    await message.reply(`Öneri ödülünü zaten aldın. Bir sonrakini <t:${next}:D> tarihinden sonra gönderebilirsin.`).catch(() => {});
    return true;
  }
  if (image.size > MAX_IMAGE_BYTES) {
    await message.reply('Görsel çok büyük (en fazla 8 MB). Daha küçük bir ekran görüntüsü gönder.').catch(() => {});
    return true;
  }

  const guilds = await managedGuilds(client, userId);
  if (!guilds.length) {
    await message.reply("Ödül, Aegis'in bulunduğu ve senin yönettiğin bir sunucuya verilir. Önce Aegis'i kendi sunucuna ekle: https://betterwithaegis.com/r/dm").catch(() => {});
    return true;
  }

  await message.channel.sendTyping().catch(() => {});
  let buffer;
  try {
    const res = await fetch(image.url);
    buffer = Buffer.from(await res.arrayBuffer());
  } catch {
    await message.reply('Görseli indiremedim, tekrar dener misin?').catch(() => {});
    return true;
  }
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  if (db._dmReferrals.hashes.includes(hash)) {
    await message.reply('Bu ekran görüntüsü daha önce kullanılmış.').catch(() => {});
    return true;
  }

  const verdict = await judgeImage(buffer, image.contentType || 'image/png');
  if (!verdict.ok) {
    await message.reply('Şu an görseli kontrol edemiyorum. Birkaç saat sonra tekrar gönderir misin?').catch(() => {});
    return true;
  }
  if (!verdict.approved) {
    await message.reply(`Onaylayamadım: ${verdict.reason || "görselde Aegis'i önerdiğin bir konuşma göremedim."}\nAegis'in adının ya da linkinin göründüğü bir konuşmanın ekran görüntüsünü gönderebilirsin.`).catch(() => {});
    return true;
  }

  // Onaylandı: kaydet
  const fresh = store();
  fresh._dmReferrals.hashes.push(hash);
  fresh._dmReferrals.users[userId] = { lastApprovedAt: Date.now(), unclaimed: guilds.length > 1 };
  writeDB(fresh);

  if (guilds.length === 1) {
    const until = grant(guilds[0].id);
    await message.reply(`Onaylandı! **${guilds[0].name}** sunucusu <t:${Math.floor(until / 1000)}:D> tarihine kadar **Ballad** paketini kullanıyor. Teşekkürler!`).catch(() => {});
    return true;
  }
  const list = guilds.slice(0, 20);
  pendingChoice.set(userId, { guildIds: list.map((g) => g.id), expires: Date.now() + 30 * 60000 });
  await message.reply(
    'Onaylandı! Ödül hangi sunucuya gitsin? Numarasını yaz:\n' + list.map((g, i) => `**${i + 1}.** ${g.name}`).join('\n')
  ).catch(() => {});
  return true;
}

module.exports = { handleReferralDm, judgeImage };
