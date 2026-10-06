const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const gate = require('../features/gate');

// Tek komut: /gate → Components V2 panel (kanal, rol, kapı mesajı, aç/kapat)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('gate')
    .setDescription('Kural sınavıyla sunucuya giriş kapısı / Rules-quiz gate to enter your server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  async execute(interaction) { return gate.open(interaction); },
};
