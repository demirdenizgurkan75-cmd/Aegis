const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { getWarnings } = require('../utils/database');
const { getGuildLanguage } = require('../utils/i18n');
const { profileCard } = require('../utils/canvas/cards');
const { cardPayload } = require('../utils/cardMessage');

// /profile [üye]: avatar, rol, uyarı sayısı ve üyelik süresi tek kartta.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Üye profil kartı / Member profile card')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('kullanici').setDescription('Profiline bakılacak üye / Member to look at').setRequired(false)),

  async execute(interaction) {
    const guild = interaction.guild;
    const isEn = getGuildLanguage(guild.id) === 'en';
    const user = interaction.options.getUser('kullanici') || interaction.user;
    if (user.bot) return interaction.reply({ content: isEn ? ':aegis_confused: Bots do not have profiles.' : ':aegis_confused: Botların profili yok.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply();
    const member = await guild.members.fetch(user.id).catch(() => null);
    const warns = getWarnings(guild.id, user.id).length;
    const days = member?.joinedTimestamp ? Math.max(1, Math.floor((Date.now() - member.joinedTimestamp) / 86400000)) : null;
    const num = (n) => Number(n).toLocaleString(isEn ? 'en-US' : 'tr-TR');
    const top = member?.roles.highest && member.roles.highest.id !== guild.id ? member.roles.highest : null;

    const png = await profileCard({
      name: member?.displayName || user.displayName || user.username,
      handle: `@${user.username}`,
      avatarUrl: (member || user).displayAvatarURL({ extension: 'png', size: 256 }),
      roleName: top?.name, roleColor: top?.hexColor,
      badge: member?.premiumSince ? (isEn ? 'Booster' : 'Booster') : null,
      mood: warns >= 3 ? 'sad' : 'happy',
      stats: [
        { k: isEn ? 'Days in server' : 'Sunucuda gün', v: days ? num(days) : '—' },
        { k: isEn ? 'Account age (days)' : 'Hesap yaşı (gün)', v: num(Math.max(1, Math.floor((Date.now() - user.createdTimestamp) / 86400000))) },
        { k: isEn ? 'Roles' : 'Rol sayısı', v: member ? String(Math.max(0, member.roles.cache.size - 1)) : '—' },
        { k: isEn ? 'Warnings' : 'Uyarı', v: String(warns) },
      ],
      isEn,
    });
    const payload = cardPayload(png, { name: 'profile.png', text: `-# ${isEn ? 'Account created' : 'Hesap'} <t:${Math.floor(user.createdTimestamp / 1000)}:D>` });
    return interaction.editReply(payload);
  },
};
