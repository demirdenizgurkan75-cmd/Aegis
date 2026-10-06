const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
} = require('discord.js');
const { getGuildLanguage } = require('../utils/i18n');
const {
  createBackup,
  listBackups,
  getBackup,
  deleteBackup,
  restoreBackup,
} = require('../utils/backupManager');
const { safeClosePanel } = require('../utils/panelHelper');
const { banner } = require('../features/util');

function buildCommand() {
  return new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Sunucu tam yedekleme ve yönetim merkezi / Full server backup system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Sunucunun tüm rollerini ve kanallarını yedekle / Create full server backup')
        .addStringOption(opt =>
          opt
            .setName('isim')
            .setDescription('Yedek için özel isim veya açıklama / Custom name or label')
            .setRequired(false)
            .setMaxLength(50)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Yedek yönetim paneli (liste, geri yükleme, silme) / Backup control panel')
    );
}

function renderBackupPanel(guild, isEn) {
  const backups = listBackups(guild.id);

  const container = new ContainerBuilder()
    .setAccentColor(backups.length ? 0x3ba55c : 0xf0b232);
  container.addMediaGalleryComponents(banner('backup', 'Server backups'));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 💾 ${isEn ? 'Server Backup Control Panel' : 'Sunucu Yedek Yönetim Paneli'}\n` +
      `${isEn ? 'Manage full server snapshots, rollbacks, and role/channel configurations.' : 'Sunucu şablonları, kanal/rol yapılandırmaları ve yedek geri yükleme merkezi.'}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  if (!backups.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        isEn
          ? '📂 **No backups found for this server.**\nClick the button below or use `/backup create` to take your first instant backup.'
          : '📂 **Bu sunucuya ait kayıtlı bir yedek bulunmuyor.**\nAşağıdaki butona tıklayarak veya `/backup create` komutuyla ilk tam yedeğinizi anında alabilirsiniz.'
      )
    );
  } else {
    let listContent = isEn
      ? `**Saved Backups (${backups.length}/10):**\n\n`
      : `**Kayıtlı Yedekler (${backups.length}/10):**\n\n`;

    for (const b of backups.slice(0, 10)) {
      listContent += `• **${b.name}** — \`${b.id}\`\n` +
        `  -# 📅 <t:${Math.floor(b.createdAt / 1000)}:R> | 🎭 ${b.rolesCount} ${isEn ? 'roles' : 'rol'} | 📁 ${b.categoriesCount} ${isEn ? 'categories' : 'kategori'} | 💬 ${b.channelsCount} ${isEn ? 'channels' : 'kanal'}\n`;
    }

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(listContent.trim())
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());

  // Butonlar
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_create_${guild.id}`)
      .setLabel(isEn ? '💾 Create New Backup' : '💾 Yeni Yedek Al')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_refresh_${guild.id}`)
      .setLabel(isEn ? '🔄 Refresh' : '🔄 Yenile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`backup_close_${guild.id}`)
      .setLabel(isEn ? '✕ Close' : '✕ Kapat')
      .setStyle(ButtonStyle.Secondary)
  );

  container.addActionRowComponents(row);

  // Eğer yedek varsa geri yükleme için Select Menu ekle
  if (backups.length) {
    const selectOptions = backups.slice(0, 10).map(b => ({
      label: b.name.slice(0, 25),
      description: `ID: ${b.id} | ${b.rolesCount} rol, ${b.channelsCount} kanal`.slice(0, 50),
      value: b.id,
      emoji: '📦',
    }));

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`backup_select_restore_${guild.id}`)
        .setPlaceholder(isEn ? 'Select a backup to restore...' : 'Geri yüklenecek yedeği seçin...')
        .addOptions(selectOptions)
    );

    container.addActionRowComponents(selectRow);

    // Yedek silme: 10 yedek sınırına takılınca eskileri temizleyebilmek için
    const deleteRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`backup_select_delete_${guild.id}`)
        .setPlaceholder(isEn ? 'Select a backup to delete...' : 'Silinecek yedeği seçin...')
        .addOptions(backups.slice(0, 10).map(b => ({ label: b.name.slice(0, 25), description: `ID: ${b.id}`.slice(0, 50), value: b.id })))
    );
    container.addActionRowComponents(deleteRow);
  }

  return container;
}

