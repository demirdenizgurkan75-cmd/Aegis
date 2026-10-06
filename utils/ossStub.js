// Shared helper for modules that are not part of the open-source release.
const { MessageFlags } = require('discord.js');

async function unavailable(interaction) {
  const msg = { content: 'This feature is part of the hosted Aegis service and is not included in the open-source build.', flags: MessageFlags.Ephemeral };
  try {
    if (!interaction || typeof interaction.reply !== 'function') return;
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg); else await interaction.reply(msg);
  } catch (_) {}
}

module.exports = { unavailable };
