const { SlashCommandBuilder } = require('discord.js');
const suggest = require('../features/suggest');

// Tek komut: /suggest → Components V2 panel (öneri yaz, kendi önerilerin; yöneticiye ayarlar)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Öneri yaz, topluluk oylasın / Post a suggestion, the community votes')
    .setDMPermission(false),
  async execute(interaction) { return suggest.open(interaction); },
};
