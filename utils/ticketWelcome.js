/**
 * Bilet kanalı açılış mesajı (Components V2): kart, kısa karşılama, ne yazması gerektiği ve kapatma düğmesi.
 * Dil: Türkçe sunucularda Türkçe, diğerlerinde İngilizce.
 */
const {
  AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const { ticketOpenCard } = require('./canvas/cards');
const { getGuildLanguage } = require('./i18n');

const PRIORITY = { normal: ['Normal', 'Normal'], high: ['Yüksek', 'High'], urgent: ['Acil', 'Urgent'] };

async function buildTicketWelcome({ guild, user, ticketId, categoryType, staffRoleId, createdAt = Date.now(), claimedBy = null, priority = 'normal' }) {
  const isEn = getGuildLanguage(guild.id) !== 'tr';
  const L = (tr, en) => (isEn ? en : tr);
  const num = String(ticketId).replace(/^[a-z]+-/i, '');
  const ts = Math.floor(createdAt / 1000);

  const container = new ContainerBuilder().setAccentColor(0x0066ff);
  const files = [];
  try {
    const png = await ticketOpenCard({
      id: num, category: categoryType, openerName: user.displayName || user.username,
      avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }), isEn,
    });
    files.push(new AttachmentBuilder(png, { name: 'ticket-open.png' }));
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://ticket-open.png').setDescription('Ticket')));
  } catch (e) { console.error('[ticket open card]', e.message); }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## :aegis_ticket: ${L('Destek talebin açıldı', 'Your ticket is open')}\n` +
    L(`<@${user.id}>, merhaba! <@&${staffRoleId}> ekibi en kısa sürede burada olacak.`, `<@${user.id}>, hi! The <@&${staffRoleId}> team will be here as soon as they can.`)
  ));
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `### ${L('Hızlı yardım için', 'To get help faster')}\n` +
    L('• Ne olduğunu tek mesajda anlat\n• Ne zaman başladığını ve neyi denediğini yaz\n• Varsa ekran görüntüsü ekle',
      '• Describe what happened in one message\n• Say when it started and what you already tried\n• Attach a screenshot if you have one')
  ));
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${L('Üstlenen', 'Claimed by')}: ${claimedBy ? `<@${claimedBy}>` : L('henüz yok', 'nobody yet')} · ${L('Öncelik', 'Priority')}: ${PRIORITY[priority]?.[isEn ? 1 : 0] || PRIORITY.normal[isEn ? 1 : 0]}\n` +
        `-# ${categoryType} · <t:${ts}:R>\n` +
        `-# ${L('Hesap', 'Account')} <t:${Math.floor(user.createdTimestamp / 1000)}:D> · ID ${user.id}`
      ))
      .setButtonAccessory(new ButtonBuilder().setCustomId('close_ticket').setLabel(L('🔒 Talebi kapat', '🔒 Close ticket')).setStyle(ButtonStyle.Danger))
  );

  // Yetkili araçları: talebi üstlen, öncelik seç (yalnızca yetkililer basabilir)
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel(claimedBy ? L('Üstlenildi', 'Claimed') : L('Talebi üstlen', 'Claim ticket')).setStyle(ButtonStyle.Primary).setDisabled(!!claimedBy)));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('ticket_prio').setPlaceholder(L('Öncelik (yetkili)', 'Priority (staff)')).addOptions(
      Object.entries(PRIORITY).map(([value, [tr, en]]) => ({ label: isEn ? en : tr, value, default: value === priority })))));

  return {
    components: [container], files, flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [user.id], roles: [staffRoleId] },
  };
}

module.exports = { buildTicketWelcome, PRIORITY };
