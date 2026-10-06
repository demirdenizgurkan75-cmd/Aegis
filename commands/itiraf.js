const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder
} = require('discord.js');
const { getGuild, updateGuild, getBannedWords } = require('../utils/database');
const { banner } = require('../features/util');

const COOLDOWN_MS = 2 * 60 * 1000;
const lastConfession = new Map(); // guildId:userId → zaman
const INVITE_RE = /(discord\.gg|discord(?:app)?\.com\/invite)\/\S+/i;
const { getGuildLanguage } = require('../utils/i18n');

// Sunucu dili İngilizceyse panel, itiraf mesajı, pencere ve hatalar İngilizce gelir
const isEnGuild = (guildId) => getGuildLanguage(guildId) === 'en';
const L = (isEn, tr, en) => (isEn ? en : tr);

function buildConfessionContainer(confessionNum, content, imageUrl = null, isEn = false) {
  const container = new ContainerBuilder()
    .setAccentColor(0x0066ff)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🎭 ${L(isEn, 'Anonim İtiraf', 'Anonymous Confession')} #${confessionNum}\n\n${content}`)
    );

  if (imageUrl) {
    try {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setMedia(imageUrl)
        )
      );
    } catch (_) {}
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(L(isEn, '-# 🔒 Aegis Anonim Paylaşım • Gönderen kimliği tamamen gizlidir', '-# 🔒 Aegis Anonymous Post • The sender\'s identity is fully hidden'))
  );

  return container;
}

function buildConfessionPanelContainer(isEn = false) {
  const container = new ContainerBuilder()
    .setAccentColor(0x0066ff)
    .addMediaGalleryComponents(banner('confession', 'Anonymous confessions'))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        isEn
          ? '## 🎭 Anonymous Confession Box\n\n' +
            'Share what\'s on your mind, thoughts nobody knows, or your confessions **completely anonymously**!\n\n' +
            '🔒 **Privacy Guarantee:**\n' +
            'Your name, avatar and identity are never shown on the confessions you send.\n\n' +
            'Click the button below, write your confession in the window that opens and send it!'
          : '## 🎭 Anonim İtiraf Kutusu\n\n' +
            'Aklındakileri, kimsenin bilmediği düşüncelerini veya itiraflarını **tamamen anonim** olarak paylaş!\n\n' +
            '🔒 **Gizlilik Garantisi:**\n' +
            'Gönderdiğin itiraflarda adın, avatarın veya kimliğin kesinlikle görünmez.\n\n' +
            'Aşağıdaki butona tıklayarak açılan pencereye itirafını yazıp gönderebilirsin!'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('itiraf_btn_modal')
          .setLabel(L(isEn, '✍️ İtiraf Gönder', '✍️ Send Confession'))
          .setStyle(ButtonStyle.Primary)
      )
    );

  return container;
}

function buildConfessionModal(isEn = false) {
  const modal = new ModalBuilder()
    .setCustomId('itiraf_modal_submit')
    .setTitle(L(isEn, '🎭 Anonim İtiraf Gönder', '🎭 Send an Anonymous Confession'));

  const textInput = new TextInputBuilder()
    .setCustomId('itiraf_text')
    .setLabel(L(isEn, 'İtirafın (Tamamen Anonim)', 'Your confession (fully anonymous)'))
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(L(isEn, 'Kimseye söyleyemediğin sırrını veya düşünceni buraya yaz...', 'Write the secret or thought you can\'t tell anyone...'))
    .setMinLength(3)
    .setMaxLength(1000)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));
  return modal;
}

