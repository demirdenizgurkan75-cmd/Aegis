const { SlashCommandBuilder } = require('discord.js');
const panel = require('../features/juryPanel');

// Tek komut: /jury → Components V2 panel (durum, havuza katıl, isabet tablosu, yönetici ayarları)
module.exports = {
  data: new SlashCommandBuilder()
    .setName('jury')
    .setDescription('Topluluk jürisi: durum, katıl ve ayarlar / Community jury: status, join and settings')
    .setDMPermission(false),
  async execute(interaction) { return panel.open(interaction); },
};
