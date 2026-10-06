// Çekiliş v2: kalıcı kayıt, şartlar (rol / üyelik süresi), booster bonusu, adil ağırlıklı çekim,
// yeniden seçim, erken bitirme, iptal, liste, 30 dil.
const crypto = require('crypto');
const {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { banner } = require('../features/util');
const { getGiveaway, saveGiveaway, updateGiveaway, listActiveGiveaways } = require('../utils/database');
const { readDB } = require('../utils/database');
const { parseDuration } = require('../utils/duration');
const { createTranslator, getGuildLanguage } = require('../utils/i18n');
const { safeClosePanel } = require('../utils/panelHelper');

const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TIMER = 2 ** 31 - 1;
const timers = new Map();

const v2 = (text, { color = 0x0066ff, rows = [], ephemeral = true } = {}) => {
  const container = new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  for (const r of rows) container.addActionRowComponents(r);
  return { components: [container], flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0), allowedMentions: { parse: [] } };
};
const eph = (text, opts = {}) => v2(text, { color: String(text).startsWith('❌') ? 0xef4444 : 0x0066ff, ...opts });
const jump = (gw) => `https://discord.com/channels/${gw.guildId}/${gw.channelId}/${gw.messageId}`;
const linkBtn = (gw, label) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(jump(gw));
const num = (n) => Number(n).toLocaleString('en-US');

function clearTimer(guildId, id) {
  const key = `${guildId}:${id}`;
  if (timers.has(key)) {
    clearTimeout(timers.get(key));
    timers.delete(key);
  }
}

function scheduleFinalize(client, guildId, id, delayMs) {
  clearTimer(guildId, id);
  const t = setTimeout(async () => {
    const gw = getGiveaway(guildId, id);
    if (!gw || gw.ended) return;
    if (gw.endAt - Date.now() > 1000) return scheduleFinalize(client, guildId, id, gw.endAt - Date.now());
    try {
      await finalizeGiveaway(client, guildId, gw);
    } catch (err) {
      console.error('Giveaway finalize error:', err.message);
    }
  }, Math.min(Math.max(0, delayMs), MAX_TIMER));
  if (typeof t.unref === 'function') t.unref();
  timers.set(`${guildId}:${id}`, t);
}

function prizeText(gw) {
  return gw.prizeText;
}

function requirementLines(gw, t) {
  const out = [];
  if (gw.requirements?.roleId) out.push(t('gw.req_role', { role: `<@&${gw.requirements.roleId}>` }));
  if (gw.requirements?.minDays) out.push(t('gw.req_days', { days: gw.requirements.minDays }));
  if (gw.requirements?.boosterBonus > 1) out.push(t('gw.bonus_boost', { n: gw.requirements.boosterBonus }));
  return out;
}

function buildGiveawayContainer(gw, hostMention, t) {
  const ts = Math.floor(gw.endAt / 1000);
  const reqs = requirementLines(gw, t);
  const container = new ContainerBuilder().setAccentColor(0x0066ff);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# 🎉 ${t('gw.title')}\n` +
      `🏆 **${t('gw.prize')}:** ${prizeText(gw)}\n` +
      `👑 **${t('gw.hosted_by')}:** ${hostMention}\n` +
      `👥 **${t('gw.winners')}:** ${gw.winnersCount}\n` +
      `⏳ **${t('gw.ends')}:** <t:${ts}:R> (<t:${ts}:F>)\n` +
      `🎟️ **${t('gw.entries')}:** ${gw.entries.length}` +
      (reqs.length ? `\n\n${reqs.map((r) => `> ${r}`).join('\n')}` : '')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw_join:${gw.id}`).setLabel(`🎉 ${t('gw.join')}`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`gw_info:${gw.id}`).setLabel(`ℹ️ ${t('gw.info')}`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`gw_admin_close:${gw.id}:${gw.hostId}`).setLabel(`✕ ${t('gw.cancel')}`).setStyle(ButtonStyle.Danger)
  ));
  require('../utils/tier').addBrand(container, gw.guildId);
  return container;
}

function buildEndedContainer(gw, t, winners, cancelled = false) {
  const container = new ContainerBuilder().setAccentColor(cancelled ? 0x64748b : winners.length ? 0x16a34a : 0xef4444);
  const body = cancelled
    ? `# 🏁 ${t('gw.ended')}\n🏆 **${t('gw.prize')}:** ${prizeText(gw)}`
    : winners.length
      ? `# 🏁 ${t('gw.ended')}\n🏆 **${t('gw.prize')}:** ${prizeText(gw)}\n🎉 **${t('gw.winners')}:** ${winners.map((w) => `<@${w}>`).join(', ')}\n🎟️ **${t('gw.entries')}:** ${gw.entries.length}`
      : `# 🏁 ${t('gw.ended')}\n🏆 **${t('gw.prize')}:** ${prizeText(gw)}\n❌ ${t('gw.no_entries')}`;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  require('../utils/tier').addBrand(container, gw.guildId);
  return container;
}

