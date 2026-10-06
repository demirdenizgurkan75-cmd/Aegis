const {
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  FileBuilder,
} = require('discord.js');

function createButton(customId, label, style = ButtonStyle.Primary, disabled = false, emoji = null, url = null) {
  const btn = new ButtonBuilder()
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
  if (emoji) btn.setEmoji(emoji);
  if (style === ButtonStyle.Link && url) {
    btn.setURL(url);
  } else {
    btn.setCustomId(customId);
  }
  return btn;
}

function createButtonRow(...buttons) {
  return new ActionRowBuilder().addComponents(buttons);
}

function createButtonContainer(title, description, buttons, options = {}) {
  const {
    color = 0x5b7cfa,
    thumbnail = null,
    footer = null,
    accentColor = null
  } = options;

  const container = new ContainerBuilder().setAccentColor(accentColor || color);

  if (title || description) {
    const textDisplay = new TextDisplayBuilder()
      .setContent(`${title ? `## ${title}\n` : ''}${description || ''}`);

    if (buttons.length === 1) {
      // Single button - use Section with button accessory
      const section = new SectionBuilder()
        .addTextDisplayComponents(textDisplay)
        .setButtonAccessory(buttons[0]);
      container.addSectionComponents(section);
    } else {
      // Multiple or no buttons - add text display, then action row if needed
      container.addTextDisplayComponents(textDisplay);
      if (buttons.length > 1) {
        const actionRow = new ActionRowBuilder().addComponents(buttons);
        container.addActionRowComponents(actionRow);
      }
    }
  } else if (buttons.length > 0) {
    // Just buttons, no text
    const actionRow = new ActionRowBuilder().addComponents(buttons);
    container.addActionRowComponents(actionRow);
  }

  if (footer) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  }

  if (thumbnail) {
    container.setThumbnail(thumbnail);
  }

  return container;
}

function createPaginationButtons(currentPage, totalPages, baseId) {
  return [
    createButton(`${baseId}_prev`, 'Previous', ButtonStyle.Secondary, currentPage === 0, '◀️'),
    createButton(`${baseId}_next`, 'Next', ButtonStyle.Primary, currentPage === totalPages - 1, '▶️'),
    createButton(`${baseId}_close`, 'Close', ButtonStyle.Danger, false, '✕'),
  ];
}

module.exports = {
  createButtonContainer,
  createButtonRow,
  createButton,
  createPaginationButtons,
};