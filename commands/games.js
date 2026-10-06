const { SlashCommandBuilder } = require('discord.js');

// Tek komut: /games → oyun menüsü (müzik tahmin, kelime türetmece, sayı tahmin, doğruluk mu cesaret mi). features/gamesMenu.js
module.exports = {
  data: new SlashCommandBuilder()
    .setName('games')
    .setDescription('Oyun menüsü: istediğin oyunu aç / Game menu: open any game')
    .setDMPermission(false),
  async execute(interaction) { return require('../features/gamesMenu').open(interaction); },
};
