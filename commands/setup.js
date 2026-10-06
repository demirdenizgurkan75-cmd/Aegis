const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
const { getGuild, updateGuild, DEFAULT_BANNED_WORDS } = require('../utils/database');
const { PACKAGES } = require('../utils/packages');
const { createTranslator, getGuildLanguage, setGuildLanguage } = require('../utils/i18n');
const fs = require('fs');
const path = require('path');

// "Öncüler" paketi sadece temel 5 log kanalını alır, üst paketler tam donanımı alır.
const BASIC_TIER_CHANNEL_KEYS = ['joinLeaveLogChannel', 'messageLogChannel', 'banKickLogChannel', 'logChannel', 'ticketLogChannel'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Tek tıkla otomatik sunucu kurulumu / Automatic server setup')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: ':aegis_no: Bu komut yalnızca sunucularda kullanılabilir. / This command only works in a server.', flags: 64 });
    const isEn0 = getGuildLanguage(guild.id) === 'en';
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        content: isEn0 ? ':aegis_no: I need the **Manage Channels** permission to set up the server. Give it to my role and run `/setup` again.' : ':aegis_no: Kurulum için **Kanalları Yönet** yetkisine ihtiyacım var. Bot rolüme ver ve `/setup` komutunu tekrar çalıştır.',
        flags: 64,
      });
    }
    try {
      return await this.runSetup(interaction, client);
    } catch (err) {
      // Yarım kalan kurulum bir sonraki /setup ile kaldığı yerden devam eder
      console.error('[setup]', err.message);
      const msg = isEn0
        ? ':aegis_sad: The setup stopped halfway (usually a missing permission). Fix my permissions and run `/setup` again; it continues where it stopped.'
        : ':aegis_sad: Kurulum yarıda kaldı (genelde eksik yetki yüzünden). Yetkilerimi düzeltip `/setup` komutunu tekrar çalıştır; kaldığı yerden devam eder.';
      if (interaction.deferred || interaction.replied) return interaction.editReply({ content: msg }).catch(() => {});
      return interaction.reply({ content: msg, flags: 64 }).catch(() => {});
    }
  },

  async runSetup(interaction, client) {
    const guild = interaction.guild;
    const settings = getGuild(guild.id);
    const t = createTranslator(guild.id);
    const lang = getGuildLanguage(guild.id);

    // Kurulum "tamam" sayılması için kategori ve temel kanalların hepsi var olmalı; eksik varsa devam edilir.
    const CORE_KEYS = ['joinLeaveLogChannel', 'messageLogChannel', 'banKickLogChannel', 'logChannel', 'ticketLogChannel'];
    const categoryExists = settings.logCategory && guild.channels.cache.has(settings.logCategory)
      && CORE_KEYS.every((k) => settings[k] && guild.channels.cache.has(settings[k]));
    if (categoryExists) {
      return interaction.reply({
        content: t('setup.already_setup'),
        flags: 64,
      });
    }

    await interaction.deferReply({ flags: 64 });

    // Paket seviyesi: aktif paket yoksa (hiç satın alınmamışsa) varsayılan olarak tam donanım kurulur
    // (ücretsiz deneme sürümü tam özellikli). "Öncüler" paketi aktifse kanallar kısıtlanır.
    const activePkg = PACKAGES.find(p => p.id === settings.activePackageId);
    // Ücretli paketler ücretsiz seviyeden az kanal almaz: herkes tam kurulumu alır.
    const isBasicTier = false;

    const staffOnlyOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
    ];
    const publicReadOnlyOverwrites = [
      { id: guild.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
    ];

    // 1) Kategori oluştur
    let logCategory = guild.channels.cache.get(settings.logCategory);
    if (!logCategory) {
      logCategory = await guild.channels.create({
        name: 'aegis-logs',
        type: ChannelType.GuildCategory,
        permissionOverwrites: staffOnlyOverwrites,
        reason: 'Aegis Guard kurulumu',
      });
      updateGuild(guild.id, { logCategory: logCategory.id });
    }

    // Kanal adları sunucu diline göre (İngilizce sunucuda İngilizce adlar)
    const EN_NAMES = {
      'gelen-giden': 'join-leave', 'mesaj-log': 'message-log', 'ban-kick-log': 'ban-kick-log', 'genel-log': 'general-log',
      'ticket-log': 'ticket-log', 'rol-log': 'role-log', 'ses-log': 'voice-log', 'nickname-log': 'nickname-log',
      'kanal-log': 'channel-log', 'mute-log': 'mute-log', 'davet-log': 'invite-log', 'oyun-aktivite': 'game-activity',
      'durum-log': 'status-log', 'hos-geldiniz': 'welcome', 'duyurular': 'announcements',
    };
    const localName = (n) => (lang === 'en' ? (EN_NAMES[n] || n) : n);

    // 2) Kanal oluşturma fonksiyonu
    async function createLogChannel(name, key, overwrites = staffOnlyOverwrites) {
      name = localName(name);
      const existing = settings[key] && guild.channels.cache.has(settings[key]);
      if (existing) return guild.channels.cache.get(settings[key]);

      const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: logCategory.id,
        permissionOverwrites: overwrites,
        reason: 'Aegis Guard kurulumu',
      });
      updateGuild(guild.id, { [key]: channel.id });
      return channel;
    }

    // 3) Temel kanallar (her pakette)
    await createLogChannel('gelen-giden', 'joinLeaveLogChannel');
    await createLogChannel('mesaj-log', 'messageLogChannel');
    await createLogChannel('ban-kick-log', 'banKickLogChannel');
    await createLogChannel('genel-log', 'logChannel');
    await createLogChannel('ticket-log', 'ticketLogChannel');

    // 4) Tam donanım paketinde ek kanallar
    if (!isBasicTier) {
      await createLogChannel('rol-log', 'roleLogChannel');
      await createLogChannel('ses-log', 'voiceLogChannel');
      await createLogChannel('nickname-log', 'nicknameLogChannel');
      await createLogChannel('kanal-log', 'channelLogChannel');
      await createLogChannel('mute-log', 'muteLogChannel');
      await createLogChannel('davet-log', 'inviteLogChannel');
      await createLogChannel('oyun-aktivite', 'gameActivityLogChannel');
      await createLogChannel('durum-log', 'statusLogChannel');
    }

    // 5) Karşılama kanalı
    let welcomeChannel = settings.welcomeChannel && guild.channels.cache.get(settings.welcomeChannel);
    if (!welcomeChannel) {
      welcomeChannel = await guild.channels.create({
        name: localName('hos-geldiniz'),
        type: ChannelType.GuildText,
        permissionOverwrites: publicReadOnlyOverwrites,
        reason: 'Aegis Guard kurulumu',
      });
      updateGuild(guild.id, { welcomeChannel: welcomeChannel.id, welcomeEnabled: true });
    }

    // 6) Duyuru kanalı
    let announcementChannel = settings.announcementChannel && guild.channels.cache.get(settings.announcementChannel);
    if (!announcementChannel) {
      announcementChannel = await guild.channels.create({
        name: localName('duyurular'),
        type: ChannelType.GuildText,
        permissionOverwrites: publicReadOnlyOverwrites,
        reason: 'Aegis Guard kurulumu',
      });
      updateGuild(guild.id, { announcementChannel: announcementChannel.id });
    }

    // 7) Ticket kategorisi
    let ticketCategory = settings.ticketCategory && guild.channels.cache.get(settings.ticketCategory);
    if (!ticketCategory) {
      ticketCategory = await guild.channels.create({
        name: 'tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: staffOnlyOverwrites,
        reason: 'Aegis Guard kurulumu',
      });
      updateGuild(guild.id, { ticketCategory: ticketCategory.id });
    }

    // 8) Ticket log kanalı
    await createLogChannel('ticket-log', 'ticketLogChannel');

    // 9) Ticket transcript kanalı
    await createLogChannel('ticket-transcript', 'ticketTranscriptChannel');

    // Başarılı container (Components V2)
    const container = new ContainerBuilder()
      .setAccentColor(0x3ba55c);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${t('setup.done')}`)
    );

    container.addSeparatorComponents(new SeparatorBuilder());

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('setup.done_desc'))
    );

    container.addSeparatorComponents(new SeparatorBuilder());

    const isEn = lang === 'en';
    const summaryText = isEn
      ? `**Category:** <#${logCategory.id}>\n**Welcome:** <#${welcomeChannel.id}>\n**Announcements:** <#${announcementChannel.id}>\n**Ticket Category:** <#${ticketCategory.id}>\n**Package Tier:** ${isBasicTier ? 'Pioneers (Basic)' : 'Full Suite'}`
      : `**Kategori:** <#${logCategory.id}>\n**Karşılama:** <#${welcomeChannel.id}>\n**Duyurular:** <#${announcementChannel.id}>\n**Ticket Kategorisi:** <#${ticketCategory.id}>\n**Paket Seviyesi:** ${isBasicTier ? 'Verse' : 'Tam Donanım'}`;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(summaryText)
    );

    container.addSeparatorComponents(new SeparatorBuilder());

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(isEn ? 'Aegis Guard • Configure further via Web Dashboard' : 'Aegis Guard • Dashboard ile detaylı yapılandırma')
    );

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};

