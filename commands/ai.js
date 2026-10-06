const { SlashCommandBuilder } = require('discord.js');

// Tek AI komutu: /ai → Components V2 panel (kurallara sor, kanalı özetle, sunucu raporu, haftalık kart). features/aiPanel.js
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Aegis yapay zeka paneli: sor, özetle, rapor / Aegis AI panel: ask, summarize, reports')
    .setDMPermission(false),
  async execute(interaction) { return require('../features/aiPanel').open(interaction); },
};
