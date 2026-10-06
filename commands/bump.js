const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const panel = require('../features/bumpPanel');

// Tek komut: /bump → Components V2 panel (hatırlatma kanalı, rol, aç/kapat)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('bump')
    .setDescription('Bump hatırlatıcı paneli / Bump reminder panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  async execute(interaction) { return panel.open(interaction); },
};
