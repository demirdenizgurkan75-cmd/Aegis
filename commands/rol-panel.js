const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('../utils/database');
const { createTranslator, getGuildLanguage } = require('../utils/i18n');
const { banner } = require('../features/util');

function buildRolePanelCommand(name) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(name === 'role-panel' ? 'Butonla rol alma paneli / Self-assign role button panel' : 'Tepki rol paneli oluştur / Create reaction role panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('kanal').setDescription('Panelin gönderileceği kanal / Target channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addStringOption(o => o.setName('başlık').setDescription('Panel başlığı / Panel title').setRequired(true))
    .addStringOption(o => o.setName('emoji1').setDescription('1. emoji').setRequired(false))
    .addRoleOption(o => o.setName('rol1').setDescription('1. rol').setRequired(false))
    .addStringOption(o => o.setName('emoji2').setDescription('2. emoji').setRequired(false))
    .addRoleOption(o => o.setName('rol2').setDescription('2. rol').setRequired(false))
    .addStringOption(o => o.setName('emoji3').setDescription('3. emoji').setRequired(false))
    .addRoleOption(o => o.setName('rol3').setDescription('3. rol').setRequired(false))
    .addStringOption(o => o.setName('emoji4').setDescription('4. emoji').setRequired(false))
    .addRoleOption(o => o.setName('rol4').setDescription('4. rol').setRequired(false))
    .addStringOption(o => o.setName('emoji5').setDescription('5. emoji').setRequired(false))
    .addRoleOption(o => o.setName('rol5').setDescription('5. rol').setRequired(false));
}

module.exports = {
  data: buildRolePanelCommand('role-panel'),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Bu komut sadece sunucularda kullanılabilir / This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    const lang = getGuildLanguage(interaction.guild.id);
    const isEn = lang === 'en';
    const t = createTranslator(interaction.guild.id);

    const guild = interaction.guild;
    const channel = interaction.options.getChannel('kanal');
    const title = interaction.options.getString('başlık');

    const pairs = [];
    for (let i = 1; i <= 5; i++) {
      const emoji = interaction.options.getString(`emoji${i}`);
      const role = interaction.options.getRole(`rol${i}`);
      if (emoji && role) pairs.push({ emoji, roleId: role.id, label: role.name, role });
    }

    // Botun veremeyeceği roller (kendi rolünün üstünde, bot/entegrasyon rolü, @everyone) panele konmaz
    const unusable = pairs.filter((p) => p.role.id === guild.id || p.role.managed || !p.role.editable);
    if (unusable.length) {
      return interaction.reply({
        content: isEn
          ? `:aegis_no: I cannot give these roles: ${unusable.map((p) => p.role.name).join(', ')}. My role must be above them (and they must not be bot roles).`
          : `:aegis_no: Şu rolleri veremem: ${unusable.map((p) => p.role.name).join(', ')}. Botun rolü bunların üstünde olmalı (bot rolü olmamalılar).`,
        flags: MessageFlags.Ephemeral
      });
    }

    if (pairs.length === 0) {
      return interaction.reply({
        content: isEn ? '❌ Please provide at least one emoji and role pair!' : t('rolepanel.no_pairs'),
        flags: MessageFlags.Ephemeral
      });
    }

    const panelId = Date.now().toString(36);

    const container = new ContainerBuilder().setAccentColor(0x0066ff);
    container.addMediaGalleryComponents(banner('role-panel', 'Role panel'));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n-# ${isEn ? 'Pick a role to get it, pick it again to drop it.' : 'Bir rolü seçince alırsın, tekrar seçince bırakırsın.'}`));
    container.addSeparatorComponents(new SeparatorBuilder());

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`rolepanel:${panelId}`)
      .setMinValues(1)
      .setMaxValues(pairs.length)
      .setPlaceholder(isEn ? 'Pick roles to add or remove' : 'Rol seçmek ya da bırakmak için tıkla');

    try {
      for (const p of pairs) {
        selectMenu.addOptions({ label: p.label.slice(0, 100), value: p.roleId, emoji: p.emoji });
      }
    } catch (_) {
      return interaction.reply({
        content: isEn ? ':aegis_confused: One of the emojis is not valid. Use a normal emoji like 🎮 or a server emoji.' : ':aegis_confused: Emojilerden biri geçersiz. 🎮 gibi normal bir emoji ya da sunucu emojisi kullan.',
        flags: MessageFlags.Ephemeral
      });
    }
    for (const p of pairs) delete p.role;

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

    const settings = getGuild(guild.id) || {};
    settings.rolePanels = settings.rolePanels || {};
    settings.rolePanels[panelId] = {
      title,
      channelId: channel.id,
      guildId: guild.id,
      pairs,
      createdAt: Date.now(),
    };
    updateGuild(guild.id, settings);

    try {
      const msg = await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
      settings.rolePanels[panelId].messageId = msg.id;
      updateGuild(guild.id, settings);
      return interaction.reply({
        content: isEn ? `✅ Role panel successfully deployed to ${channel}!` : t('rolepanel.created', { channel: channel.toString() }),
        flags: MessageFlags.Ephemeral
      });
    } catch (e) {
      delete settings.rolePanels[panelId];
      updateGuild(guild.id, settings);
      console.error('[role-panel]', e.message);
      return interaction.reply({
        content: isEn ? ':aegis_no: I could not post in that channel. I need View Channel and Send Messages there.' : ':aegis_no: O kanala gönderemedim. Orada Kanalı Görüntüle ve Mesaj Gönder yetkilerine ihtiyacım var.',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  async handleSelectMenu(interaction) {
    const [action, panelId] = interaction.customId.split(':');
    if (action !== 'rolepanel') return;

    const guild = interaction.guild;
    const isEn = guild ? getGuildLanguage(guild.id) === 'en' : false;
    const settings = getGuild(guild.id) || {};
    const panel = settings.rolePanels?.[panelId];
    if (!panel) {
      return interaction.reply({
        content: isEn ? '❌ Role panel not found or expired.' : '❌ Panel bulunamadı.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Seçilen roller aç/kapa edilir; seçilmeyenlere dokunulmaz (eskiden seçilmeyen roller sessizce alınıyordu)
    const selected = new Set(interaction.values || []);
    const granted = [];
    const removed = [];
    const failed = [];

    for (const p of panel.pairs) {
      if (!selected.has(p.roleId)) continue;
      const has = interaction.member.roles.cache.has(p.roleId);
      try {
        if (has) { await interaction.member.roles.remove(p.roleId); removed.push(p.label); }
        else { await interaction.member.roles.add(p.roleId); granted.push(p.label); }
      } catch (_) {
        failed.push(p.label);
      }
    }

    let result = '';
    if (granted.length) result += isEn ? `:aegis_ok: Roles added: ${granted.join(', ')}\n` : `:aegis_ok: Roller verildi: ${granted.join(', ')}\n`;
    if (removed.length) result += isEn ? `:aegis_off: Roles removed: ${removed.join(', ')}\n` : `:aegis_off: Roller alındı: ${removed.join(', ')}\n`;
    if (failed.length) result += isEn ? `:aegis_no: Could not change: ${failed.join(', ')} (my role must be above them)\n` : `:aegis_no: Değiştirilemedi: ${failed.join(', ')} (botun rolü bunların üstünde olmalı)\n`;
    if (!result) result = isEn ? ':aegis_info: No role changes were made.' : ':aegis_info: Değişiklik yok.';

    return interaction.reply({ content: result, flags: MessageFlags.Ephemeral });
  }
};
