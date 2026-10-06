/** Kart + kısa metin içeren Components V2 mesajı (kartlar utils/canvas/cards.js). */
const { AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');

function cardPayload(png, { name = 'card.png', text = '', accent = 0x0066ff, mentionUsers = [] } = {}) {
  const c = new ContainerBuilder().setAccentColor(accent)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`).setDescription('Aegis')));
  if (text) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return { components: [c], files: [new AttachmentBuilder(png, { name })], flags: MessageFlags.IsComponentsV2, allowedMentions: { users: mentionUsers } };
}

module.exports = { cardPayload };
