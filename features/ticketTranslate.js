/**
 * ÇOK DİLLİ BİLETLER
 * Bilet açan üye kendi dilinde yazar; mesajı yetkili dilinde, yetkili cevabı üyenin dilinde
 * kanalda altına çeviri olarak eklenir. Dil otomatik algılanır (Gemini), günlük AI kotası
 * Ticket AI ile ortaktır (utils/database.js checkTicketAiLimit).
 *
 * Veri: guild.ticketTranslate = { enabled, staffLang }, ticket.userLang
 */
const { getGuild, updateGuild, updateTicket, checkTicketAiLimit, incrementTicketAiUsage } = require('../utils/database');
const { LOCALES } = require('../utils/i18n');
const { geminiJson, clip } = require('./util');

const lastAt = new Map(); // kanal başına basit hız sınırı

function getCfg(guildId) {
  const t = getGuild(guildId).ticketTranslate || {};
  return { enabled: !!t.enabled, staffLang: t.staffLang || 'en' };
}
function saveCfg(guildId, cfg) { return updateGuild(guildId, { ticketTranslate: cfg }); }

const base = (code) => String(code || '').toLowerCase().split(/[-_]/)[0];
const langName = (code) => LOCALES[code] || LOCALES[Object.keys(LOCALES).find(k => base(k) === base(code))] || code;

async function onMessage(message) {
  if (!message.guild || message.author?.bot || !message.content) return;
  const cfg = getCfg(message.guild.id);
  if (!cfg.enabled) return;
  const text = message.content.trim();
  if (text.length < 3 || text.length > 900 || /^(a\.|https?:\/\/\S+$)/i.test(text)) return;

  const hit = findTicket(message.guild.id, message.channel.id);
  if (!hit || hit.ticket.closed) return;
  const { id: ticketId, ticket } = hit;
  const fromOpener = message.author.id === ticket.userId;
  const target = fromOpener ? cfg.staffLang : ticket.userLang;
  if (!target) return; // yetkili yazdı ama üyenin dili henüz bilinmiyor

  const now = Date.now();
  if (now - (lastAt.get(message.channel.id) || 0) < 1500) return;
  lastAt.set(message.channel.id, now);
  if (!checkTicketAiLimit(message.guild.id).allowed) return;

  const out = await geminiJson(
    `Detect the language of the message and translate it into ${langName(target)} (${target}). ` +
    `Keep names, mentions, emoji and code unchanged. Return JSON: {"lang":"<ISO 639-1 code of the message language>","translation":"<translation, or the original text if already in the target language>"}.\n` +
    `Message: """${clip(text, 900)}"""`,
    { maxTokens: 700, temperature: 0.1 });
  incrementTicketAiUsage(message.guild.id);
  if (!out || !out.lang || !out.translation) return;

  const detected = base(out.lang);
  if (fromOpener && detected && detected !== ticket.userLang) updateTicket(message.guild.id, ticketId, { userLang: detected });
  if (detected === base(target)) return; // zaten hedef dilde

  await message.reply({
    content: `🌐 **${detected.toUpperCase()} → ${base(target).toUpperCase()}**\n>>> ${clip(String(out.translation), 1800)}`,
    allowedMentions: { parse: [], repliedUser: false },
  }).catch(() => {});
}

// Sessiz bilet arama (database.getTicketByChannelId her ıskada log yazar, her mesajda kullanılamaz)
function findTicket(guildId, channelId) {
  const tickets = getGuild(guildId).tickets;
  if (!tickets) return null;
  for (const [id, ticket] of Object.entries(tickets)) if (ticket.channelId === channelId) return { id, ticket };
  return null;
}

module.exports = { getCfg, saveCfg, onMessage, langName };
