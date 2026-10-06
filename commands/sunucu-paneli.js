const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuild, updateGuild } = require('../utils/database');
const { createTranslator, getGuildLanguage } = require('../utils/i18n');
const { safeClosePanel } = require('../utils/panelHelper');

function buildPanelCommand(name) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(name === 'server-panel' ? 'Sunucu yönetim merkezi / Server management center' : 'Sunucu yönetim ve kontrol paneli / Server control center')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
}

module.exports = {
  data: buildPanelCommand('server-panel'),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Bu komut sadece sunucularda kullanılabilir / This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    const { guild } = interaction;
    const settings = getGuild(guild.id);
    const lang = getGuildLanguage(guild.id);
    const isEn = lang === 'en';
    const t = createTranslator(guild.id);

    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

    const buildMainPanel = () => {
      const container = new ContainerBuilder().setAccentColor(0x0066ff);

      const memberCount = guild.memberCount;
      const botCount = guild.members.cache.filter(m => m.user.bot).size;
      const humanCount = memberCount - botCount;
      const channelCount = guild.channels.cache.size;
      const roleCount = guild.roles.cache.size;
      const emojiCount = guild.emojis.cache.size;
      const boostCount = guild.premiumSubscriptionCount || 0;
      const boostTier = guild.premiumTier || 0;
      const owner = guild.members.cache.get(guild.ownerId);

      // Paket etkinleştirilmemişse otomatik 'free'; davet ödülü varsa süresi boyunca 'filo-komutani'
      const pkg = require('../utils/tier').packageInfo(guild.id);
      const activePackageId = pkg.id;

      // Başlık
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(t('sunucu.title', { guild: guild.name }))
      );

      container.addSeparatorComponents(new SeparatorBuilder());

      // İstatistikler
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 📊 ${t('sunucu.stats')}\n` +
          `**👥 ${t('sunucu.members')}:** ${humanCount} (${botCount} bot)\n` +
          `**📁 ${t('sunucu.channels')}:** ${channelCount}\n` +
          `**🎭 ${t('sunucu.roles')}:** ${roleCount}\n` +
          `**😀 ${t('sunucu.emojis')}:** ${emojiCount}\n` +
          `**💎 Boost:** ${boostCount} (Tier ${boostTier})\n` +
          `**👑 ${t('sunucu.owner')}:** ${owner ? `<@${owner.id}>` : t('common.unknown')}`
        )
      );

      container.addSeparatorComponents(new SeparatorBuilder());

      // Paket durumu
      const pkgName = pkg.rewardUntil
        ? `${pkg.name} (${isEn ? 'referral reward, until' : 'davet ödülü,'} <t:${Math.floor(pkg.rewardUntil / 1000)}:D>${isEn ? '' : ' tarihine kadar'})`
        : pkg.name;

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          (isEn ? `## 📦 Package Status\n` : `## 📦 Paket Durumu\n`) +
          (isEn ? `**Active Package:** ${pkgName}\n` : `**Aktif Paket:** ${pkgName}\n`) +
          `${activePackageId !== 'free' ? `**${isEn ? 'Unlimited AI' : 'Sınırsız AI'}** ${activePackageId === 'galaksi-imparatoru' ? '✅' : '❌'}\n` : ''}` +
          `**Ticket AI Limit:** ${activePackageId === 'galaksi-imparatoru' ? (isEn ? '∞ Unlimited' : '∞ Sınırsız') : activePackageId === 'filo-komutani' ? (isEn ? '10,000/day' : '10,000/gün') : activePackageId === 'onculer' ? (isEn ? '5,000/day' : '5,000/gün') : (isEn ? '1,000/day (Free)' : '1,000/gün (Free)')}`
        )
      );

      container.addSeparatorComponents(new SeparatorBuilder());

      // Otorol
      const autoroleRole = settings.autoRoleId ? guild.roles.cache.get(settings.autoRoleId) : null;
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${isEn ? 'Auto Role' : 'Otorol'}**\n` +
              `${autoroleRole ? `<@&${autoroleRole.id}>` : (isEn ? 'Not configured' : 'Ayarlanmamış')}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId('panel_autorole')
              .setLabel(autoroleRole ? (isEn ? 'Change' : 'Değiştir') : (isEn ? 'Configure' : 'Ayarla'))
              .setStyle(ButtonStyle.Secondary)
          )
      );

      // Hoşgeldin
      const welcomeChannel = settings.welcomeChannel ? guild.channels.cache.get(settings.welcomeChannel) : null;
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${isEn ? 'Welcome Message' : 'Hoşgeldin Mesajı'}**\n` +
              `${welcomeChannel ? `<#${welcomeChannel.id}>` : (isEn ? 'Not configured' : 'Ayarlanmamış')}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId('panel_welcome')
              .setLabel(welcomeChannel ? (isEn ? 'Change' : 'Değiştir') : (isEn ? 'Configure' : 'Ayarla'))
              .setStyle(ButtonStyle.Secondary)
          )
      );

      // Anti-Raid
      const antiRaidStatus = settings.antiRaid ? (isEn ? 'Enabled ✅' : 'Açık ✅') : (isEn ? 'Disabled ❌' : 'Kapalı ❌');
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${isEn ? 'Anti-Raid Protection' : 'Anti-Raid Koruması'}**\n` +
              `${antiRaidStatus}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId('panel_antiraid')
              .setLabel(settings.antiRaid ? (isEn ? 'Disable' : 'Kapat') : (isEn ? 'Enable' : 'Aç'))
              .setStyle(settings.antiRaid ? ButtonStyle.Danger : ButtonStyle.Success)
          )
      );

      // AutoMod
      const autoModStatus = settings.autoMod ? (isEn ? 'Enabled ✅' : 'Açık ✅') : (isEn ? 'Disabled ❌' : 'Kapalı ❌');
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**AutoMod**\n` +
              `${autoModStatus}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId('panel_automod')
              .setLabel(settings.autoMod ? (isEn ? 'Disable' : 'Kapat') : (isEn ? 'Enable' : 'Aç'))
              .setStyle(settings.autoMod ? ButtonStyle.Danger : ButtonStyle.Success)
          )
      );

      // Ticket
      const ticketCategory = settings.ticketCategory ? guild.channels.cache.get(settings.ticketCategory) : null;
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${isEn ? 'Ticket System' : 'Ticket Sistemi'}**\n` +
              `${ticketCategory ? `<#${ticketCategory.id}>` : (isEn ? 'Not configured' : 'Ayarlanmamış')}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId('panel_ticket')
              .setLabel(ticketCategory ? (isEn ? 'Change' : 'Değiştir') : (isEn ? 'Configure' : 'Ayarla'))
              .setStyle(ButtonStyle.Secondary)
          )
      );

      // Link Sandbox
      const linkSandboxStatus = settings.linkSandbox ? (isEn ? 'Enabled ✅' : 'Açık ✅') : (isEn ? 'Disabled ❌' : 'Kapalı ❌');
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${isEn ? 'Link Sandbox (Safe Link Scan)' : 'Link Sandbox (Güvenli Link Tarama)'}**\n` +
              `${linkSandboxStatus}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId('panel_linksandbox')
              .setLabel(settings.linkSandbox ? (isEn ? 'Disable' : 'Kapat') : (isEn ? 'Enable' : 'Aç'))
              .setStyle(settings.linkSandbox ? ButtonStyle.Danger : ButtonStyle.Success)
          )
      );

      // AI Moderation
      const aiModStatus = settings.aiModeration ? (isEn ? 'Enabled ✅' : 'Açık ✅') : (isEn ? 'Disabled ❌' : 'Kapalı ❌');
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${isEn ? 'AI Moderation (Tone Analysis)' : 'AI Moderation (Ton Analizi)'}**\n` +
              `${aiModStatus}`
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId('panel_aimod')
              .setLabel(settings.aiModeration ? (isEn ? 'Disable' : 'Kapat') : (isEn ? 'Enable' : 'Aç'))
              .setStyle(settings.aiModeration ? ButtonStyle.Danger : ButtonStyle.Success)
          )
      );

      container.addSeparatorComponents(new SeparatorBuilder());

      // Footer butonlar
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('panel_refresh').setLabel(isEn ? '🔄 Refresh' : '🔄 Yenile').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setLabel('🌐 Web Dashboard').setStyle(ButtonStyle.Link).setURL('https://betterwithaegis.com/dashboard'),
          new ButtonBuilder().setCustomId('panel_close').setLabel(isEn ? '✕ Close' : '✕ Kapat').setStyle(ButtonStyle.Danger),
        )
      );

      return container;
    };

    const container = buildMainPanel();
    const msg = await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async i => {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator) && i.user.id !== guild.ownerId) {
        return i.reply({
          content: isEn ? '❌ Only administrators can interact with this panel.' : '❌ Bu paneli sadece yöneticiler kullanabilir.',
          flags: MessageFlags.Ephemeral
        });
      }

      // Toggle handlers
      const toggles = {
        panel_antiraid: { key: 'antiRaid', name: 'Anti-Raid' },
        panel_automod: { key: 'autoMod', name: 'AutoMod' },
        panel_linksandbox: { key: 'linkSandbox', name: 'Link Sandbox' },
        panel_aimod: { key: 'aiModeration', name: 'AI Moderation' },
      };

      if (toggles[i.customId]) {
        const { key } = toggles[i.customId];
        const newVal = !settings[key];
        updateGuild(guild.id, { [key]: newVal });
        settings[key] = newVal;
        const newContainer = buildMainPanel();
        return i.update({ components: [newContainer], flags: MessageFlags.IsComponentsV2 });
      }

      // Refresh
      if (i.customId === 'panel_refresh') {
        const newContainer = buildMainPanel();
        return i.update({ components: [newContainer], flags: MessageFlags.IsComponentsV2 });
      }

      // Close
      if (i.customId === 'panel_close') {
        collector.stop('closed');
        return safeClosePanel(i, isEn ? 'Server panel closed.' : 'Sunucu paneli kapatıldı.');
      }

      // Ayarla/Değiştir butonları - Modal aç
      const modalMap = {
        panel_autorole: {
          title: isEn ? 'Configure Auto-Role' : 'Otorol Ayarla',
          customId: 'panel_modal_autorole',
          components: [
            { type: 1, components: [{ type: 4, custom_id: 'role_id', label: isEn ? 'Role ID' : 'Rol ID', style: 1, required: true, placeholder: '123456789012345678' }] },
          ],
        },
        panel_welcome: {
          title: isEn ? 'Configure Welcome Message' : 'Hoşgeldin Ayarla',
          customId: 'panel_modal_welcome',
          components: [
            { type: 1, components: [{ type: 4, custom_id: 'channel_id', label: isEn ? 'Channel ID' : 'Kanal ID', style: 1, required: true, placeholder: '123456789012345678' }] },
            { type: 1, components: [{ type: 4, custom_id: 'message', label: isEn ? 'Message (optional)' : 'Mesaj (opsiyonel)', style: 2, required: false, max_length: 1000 }] },
          ],
        },
        panel_ticket: {
          title: isEn ? 'Configure Ticket System' : 'Ticket Ayarla',
          customId: 'panel_modal_ticket',
          components: [
            { type: 1, components: [{ type: 4, custom_id: 'category_id', label: isEn ? 'Category ID' : 'Kategori ID', style: 1, required: true, placeholder: '123456789012345678' }] },
            { type: 1, components: [{ type: 4, custom_id: 'staff_role_id', label: isEn ? 'Staff Role ID' : 'Yetkili Rol ID', style: 1, required: true, placeholder: '123456789012345678' }] },
            { type: 1, components: [{ type: 4, custom_id: 'log_channel_id', label: isEn ? 'Log Channel ID' : 'Log Kanal ID', style: 1, required: true, placeholder: '123456789012345678' }] },
          ],
        },
      };

      if (modalMap[i.customId]) {
        return i.showModal(modalMap[i.customId]);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'closed') return;
    });
  },
};
