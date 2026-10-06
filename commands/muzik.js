const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, PermissionFlagsBits } = require("discord.js");
const { cardPayload } = require("../utils/cardMessage");
const { remoteCard } = require("../utils/canvas/cards");
const musicManager = require("../utils/musicManager");
const { getGuildLanguage } = require("../utils/i18n");

// Seçenek adları Türkçe varsayılan, İngilizce Discord istemcilerinde İngilizce görünür.
const CHOICES = [
  { tr: '⏹️ Durdur ve Ayrıl', en: '⏹️ Stop & Leave', value: 'durdur' },
  { tr: '⏸️ Duraklat', en: '⏸️ Pause', value: 'duraklat' },
  { tr: '▶️ Devam Ettir', en: '▶️ Resume', value: 'devam' },
  { tr: '⏭️ Sıradaki Şarkıya Geç', en: '⏭️ Skip Track', value: 'gec' },
  { tr: '📜 Şarkı Kuyruğu', en: '📜 View Queue', value: 'kuyruk' },
  { tr: '🎤 Şarkı Sözleri', en: '🎤 Show Lyrics', value: 'sozler' },
  { tr: '📡 Uzaktan Kumanda Aç/Kapat', en: '📡 Toggle Remote Control', value: 'uzaktan' },
].map((c) => ({ name: c.tr, name_localizations: { 'en-US': c.en, 'en-GB': c.en }, value: c.value }));

function buildMusicCommand(name) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription('Müzik çal ve yönet / Play and manage music')
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('sarki')
        .setDescription('Şarkı adı veya link / Song title or link')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('dosya')
        .setDescription('Ses dosyası yükle (MP3) / Upload audio file')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('islem')
        .setDescription('Oynatıcı kontrolleri / Player controls')
        .setRequired(false)
        .addChoices(...CHOICES)
    );
}

module.exports = {
  data: buildMusicCommand('music'),

  async execute(interaction) {
    const sarki = interaction.options.getString("sarki");
    const dosya = interaction.options.getAttachment("dosya");
    const islem = interaction.options.getString("islem");
    const lang = getGuildLanguage(interaction.guild?.id);
    const isEn = lang === "en";

    // Uzaktan kumanda: ses kanalında olmayanlar da müziği yönetebilsin (yalnızca Sunucuyu Yönet)
    if (islem === "uzaktan") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: isEn ? ":aegis_no: Manage Server permission required." : ":aegis_no: Sunucuyu Yönet yetkisi gerekli.", flags: MessageFlags.Ephemeral });
      }
      const on = musicManager.setRemote(interaction.guild.id, !musicManager.isRemoteOn(interaction.guild.id));
      const png = remoteCard({ on, isEn });
      return interaction.reply({
        ...cardPayload(png, {
          name: "remote.png",
          text: on
            ? (isEn ? "Anyone in the server can now control the music from any channel, even without joining voice." : "Artık sunucudaki herkes ses kanalında olmasa da müziği yönetebilir.")
            : (isEn ? "Only people in the voice channel can control the music now." : "Artık yalnızca ses kanalındakiler müziği yönetebilir."),
          accent: on ? 0x3ba55c : 0xed4245,
        }),
      });
    }

    // Ses kanalında değilse: çalan oturum + uzaktan kumanda açık olmalı
    if (islem && ["durdur", "duraklat", "devam", "gec"].includes(islem) && musicManager.hasSession(interaction.guild.id) && !musicManager.canControl(interaction.guild, interaction.member)) {
      return interaction.reply({
        content: isEn ? ":aegis_no: Join the voice channel to control the music (or ask an admin to turn on the remote)." : ":aegis_no: Müziği yönetmek için ses kanalında olmalısın (ya da bir yönetici uzaktan kumandayı açmalı).",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Handle islem actions first
    if (islem) {
      if (islem === "durdur") {
        const res = musicManager.stop(interaction.guild.id);
        return interaction.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
      }
      if (islem === "duraklat") {
        const res = musicManager.pause(interaction.guild.id);
        return interaction.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
      }
      if (islem === "devam") {
        const res = musicManager.resume(interaction.guild.id);
        return interaction.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
      }
      if (islem === "gec") {
        const res = musicManager.skip(interaction.guild.id);
        return interaction.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2 });
      }
      if (islem === "kuyruk") {
        const res = musicManager.getQueue(interaction.guild.id);
        return interaction.reply({ components: [res.container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
      }
      if (islem === "sozler") {
        return musicManager.showLyrics(interaction, sarki);
      }
    }

    // Play uploaded file
    if (dosya) {
      return musicManager.play(interaction, dosya);
    }

    // Play searched song or Spotify link
    if (sarki) {
      return musicManager.play(interaction, sarki);
    }

    // If no params, show active queue or general help panel
    const res = musicManager.getQueue(interaction.guild.id);
    if (res.ok) {
      return interaction.reply({
        components: [res.container],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const helpContainer = new ContainerBuilder().setAccentColor(0x0066ff);
    helpContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        isEn
          ? "## 🎵 Aegis Music System (Components V2)\n\n" +
            "High quality audio player powered by Discord's newest **Components V2** interface.\n\n" +
            "### 📌 How to Use?\n" +
            "• **/music sarki:** `[song title / YouTube / Spotify link]` — Plays a track, album, or playlist.\n" +
            "• **/music dosya:** `[upload MP3]` — Plays uploaded MP3/audio in voice channel.\n" +
            "• **/music islem:** `Lyrics` with **sarki:** `[song title]` — Fetches lyrics for the current or specified song.\n" +
            "• **/music islem:** `[Stop / Pause / Resume / Skip / Queue / Lyrics]` — Control the player.\n\n" +
            "### 💬 Prefix Commands:\n" +
            "• `a.play [song]` or `a.music [song / spotify link]`\n" +
            "• `a.lyrics [song title]`\n" +
            "• `a.stop` | `a.skip` | `a.pause` | `a.resume` | `a.queue`\n\n" +
            "🌐 *You can also control playback and 24/7 radios from the Web Dashboard!*"
          : "## 🎵 Aegis Müzik Sistemi (Components V2)\n\n" +
            "Discord'un en yeni **Components V2** arayüzü ile güçlendirilmiş, yüksek kaliteli ses oynatıcısı.\n\n" +
            "### 📌 Nasıl Kullanılır?\n" +
            "• **/music sarki:** `[şarkı adı / YouTube / Spotify linki]` — Şarkı veya Spotify albüm/çalma listesi çalar.\n" +
            "• **/music dosya:** `[MP3 yükle]` — Yüklediğin MP3/ses dosyasını ses kanalında çalar.\n" +
            "• **/music islem:** `Şarkı Sözleri` ve **sarki:** `[şarkı adı]` — Çalan veya aradığın şarkının sözlerini getirir.\n" +
            "• **/music islem:** `[Durdur / Duraklat / Devam / Geç / Kuyruk / Sözler]` — Oynatıcıyı kontrol eder.\n\n" +
            "### 💬 Metin Komutları (Prefix):\n" +
            "• `a.muzik [şarkı / spotify linki]` veya `a.play [şarkı]`\n" +
            "• `a.sozler [şarkı adı]` / `a.lyrics [şarkı adı]`\n" +
            "• `a.durdur` / `a.stop` | `a.gec` / `a.skip` | `a.duraklat` | `a.devam` | `a.kuyruk`\n\n" +
            "🌐 *Web Dashboard üzerinden de canlı oynatıcı ve 7/24 radyoları yönetebilirsin!*"
      )
    );

    return interaction.reply({
      components: [helpContainer],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true,
    });
  },
};
