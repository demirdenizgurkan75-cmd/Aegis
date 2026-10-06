/**
 * HIZLI MODERASYON: mesaja sağ tık → Apps → "Moderate Author". Yazarı uyar, sustur, mesajı sil ya da jüriye gönder.
 * Yalnızca yetkiliye görünen (ephemeral) kart + düğme paneli. customId: qmod:<eylem>:<kullanıcı>:<kanal>:<mesaj> (≤100 karakter).
 * Her tıklamada yetki ve rol sırası yeniden denetlenir; her eylem /modlog'da dava olur.
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits,
  AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
} = require('discord.js');
const { addWarning, getWarnings } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { getGuildLanguage } = require('../utils/i18n');
const { quickModCard } = require('../utils/canvas/cards');
const { recordCase, applyWarnPolicy } = require('./modlog');
const { tx } = require('./util');

const P = PermissionFlagsBits;
const NEEDS = { warn: [P.ModerateMembers], t10: [P.ModerateMembers], t60: [P.ModerateMembers], del: [P.ManageMessages], delwarn: [P.ManageMessages, P.ModerateMembers], jury: [P.ManageMessages] };
const hasAll = (m, list) => list.every((p) => m?.permissions?.has(p));
const isStaff = (m) => [P.ModerateMembers, P.ManageMessages, P.KickMembers, P.BanMembers, P.ManageGuild].some((p) => m?.permissions?.has(p));
const txt = (s) => new TextDisplayBuilder().setContent(s);
const btn = (action, ids, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(`qmod:${action}:${ids.userId}:${ids.channelId}:${ids.messageId}`).setLabel(label).setStyle(style).setDisabled(disabled);
const excerptOf = (msg) => {
  const t = (msg?.content || '').replace(/\s+/g, ' ').trim();
  if (t) return t.slice(0, 160);
  if (msg?.attachments?.size) return `[${msg.attachments.size} attachment]`;
  return '';
};

async function fetchMessage(client, channelId, messageId) {
  const ch = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
  return ch?.messages ? ch.messages.fetch(messageId).catch(() => null) : null;
}

async function render(interaction, ids, { note = '', excerpt = '', messageGone = false } = {}) {
  const gid = interaction.guild.id;
  const isEn = getGuildLanguage(gid) === 'en';
  const user = await interaction.client.users.fetch(ids.userId).catch(() => null);
  const png = await quickModCard({ userName: user?.username || ids.userId, avatarUrl: user?.displayAvatarURL({ extension: 'png', size: 128 }) || null, excerpt: messageGone ? tx(gid, '(mesaj silindi)', '(message deleted)') : excerpt, isEn });
  const c = new ContainerBuilder().setAccentColor(0xf0b232)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://quickmod.png').setDescription('Moderate Author')));
  c.addTextDisplayComponents(txt(note ? `${note}\n-# <@${ids.userId}>` : tx(gid, `<@${ids.userId}> için ne yapalım?`, `What should happen to <@${ids.userId}>?`)));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    btn('warn', ids, tx(gid, 'Uyar', 'Warn'), ButtonStyle.Primary),
    btn('t10', ids, tx(gid, '10 dk sustur', 'Timeout 10 min')),
    btn('t60', ids, tx(gid, '1 sa sustur', 'Timeout 1 h'))));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    btn('del', ids, tx(gid, 'Mesajı sil', 'Delete message'), ButtonStyle.Danger, messageGone),
    btn('delwarn', ids, tx(gid, 'Sil + uyar', 'Delete + warn'), ButtonStyle.Danger, messageGone),
    btn('jury', ids, tx(gid, 'Jüriye gönder', 'Send to jury'), ButtonStyle.Secondary, messageGone)));
  return { components: [c], files: [new AttachmentBuilder(png, { name: 'quickmod.png' })], attachments: [] };
}

/** Bağlam menüsü komutu girişi (commands/moderate-author.js). */
async function open(interaction) {
  const g = interaction.guild;
  const eph = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (!g) return;
  if (!isStaff(interaction.member)) return eph(tx(g.id, ':aegis_no: Bunun için moderatör yetkisi gerekli.', ':aegis_no: This needs moderator permissions.'));
  const msg = interaction.targetMessage;
  if (!msg?.author || msg.author.bot || msg.webhookId) return eph(tx(g.id, ':aegis_no: Bot mesajlarının yazarı modere edilemez.', ':aegis_no: Bot messages cannot be moderated.'));
  if (msg.author.id === interaction.user.id) return eph(tx(g.id, ':aegis_no: Kendini modere edemezsin.', ':aegis_no: You cannot moderate yourself.'));
  const ids = { userId: msg.author.id, channelId: msg.channelId, messageId: msg.id };
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return interaction.editReply({ ...(await render(interaction, ids, { excerpt: excerptOf(msg) })), flags: MessageFlags.IsComponentsV2 });
}

