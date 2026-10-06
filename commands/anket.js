const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { parseDuration } = require('../utils/duration');
const { createTranslator } = require('../utils/i18n');
const { registerPoll, buildPollContainer } = require('../utils/pollManager');

const MAX_OPTIONS = 10;
const MIN_OPTIONS = 2;
const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_DURATION_MS = 10 * 1000;
const DEFAULT_DURATION_MS = 24 * 60 * 60 * 1000;

function buildPollCommand(name) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription('Anket oluştur / Create a poll')
    .setDMPermission(false)
    .addStringOption(opt => opt.setName('soru').setDescription('Anket sorusu / Poll question').setRequired(true).setMaxLength(300))
    .addStringOption(opt => opt.setName('secenekler').setDescription('Seçenekler (, veya | ile ayır, en fazla 10) / Options (split by , or |)').setRequired(true).setMaxLength(600))
    .addChannelOption(opt => opt.setName('kanal').setDescription('Anket kanalı / Poll channel').setRequired(false))
    .addStringOption(opt => opt.setName('sure').setDescription('Süre (örn: 1d, 2h, en fazla 30d) / Duration (e.g. 1d, 2h)').setRequired(false))
    .addIntegerOption(opt => opt.setName('max-secim').setDescription('Kişi başı en fazla seçim (1-5) / Max choices per person').setRequired(false).setMinValue(1).setMaxValue(5))
    .addBooleanOption(opt => opt.setName('anonim').setDescription('Oy verenler gizli kalsın / Anonymous votes').setRequired(false))
    .addRoleOption(opt => opt.setName('rol').setDescription('Sadece bu role sahip olanlar oy verebilir / Role required to vote').setRequired(false));
}

const fail = (text) => ({
  components: [new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌\n\n${text}`))],
  flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
});

module.exports = {
  data: buildPollCommand('poll'),

  async execute(interaction) {
    const { guild, channel } = interaction;
    const t = createTranslator(guild ? guild.id : null);
    const question = interaction.options.getString('soru') || interaction.options.getString('question');
    const optionsStr = interaction.options.getString('secenekler') || interaction.options.getString('options');
    const targetChannel = interaction.options.getChannel('kanal') || interaction.options.getChannel('channel') || channel;
    const durationStr = interaction.options.getString('sure') || interaction.options.getString('duration');
    const maxChoices = interaction.options.getInteger('max-secim') || 1;
    const anonymous = !!interaction.options.getBoolean('anonim');
    const role = interaction.options.getRole('rol');

    const separator = optionsStr.includes('|') ? '|' : ',';
    const options = [...new Set(optionsStr.split(separator).map((s) => s.trim()).filter(Boolean))];

    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      return interaction.reply(fail(t('anket.invalid_options', { min: MIN_OPTIONS, max: MAX_OPTIONS })));
    }

    let durationMs = DEFAULT_DURATION_MS;
    if (durationStr) {
      const parsed = parseDuration(durationStr);
      if (!parsed || parsed < MIN_DURATION_MS || parsed > MAX_DURATION_MS) return interaction.reply(fail(t('anket.invalid_duration')));
      durationMs = parsed;
    }

    const poll = {
      id: null,
      guildId: guild.id,
      channelId: targetChannel.id,
      hostId: interaction.user.id,
      hostTag: interaction.user.tag,
      question,
      options,
      votes: {},
      maxChoices: Math.min(maxChoices, options.length),
      anonymous,
      roleId: role ? role.id : null,
      createdAt: Date.now(),
      endAt: Date.now() + durationMs,
      ended: false,
    };

    const message = await targetChannel
      .send({ components: [buildPollContainer(poll, t, poll.hostTag)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } })
      .catch(() => null);
    if (!message) return interaction.reply(fail('Anket kanalına mesaj gönderilemedi. İzinleri kontrol edin. / Could not send the poll. Check permissions.'));

    poll.id = message.id;
    registerPoll(poll, interaction.client);

    return interaction.reply({
      components: [
        new ContainerBuilder().setAccentColor(0x16a34a).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ✅\n\n${t('anket.created', { channel: targetChannel.toString() })}`)
        ),
      ],
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
    });
  },
};
