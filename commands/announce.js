const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getGuildLanguage } = require('../utils/i18n');
const { posterCard } = require('../utils/canvas/cards');
const { cardPayload } = require('../utils/cardMessage');

// /announce: başlık, tarih ve yer yazılır; etkinlik afişi üretilip kanala gönderilir.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Etkinlik afişi oluştur ve gönder / Create and post an event poster')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addStringOption((o) => o.setName('baslik').setDescription('Etkinlik adı / Event title').setMaxLength(60).setRequired(true))
    .addStringOption((o) => o.setName('tarih').setDescription('Tarih ve saat (örn: Cuma 21:00) / Date and time').setMaxLength(40).setRequired(true))
    .addStringOption((o) => o.setName('yer').setDescription('Yer (örn: Ses kanalı, #etkinlik) / Place').setMaxLength(40).setRequired(false))
    .addStringOption((o) => o.setName('aciklama').setDescription('Kısa açıklama / Short description').setMaxLength(200).setRequired(false))
    .addChannelOption((o) => o.setName('kanal').setDescription('Gönderilecek kanal (boşsa bu kanal) / Target channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
    .addRoleOption((o) => o.setName('rol').setDescription('Etiketlenecek rol / Role to ping').setRequired(false)),

  async execute(interaction) {
    const guild = interaction.guild;
    const isEn = getGuildLanguage(guild.id) === 'en';
    const eph = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    const channel = interaction.options.getChannel('kanal') || interaction.channel;
    const role = interaction.options.getRole('rol');

    const me = guild.members.me;
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles])) {
      return eph(isEn ? `:aegis_no: I need to send messages and attach files in ${channel}.` : `:aegis_no: ${channel} kanalında mesaj göndermem ve dosya eklemem gerekiyor.`);
    }
    // @everyone etiketlenemez; rol etiketi yalnızca yöneticinin açıkça seçtiği rol için
    if (role && role.id === guild.id) return eph(isEn ? ':aegis_no: @everyone cannot be pinged here.' : ':aegis_no: @everyone burada etiketlenemez.');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const png = posterCard({
      title: interaction.options.getString('baslik'), date: interaction.options.getString('tarih'),
      place: interaction.options.getString('yer'), desc: interaction.options.getString('aciklama'), isEn,
    });
    const payload = cardPayload(png, { name: 'event.png', text: role ? `${role}` : '' });
    payload.allowedMentions = role ? { roles: [role.id] } : { parse: [] };
    const sent = await channel.send(payload).catch(() => null);
    return interaction.editReply({ content: sent
      ? (isEn ? `:aegis_ok: The poster was posted in ${channel}.` : `:aegis_ok: Afiş ${channel} kanalına gönderildi.`)
      : (isEn ? ':aegis_sad: I could not post the poster.' : ':aegis_sad: Afişi gönderemedim.') });
  },
};
