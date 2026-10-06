const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const panel = require('../features/modlogPanel');

// Tek komut: /modlog → Components V2 panel (üye geçmişi, otomatik ceza)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('modlog')
    .setDescription('Moderasyon dosyası: üye geçmişi, otomatik ceza / Moderation file: history, auto penalty')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
  async execute(interaction) { return panel.open(interaction); },
};
