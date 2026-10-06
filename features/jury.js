// Aegis open-source build: only the first 90 of 346 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * JÜRİ MODERASYONU
 * Şüpheli bir mesaj, sunucunun "jüri havuzundan" rastgele seçilen üyelere anonim olarak gösterilir.
 * Çoğunluk oyu karar verir: temiz / ihlal / ağır ihlal. Yazarın kimliği jüriden saklanır.
 * Jüri üyelerinin isabet oranı tutulur, çoğunlukla aynı oyu verenler isabetli sayılır.
 *
 * Veri: guild.jury = { enabled, channelId, roleId, size, minutes, action, timeoutMin, nextCase, cases, jurors }
 */
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { getGuild, updateGuild, readDB, addWarning, removeWarning } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { tx, shuffle, clip } = require('./util');
const { em } = require('./mascotEmoji');

const MAX_CASES_PER_HOUR = 3;

function getCfg(guildId) {
  const g = getGuild(guildId);
  const c = g.jury || {};
  return {
    enabled: !!c.enabled, channelId: c.channelId || null, roleId: c.roleId || null,
    size: c.size || 5, minutes: c.minutes || 10, action: c.action || 'delete', timeoutMin: c.timeoutMin || 10,
    nextCase: c.nextCase || 1, cases: c.cases || {}, jurors: c.jurors || {},
    appeals: !!c.appeals, appealLog: c.appealLog || {},
  };
}
function saveCfg(guildId, cfg) { return updateGuild(guildId, { jury: cfg }); }

function votesSummary(c) {
  const v = Object.values(c.votes || {});
  return { ok: v.filter(x => x === 'ok').length, bad: v.filter(x => x === 'bad').length, severe: v.filter(x => x === 'severe').length, total: v.length };
}

function caseButtons(guildId, id, disabled = false, severeOn = true, caseKind = 'message') {
  const mk = (kind, label, style) => new ButtonBuilder().setCustomId(`jury:v:${id}:${kind}`).setLabel(label).setStyle(style).setDisabled(disabled);
  if (caseKind === 'appeal') {
    return new ActionRowBuilder().addComponents(
      mk('ok', tx(guildId, 'Cezayı kaldır', 'Lift it'), ButtonStyle.Success),
      mk('bad', tx(guildId, 'Cezayı sürdür', 'Uphold it'), ButtonStyle.Primary));
  }
  const row = new ActionRowBuilder().addComponents(
    mk('ok', tx(guildId, 'Temiz', 'Fine'), ButtonStyle.Success),
    mk('bad', tx(guildId, 'İhlal', 'Violation'), ButtonStyle.Primary),
  );
  if (severeOn) row.addComponents(mk('severe', tx(guildId, 'Ağır ihlal', 'Severe'), ButtonStyle.Danger));
  return row;
}

function caseEmbed(guildId, c, cfg, extra = {}) {
  const s = votesSummary(c);
  if (c.kind === 'appeal') {
    const ae = new EmbedBuilder().setColor(extra.color || 0x0066ff)
      .setTitle(tx(guildId, `Jüri İtirazı #${c.id}`, `Jury Appeal #${c.id}`))
      .setDescription(
        `${tx(guildId, '**İtiraz edilen:**', '**Appealing:**')} ${c.subject.label}\n\n${tx(guildId, '**Üyenin gerekçesi** (kimlik gizli):', '**Member\'s reason** (identity hidden):')}\n>>> ${clip(c.text || '—', 1500) || '—'}`)
      .addFields(
        { name: tx(guildId, 'Jüri', 'Jury'), value: `${c.jurors.length}`, inline: true },
        { name: tx(guildId, 'Oy', 'Votes'), value: `${s.total}/${c.jurors.length}`, inline: true })
      .setFooter({ text: tx(guildId, 'Oylar gizlidir. Eşitlikte ceza sürer.', 'Votes are secret. A tie keeps the penalty.') });
    if (!extra.verdict) ae.addFields({ name: tx(guildId, 'Bitiş', 'Ends'), value: `<t:${Math.floor(c.endsAt / 1000)}:R>`, inline: true });
    if (extra.verdict) ae.addFields({ name: tx(guildId, 'Karar', 'Verdict'), value: extra.verdict, inline: false });
    return ae;
  }
  const e = new EmbedBuilder()
    .setColor(extra.color || 0x0066ff)
    .setTitle(tx(guildId, `Jüri Davası #${c.id}`, `Jury Case #${c.id}`))
    .setDescription(
      `${tx(guildId, '**Mesaj** (yazar gizli):', '**Message** (author hidden):')}\n>>> ${clip(c.text || '—', 1500) || '—'}` +
      (c.attachments ? `\n\n📎 ${c.attachments} ${tx(guildId, 'ek dosya', 'attachment(s)')}` : '')
    )
    .addFields(
      { name: tx(guildId, 'Kanal', 'Channel'), value: `<#${c.channelId}>`, inline: true },
      { name: tx(guildId, 'Jüri', 'Jury'), value: `${c.jurors.length}`, inline: true },
      { name: tx(guildId, 'Oy', 'Votes'), value: `${s.total}/${c.jurors.length}`, inline: true },
    )
    .setFooter({ text: tx(guildId, 'Oylar gizlidir. Karar çoğunluğa göre verilir.', 'Votes are secret. The majority decides.') });
  if (!extra.verdict) e.addFields({ name: tx(guildId, 'Bitiş', 'Ends'), value: `<t:${Math.floor(c.endsAt / 1000)}:R>`, inline: false });
  if (extra.verdict) e.addFields({ name: tx(guildId, 'Karar', 'Verdict'), value: extra.verdict, inline: false });
  return e;
}

async function loadPool(guild, cfg) {
  const role = guild.roles.cache.get(cfg.roleId);
  if (!role) return [];
  if (guild.memberCount < 3000) { try { await guild.members.fetch(); } catch (_) {} }
  return [...role.members.values()].filter(m => !m.user.bot);
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "getCfg": () => ({ enabled: false }),
  "saveCfg": () => undefined,
  "createCase": async () => ({ err: 'off' }),
  "createAppeal": async () => ({ err: 'off' }),
  "handleVote": (i) => require('../utils/ossStub').unavailable(i),
  "sweep": () => undefined,
  "leaderboard": () => [],
  "resolveCase": () => undefined,
});
