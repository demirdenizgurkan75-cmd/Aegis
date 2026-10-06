// Aegis open-source build: only the first 36 of 110 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * AI YARDIMCILARI: mesajı çevir (sağ tık), kanalı özetle (/ai summarize), kurallar hakkında sor (/ai ask).
 * Cevaplar komut panelleriyle aynı kuralla (utils/publicReplies.js) herkese görünür; düz metin uyarılar gizli kalır. Ticket AI ile aynı günlük sunucu kotasını kullanır;
 * kişi başına bekleme süresi vardır. Gemini'ye giden metin veri olarak verilir, içindeki talimatlar yok sayılır.
 */
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { checkTicketAiLimit, incrementTicketAiUsage } = require('../utils/database');
const { LOCALES } = require('../utils/i18n');
const { tx, geminiJson, clip, banner } = require('./util');
const { rulesText } = require('./parole');

const cooldown = new Map(); // kullanıcı:komut → zaman
function onCooldown(key, ms) {
  const last = cooldown.get(key) || 0;
  if (Date.now() - last < ms) return Math.ceil((ms - (Date.now() - last)) / 1000);
  cooldown.set(key, Date.now());
  if (cooldown.size > 5000) cooldown.clear();
  return 0;
}

/** Discord arayüz dilinden (en-US, pt-BR, tr…) dil adı. */
function languageOf(locale) {
  const l = String(locale || 'en-US');
  const code = LOCALES[l] ? l : (LOCALES[l.split('-')[0]] ? l.split('-')[0] : 'en');
  return LOCALES[code] || 'English';
}

const eph = (interaction, content) => (interaction.deferred || interaction.replied ? interaction.editReply({ content }) : interaction.reply({ content, flags: MessageFlags.Ephemeral }));

function card(title, body, foot) {
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  c.addMediaGalleryComponents(banner('ai', 'Aegis AI'));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${body}`));
  if (foot) { c.addSeparatorComponents(new SeparatorBuilder()); c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${foot}`)); }
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "translate": (i) => require('../utils/ossStub').unavailable(i),
  "summarize": (i) => require('../utils/ossStub').unavailable(i),
  "ask": (i) => require('../utils/ossStub').unavailable(i),
  "languageOf": () => 'en',
});
