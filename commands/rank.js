const { SlashCommandBuilder } = require('discord.js');
const levels = require('../features/levels');

// /rank [member] → seviye kartı + sıralama düğmesi (features/levels.js)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Seviye kartın ve sıralaman / Your level card and rank')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('member').setDescription('Kartına bakılacak üye / Member to look at').setRequired(false)),
  async execute(interaction) { return levels.rank(interaction); },
};
