/**
 * ÖNERİ PANOSU
 * /suggest tek komut, tek panel: üye "Öneri yaz" ile fikrini yazar; öneri seçilen kanala kart + oy düğmeleriyle düşer.
 * Oylar düğmeyle verilir (aynı düğmeye tekrar basınca geri alınır, karşı düğmeye basınca değişir); kart her oyda yeniden çizilir.
 * Yetkili (Mesajları Yönet) "Yönet" ile onaylar, reddeder, "yapıldı" der ya da siler; not modalla sorulur, öneri sahibine özelden gider.
 * Ayarlar (Sunucuyu Yönet) aynı panelin altındadır: kanal, aç/kapat, tartışma başlığı, kanala öneri kutusu koy.
 * Veri: guild.suggest = { enabled, channelId, threads, counter, items: [{ id, userId, authorName, avatarUrl, text, status,
 *        up: [userId], down: [userId], channelId, messageId, at, staffId, reason, decidedAt }] } (en çok 500 öneri)
 * customId'ler "suggest:" ile başlar. Panel kişiye özeldir (üyenin kendi önerilerini listeler), bu yüzden gizli kalır.
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder,
  ChannelType, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { getGuild, updateGuild } = require('../utils/database');
const { getGuildLanguage } = require('../utils/i18n');
const { suggestionCard } = require('../utils/canvas/cards');
const { tx, clip, banner } = require('./util');

const MAX_ITEMS = 500;
const POST_COOLDOWN_MS = 60 * 1000;
const VOTE_COOLDOWN_MS = 1500;
const DECISIONS = ['approved', 'denied', 'implemented'];

const STATUS = {
  open: { color: 0x0066ff, emoji: ':aegis_wait:', tr: 'Oylamada', en: 'Open' },
  approved: { color: 0x3ba55c, emoji: ':aegis_ok:', tr: 'Onaylandı', en: 'Approved' },
  denied: { color: 0xed4245, emoji: ':aegis_no:', tr: 'Reddedildi', en: 'Denied' },
  implemented: { color: 0x7c3aed, emoji: ':aegis_star:', tr: 'Yapıldı', en: 'Implemented' },
};

const has = (m, ...perms) => perms.some((p) => m?.permissions?.has(p));
const isStaff = (m) => has(m, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator);
const isAdmin = (m) => has(m, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator);
const txt = (s) => new TextDisplayBuilder().setContent(s);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const label = (gid, status) => tx(gid, (STATUS[status] || STATUS.open).tr, (STATUS[status] || STATUS.open).en);
const link = (gid, it) => `https://discord.com/channels/${gid}/${it.channelId}/${it.messageId}`;
const deny = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});

function getCfg(guildId) {
  const s = getGuild(guildId).suggest || {};
  return { enabled: !!s.enabled, channelId: s.channelId || null, threads: !!s.threads, counter: s.counter || 0, items: Array.isArray(s.items) ? s.items : [] };
}
function saveCfg(guildId, cfg) {
  if (cfg.items.length > MAX_ITEMS) cfg.items = cfg.items.slice(-MAX_ITEMS);
  return updateGuild(guildId, { suggest: cfg });
}

/** Aegis o kanala kart gönderebilir mi? */
function canPost(channel, me) {
  if (!channel?.isTextBased?.() || !me) return false;
  return !!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]);
}

/** Öneri yazılamıyorsa nedenini döndürür, yazılabiliyorsa null. */
function readyIssue(guild, cfg) {
  const gid = guild.id;
  if (!cfg.enabled) return tx(gid, 'Öneriler şu an kapalı.', 'Suggestions are turned off right now.');
  const ch = cfg.channelId && guild.channels.cache.get(cfg.channelId);
  if (!ch) return tx(gid, 'Yetkililer henüz öneri kanalı seçmedi.', 'Staff have not picked a suggestions channel yet.');
  if (!canPost(ch, guild.members.me)) return tx(gid, `Aegis <#${ch.id}> kanalına yazamıyor (Mesaj Gönder ve Dosya Ekle yetkisi gerekli).`, `Aegis cannot post in <#${ch.id}> (needs Send Messages and Attach Files).`);
  return null;
}

