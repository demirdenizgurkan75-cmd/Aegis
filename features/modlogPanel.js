/** /modlog: moderasyon dosyası paneli. Üye geçmişi (üye seçilir), otomatik ceza ayarı. customId'ler "modlogui:" ile başlar. */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits, StringSelectMenuBuilder,
  AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
} = require('discord.js');
const { getPolicy, savePolicy, historyLines, getWarnings, getCases, getCase, editCaseReason, deleteCase, label } = require('./modlog');
const { getGuildLanguage } = require('../utils/i18n');
const { caseCard } = require('../utils/canvas/cards');
const punishDm = require('./punishDm');
const { tx, banner } = require('./util');

const isMod = (m) => ['ModerateMembers', 'KickMembers', 'BanMembers', 'ManageGuild'].some((p) => m?.permissions?.has(PermissionFlagsBits[p]));
const isAdmin = (m) => !!m?.permissions?.has(PermissionFlagsBits.ManageGuild);
const txt = (s) => new TextDisplayBuilder().setContent(s);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const out = (c) => ({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

function render(guild, { view = 'home', userId = null, note = '' } = {}) {
  const gid = guild.id;
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  if (view === 'history' && userId) {
    if (note) c.addTextDisplayComponents(txt(note));
    c.addTextDisplayComponents(txt(`## :aegis_hammer: ${tx(gid, 'Üye geçmişi', 'Member history')}\n<@${userId}> · ${tx(gid, 'Toplam uyarı', 'Total warnings')}: **${getWarnings(gid, userId).length}**`));
    c.addSeparatorComponents(new SeparatorBuilder());
    c.addTextDisplayComponents(txt(historyLines(gid, userId)));
    c.addSeparatorComponents(new SeparatorBuilder());
    const cases = getCases(gid, userId, 25);
    if (cases.length) {
      c.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('modlogui:case')
        .setPlaceholder(tx(gid, 'Düzenlemek ya da silmek için bir dava seç…', 'Pick a case to edit or delete…'))
        .addOptions(cases.map((k) => ({ label: `#${k.id} ${label(gid, k.type)}`.slice(0, 100), value: String(k.id), ...(k.reason ? { description: k.reason.slice(0, 100) } : {}) })))));
    }
    c.addActionRowComponents(new ActionRowBuilder().addComponents(btn('modlogui:home', tx(gid, 'Geri', 'Back'))));
    return out(c);
  }
  const p = getPolicy(gid);
  c.addMediaGalleryComponents(banner('modlog', 'Moderation file'));
  if (note) c.addTextDisplayComponents(txt(note));
  c.addTextDisplayComponents(txt(
    `## :aegis_hammer: ${tx(gid, 'Moderasyon Dosyası', 'Moderation File')}\n` + tx(gid,
      `Her \`/moderation\` işlemi bir **dava numarası** alır. Bir üyenin geçmişini aşağıdan seçerek görürsün.\nOtomatik ceza: ${p.enabled ? `:aegis_on: **açık**: her **${p.threshold}** uyarıda **${p.timeoutMin} dk** timeout` : ':aegis_off: **kapalı**'}`,
      `Every \`/moderation\` action gets a **case number**. Pick a member below to see their history.\nAutomatic penalty: ${p.enabled ? `:aegis_on: **on**: **${p.timeoutMin} min** timeout at every **${p.threshold}** warnings` : ':aegis_off: **off**'}`)));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('modlogui:user').setPlaceholder(tx(gid, 'Geçmişine bakılacak üyeyi seç…', 'Pick a member to see their history…'))));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    btn('modlogui:policy', tx(gid, 'Otomatik ceza ayarı', 'Automatic penalty setup')),
    btn('modlogui:toggle', p.enabled ? tx(gid, 'Otomatik cezayı kapat', 'Turn the penalty off') : tx(gid, 'Otomatik cezayı aç', 'Turn the penalty on'), p.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    btn('modlogui:dm', punishDm.isOn(gid) ? tx(gid, 'Ceza DM\'ini kapat', 'Turn punishment DMs off') : tx(gid, 'Ceza DM\'ini aç', 'Turn punishment DMs on'))));
  c.addTextDisplayComponents(txt(tx(gid,
    `-# Atılan ya da banlanan üyeye sebep özelden gider: ${punishDm.isOn(gid) ? 'açık' : 'kapalı'}. Üye geçmişinden bir dava seçip sebebini düzenleyebilir ya da silebilirsin.`,
    `-# Kicked or banned members get the reason by DM: ${punishDm.isOn(gid) ? 'on' : 'off'}. Pick a case from a member's history to edit its reason or delete it.`)));
  return out(c);
}

