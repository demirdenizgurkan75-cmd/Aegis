const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  AttachmentBuilder,
} = require('discord.js');
const { getGuild, updateGuild } = require('../utils/database');
const { getGuildLanguage } = require('../utils/i18n');
const { safeClosePanel } = require('../utils/panelHelper');
const { banner } = require('../features/util');

function buildWelcomePanel(guild, settings) {
  const isEn = getGuildLanguage(guild.id) === 'en';
  const isEnabled = !!settings.welcomeEnabled;
  const channel = settings.welcomeChannel ? guild.channels.cache.get(settings.welcomeChannel) : null;
  const message = settings.welcomeMessage || 'Sunucuya hoş geldin {kullanici}!';

  const container = new ContainerBuilder()
    .setAccentColor(isEnabled ? 0x3ba55c : 0xf0b232);
  container.addMediaGalleryComponents(banner('welcome', 'Welcome messages'));

  // Başlık
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 👋 ${isEn ? 'Welcome System Management' : 'Karşılama Sistemi Yönetim Paneli'}\n` +
      `${isEn ? 'Configure automated welcome cards, messages, and channels in one place.' : 'Sunucuya katılan yeni üyeler için hoş geldin kartı, karşılama mesajı ve kanal kontrol merkezi.'}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // Bilgi & Durum
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `• **${isEn ? 'System Status' : 'Sistem Durumu'}:** ${isEnabled ? '🟢 ' + (isEn ? 'Active' : 'Aktif') : '🔴 ' + (isEn ? 'Disabled' : 'Kapalı')}\n` +
      `• **${isEn ? 'Goodbye card' : 'Ayrılma kartı'}:** ${settings.leaveCardEnabled ? '🟢 ' + (isEn ? 'On' : 'Açık') : '🔴 ' + (isEn ? 'Off' : 'Kapalı')}  ·  **${isEn ? 'Boost thank-you' : 'Boost teşekkürü'}:** ${settings.boostCardEnabled ? '🟢 ' + (isEn ? 'On' : 'Açık') : '🔴 ' + (isEn ? 'Off' : 'Kapalı')}\n` +
      `• **${isEn ? 'Welcome Channel' : 'Karşılama Kanalı'}:** ${channel ? `<#${channel.id}> (\`${channel.name}\`)` : (isEn ? '*Not configured (select below)*' : '*Ayarlanmamış (aşağıdan seçin)*')}\n\n` +
      `**${isEn ? 'Current Welcome Message' : 'Mevcut Karşılama Mesajı'}:**\n` +
      `> \`${message}\`\n\n` +
      `**${isEn ? 'Available Placeholders' : 'Kullanılabilir Değişkenler'}:**\n` +
      `• \`{kullanici}\` → ${isEn ? 'Member mention (@User)' : 'Yeni üyeyi etiketler (@Üye)'}\n` +
      `• \`{sunucu}\` → ${isEn ? 'Server name' : 'Sunucunun adı'}\n` +
      `• \`{uye-sayisi}\` → ${isEn ? 'Current server member count' : 'Toplam üye sayısı'}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // Butonlar
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`karsilama_toggle_${guild.id}`)
      .setLabel(isEnabled ? (isEn ? '🔴 Disable Welcome' : '🔴 Karşılamayı Kapat') : (isEn ? '🟢 Enable Welcome' : '🟢 Karşılamayı Aç'))
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`karsilama_edit_msg_${guild.id}`)
      .setLabel(isEn ? '✏️ Edit Message' : '✏️ Mesajı Düzenle')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`karsilama_test_${guild.id}`)
      .setLabel(isEn ? '🧪 Send Test Card' : '🧪 Test Kartı Gönder')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!channel),
    new ButtonBuilder()
      .setCustomId(`karsilama_close_${guild.id}`)
      .setLabel(isEn ? '✕ Close' : '✕ Kapat')
      .setStyle(ButtonStyle.Secondary)
  );

  // Kanal Seçim Menüsü
  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`karsilama_chan_${guild.id}`)
      .setPlaceholder(isEn ? 'Select welcome channel...' : 'Karşılama kanalını buradan seçin...')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

  const cardRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`karsilama_leave_${guild.id}`)
      .setLabel(settings.leaveCardEnabled ? (isEn ? 'Goodbye card: turn off' : 'Ayrılma kartı: kapat') : (isEn ? 'Goodbye card: turn on' : 'Ayrılma kartı: aç'))
      .setStyle(settings.leaveCardEnabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(!channel),
    new ButtonBuilder()
      .setCustomId(`karsilama_boost_${guild.id}`)
      .setLabel(settings.boostCardEnabled ? (isEn ? 'Boost thank-you: turn off' : 'Boost teşekkürü: kapat') : (isEn ? 'Boost thank-you: turn on' : 'Boost teşekkürü: aç'))
      .setStyle(settings.boostCardEnabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
  );

  container.addActionRowComponents(buttonRow, cardRow, channelRow);
  return container;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Karşılama sistemi yönetim paneli / Welcome control panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }

    const { guild } = interaction;
    const isEn = getGuildLanguage(guild.id) === 'en';

    const settings = getGuild(guild.id);
    const panel = buildWelcomePanel(guild, settings);
    const replyMsg = await interaction.reply({
      components: [panel],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = replyMsg.createMessageComponentCollector({
      filter: (i) => {
        if (!i.member.permissions.has(PermissionFlagsBits.Administrator) && i.user.id !== guild.ownerId) {
          i.reply({
            content: isEn ? '❌ Only administrators can interact with this panel.' : '❌ Bu paneli sadece yöneticiler kullanabilir.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
          return false;
        }
        return true;
      },
      time: 300_000,
    });

    collector.on('collect', async (i) => {
      if (i.__globalHandled) return; // genel işleyici zaten işledi (çift çalışma = aç/kapat geri dönerdi)
      try {
        // Toggle Aç / Kapat
        if (i.customId === `karsilama_toggle_${guild.id}`) {
          const curSettings = getGuild(guild.id);
          const newState = !curSettings.welcomeEnabled;
          updateGuild(guild.id, { welcomeEnabled: newState });
          const updatedSettings = getGuild(guild.id);
          const newPanel = buildWelcomePanel(guild, updatedSettings);
          return i.update({ components: [newPanel], flags: MessageFlags.IsComponentsV2 });
        }

        // Kanal Seçildi
        if (i.customId === `karsilama_chan_${guild.id}`) {
          const selectedChannelId = i.values[0];
          updateGuild(guild.id, {
            welcomeChannel: selectedChannelId,
            welcomeEnabled: true,
          });
          const updatedSettings = getGuild(guild.id);
          const newPanel = buildWelcomePanel(guild, updatedSettings);
          return i.update({ components: [newPanel], flags: MessageFlags.IsComponentsV2 });
        }

        // Mesajı Düzenle Modal
        if (i.customId === `karsilama_edit_msg_${guild.id}`) {
          const curSettings = getGuild(guild.id);
          const currentMsg = curSettings.welcomeMessage || 'Sunucuya hoş geldin {kullanici}!';
          return i.showModal({
            title: isEn ? 'Edit Welcome Message' : 'Karşılama Mesajını Düzenle',
            customId: 'karsilama_modal_msg',
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: 'welcome_text',
                    label: isEn ? 'Welcome Message Text' : 'Karşılama Mesajı Metni',
                    style: 2,
                    value: currentMsg,
                    required: true,
                    placeholder: '{kullanici}, {sunucu}, {uye-sayisi}',
                    max_length: 1000,
                  },
                ],
              },
            ],
          });
        }

        // Test Kartı Gönder
        if (i.customId === `karsilama_test_${guild.id}`) {
          await i.deferReply();
          try {
            const curSettings = getGuild(guild.id);
            const { buildWelcomeMessage } = require('../utils/welcomeMessage');
            const { fallbackText, fallbackFile, ...payload } = await buildWelcomeMessage(i.member, curSettings, { test: true });
            return i.editReply(payload);
          } catch (e) {
            console.error('[welcome test]', e.message);
            return i.editReply({ content: isEn ? ':aegis_sad: The test card could not be created.' : ':aegis_sad: Test kartı oluşturulamadı.' });
          }
        }

        // Kapat
        if (i.customId === `karsilama_close_${guild.id}`) {
          collector.stop('closed');
          return safeClosePanel(i, isEn ? 'Welcome panel closed.' : 'Karşılama paneli kapatıldı.');
        }
      } catch (err) {
        console.error('[Karsilama collector error]', err);
        if (!i.deferred && !i.replied) {
          await i.deferUpdate().catch(() => null);
        }
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'closed') return;
    });
  },
  buildWelcomePanel,
};
