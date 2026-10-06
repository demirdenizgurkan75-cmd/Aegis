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
  RoleSelectMenuBuilder,
} = require('discord.js');
const { getGuild, updateGuild } = require('../utils/database');
const { getGuildLanguage } = require('../utils/i18n');
const { safeClosePanel } = require('../utils/panelHelper');
const { banner } = require('../features/util');

function buildOtorolPanel(guild, settings) {
  const isEn = getGuildLanguage(guild.id) === 'en';
  const isEnabled = !!settings.autoRoleEnabled;
  const roleId = settings.autoRoleId || settings.autoRole;
  const role = roleId ? guild.roles.cache.get(roleId) : null;

  const container = new ContainerBuilder()
    .setAccentColor(isEnabled && role ? 0x3ba55c : 0xf0b232);
  container.addMediaGalleryComponents(banner('autorole', 'Auto roles'));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 👤 ${isEn ? 'Auto-Role Management' : 'Otorol Sistemi Yönetim Paneli'}\n` +
      `${isEn ? 'Automatically assigns configured roles to members joining the server.' : 'Sunucuya katılan yeni üyelere otomatik olarak rol verir.'}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `• **${isEn ? 'System Status' : 'Sistem Durumu'}:** ${isEnabled ? '🟢 ' + (isEn ? 'Active' : 'Aktif') : '🔴 ' + (isEn ? 'Disabled' : 'Kapalı')}\n` +
      `• **${isEn ? 'Configured Role' : 'Atanan Üye Rolü'}:** ${role ? `<@&${role.id}> (\`${role.name}\`)` : (isEn ? '*Not configured (select below)*' : '*Rol atanmamış (aşağıdan seçin)*')}\n\n` +
      `-# ${isEn ? 'Tip: Ensure Aegis role is placed ABOVE the target role in Server Settings > Roles.' : 'İpucu: Aegis botunun rolü, verilecek rolden hiyerarşik olarak DAHA YUKARIDA olmalıdır.'}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`otorol_toggle_${guild.id}`)
      .setLabel(isEnabled ? (isEn ? '🔴 Disable Auto-Role' : '🔴 Otorolü Kapat') : (isEn ? '🟢 Enable Auto-Role' : '🟢 Otorolü Aç'))
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(!role && !isEnabled),
    new ButtonBuilder()
      .setCustomId(`otorol_reset_${guild.id}`)
      .setLabel(isEn ? '🗑️ Reset Role' : '🗑️ Rolü Kaldır')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!role),
    new ButtonBuilder()
      .setCustomId(`otorol_close_${guild.id}`)
      .setLabel(isEn ? '✕ Close' : '✕ Kapat')
      .setStyle(ButtonStyle.Secondary)
  );

  const roleRow = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`otorol_role_${guild.id}`)
      .setPlaceholder(isEn ? 'Select auto-role from list...' : 'Otomatik verilecek rolü buradan seçin...')
  );

  container.addActionRowComponents(buttonRow, roleRow);
  return container;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Yeni üyelere otomatik rol verme yönetim paneli / Auto-role management panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Bu komut yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    }

    const { guild } = interaction;
    const isEn = getGuildLanguage(guild.id) === 'en';

    const settings = getGuild(guild.id);
    const panel = buildOtorolPanel(guild, settings);
    const replyMsg = await interaction.reply({
      components: [panel],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = replyMsg.createMessageComponentCollector({
      filter: (i) => {
        if (!i.member.permissions.has(PermissionFlagsBits.Administrator) && i.user.id !== guild.ownerId) {
          i.reply({
            content: isEn ? '❌ Only administrators can interact with this panel.' : '❌ Bu paneli sadece yöneticiler kullanabilir.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
          return false;
        }
        return true;
      },
      time: 300_000,
    });

    collector.on('collect', async (i) => {
      if (i.__globalHandled) return; // genel işleyici zaten işledi (çift çalışma = aç/kapat geri dönerdi)
      try {
        if (i.customId === `otorol_toggle_${guild.id}`) {
          const curSettings = getGuild(guild.id);
          const newState = !curSettings.autoRoleEnabled;
          updateGuild(guild.id, { autoRoleEnabled: newState });
          const updatedSettings = getGuild(guild.id);
          const newPanel = buildOtorolPanel(guild, updatedSettings);
          return i.update({ components: [newPanel], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === `otorol_reset_${guild.id}`) {
          updateGuild(guild.id, {
            autoRoleEnabled: false,
            autoRoleId: null,
            autoRole: null,
          });
          const updatedSettings = getGuild(guild.id);
          const newPanel = buildOtorolPanel(guild, updatedSettings);
          return i.update({ components: [newPanel], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === `otorol_role_${guild.id}`) {
          const selectedRoleId = i.values[0];
          const targetRole = guild.roles.cache.get(selectedRoleId);

          if (targetRole && (targetRole.id === guild.id || targetRole.managed)) {
            return i.reply({
              content: isEn ? ':aegis_no: @everyone and bot/integration roles cannot be used as an auto-role.' : ':aegis_no: @everyone ve bot/entegrasyon rolleri otorol olarak verilemez.',
              flags: MessageFlags.Ephemeral,
            });
          }

          const botMember = guild.members.me;
          if (targetRole && targetRole.position >= botMember.roles.highest.position) {
            return i.reply({
              content: isEn
                ? `❌ **Role Hierarchy Error:** The role <@&${targetRole.id}> is higher than or equal to my highest role. Move my role higher in Server Settings > Roles.`
                : `❌ **Rol Hiyerarşisi Hatası:** <@&${targetRole.id}> rolü benim en yüksek rolümden daha üstte veya eşit. Lütfen Sunucu Ayarları > Roller kısmından botun rolünü bu rolün üstüne taşıyın.`,
              flags: MessageFlags.Ephemeral,
            });
          }

          updateGuild(guild.id, {
            autoRoleEnabled: true,
            autoRoleId: selectedRoleId,
            autoRole: selectedRoleId,
          });

          const updatedSettings = getGuild(guild.id);
          const newPanel = buildOtorolPanel(guild, updatedSettings);
          return i.update({ components: [newPanel], flags: MessageFlags.IsComponentsV2 });
        }

        if (i.customId === `otorol_close_${guild.id}`) {
          collector.stop('closed');
          return safeClosePanel(i, isEn ? 'Auto-role panel closed.' : 'Otorol paneli kapatıldı.');
        }
      } catch (err) {
        console.error('[Otorol collector error]', err);
        if (!i.deferred && !i.replied) {
          await i.deferUpdate().catch(() => null);
        }
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'closed') return;
    });
  },
  buildOtorolPanel,
};
