const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const sticky = require('../features/sticky');

// Tek komut: /sticky → Components V2 panel (kanalın altında duran sabit mesaj)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Kanalın altında duran sabit mesaj / Message that stays at the bottom of a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),
  async execute(interaction) { return sticky.open(interaction); },
};
