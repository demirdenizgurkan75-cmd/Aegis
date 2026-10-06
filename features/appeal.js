// Aegis open-source build: only the first 60 of 166 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * JÜRİ İTİRAZLARI
 * Ceza alan üye (timeout ya da uyarı) kararı topluluk jürisine taşıyabilir. Jüri kimliği görmeden gizli oy verir,
 * eşitlikte ceza sürer. Dava motoru features/jury.js içinde (kind: 'appeal'); bu dosya üye tarafı:
 *   /appeal paneli (uyarılar ve aktif timeout), özeldeki "İtiraz et" düğmesi, gerekçe modalı.
 * Timeout alan üye slash komutu kullanamaz; bu yüzden timeout itirazı özelden düğmeyle başlar.
 * customId'ler: appeal:t:<gid>:<until> (düğme) • appeal:sel (menü) • appeal:m:<t|w>:<gid>:<ref> (modal)
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { getWarnings } = require('../utils/database');
const jury = require('./jury');
const { fmtDuration } = require('./parole');
const { tx, clip, banner } = require('./util');
const { em } = require('./mascotEmoji');

const txt = (s) => new TextDisplayBuilder().setContent(s);
const isJuryWarning = (w) => /^Jury verdict/i.test(w?.reason || '');

/** Jüri kararıyla verilmiş ve hâlâ süren timeout mu? (Jürinin kendi kararına itiraz edilmez.) */
function isJuryTimeout(gid, uid) {
  const cfg = jury.getCfg(gid);
  return Object.values(cfg.cases).some(c => c.resolved && c.kind !== 'appeal' && c.authorId === uid
    && (c.applied || []).includes('timeout') && (c.resolvedAt || 0) + cfg.timeoutMin * 60000 > Date.now());
}

function appealable(gid, uid) {
  const cfg = jury.getCfg(gid);
  const log = cfg.appealLog[uid] || { refs: [] };
  return getWarnings(gid, uid).filter(w => !isJuryWarning(w) && !log.refs.includes(`w:${w.id}`)).slice(-10).reverse();
}

function pendingFor(gid, uid) {
  return Object.values(jury.getCfg(gid).cases).find(c => c.kind === 'appeal' && !c.resolved && c.appellantId === uid) || null;
}

/** Timeout DM'ine eklenecek itiraz teklifi: { text, button } | null */
function offer(member, until) {
  const gid = member.guild.id;
  const cfg = jury.getCfg(gid);
  if (!cfg.enabled || !cfg.appeals || !cfg.channelId || !cfg.roleId) return null;
  if (isJuryTimeout(gid, member.id)) return null;
  return {
    text: tx(gid,
      '⚖️ **İtiraz:** Cezayı haksız buluyorsan topluluk jürisine itiraz edebilirsin. Jüri seni görmeden gizli oyla karar verir; eşitlikte ceza sürer. Günde 1 itiraz hakkın var.',
      '⚖️ **Appeal:** if you think this is unfair you can appeal to the community jury. Jurors vote in secret without seeing who you are; a tie keeps the penalty. You get 1 appeal per day.'),
    button: new ButtonBuilder().setCustomId(`appeal:t:${gid}:${until}`)
      .setLabel(tx(gid, 'İtiraz et', 'Appeal')).setStyle(ButtonStyle.Secondary),
  };
}

function reasonModal(gid, kind, ref) {
  return new ModalBuilder().setCustomId(`appeal:m:${kind}:${gid}:${ref}`)
    .setTitle(tx(gid, 'Jüriye itiraz', 'Appeal to the jury'))
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason')
      .setLabel(tx(gid, 'Neden haksız? (jüri okuyacak)', 'Why is it unfair? (the jury will read it)'))
      .setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(10).setMaxLength(600)));
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "open": (i) => require('../utils/ossStub').unavailable(i),
  "handle": (i) => require('../utils/ossStub').unavailable(i),
  "offer": () => null,
  "isJuryTimeout": () => undefined,
  "render": () => undefined,
});
