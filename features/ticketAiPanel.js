// Aegis open-source build: only the first 32 of 145 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * /ticket komutunun "yapay zeka" sekmesi (eskiden /ticket-ai). Sekmeler ticketHub.js'te; çeviri sekmesi ticketTranslatePanel.js.
 * Ticket AI asistanı paneli (yönetici). Durum, aç/kapat, otomatik karşılama, kimlere cevap verileceği ve deneme.
 * Eskiden bu komut yalnızca "test" yapıyordu ve ayardan bağımsız "hazır" diyordu; asistan kapalıysa bilet kanalında
 * sessiz kalıyordu ve Discord'dan açmanın yolu yoktu. customId'ler "ticketaiui:" ile başlar.
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { getGuild, updateGuild, checkTicketAiLimit } = require('../utils/database');
const { tx, banner } = require('./util');

const isAdmin = (m) => !!m?.permissions?.has(PermissionFlagsBits.Administrator) || !!m?.permissions?.has(PermissionFlagsBits.ManageGuild);
const txt = (s) => new TextDisplayBuilder().setContent(s);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const onOff = (v, gid) => (v ? `:aegis_on: **${tx(gid, 'açık', 'on')}**` : `:aegis_off: **${tx(gid, 'kapalı', 'off')}**`);

function getCfg(guildId) {
  const s = getGuild(guildId);
  const c = s.ticketAiConfig || {};
  return {
    enabled: !!s.ticketAiEnabled,
    autoReply: c.autoReply !== false,
    respondToUser: c.respondToUser !== false,
    respondToStaff: c.respondToStaff === true,
    ready: !!(s.ticketCategory && s.ticketStaffRole),
  };
}

/** Sekmeler ticketHub.js'te (kurulum / yapay zeka / çeviri). */
const tabRow = (gid, active) => require('./ticketHub').tabRow(gid, active);

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "open": (i) => require('../utils/ossStub').unavailable(i),
  "handle": (i) => require('../utils/ossStub').unavailable(i),
  "render": () => ({ components: [new (require('discord.js').ContainerBuilder)().addTextDisplayComponents(new (require('discord.js').TextDisplayBuilder)().setContent('Not included in the open-source build.'))] }),
  "getCfg": () => ({}),
  "tabRow": () => undefined,
});