async function postConfession(guild, content, imageUrl = null, userId = null) {
  const settings = getGuild(guild.id);
  const isEn = isEnGuild(guild.id);

  // Anonim paylaşım kötüye kullanılmasın: bekleme süresi, davet bağlantısı ve yasaklı kelime denetimi
  if (userId) {
    const key = `${guild.id}:${userId}`;
    const wait = COOLDOWN_MS - (Date.now() - (lastConfession.get(key) || 0));
    if (wait > 0) return { ok: false, error: L(isEn, `Çok sık itiraf gönderiyorsun. ${Math.ceil(wait / 1000)} saniye sonra tekrar dene.`, `You're sending confessions too often. Try again in ${Math.ceil(wait / 1000)} seconds.`) };
  }
  if (INVITE_RE.test(content)) return { ok: false, error: L(isEn, 'İtiraflarda sunucu davet bağlantısı paylaşılamaz.', 'Server invite links can\'t be shared in confessions.') };
  const lower = content.toLowerCase();
  const banned = (getBannedWords(guild.id) || []).map((w) => String(typeof w === 'string' ? w : (w?.word || '')).toLowerCase()).filter(Boolean);
  if (banned.some((w) => lower.includes(w))) return { ok: false, error: L(isEn, 'İtirafında bu sunucuda yasaklı bir kelime var.', 'Your confession contains a word that is banned on this server.') };

  const targetChannelId = settings.itirafChannel;
  if (!targetChannelId) {
    return { ok: false, error: L(isEn, 'Sunucuda ayarlanmış bir itiraf kanalı bulunamadı. Lütfen bir yetkiliden `/confession` komutunu çalıştırmasını isteyin.', 'No confession channel is set on this server. Ask a moderator to run `/confession`.') };
  }

  const channel = guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null);
  if (!channel) {
    return { ok: false, error: L(isEn, 'Ayarlanan itiraf kanalı bulunamadı veya silinmiş. Lütfen bir yetkiliden `/confession` komutu ile tekrar kurmasını isteyin.', 'The confession channel is missing or was deleted. Ask a moderator to set it up again with `/confession`.') };
  }

  const nextNum = (settings.itirafCounter || 0) + 1;
  const container = buildConfessionContainer(nextNum, content, imageUrl, isEn);
  // allowedMentions boş: anonim itirafla @everyone / rol / üye etiketlenemez
  const msg = await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }).catch(() => null);

  if (!msg) {
    return { ok: false, error: L(isEn, 'İtiraf kanalına mesaj gönderilemedi. Botun kanal izinlerini (Mesaj Gönder, Bağlantı Yerleştir) kontrol edin.', 'Could not post in the confession channel. Check the bot\'s channel permissions (Send Messages, Embed Links).') };
  }

  // Numara ve bekleme süresi yalnızca gönderim başarılıysa işlenir
  updateGuild(guild.id, { itirafCounter: nextNum });
  if (userId) lastConfession.set(`${guild.id}:${userId}`, Date.now());

  // Tepkileri ekle
  await msg.react('❤️').catch(() => {});
  await msg.react('💔').catch(() => {});
  await msg.react('🔥').catch(() => {});

  return { ok: true, channelId: channel.id, number: nextNum };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('confession')
    .setDescription('Butonlu anonim itiraf paneli gönder / Deploy confession panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(opt =>
      opt
        .setName('kanal')
        .setDescription('Panelin ve itirafların gönderileceği kanal / Target channel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xed4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ❌ Hata / Error\n\nBu komut yalnızca sunucularda kullanılabilir.\nThis command only works in servers.'))
        ],
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
      });
    }

    const guild = interaction.guild;
    const isEn = getGuildLanguage(guild.id) === 'en';

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                isEn
                  ? '## ❌ Missing Permissions\n\nYou need **Manage Server** permission to deploy the confession panel.'
                  : '## ❌ Yetki Yetersiz\n\nİtiraf panelini kurmak için **Sunucuyu Yönet** yetkisine sahip olmalısın.'
              )
            )
        ],
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
      });
    }

    const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;
    updateGuild(guild.id, { itirafChannel: targetChannel.id });

    const panelContainer = buildConfessionPanelContainer(isEn);
    const sent = await targetChannel.send({ components: [panelContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);

    if (!sent) {
      return interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                isEn
                  ? '## ❌ Send Failed\n\nCould not send panel to the channel. Please check bot permissions (Send Messages, Embed Links).'
                  : '## ❌ Gönderim Başarısız\n\nPanel kanala gönderilemedi. Botun o kanalda mesaj atma ve bağlantı yerleştirme izinlerini kontrol edin.'
              )
            )
        ],
        flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
      });
    }

    return interaction.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x3ba55c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              isEn
                ? `## ✅ Confession Panel Deployed\n\nInteractive confession panel has been deployed to <#${targetChannel.id}> and set as the confession channel!`
                : `## ✅ İtiraf Paneli Kuruldu\n\nAnonim itiraf paneli başarıyla <#${targetChannel.id}> kanalına gönderildi ve itiraf kanalı olarak ayarlandı!`
            )
          )
      ],
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
    });
  },

  buildConfessionModal,
  postConfession
};