/** Üyelik/rol şartlarını kontrol eder. null = uygun, aksi halde sebep. */
function checkEligibility(member, gw) {
  if (!member || member.user.bot) return 'bot';
  const r = gw.requirements || {};
  if (r.roleId && !member.roles.cache.has(r.roleId)) return 'role';
  if (r.minDays && member.joinedTimestamp && Date.now() - member.joinedTimestamp < r.minDays * 86400000) return 'days';
  return null;
}

/** Ağırlıklı, yerine koymasız ve kriptografik rastgele seçim (sort(random) yanlılığı yok). */
function weightedPick(pool, count) {
  const items = pool.map((p) => ({ ...p }));
  const winners = [];
  while (winners.length < count && items.length) {
    const total = items.reduce((a, b) => a + b.weight, 0);
    let roll = crypto.randomInt(0, total);
    const idx = items.findIndex((it) => (roll -= it.weight) < 0);
    winners.push(items.splice(idx === -1 ? 0 : idx, 1)[0].userId);
  }
  return winners;
}

async function eligiblePool(guild, gw, exclude = []) {
  const ids = [...new Set(gw.entries.map((e) => e.userId))].filter((id) => !exclude.includes(id));
  const members = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const fetched = await guild.members.fetch({ user: chunk }).catch(() => null);
    if (fetched) for (const [id, m] of fetched) members.set(id, m);
  }
  const bonus = gw.requirements?.boosterBonus || 1;
  const pool = [];
  for (const id of ids) {
    const m = members.get(id);
    if (checkEligibility(m, gw)) continue;
    pool.push({ userId: id, weight: m.premiumSince ? bonus : 1 });
  }
  return pool;
}

