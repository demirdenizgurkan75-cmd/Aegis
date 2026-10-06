/**
 * BİLET ARAÇLARI: yetkili "talebi üstlen" düğmesi ve öncelik menüsü (açılış mesajında), hareketsiz biletlerin otomatik kapanması.
 * Bilet kaydı: guild.tickets[ticketId] = { userId, channelId, createdAt, categoryType, claimedBy, priority, autoWarnedAt, closed }.
 * Otomatik kapanma: guild.ticketAutoCloseHours (0 = kapalı, /ticket kurulum sekmesi).
 */
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags, PermissionFlagsBits, AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const { getGuild, updateTicket, closeTicket, readDB } = require('../utils/database');
const { buildTicketWelcome } = require('../utils/ticketWelcome');
const { tx } = require('./util');

const WARN_WAIT_MS = 12 * 3600 * 1000;

function findTicket(guildId, channelId) {
  const tickets = getGuild(guildId).tickets || {};
  const entry = Object.entries(tickets).find(([, t]) => t.channelId === channelId && !t.closed);
  return entry ? { id: entry[0], ticket: entry[1] } : null;
}
function isStaff(member, settings) {
  return !!member && (member.permissions.has(PermissionFlagsBits.Administrator) || (settings.ticketStaffRole && member.roles.cache.has(settings.ticketStaffRole)));
}

async function rebuild(interaction, client, found, settings, patch) {
  updateTicket(interaction.guild.id, found.id, patch);
  const t = { ...found.ticket, ...patch };
  const user = await client.users.fetch(t.userId).catch(() => interaction.user);
  return buildTicketWelcome({
    guild: interaction.guild, user, ticketId: found.id, categoryType: t.categoryType || tx(interaction.guild.id, 'Genel Destek', 'General Support'),
    staffRoleId: settings.ticketStaffRole, createdAt: t.createdAt, claimedBy: t.claimedBy || null, priority: t.priority || 'normal',
  });
}

async function handle(interaction, client) {
  const g = interaction.guild;
  if (!g) return;
  const gid = g.id;
  const settings = getGuild(gid);
  const found = findTicket(gid, interaction.channelId);
  if (!found) return interaction.reply({ content: tx(gid, ':aegis_no: Bu bir bilet kanalı değil.', ':aegis_no: This is not a ticket channel.'), flags: MessageFlags.Ephemeral }).catch(() => {});
  if (!isStaff(interaction.member, settings)) return interaction.reply({ content: tx(gid, ':aegis_lock: Bunu yalnızca destek ekibi yapabilir.', ':aegis_lock: Only the support team can do this.'), flags: MessageFlags.Ephemeral }).catch(() => {});

  if (interaction.customId === 'ticket_claim') {
    if (found.ticket.claimedBy && found.ticket.claimedBy !== interaction.user.id) return interaction.reply({ content: tx(gid, `:aegis_no: Bu talebi zaten <@${found.ticket.claimedBy}> üstlendi.`, `:aegis_no: <@${found.ticket.claimedBy}> already claimed this ticket.`), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(() => {});
    const payload = await rebuild(interaction, client, found, settings, { claimedBy: interaction.user.id });
    await interaction.update({ components: payload.components, files: payload.files, attachments: [], allowedMentions: { parse: [] } }).catch((e) => console.error('[ticket claim]', e.message));
    const c = new ContainerBuilder().setAccentColor(0x3ba55c).addTextDisplayComponents(new TextDisplayBuilder().setContent(tx(gid, `:aegis_ok: <@${interaction.user.id}> talebi üstlendi.`, `:aegis_ok: <@${interaction.user.id}> claimed this ticket.`)));
    return interaction.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }).catch(() => {});
  }
  if (interaction.customId === 'ticket_prio') {
    const value = interaction.values[0];
    if (!['normal', 'high', 'urgent'].includes(value)) return;
    const payload = await rebuild(interaction, client, found, settings, { priority: value });
    await interaction.update({ components: payload.components, files: payload.files, attachments: [], allowedMentions: { parse: [] } }).catch((e) => console.error('[ticket prio]', e.message));
    if (value === 'urgent') {
      const c = new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(tx(gid, `:aegis_alert: Bu talep **acil** olarak işaretlendi.${settings.ticketStaffRole ? ` <@&${settings.ticketStaffRole}>` : ''}`, `:aegis_alert: This ticket was marked **urgent**.${settings.ticketStaffRole ? ` <@&${settings.ticketStaffRole}>` : ''}`)));
      return interaction.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: settings.ticketStaffRole ? [settings.ticketStaffRole] : [] } }).catch(() => {});
    }
  }
}