/** Hedef üye üzerinde işlem yapılabilir mi? Hata metni ya da null. */
async function checkTarget(interaction, userId) {
  const g = interaction.guild, gid = g.id;
  if (userId === g.ownerId) return tx(gid, 'Sunucu sahibi modere edilemez.', 'The server owner cannot be moderated.');
  if (userId === interaction.client.user.id) return tx(gid, 'Beni mi modere edeceksin?', 'You want to moderate me?');
  if (userId === interaction.user.id) return tx(gid, 'Kendini modere edemezsin.', 'You cannot moderate yourself.');
  const member = await g.members.fetch(userId).catch(() => null);
  if (!member) return tx(gid, 'Üye artık sunucuda değil.', 'The member is no longer in the server.');
  if (member.roles.highest.position >= interaction.member.roles.highest.position && g.ownerId !== interaction.user.id) return tx(gid, 'Bu üyenin rolü seninkinden yüksek ya da eşit.', 'This member has a role equal to or higher than yours.');
  return null;
}

async function handle(interaction) {
  const g = interaction.guild;
  if (!g) return;
  const gid = g.id;
  const [, action, userId, channelId, messageId] = interaction.customId.split(':');
  const ids = { userId, channelId, messageId };
  const deny = (m) => interaction.reply({ content: `:aegis_no: ${m}`, flags: MessageFlags.Ephemeral }).catch(() => {});
  const need = NEEDS[action];
  if (!need) return;
  if (!hasAll(interaction.member, need)) return deny(tx(gid, 'Bu eylem için yetkin yok.', 'You do not have permission for this action.'));

  await interaction.deferUpdate().catch(() => {});
  const redraw = async (note, extra = {}) => {
    const msg = await fetchMessage(interaction.client, channelId, messageId);
    return interaction.editReply({ ...(await render(interaction, ids, { note, excerpt: excerptOf(msg), messageGone: !msg, ...extra })), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  };
  const message = await fetchMessage(interaction.client, channelId, messageId);
  const excerpt = excerptOf(message);
  const baseReason = excerpt
    ? tx(gid, `Mesaj nedeniyle: "${excerpt.slice(0, 120)}"`, `For a message: "${excerpt.slice(0, 120)}"`)
    : tx(gid, 'Mesaj nedeniyle', 'For a message');
  const warnUser = async () => {
    const warnList = addWarning(gid, userId, interaction.user.id, baseReason);
    const warn = warnList[warnList.length - 1];
    const total = getWarnings(gid, userId).length;
    const kase = recordCase(gid, { type: 'warn', userId, modId: interaction.user.id, reason: baseReason, warnId: warn?.id });
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    try { await sendChannelLog(g, 'warn', interaction.user, user, baseReason); } catch (_) {}
    const member = await g.members.fetch(userId).catch(() => null);
    const auto = await applyWarnPolicy(g, member, interaction.client, total);
    return { kase, total, auto };
  };

  try {
    if (action === 'jury') {
      if (!message) return redraw(tx(gid, ':aegis_no: Mesaj artık yok.', ':aegis_no: The message is gone.'));
      const res = await require('./jury').createCase(g, message, interaction.user);
      const errs = { off: ['Jüri kurulu değil', 'The jury is not set up'], bot: ['Bot mesajları gönderilemez', 'Bot messages cannot be sent'], protected: ['Yöneticilerin mesajları gönderilemez', 'Administrators\' messages cannot be sent'], dup: ['Bu mesaj için zaten açık dava var', 'There is already an open case'], rate: ['Saatte en fazla 3 dava', 'At most 3 cases per hour'], pool: ['Jüri havuzunda en az 3 üye olmalı', 'The jury pool needs at least 3 members'], channel: ['Jüri kanalı bulunamadı', 'Jury channel not found'], send: ['Jüri kanalına yazamıyorum', 'I cannot post in the jury channel'] };
      if (res.err) return redraw(`:aegis_no: ${tx(gid, (errs[res.err] || ['Olmadı', 'Failed'])[0], (errs[res.err] || ['Olmadı', 'Failed'])[1])}.`);
      return redraw(`:aegis_scales: ${tx(gid, `Dava #${res.id} jüriye gönderildi.`, `Case #${res.id} was sent to the jury.`)}`);
    }

    if (action === 'del') {
      if (!message) return redraw(tx(gid, ':aegis_no: Mesaj zaten silinmiş.', ':aegis_no: The message is already deleted.'));
      await message.delete();
      return redraw(`:aegis_ok: ${tx(gid, 'Mesaj silindi.', 'Message deleted.')}`, { messageGone: true });
    }

    // Aşağıdakiler üyeye ceza uygular: rol sırasını denetle
    const bad = await checkTarget(interaction, userId);
    if (bad) return redraw(`:aegis_no: ${bad}`);

    if (action === 'warn' || action === 'delwarn') {
      if (action === 'delwarn' && message) await message.delete().catch(() => {});
      const { kase, total, auto } = await warnUser();
      return redraw(`:aegis_ok: ${tx(gid, `Uyarıldı (dava #${kase.id}, toplam ${total} uyarı).`, `Warned (case #${kase.id}, ${total} warnings in total).`)}${action === 'delwarn' ? ` ${tx(gid, 'Mesaj silindi.', 'Message deleted.')}` : ''}${auto ? `\n:aegis_alert: ${tx(gid, `Sınıra ulaştı: otomatik ${auto.minutes} dk timeout (dava #${auto.caseId}).`, `Limit reached: automatic ${auto.minutes} min timeout (case #${auto.caseId}).`)}` : ''}`, { messageGone: action === 'delwarn' });
    }

    if (action === 't10' || action === 't60') {
      const member = await g.members.fetch(userId).catch(() => null);
      if (!member?.moderatable) return redraw(`:aegis_no: ${tx(gid, 'Bu üyeye işlem yapamıyorum: botun rolü onun rolünün üstünde olmalı.', 'I cannot act on this member: my role must be above theirs.')}`);
      const ms = action === 't10' ? 10 * 60000 : 60 * 60000;
      await member.timeout(ms, baseReason);
      const kase = recordCase(gid, { type: 'timeout', userId, modId: interaction.user.id, reason: baseReason, durationMs: ms });
      try { await sendChannelLog(g, 'timeout', interaction.user, member.user, baseReason, action === 't10' ? tx(gid, '10 dk', '10 min') : tx(gid, '1 sa', '1 h')); } catch (_) {}
      return redraw(`:aegis_ok: ${tx(gid, `Susturuldu: ${action === 't10' ? '10 dk' : '1 sa'} (dava #${kase.id}).`, `Timed out for ${action === 't10' ? '10 min' : '1 h'} (case #${kase.id}).`)}`);
    }
  } catch (e) {
    console.error('[quickmod]', e.message);
    return redraw(`:aegis_sad: ${tx(gid, 'İşlem tamamlanamadı. Botun yetkilerini ve rol sırasını kontrol et.', 'The action could not be completed. Check my permissions and role order.')}`);
  }
}

module.exports = { open, handle };