// Aynı önerinin kartı sırayla çizilir; arkada daha yeni bir istek varsa eskisi atlanır (yalnızca son durum çizilir).
const chains = new Map();
const versions = new Map();
function refresh(guild, id, edit) {
  const key = `${guild.id}:${id}`;
  const ver = (versions.get(key) || 0) + 1;
  versions.set(key, ver);
  const run = async () => {
    if (versions.get(key) !== ver) return;
    const it = getCfg(guild.id).items.find((x) => x.id === id);
    if (!it) return;
    await edit({ ...(await suggestionPayload(guild, it)), attachments: [] });
  };
  const next = (chains.get(key) || Promise.resolve()).then(run).catch((e) => console.error('[suggest] kart:', e.message));
  chains.set(key, next);
  next.finally(() => { if (chains.get(key) === next) { chains.delete(key); versions.delete(key); } });
  return next;
}

/** Kanala düşen öneri mesajı: kart, öneri metni, karar notu ve oy düğmeleri. */
async function suggestionPayload(guild, it) {
  const gid = guild.id;
  const st = STATUS[it.status] || STATUS.open;
  const name = `suggestion-${it.id}.png`;
  const png = await suggestionCard({
    id: it.id, authorName: it.authorName, avatarUrl: it.avatarUrl, up: it.up.length, down: it.down.length, status: it.status,
    isEn: getGuildLanguage(gid) !== 'tr',
  });
  const c = new ContainerBuilder().setAccentColor(st.color)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`).setDescription(`${tx(gid, 'Öneri', 'Suggestion')} #${it.id}`)))
    .addTextDisplayComponents(txt(`>>> ${it.text}`))
    .addTextDisplayComponents(txt(`-# ${tx(gid, 'Öneren', 'Suggested by')} <@${it.userId}> · <t:${Math.floor(it.at / 1000)}:R>`));
  if (it.status !== 'open') {
    const note = it.reason ? `\n> ${it.reason.replace(/\n+/g, '\n> ')}` : '';
    c.addTextDisplayComponents(txt(`${st.emoji} **${label(gid, it.status)}**${it.staffId ? ` · <@${it.staffId}>` : ''}${note}`));
  }
  const open = it.status === 'open';
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`suggest:up:${it.id}`).setEmoji('👍').setLabel(String(it.up.length)).setStyle(ButtonStyle.Success).setDisabled(!open),
    new ButtonBuilder().setCustomId(`suggest:down:${it.id}`).setEmoji('👎').setLabel(String(it.down.length)).setStyle(ButtonStyle.Danger).setDisabled(!open),
    new ButtonBuilder().setCustomId(`suggest:manage:${it.id}`).setEmoji('⚙️').setLabel(tx(gid, 'Yönet', 'Manage')).setStyle(ButtonStyle.Secondary)));
  return { components: [c], files: [new AttachmentBuilder(png, { name })], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

/** /suggest paneli: üyeye "Öneri yaz" ve kendi önerileri, Sunucuyu Yönet yetkisi olana ayarlar. */
function renderPanel(interaction, { note = '' } = {}) {
  const g = interaction.guild;
  const gid = g.id;
  const cfg = getCfg(gid);
  const issue = readyIssue(g, cfg);
  const count = (s) => cfg.items.filter((x) => x.status === s).length;
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  c.addMediaGalleryComponents(banner('suggest', 'Suggestions'));
  if (note) c.addTextDisplayComponents(txt(note));
  const stats = cfg.items.length ? `\n-# ${tx(gid,
    `**${cfg.items.length}** öneri · **${count('open')}** oylamada · **${count('approved')}** onaylı · **${count('implemented')}** yapıldı · **${count('denied')}** red`,
    `**${cfg.items.length}** suggestions · **${count('open')}** open · **${count('approved')}** approved · **${count('implemented')}** implemented · **${count('denied')}** denied`)}` : '';
  c.addTextDisplayComponents(txt(`## :aegis_chat: ${tx(gid, 'Öneriler', 'Suggestions')}\n` + tx(gid,
    'Sunucu için bir fikrin mi var? Yaz; topluluk oylasın, yetkililer karara bağlasın.',
    'Got an idea for the server? Write it down; the community votes and staff make the call.') + stats));

  const mine = cfg.items.filter((x) => x.userId === interaction.user.id).slice(-3).reverse();
  if (mine.length) {
    c.addTextDisplayComponents(txt(`### ${tx(gid, 'Önerilerin', 'Your suggestions')}\n` + mine.map((x) =>
      `${(STATUS[x.status] || STATUS.open).emoji} [#${x.id}](${link(gid, x)}) ${clip(x.text.replace(/\s+/g, ' '), 60)} · 👍 ${x.up.length} · 👎 ${x.down.length}`).join('\n')));
  }
  c.addTextDisplayComponents(txt(issue ? `-# :aegis_warn: ${issue}` : `-# ${tx(gid, `Önerin <#${cfg.channelId}> kanalına düşer.`, `Your suggestion is posted in <#${cfg.channelId}>.`)}`));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('suggest:write:p').setEmoji('✏️').setLabel(tx(gid, 'Öneri yaz', 'Write a suggestion')).setStyle(ButtonStyle.Primary).setDisabled(!!issue)));

  if (isAdmin(interaction.member)) {
    c.addSeparatorComponents(new SeparatorBuilder());
    const ch = cfg.channelId ? `<#${cfg.channelId}>` : tx(gid, '_seçilmedi_', '_not picked_');
    c.addTextDisplayComponents(txt(`### :aegis_gear: ${tx(gid, 'Ayarlar', 'Settings')}\n` + tx(gid,
      `Durum: ${cfg.enabled ? ':aegis_on: **açık**' : ':aegis_off: **kapalı**'}\nÖneri kanalı: ${ch}\nTartışma başlığı: ${cfg.threads ? 'her öneriye açılır' : 'kapalı'}\n-# Bu bölümü yalnızca Sunucuyu Yönet yetkisi olanlar görür. Önerileri Mesajları Yönet yetkisi olanlar karara bağlar.`,
      `Status: ${cfg.enabled ? ':aegis_on: **on**' : ':aegis_off: **off**'}\nSuggestions channel: ${ch}\nDiscussion thread: ${cfg.threads ? 'opened for every suggestion' : 'off'}\n-# Only people with Manage Server see this section. People with Manage Messages decide on suggestions.`)));
    const sel = new ChannelSelectMenuBuilder().setCustomId('suggest:cfg:chan').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setPlaceholder(tx(gid, 'Önerilerin düşeceği kanalı seç…', 'Pick the channel where suggestions go…'));
    if (cfg.channelId) sel.setDefaultChannels([cfg.channelId]);
    c.addActionRowComponents(new ActionRowBuilder().addComponents(sel));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      btn('suggest:cfg:toggle', cfg.enabled ? tx(gid, 'Kapat', 'Turn off') : tx(gid, 'Aç', 'Turn on'), cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      btn('suggest:cfg:threads', cfg.threads ? tx(gid, 'Başlıkları kapat', 'Threads off') : tx(gid, 'Başlıkları aç', 'Threads on')),
      btn('suggest:cfg:box', tx(gid, 'Bu kanala öneri kutusu koy', 'Post a suggestion box here'), ButtonStyle.Secondary, !cfg.enabled || !cfg.channelId)));
  }
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

/** Kanala bırakılan kalıcı öneri kutusu: komut yazmadan düğmeyle öneri. */
function boxPayload(gid) {
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  c.addMediaGalleryComponents(banner('suggest', 'Suggestions'));
  c.addTextDisplayComponents(txt(`## :aegis_chat: ${tx(gid, 'Öneri kutusu', 'Suggestion box')}\n` + tx(gid,
    'Sunucu için bir fikrin mi var? Düğmeye bas ve yaz; topluluk oylasın, yetkililer karara bağlasın.\n-# `/suggest` komutuyla da öneri yazabilirsin.',
    'Got an idea for the server? Press the button and write it; the community votes and staff make the call.\n-# You can also use the `/suggest` command.')));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('suggest:write:b').setEmoji('✏️').setLabel(tx(gid, 'Öneri yaz', 'Write a suggestion')).setStyle(ButtonStyle.Primary)));
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

/** Yetkilinin öneri paneli (gizli): karar düğmeleri. */
function managePanel(guild, it, { note = '', confirmDelete = false } = {}) {
  const gid = guild.id;
  const st = STATUS[it.status] || STATUS.open;
  const c = new ContainerBuilder().setAccentColor(st.color);
  if (note) c.addTextDisplayComponents(txt(note));
  c.addTextDisplayComponents(txt(
    `### :aegis_gear: ${tx(gid, 'Öneri', 'Suggestion')} #${it.id}\n${st.emoji} **${label(gid, it.status)}** · 👍 ${it.up.length} · 👎 ${it.down.length} · <@${it.userId}> · [${tx(gid, 'mesaja git', 'jump to it')}](${link(gid, it)})\n>>> ${clip(it.text, 400)}`));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    btn(`suggest:set:approved:${it.id}`, tx(gid, 'Onayla', 'Approve'), ButtonStyle.Success, it.status === 'approved'),
    btn(`suggest:set:denied:${it.id}`, tx(gid, 'Reddet', 'Deny'), ButtonStyle.Danger, it.status === 'denied'),
    btn(`suggest:set:implemented:${it.id}`, tx(gid, 'Yapıldı', 'Implemented'), ButtonStyle.Primary, it.status === 'implemented'),
    btn(`suggest:reopen:${it.id}`, tx(gid, 'Oylamaya aç', 'Reopen'), ButtonStyle.Secondary, it.status === 'open'),
    confirmDelete
      ? btn(`suggest:delok:${it.id}`, tx(gid, 'Evet, sil', 'Yes, delete'), ButtonStyle.Danger)
      : btn(`suggest:del:${it.id}`, tx(gid, 'Sil', 'Delete'))));
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

function writeModal(gid, src) {
  return new ModalBuilder().setCustomId(`suggest:modal:${src}`).setTitle(tx(gid, 'Öneri yaz', 'Write a suggestion')).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel(tx(gid, 'Önerin', 'Your suggestion'))
      .setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1000).setRequired(true)
      .setPlaceholder(tx(gid, 'Örn: Oyun geceleri için ayrı bir ses kanalı açalım.', 'e.g. Let\'s add a separate voice channel for game nights.'))));
}