module.exports = {
  data: buildCommand(),

  async execute(interaction) {
    const { guild, member, options } = interaction;
    if (!guild) {
      return interaction.reply({
        content: 'Bu komut sadece sunucularda kullanılabilir.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const isEn = getGuildLanguage(guild.id) === 'en';

    const isAdmin =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      interaction.user.id === guild.ownerId;

    if (!isAdmin) {
      return interaction.reply({
        content: isEn
          ? '❌ You must have Administrator permissions or be the server owner to manage backups.'
          : '❌ Bu komutu kullanabilmek için Yönetici yetkisine veya Sunucu Sahibi olmaya ihtiyacınız var.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = options.getSubcommand(false) || 'panel';

    // ─── 1) YEDEK AL ────────────────────────────────────────────────────────
    if (sub === 'create') {
      await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
      const customName = options.getString('isim');

      try {
        const backup = await createBackup(guild, interaction.user, customName);

        const container = new ContainerBuilder()
          .setAccentColor(0x3ba55c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              isEn
                ? `## 🛡️ Server Backup Successfully Created\nAll roles, categories, channels, and permissions for **${guild.name}** have been safely archived.\n\n` +
                  `> 📌 **Backup Name:** ${backup.name}\n` +
                  `> 🔑 **Backup ID:** \`${backup.id}\`\n` +
                  `> 📅 **Date:** <t:${Math.floor(backup.createdAt / 1000)}:f>\n` +
                  `> 🎭 **Roles:** \`${backup.rolesCount}\` | 📁 **Categories:** \`${backup.categoriesCount}\` | 💬 **Channels:** \`${backup.channelsCount}\``
                : `## 🛡️ Sunucu Yedeği Başarıyla Alındı\n**${guild.name}** sunucusunun tüm rolleri, kategorileri, kanalları ve izinleri güvenle arşivlendi.\n\n` +
                  `> 📌 **Yedek Adı:** ${backup.name}\n` +
                  `> 🔑 **Yedek ID:** \`${backup.id}\`\n` +
                  `> 📅 **Tarih:** <t:${Math.floor(backup.createdAt / 1000)}:f>\n` +
                  `> 🎭 **Roller:** \`${backup.rolesCount}\` | 📁 **Kategoriler:** \`${backup.categoriesCount}\` | 💬 **Kanallar:** \`${backup.channelsCount}\``
            )
          )
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              isEn
                ? '💡 *You can view and restore backups via `/backup panel`.*'
                : '💡 *Yedekleri görüntülemek ve geri yüklemek için `/backup panel` kullanabilirsiniz.*'
            )
          );

        return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch (err) {
        console.error('Backup create error:', err);
        const bad = new ContainerBuilder().setAccentColor(0xed4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(
          isEn ? ':aegis_sad: The backup could not be created. Make sure I have permission to view all channels and roles, then try again.' : ':aegis_sad: Yedek alınamadı. Botun tüm kanalları ve rolleri görebildiğinden emin ol ve tekrar dene.'
        ));
        return interaction.editReply({ components: [bad], flags: MessageFlags.IsComponentsV2 });
      }
    }

    // ─── 2) YEDEK PANEL ─────────────────────────────────────────────────────
    const container = renderBackupPanel(guild, isEn);
    const replyMsg = await interaction.reply({
      components: [container],
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
      try {
        // Yeni Yedek Al butonu
        if (i.customId === `backup_create_${guild.id}`) {
          await i.deferUpdate();
          try {
            await createBackup(guild, interaction.user);
          } catch (e) {
            console.error('[backup panel create]', e.message);
            return i.followUp({ content: isEn ? ':aegis_sad: The backup could not be created.' : ':aegis_sad: Yedek alınamadı.', flags: MessageFlags.Ephemeral });
          }
          const updatedPanel = renderBackupPanel(guild, isEn);
          return i.editReply({ components: [updatedPanel], flags: MessageFlags.IsComponentsV2 });
        }

        // Yenile butonu
        if (i.customId === `backup_refresh_${guild.id}`) {
          const updatedPanel = renderBackupPanel(guild, isEn);
          return i.update({ components: [updatedPanel], flags: MessageFlags.IsComponentsV2 });
        }

        // Kapat butonu
        if (i.customId === `backup_close_${guild.id}`) {
          collector.stop('closed');
          return safeClosePanel(i, isEn ? 'Backup panel closed.' : 'Yedek paneli kapatıldı.');
        }

        // Yedek silme: onay iste, onaylanırsa sil ve paneli yenile
        if (i.customId === `backup_select_delete_${guild.id}`) {
          const target = getBackup(guild.id, i.values[0]);
          if (!target) return i.reply({ content: isEn ? ':aegis_no: Backup not found.' : ':aegis_no: Yedek bulunamadı.', flags: MessageFlags.Ephemeral });
          const ask = await i.reply({
            content: isEn ? `:aegis_warn: Delete **${target.name}** (\`${target.id}\`)? This cannot be undone.` : `:aegis_warn: **${target.name}** (\`${target.id}\`) yedeği silinsin mi? Bu geri alınamaz.`,
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('backup_del_yes').setLabel(isEn ? 'Delete' : 'Sil').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId('backup_del_no').setLabel(isEn ? 'Keep it' : 'Vazgeç').setStyle(ButtonStyle.Secondary)
            )],
            flags: MessageFlags.Ephemeral,
            withResponse: true,
          });
          const answer = await ask.resource.message.awaitMessageComponent({ filter: (x) => x.user.id === i.user.id, time: 30_000 }).catch(() => null);
          if (!answer || answer.customId !== 'backup_del_yes') {
            return (answer || i).isButton?.() ? answer.update({ content: isEn ? 'Cancelled, nothing was deleted.' : 'Vazgeçildi, hiçbir şey silinmedi.', components: [] }).catch(() => {}) : null;
          }
          const ok = deleteBackup(guild.id, target.id);
          await answer.update({ content: ok ? (isEn ? ':aegis_ok: Backup deleted.' : ':aegis_ok: Yedek silindi.') : (isEn ? ':aegis_no: The backup could not be deleted.' : ':aegis_no: Yedek silinemedi.'), components: [] }).catch(() => {});
          return interaction.editReply({ components: [renderBackupPanel(guild, isEn)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }

        // Select menüden yedek seçildiğinde geri yükleme onayı
        if (i.customId === `backup_select_restore_${guild.id}`) {
          const selectedId = i.values[0];
          const backup = getBackup(guild.id, selectedId);
          if (!backup) {
            return i.reply({ content: '❌ Yedek bulunamadı.', flags: MessageFlags.Ephemeral });
          }

          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`backup_confirm_${backup.id}_${interaction.user.id}`)
              .setLabel(isEn ? '🛡️ Confirm & Restore' : '🛡️ Onayla ve Geri Yükle')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`backup_cancel_${backup.id}_${interaction.user.id}`)
              .setLabel(isEn ? '❌ Cancel' : '❌ İptal')
              .setStyle(ButtonStyle.Secondary)
          );

          const confirmContainer = new ContainerBuilder()
            .setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                isEn
                  ? `## ⚠️ Server Backup Restoration Confirmation\nYou are about to restore **${backup.name}** (\`${backup.id}\`).\n\n` +
                    `> 📊 **Scope:** ${backup.roles.length} roles, ${backup.categories.length} categories, ${backup.channels.length} channels\n\n` +
                    `🚨 **WARNING:** This process will reconstruct and synchronize your server's roles and channels. Do you want to proceed?`
                  : `## ⚠️ Sunucu Yedeği Geri Yükleme Onayı\n**${backup.name}** (\`${backup.id}\`) yedeğini geri yüklemek üzeresiniz.\n\n` +
                    `> 📊 **Kapsam:** ${backup.roles.length} rol, ${backup.categories.length} kategori, ${backup.channels.length} kanal\n\n` +
                    `🚨 **DİKKAT:** Bu işlem sunucunun rollerini ve kanallarını yedekteki yapıya göre yeniden kurar. Devam etmek istiyor musunuz?`
              )
            )
            .addActionRowComponents(confirmRow);

          return i.reply({
            components: [confirmContainer],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      } catch (err) {
        console.error('[Backup panel collector error]', err);
        if (!i.deferred && !i.replied) {
          await i.deferUpdate().catch(() => null);
        }
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'closed') return;
    });
  },

  /**
   * Buton etkileşimlerini yönetir (onaylama vs)
   */
  async handleButton(interaction) {
    const { customId, guild } = interaction;
    if (!guild) return;

    const isEn = getGuildLanguage(guild.id) === 'en';

    const parts = customId.split('_');
    const action = parts[1]; // confirm or cancel
    const backupId = parts[2];
    const allowedUserId = parts[3];

    if (interaction.user.id !== allowedUserId && interaction.user.id !== guild.ownerId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: isEn
          ? '❌ Only administrators can confirm this action.'
          : '❌ Bu işlemi yalnızca sunucu yöneticileri onaylayabilir.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'cancel') {
      return safeClosePanel(interaction, isEn ? '❌ Backup restoration canceled.' : '❌ Yedek geri yükleme işlemi iptal edildi.');
    }

    if (action === 'confirm') {
      const backupData = getBackup(guild.id, backupId);
      if (!backupData) {
        return interaction.reply({
          content: isEn ? '❌ Backup file not found.' : '❌ Yedek dosyası bulunamadı.',
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferUpdate();

      try {
        const restoreRes = await restoreBackup(
          guild,
          backupData,
          interaction.client,
          async () => {}
        );

        if (!restoreRes.ok) {
          return interaction.followUp({
            content: isEn
              ? `❌ Restoration failed: ${restoreRes.error}`
              : `❌ Geri yükleme başarısız oldu: ${restoreRes.error}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        const res = restoreRes.result;
        const finishContainer = new ContainerBuilder()
          .setAccentColor(0x3ba55c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              isEn
                ? `## ✅ Server Backup Successfully Restored\n` +
                  `**${backupData.name}** has been applied to **${guild.name}**.\n\n` +
                  `• **Recreated Roles:** \`${res.recreatedRoles}\`\n` +
                  `• **Updated Roles:** \`${res.updatedRoles}\`\n` +
                  `• **Recreated Categories:** \`${res.recreatedCategories}\`\n` +
                  `• **Recreated Channels:** \`${res.recreatedChannels}\``
                : `## ✅ Sunucu Yedeği Başarıyla Geri Yüklendi\n` +
                  `**${backupData.name}** yedeği **${guild.name}** sunucusuna uygulandı.\n\n` +
                  `• **Yeniden Kurulan Roller:** \`${res.recreatedRoles}\`\n` +
                  `• **Güncellenen Roller:** \`${res.updatedRoles}\`\n` +
                  `• **Yeniden Kurulan Kategoriler:** \`${res.recreatedCategories}\`\n` +
                  `• **Yeniden Kurulan Kanallar:** \`${res.recreatedChannels}\``
            )
          );

        return interaction.followUp({
          components: [finishContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (err) {
        console.error('Backup restore error:', err);
        return interaction.followUp({
          content: isEn
            ? `❌ Restoration error: ${err.message}`
            : `❌ Geri yükleme sırasında hata: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