/** Tek dava görünümü: dava kartı + düzenle/sil düğmeleri (silme onaylı). */
async function renderCase(interaction, id, { confirm = false, note = '' } = {}) {
  const g = interaction.guild, gid = g.id;
  const k = getCase(gid, id);
  if (!k) return { components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(txt(tx(gid, '❌ Bu dava artık yok.', '❌ This case no longer exists.'))).addActionRowComponents(new ActionRowBuilder().addComponents(btn('modlogui:home', tx(gid, 'Geri', 'Back'))))], files: [], attachments: [] };
  const [u, m] = await Promise.all([interaction.client.users.fetch(k.userId).catch(() => null), interaction.client.users.fetch(k.modId).catch(() => null)]);
  const isEn = getGuildLanguage(gid) === 'en';
  const png = await caseCard({
    id: k.id, type: k.type, userName: u?.username || k.userId, avatarUrl: u?.displayAvatarURL({ extension: 'png', size: 128 }) || null,
    modName: m?.username || k.modId, reason: k.reason, dateText: new Date(k.at).toLocaleString(isEn ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    edited: !!k.edited, isEn,
  });
  const c = new ContainerBuilder().setAccentColor(confirm ? 0xed4245 : 0x0066ff)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://case.png').setDescription('Case')));
  if (note) c.addTextDisplayComponents(txt(note));
  if (confirm) {
    c.addTextDisplayComponents(txt(tx(gid, `**Dava #${k.id} silinsin mi?** Bu geri alınamaz.${k.warnId ? ' İlgili uyarı kaydı da kaldırılır.' : ''}`, `**Delete case #${k.id}?** This cannot be undone.${k.warnId ? ' The related warning is removed too.' : ''}`)));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(btn(`modlogui:delgo:${k.id}`, tx(gid, 'Evet, sil', 'Yes, delete'), ButtonStyle.Danger), btn(`modlogui:case:${k.id}`, tx(gid, 'Vazgeç', 'Cancel'))));
  } else {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      btn(`modlogui:edit:${k.id}`, tx(gid, 'Sebebi düzenle', 'Edit reason'), ButtonStyle.Primary),
      btn(`modlogui:del:${k.id}`, tx(gid, 'Davayı sil', 'Delete case'), ButtonStyle.Danger),
      btn(`modlogui:hist:${k.userId}`, tx(gid, 'Geçmişe dön', 'Back to history'))));
  }
  return { components: [c], files: [new AttachmentBuilder(png, { name: 'case.png' })], attachments: [] };
}

async function open(interaction) {
  if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
  if (!isMod(interaction.member)) return interaction.reply({ content: tx(interaction.guild.id, '❌ Moderatör yetkisi gerekli.', '❌ Moderator permission required.'), flags: MessageFlags.Ephemeral });
  return interaction.reply(render(interaction.guild));
}
async function show(interaction, opts) {
  const p = render(interaction.guild, opts);
  if (interaction.isModalSubmit() && !interaction.isFromMessage()) return interaction.reply({ ...p });
  return interaction.update({ components: p.components, files: [], attachments: [] });
}