async function announce(client, gw, winnerIds, t, rerolled = false) {
  const channel = await client.channels.fetch(gw.channelId).catch(() => null);
  if (!channel) return;
  const users = winnerIds.map((w) => `<@${w}>`).join(', ');
  const text = winnerIds.length
    ? (rerolled ? t('gw.reroll_done', { users }) : t('gw.congrats', { users, prize: prizeText(gw) }))
    : t('gw.no_entries');
  const container = new ContainerBuilder().setAccentColor(winnerIds.length ? 0x16a34a : 0xef4444);
  const files = [];
  // Kazanan kartı: ödül, kazananın avatarı ve maskot (kart çizilemezse düz metinle devam edilir)
  if (winnerIds.length) {
    try {
      const { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
      const { winnerCard } = require('../utils/canvas/cards');
      const users = (await Promise.all(winnerIds.slice(0, 3).map((id) => client.users.fetch(id).catch(() => null)))).filter(Boolean);
      const clean = (x) => String(x).replace(/<[^>]+>/g, '').replace(/[*_`~]/g, '').trim() || '—';
      const png = await winnerCard({
        prize: clean(prizeText(gw)),
        winners: users.map((u) => ({ name: u.displayName || u.username, avatarUrl: u.displayAvatarURL({ extension: 'png', size: 256 }) })),
        entries: gw.entries?.length || 0,
        isEn: getGuildLanguage(gw.guildId) === 'en',
      });
      files.push(new AttachmentBuilder(png, { name: 'winner.png' }));
      container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://winner.png').setDescription('Giveaway winner')));
    } catch (e) { console.error('[giveaway card]', e.message); }
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  if (gw.messageId) container.addActionRowComponents(new ActionRowBuilder().addComponents(linkBtn(gw, t('gw.open'))));
  await channel.send({ components: [container], files, flags: MessageFlags.IsComponentsV2, allowedMentions: { users: winnerIds } })
    .catch((e) => console.error('Giveaway announce error:', e.message));
}

async function editGiveawayMessage(client, gw, container) {
  try {
    const channel = await client.channels.fetch(gw.channelId);
    const msg = await channel.messages.fetch(gw.messageId);
    await msg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (e) {
    console.error('Giveaway message edit error:', e.message);
  }
}

async function finalizeGiveaway(client, guildId, gw) {
  if (gw.ended) return;
  gw.ended = true;
  gw.status = 'bitti';
  gw.endedAt = Date.now();
  clearTimer(guildId, gw.id);

  const guild = client.guilds.cache.get(guildId);
  const t = createTranslator(guildId);
  let winners = [];
  if (guild) {
    const pool = await eligiblePool(guild, gw);
    winners = weightedPick(pool, gw.winnersCount);
  }
  gw.winners = winners;
  updateGiveaway(guildId, gw.id, gw);

  await editGiveawayMessage(client, gw, buildEndedContainer(gw, t, winners));
  await announce(client, gw, winners, t);

  // Kazananlara DM (best effort)
  if (guild) {
    for (const uid of winners) {
      const member = guild.members.cache.get(uid);
      member?.send(`${t('gw.congrats', { users: `<@${uid}>`, prize: prizeText(gw) }).replace(/<@\d+>/g, member.user.username)}\n${guild.name}`).catch(() => {});
    }
  }
}

async function cancelGiveaway(client, guildId, gw) {
  if (gw.ended) return false;
  const t = createTranslator(guildId);
  gw.ended = true;
  gw.status = 'iptal';
  gw.endedAt = Date.now();
  updateGiveaway(guildId, gw.id, gw);
  clearTimer(guildId, gw.id);
  await editGiveawayMessage(client, gw, buildEndedContainer(gw, t, [], true));
  return true;
}

async function rerollGiveaway(client, guild, gw, count = 1) {
  const t = createTranslator(guild.id);
  const pool = await eligiblePool(guild, gw, gw.winners || []);
  const fresh = weightedPick(pool, count);
  if (!fresh.length) return [];
  gw.winners = [...(gw.winners || []), ...fresh];
  updateGiveaway(guild.id, gw.id, gw);
  await announce(client, gw, fresh, t, true);
  return fresh;
}


const bi = (guildId, tr, en) => (getGuildLanguage(guildId) === 'tr' ? tr : en);
const drafts = new Map(); // `${guildId}:${userId}` → { channelId, roleId }
const draftKey = (i) => `${i.guildId}:${i.user.id}`;
const isStaff = (i) => !!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
const panelPayload = (guildId, t, note, view, draft) => {
  const { components, allowedMentions } = buildPanel(guildId, t, note, view, draft);
  return { components, allowedMentions };
};

/** "Yeni çekiliş" görünümü: kanal ve (isteğe bağlı) rol seçimi, sonra bilgi penceresi. */
function buildNewView(guildId, draft, note) {
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  if (note) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(note));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `# 🎉 ${bi(guildId, 'Yeni çekiliş', 'New giveaway')}\n` +
    bi(guildId, 'Çekilişin yapılacağı kanalı seç (varsayılan: bu kanal). İstersen katılmak için gerekli rolü de seç. Sonra **Devam**\'a bas.',
      'Pick the channel for the giveaway (default: this channel). Optionally pick a role required to join. Then press **Continue**.')));
  const ch = new ChannelSelectMenuBuilder().setCustomId('gw_chan').setPlaceholder(bi(guildId, 'Kanal seç…', 'Pick a channel…'))
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (draft.channelId) ch.setDefaultChannels([draft.channelId]);
  const role = new RoleSelectMenuBuilder().setCustomId('gw_role').setPlaceholder(bi(guildId, 'Gerekli rol (isteğe bağlı)…', 'Required role (optional)…')).setMinValues(0).setMaxValues(1);
  if (draft.roleId) role.setDefaultRoles([draft.roleId]);
  c.addActionRowComponents(new ActionRowBuilder().addComponents(ch));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(role));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gw_continue').setLabel(bi(guildId, 'Devam', 'Continue')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('gw_back').setLabel(bi(guildId, 'Geri', 'Back')).setStyle(ButtonStyle.Secondary)
  ));
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
}