function reasonModal(gid, status, id) {
  return new ModalBuilder().setCustomId(`suggest:why:${status}:${id}`).setTitle(`#${id} · ${label(gid, status)}`).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel(tx(gid, 'Not (isteğe bağlı)', 'Note (optional)'))
      .setStyle(TextInputStyle.Paragraph).setMaxLength(300).setRequired(false)
      .setPlaceholder(tx(gid, 'Öneri sahibi ve kanaldakiler bu notu görür.', 'The author and the channel will see this note.'))));
}

/** Karar verilince öneri sahibine kısa bir özel mesaj (DM kapalıysa sessizce geçer). */
async function notifyAuthor(guild, it) {
  const user = await guild.client.users.fetch(it.userId).catch(() => null);
  if (!user) return;
  const st = STATUS[it.status] || STATUS.open;
  const note = it.reason ? `\n> ${it.reason.replace(/\n+/g, '\n> ')}` : '';
  const content = tx(guild.id,
    `${st.emoji} **${guild.name}** sunucusundaki #${it.id} numaralı önerin: **${label(guild.id, it.status)}**`,
    `${st.emoji} Your suggestion #${it.id} in **${guild.name}**: **${label(guild.id, it.status)}**`) + `${note}\n${link(guild.id, it)}`;
  await user.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
}

