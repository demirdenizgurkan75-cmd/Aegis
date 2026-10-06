const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, PermissionFlagsBits, ActivityType, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ThumbnailBuilder, SectionBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
require('./utils/publicReplies').install(); // komut panelleri herkese görünür
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const { getGuild, updateGuild, createTicket, updateTicket, closeTicket, flushWrites } = require('./utils/database');
const { generateAutoReply } = require('./utils/ticketAi');
const { startWebServer } = require('./utils/webServer');
const { startBackupSchedule } = require('./utils/backup');
const { startTopggPoster } = require('./utils/topgg');
const { startWeeklyReportSchedule } = require('./utils/report');
const { startDmSeriesSchedule } = require('./utils/dmSeries');
const { handleVoiceStateUpdate, addTranscript } = require('./utils/voiceMod');
const { createTranslator, getGuildLanguage } = require('./utils/i18n');
const lt = (i, tr, en) => (getGuildLanguage(i.guildId || i.guild?.id) === 'en' ? en : tr);
const { captureSnapshot, save, rollback } = require('./utils/snapRestore');
const cekilis = require('./commands/cekilis');
const { activeGames, kelimeListesi, dogrulukSorulari, cesaretGorevleri, truthQuestionsEn, dareTasksEn } = require('./utils/gameData');
const { handleAuditLog, checkHoneypot } = require('./utils/antiNuke');
const { safeClosePanel } = require('./utils/panelHelper');

const client = new Client({
  presence: {
    status: "idle",
    activities: [{ name: "betterwithaegis.com | /help", type: ActivityType.Watching }]
  },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildModeration, // Includes Audit Logs
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildWebhooks, // For webhook tracking
    GatewayIntentBits.DirectMessages, // DM: öneri ödülü ekran görüntüsü, bot kaldırma onay kodu
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember],
});
require('./utils/langContext').install(client); // olay sunucusunu hatırla (İngilizce sunucularda Türkçe sabit metinleri çevirmek için)


client.commands = new Collection();

// Yeni özellikler: Jury, Parole, Ticket Translate, Buddy (kendi dinleyicilerini ekler)
require('./features').init(client);
client.cooldowns = new Collection();

// Graceful shutdown için web server referansı (clientReady'de doldurulur)
let httpServer = null;

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commands = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    if (Array.isArray(command.data)) {
      for (const cmd of command.data) {
        client.commands.set(cmd.name, { ...command, data: cmd });
        const json = cmd.toJSON ? cmd.toJSON() : cmd;
        json.integration_types = [0]; // GuildInstall only (asla kullanıcıya / sana özel uygulama değil)
        json.contexts = [0];          // Guild only
        commands.push(json);
      }
    } else {
      client.commands.set(command.data.name, command);
      const json = command.data.toJSON ? command.data.toJSON() : command.data;
      json.integration_types = [0]; // GuildInstall only (asla kullanıcıya / sana özel uygulama değil)
      json.contexts = [0];          // Guild only
      commands.push(json);
    }
  }
}

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function registerCommands() {
  try {
    console.log('⚡ Slash komutları yükleniyor...');

    // Önce TÜM guild-specific komutları temizle (global öncelikli olsun)
    for (const guild of client.guilds.cache.values()) {
      try {
        const guildCmds = await rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id));
        if (guildCmds.length > 0) {
          console.log(`🧹 ${guild.name}: ${guildCmds.length} guild-specific komut siliniyor...`);
          for (const gc of guildCmds) {
            await rest.delete(Routes.applicationGuildCommand(process.env.CLIENT_ID, guild.id, gc.id));
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // Önce mevcut GLOBAL komutları çek
    let existingCommands = [];
    try {
      existingCommands = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
      console.log(`📋 Mevcut ${existingCommands.length} global komut bulundu`);
    } catch (e) {
      console.log('📋 Mevcut komut alınamadı (ilk kurulum olabilir):', e.message);
    }

    // Local komut isimleri
    const localCommandNames = new Set(commands.map(c => c.name));

    // Discord'da olup local'de OLMAYAN komutları bul (eski Entry Point vs.)
    const commandsToDelete = existingCommands.filter(c => !localCommandNames.has(c.name));

    if (commandsToDelete.length > 0) {
      console.log(`🗑️ ${commandsToDelete.length} eski global komut siliniyor...`);
      for (const cmd of commandsToDelete) {
        try {
          await rest.delete(Routes.applicationCommand(process.env.CLIENT_ID, cmd.id));
          console.log(`  ✓ Silindi: ${cmd.name}`);
        } catch (e) {
          console.log(`  ✗ Silinemedi ${cmd.name}: ${e.message}`);
        }
      }
    }

    // Şimdi yeni komutları global olarak kaydet (temiz liste)
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ ' + commands.length + ' slash komutu global olarak yüklendi!');
  } catch (error) {
    console.error('❌ Komut yüklenirken hata:', error);
  }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// Bot ready - FIXED: clientReady instead of ready
client.once('clientReady', async () => {
  console.log(`🛡️  ${client.user.tag} aktif! Sunucular: ${client.guilds.cache.size}`);

  const updatePresence = () => {
    try {
      client.user?.setPresence({
        activities: [{ name: "betterwithaegis.com | /help", type: ActivityType.Watching }],
        status: "idle",
        afk: false
      });
    } catch (_) {}
  };

  updatePresence();
  setInterval(updatePresence, 15 * 60 * 1000);
  httpServer = startWebServer(client);
  startBackupSchedule();
  startTopggPoster(client);
  startWeeklyReportSchedule(client);
  startDmSeriesSchedule(client);
  const { startDeadChatWatcher } = require('./utils/chatAi');
  startDeadChatWatcher(client);

  // ─── AEGIS ZERO-TRUST SELF-HEALING USER-APP DAEMON ───
  // Her 15 dakikada bir tüm sunucuları sessizce tarayıp UseExternalApps izinlerini temizler
  const { disableExternalAppsForEveryone } = require('./utils/tokenSanitizer');
  setInterval(async () => {
    try {
      for (const [, guild] of client.guilds.cache) {
        await disableExternalAppsForEveryone(guild);
      }
    } catch (_) {}
  }, 15 * 60 * 1000);

  // Slash komutlarını kaydet (guild cache hazır olduğunda)
  await registerCommands();

  // Çekiliş timer'larını geri kur (restart güvenli)
  cekilis.restoreGiveaways(client);
  try { require('./utils/pollManager').restorePolls(client); } catch (e) { console.error('[Poll restore]', e.message); }

  // ÖNEMLİ: Discord, kalabalık sunucularda sadece ilk birkaç üyenin durumunu (presence)
  // otomatik gönderir. Oyun/durum loglarının HERKES için çalışması için tüm üyeleri
  // burada çekip önbelleğe (cache) almamız gerekiyor, yoksa presenceUpdate çoğu üye için hiç tetiklenmez.
  for (const guild of client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch();
      console.log(`👥 ${guild.name}: ${members.size} üye önbelleğe alındı (presence takibi için)`);
    } catch (err) {
      console.error(`⚠️ ${guild.name} üyeleri çekilemedi:`, err.message);
    }
  }
});

// Üye önbelleğini taze tutmak için periyodik olarak yeniden çek (presence takibi kopmasın diye)
setInterval(async () => {
  for (const guild of client.guilds.cache.values()) {
    await guild.members.fetch().catch(() => {});
  }
}, 10 * 60 * 1000); // 10 dakikada bir

// ─── Raid snapshot (geri-sar yedeği) — antiNuke açık sunucular için ────────
async function snapshotServers() {
  const { getNukeConfig } = require('./utils/antiNuke');
  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = getNukeConfig(guild.id);
      if (!cfg.enabled) continue;
      const snap = await captureSnapshot(guild).catch(() => null);
      if (snap) save(guild.id, snap);
    } catch {}
  }
}
setTimeout(() => { snapshotServers(); }, 60 * 1000);
setInterval(() => { snapshotServers(); }, 15 * 60 * 1000);

// Auto-update stats channels every 5 minutes
setInterval(async () => {
  for (const guild of client.guilds.cache.values()) {
    const settings = getGuild(guild.id);
    if (!settings.statsEnabled) continue;

    const members = guild.members.cache;
    const total = guild.memberCount;
    const bots = members.filter(m => m.user.bot).size;
    const humans = total - bots;
    const boosts = guild.premiumSubscriptionCount || 0;

    if (settings.memberCountChannel) {
      const ch = guild.channels.cache.get(settings.memberCountChannel);
      if (ch) ch.setName(`👥 Toplam: ${total}`).catch(() => {});
    }
    if (settings.humanCountChannel) {
      const ch = guild.channels.cache.get(settings.humanCountChannel);
      if (ch) ch.setName(`👤 İnsan: ${humans}`).catch(() => {});
    }
    if (settings.botCountChannel) {
      const ch = guild.channels.cache.get(settings.botCountChannel);
      if (ch) ch.setName(`🤖 Bot: ${bots}`).catch(() => {});
    }
    if (settings.boostCountChannel) {
      const ch = guild.channels.cache.get(settings.boostCountChannel);
      if (ch) ch.setName(`🚀 Boost: ${boosts}`).catch(() => {});
    }
  }
}, 300000);

// Interaction handler
// ─── Yönetim paneli koruması ─────────────────────────────────────────────────
// Bu panellerin mesajları herkese açık gönderiliyor ve düğmeleri genel işleyicilerde çalışıyor; yetki denetimi
// olmadan kanalı gören herkes PANIC MODE'u açabiliyor, Anti-Nuke'u kapatabiliyor, kendini beyaz listeye ekleyebiliyordu.
// Burada, bu kimliklerle gelen her düğme/menü/pencere etkileşimi için yetki aranır.
const ADMIN_PANEL_PREFIXES = [
  'antinuke_', 'antiraid_', 'automod_', 'kur_', 'karsilama_', 'otorol_', 'rules_toggle_',
  'toggle_antiraid', 'toggle_automod', 'toggle_mod', 'toggle_invite', 'toggle_antiinvite',
  'add_word', 'panel_modal_',
];
const MOD_PANEL_PREFIXES = ['mod_confirm_', 'modlog_confirm_', 'mod_menu_'];

// Bu düğmeleri genel işleyici (aşağıda) ve panelin kendi collector'ı birlikte yakalıyordu: aç/kapat iki kez çalışıp
// eski hâline dönüyor, panel yalan söylüyordu. Genel işleyici sahiplenir, collector'lar bayrağı görünce geçer.
const GLOBAL_OWNED_PREFIXES = ['automod_toggle_', 'karsilama_toggle_', 'karsilama_chan_', 'karsilama_leave_', 'karsilama_boost_', 'otorol_toggle_', 'otorol_reset_'];

function panelAccessDenied(interaction) {
  const id = interaction.customId;
  if (!id || !interaction.guild || interaction.isChatInputCommand?.() || interaction.isAutocomplete?.()) return false;
  if (interaction.user.id === interaction.guild.ownerId) return false;
  const perms = interaction.memberPermissions;
  const has = (...flags) => flags.some((f) => perms?.has(f));
  if (ADMIN_PANEL_PREFIXES.some((p) => id.startsWith(p))) return !has(PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild);
  if (MOD_PANEL_PREFIXES.some((p) => id.startsWith(p))) return !has(PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers);
  return false;
}

