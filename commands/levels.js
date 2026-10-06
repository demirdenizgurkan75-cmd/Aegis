const { SlashCommandBuilder } = require('discord.js');
const levels = require('../features/levels');

// Tek komut: /levels → yöneticiye seviye paneli, diğer üyelere sıralama (features/levels.js)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('Seviye sistemi: XP, seviye rolleri, sıralama / Levels: XP, role rewards, leaderboard')
    .setDMPermission(false),
  async execute(interaction) { return levels.open(interaction); },
};