// English setup command — ayrı dosya gibi davranır ama aynı kod bazını kullanır
module.exports.setupEn = {
  data: new SlashCommandBuilder()
    .setName('setup-en')
    .setDescription('Set up Aegis Guard in your server (English)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    // Dil geçici olarak EN yap
    const guild = interaction.guild;
    const settings = getGuild(guild.id);
    const prevLang = settings.language;
    setGuildLanguage(guild.id, 'en');

    try {
      // Normal setup'i çalıştır ama İngilizce mesajlarla
      const t = createTranslator(guild.id);

      const categoryExists = settings.logCategory && guild.channels.cache.has(settings.logCategory);
      if (categoryExists) {
        return interaction.reply({
          content: t('setup.already_setup'),
          flags: 64,
        });
      }

      await interaction.deferReply({ flags: 64 });

      const activePkg = PACKAGES.find(p => p.id === settings.activePackageId);
      // Ücretli paketler ücretsiz seviyeden az kanal almaz: herkes tam kurulumu alır.
    const isBasicTier = false;

      const staffOnlyOverwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
      ];
      const publicReadOnlyOverwrites = [
        { id: guild.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
      ];

      // Kategori
      let logCategory = guild.channels.cache.get(settings.logCategory);
      if (!logCategory) {
        logCategory = await guild.channels.create({
          name: 'aegis-logs',
          type: ChannelType.GuildCategory,
          permissionOverwrites: staffOnlyOverwrites,
          reason: 'Aegis Guard setup',
        });
        updateGuild(guild.id, { logCategory: logCategory.id });
      }

      async function createLogChannel(name, key, overwrites = staffOnlyOverwrites) {
        const existing = settings[key] && guild.channels.cache.has(settings[key]);
        if (existing) return guild.channels.cache.get(settings[key]);

        const channel = await guild.channels.create({
          name,
          type: ChannelType.GuildText,
          parent: logCategory.id,
          permissionOverwrites: overwrites,
          reason: 'Aegis Guard setup',
        });
        updateGuild(guild.id, { [key]: channel.id });
        return channel;
      }

      // Temel kanallar
      await createLogChannel('joins-leaves', 'joinLeaveLogChannel');
      await createLogChannel('message-log', 'messageLogChannel');
      await createLogChannel('ban-kick-log', 'banKickLogChannel');
      await createLogChannel('general-log', 'logChannel');
      await createLogChannel('ticket-log', 'ticketLogChannel');

      if (!isBasicTier) {
        await createLogChannel('role-log', 'roleLogChannel');
        await createLogChannel('voice-log', 'voiceLogChannel');
        await createLogChannel('nickname-log', 'nicknameLogChannel');
        await createLogChannel('channel-log', 'channelLogChannel');
        await createLogChannel('mute-log', 'muteLogChannel');
        await createLogChannel('invite-log', 'inviteLogChannel');
        await createLogChannel('game-activity', 'gameActivityLogChannel');
        await createLogChannel('status-log', 'statusLogChannel');
      }

      // Welcome
      let welcomeChannel = settings.welcomeChannel && guild.channels.cache.get(settings.welcomeChannel);
      if (!welcomeChannel) {
        welcomeChannel = await guild.channels.create({
          name: 'welcome',
          type: ChannelType.GuildText,
          permissionOverwrites: publicReadOnlyOverwrites,
          reason: 'Aegis Guard setup',
        });
        updateGuild(guild.id, { welcomeChannel: welcomeChannel.id, welcomeEnabled: true });
      }

      // Announcements
      let announcementChannel = settings.announcementChannel && guild.channels.cache.get(settings.announcementChannel);
      if (!announcementChannel) {
        announcementChannel = await guild.channels.create({
          name: 'announcements',
          type: ChannelType.GuildText,
          permissionOverwrites: publicReadOnlyOverwrites,
          reason: 'Aegis Guard setup',
        });
        updateGuild(guild.id, { announcementChannel: announcementChannel.id });
      }

      // Ticket category
      let ticketCategory = settings.ticketCategory && guild.channels.cache.get(settings.ticketCategory);
      if (!ticketCategory) {
        ticketCategory = await guild.channels.create({
          name: 'tickets',
          type: ChannelType.GuildCategory,
          permissionOverwrites: staffOnlyOverwrites,
          reason: 'Aegis Guard setup',
        });
        updateGuild(guild.id, { ticketCategory: ticketCategory.id });
      }

      await createLogChannel('ticket-log', 'ticketLogChannel');
      await createLogChannel('ticket-transcript', 'ticketTranscriptChannel');

      const doneContainer = new ContainerBuilder()
        .setAccentColor(0x3ba55c)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ✅ ${t('setup.done')}\n\n${t('setup.done_desc')}\n\n` +
            `> **Kategori:** <#${logCategory.id}>\n` +
            `> **Karşılama:** <#${welcomeChannel.id}>\n` +
            `> **Duyurular:** <#${announcementChannel.id}>\n` +
            `> **Ticket:** <#${ticketCategory.id}>\n` +
            `> **Paket:** ${isBasicTier ? 'Verse' : 'Full Kurulum'}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('-# Aegis Guard • Detaylı ayarlar için /server-panel kullanabilirsiniz')
        );

      await interaction.editReply({ components: [doneContainer], flags: MessageFlags.IsComponentsV2 });
    } finally {
      // Dil geri al (veya kullanıcı istiyorsa EN kalabilir)
      // Şimdilik EN kalsın çünkü kullanıcı English version istedi
    }
  },
};

// Dil değiştirme komutu
module.exports.language = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Change bot language / Bot dilini değiştir')
    .addStringOption(option =>
      option.setName('lang')
        .setDescription('Language / Dil')
        .setRequired(true)
        .addChoices(
          { name: 'Turkish', value: 'tr' },
          { name: 'English', value: 'en' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    const lang = interaction.options.getString('lang');

    setGuildLanguage(guild.id, lang);
    const t = createTranslator(guild.id);

    const container = new ContainerBuilder()
      .setAccentColor(0x0066ff)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🌐 ${lang === 'en' ? 'Language Changed' : 'Dil Değiştirildi'}\n\n` +
          (lang === 'en' ? t('lang.changed') : t('lang.changed_tr'))
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(lang === 'en' ? '-# Active language: English' : '-# Aktif dil: Türkçe')
      );

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};