/** Kanaldaki öneri mesajını güncel durumla yeniden çizer. */
function refreshMessage(guild, it) {
  return refresh(guild, it.id, async (payload) => {
    const ch = guild.channels.cache.get(it.channelId);
    if (ch?.isTextBased?.() && it.messageId) await ch.messages.edit(it.messageId, payload).catch(() => {});
  });
}

const postCd = new Map();
const voteCd = new Map();

async function open(interaction) {
  if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
  return interaction.reply(renderPanel(interaction));
}

async function onWrite(i, src) {
  const gid = i.guild.id;
  const issue = readyIssue(i.guild, getCfg(gid));
  if (issue) return deny(i, `:aegis_warn: ${issue}`);
  const left = (postCd.get(`${gid}:${i.user.id}`) || 0) + POST_COOLDOWN_MS - Date.now();
  if (left > 0) return deny(i, tx(gid, `:aegis_wait: Yeni öneri için biraz bekle: <t:${Math.ceil((Date.now() + left) / 1000)}:R>`, `:aegis_wait: Wait a bit before the next suggestion: <t:${Math.ceil((Date.now() + left) / 1000)}:R>`));
  return i.showModal(writeModal(gid, src === 'b' ? 'b' : 'p'));
}

async function onSubmit(i, src) {
  const g = i.guild;
  const gid = g.id;
  const text = i.fields.getTextInputValue('text').trim();
  if (text.length < 10) return deny(i, tx(gid, '❌ Öneri en az 10 karakter olmalı.', '❌ A suggestion needs at least 10 characters.'));
  let cfg = getCfg(gid);
  const issue = readyIssue(g, cfg);
  if (issue) return deny(i, `:aegis_warn: ${issue}`);
  const cdKey = `${gid}:${i.user.id}`;
  if ((postCd.get(cdKey) || 0) + POST_COOLDOWN_MS > Date.now()) return deny(i, tx(gid, ':aegis_wait: Biraz önce öneri gönderdin, az sonra tekrar dene.', ':aegis_wait: You just sent a suggestion, try again shortly.'));
  postCd.set(cdKey, Date.now());

  const fromPanel = src === 'p' && i.isFromMessage();
  if (fromPanel) await i.deferUpdate(); else await i.deferReply({ flags: MessageFlags.Ephemeral });

  // Numara gönderimden önce ayrılır: aynı anda gelen iki öneri aynı numarayı almasın
  cfg.counter += 1;
  saveCfg(gid, cfg);
  const it = {
    id: cfg.counter, userId: i.user.id,
    authorName: i.member?.displayName || i.user.globalName || i.user.username,
    avatarUrl: (i.member?.displayAvatarURL?.({ extension: 'png', size: 128 })) || i.user.displayAvatarURL({ extension: 'png', size: 128 }),
    text, status: 'open', up: [], down: [], channelId: cfg.channelId, messageId: null, at: Date.now(),
  };
  const ch = g.channels.cache.get(cfg.channelId);
  const msg = await ch.send(await suggestionPayload(g, it)).catch((e) => { console.error('[suggest] gönderim:', e.message); return null; });
  if (!msg) {
    postCd.delete(cdKey);
    const fail = tx(gid, `❌ Öneri <#${cfg.channelId}> kanalına gönderilemedi. Yetkililere haber ver.`, `❌ Could not post in <#${cfg.channelId}>. Let the staff know.`);
    return fromPanel ? i.editReply({ components: renderPanel(i, { note: fail }).components }) : i.editReply({ content: fail });
  }
  it.messageId = msg.id;
  cfg = getCfg(gid);
  cfg.items.push(it);
  saveCfg(gid, cfg);
  if (cfg.threads && msg.startThread) {
    msg.startThread({ name: clip(`#${it.id} · ${text.replace(/\s+/g, ' ')}`, 90), autoArchiveDuration: 1440 }).catch(() => {});
  }
  const ok = tx(gid, `:aegis_ok: Önerin gönderildi: [#${it.id}](${link(gid, it)})`, `:aegis_ok: Your suggestion is posted: [#${it.id}](${link(gid, it)})`);
  return fromPanel ? i.editReply({ components: renderPanel(i, { note: ok }).components }) : i.editReply({ content: ok });
}

