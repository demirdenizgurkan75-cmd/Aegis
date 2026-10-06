const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const { getRulesBot, setRulesBot } = require('../utils/database');
const { getGuildLanguage, createTranslator } = require('../utils/i18n');
const { banner } = require('../features/util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Kurallar paneli ve kural onay rolü yönetim sistemi / Rules & verification system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(opt =>
      opt
        .setName('rol')
        .setDescription('Kuralları onaylayana verilecek rol / Role to assign on accept')
        .setRequired(false)
    )
    .addChannelOption(opt =>
      opt
        .setName('kanal')
        .setDescription('Kuralların gönderileceği kanal / Rules channel')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption(opt =>
      opt
        .setName('metin')
        .setDescription('Özel kurallar metni / Custom rules text')
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild } = interaction;
    if (!guild) {
      return interaction.reply({
        content: '❌ Bu komut sadece sunucularda kullanılabilir / This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const lang = getGuildLanguage(guild.id);
    const isEn = lang === 'en';
    const t = createTranslator(guild.id);

    const targetRole = interaction.options.getRole('rol');
    const targetChannel = interaction.options.getChannel('kanal');
    const customText = interaction.options.getString('metin');

    // Kural sisteminin tek kaynağı getRulesBot(): onay işleyicisi, panel ve /gate aynı anahtarları okur
    // (verifiedRoleId, rulesChannelId, dmContent.description). Eskiden bu komut roleId/channelId/description
    // yazıyordu; bu yüzden kanal düğmesi rol vermiyordu.
    const stored = getRulesBot(guild.id) || {};
    const rulesConfig = {
      ...stored,
      roleId: stored.verifiedRoleId || null,
      channelId: stored.rulesChannelId || null,
      description: stored.dmContent?.description || '',
      title: stored.panelTitle || '',
      buttonText: stored.panelButtonText || '',
      footer: stored.panelFooter || '',
    };
    const DEFAULT_RULES_PREFIX = 'Aşağıdaki kuralları okuduysanız';
    if ((rulesConfig.description || '').startsWith(DEFAULT_RULES_PREFIX)) rulesConfig.description = '';

    if (targetRole && (targetRole.id === guild.id || targetRole.managed || !targetRole.editable)) {
      return interaction.reply({
        content: isEn ? `:aegis_no: I cannot give ${targetRole}. My role must be above it, and it cannot be @everyone or a bot role.` : `:aegis_no: ${targetRole} rolünü veremem. Botun rolü bunun üstünde olmalı; @everyone ya da bot rolü de olmaz.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    let updated = false;
    if (targetRole) {
      rulesConfig.roleId = targetRole.id;
      rulesConfig.enabled = true;
      updated = true;
    }
    if (targetChannel) {
      rulesConfig.channelId = targetChannel.id;
      rulesConfig.enabled = true;
      updated = true;
    }
    if (customText) {
      rulesConfig.description = customText;
      updated = true;
    }
    if (rulesConfig.enabled === undefined) rulesConfig.enabled = !!(rulesConfig.roleId && rulesConfig.channelId);

    if (!rulesConfig.title) {
      rulesConfig.title = isEn ? '📜 Server Rules & Guidelines' : '📜 Sunucu Kuralları';
    }
    if (!rulesConfig.description) {
      rulesConfig.description = isEn
        ? 'Welcome to our server! Please read and accept the rules below to gain access to the channels.\n\n1️⃣ Be respectful, no harassment, hate speech or toxicity\n2️⃣ No spam, unauthorized advertising or malicious links\n3️⃣ Follow Discord Community Guidelines and Terms of Service\n4️⃣ Respect staff instructions and moderating decisions'
        : 'Sunucumuza hoş geldiniz! Aşağıdaki kuralları okuyup onaylayarak sohbet kanallarına erişim kazanın.\n\n1️⃣ Saygılı olun, küfür/argo/taciz yapmayın\n2️⃣ Spam/reklam/link paylaşmayın (izin verilmedikçe)\n3️⃣ Konu dışı/uygunsuz tartışmalara girmeyin\n4️⃣ Yetkililere saygı duyun, yönergeleri takip edin';
    }
    if (!rulesConfig.buttonText) {
      rulesConfig.buttonText = isEn ? '✅ I Accept the Rules' : '✅ Kuralları Kabul Ediyorum';
    }
    if (!rulesConfig.footer) {
      rulesConfig.footer = 'Aegis Guard • Rules Protection';
    }

    // Kaydedilecek alanlar: işleyicilerin okuduğu kanonik anahtarlar
    const persist = () => setRulesBot(guild.id, {
      enabled: !!rulesConfig.enabled,
      verifiedRoleId: rulesConfig.roleId,
      rulesChannelId: rulesConfig.channelId,
      panelTitle: rulesConfig.title,
      panelButtonText: rulesConfig.buttonText,
      panelFooter: rulesConfig.footer,
      dmContent: { ...(stored.dmContent || {}), description: rulesConfig.description },
      updatedAt: Date.now(),
    });
    if (updated) persist();

    // Eğer kanal ve rol tanımlıysa ve komutta kanal veya rol belirtildiyse kanala kurallar mesajını gönder
    let deployedNotice = '';
    if ((targetChannel || (targetRole && rulesConfig.channelId)) && rulesConfig.channelId && rulesConfig.roleId) {
      const channel = guild.channels.cache.get(rulesConfig.channelId);
      if (channel) {
        try {
          const rulesEmbed = new ContainerBuilder().setAccentColor(0x0066ff);
          rulesEmbed.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${rulesConfig.title}\n\n${rulesConfig.description}`)
          );
          rulesEmbed.addSeparatorComponents(new SeparatorBuilder());
          rulesEmbed.addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`rules_accept_${guild.id}`)
                .setLabel(rulesConfig.buttonText)
                .setStyle(ButtonStyle.Success)
            )
          );
          rulesEmbed.addSeparatorComponents(new SeparatorBuilder());
          rulesEmbed.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ${rulesConfig.footer} • Verilecek Rol: <@&${rulesConfig.roleId}>`)
          );
          require('../utils/tier').addBrand(rulesEmbed, guild.id);

          const posted = await channel.send({ components: [rulesEmbed], flags: MessageFlags.IsComponentsV2 });
          setRulesBot(guild.id, { rulesMessageId: posted.id });
          deployedNotice = isEn
            ? `\n\n🚀 **Rules message successfully posted to <#${channel.id}>!**`
            : `\n\n🚀 **Kural mesajı başarıyla <#${channel.id}> kanalına gönderildi!**`;
        } catch (err) {
          console.error('[rules deploy]', err.message);
          deployedNotice = isEn ? '\n\n:aegis_no: I could not post the rules there. I need View Channel and Send Messages in that channel.' : '\n\n:aegis_no: Kuralları o kanala gönderemedim. Orada Kanalı Görüntüle ve Mesaj Gönder yetkilerine ihtiyacım var.';
        }
      }
    }

    const currentChannel = rulesConfig.channelId
      ? `<#${rulesConfig.channelId}>`
      : isEn
      ? '*Not set (use `/rules kanal:#kanal`)*'
      : '*Ayarlanmamış (`/rules kanal:#kanal` ile seçin)*';

    const currentRole = rulesConfig.roleId
      ? `<@&${rulesConfig.roleId}>`
      : isEn
      ? '*Not set (use `/rules rol:@rol`)*'
      : '*Ayarlanmamış (`/rules rol:@rol` ile seçin)*';

    const isReady = !!(rulesConfig.channelId && rulesConfig.roleId);
    const container = new ContainerBuilder().setAccentColor(isReady ? 0x3ba55c : 0xf0b232);
    container.addMediaGalleryComponents(banner('rules', 'Rules and verification'));

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 📜 ${isEn ? 'Rules & Verification Role System' : 'Kurallar ve Kural Onay Rolü Sistemi'}\n` +
        (isEn
          ? 'Configure the server rules message and choose which role is automatically granted when members click Accept.'
          : 'Sunucu kurallarını düzenleyin ve üyeler kuralları kabul ettiğinde hangi rolün verileceğini belirleyin.') +
        deployedNotice
      )
    );

    container.addSeparatorComponents(new SeparatorBuilder());

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `• **${isEn ? 'Verification Role (Granted on accept)' : 'Verilecek Onay Rolü'}:** ${currentRole}\n` +
        `• **${isEn ? 'Rules Channel' : 'Kurallar Kanalı'}:** ${currentChannel}\n` +
        `• **${isEn ? 'Status' : 'Durum'}:** ${isReady ? '🟢 ' + (isEn ? 'Configured & Ready' : 'Hazır & Aktif') : '🟠 ' + (isEn ? 'Setup Incomplete' : 'Eksik Yapılandırma')}\n\n` +
        `**${isEn ? 'Current Rules Preview' : 'Mevcut Kural Metni'}:**\n` +
        `> ${rulesConfig.description.split('\n').join('\n> ')}\n\n` +
        `-# ${isEn ? 'Tip: Use /rules rol:@üye kanal:#kurallar to change settings anytime.' : 'İpucu: /rules rol:@üye kanal:#kurallar metin:... komutuyla ayarları anında güncelleyebilirsiniz.'}`
      )
    );

    container.addSeparatorComponents(new SeparatorBuilder());

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(isEn ? '🌐 Manage in Dashboard' : '🌐 Dashboard\'da Yönet')
        .setStyle(ButtonStyle.Link)
        .setURL('https://betterwithaegis.com/dashboard'),
      new ButtonBuilder()
        .setCustomId('rules_close')
        .setLabel(isEn ? '✕ Close' : '✕ Kapat')
        .setStyle(ButtonStyle.Secondary)
    );

    container.addActionRowComponents(actionRow);

    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
