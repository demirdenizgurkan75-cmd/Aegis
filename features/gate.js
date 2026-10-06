// Aegis open-source build: only the first 94 of 253 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * KURAL KAPISI
 * Kurallar kanalına bir mesaj + "Sınava gir" düğmesi konur. Üye sunucunun kurallarından üretilen
 * 3 soruluk sınavı (en az 2 doğru) geçerse üye rolünü alır ve kanallar açılır. Sorular Gemini ile üretilir.
 * Yönetici paneli (/gate) ve oyuncu tarafı bu dosyada.
 *
 * Veri: guild.gate = { enabled, channelId, roleId, messageId, messageChannelId, cooldownMin, passed, failed }
 * customId'ler: gate:start • gate:a:<sid>:<i> (üye) • gateui:* (panel)
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const crypto = require('crypto');
const { getGuild, updateGuild } = require('../utils/database');
const { rulesText, makeQuiz } = require('./parole');
const { tx, shuffle, clip, banner } = require('./util');
const { em } = require('./mascotEmoji');

const isAdmin = (member) => !!member?.permissions?.has(PermissionFlagsBits.ManageGuild);
const txt = (s) => new TextDisplayBuilder().setContent(s);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

const sessions = new Map();   // sid → { gid, uid, qs, i, correct, exp }
const cooldowns = new Map();  // gid:uid → bitiş zamanı
const quizCache = new Map();  // gid → { key, at, qs }

function getCfg(guildId) {
  const g = getGuild(guildId).gate || {};
  return {
    enabled: !!g.enabled, channelId: g.channelId || null, roleId: g.roleId || null,
    messageId: g.messageId || null, messageChannelId: g.messageChannelId || null,
    cooldownMin: g.cooldownMin || 10, passed: g.passed || 0, failed: g.failed || 0,
  };
}
function saveCfg(guildId, cfg) { return updateGuild(guildId, { gate: cfg }); }

const hasRules = (gid) => rulesText(gid).length >= 40;

// ── Sınav: Gemini çağrısını azaltmak için 20 dk önbellek, her üyeye farklı sıra ──
async function getQuiz(gid) {
  const rules = rulesText(gid);
  const key = crypto.createHash('md5').update(rules).digest('hex');
  const hit = quizCache.get(gid);
  let qs = hit && hit.key === key && Date.now() - hit.at < 20 * 60000 ? hit.qs : null;
  if (!qs) {
    qs = await makeQuiz(gid);
    if (!qs) return null;
    quizCache.set(gid, { key, at: Date.now(), qs });
  }
  return shuffle(qs).map((q) => {
    const opts = shuffle(q.options.map((o, i) => ({ o, ok: i === q.answer })));
    return { q: q.q, options: opts.map(x => x.o), answer: opts.findIndex(x => x.ok) };
  });
}

function questionPayload(s, gid) {
  const q = s.qs[s.i];
  const e = new EmbedBuilder().setColor(0x0066ff)
    .setTitle(tx(gid, `Kural sınavı ${s.i + 1}/3`, `Rules quiz ${s.i + 1}/3`))
    .setDescription(`**${q.q}**\n\n${q.options.map((o, i) => `**${'ABC'[i]}.** ${o}`).join('\n')}`);
  const row = new ActionRowBuilder().addComponents(q.options.map((_, i) => btn(`gate:a:${s.sid}:${i}`, 'ABC'[i])));
  return { embeds: [e], components: [row] };
}

// ── Üye tarafı ──
async function handleButton(interaction, client) {
  const parts = interaction.customId.split(':');
  if (parts[1] === 'start') return start(interaction);
  if (parts[1] === 'a') return answer(interaction, parts[2], Number(parts[3]));
}

async function start(interaction) {
  const g = interaction.guild;
  if (!g) return;
  const gid = g.id;
  const eph = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  const cfg = getCfg(gid);
  const role = cfg.roleId ? g.roles.cache.get(cfg.roleId) : null;
  if (!cfg.enabled || !role) return eph(tx(gid, '❌ Kural kapısı şu an kapalı.', '❌ The rules gate is closed right now.'));
  if (interaction.member.roles.cache.has(role.id)) return eph(tx(gid, '✅ Zaten içeridesin.', '✅ You are already in.'));
  const cd = cooldowns.get(`${gid}:${interaction.user.id}`) || 0;
  if (cd > Date.now()) return eph(tx(gid, `⏳ Tekrar denemek için <t:${Math.ceil(cd / 1000)}:R> bekle. O arada kuralları bir daha oku.`, `⏳ You can retry <t:${Math.ceil(cd / 1000)}:R>. Re-read the rules in the meantime.`));

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const qs = await getQuiz(gid);
  if (!qs) return interaction.editReply({ content: tx(gid, '❌ Sınav şu an hazırlanamadı, biraz sonra tekrar dene.', '❌ The quiz could not be prepared, please try again shortly.') }).catch(() => {});
  const sid = crypto.randomBytes(4).toString('hex');
  const s = { sid, gid, uid: interaction.user.id, qs, i: 0, correct: 0, exp: Date.now() + 15 * 60000 };
  sessions.set(sid, s);
  setTimeout(() => sessions.delete(sid), 16 * 60000).unref?.();
  return interaction.editReply({ content: '', ...questionPayload(s, gid) }).catch(() => {});
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "open": (i) => require('../utils/ossStub').unavailable(i),
  "handlePanel": (i) => require('../utils/ossStub').unavailable(i),
  "handleButton": (i) => require('../utils/ossStub').unavailable(i),
  "getCfg": () => ({ enabled: false }),
  "render": () => undefined,
});