function giveawayModal(guildId) {
  const row = (id, label, placeholder, required, max = 100) => new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setStyle(TextInputStyle.Short).setRequired(required).setMaxLength(max));
  return new ModalBuilder().setCustomId('gw_modal').setTitle(bi(guildId, 'Çekiliş bilgileri', 'Giveaway details')).addComponents(
    row('prize', bi(guildId, 'Ödül', 'Prize'), bi(guildId, 'Örn: Nitro', 'e.g. Nitro'), true, 200),
    row('duration', bi(guildId, 'Süre', 'Duration'), '30m, 12h, 1d, 1w', true, 10),
    row('winners', bi(guildId, 'Kazanan sayısı (1-20)', 'Number of winners (1-20)'), '1', false, 2),
    row('mindays', bi(guildId, 'Sunucuda en az kaç gün (isteğe bağlı)', 'Minimum days in server (optional)'), '0', false, 4),
    row('booster', bi(guildId, 'Booster hak çarpanı 2-10 (isteğe bağlı)', 'Booster entry multiplier 2-10 (optional)'), '1', false, 2));
}

/** Çekilişi oluşturur ve kanala gönderir. Dönüş: { gw } ya da { error }. */
async function createGiveaway(client, guild, hostUser, channel, p) {
  const t = createTranslator(guild.id);
  const raw = String(p.prize || '').trim();
  const prize = raw;
  if (!prize) return { error: bi(guild.id, 'Bir ödül yaz.', 'Enter a prize.') };
  const durationMs = parseDuration(p.duration);
  if (!durationMs || durationMs > MAX_DURATION_MS) return { error: t('anket.invalid_duration') };
  const clamp = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const winnersCount = clamp(p.winners, 1, 20, 1);
  const minDays = clamp(p.minDays, 0, 3650, 0);
  const boosterBonus = clamp(p.booster, 1, 10, 1);

  const gw = {
    id: Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
    guildId: guild.id, channelId: channel.id, hostId: hostUser.id,
    prizeText: prize,
    winnersCount, requirements: { roleId: p.roleId || null, minDays, boosterBonus: boosterBonus >= 2 ? boosterBonus : 1 },
    entries: [], winners: [], ended: false, status: 'aktif',
    endAt: Date.now() + durationMs, createdAt: Date.now(),
  };
  try {
    const msg = await channel.send({ components: [buildGiveawayContainer(gw, `<@${gw.hostId}>`, t)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    gw.messageId = msg.id;
  } catch (e) {
    return { error: bi(guild.id, 'O kanala mesaj gönderemiyorum.', 'I cannot send messages in that channel.') + ` (${e.message})` };
  }
  saveGiveaway(guild.id, gw);
  scheduleFinalize(client, guild.id, gw.id, durationMs);
  return { gw };
}

async function handlePanelComponent(interaction, client) {
  const guild = interaction.guild;
  if (!guild) return;
  const t = createTranslator(guild.id);
  if (!isStaff(interaction)) return interaction.reply(eph('❌ Manage Server permission required. / Sunucuyu Yönet yetkisi gerekli.')).catch(() => {});
  const key = draftKey(interaction);
  const draft = drafts.get(key) || { channelId: interaction.channelId, roleId: null };
  drafts.set(key, draft);

  if (interaction.customId === 'gw_chan') { draft.channelId = interaction.values[0]; return interaction.update(panelPayload(guild.id, t, '', 'new', draft)); }
  if (interaction.customId === 'gw_role') { draft.roleId = interaction.values[0] || null; return interaction.update(panelPayload(guild.id, t, '', 'new', draft)); }

  if (interaction.customId === 'gw_modal') {
    const channel = guild.channels.cache.get(draft.channelId) || await guild.channels.fetch(draft.channelId).catch(() => null) || interaction.channel;
    const f = (k) => interaction.fields.getTextInputValue(k);
    const res = await createGiveaway(client, guild, interaction.user, channel, { prize: f('prize'), duration: f('duration'), winners: f('winners'), minDays: f('mindays'), booster: f('booster'), roleId: draft.roleId });
    if (res.error) return interaction.update(panelPayload(guild.id, t, `❌ ${res.error}`, 'new', draft));
    drafts.delete(key);
    return interaction.update(panelPayload(guild.id, t, `✅ **${t('gw.started')}** ${channel} · [${t('gw.open')}](${jump(res.gw)})`));
  }
}

/** Yönetim paneli (Components V2): aktif çekilişler için Bitir/İptal, biten çekilişler için Yeniden seç. */
function buildPanel(guildId, t, note, view = 'home', draft = null) {
  if (view === 'new') return buildNewView(guildId, draft || {}, note);
  const all = guildGiveaways(guildId).sort((a, b) => b.createdAt - a.createdAt);
  const active = all.filter((g) => !g.ended).slice(0, 3);
  const recent = all.filter((g) => g.ended && g.status === 'bitti').slice(0, 2);
  const container = new ContainerBuilder().setAccentColor(0x0066ff);
  container.addMediaGalleryComponents(banner('giveaway', 'Giveaways'));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# 🎉 ${t('gw.panel_title')}\n-# ${t('gw.active')}: ${all.filter((g) => !g.ended).length} · ${t('gw.recent')}: ${recent.length}${note ? `\n${note}` : ''}`)
  );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gw_new').setLabel(bi(guildId, 'Yeni çekiliş', 'New giveaway')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('gw_refresh').setLabel(bi(guildId, 'Yenile', 'Refresh')).setStyle(ButtonStyle.Secondary)
  ));
  if (!active.length && !recent.length) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('gw.empty')));
    return { components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
  }
  for (const g of active) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${prizeText(g)}**\n${t('gw.ends')}: <t:${Math.floor(g.endAt / 1000)}:R> · ${t('gw.entries')}: ${g.entries.length} · ${t('gw.winners')}: ${g.winnersCount}`));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gw_end:${g.id}`).setLabel(t('gw.end_now')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`gw_cancel:${g.id}`).setLabel(t('gw.cancel')).setStyle(ButtonStyle.Danger),
      ...(g.messageId ? [linkBtn(g, t('gw.open'))] : [])
    ));
  }
  for (const g of recent) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${prizeText(g)}** · ${t('gw.ended')}\n${t('gw.winners')}: ${(g.winners || []).map((w) => `<@${w}>`).join(', ') || '—'}`));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gw_reroll:${g.id}`).setLabel(`🔁 ${t('gw.reroll')}`).setStyle(ButtonStyle.Primary),
      ...(g.messageId ? [linkBtn(g, t('gw.open'))] : [])
    ));
  }
  return { components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
}

