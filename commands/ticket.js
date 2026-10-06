const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const hub = require('../features/ticketHub');

// Tek komut: /ticket → üç sekmeli panel: kurulum (kategori, yetkili, log, panel gönder), yapay zeka asistanı, canlı çeviri
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Destek biletleri: kurulum, yapay zeka, çeviri / Tickets: setup, AI, translation')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
  async execute(interaction) { return hub.open(interaction); },
};
