const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const lock = require('../features/commandLock');

// /commandlock → Components V2 panel: bot komutlarını seçili kanallara kilitle
module.exports = {
  data: new SlashCommandBuilder()
    .setName('commandlock')
    .setDescription('Lock bot commands to chosen channels / Komutları kanallara kilitle')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  async execute(interaction) { return lock.open(interaction); },
};