function buildGwCommand(name) {
  // Tek komut: /giveaway → yönetim paneli (yeni çekiliş, aktifler, bitir/iptal, yeniden seç)
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription('Çekiliş paneli: başlat, bitir, yeniden seç / Giveaway panel: start, end, reroll')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false);
}

function guildGiveaways(guildId) {
  const db = readDB();
  return Object.values((db[guildId] && db[guildId].giveaways) || {}).filter((g) => g && g.id);
}

module.exports = {
  data: buildGwCommand('giveaway'),

  async execute(interaction) {
    if (!interaction.guild) return interaction.reply(eph('❌ This command must be used in a server.'));
    const t = createTranslator(interaction.guild.id);
    return interaction.reply(buildPanel(interaction.guild.id, t));
  },

  /** Panel seçim menüleri ve modalı (gw_chan, gw_role, gw_modal): features/index.js yönlendirir. */
  async handlePanelComponent(interaction, client) {
    return handlePanelComponent(interaction, client);
  },

  // Restart sonrası zamanlayıcıları geri kur (status 'aktif' alanı artık yazılıyor)
  restoreGiveaways(client) {
    for (const gw of listActiveGiveaways()) {
      if (gw.ended) continue;
      const remaining = gw.endAt - Date.now();
      scheduleFinalize(client, gw.guildId, gw.id, Math.max(0, remaining));
    }
  },

  async handleButton(interaction, client) {
    const [action, gwId, ...rest] = interaction.customId.split(':');
    const guild = interaction.guild;
    if (!guild) return;
    const t = createTranslator(guild.id);

    if (action === 'gw_close') return safeClosePanel(interaction, '✓');

    // ── Panel düğmeleri: Yeni çekiliş / Devam / Geri / Yenile ──
    if (action === 'gw_new' || action === 'gw_refresh' || action === 'gw_back' || action === 'gw_continue') {
      if (!isStaff(interaction)) return interaction.reply(eph('❌ Manage Server permission required. / Sunucuyu Yönet yetkisi gerekli.'));
      const key = draftKey(interaction);
      if (action === 'gw_new') {
        const draft = { channelId: interaction.channelId, roleId: null };
        drafts.set(key, draft);
        return interaction.update(panelPayload(guild.id, t, '', 'new', draft));
      }
      if (action === 'gw_continue') return interaction.showModal(giveawayModal(guild.id));
      drafts.delete(key);
      return interaction.update(panelPayload(guild.id, t));
    }

    // ── Yönetim paneli düğmeleri (Bitir / İptal / Yeniden seç) ──
    if (action === 'gw_end' || action === 'gw_cancel' || action === 'gw_reroll') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(eph('❌ Manage Server permission required. / Sunucuyu Yönet yetkisi gerekli.'));
      }
      const target = getGiveaway(guild.id, gwId);
      if (!target) return interaction.reply(eph('❌ Çekiliş bulunamadı / Giveaway not found.'));
      await interaction.deferUpdate();
      let note = `✅ ${t('gw.done')}`;
      if (action === 'gw_end') {
        if (target.ended) note = `❌ ${t('gw.already_ended')}`;
        else await finalizeGiveaway(client, guild.id, target);
      } else if (action === 'gw_cancel') {
        if (!(await cancelGiveaway(client, guild.id, target))) note = `❌ ${t('gw.already_ended')}`;
      } else {
        const fresh = await rerollGiveaway(client, guild, target, 1);
        note = fresh.length ? `✅ ${t('gw.reroll_done', { users: fresh.map((w) => `<@${w}>`).join(', ') })}` : `❌ ${t('gw.no_entries')}`;
      }
      const { components, allowedMentions } = buildPanel(guild.id, t, note);
      return interaction.editReply({ components, flags: MessageFlags.IsComponentsV2, allowedMentions });
    }

    const gw = getGiveaway(guild.id, gwId);
    if (!gw) return interaction.reply(eph('❌ Çekiliş bulunamadı / Giveaway not found.'));

    if (action === 'gw_join') {
      if (gw.ended) return interaction.reply(eph(t('gw.already_ended')));
      const uid = interaction.user.id;
      const joined = gw.entries.some((e) => e.userId === uid);
      if (joined) {
        gw.entries = gw.entries.filter((e) => e.userId !== uid);
        updateGiveaway(guild.id, gwId, gw);
        await interaction.update({ components: [buildGiveawayContainer(gw, `<@${gw.hostId}>`, t)], flags: MessageFlags.IsComponentsV2 });
        return interaction.followUp(eph(t('gw.left'))).catch(() => {});
      }
      if (checkEligibility(interaction.member, gw)) return interaction.reply(eph(t('gw.not_eligible')));
      gw.entries.push({ userId: uid, at: Date.now() });
      updateGiveaway(guild.id, gwId, gw);
      await interaction.update({ components: [buildGiveawayContainer(gw, `<@${gw.hostId}>`, t)], flags: MessageFlags.IsComponentsV2 });
      return interaction.followUp(eph(t('gw.joined'))).catch(() => {});
    }

    if (action === 'gw_info') {
      const reqs = requirementLines(gw, t);
      const container = new ContainerBuilder().setAccentColor(0x0066ff).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ℹ️ ${t('gw.info')}\n` +
          `**${t('gw.prize')}:** ${prizeText(gw)}\n**${t('gw.winners')}:** ${gw.winnersCount}\n**${t('gw.entries')}:** ${gw.entries.length}\n` +
          `**${t('gw.hosted_by')}:** <@${gw.hostId}>\n**${t('gw.ends')}:** <t:${Math.floor(gw.endAt / 1000)}:R>` +
          (reqs.length ? `\n\n${reqs.join('\n')}` : '')
        )
      );
      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (action === 'gw_admin_close') {
      const hostId = rest[0];
      const allowed = interaction.user.id === hostId || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      if (!allowed) return interaction.reply(eph('❌ Only the host or administrators. / Sadece çekiliş sahibi veya yöneticiler.'));
      if (gw.ended) return interaction.reply(eph(t('gw.already_ended')));
      // İptal: kazanan çekmeden kapat
      await interaction.deferUpdate();
      await cancelGiveaway(client, guild.id, gw);
      return;
    }
  },
};
