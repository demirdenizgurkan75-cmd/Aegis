const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const panel = require('../features/parolePanel');

// Tek komut: /parole → Components V2 panel (durum, aç/kapat, sayılar)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('parole')
    .setDescription('Kural sınavıyla timeout kısaltma paneli / Rules-quiz timeout parole panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  async execute(interaction) { return panel.open(interaction); },
};