/** Hareketsiz bileti kapatır: transkript log kanalına, açana DM, kanal silinir. */
async function closeInactive(guild, client, ticketId, ticket, hours) {
  const settings = getGuild(guild.id);
  const channel = guild.channels.cache.get(ticket.channelId) || await guild.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel) { closeTicket(guild.id, ticketId); return; }
  const { generateHtmlTranscript, generateTextTranscript } = require('../utils/ticketTranscript');
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => new Map());
  const logChannel = settings.ticketLogChannel ? guild.channels.cache.get(settings.ticketLogChannel) : null;
  if (logChannel) {
    try {
      const html = generateHtmlTranscript({ guild, channel, ticket, messages, closedBy: client.user });
      const files = [new AttachmentBuilder(Buffer.from(html, 'utf-8'), { name: `${ticketId}-transkript.html` }), new AttachmentBuilder(Buffer.from(generateTextTranscript(messages), 'utf-8'), { name: `${ticketId}-transkript.txt` })];
      const c = new ContainerBuilder().setAccentColor(0xf0b232).addTextDisplayComponents(new TextDisplayBuilder().setContent(
        tx(guild.id, `## :aegis_sleep: Bilet #${ticketId} otomatik kapandı\n<@${ticket.userId}> · ${hours} saat hareketsiz kaldı · ${messages.size} mesaj`, `## :aegis_sleep: Ticket #${ticketId} auto-closed\n<@${ticket.userId}> · silent for ${hours} hours · ${messages.size} messages`)));
      await logChannel.send({ components: [c], files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    } catch (e) { console.error('[ticket auto-close log]', e.message); }
  }
  closeTicket(guild.id, ticketId);
  try {
    const owner = await client.users.fetch(ticket.userId);
    await owner.send(tx(guild.id, `${guild.name}: destek talebin ${hours} saat boyunca hareketsiz kaldığı için kapatıldı. Hâlâ yardıma ihtiyacın varsa yeni bir talep açabilirsin.`, `${guild.name}: your ticket was closed after ${hours} hours without activity. If you still need help you can open a new one.`));
  } catch (_) {}
  await channel.delete('Ticket auto-closed (inactive)').catch(() => {});
}

/** 15 dakikada bir: hareketsiz biletleri uyarır, uyarıdan 12 saat sonra hâlâ sessizse kapatır. */
async function tick(client) {
  const db = readDB();
  const now = Date.now();
  for (const gid of Object.keys(db)) {
    if (gid.startsWith('_')) continue;
    const g = db[gid];
    const hours = g?.ticketAutoCloseHours || 0;
    if (!hours || !g.tickets) continue;
    const guild = client.guilds.cache.get(gid);
    if (!guild) continue;
    for (const [ticketId, ticket] of Object.entries(g.tickets)) {
      if (ticket.closed) continue;
      try {
        const channel = guild.channels.cache.get(ticket.channelId);
        if (!channel) { closeTicket(gid, ticketId); continue; }
        const lastTs = channel.lastMessageId ? Number((BigInt(channel.lastMessageId) >> 22n) + 1420070400000n) : (ticket.createdAt || now);
        if (ticket.autoWarnedAt) {
          if (lastTs > ticket.autoWarnedAt + 3000) { updateTicket(gid, ticketId, { autoWarnedAt: null }); continue; } // biri yazdı, süre sıfırlanır
          if (now - ticket.autoWarnedAt >= WARN_WAIT_MS) await closeInactive(guild, client, ticketId, ticket, hours);
          continue;
        }
        if (now - lastTs >= hours * 3600000) {
          const c = new ContainerBuilder().setAccentColor(0xf0b232).addTextDisplayComponents(new TextDisplayBuilder().setContent(
            tx(gid, `:aegis_sleep: Bu talep ${hours} saattir hareketsiz. **12 saat içinde** kimse yazmazsa otomatik kapanacak. Hâlâ yardıma ihtiyacın varsa bir mesaj yazman yeterli.`, `:aegis_sleep: This ticket has been silent for ${hours} hours. It will close automatically **in 12 hours** if nobody writes. If you still need help, just send a message.`)));
          await channel.send({ components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { users: [ticket.userId] } }).catch(() => {});
          updateTicket(gid, ticketId, { autoWarnedAt: now });
        }
      } catch (e) { console.error('[ticket auto-close]', e.message); }
    }
  }
}

module.exports = { handle, tick, findTicket, isStaff, closeInactive };
