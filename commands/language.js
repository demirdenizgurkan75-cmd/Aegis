const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
const { setGuildLanguage, createTranslator, resolveLocale, LOCALES } = require('../utils/i18n');

// Discord seçeneklerde en fazla 25 sabit seçim izin verir; 30 dil için otomatik tamamlama kullanılır.
function buildLangCommand(name, optName) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription('Bot dilini değiştir (30 dil) / Change bot language (30 languages)')
    .addStringOption(option =>
      option.setName(optName)
        .setDescription('Dil / Language (tr, en, pt-BR, ru, es, fr, de, ja ...)')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
}

module.exports = {
  data: buildLangCommand('language', 'language'),

  async autocomplete(interaction) {
    const focused = String(interaction.options.getFocused() || '').toLowerCase();
    const list = Object.entries(LOCALES)
      .filter(([code, label]) => !focused || code.toLowerCase().includes(focused) || label.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(([code, label]) => ({ name: `${label} (${code})`, value: code }));
    return interaction.respond(list).catch(() => {});
  },

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: '❌ Bu komut sadece bir sunucuda kullanılabilir / This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    const rawLang = interaction.options.getString('dil') || interaction.options.getString('language') || interaction.options.getString('lang');
    const resolved = resolveLocale(rawLang);
    if (!resolved) {
      const list = Object.entries(LOCALES).map(([c, l]) => `\`${c}\` ${l}`).join(' · ');
      return interaction.reply({ content: `:aegis_confused: Unknown language / Bilinmeyen dil.\n${list}`, flags: MessageFlags.Ephemeral });
    }

    setGuildLanguage(guild.id, resolved);
    const t = createTranslator(guild.id);
    const name = LOCALES[resolved];

    const container = new ContainerBuilder().setAccentColor(0x0066ff)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🌐 ${t('lang.changed', { name })}`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> \`${resolved}\` · ${name}\n` +
          '-# Çevrilmiş metinler seçtiğin dilde, henüz çevrilmemiş metinler İngilizce (Türkçe sunucularda Türkçe) görünür. / Untranslated texts fall back to English.'
        )
      );

    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
