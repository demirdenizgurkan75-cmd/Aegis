/**
 * Karşılama mesajı: gerçek katılımda ve panelin "Test kartı" düğmesinde aynı kodla kurulur.
 * Components V2 mesajında `content` kullanılamaz; kart resmi MediaGallery ile kapsayıcının içinde gösterilir,
 * etiket de metnin içinde yer alır (allowedMentions yalnızca karşılanan üyeyi etiketler).
 */
const { AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const { createWelcomeCard } = require('./canvas/welcomeCard');
const { getGuildLanguage } = require('./i18n');

async function buildWelcomeMessage(member, settings, { test = false } = {}) {
  const isEn = getGuildLanguage(member.guild.id) === 'en';
  const raw = settings.welcomeMessage || (isEn ? 'Welcome to the server {kullanici}!' : 'Sunucuya hoş geldin {kullanici}!');
  const text = raw
    .replaceAll('{kullanici}', `<@${member.id}>`)
    .replaceAll('{sunucu}', member.guild.name)
    .replaceAll('{uye-sayisi}', String(member.guild.memberCount));

  const name = test ? 'test-welcome.png' : 'welcome.png';
  const file = new AttachmentBuilder(await createWelcomeCard(member), { name });
  const container = new ContainerBuilder().setAccentColor(0x0066ff)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${test ? (isEn ? '-# Test message\n' : '-# Test mesajı\n') : ''}## :aegis_happy: ${isEn ? 'A new member joined!' : 'Yeni bir üye katıldı!'}\n\n${text}`))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`).setDescription('Welcome card')));
  require('./tier').addBrand(container, member.guild.id);

  return {
    components: [container],
    files: [file],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [member.id] },
    fallbackText: text,
    fallbackFile: file,
  };
}

module.exports = { buildWelcomeMessage };
