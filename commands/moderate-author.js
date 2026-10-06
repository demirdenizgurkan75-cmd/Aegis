const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');

// Mesaja sağ tık → Apps → "Moderate Author". Yönlendirme features/index.js içinde (features/quickMod.js).
module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Moderate Author')
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false),
  async execute(interaction) { return require('../features/quickMod').open(interaction); },
};
