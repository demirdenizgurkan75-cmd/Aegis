const { MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');

/**
 * Cleanly and safely closes any message panel.
 * - If the message is in a public channel, deletes it so it leaves no clutter.
 * - If the message is ephemeral, updates it with a valid Components V2 container so Discord API never rejects it.
 * - Always acknowledges the interaction within 3 seconds, so Discord never displays "Aegis Guard zamanında yanıt vermedi".
 */
async function safeClosePanel(interaction, text = '🔒 Panel kapatıldı.') {
  try {
    const isEphemeral = interaction.message?.flags?.has(MessageFlags.Ephemeral);

    // If public and deletable, delete the message cleanly
    if (!isEphemeral && interaction.message?.deletable) {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => null);
      }
      await interaction.message.delete().catch(() => null);
      return;
    }

    // If ephemeral or delete failed, update with valid container
    const isV2 = interaction.message?.flags?.has(MessageFlags.IsComponentsV2);
    if (isV2) {
      const closeContainer = new ContainerBuilder()
        .setAccentColor(0x4f545c)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(text)
        );
      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply({ components: [closeContainer] }).catch(() => null);
      } else {
        return await interaction.update({ components: [closeContainer] }).catch(() => null);
      }
    } else {
      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply({ content: text, components: [] }).catch(() => null);
      } else {
        return await interaction.update({ content: text, components: [] }).catch(() => null);
      }
    }
  } catch (err) {
    console.error('[safeClosePanel error]', err);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => null);
    }
  }
}

module.exports = {
  safeClosePanel,
};
