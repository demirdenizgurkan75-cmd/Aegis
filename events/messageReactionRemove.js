const { getGuild } = require('../utils/database');

function emojiKey(emoji) {
  return emoji.id ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : emoji.name;
}

module.exports = {
  name: 'messageReactionRemove',
  async execute(reaction, user, client) {
    if (user.bot) return;

    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch { return; }
    }
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }

    const guild = reaction.message.guild;
    if (!guild) return;

    const settings = getGuild(guild.id) || {};
    const panels = settings.reactionPanels || {};
    const panel = panels[reaction.message.id];
    if (!panel) return;

    const roleId = panel.roles[emojiKey(reaction.emoji)];
    if (!roleId) return;

    const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId).catch(() => {});
    }
  },
};