async function handle(interaction) {
  const g = interaction.guild;
  if (!g) return;
  const gid = g.id;
  if (!isMod(interaction.member)) return interaction.reply({ content: tx(gid, '❌ Moderatör yetkisi gerekli.', '❌ Moderator permission required.'), flags: MessageFlags.Ephemeral }).catch(() => {});
  const id = interaction.customId;
  if (id === 'modlogui:home') return show(interaction);
  if (id === 'modlogui:user') return show(interaction, { view: 'history', userId: interaction.values[0] });
  if (id.startsWith('modlogui:hist:')) return show(interaction, { view: 'history', userId: id.split(':')[2] });
  if (id === 'modlogui:case' || id.startsWith('modlogui:case:')) {
    const caseId = id === 'modlogui:case' ? interaction.values[0] : id.split(':')[2];
    return interaction.update(await renderCase(interaction, caseId));
  }
  if (id.startsWith('modlogui:edit:')) {
    const k = getCase(gid, id.split(':')[2]);
    if (!k) return interaction.update(await renderCase(interaction, 0));
    return interaction.showModal(new ModalBuilder().setCustomId(`modlogui:editSubmit:${k.id}`).setTitle(tx(gid, `Dava #${k.id}: sebep`, `Case #${k.id}: reason`)).addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel(tx(gid, 'Yeni sebep', 'New reason')).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300).setValue(String(k.reason || '').slice(0, 300)))));
  }
  if (id.startsWith('modlogui:editSubmit:')) {
    const caseId = id.split(':')[2];
    const reason = interaction.fields.getTextInputValue('reason').trim();
    if (!reason) return interaction.update(await renderCase(interaction, caseId));
    editCaseReason(gid, caseId, reason, interaction.user.id);
    return interaction.update(await renderCase(interaction, caseId, { note: tx(gid, '✅ Sebep güncellendi.', '✅ Reason updated.') }));
  }
  // Silme yalnızca Sunucuyu Yönet yetkisiyle
  if (id.startsWith('modlogui:del:') || id.startsWith('modlogui:delgo:')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: tx(gid, '❌ Dava silmek için Sunucuyu Yönet yetkisi gerekli.', '❌ Deleting a case needs the Manage Server permission.'), flags: MessageFlags.Ephemeral }).catch(() => {});
    const caseId = id.split(':')[2];
    if (id.startsWith('modlogui:del:')) return interaction.update(await renderCase(interaction, caseId, { confirm: true }));
    const k = deleteCase(gid, caseId);
    return show(interaction, k ? { view: 'history', userId: k.userId, note: tx(gid, `✅ Dava #${k.id} silindi.`, `✅ Case #${k.id} deleted.`) } : {});
  }
  if (id === 'modlogui:dm') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: tx(gid, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral }).catch(() => {});
    punishDm.setOn(gid, !punishDm.isOn(gid));
    return show(interaction, { note: punishDm.isOn(gid) ? tx(gid, '✅ Ceza DM\'i açıldı.', '✅ Punishment DMs are on.') : tx(gid, '✅ Ceza DM\'i kapatıldı.', '✅ Punishment DMs are off.') });
  }

  // Ayarlar yalnızca yönetici
  if (!isAdmin(interaction.member)) return interaction.reply({ content: tx(gid, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral }).catch(() => {});
  const p = getPolicy(gid);
  if (id === 'modlogui:toggle') { p.enabled = !p.enabled; savePolicy(gid, p); return show(interaction, { note: p.enabled ? tx(gid, '✅ Otomatik ceza açıldı.', '✅ Automatic penalty is on.') : tx(gid, '✅ Kapatıldı.', '✅ Turned off.') }); }
  if (id === 'modlogui:policy') {
    const input = (cid, label, value) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5).setValue(String(value)));
    return interaction.showModal(new ModalBuilder().setCustomId('modlogui:policySubmit').setTitle(tx(gid, 'Otomatik ceza', 'Automatic penalty')).addComponents(
      input('threshold', tx(gid, 'Kaç uyarıda? (2-20)', 'At how many warnings? (2-20)'), p.threshold),
      input('minutes', tx(gid, 'Timeout süresi, dakika (1-40320)', 'Timeout length, minutes (1-40320)'), p.timeoutMin)));
  }
  if (id === 'modlogui:policySubmit') {
    const num = (k, lo, hi, d) => { const n = parseInt(interaction.fields.getTextInputValue(k), 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    p.threshold = num('threshold', 2, 20, p.threshold); p.timeoutMin = num('minutes', 1, 40320, p.timeoutMin); savePolicy(gid, p);
    return show(interaction, { note: tx(gid, '✅ Kaydedildi.', '✅ Saved.') });
  }
}

module.exports = { open, handle, render };
