const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');

// Mesaja sağ tık → Apps → Translate. Yönlendirme features/index.js içinde (aiTools.translate).
module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Translate')
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false),
  async execute(interaction) { return require('../features/aiTools').translate(interaction); },
};
