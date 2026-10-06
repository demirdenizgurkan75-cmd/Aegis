const { SlashCommandBuilder } = require('discord.js');
const appeal = require('../features/appeal');

// Tek komut: /appeal → Components V2 panel (cezayı seç, gerekçeni yaz, jüri karar versin)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('appeal')
    .setDescription('Bir cezaya jüriye itiraz et / Appeal a penalty to the community jury')
    .setDMPermission(false),
  async execute(interaction) { return appeal.open(interaction); },
};
