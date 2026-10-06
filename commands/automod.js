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
  StringSelectMenuBuilder,
} = require('discord.js');
const { getGuild, updateGuild, getBannedWords } = require('../utils/database');
const { getGuildLanguage } = require('../utils/i18n');
const { safeClosePanel } = require('../utils/panelHelper');
const { banner } = require('../features/util');

function buildAutoModPanel(guildId) {
  const settings = getGuild(guildId);
  const lang = getGuildLanguage(guildId);
  const isEn = lang === 'en';

  const autoModEnabled = !!settings.autoMod;
  const aiEnabled = !!settings.autoModAI;
  const sandboxEnabled = !!settings.linkSandbox;
  const bannedWords = getBannedWords(guildId);

  const container = new ContainerBuilder()
    .setAccentColor(autoModEnabled ? 0x3ba55c : 0xed4245);
  container.addMediaGalleryComponents(banner('automod', 'AutoMod'));

  // 1. Başlık
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      isEn
        ? '# 🛡️ Aegis AutoMod Control Panel'
        : '# 🛡️ Aegis AutoMod Güvenlik Paneli'
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // 2. Durum Özeti (Anlaşılır, detaylı ve doğru açıklamalı)
  const statusLines = isEn
    ? [
        `• **Main AutoMod Shield:** ${autoModEnabled ? '🟢 **Active** (Protection armed)' : '🔴 **Disabled** (Server protection paused)'}`,
        `• **AI Tone Analysis:** ${aiEnabled ? '🟢 **Enabled** (Toxicity, harassment & spam filter)' : '🔴 **Disabled**'}`,
        `• **Link Protection:** ${sandboxEnabled ? '🟢 **Enabled** (Phishing & malicious link scanner)' : '🔴 **Disabled**'}`,
        `• **Banned Words Filter:** 🛡️ **${bannedWords.length}** words registered`,
      ]
    : [
        `• **Ana AutoMod Kalkanı:** ${autoModEnabled ? '🟢 **Aktif** (Tüm filtreler devrede)' : '🔴 **Devre Dışı** (Sunucu koruması durduruldu)'}`,
        `• **Yapay Zeka Ton Analizi:** ${aiEnabled ? '🟢 **Açık** (Toksisite, hakaret ve spam tespiti)' : '🔴 **Kapalı**'}`,
        `• **Şüpheli Link Filtresi:** ${sandboxEnabled ? '🟢 **Açık** (Phishing ve zararlı link engelleme)' : '🔴 **Kapalı**'}`,
        `• **Yasaklı Kelime Filtresi:** 🛡️ **${bannedWords.length}** kelime kayıtlı`,
      ];

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(statusLines.join('\n'))
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // 3. Ana Kontroller (Açık/Kapalı Düğmesi)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      isEn ? '### ⚡ Master Switch' : '### ⚡ Ana Sistem Düğmesi'
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`automod_toggle_main_${guildId}`)
        .setLabel(
          autoModEnabled
            ? (isEn ? '🔴 Stop AutoMod' : '🔴 AutoMod\'u Durdur')
            : (isEn ? '🟢 Start AutoMod' : '🟢 AutoMod\'u Başlat')
        )
        .setStyle(autoModEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // 4. Modüller (Net ve anlaşılır etiketler)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      isEn ? '### 🧩 Individual Modules' : '### 🧩 Koruma Modülleri'
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`automod_toggle_ai_${guildId}`)
        .setLabel(
          aiEnabled
            ? (isEn ? '🧠 AI Filter: Active' : '🧠 AI Ton: Açık')
            : (isEn ? '🧠 AI Filter: Disabled' : '🧠 AI Ton: Kapalı')
        )
        .setStyle(aiEnabled ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`automod_toggle_sandbox_${guildId}`)
        .setLabel(
          sandboxEnabled
            ? (isEn ? '🔗 Link Guard: Active' : '🔗 Link Filtresi: Açık')
            : (isEn ? '🔗 Link Guard: Disabled' : '🔗 Link Filtresi: Kapalı')
        )
        .setStyle(sandboxEnabled ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // 4b. Etiket spam'i (features/mentionSpam.js; düğmeleri features/automodExtra.js işler)
  {
    const ms = require('../features/mentionSpam').getCfg(guildId);
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        isEn
          ? `### 📣 Mention Spam\n${ms.enabled ? `🟢 On: at **${ms.limit}** points in 10 s the messages are deleted and the member is timed out for **${ms.timeoutMin} min** (each person = 1, each role = 3).` : '🔴 Off: members can mass-ping people and roles.'}`
          : `### 📣 Etiket Spam'i\n${ms.enabled ? `🟢 Açık: 10 sn içinde **${ms.limit}** puana ulaşınca mesajlar silinir, üye **${ms.timeoutMin} dk** susturulur (kişi 1, rol 3 puan).` : '🔴 Kapalı: üyeler kişi ve rol etiketlerini art arda yağdırabilir.'}`
      )
    );
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('automodx:mention')
          .setLabel(ms.enabled ? (isEn ? 'Turn off' : 'Kapat') : (isEn ? 'Turn on' : 'Aç'))
          .setStyle(ms.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('automodx:mentionset')
          .setLabel(isEn ? 'Limit & timeout' : 'Sınır ve süre')
          .setStyle(ButtonStyle.Secondary)
      )
    );
    container.addSeparatorComponents(new SeparatorBuilder());
  }

  // 4c. Spam filtreleri (features/spamFilters.js; düğmeleri features/automodExtra.js işler)
  {
    const sf = require('../features/spamFilters');
    const cfg = sf.getCfg(guildId);
    const active = sf.FILTERS.filter((f) => cfg[f]).map((f) => (isEn ? sf.LABELS[f].en : sf.LABELS[f].tr));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        isEn
          ? `### 🔥 Spam Filters
${cfg.enabled ? `🟢 On: ${active.join(', ') || 'no filter picked'}. The message is deleted; the first time is a warning, then timeouts of **${cfg.baseMin} min** that double each time (up to 1 day).` : '🔴 Off: caps, emoji floods, walls of text, repeated messages and attachment spam are not checked.'}`
          : `### 🔥 Spam Filtreleri
${cfg.enabled ? `🟢 Açık: ${active.join(', ') || 'filtre seçilmedi'}. Mesaj silinir; ilk seferde uyarı, sonra **${cfg.baseMin} dk** ile başlayıp her seferinde ikiye katlanan susturma (en çok 1 gün).` : '🔴 Kapalı: büyük harf, emoji seli, metin duvarı, tekrar eden mesaj ve dosya yağdırma kontrol edilmiyor.'}`
      )
    );
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('automodx:spam')
          .setLabel(cfg.enabled ? (isEn ? 'Turn off' : 'Kapat') : (isEn ? 'Turn on' : 'Aç'))
          .setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('automodx:spamset')
          .setLabel(isEn ? 'First timeout length' : 'İlk susturma süresi')
          .setStyle(ButtonStyle.Secondary)
      )
    );
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('automodx:spamf')
          .setMinValues(0)
          .setMaxValues(sf.FILTERS.length)
          .setPlaceholder(isEn ? 'Choose the active spam filters…' : 'Açık spam filtrelerini seç…')
          .addOptions(sf.FILTERS.map((f) => ({ label: isEn ? sf.LABELS[f].en : sf.LABELS[f].tr, value: f, default: !!cfg[f] })))
      )
    );
    container.addSeparatorComponents(new SeparatorBuilder());
  }

  // 5. Yasaklı Kelime Listesi
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      isEn
        ? `### 📝 Banned Words (${bannedWords.length})`
        : `### 📝 Yasaklı Kelimeler (${bannedWords.length})`
    )
  );

  if (bannedWords.length > 0) {
    const preview = bannedWords.slice(0, 10).map((w) => `\`${w}\``).join(', ');
    const extra =
      bannedWords.length > 10
        ? isEn
          ? ` ... +${bannedWords.length - 10} more`
          : ` ... +${bannedWords.length - 10} daha`
        : '';
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${preview}${extra}`)
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        isEn
          ? '_No banned words configured yet. Click Add Word below._'
          : '_Henüz yasaklı kelime eklenmedi. Aşağıdaki butonla ekleyebilirsiniz._'
      )
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`automod_word_add_${guildId}`)
        .setLabel(isEn ? '➕ Add Word' : '➕ Kelime Ekle')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`automod_word_remove_${guildId}`)
        .setLabel(isEn ? '➖ Remove Word' : '➖ Kelime Kaldır')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setLabel(isEn ? '🌐 Dashboard' : '🌐 Web Panel')
        .setStyle(ButtonStyle.Link)
        .setURL('https://betterwithaegis.com/dashboard')
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // 6. Kapatma Butonu
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('automod_close')
        .setLabel(isEn ? '✕ Close Panel' : '✕ Paneli Kapat')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return container;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Otomatik moderasyon ve filtreler / AutoMod filters')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  buildAutoModPanel,

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ Bu komut sadece sunucularda kullanılabilir.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const { guild } = interaction;
    const container = buildAutoModPanel(guild.id);

    const reply = await interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    });

    // İnteraktif Component Collector (5 dakika)
    const collector = reply.createMessageComponentCollector({
      filter: (i) => {
        if (!i.member.permissions.has(PermissionFlagsBits.Administrator) && i.user.id !== guild.ownerId) {
          i.reply({
            content: '❌ Bu paneli sadece yöneticiler kullanabilir.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
          return false;
        }
        return true;
      },
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async (i) => {
      if (i.__globalHandled) return; // genel işleyici zaten işledi (çift çalışma = aç/kapat geri dönerdi)
      try {
        const { customId } = i;

        // 1. Kapat Butonu
        if (customId === 'automod_close') {
          collector.stop('closed');
          return safeClosePanel(i, '🛡️ AutoMod paneli kapatıldı.');
        }

        // 2. Ana Toggle
        if (customId === `automod_toggle_main_${guild.id}`) {
          const settings = getGuild(guild.id);
          const newVal = !settings.autoMod;
          updateGuild(guild.id, { autoMod: newVal });
          const newContainer = buildAutoModPanel(guild.id);
          return i.update({
            components: [newContainer],
            flags: MessageFlags.IsComponentsV2,
          });
        }

        // 3. AI Toggle
        if (customId === `automod_toggle_ai_${guild.id}`) {
          const settings = getGuild(guild.id);
          const newVal = !settings.autoModAI;
          updateGuild(guild.id, { autoModAI: newVal });
          const newContainer = buildAutoModPanel(guild.id);
          return i.update({
            components: [newContainer],
            flags: MessageFlags.IsComponentsV2,
          });
        }

        // 4. Link Sandbox Toggle
        if (customId === `automod_toggle_sandbox_${guild.id}`) {
          const settings = getGuild(guild.id);
          const newVal = !settings.linkSandbox;
          updateGuild(guild.id, { linkSandbox: newVal });
          const newContainer = buildAutoModPanel(guild.id);
          return i.update({
            components: [newContainer],
            flags: MessageFlags.IsComponentsV2,
          });
        }

        // 5. Kelime Ekle Modal
        if (customId === `automod_word_add_${guild.id}`) {
          return i.showModal({
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

        // 6. Kelime Kaldır Modal
        if (customId === `automod_word_remove_${guild.id}`) {
          return i.showModal({
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
      } catch (err) {
        console.error('[AutoMod collector error]', err);
        if (!i.replied && !i.deferred) {
          await i.deferUpdate().catch(() => null);
        }
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'closed') return;
      // Süre bittiğinde butonları güvenle pasifleştir veya kapat
    });
  },
  buildAutoModPanel,
};