async function onVote(i, dir, id) {
  const g = i.guild;
  const gid = g.id;
  const cfg = getCfg(gid);
  const it = cfg.items.find((x) => x.id === id);
  if (!it) return deny(i, tx(gid, '❌ Bu öneri artık yok.', '❌ This suggestion no longer exists.'));
  if (it.status !== 'open') return deny(i, tx(gid, ':aegis_lock: Bu önerinin oylaması kapandı.', ':aegis_lock: Voting on this suggestion is closed.'));
  const cdKey = `${gid}:${i.user.id}`;
  if ((voteCd.get(cdKey) || 0) + VOTE_COOLDOWN_MS > Date.now()) return i.deferUpdate().catch(() => {});
  voteCd.set(cdKey, Date.now());

  const uid = i.user.id;
  const mine = dir === 'up' ? it.up : it.down;
  const other = dir === 'up' ? it.down : it.up;
  if (mine.includes(uid)) mine.splice(mine.indexOf(uid), 1);
  else {
    mine.push(uid);
    if (other.includes(uid)) other.splice(other.indexOf(uid), 1);
  }
  saveCfg(gid, cfg);
  await i.deferUpdate();
  return refresh(g, id, (payload) => i.editReply(payload));
}

async function onDecide(i, status, id, reason) {
  const g = i.guild;
  const gid = g.id;
  const cfg = getCfg(gid);
  const it = cfg.items.find((x) => x.id === id);
  if (!it) return deny(i, tx(gid, '❌ Bu öneri artık yok.', '❌ This suggestion no longer exists.'));
  await i.deferUpdate();
  it.status = status;
  if (status === 'open') { it.staffId = null; it.reason = null; it.decidedAt = null; }
  else { it.staffId = i.user.id; it.reason = reason || null; it.decidedAt = Date.now(); }
  saveCfg(gid, cfg);
  await refreshMessage(g, it);
  if (status !== 'open') notifyAuthor(g, it).catch(() => {});
  const note = status === 'open'
    ? tx(gid, ':aegis_ok: Öneri yeniden oylamaya açıldı.', ':aegis_ok: The suggestion is open for voting again.')
    : tx(gid, `:aegis_ok: Karar kaydedildi: **${label(gid, status)}**. Öneri sahibine özelden haber verildi.`, `:aegis_ok: Decision saved: **${label(gid, status)}**. The author was notified by DM.`);
  return i.editReply({ components: managePanel(g, it, { note }).components });
}

