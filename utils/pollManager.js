// Anket v2: kalıcı oylar, çoktan seçmeli, anonim mod, rol şartı, otomatik/elle bitirme, sonuç kartı.
const {
  MessageFlags,
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const store = require('./pollStore');
const { createTranslator } = require('./i18n');

const KEYCAPS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const BAR_LEN = 10;
const timers = new Map();

function bar(pct) {
  const filled = Math.min(BAR_LEN, Math.max(0, Math.round((pct / 100) * BAR_LEN)));
  return '█'.repeat(filled) + '░'.repeat(BAR_LEN - filled);
}

function tally(poll) {
  const counts = new Array(poll.options.length).fill(0);
  const voters = Object.keys(poll.votes);
  for (const uid of voters) {
    for (const idx of poll.votes[uid]) if (idx >= 0 && idx < counts.length) counts[idx]++;
  }
  return { counts, voters: voters.length };
}

function buildPollContainer(poll, t, hostTag, cardName = null) {
  const { counts, voters } = tally(poll);
  const totalChoices = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...counts);

  const lines = poll.options.map((opt, i) => {
    const pct = voters > 0 ? Math.round((counts[i] / voters) * 100) : 0;
    const crown = poll.ended && max > 0 && counts[i] === max ? ' 🏆' : '';
    return `> **${KEYCAPS[i]} ${opt}**${crown}\n> \`${bar(pct)}\` ${t('poll.votes', { count: counts[i] })} (${pct}%)`;
  });

  const tags = [];
  if (poll.anonymous) tags.push(t('poll.anonymous'));
  if (poll.maxChoices > 1) tags.push(t('poll.multi', { max: poll.maxChoices }));
  if (poll.roleId) tags.push(`<@&${poll.roleId}>`);

  const container = new ContainerBuilder().setAccentColor(poll.ended ? 0x64748b : 0x0066ff);
  if (cardName) {
    const { MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${cardName}`).setDescription('Poll results')));
  }
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 📊 ${poll.question}\n${tags.length ? `-# ${tags.join(' · ')}\n` : ''}\n${lines.join('\n\n')}`)
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const ts = Math.floor(poll.endAt / 1000);
  let footer = `-# ${t('poll.total', { count: voters })} · ${poll.ended ? t('poll.ended') : `${t('gw.ends')}: <t:${ts}:R>`}`;
  if (hostTag) footer += ` · ${hostTag}`;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));

  if (poll.ended && max > 0) {
    const winners = poll.options.filter((_, i) => counts[i] === max);
    const key = winners.length > 1 ? 'poll.tie' : 'poll.winner';
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**🏆 ${t(key, { name: winners.join(', ') })}**`));
  }
  void totalChoices;

  if (!poll.ended) {
    const buttons = poll.options.map((opt, i) =>
      new ButtonBuilder().setCustomId(`poll_vote_${i}`).setLabel(String(opt).slice(0, 70)).setEmoji(KEYCAPS[i]).setStyle(ButtonStyle.Primary)
    );
    for (let i = 0; i < buttons.length; i += 5) {
      container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    const control = [new ButtonBuilder().setCustomId('poll_end').setLabel(t('poll.end_button')).setStyle(ButtonStyle.Danger)];
    if (!poll.anonymous) control.push(new ButtonBuilder().setCustomId('poll_voters').setLabel(t('poll.voters_button')).setStyle(ButtonStyle.Secondary));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(control));
  }
  return container;
}

function registerPoll(poll, client) {
  store.set(poll);
  if (client) scheduleEnd(client, poll);
}

function scheduleEnd(client, poll) {
  if (timers.has(poll.id)) clearTimeout(timers.get(poll.id));
  const delay = Math.min(Math.max(0, poll.endAt - Date.now()), 2 ** 31 - 1);
  const timer = setTimeout(() => {
    const fresh = store.get(poll.id);
    if (!fresh || fresh.ended) return;
    if (fresh.endAt - Date.now() > 1000) return scheduleEnd(client, fresh); // 24 günden uzun gecikmelerde yeniden kur
    finalizePoll(client, fresh).catch((e) => console.error('[Poll finalize]', e.message));
  }, delay);
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(poll.id, timer);
}

async function finalizePoll(client, poll) {
  if (poll.ended) return;
  poll.ended = true;
  poll.endedAt = Date.now();
  store.set(poll);
  if (timers.has(poll.id)) clearTimeout(timers.get(poll.id));
  timers.delete(poll.id);

  const t = createTranslator(poll.guildId);
  // Biten ankete sonuç kartı eklenir (çizilemezse yalnızca metinle devam)
  let files = [];
  let cardName = null;
  try {
    const { AttachmentBuilder } = require('discord.js');
    const { pollCard } = require('./canvas/cards');
    const { getGuildLanguage } = require('./i18n');
    const { counts, voters } = tally(poll);
    const png = pollCard({ question: poll.question, options: poll.options.map((label, i) => ({ label, votes: counts[i] })), total: voters, isEn: getGuildLanguage(poll.guildId) === 'en' });
    files = [new AttachmentBuilder(png, { name: 'poll.png' })];
    cardName = 'poll.png';
  } catch (e) { console.error('[poll card]', e.message); }
  const container = buildPollContainer(poll, t, poll.hostTag, cardName);
  try {
    const channel = await client.channels.fetch(poll.channelId);
    const msg = await channel.messages.fetch(poll.id);
    await msg.edit({ components: [container], files, flags: MessageFlags.IsComponentsV2 });
  } catch (e) {
    console.error('[Poll finalize edit]', e.message);
  }
}

function restorePolls(client) {
  store.prune();
  for (const poll of store.active()) {
    if (poll.endAt <= Date.now()) finalizePoll(client, poll).catch(() => {});
    else scheduleEnd(client, poll);
  }
}

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

async function handlePollInteraction(interaction, client) {
  const messageId = interaction.message.id;
  const poll = store.get(messageId);
  const t = createTranslator(interaction.guild ? interaction.guild.id : null);

  if (!poll || poll.ended) {
    return interaction.reply(ephemeral(t('poll.expired')));
  }

  // ── Anketi bitir ──
  if (interaction.customId === 'poll_end') {
    const isHost = interaction.user.id === poll.hostId;
    const isAdmin = interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);
    if (!isHost && !isAdmin) return interaction.reply(ephemeral(t('poll.only_host_end')));
    await interaction.deferUpdate();
    return finalizePoll(client || interaction.client, poll);
  }

  // ── Kimler oy verdi ──
  if (interaction.customId === 'poll_voters') {
    if (poll.anonymous) return interaction.reply(ephemeral(t('poll.anonymous')));
    const by = poll.options.map(() => []);
    for (const [uid, picks] of Object.entries(poll.votes)) for (const i of picks) if (by[i]) by[i].push(`<@${uid}>`);
    const text = poll.options
      .map((opt, i) => `**${KEYCAPS[i]} ${opt}**\n${by[i].length ? by[i].slice(0, 25).join(' ') + (by[i].length > 25 ? ` +${by[i].length - 25}` : '') : '—'}`)
      .join('\n\n');
    return interaction.reply({ content: text.slice(0, 1900), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }

  // ── Oy ver / geri al ──
  const index = parseInt(interaction.customId.replace('poll_vote_', ''), 10);
  if (!(index >= 0 && index < poll.options.length)) return interaction.reply(ephemeral(t('poll.expired')));

  if (poll.roleId && !(interaction.member && interaction.member.roles.cache.has(poll.roleId))) {
    return interaction.reply(ephemeral(t('poll.role_required', { role: `<@&${poll.roleId}>` })));
  }

  const uid = interaction.user.id;
  let picks = poll.votes[uid] || [];
  let message;
  if (picks.includes(index)) {
    picks = picks.filter((i) => i !== index);
    message = t('poll.vote_removed');
  } else if (poll.maxChoices === 1) {
    picks = [index];
    message = t('poll.vote_recorded');
  } else if (picks.length >= poll.maxChoices) {
    return interaction.reply(ephemeral(t('poll.max_choices', { max: poll.maxChoices })));
  } else {
    picks = [...picks, index];
    message = t('poll.vote_recorded');
  }

  if (picks.length) poll.votes[uid] = picks;
  else delete poll.votes[uid];
  store.set(poll);

  try {
    await interaction.update({ components: [buildPollContainer(poll, t, poll.hostTag)], flags: MessageFlags.IsComponentsV2 });
    await interaction.followUp(ephemeral(message)).catch(() => {});
  } catch (err) {
    console.error('[PollManager]', err.message);
  }
}

// Eski içe aktarma adıyla uyumluluk
const handlePollVote = handlePollInteraction;

module.exports = {
  registerPoll,
  handlePollVote,
  handlePollInteraction,
  buildPollContainer,
  finalizePoll,
  restorePolls,
};