client.on('interactionCreate', async interaction => {
  if (interaction.customId && GLOBAL_OWNED_PREFIXES.some((p) => interaction.customId.startsWith(p))) interaction.__globalHandled = true;
  if (panelAccessDenied(interaction)) {
    const isEn = getGuildLanguage(interaction.guildId) === 'en';
    return interaction.reply({ content: isEn ? ':aegis_lock: Only server administrators can use this panel.' : ':aegis_lock: Bu paneli yalnızca sunucu yöneticileri kullanabilir.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  // Otomatik tamamlama (örn. /language, /giveaway id)
  if (interaction.isAutocomplete && interaction.isAutocomplete()) {
    const ac = client.commands.get(interaction.commandName);
    if (ac && typeof ac.autocomplete === 'function') {
      try { await ac.autocomplete(interaction); } catch (e) { console.error('[Autocomplete]', e.message); }
    }
    return;
  }
  // Helper for safe responses that never throw InteractionNotReplied or InteractionAlreadyReplied
  const safeReply = async (opts) => {
    try {
      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply(opts);
      } else {
        return await interaction.reply(opts);
      }
    } catch (err) {
      console.error('[safeReply error]', err.message);
    }
  };

  const safeUpdate = async (opts) => {
    try {
      if (interaction.deferred) {
        return await interaction.editReply(opts);
      } else if (interaction.replied) {
        return await interaction.followUp(opts);
      } else {
        return await interaction.update(opts);
      }
    } catch (err) {
      console.error('[safeUpdate error]', err.message);
    }
  };

  // Modal submissions
  if (interaction.isModalSubmit()) {
    const { customId } = interaction;

    // AutoMod Word Add Modal
    if (customId === 'automod_modal_word_add' || customId === 'automod_modal_word_remove') {
      const adding = customId === 'automod_modal_word_add';
      const word = interaction.fields.getTextInputValue('word_text')?.trim().toLowerCase();
      if (!word) {
        return safeReply({ content: lt(interaction, ':aegis_no: Geçerli bir kelime girmelisiniz.', ':aegis_no: You must enter a valid word.'), flags: MessageFlags.Ephemeral });
      }
      const db = require('./utils/database');
      const changed = adding ? db.addBannedWord(interaction.guildId, word) : db.removeBannedWord(interaction.guildId, word);
      const note = adding
        ? (changed ? `:aegis_ok: **"${word}"** yasaklı kelime listesine eklendi!` : `:aegis_info: **"${word}"** zaten listede.`)
        : (changed ? `:aegis_ok: **"${word}"** listeden kaldırıldı!` : `:aegis_no: **"${word}"** listede bulunamadı.`);
      // Panel açık mesajdan geldiyse listeyi ve sayacı hemen yenile (eskiden eski sayı kalıyordu)
      if (interaction.isFromMessage?.()) {
        const { buildAutoModPanel } = require('./commands/automod');
        await interaction.update({ components: [buildAutoModPanel(interaction.guildId)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return interaction.followUp({ content: note, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return safeReply({ content: note, flags: MessageFlags.Ephemeral });
    }

    // Karşılama Mesajı Düzenleme Modalı
    if (customId === 'karsilama_modal_msg') {
      const msg = interaction.fields.getTextInputValue('welcome_text')?.trim();
      if (!msg) {
        return safeReply({ content: lt(interaction, '❌ Geçerli bir mesaj metni girmelisiniz.', '❌ You must enter a valid message.'), flags: MessageFlags.Ephemeral });
      }
      const { updateGuild } = require('./utils/database');
      updateGuild(interaction.guildId, { welcomeMessage: msg });
      return safeReply({ content: lt(interaction, `✅ Karşılama mesajı başarıyla güncellendi:\n> \`${msg}\``, `✅ Welcome message updated:\n> \`${msg}\``), flags: MessageFlags.Ephemeral });
    }

    // İtiraf Modalı
    if (customId === 'itiraf_modal_submit') {
      const text = interaction.fields.getTextInputValue('itiraf_text');
      const itirafMod = require('./commands/itiraf');
      const res = await itirafMod.postConfession(interaction.guild, text, null, interaction.user.id);
      if (!res.ok) {
        return safeReply({ content: `❌ ${res.error}`, flags: MessageFlags.Ephemeral });
      }
      return safeReply({
        content: lt(interaction, `✅ İtirafın başarıyla ve **%100 anonim** olarak <#${res.channelId}> kanalında paylaşıldı! (İtiraf #${res.number})`, `✅ Your confession was posted **100% anonymously** in <#${res.channelId}>! (Confession #${res.number})`),
        flags: MessageFlags.Ephemeral
      });
    }

    // Sunucu paneli modalları
    if (customId === 'panel_modal_autorole') {
      const roleId = interaction.fields.getTextInputValue('role_id');
      const settings = getGuild(interaction.guild.id);
      if (!interaction.guild.roles.cache.has(roleId)) {
        return safeReply({ content: '❌ Rol bulunamadı! / Role not found!', flags: MessageFlags.Ephemeral });
      }
      updateGuild(interaction.guild.id, { autoRoleId: roleId });
      return safeReply({ content: `✅ Otorol ayarlandı / Auto-role configured: <@&${roleId}>`, flags: MessageFlags.Ephemeral });
    }

    if (customId === 'panel_modal_welcome') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const message = interaction.fields.getTextInputValue('message') || '';
      const settings = getGuild(interaction.guild.id);
      if (!interaction.guild.channels.cache.has(channelId)) {
        return safeReply({ content: '❌ Kanal bulunamadı! / Channel not found!', flags: MessageFlags.Ephemeral });
      }
      updateGuild(interaction.guild.id, { welcomeChannel: channelId, welcomeMessage: message });
      return safeReply({ content: `✅ Hoşgeldin kanalı ayarlandı / Welcome channel configured: <#${channelId}>`, flags: MessageFlags.Ephemeral });
    }

    if (customId === 'panel_modal_ticket') {
      const categoryId = interaction.fields.getTextInputValue('category_id');
      const staffRoleId = interaction.fields.getTextInputValue('staff_role_id');
      const logChannelId = interaction.fields.getTextInputValue('log_channel_id');
      if (!interaction.guild.channels.cache.has(categoryId)) {
        return safeReply({ content: '❌ Kategori bulunamadı! / Category not found!', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild.roles.cache.has(staffRoleId)) {
        return safeReply({ content: '❌ Rol bulunamadı! / Role not found!', flags: MessageFlags.Ephemeral });
      }
      if (!interaction.guild.channels.cache.has(logChannelId)) {
        return safeReply({ content: '❌ Log kanalı bulunamadı! / Log channel not found!', flags: MessageFlags.Ephemeral });
      }
      updateGuild(interaction.guild.id, {
        ticketCategory: categoryId,
        ticketStaffRole: staffRoleId,
        ticketLogChannel: logChannelId,
      });
      return safeReply({ content: `✅ Ticket ayarlandı: Kategori <#${categoryId}>, Yetkili <@&${staffRoleId}>, Log <#${logChannelId}>`, flags: MessageFlags.Ephemeral });
    }

  }

    // Button interactions
  if (interaction.isButton()) {
    const { customId } = interaction;

    // AI Davranış Anomalisi Karantina Butonları
    if (customId.startsWith("anm_restore_") || customId.startsWith("anm_ban_")) {
      const parts = customId.split("_");
      const action = parts[1]; // restore or ban
      const targetGuildId = parts[2];
      const targetUserId = parts[3];

      const isOwner = interaction.guild?.ownerId === interaction.user.id;
      const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
      if (!isOwner && !isAdmin) {
        return interaction.reply({
          content: lt(interaction, '❌ Bu işlemi sadece sunucu sahibi veya yöneticiler gerçekleştirebilir.', '❌ Only the server owner or administrators can do this.'),
          flags: MessageFlags.Ephemeral,
        });
      }

      const { resolveQuarantine } = require("./utils/anomalyDetector");
      const res = await resolveQuarantine(interaction.guild, targetUserId, action, interaction.member);
      return interaction.reply({
        content: res.ok ? `✅ ${res.message}` : `❌ ${res.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Muzik kontrolleri (Pause/Resume/Skip/Stop/Queue)
    if (customId.startsWith("music_")) {
      const musicManager = require("./utils/musicManager");
      const handled = await musicManager.handleButton(interaction);
      if (handled) return;
    }

    // Trivia (Şarkıyı Tahmin Et) Butonları
    if (customId.startsWith("trivia_")) {
      const musicTrivia = require("./utils/musicTrivia");
      const handled = await musicTrivia.handleTriviaButton(interaction);
      if (handled) return;
    }

    // Ticket 5-Yıldız Memnuniyet Anketi Butonları
    if (customId.startsWith("ticket_rate_")) {
      const parts = customId.split("_");
      const rating = parseInt(parts[2], 10);
      const ticketId = parts.slice(3).join("_");
      const gid = interaction.guildId || interaction.guild?.id;
      const settings = getGuild(gid);

      const stars = "⭐".repeat(rating);
      const rateContainer = new ContainerBuilder().setAccentColor(0xf0b232);
      rateContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# ⭐ Geri Bildiriminiz Alındı!\n\n` +
          `Değerlendirmeniz: **${stars} (${rating}/5)**\n` +
          `Aegis Destek ekibine puan verdiğiniz için teşekkür ederiz!`
        )
      );

      const disabledRow = new ActionRowBuilder().addComponents(
        [1, 2, 3, 4, 5].map(num =>
          new ButtonBuilder()
            .setCustomId(`ticket_rated_${num}`)
            .setLabel(`${"⭐".repeat(num)} ${num}`)
            .setStyle(num === rating ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(true)
        )
      );
      rateContainer.addSeparatorComponents(new SeparatorBuilder());
      rateContainer.addActionRowComponents(disabledRow);

      if (gid) {
        updateTicket(gid, ticketId, {
          rating,
          ratedAt: Date.now(),
          ratedBy: interaction.user.id,
        });
      }

      await interaction.update({ components: [rateContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});

      if (settings?.ticketLogChannel && interaction.guild) {
        const logChannel = interaction.guild.channels.cache.get(settings.ticketLogChannel);
        if (logChannel) {
          const logRateContainer = new ContainerBuilder().setAccentColor(0xf0b232);
          logRateContainer.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# ⭐ Ticket Değerlendirmesi Alındı\n\n` +
              `• **Ticket ID:** \`${ticketId}\`\n` +
              `• **Kullanıcı:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
              `• **Verilen Puan:** ${stars} **(${rating}/5)**`
            )
          );
          await logChannel.send({ components: [logRateContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
      }
      return;
    }

    // Raid rollback butonu
    if (customId.startsWith('rollback_')) {
      const gid = customId.replace('rollback_', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const guild = client.guilds.cache.get(gid);
      if (!guild) return interaction.editReply({ content: lt(interaction, 'Sunucu bulunamadı veya bot artık içinde değil.', 'Server not found or the bot is no longer in it.') }).catch(() => {});
      const res = await rollback(guild, client).catch((e) => ({ ok: false, message: `Geri sarılamadı: ${e.message}` }));
      await interaction.editReply({ content: res.ok ? `✅ ${res.message}` : res.message }).catch(() => {});
      return;
    }

    // Sunucu yedekleme onay / iptal butonları
    if (customId.startsWith('backup_confirm_') || customId.startsWith('backup_cancel_')) {
      const yedekCmd = client.commands.get('backup');
      if (yedekCmd && typeof yedekCmd.handleButton === 'function') {
        return yedekCmd.handleButton(interaction);
      }
      return;
    }

    // TICKET CREATE BUTTON (Destek, Şikayet, Başvuru)
    if (customId.startsWith('create_ticket')) {
      const t = createTranslator(interaction.guild.id);
      await interaction.deferReply({ ephemeral: true });

      const lang = getGuildLanguage(interaction.guild.id);
      const isEn = lang === 'en';
      const isSikayet = customId.includes('sikayet');
      const isBasvuru = customId.includes('basvuru');
      const categoryType = isSikayet ? (isEn ? 'Feedback & Suggestions' : 'Şikayet & Öneri') : (isBasvuru ? (isEn ? 'Staff Application' : 'Yetkili & Başvuru') : (isEn ? 'General Support' : 'Genel Destek'));
      const ticketPrefix = isSikayet ? (isEn ? 'feedback-' : 'sikayet-') : (isBasvuru ? (isEn ? 'apply-' : 'basvuru-') : 'ticket-');

      const settings = getGuild(interaction.guild.id);
      if (!settings.ticketCategory || !settings.ticketStaffRole) {
        return interaction.editReply({
          content: t('ticket.config_missing'),
        });
      }

      const existingTicket = Object.values(settings.tickets || {}).find(
        t => t.userId === interaction.user.id && !t.closed
      );
      if (existingTicket) {
        const channel = await interaction.guild.channels.fetch(existingTicket.channelId).catch(() => null);
        if (channel) {
          return interaction.editReply({
            content: t('ticket.already_open', { channel: '<#' + existingTicket.channelId + '>' }),
          });
        } else {
          existingTicket.closed = true;
          existingTicket.closedAt = Date.now();
          const tickets = { ...settings.tickets };
          tickets[Object.keys(settings.tickets).find(k => settings.tickets[k] === existingTicket)] = existingTicket;
          updateGuild(interaction.guild.id, { tickets });
        }
      }

      const ticketNum = (settings.ticketCounter || 0) + 1;
      const ticketId = ticketPrefix + ticketNum;

      const ticketChannel = await interaction.guild.channels.create({
        name: ticketId,
        type: ChannelType.GuildText,
        parent: settings.ticketCategory,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: settings.ticketStaffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ],
      }).catch(() => null);

      if (!ticketChannel) {
        console.log('[Ticket Debug] ticketChannel creation failed');
        return interaction.editReply({ content: t('ticket.creation_failed') });
      }

      console.log('[Ticket Debug] ticketChannel created:', ticketChannel.id, 'ticketId:', ticketId);
      const createdTicket = createTicket(interaction.guild.id, ticketId, {
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        channelId: ticketChannel.id,
        createdAt: Date.now(),
        categoryType,
        closed: false,
      });
      console.log('[Ticket Debug] createTicket result:', createdTicket);

      // Açılış mesajı: kart, karşılama, yönergeler ve kapatma düğmesi (utils/ticketWelcome.js)
      const { buildTicketWelcome } = require('./utils/ticketWelcome');
      const welcome = await buildTicketWelcome({
        guild: interaction.guild, user: interaction.user, ticketId, categoryType,
        staffRoleId: settings.ticketStaffRole, createdAt: createdTicket?.createdAt || Date.now(),
      });
      await ticketChannel.send(welcome);

      // AI Auto Reply on ticket create
      if (settings.ticketAiEnabled && settings.ticketAiConfig?.autoReply) {
        try {
          const ticketData = {
            id: ticketId,
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: ticketChannel.id
          };
          const autoReply = await generateAutoReply(ticketData, settings, interaction.guild);
          if (autoReply) {
            const isEn = (settings.language === 'en') || (interaction.guild?.preferredLocale && !interaction.guild.preferredLocale.startsWith('tr'));
            const autoContainer = new ContainerBuilder().setAccentColor(0x3ba55c);
            autoContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(autoReply)
            );
            autoContainer.addSeparatorComponents(new SeparatorBuilder());
            autoContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(isEn ? '-# 🤖 Aegis AI Assistant · Auto Welcome' : '-# 🤖 Aegis AI Asistanı · Otomatik Hoşgeldin')
            );
            await ticketChannel.send({ components: [autoContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
          }
        } catch (e) {
          console.error('[TicketAI] Auto-reply error:', e.message);
        }
      }

      await interaction.editReply({
        content: isEn ? `:aegis_ok: Your ticket is open: <#${ticketChannel.id}>` : `:aegis_ok: Destek talebin açıldı: <#${ticketChannel.id}>`,
      });
      return;
    }

    // CLOSE TICKET BUTTON
    if (customId === 'close_ticket') {
      const t = createTranslator(interaction.guild.id);
      const settings = getGuild(interaction.guild.id);
      const channel = interaction.channel;

      const ticketId = Object.keys(settings.tickets || {}).find(id => 
        settings.tickets[id].channelId === channel.id && !settings.tickets[id].closed
      );

      if (!ticketId) {
        return safeReply({ content: t('ticket.not_a_ticket'), flags: MessageFlags.Ephemeral });
      }

      // Sadece adminler (veya yetkili rolüne sahip olanlar) ticketı kapatabilir
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      const hasStaffRole = settings.ticketStaffRole && interaction.member.roles.cache.has(settings.ticketStaffRole);
      if (!isAdmin && !hasStaffRole) {
        return safeReply({
          content: t('ticket.no_permission_close'),
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply().catch(() => {});
      const ticket = settings.tickets[ticketId];

      const { generateHtmlTranscript, generateTextTranscript } = require('./utils/ticketTranscript');
      const messages = await channel.messages.fetch({ limit: 100 }).catch(() => new Map());
      const transcriptText = generateTextTranscript(messages);
      const transcriptHtml = generateHtmlTranscript({
        guild: interaction.guild,
        channel,
        ticket,
        messages,
        closedBy: interaction.user,
      });

      const textBuffer = Buffer.from(transcriptText, 'utf-8');
      const htmlBuffer = Buffer.from(transcriptHtml, 'utf-8');

      // Components V2 Transcript Container
      const transcriptContainer = new ContainerBuilder().setAccentColor(0xed4245);

      transcriptContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(t('ticket.transcript_title', { ticketId }))
      );
      transcriptContainer.addSeparatorComponents(new SeparatorBuilder());
      transcriptContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          t('ticket.transcript_info', {
            opener: '<@' + ticket.userId + '>',
            openerTag: ticket.userTag,
            closer: '<@' + interaction.user.id + '>',
            opened: '<t:' + Math.floor(ticket.createdAt / 1000) + ':R>',
            closed: '<t:' + Math.floor(Date.now() / 1000) + ':R>',
            count: messages.size
          })
        )
      );
      transcriptContainer.addSeparatorComponents(new SeparatorBuilder());

      const recentMessages = Array.from(messages.values()).reverse().slice(-10);
      if (recentMessages.length > 0) {
        transcriptContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            t('ticket.transcript_recent') + '\n' +
            recentMessages.map(m => '> **' + m.author.tag + ':** ' + m.content.slice(0, 180)).join('\n')
          )
        );
      }
      transcriptContainer.addSeparatorComponents(new SeparatorBuilder());

      if (settings.ticketLogChannel) {
        const logChannel = interaction.guild.channels.cache.get(settings.ticketLogChannel);
        if (logChannel) {
          // Kapanış kartı (süre, mesaj sayısı, kapatan): çizilemezse yalnızca transkript gider
          const cardFiles = [];
          try {
            const { ticketCard } = require('./utils/canvas/cards');
            const opener = await client.users.fetch(ticket.userId).catch(() => null);
            const parsed = Number(new Date(ticket.createdAt || ticket.openedAt || channel.createdTimestamp));
            const started = Number.isFinite(parsed) ? parsed : (channel.createdTimestamp || Date.now());
            const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
            const isEn0 = getGuildLanguage(interaction.guild.id) === 'en';
            const duration = mins >= 1440 ? `${Math.floor(mins / 1440)}${isEn0 ? 'd' : 'g'}` : mins >= 60 ? `${Math.floor(mins / 60)}${isEn0 ? 'h' : 'sa'} ${mins % 60}${isEn0 ? 'm' : 'dk'}` : `${mins}${isEn0 ? 'm' : 'dk'}`;
            const png = await ticketCard({ id: String(ticketId).replace(/^ticket-?/i, ''), openerName: opener?.displayName || opener?.username || '—', avatarUrl: opener?.displayAvatarURL({ extension: 'png', size: 256 }) || null, duration, messages: messages.size, closedBy: interaction.user.displayName || interaction.user.username, isEn: isEn0 });
            const { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
            cardFiles.push(new AttachmentBuilder(png, { name: 'ticket-card.png' }));
            transcriptContainer.spliceComponents(0, 0, new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://ticket-card.png').setDescription('Ticket closed')));
          } catch (e) { console.error('[ticket card]', e.message); }
          await logChannel.send({
            components: [transcriptContainer],
            files: [
              ...cardFiles,
              { attachment: htmlBuffer, name: `${ticketId}-transkript.html` },
              { attachment: textBuffer, name: `${ticketId}-transkript.txt` },
            ],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => {});
        }
      }

      closeTicket(interaction.guild.id, ticketId);

      // 5-Star Rating Survey Buttons
      const starRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_rate_1_${ticketId}`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ticket_rate_2_${ticketId}`).setLabel('⭐⭐ 2').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ticket_rate_3_${ticketId}`).setLabel('⭐⭐⭐ 3').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ticket_rate_4_${ticketId}`).setLabel('⭐⭐⭐⭐ 4').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ticket_rate_5_${ticketId}`).setLabel('⭐⭐⭐⭐⭐ 5').setStyle(ButtonStyle.Success)
      );

      // Send to ticket creator DM
      try {
        const ticketOwner = await client.users.fetch(ticket.userId).catch(() => null);
        if (ticketOwner) {
          const dmContainer = new ContainerBuilder().setAccentColor(0x5865f2);
          dmContainer.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `# 🎫 Destek Talebiniz Kapatıldı • ${ticketId}\n\n` +
              `**${interaction.guild.name}** sunucusundaki destek talebiniz **${interaction.user.tag}** tarafından kapatılmıştır.\n` +
              `Sohbet geçmişinizin HTML transkripti ekte yer almaktadır.\n\n` +
              `Lütfen aldığınız desteği aşağıdaki butonlarla puanlayın:`
            )
          );
          dmContainer.addSeparatorComponents(new SeparatorBuilder());
          dmContainer.addActionRowComponents(starRow);

          await ticketOwner.send({
            components: [dmContainer],
            files: [{ attachment: htmlBuffer, name: `${ticketId}-transkript.html` }],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => {});
        }
      } catch (_) {}

      // Kapanma bildirimi
      const closeContainer = new ContainerBuilder().setAccentColor(0xed4245);
      closeContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('ticket.closed')));
      closeContainer.addSeparatorComponents(new SeparatorBuilder());
      closeContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          t('ticket.closed_info', { closer: '<@' + interaction.user.id + '>' }) + '\n\n' +
          '📄 **HTML ve TXT Transkript** log kanalına ve kullanıcının özel mesajına (DM) gönderildi.\n' +
          '⭐ Lütfen aşağıdaki butonlardan aldığınız hizmeti puanlayın:\n' +
          '⏱️ Kanal **12 saniye** içinde otomatik olarak silinecektir.'
        )
      );
      closeContainer.addSeparatorComponents(new SeparatorBuilder());
      closeContainer.addActionRowComponents(starRow);

      await interaction.editReply({
        components: [closeContainer],
        flags: MessageFlags.IsComponentsV2,
      });

      setTimeout(() => {
        channel.delete().catch(() => {});
      }, 12000);
      return;
    }

    // SETTINGS BUTTONS
    if (customId === 'toggle_antiinvite' || customId === 'toggle_invite') {
      const settings = getGuild(interaction.guild.id);
      const newVal = !settings.antiInvite;
      updateGuild(interaction.guild.id, { antiInvite: newVal });
      return safeReply({
        content: '🔒 Anti-Invite ' + (newVal ? '**açıldı** ✅' : '**kapandı** ❌') + '!',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (customId === 'toggle_automod' || customId === 'toggle_mod') {
      const settings = getGuild(interaction.guild.id);
      const newVal = !settings.autoMod;
      updateGuild(interaction.guild.id, { autoMod: newVal });
      return safeReply({
        content: '🛡️ AutoMod ' + (newVal ? '**açıldı** ✅' : '**kapandı** ❌') + '!',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (customId === 'toggle_antiraid') {
      const settings = getGuild(interaction.guild.id);
      const newVal = !settings.antiRaid;
      updateGuild(interaction.guild.id, { antiRaid: newVal });
      return safeReply({
        content: '🚨 Anti-Raid ' + (newVal ? '**açıldı** ✅' : '**kapandı** ❌') + '!',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (customId === 'add_word') {
      return safeReply({
        content: lt(interaction, '➕ Yasaklı kelime eklemek için `/automod` veya Dashboard kullanın.', '➕ Use `/automod` or the Dashboard to add banned words.'),
        flags: MessageFlags.Ephemeral,
      });
    }

    // KURAL BOTU BUTONU
    if (customId.startsWith('rules_accept_')) {
      // Kanaldaki kural mesajının düğmesi: rules_accept_<sunucuId> (üye kimliği yok). DM'deki onay düğmesi
      // rules_accept_<sunucuId>_<üyeId> biçimindedir ve eski işleyiciye gider.
      if (/^rules_accept_\d+$/.test(customId) && interaction.guild) {
        const { getRulesBot } = require('./utils/database');
        const rb = getRulesBot(interaction.guild.id);
        const isEn = getGuildLanguage(interaction.guild.id) === 'en';
        if (!rb.enabled || !rb.verifiedRoleId) {
          return interaction.reply({ content: isEn ? ':aegis_no: The rules system is not set up.' : ':aegis_no: Kural sistemi kurulu değil.', flags: MessageFlags.Ephemeral });
        }
        if (interaction.member.roles.cache.has(rb.verifiedRoleId)) {
          return interaction.reply({ content: isEn ? ':aegis_ok: You already accepted the rules.' : ':aegis_ok: Kuralları zaten onayladın.', flags: MessageFlags.Ephemeral });
        }
        try {
          await interaction.member.roles.add(rb.verifiedRoleId, 'Kuralları onayladı');
        } catch (e) {
          return interaction.reply({ content: isEn ? ':aegis_sad: I could not give you the role. Please tell a moderator.' : ':aegis_sad: Rolünü veremedim. Lütfen bir yetkiliye haber ver.', flags: MessageFlags.Ephemeral });
        }
        if (rb.logChannelId) interaction.guild.channels.cache.get(rb.logChannelId)?.send({ content: `:aegis_ok: <@${interaction.user.id}> kuralları onayladı.`, allowedMentions: { parse: [] } }).catch(() => {});
        return interaction.reply({ content: isEn ? `:aegis_happy: Thanks! You now have <@&${rb.verifiedRoleId}>.` : `:aegis_happy: Teşekkürler! Artık <@&${rb.verifiedRoleId}> rolüne sahipsin.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      }
      const { handleRulesAccept } = require('./utils/database');
      return handleRulesAccept(interaction, client);
    }

    // MODLOG INTERACTIVE BUTTONS - using a simple in-memory store
    if (customId.startsWith('modlog_confirm_')) {
      // Parse: modlog_confirm_<action>_<targetUserId>_<reasonHash>
      // We'll need a better storage - for now just show a message
      return safeReply({ content: 'İşlem onaylandı! Gerçek moderasyon komutlarını (/ban, /kick, /timeout, /uyar) kullanın.', flags: MessageFlags.Ephemeral });
    }

    if (customId === 'modlog_cancel') {
      return safeClosePanel(interaction, '📋 ModLog iptal edildi.');
    }

    // MODERASYON BUTONLARI
    if (customId.startsWith('mod_menu_')) {
      // Show submenu - for now just close
      return safeReply({ content: 'Bu menü için komutları kullanın: /moderation uyar, /moderation ban, /moderation timeout, /moderation temizle', flags: MessageFlags.Ephemeral });
    }

    if (customId === 'mod_cancel') {
      return safeClosePanel(interaction, '⛔ Moderasyon iptal edildi.');
    }

    if (customId === 'mod_close') {
      return safeClosePanel(interaction, '🛡️ Moderasyon paneli kapatıldı.');
    }

    // Eski moderasyon menüsünün onay düğmeleri (mod_confirm_*): bu akışın işleyicileri artık çalışmıyordu (tanımsız değişkenler).
    // Yeni /moderation bu düğmeleri üretmez; eski mesajlardan gelenlere yönlendirme yapılır.
    if (customId.startsWith('mod_confirm_')) {
      return interaction.reply({ content: ':aegis_info: Bu düğme eski bir moderasyon menüsüne ait. Lütfen `/moderation` komutunu kullan. / This button belongs to an old moderation menu, please use `/moderation`.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // UYAR ONLAY
    if (customId.startsWith('mod_confirm_warn_')) {
      const parts = customId.replace('mod_confirm_warn_', '').split('_');
      const targetUserId = parts[0];
      const sebep = decodeURIComponent(parts.slice(1).join('_'));

      const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
      if (!targetUser) {
        return safeReply({ content: '❌ Kullanıcı bulunamadı!', flags: MessageFlags.Ephemeral });
      }

      const warnData = {
        id: Date.now().toString(36),
        reason: sebep,
        moderator: interaction.user.id,
        timestamp: Date.now(),
      };
      const allWarnings = addWarning(interaction.guild.id, targetUserId, warnData);

      // DM
      await targetUser.send({
        content: `⚠️ **${interaction.guild.name}** sunucusunda uyarıldın!\n**Sebep:** ${sebep}\n**Toplam Uyarı:** ${allWarnings.length}`,
      }).catch(() => {});

      // Log
      await sendChannelLog(interaction.guild, interaction.client, settings.logChannel, {
        title: 'Kullanıcı Uyarıldı',
        description: `**Kullanıcı:** <@${targetUserId}>\n**Moderatör:** <@${interaction.user.id}>\n**Sebep:** ${sebep}\n**Toplam:** ${allWarnings.length}`,
        color: 0xffaa00,
      });

      const container = new ContainerBuilder()
        .setAccentColor(0x3ba55c);

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# ✅ Uyarı Verildi`)
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Kullanıcı:** ${targetUser.tag} (<@${targetUserId}>)\n` +
          `**Sebep:** ${sebep}\n` +
          `**Toplam Uyarı:** ${allWarnings.length}`
        )
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('mod_close').setLabel('✕ Kapat').setStyle(ButtonStyle.Danger),
        )
      );

      return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // BAN ONLAY
    if (customId.startsWith('mod_confirm_ban_')) {
      const parts = customId.replace('mod_confirm_ban_', '').split('_');
      const targetUserId = parts[0];
      const mesajSilGun = parseInt(parts[1]);
      const sebep = decodeURIComponent(parts.slice(2).join('_'));

      const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
      if (!targetUser) {
        return safeReply({ content: '❌ Kullanıcı bulunamadı!', flags: MessageFlags.Ephemeral });
      }

      const banDm = await require('./features/punishDm').sendPunishDm(interaction.guild, targetUser, 'ban', sebep);
      const banned = await interaction.guild.members.ban(targetUserId, { reason: sebep, deleteMessageSeconds: mesajSilGun * 86400 }).then(() => true).catch(() => false);
      if (!banned) await banDm?.undo();

      // Log
      await sendChannelLog(interaction.guild, interaction.client, settings.logChannel, {
        title: 'Kullanıcı Banlandı',
        description: `**Kullanıcı:** <@${targetUserId}>\n**Moderatör:** <@${interaction.user.id}>\n**Sebep:** ${sebep}\n**Mesaj Sil:** ${mesajSilGun} gün`,
        color: 0xff0000,
      });

      const container = new ContainerBuilder()
        .setAccentColor(0x3ba55c);

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# ✅ Ban Uygulandı`)
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Kullanıcı:** ${targetUser.tag} (<@${targetUserId}>)\n` +
          `**Sebep:** ${sebep}\n` +
          `**Mesaj Sil:** Son ${mesajSilGun} gün`
        )
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('mod_close').setLabel('✕ Kapat').setStyle(ButtonStyle.Danger),
        )
      );

      return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // TIMEOUT ONLAY
    if (customId.startsWith('mod_confirm_timeout_')) {
      const parts = customId.replace('mod_confirm_timeout_', '').split('_');
      const targetUserId = parts[0];
      const duration = parseInt(parts[1]);
      const sebep = decodeURIComponent(parts.slice(2).join('_'));

      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (!targetMember) {
        return safeReply({ content: '❌ Kullanıcı sunucuda değil!', flags: MessageFlags.Ephemeral });
      }

      const endTime = Date.now() + duration;
      await targetMember.timeout(duration, sebep).catch(() => {});

      // DM
      const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
      if (targetUser) {
        await targetUser.send({
          content: `⏱️ **${interaction.guild.name}** sunucusunda timeout aldın!\n**Süre:** <t:${Math.floor(endTime / 1000)}:R>\n**Sebep:** ${sebep}`,
        }).catch(() => {});
      }

      // Log
      await sendChannelLog(interaction.guild, interaction.client, settings.logChannel, {
        title: 'Kullanıcı Timeout Aldı',
        description: `**Kullanıcı:** <@${targetUserId}>\n**Moderatör:** <@${interaction.user.id}>\n**Süre:** <t:${Math.floor(endTime / 1000)}:R>\n**Sebep:** ${sebep}`,
        color: 0xffaa00,
      });

      const container = new ContainerBuilder()
        .setAccentColor(0x3ba55c);

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# ✅ Timeout Verildi`)
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Kullanıcı:** ${targetUser?.tag || targetUserId} (<@${targetUserId}>)\n` +
          `**Süre:** <t:${Math.floor(endTime / 1000)}:R>\n` +
          `**Sebep:** ${sebep}`
        )
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('mod_close').setLabel('✕ Kapat').setStyle(ButtonStyle.Danger),
        )
      );

      return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // ÇEKİLİŞ BUTONLARI
    if (customId.startsWith('gw_') || customId.startsWith('cekilis_')) {
      return cekilis.handleButton(interaction, client);
    }

    // İTİRAF PANELİ BUTONU
    if (customId === 'itiraf_btn_modal') {
      const itirafMod = require('./commands/itiraf');
      const modal = itirafMod.buildConfessionModal(getGuildLanguage(interaction.guildId) === 'en');
      return interaction.showModal(modal);
    }

    // /help içindeki "Changelog" butonu
    if (customId === 'yardim_changelog') {
      const { CHANGELOG } = require('./utils/changelog');
      const latest = CHANGELOG.slice(0, 3);
      const container = new ContainerBuilder()
        .setAccentColor(0x0066ff)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 🆕 Aegis Güncelleme Notları\n\n` +
            latest.map(c => `### v${c.version} (${c.date})\n${c.items.map(i => `• ${i}`).join('\n')}`).join('\n\n')
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('*Aegis Guard*'));
      return safeReply({ components: [container], flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] });
    }

    if (customId.startsWith('game_stop_')) {
      await interaction.deferUpdate();
      const gameType = customId.replace('game_stop_', '');
      const game = activeGames.get(interaction.channel.id);
      const isEn = getGuildLanguage(interaction.guildId) === 'en';

      activeGames.delete(interaction.channel.id);
      const stopContainer = new ContainerBuilder().setAccentColor(0x0066ff);
      stopContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${isEn ? 'Game over' : 'Oyun bitti'}`));
      stopContainer.addSeparatorComponents(new SeparatorBuilder());
      stopContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(isEn ? 'The game was ended.' : 'Oyun bitirildi.'));
      return interaction.editReply({ components: [stopContainer], flags: MessageFlags.IsComponentsV2 });
    }

    // Doğruluk Cesaret buttons
    if (customId === 'dc_dogruluk') {
      await interaction.deferUpdate();
      const truths = getGuildLanguage(interaction.guildId) === 'en' ? truthQuestionsEn : dogrulukSorulari;
      const question = truths[Math.floor(Math.random() * truths.length)];

      const container = new ContainerBuilder()
        .setAccentColor(0x0066ff);

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# 🗣️ ${lt(interaction, 'Doğruluk', 'Truth')}`)
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${lt(interaction, 'Soru', 'Question')}:** ${question}`)
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('dc_dogruluk').setLabel(lt(interaction, '🗣️ Başka Soru', '🗣️ Another Question')).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('dc_cesaret').setLabel(lt(interaction, '💪 Cesaret Seç', '💪 Pick Dare')).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('game_stop_dc').setLabel('⏹️ Kapat').setStyle(ButtonStyle.Secondary),
        )
      );

      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (customId === 'dc_cesaret') {
      await interaction.deferUpdate();
      const dares = getGuildLanguage(interaction.guildId) === 'en' ? dareTasksEn : cesaretGorevleri;
      const task = dares[Math.floor(Math.random() * dares.length)];

      const container = new ContainerBuilder()
        .setAccentColor(0xff66aa);

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# 💪 ${lt(interaction, 'Cesaret', 'Dare')}`)
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${lt(interaction, 'Görev', 'Dare')}:** ${task}`)
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('dc_dogruluk').setLabel(lt(interaction, '🗣️ Doğruluk Seç', '🗣️ Pick Truth')).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('dc_cesaret').setLabel(lt(interaction, '💪 Başka Görev', '💪 Another Dare')).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('game_stop_dc').setLabel('⏹️ Kapat').setStyle(ButtonStyle.Secondary),
        )
      );

      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // ANTIRAID BUTTONS
    if (customId.startsWith('antiraid_toggle_')) {
      const guildId = customId.replace('antiraid_toggle_', '');
      // Gerçek anahtar guild.antiRaid (setAntiRaidConfigField kategori+alan ister, burada hata fırlatıyordu)
      const newState = !getGuild(guildId).antiRaid;
      updateGuild(guildId, { antiRaid: newState });
      try {
        const { buildUnifiedSecurityPanel } = require('./commands/antiraid');
        const guild = interaction.guild || interaction.client.guilds.cache.get(guildId);
        if (guild) {
          const panel = buildUnifiedSecurityPanel(guild);
          return interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }
      } catch (_) {}
      return safeReply({ content: `🛡️ Anti-Raid ${newState ? '**açıldı** ✅' : '**kapatıldı** ❌'}`, flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('antiraid_config_')) {
      return safeReply({ content: lt(interaction, '⚙️ Eşik ayarları için `/antiraid` komutunu kullanın veya Dashboard\'a gidin.', '⚙️ Use `/antiraid` or the Dashboard for threshold settings.'), flags: MessageFlags.Ephemeral });
    }

    if (customId === 'antiraid_close') {
      return safeClosePanel(interaction, '🛡️ Anti-Raid paneli kapatıldı.');
    }

    // ANTI-NUKE BUTTONS
    if (customId.startsWith('antinuke_toggle_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_toggle_', '');
      const { getNukeConfig, saveNukeConfig } = require('./utils/antiNuke');
      const config = getNukeConfig(guildId);
      config.enabled = !config.enabled;
      saveNukeConfig(guildId, config);
      return showMainPanelFromButton(interaction, guildId);
    }

    if (customId.startsWith('antinuke_panic_')) {
      // Panik modu sunucuyu kilitler: yanlışlıkla basılmasın diye önce onay istenir
      const guildId = customId.replace('antinuke_panic_', '');
      const isEn = getGuildLanguage(interaction.guildId) === 'en';
      return interaction.reply({
        content: isEn ? ':aegis_alert: **Panic mode locks the whole server.** Are you sure?' : ':aegis_alert: **Panik modu sunucunun tamamını kilitler.** Emin misin?',
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`antinuke_panicgo_${guildId}`).setLabel(isEn ? 'Lock the server' : 'Sunucuyu kilitle').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`antinuke_panicno_${guildId}`).setLabel(isEn ? 'Cancel' : 'Vazgeç').setStyle(ButtonStyle.Secondary)
        )],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (customId.startsWith('antinuke_panicno_')) {
      return interaction.update({ content: ':aegis_ok: Vazgeçildi. / Cancelled.', components: [] }).catch(() => {});
    }

    if (customId.startsWith('antinuke_panicgo_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_panicgo_', '');
      const { triggerPanicMode } = require('./utils/antiNuke');
      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) return interaction.editReply({ content: lt(interaction, ':aegis_no: Sunucu bulunamadı', ':aegis_no: Server not found'), components: [] });
      await triggerPanicMode(guild, interaction.client, interaction.user, 'Buton ile manuel tetikleme');
      return interaction.editReply({ content: lt(interaction, ':aegis_lock: Panik modu açıldı, sunucu kilitlendi. Kilidi `/antiraid` panelinden kaldırabilirsin.', ':aegis_lock: Panic mode is on and the server is locked. Lift it from the `/antiraid` panel.'), components: [] });
    }

    if (customId.startsWith('antinuke_unpanic_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_unpanic_', '');
      const { disablePanicModeManual } = require('./utils/antiNuke');
      const guild = interaction.client.guilds.cache.get(guildId);
      if (guild) {
        const result = await disablePanicModeManual(guild, interaction.client, interaction.user);
        return showMainPanelFromButton(interaction, guildId);
      }
      return interaction.editReply({ content: lt(interaction, '❌ Sunucu bulunamadı', '❌ Server not found'), flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('antinuke_whitelist_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_whitelist_', '');
      return showWhitelistPanel(interaction, guildId);
    }

    if (customId.startsWith('antinuke_honeypot_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_honeypot_', '');
      const { getNukeConfig, saveNukeConfig, createHoneypots } = require('./utils/antiNuke');
      const guild = interaction.client.guilds.cache.get(guildId);
      const config = getNukeConfig(guildId);
      config.honeypotEnabled = !config.honeypotEnabled;
      if (config.honeypotEnabled && guild) {
        await createHoneypots(guild, interaction.client);
      } else {
        config.honeypotChannels = [];
      }
      saveNukeConfig(guildId, config);
      return showMainPanelFromButton(interaction, guildId);
    }

    if (customId.startsWith('antinuke_config_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_config_', '');
      return showConfigPanel(interaction, guildId);
    }

    if (customId.startsWith('antinuke_actions_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_actions_', '');
      return showActionsPanel(interaction, guildId);
    }

    if (customId.startsWith('antinuke_status_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_status_', '');
      return showStatusPanel(interaction, guildId);
    }

    if (customId.startsWith('antinuke_close_')) {
      return safeClosePanel(interaction, '🛡️ Anti-Nuke paneli kapatıldı.');
    }

    // Whitelist sub-buttons
    if (customId.startsWith('antinuke_wl_add_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_wl_add_', '');
      return showWhitelistAddModal(interaction, guildId);
    }

    if (customId.startsWith('antinuke_wl_remove_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_wl_remove_', '');
      return showWhitelistRemoveModal(interaction, guildId);
    }

    if (customId.startsWith('antinuke_wl_back_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_wl_back_', '');
      return showMainPanelFromButton(interaction, guildId);
    }

    // Config sub-buttons
    if (customId.startsWith('antinuke_cfg_save_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_cfg_save_', '');
      return saveConfigFromModal(interaction, guildId);
    }

    if (customId.startsWith('antinuke_cfg_back_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_cfg_back_', '');
      return showMainPanelFromButton(interaction, guildId);
    }

    // Actions sub-buttons
    if (customId.startsWith('antinuke_act_back_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_act_back_', '');
      return showMainPanelFromButton(interaction, guildId);
    }

    // Status back
    if (customId.startsWith('antinuke_status_back_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_status_back_', '');
      return showMainPanelFromButton(interaction, guildId);
    }

    // Actions toggle buttons
    if (customId.startsWith('antinuke_act_toggle_ban_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_act_toggle_ban_', '');
      const config = getNukeConfig(guildId);
      config.actions.autoBan = !config.actions.autoBan;
      saveNukeConfig(guildId, config);
      return showActionsPanel(interaction, guildId);
    }

    if (customId.startsWith('antinuke_act_toggle_kick_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_act_toggle_kick_', '');
      const config = getNukeConfig(guildId);
      config.actions.autoKick = !config.actions.autoKick;
      saveNukeConfig(guildId, config);
      return showActionsPanel(interaction, guildId);
    }

    if (customId.startsWith('antinuke_act_toggle_lock_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_act_toggle_lock_', '');
      const config = getNukeConfig(guildId);
      config.actions.lockChannels = !config.actions.lockChannels;
      saveNukeConfig(guildId, config);
      return showActionsPanel(interaction, guildId);
    }

    if (customId.startsWith('antinuke_act_toggle_webhook_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_act_toggle_webhook_', '');
      const config = getNukeConfig(guildId);
      config.actions.deleteWebhooks = !config.actions.deleteWebhooks;
      saveNukeConfig(guildId, config);
      return showActionsPanel(interaction, guildId);
    }

    if (customId.startsWith('antinuke_act_toggle_perms_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_act_toggle_perms_', '');
      const config = getNukeConfig(guildId);
      config.actions.revokePerms = !config.actions.revokePerms;
      saveNukeConfig(guildId, config);
      return showActionsPanel(interaction, guildId);
    }

    if (customId.startsWith('antinuke_act_toggle_notify_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_act_toggle_notify_', '');
      const config = getNukeConfig(guildId);
      config.actions.notifyAdmins = !config.actions.notifyAdmins;
      saveNukeConfig(guildId, config);
      return showActionsPanel(interaction, guildId);
    }

    if (customId.startsWith('antinuke_act_toggle_panic_')) {
      await interaction.deferUpdate();
      const guildId = customId.replace('antinuke_act_toggle_panic_', '');
      const config = getNukeConfig(guildId);
      config.actions.panicMode = !config.actions.panicMode;
      saveNukeConfig(guildId, config);
      return showActionsPanel(interaction, guildId);
    }

    // Config save from modal
    async function saveConfigFromModal(interaction, guildId) {
      const config = getNukeConfig(guildId);
      let changed = false;

      const fields = ['ch_del', 'ch_cre', 'rl_del', 'rl_cre', 'mb_ban'];
      for (const f of fields) {
        const val = interaction.fields.getTextInputValue(f);
        if (val) {
          const num = parseInt(val);
          if (!isNaN(num) && num > 0 && num <= 100) {
            switch (f) {
              case 'ch_del': config.thresholds.channelDelete = num; break;
              case 'ch_cre': config.thresholds.channelCreate = num; break;
              case 'rl_del': config.thresholds.roleDelete = num; break;
              case 'rl_cre': config.thresholds.roleCreate = num; break;
              case 'mb_ban': config.thresholds.memberBan = num; break;
            }
            changed = true;
          }
        }
      }

      if (changed) {
        saveNukeConfig(guildId, config);
        return showMainPanelFromButton(interaction, guildId);
      }
      return interaction.editReply({ content: lt(interaction, '❌ Geçerli değer girilmedi.', '❌ No valid value was entered.'), flags: MessageFlags.Ephemeral });
    }

    
    // AUTOMOD BUTTONS
    if (customId.startsWith('automod_toggle_main_')) {
      const guildId = customId.replace('automod_toggle_main_', '');
      const settings = getGuild(guildId);
      updateGuild(guildId, { autoMod: !settings.autoMod });
      try {
        const { buildAutoModPanel } = require('./commands/automod');
        const newContainer = buildAutoModPanel(guildId);
        return interaction.update({ components: [newContainer], flags: MessageFlags.IsComponentsV2 });
      } catch (_) {
        return safeReply({ content: `🛡️ AutoMod ${!settings.autoMod ? '**açıldı** ✅' : '**kapatıldı** ❌'}`, flags: MessageFlags.Ephemeral });
      }
    }

    if (customId.startsWith('automod_toggle_ai_')) {
      const guildId = customId.replace('automod_toggle_ai_', '');
      const settings = getGuild(guildId);
      updateGuild(guildId, { autoModAI: !settings.autoModAI });
      try {
        const { buildAutoModPanel } = require('./commands/automod');
        const newContainer = buildAutoModPanel(guildId);
        return interaction.update({ components: [newContainer], flags: MessageFlags.IsComponentsV2 });
      } catch (_) {
        return safeReply({ content: `🤖 AI Ton Analizi ${!settings.autoModAI ? '**açıldı** ✅' : '**kapatıldı** ❌'}`, flags: MessageFlags.Ephemeral });
      }
    }

    if (customId.startsWith('automod_toggle_sandbox_')) {
      const guildId = customId.replace('automod_toggle_sandbox_', '');
      const settings = getGuild(guildId);
      updateGuild(guildId, { linkSandbox: !settings.linkSandbox });
      try {
        const { buildAutoModPanel } = require('./commands/automod');
        const newContainer = buildAutoModPanel(guildId);
        return interaction.update({ components: [newContainer], flags: MessageFlags.IsComponentsV2 });
      } catch (_) {
        return safeReply({ content: `🔗 Link Sandbox ${!settings.linkSandbox ? '**açıldı** ✅' : '**kapatıldı** ❌'}`, flags: MessageFlags.Ephemeral });
      }
    }

    if (customId.startsWith('automod_word_add_')) {
      return interaction.showModal({
        title: 'Yasaklı Kelime Ekle',
        customId: 'automod_modal_word_add',
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'word_text',
                label: 'Yasaklanacak Kelime',
                style: 1,
                required: true,
                placeholder: 'Örn: küfür veya reklam kelimesi',
                min_length: 2,
                max_length: 50,
              },
            ],
          },
        ],
      });
    }

    if (customId.startsWith('automod_word_remove_')) {
      return interaction.showModal({
        title: 'Yasaklı Kelime Kaldır',
        customId: 'automod_modal_word_remove',
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: 'word_text',
                label: 'Listeden Kaldırılacak Kelime',
                style: 1,
                required: true,
                placeholder: 'Listeden silinecek kelimeyi tam yazın',
                min_length: 2,
                max_length: 50,
              },
            ],
          },
        ],
      });
    }

    if (customId === 'automod_close') {
      return safeClosePanel(interaction, '🛡️ AutoMod paneli kapatıldı.');
    }

    // KURULUM BUTTONS (DM kurulum rehberi)
    if (customId.startsWith('kur_lang_tr_')) {
      const guildId = customId.replace('kur_lang_tr_', '');
      const { setGuildLanguage } = require('./utils/i18n');
      setGuildLanguage(guildId, 'tr');
      return safeReply({ content: '✅ Dil **Türkçe** olarak ayarlandı!', flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('kur_lang_en_')) {
      const guildId = customId.replace('kur_lang_en_', '');
      const { setGuildLanguage } = require('./utils/i18n');
      setGuildLanguage(guildId, 'en');
      return safeReply({ content: '✅ Language set to **English**!', flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('kur_channels_')) {
      const guildId = customId.replace('kur_channels_', '');
      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) return safeReply({ content: lt(interaction, '❌ Sunucu bulunamadı', '❌ Server not found'), flags: MessageFlags.Ephemeral });

      const { updateGuild } = require('./utils/database');
      const settings = require('./utils/database').getGuild(guildId);

      await interaction.deferUpdate();

      // Log kategorisi oluştur
      let logCategory = settings.logCategory && guild.channels.cache.get(settings.logCategory);
      if (!logCategory) {
        logCategory = await guild.channels.create({
          name: '🛡️ Aegis Logs',
          type: 4, // Category
          permissionOverwrites: [{ id: guild.id, deny: ['ViewChannel'] }],
          reason: 'Aegis Guard kurulumu',
        });
        updateGuild(guildId, { logCategory: logCategory.id });
      }

      // Log kanalları
      const logChannels = [
        { key: 'joinLeaveLogChannel', name: 'katılma-çıkma-log' },
        { key: 'messageLogChannel', name: 'mesaj-log' },
        { key: 'banKickLogChannel', name: 'ban-kick-log' },
        { key: 'logChannel', name: 'genel-log' },
        { key: 'ticketLogChannel', name: 'ticket-log' },
      ];

      for (const lc of logChannels) {
        let ch = settings[lc.key] && guild.channels.cache.get(settings[lc.key]);
        if (!ch) {
          ch = await guild.channels.create({
            name: lc.name,
            type: 0, // Text
            parent: logCategory.id,
            permissionOverwrites: [{ id: guild.id, deny: ['ViewChannel'] }],
            reason: 'Aegis Guard kurulumu',
          });
          updateGuild(guildId, { [lc.key]: ch.id });
        }
      }

      // Hoşgeldin kanalı
      let welcomeChannel = settings.welcomeChannel && guild.channels.cache.get(settings.welcomeChannel);
      if (!welcomeChannel) {
        welcomeChannel = await guild.channels.create({
          name: '👋┃hoşgeldin',
          type: 0,
          permissionOverwrites: [{ id: guild.id, allow: ['ViewChannel'] }, { id: guild.roles.everyone.id, allow: ['ViewChannel'] }],
          reason: 'Aegis Guard kurulumu',
        });
        updateGuild(guildId, { welcomeChannel: welcomeChannel.id, welcomeEnabled: true });
      }

      // Duyuru kanalı
      let announcementChannel = settings.announcementChannel && guild.channels.cache.get(settings.announcementChannel);
      if (!announcementChannel) {
        announcementChannel = await guild.channels.create({
          name: '📢┃duyurular',
          type: 0,
          permissionOverwrites: [{ id: guild.id, allow: ['ViewChannel'] }, { id: guild.roles.everyone.id, allow: ['ViewChannel'] }],
          reason: 'Aegis Guard kurulumu',
        });
        updateGuild(guildId, { announcementChannel: announcementChannel.id });
      }

      // Ticket kategorisi
      let ticketCategory = settings.ticketCategory && guild.channels.cache.get(settings.ticketCategory);
      if (!ticketCategory) {
        ticketCategory = await guild.channels.create({
          name: '🎫 Tickets',
          type: 4,
          permissionOverwrites: [{ id: guild.id, deny: ['ViewChannel'] }],
          reason: 'Aegis Guard kurulumu',
        });
        updateGuild(guildId, { ticketCategory: ticketCategory.id });
      }

      // Ticket log kanalları
      const ticketLogs = [
        { key: 'ticketLogChannel', name: 'ticket-log' },
        { key: 'ticketTranscriptChannel', name: 'ticket-transcript' },
      ];

      for (const lc of ticketLogs) {
        let ch = settings[lc.key] && guild.channels.cache.get(settings[lc.key]);
        if (!ch) {
          ch = await guild.channels.create({
            name: lc.name,
            type: 0,
            parent: logCategory.id,
            permissionOverwrites: [{ id: guild.id, deny: ['ViewChannel'] }],
            reason: 'Aegis Guard kurulumu',
          });
          updateGuild(guildId, { [lc.key]: ch.id });
        }
      }

      return interaction.editReply({ content: lt(interaction, '✅ Tüm kanallar oluşturuldu! Dashboard\'dan detaylı ayarları yapabilirsin.', '✅ All channels were created! You can fine-tune settings in the Dashboard.'), flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('kur_antiraid_')) {
      const guildId = customId.replace('kur_antiraid_', '');
      const settings = require('./utils/database').getGuild(guildId);
      require('./utils/database').updateGuild(guildId, { antiRaid: !settings.antiRaid });
      return safeReply({ content: `🛡️ Anti-Raid ${!settings.antiRaid ? '**açıldı** ✅' : '**kapatıldı** ❌'}`, flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('kur_automod_')) {
      const guildId = customId.replace('kur_automod_', '');
      const settings = require('./utils/database').getGuild(guildId);
      require('./utils/database').updateGuild(guildId, { autoMod: !settings.autoMod });
      return safeReply({ content: `🤖 AutoMod ${!settings.autoMod ? '**açıldı** ✅' : '**kapatıldı** ❌'}`, flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('kur_sandbox_')) {
      const guildId = customId.replace('kur_sandbox_', '');
      const settings = require('./utils/database').getGuild(guildId);
      require('./utils/database').updateGuild(guildId, { linkSandbox: !settings.linkSandbox });
      return safeReply({ content: `🔗 Link Sandbox ${!settings.linkSandbox ? '**açıldı** ✅' : '**kapatıldı** ❌'}`, flags: MessageFlags.Ephemeral });
    }

    // KARSILAMA BUTTONS
    if (customId.startsWith('karsilama_toggle_')) {
      const guildId = customId.replace('karsilama_toggle_', '');
      const settings = getGuild(guildId);
      const newState = !settings.welcomeEnabled;
      updateGuild(guildId, { welcomeEnabled: newState });
      try {
        const { buildWelcomePanel } = require('./commands/karsilama');
        const guild = interaction.guild || interaction.client.guilds.cache.get(guildId);
        if (guild) {
          const panel = buildWelcomePanel(guild, getGuild(guildId));
          return interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }
      } catch (_) {}
      return safeReply({ content: lt(interaction, `👋 Karşılama ${newState ? '**açıldı** ✅' : '**kapatıldı** ❌'}`, `👋 Welcome messages ${newState ? '**turned on** ✅' : '**turned off** ❌'}`), flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('karsilama_leave_') || customId.startsWith('karsilama_boost_')) {
      const leave = customId.startsWith('karsilama_leave_');
      const guildId = customId.replace(leave ? 'karsilama_leave_' : 'karsilama_boost_', '');
      const key = leave ? 'leaveCardEnabled' : 'boostCardEnabled';
      updateGuild(guildId, { [key]: !getGuild(guildId)[key] });
      const { buildWelcomePanel } = require('./commands/karsilama');
      const guild = interaction.guild || interaction.client.guilds.cache.get(guildId);
      return interaction.update({ components: [buildWelcomePanel(guild, getGuild(guildId))], flags: MessageFlags.IsComponentsV2 });
    }

    // OTOROL BUTTONS
    if (customId.startsWith('otorol_toggle_')) {
      const guildId = customId.replace('otorol_toggle_', '');
      const settings = getGuild(guildId);
      const newState = !settings.autoRoleEnabled;
      updateGuild(guildId, { autoRoleEnabled: newState });
      try {
        const { buildOtorolPanel } = require('./commands/otorol');
        const guild = interaction.guild || interaction.client.guilds.cache.get(guildId);
        if (guild) {
          const panel = buildOtorolPanel(guild, getGuild(guildId));
          return interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }
      } catch (_) {}
      return safeReply({ content: `👤 Otorol ${newState ? '**açıldı** ✅' : '**kapatıldı** ❌'}`, flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('otorol_reset_')) {
      const guildId = customId.replace('otorol_reset_', '');
      updateGuild(guildId, { autoRoleEnabled: false, autoRoleId: null, autoRole: null });
      try {
        const { buildOtorolPanel } = require('./commands/otorol');
        const guild = interaction.guild || interaction.client.guilds.cache.get(guildId);
        if (guild) {
          const panel = buildOtorolPanel(guild, getGuild(guildId));
          return interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }
      } catch (_) {}
      return safeReply({ content: lt(interaction, '👤 Otorol sıfırlandı.', '👤 Auto-role was reset.'), flags: MessageFlags.Ephemeral });
    }

    // RULES BUTTONS
    if (customId.startsWith('rules_toggle_')) {
      const guildId = customId.replace('rules_toggle_', '');
      const { getRulesBot, setRulesBot } = require('./utils/database');
      const rulesConfig = getRulesBot(guildId);
      setRulesBot(guildId, { enabled: !rulesConfig.enabled });
      return safeReply({ content: `📜 Kural Botu ${!rulesConfig.enabled ? '**açıldı** ✅' : '**kapatıldı** ❌'}`, flags: MessageFlags.Ephemeral });
    }

    if (customId === 'rules_close') {
      return safeClosePanel(interaction, '📜 Kural Botu paneli kapatıldı.');
    }

    if (customId === 'gw_close') {
      return safeClosePanel(interaction, '🎉 Çekiliş paneli kapatıldı.');
    }

    // KILL CHAIN BUTTONS
    if (customId.startsWith('kc_')) {
      const killchainCmd = require('./commands/killchain');
      if (killchainCmd.handleButton) {
        await killchainCmd.handleButton(interaction, client);
        return;
      }
    }

    // POLL VOTE BUTTONS
    if (customId.startsWith('poll_')) {
      const { handlePollInteraction } = require('./utils/pollManager');
      return handlePollInteraction(interaction, client);
    }

    // VOICEMOD BUTTONS
    if (customId.startsWith('voicemod_')) {
      const { handleVoiceModButton } = require('./utils/voiceMod');
      return handleVoiceModButton(interaction);
    }

    // CC CLOSE BUTTON
    if (customId === 'cc_close') {
      return safeClosePanel(interaction, 'Özel komutlar listesi kapatıldı.');
    }

    // Universal close fallback for ANY panel
    if (customId.endsWith('_close') || customId.endsWith('_kapat') || customId === 'close' || customId === 'kapat') {
      return safeClosePanel(interaction);
    }
  }

  // Channel Select Menus (Karşılama kanalı seçimi vs.)
  if (interaction.isChannelSelectMenu()) {
    const { customId } = interaction;
    if (customId.startsWith('karsilama_chan_')) {
      const guildId = customId.replace('karsilama_chan_', '');
      const selectedChannelId = interaction.values[0];
      const { updateGuild, getGuild } = require('./utils/database');
      updateGuild(guildId, {
        welcomeChannel: selectedChannelId,
        welcomeEnabled: true,
      });
      try {
        const { buildWelcomePanel } = require('./commands/karsilama');
        const guild = interaction.guild || interaction.client.guilds.cache.get(guildId);
        if (guild) {
          const panel = buildWelcomePanel(guild, getGuild(guildId));
          return interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }
      } catch (_) {}
      return safeReply({ content: lt(interaction, `✅ Karşılama kanalı ayarlandı: <#${selectedChannelId}>`, `✅ Welcome channel set: <#${selectedChannelId}>`), flags: MessageFlags.Ephemeral });
    }
  }

  // String Select Menus (Role panels etc.)
  if (interaction.isStringSelectMenu()) {
    const { customId } = interaction;
    if (customId.startsWith('rolepanel:')) {
      const rolPanel = require('./commands/rol-panel');
      return rolPanel.handleSelectMenu(interaction);
    }
  }

  // Slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  if (await require('./features/commandLock').guard(interaction)) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    // Kullanıcıya teknik hata metni gösterme: kısa bir kod ver, ayrıntı yalnızca log'da kalsın.
    const ref = Date.now().toString(36).slice(-5).toUpperCase();
    console.error(`❌ Komut hatası [/${interaction.commandName} #${ref}]:`, error);
    if (error?.code === 10062 || error?.code === 40060) return; // etkileşim süresi dolmuş ya da zaten yanıtlanmış
    try {
      const { getGuildLanguage } = require('./utils/i18n');
      const lang = interaction.guildId ? getGuildLanguage(interaction.guildId) : 'en';
      const content = lang === 'tr'
        ? `:aegis_sad: Bir şey ters gitti. Birazdan tekrar dene; sorun sürerse destek sunucusunda şu kodu yaz: \`#${ref}\``
        : `:aegis_sad: Something went wrong. Try again in a moment; if it keeps happening, quote this code in the support server: \`#${ref}\``;
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    } catch {}
  }
});
// (Bot sahibine özel operasyon komutları bu depoda yer almaz; bkz. README.)

// ─── ANTI-NUKE PANEL HELPER FUNCTIONS ──────────────────────────────────────
const { getNukeConfig, saveNukeConfig, triggerPanicMode, disablePanicModeManual, getPanicStatus, addToWhitelist, removeFromWhitelist, isWhitelisted, createHoneypots, DEFAULT_NUKE_CONFIG } = require('./utils/antiNuke');

async function showMainPanelFromButton(interaction, guildId) {
  const guild = interaction.client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: lt(interaction, '❌ Sunucu bulunamadı', '❌ Server not found'), flags: MessageFlags.Ephemeral }).catch(() => {});
  // Anti-Raid ve Anti-Nuke tek panel: alt ekranlardan "geri" bu paneli açar
  const container = require('./commands/antiraid').buildUnifiedSecurityPanel(guild);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
  return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function showWhitelistPanel(interaction, guildId) {
  const L = ((en) => (tr, e) => (en ? e : tr))(getGuildLanguage(guildId) === 'en');
  const config = getNukeConfig(guildId);
  const users = [];
  for (const id of config.whitelist) {
    const u = await interaction.client.users.fetch(id).catch(() => ({ tag: L(`Bilinmeyen (${id})`, `Unknown (${id})`), id }));
    users.push(`• ${u.tag} (${u.id})`);
  }

  const container = new ContainerBuilder().setAccentColor(0x0066ff);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 👤 ${L('Beyaz Liste Yönetimi', 'Whitelist Management')}`));
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(L(`**${users.length}** kullanıcı beyaz listede:\n${users.join('\n') || 'Boş'}\n\nBeyaz listedekiler Anti-Nuke'den etkilenmez.`, `**${users.length}** user(s) on the whitelist:\n${users.join('\n') || 'Empty'}\n\nWhitelisted users are not affected by Anti-Nuke.`)));
  container.addSeparatorComponents(new SeparatorBuilder());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`antinuke_wl_add_${guildId}`).setLabel(L('➕ Ekle', '➕ Add')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`antinuke_wl_remove_${guildId}`).setLabel(L('➖ Kaldır', '➖ Remove')).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`antinuke_wl_back_${guildId}`).setLabel(L('← Geri', '← Back')).setStyle(ButtonStyle.Secondary)
  );
  container.addActionRowComponents(row);

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
  return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function showWhitelistAddModal(interaction, guildId) {
  const L = ((en) => (tr, e) => (en ? e : tr))(getGuildLanguage(guildId) === 'en');
  const modal = new ModalBuilder()
    .setCustomId(`antinuke_wl_add_modal_${guildId}`)
    .setTitle(L('Beyaz Listeye Ekle', 'Add to Whitelist'));

  const userInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel(L('Kullanıcı ID (sağ tık > Kopyala > ID)', 'User ID (right-click > Copy ID)'))
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(L('Örn: 123456789012345678', 'e.g. 123456789012345678'))
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(userInput));
  return interaction.showModal(modal);
}

async function showWhitelistRemoveModal(interaction, guildId) {
  const L = ((en) => (tr, e) => (en ? e : tr))(getGuildLanguage(guildId) === 'en');
  const modal = new ModalBuilder()
    .setCustomId(`antinuke_wl_remove_modal_${guildId}`)
    .setTitle(L('Beyaz Listeden Kaldır', 'Remove from Whitelist'));

  const userInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel(L('Kullanıcı ID (sağ tık > Kopyala > ID)', 'User ID (right-click > Copy ID)'))
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(L('Örn: 123456789012345678', 'e.g. 123456789012345678'))
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(userInput));
  return interaction.showModal(modal);
}

async function showConfigPanel(interaction, guildId) {
  const L = ((en) => (tr, e) => (en ? e : tr))(getGuildLanguage(guildId) === 'en');
  const config = getNukeConfig(guildId);

  const container = new ContainerBuilder().setAccentColor(0xf0b232);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⚙️ ${L('Eşik Değerleri Ayarla (10 saniye penceresi)', 'Set Thresholds (10 second window)')}`));
  container.addSeparatorComponents(new SeparatorBuilder());

  const t = config.thresholds;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**${L('Mevcut Değerler', 'Current Values')}:**\n` +
    `• ${L('Kanal Silme', 'Channel Delete')}: ${t.channelDelete}\n` +
    `• ${L('Kanal Oluşturma', 'Channel Create')}: ${t.channelCreate}\n` +
    `• ${L('Rol Silme', 'Role Delete')}: ${t.roleDelete}\n` +
    `• ${L('Rol Oluşturma', 'Role Create')}: ${t.roleCreate}\n` +
    `• Mass Ban: ${t.memberBan}\n` +
    `• Mass Kick: ${t.memberKick}\n` +
    `• Webhook Spam: ${t.webhookMessage} ${L('msj/webhook', 'msg/webhook')}\n` +
    `• ${L('Sunucu Güncelleme', 'Server Update')}: ${t.serverUpdate}\n` +
    `• ${L('Emoji Silme', 'Emoji Delete')}: ${t.emojiDelete}\n` +
    `• ${L('Sticker Silme', 'Sticker Delete')}: ${t.stickerDelete}`
  ));
  container.addSeparatorComponents(new SeparatorBuilder());

  const modal = new ModalBuilder()
    .setCustomId(`antinuke_cfg_modal_${guildId}`)
    .setTitle(L('Eşik Değerlerini Ayarla', 'Set Thresholds'));

  const inputs = [
    { id: 'ch_del', label: L('Kanal Silme', 'Channel Delete'), value: t.channelDelete },
    { id: 'ch_cre', label: L('Kanal Oluşturma', 'Channel Create'), value: t.channelCreate },
    { id: 'rl_del', label: L('Rol Silme', 'Role Delete'), value: t.roleDelete },
    { id: 'rl_cre', label: L('Rol Oluşturma', 'Role Create'), value: t.roleCreate },
    { id: 'mb_ban', label: 'Mass Ban', value: t.memberBan },
  ];

  for (const inp of inputs) {
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(inp.id)
        .setLabel(inp.label)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`${L('Mevcut', 'Current')}: ${inp.value}`)
        .setValue(String(inp.value))
        .setRequired(false)
    ));
  }

  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`antinuke_cfg_save_${guildId}`).setLabel(L('💾 Kaydet (Modal)', '💾 Save (Modal)')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`antinuke_cfg_back_${guildId}`).setLabel(L('← Geri', '← Back')).setStyle(ButtonStyle.Secondary)
  ));

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
  return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function showActionsPanel(interaction, guildId) {
  const L = ((en) => (tr, e) => (en ? e : tr))(getGuildLanguage(guildId) === 'en');
  const config = getNukeConfig(guildId);
  const a = config.actions;

  const container = new ContainerBuilder().setAccentColor(0xff66aa);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🔧 ${L('Yanıt Eylemleri', 'Response Actions')}`));
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `${L('Anti-Nuke tetiklendiğinde yapılacak eylemler', 'Actions taken when Anti-Nuke triggers')}:\n\n` +
    `• **${L('Oto Ban', 'Auto Ban')}:** ${a.autoBan ? '✅' : '❌'} — ${L('Saldırganı banla', 'Ban the attacker')}\n` +
    `• **${L('Oto Kick', 'Auto Kick')}:** ${a.autoKick ? '✅' : '❌'} — ${L('Banlanamazsa kickle', 'Kick if they cannot be banned')}\n` +
    `• **${L('Kanal Kilitle', 'Lock Channels')}:** ${a.lockChannels ? '✅' : '❌'} — ${L('Tüm kanalları yazmaya kapat', 'Close every channel to messages')}\n` +
    `• **${L('Webhook Sil', 'Delete Webhooks')}:** ${a.deleteWebhooks ? '✅' : '❌'} — ${L('Şüpheli webhookları sil', 'Delete suspicious webhooks')}\n` +
    `• **${L('Yetki Al', 'Revoke Permissions')}:** ${a.revokePerms ? '✅' : '❌'} — ${L('Tehlikeli yetkileri al', 'Take away dangerous permissions')}\n` +
    `• **${L('Admin Uyar', 'Notify Admins')}:** ${a.notifyAdmins ? '✅' : '❌'} — ${L('Sahip/adminleri DM ile uyar', 'DM the owner and admins')}\n` +
    `• **Panic Mode:** ${a.panicMode ? '✅' : '❌'} — ${L('Otomatik panic mode aç', 'Turn on panic mode automatically')}`
  ));
  container.addSeparatorComponents(new SeparatorBuilder());

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`antinuke_act_toggle_ban_${guildId}`).setLabel(a.autoBan ? `✅ ${L('Oto Ban', 'Auto Ban')}` : `❌ ${L('Oto Ban', 'Auto Ban')}`).setStyle(a.autoBan ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`antinuke_act_toggle_kick_${guildId}`).setLabel(a.autoKick ? `✅ ${L('Oto Kick', 'Auto Kick')}` : `❌ ${L('Oto Kick', 'Auto Kick')}`).setStyle(a.autoKick ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`antinuke_act_toggle_lock_${guildId}`).setLabel(a.lockChannels ? `✅ ${L('Kanal Kilitle', 'Lock Channels')}` : `❌ ${L('Kanal Kilitle', 'Lock Channels')}`).setStyle(a.lockChannels ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`antinuke_act_toggle_webhook_${guildId}`).setLabel(a.deleteWebhooks ? `✅ ${L('Webhook Sil', 'Delete Webhooks')}` : `❌ ${L('Webhook Sil', 'Delete Webhooks')}`).setStyle(a.deleteWebhooks ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`antinuke_act_toggle_perms_${guildId}`).setLabel(a.revokePerms ? `✅ ${L('Yetki Al', 'Revoke Perms')}` : `❌ ${L('Yetki Al', 'Revoke Perms')}`).setStyle(a.revokePerms ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`antinuke_act_toggle_notify_${guildId}`).setLabel(a.notifyAdmins ? `✅ ${L('Admin Uyar', 'Notify Admins')}` : `❌ ${L('Admin Uyar', 'Notify Admins')}`).setStyle(a.notifyAdmins ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`antinuke_act_toggle_panic_${guildId}`).setLabel(a.panicMode ? '✅ Panic Mode' : '❌ Panic Mode').setStyle(a.panicMode ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`antinuke_act_back_${guildId}`).setLabel(L('← Geri', '← Back')).setStyle(ButtonStyle.Secondary)
  );
  container.addActionRowComponents(row1, row2, row3);

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
  return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function showStatusPanel(interaction, guildId) {
  const L = ((en) => (tr, e) => (en ? e : tr))(getGuildLanguage(guildId) === 'en');
  const config = getNukeConfig(guildId);
  const isPanic = getPanicStatus(guildId);

  const container = new ContainerBuilder().setAccentColor(0x0066ff);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 📊 ${L('Anti-Nuke Durum Raporu', 'Anti-Nuke Status Report')}`));
  container.addSeparatorComponents(new SeparatorBuilder());

  // Get recent action history
  const { actionHistory } = require('./utils/antiNuke');
  const history = actionHistory.get(guildId) || [];
  const now = Date.now();
  const last5min = history.filter(h => now - h.timestamp < 300000).length;
  const last1hour = history.filter(h => now - h.timestamp < 3600000).length;

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**${L('Genel Durum', 'Overview')}:**\n` +
    `• ${L('Sistem', 'System')}: ${config.enabled ? L('✅ Aktif', '✅ Active') : L('❌ Pasif', '❌ Disabled')}\n` +
    `• Panic Mode: ${isPanic ? L('🔴 AKTİF', '🔴 ACTIVE') : '🟢 Normal'}\n` +
    `• Honeypot: ${config.honeypotEnabled ? L('✅ Açık', '✅ On') : L('❌ Kapalı', '❌ Off')} (${config.honeypotChannels.length} ${L('kanal', 'channels')})\n` +
    `• ${L('Beyaz Liste', 'Whitelist')}: ${config.whitelist.length} ${L('kullanıcı', 'users')}\n\n` +
    `**${L('Son 5 Dakika', 'Last 5 Minutes')}:** ${last5min} ${L('işlem', 'actions')}\n` +
    `**${L('Son 1 Saat', 'Last Hour')}:** ${last1hour} ${L('işlem', 'actions')}\n\n` +
    `**${L('Eşikler', 'Thresholds')}:**\n` +
    `• ${L('Kanal Silme', 'Channel Delete')}: ${config.thresholds.channelDelete} | ${L('Oluşturma', 'Create')}: ${config.thresholds.channelCreate}\n` +
    `• ${L('Rol Silme', 'Role Delete')}: ${config.thresholds.roleDelete} | ${L('Oluşturma', 'Create')}: ${config.thresholds.roleCreate}\n` +
    `• Mass Ban: ${config.thresholds.memberBan} | Webhook Spam: ${config.thresholds.webhookMessage}`
  ));
  container.addSeparatorComponents(new SeparatorBuilder());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`antinuke_status_back_${guildId}`).setLabel(L('← Geri', '← Back')).setStyle(ButtonStyle.Secondary)
  );
  container.addActionRowComponents(row);

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
  return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// Modal submit handlers
const isEn = (i) => getGuildLanguage(i.guildId) === 'en';
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const customId = interaction.customId;

  // Whitelist add modal
  if (customId.startsWith('antinuke_wl_add_modal_')) {
    const guildId = customId.replace('antinuke_wl_add_modal_', '');
    const userId = interaction.fields.getTextInputValue('user_id');
    addToWhitelist(guildId, userId);
    return interaction.reply({ content: isEn(interaction) ? `✅ <@${userId}> was added to the whitelist.` : `✅ <@${userId}> beyaz listeye eklendi.`, flags: MessageFlags.Ephemeral });
  }

  // Whitelist remove modal
  if (customId.startsWith('antinuke_wl_remove_modal_')) {
    const guildId = customId.replace('antinuke_wl_remove_modal_', '');
    const userId = interaction.fields.getTextInputValue('user_id');
    removeFromWhitelist(guildId, userId);
    return interaction.reply({ content: isEn(interaction) ? `✅ <@${userId}> was removed from the whitelist.` : `✅ <@${userId}> beyaz listeden kaldırıldı.`, flags: MessageFlags.Ephemeral });
  }

  // Config modal
  if (customId.startsWith('antinuke_cfg_modal_')) {
    const guildId = customId.replace('antinuke_cfg_modal_', '');
    const config = getNukeConfig(guildId);
    let changed = false;

    const fields = ['ch_del', 'ch_cre', 'rl_del', 'rl_cre', 'mb_ban'];
    for (const f of fields) {
      const val = interaction.fields.getTextInputValue(f);
      if (val) {
        const num = parseInt(val);
        if (!isNaN(num) && num > 0 && num <= 100) {
          switch (f) {
            case 'ch_del': config.thresholds.channelDelete = num; break;
            case 'ch_cre': config.thresholds.channelCreate = num; break;
            case 'rl_del': config.thresholds.roleDelete = num; break;
            case 'rl_cre': config.thresholds.roleCreate = num; break;
            case 'mb_ban': config.thresholds.memberBan = num; break;
          }
          changed = true;
        }
      }
    }

    if (changed) {
      saveNukeConfig(guildId, config);
      return interaction.reply({ content: isEn(interaction) ? '✅ Thresholds updated!' : '✅ Eşik değerleri güncellendi!', flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: isEn(interaction) ? '❌ No valid value was entered.' : '❌ Geçerli değer girilmedi.', flags: MessageFlags.Ephemeral });
  }

  // Actions modal (simplified - using button toggles would be better but keeping modal for consistency)
  if (customId.startsWith('antinuke_act_modal_')) {
    // We'll use buttons for toggles instead of modal
    return interaction.reply({ content: isEn(interaction) ? 'Use the buttons for the action settings.' : 'Eylem ayarları için butonları kullanın.', flags: MessageFlags.Ephemeral });
  }
});

client.login(process.env.TOKEN);

// ─── GRACEFUL SHUTDOWN ─────────────────────────────────────────────────────
// pm2 restart/durdurmada: HTTP sunucu kapanır, DB yazım kuyruğu boşaltılır,
// Discord bağlantısı temizce kapatılır — yarım yazılmış JSON kalma riski yok.
async function shutdown(signal) {
  console.log(`🛑 ${signal} alındı, kapanıyor...`);
  if (httpServer) {
    try { await new Promise(resolve => httpServer.close(resolve)); } catch (e) { console.error('HTTP sunucu kapatılamadı:', e.message); }
  }
  try { require('./features/levels').flush(); } catch (e) { console.error('XP yazılamadı:', e.message); }
  try { await flushWrites(); } catch (e) { console.error('DB yazımı boşaltılamadı:', e.message); }
  try { await client.destroy(); } catch (e) { console.error('Discord bağlantısı kapatılamadı:', e.message); }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── ÇÖKME GÜVENLİĞİ ───────────────────────────────────────────────────────
// Node 22, yakalanmamış Promise reddini varsayılan olarak çöküşe çevirir →
// bu da pm2 restart döngüsüne yol açar. En azından görünür bir log bırak.
process.on('unhandledRejection', (reason) => {
  console.error('❌ Yakalanmamış Promise reddi:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Yakalanmamış istisna:', err);
});
