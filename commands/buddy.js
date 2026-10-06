const { SlashCommandBuilder } = require('discord.js');
const panel = require('../features/buddyPanel');

// Tek komut: /buddy → Components V2 panel (kart, paylaş, kurulum, isim, aç/kapat)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('buddy')
    .setDescription('Sunucunun maskotu: kart, kurulum ve ayarlar / Your server\'s mascot: card, setup and settings')
    .setDMPermission(false),
  async execute(interaction) { return panel.open(interaction); },
};