async function onDelete(i, id) {
  const g = i.guild;
  const gid = g.id;
  const cfg = getCfg(gid);
  const it = cfg.items.find((x) => x.id === id);
  if (!it) return deny(i, tx(gid, '❌ Bu öneri artık yok.', '❌ This suggestion no longer exists.'));
  await i.deferUpdate();
  const ch = g.channels.cache.get(it.channelId);
  if (ch?.isTextBased?.() && it.messageId) await ch.messages.delete(it.messageId).catch(() => {});
  cfg.items = cfg.items.filter((x) => x.id !== id);
  saveCfg(gid, cfg);
  const c = new ContainerBuilder().setAccentColor(0x99aab5)
    .addTextDisplayComponents(txt(tx(gid, `:aegis_trash: #${id} numaralı öneri silindi.`, `:aegis_trash: Suggestion #${id} was deleted.`)));
  return i.editReply({ components: [c] });
}

async function onConfig(i, what) {
  const g = i.guild;
  const gid = g.id;
  if (!isAdmin(i.member)) return deny(i, tx(gid, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'));
  const cfg = getCfg(gid);
  let note = '';
  if (what === 'chan') {
    const ch = g.channels.cache.get(i.values[0]);
    if (!canPost(ch, g.members.me)) {
      note = tx(gid, `❌ Aegis <#${i.values[0]}> kanalına yazamıyor. Mesaj Gönder ve Dosya Ekle yetkisi ver.`, `❌ Aegis cannot post in <#${i.values[0]}>. Give it Send Messages and Attach Files.`);
    } else {
      if (!cfg.channelId) cfg.enabled = true; // ilk kurulumda kanal seçmek sistemi açar
      cfg.channelId = ch.id;
      saveCfg(gid, cfg);
      note = tx(gid, `:aegis_ok: Öneriler artık <#${ch.id}> kanalına düşecek.`, `:aegis_ok: Suggestions now go to <#${ch.id}>.`);
    }
  } else if (what === 'toggle') {
    if (!cfg.enabled && !cfg.channelId) note = tx(gid, ':aegis_warn: Önce öneri kanalını seç.', ':aegis_warn: Pick the suggestions channel first.');
    else { cfg.enabled = !cfg.enabled; saveCfg(gid, cfg); note = cfg.enabled ? tx(gid, ':aegis_ok: Öneriler açıldı.', ':aegis_ok: Suggestions turned on.') : tx(gid, ':aegis_ok: Öneriler kapatıldı.', ':aegis_ok: Suggestions turned off.'); }
  } else if (what === 'threads') {
    cfg.threads = !cfg.threads; saveCfg(gid, cfg);
    note = cfg.threads ? tx(gid, ':aegis_ok: Her öneriye bir tartışma başlığı açılacak.', ':aegis_ok: Every suggestion gets a discussion thread.') : tx(gid, ':aegis_ok: Tartışma başlıkları kapatıldı.', ':aegis_ok: Discussion threads turned off.');
  } else if (what === 'box') {
    if (!canPost(i.channel, g.members.me)) note = tx(gid, '❌ Aegis bu kanala yazamıyor.', '❌ Aegis cannot post in this channel.');
    else {
      const sent = await i.channel.send(boxPayload(gid)).catch(() => null);
      note = sent ? tx(gid, ':aegis_ok: Öneri kutusu bu kanala kondu.', ':aegis_ok: The suggestion box is posted in this channel.') : tx(gid, '❌ Kutu gönderilemedi.', '❌ Could not post the box.');
    }
  } else return;
  return i.update({ components: renderPanel(i, { note }).components });
}

async function handle(interaction) {
  const g = interaction.guild;
  if (!g) return;
  const gid = g.id;
  const [, action, a, b] = interaction.customId.split(':');
  if (action === 'write') return onWrite(interaction, a);
  if (action === 'modal') return onSubmit(interaction, a);
  if (action === 'up' || action === 'down') return onVote(interaction, action, Number(a));
  if (action === 'cfg') return onConfig(interaction, a);

  // Buradan sonrası yetkili işlemleri
  if (!isStaff(interaction.member)) return deny(interaction, tx(gid, '❌ Önerileri yönetmek için Mesajları Yönet yetkisi gerekli.', '❌ You need Manage Messages to manage suggestions.'));
  if (action === 'manage') {
    const it = getCfg(gid).items.find((x) => x.id === Number(a));
    if (!it) return deny(interaction, tx(gid, '❌ Bu öneri artık yok.', '❌ This suggestion no longer exists.'));
    return interaction.reply(managePanel(g, it));
  }
  if (action === 'set' && DECISIONS.includes(a)) return interaction.showModal(reasonModal(gid, a, Number(b)));
  if (action === 'why' && DECISIONS.includes(a)) return onDecide(interaction, a, Number(b), interaction.fields.getTextInputValue('reason').trim());
  if (action === 'reopen') return onDecide(interaction, 'open', Number(a));
  if (action === 'del') {
    const it = getCfg(gid).items.find((x) => x.id === Number(a));
    if (!it) return deny(interaction, tx(gid, '❌ Bu öneri artık yok.', '❌ This suggestion no longer exists.'));
    return interaction.update({ components: managePanel(g, it, { confirmDelete: true, note: tx(gid, ':aegis_warn: Öneri ve kanaldaki mesajı silinecek. Emin misin?', ':aegis_warn: The suggestion and its message will be deleted. Are you sure?') }).components });
  }
  if (action === 'delok') return onDelete(interaction, Number(a));
}

module.exports = { open, handle, getCfg };
