/**
 * Aegis Music Trivia — Şarkıyı Tahmin Et Oyunu
 * 20 saniyelik ses kesiti ile ses kanalında çok oyunculu şarkı tahmin yarışması.
 */

const { execFile, spawn } = require('child_process');
const { PassThrough } = require('stream');

class BufferedAudioStream extends PassThrough {
  constructor(options = {}) {
    super({
      highWaterMark: options.highWaterMark || 1024 * 1024,
    });
    this.bufferThreshold = options.threshold || (192000 * 0.8);
    this.hasStarted = false;
    this.heldChunks = [];
    this.heldBytes = 0;
  }

  _write(chunk, encoding, callback) {
    if (!this.hasStarted) {
      this.heldChunks.push(chunk);
      this.heldBytes += chunk.length;
      if (this.heldBytes >= this.bufferThreshold) {
        this.hasStarted = true;
        for (const c of this.heldChunks) {
          this.push(c);
        }
        this.heldChunks = [];
      }
      callback();
    } else {
      this.push(chunk);
      callback();
    }
  }

  _final(callback) {
    if (!this.hasStarted && this.heldChunks.length > 0) {
      this.hasStarted = true;
      for (const c of this.heldChunks) {
        this.push(c);
      }
      this.heldChunks = [];
    }
    callback();
  }
}
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

// Aktif oyunlar: guildId => TriviaSession
const activeSessions = new Map();

// 50+ Çok iyi bilinen ikonik Türkçe ve Global şarkı kütüphanesi
const TRIVIA_SONGS = [
  // Türkçe Pop & Nostalji
  { artist: 'Tarkan', title: 'Şımarık', search: 'Tarkan Simarik audio' },
  { artist: 'Tarkan', title: 'Kuzu Kuzu', search: 'Tarkan Kuzu Kuzu audio' },
  { artist: 'Tarkan', title: 'Dudu', search: 'Tarkan Dudu audio' },
  { artist: 'Barış Manço', title: 'Dönence', search: 'Baris Manco Donence audio' },
  { artist: 'Barış Manço', title: 'Sarı Çizmeli Mehmet Ağa', search: 'Baris Manco Sari Cizmeli Mehmet Aga' },
  { artist: 'Barış Manço', title: 'Arkadaşım Eşek', search: 'Baris Manco Arkadasim Esek' },
  { artist: 'Sezen Aksu', title: 'Kaçın Kurası', search: 'Sezen Aksu Kacin Kurasi' },
  { artist: 'Sezen Aksu', title: 'Gülümse', search: 'Sezen Aksu Gulumse audio' },
  { artist: 'MFÖ', title: 'Ele Güne Karşı', search: 'MFO Ele Gune Karsi audio' },
  { artist: 'Kenan Doğulu', title: 'Çakkıdı', search: 'Kenan Dogulu Cakkidi audio' },
  { artist: 'Mustafa Sandal', title: 'Araba', search: 'Mustafa Sandal Araba audio' },
  { artist: 'Sertab Erener', title: 'Everyway That I Can', search: 'Sertab Erener Everyway That I Can' },

  // Türkçe Rock
  { artist: 'maNga', title: 'Bir Kadın Çizeceksin', search: 'manga Bir Kadin Cizeceksin audio' },
  { artist: 'maNga', title: 'Dursun Zaman', search: 'manga Dursun Zaman audio' },
  { artist: 'Duman', title: 'Haberin Yok Ölüyorum', search: 'Duman Haberin Yok Oluyorum audio' },
  { artist: 'Duman', title: 'Senden Daha Güzel', search: 'Duman Senden Daha Guzel audio' },
  { artist: 'Mor ve Ötesi', title: 'Bir Derdim Var', search: 'Mor ve Otesi Bir Derdim Var audio' },
  { artist: 'Şebnem Ferah', title: 'Sil Baştan', search: 'Sebnem Ferah Sil Bastan audio' },
  { artist: 'Teoman', title: 'Paramparça', search: 'Teoman Paramparca audio' },
  { artist: 'Athena', title: 'Kafama Göre', search: 'Athena Kafama Gore audio' },
  { artist: 'Madrigal', title: 'Seni Dert Etmeler', search: 'Madrigal Seni Dert Etmeler audio' },
  { artist: 'Yüzyüzeyken Konuşuruz', title: 'Dinle Beni Bi', search: 'Yuzyuzeyken Konusuruz Dinle Beni Bi' },

  // Türkçe Rap & Hip-Hop
  { artist: 'Ezhel', title: 'Geceler', search: 'Ezhel Geceler audio' },
  { artist: 'Ezhel', title: 'Felaket', search: 'Ezhel Felaket audio' },
  { artist: 'Ceza', title: 'Suspus', search: 'Ceza Suspus audio' },
  { artist: 'Ceza', title: 'Holokost', search: 'Ceza Holokost audio' },
  { artist: 'Sagopa Kajmer', title: 'Galiba', search: 'Sagopa Kajmer Galiba audio' },
  { artist: 'Sagopa Kajmer', title: 'Ateşten Gömlek', search: 'Sagopa Kajmer Atesten Gomlek' },
  { artist: 'Uzi', title: 'Krvn', search: 'Uzi Krvn audio' },
  { artist: 'Sefo', title: 'Bilmem Mi', search: 'Sefo Bilmem Mi audio' },
  { artist: 'Murda & Ezhel', title: 'Bi Sonraki Hayatımda Gel', search: 'Murda Ezhel Bi Sonraki Hayatimda Gel' },
  { artist: 'Çakal', title: 'İmdat', search: 'Cakal Imdat audio' },
  { artist: 'Motive', title: '10MG', search: 'Motive 10MG audio' },

  // Trend Pop & Yeni Nesil
  { artist: 'Simge', title: 'Aşkın Olayım', search: 'Simge Askin Olayim audio' },
  { artist: 'Mert Demir & Mabel Matiz', title: 'Antidepresan', search: 'Mert Demir Mabel Matiz Antidepresan' },
  { artist: 'Mabel Matiz', title: 'Karakol', search: 'Mabel Matiz Karakol audio' },
  { artist: 'KÖFN', title: 'Bi Tek Ben Anlarım', search: 'KOFN Bi Tek Ben Anlarim audio' },
  { artist: 'Edis', title: 'Martılar', search: 'Edis Martilar audio' },
  { artist: 'İlyas Yalçıntaş', title: 'İçimdeki Duman', search: 'Ilyas Yalcintas Icimdeki Duman' },

  // Global All-Time Hits
  { artist: 'Queen', title: 'Bohemian Rhapsody', search: 'Queen Bohemian Rhapsody audio' },
  { artist: 'Michael Jackson', title: 'Billie Jean', search: 'Michael Jackson Billie Jean audio' },
  { artist: 'Eminem', title: 'Lose Yourself', search: 'Eminem Lose Yourself audio' },
  { artist: 'Daft Punk', title: 'Get Lucky', search: 'Daft Punk Get Lucky audio' },
  { artist: 'The Weeknd', title: 'Blinding Lights', search: 'The Weeknd Blinding Lights audio' },
  { artist: 'Dua Lipa', title: 'Levitating', search: 'Dua Lipa Levitating audio' },
  { artist: 'Coolio', title: "Gangsta's Paradise", search: 'Coolio Gangstas Paradise audio' },
  { artist: 'Ed Sheeran', title: 'Shape of You', search: 'Ed Sheeran Shape of You audio' },
  { artist: 'Imagine Dragons', title: 'Believer', search: 'Imagine Dragons Believer audio' },
  { artist: 'AC/DC', title: 'Highway to Hell', search: 'AC DC Highway to Hell audio' },
  { artist: 'Nirvana', title: 'Smells Like Teen Spirit', search: 'Nirvana Smells Like Teen Spirit audio' },
];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resolveAudioStreamUrl(query) {
  return new Promise((resolve) => {
    execFile(
      'yt-dlp',
      [
        `ytsearch1:${query}`,
        '-f', 'ba/b',
        '--print', '%(url)s',
        '--no-warnings',
        '--no-playlist',
      ],
      { timeout: 12000 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return resolve(null);
        resolve(stdout.trim().split('\n')[0]);
      }
    );
  });
}

class TriviaSession {
  constructor({ guildId, textChannel, voiceChannel, rounds = 5, starterUser }) {
    this.guildId = guildId;
    this.textChannel = textChannel;
    this.voiceChannel = voiceChannel;
    this.totalRounds = Math.min(15, Math.max(3, rounds));
    this.currentRound = 1;
    this.starterUser = starterUser;
    this.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.playedIndices = new Set();
    this.scores = new Map(); // userId => score
    this.player = null;
    this.connection = null;
    this.currentFfmpeg = null;
    this.currentQuestion = null;
    this.roundMessage = null;
    this.roundTimeout = null;
    this.isEnding = false;
  }

  async start() {
    try {
      this.connection = joinVoiceChannel({
        channelId: this.voiceChannel.id,
        guildId: this.guildId,
        adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
      });

      this.player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play },
      });

      this.connection.subscribe(this.player);

      await entersState(this.connection, VoiceConnectionStatus.Ready, 10000);
      activeSessions.set(this.guildId, this);

      // İlk turu başlat
      this.runNextRound();
    } catch (err) {
      console.error('[MusicTrivia] Start error:', err);
      this.cleanup();
      throw err;
    }
  }

  async runNextRound() {
    if (this.isEnding) return;

    if (this.currentRound > this.totalRounds) {
      return this.endGame('completed');
    }

    // Seçilmemiş rastgele bir şarkı seç
    const availableIndices = [];
    for (let i = 0; i < TRIVIA_SONGS.length; i++) {
      if (!this.playedIndices.has(i)) availableIndices.push(i);
    }
    if (availableIndices.length === 0) {
      this.playedIndices.clear();
      for (let i = 0; i < TRIVIA_SONGS.length; i++) availableIndices.push(i);
    }

    const targetIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    this.playedIndices.add(targetIdx);
    const targetSong = TRIVIA_SONGS[targetIdx];

    // 3 farklı yanıltıcı şık seç (farklı sanatçılardan)
    const distractorPool = TRIVIA_SONGS.filter(
      (s, idx) => idx !== targetIdx && s.artist !== targetSong.artist
    );
    const shuffledDistractors = shuffleArray(distractorPool).slice(0, 3);

    // 4 şıkkı karıştır
    const options = shuffleArray([targetSong, ...shuffledDistractors]);
    const correctIndex = options.findIndex((s) => s === targetSong);

    this.currentQuestion = {
      targetSong,
      options,
      correctIndex,
      answered: false,
      round: this.currentRound,
    };

    // Ses akış linkini al
    const streamUrl = await resolveAudioStreamUrl(targetSong.search);
    if (!streamUrl) {
      // Bir sonraki tura geç
      console.warn('[MusicTrivia] Failed to resolve URL for:', targetSong.title);
      this.currentRound++;
      return this.runNextRound();
    }

    // FFmpeg ile 30. saniyeden başlayıp 20 saniye çal
    if (this.currentFfmpeg) {
      try { this.currentFfmpeg.kill('SIGKILL'); } catch (_) {}
    }

    this.currentFfmpeg = spawn(
      'ffmpeg',
      [
        '-reconnect', '1',
        '-reconnect_on_network_error', '1',
        '-reconnect_on_http_error', '4xx,5xx',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-tcp_nodelay', '1',
        '-probesize', '32768',
        '-analyzeduration', '0',
        '-ss', '00:00:30',
        '-t', '20',
        '-i', streamUrl,
        '-loglevel', 'error',
        '-vn',
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );

    const bufferStream = new BufferedAudioStream();
    this.currentFfmpeg.stdout.pipe(bufferStream);

    const resource = createAudioResource(bufferStream, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });
    resource.volume?.setVolume(0.85);

    this.player.play(resource);

    // Soru kartını Components V2 formatında hazırla
    const letters = ['🅰️', '🅱️', '🅲', '🅳'];
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`trivia_ans_${this.id}_0_${this.currentRound}`)
        .setLabel(`A) ${options[0].artist} - ${options[0].title}`.slice(0, 80))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`trivia_ans_${this.id}_1_${this.currentRound}`)
        .setLabel(`B) ${options[1].artist} - ${options[1].title}`.slice(0, 80))
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`trivia_ans_${this.id}_2_${this.currentRound}`)
        .setLabel(`C) ${options[2].artist} - ${options[2].title}`.slice(0, 80))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`trivia_ans_${this.id}_3_${this.currentRound}`)
        .setLabel(`D) ${options[3].artist} - ${options[3].title}`.slice(0, 80))
        .setStyle(ButtonStyle.Primary)
    );

    const rowControl = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`trivia_stop_${this.id}`)
        .setLabel('⏹️ Oyunu Bitir')
        .setStyle(ButtonStyle.Danger)
    );

    const container = new ContainerBuilder().setAccentColor(0x9b59b6);
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 🎵 Şarkıyı Tahmin Et! • Tur ${this.currentRound}/${this.totalRounds}`
      )
    );
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `🔊 Ses kanalında **20 saniyelik** müzik kesiti çalıyor!\n` +
        `Aşağıdaki butonlardan doğru şarkıyı ilk sen bul ve **+10 Puan** kazan!\n\n` +
        `⏱️ **Kalan Süre:** 20 saniye`
      )
    );
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addActionRowComponents(row1);
    container.addActionRowComponents(row2);
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addActionRowComponents(rowControl);

    this.roundMessage = await this.textChannel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });

    // 20 saniye zaman aşımı
    if (this.roundTimeout) clearTimeout(this.roundTimeout);
    this.roundTimeout = setTimeout(() => {
      this.handleTimeout();
    }, 20000);
  }

  async handleAnswer(interaction, selectedIdx, roundNum) {
    if (this.isEnding) return;
    if (!this.currentQuestion || this.currentQuestion.round !== roundNum) {
      return interaction.reply({ content: '⚠️ Bu turun süresi dolmuş veya başka tura geçilmiş!', flags: MessageFlags.Ephemeral });
    }

    if (this.currentQuestion.answered) {
      return interaction.reply({ content: '⚠️ Bu tur zaten başka bir üye tarafından cevaplandı!', flags: MessageFlags.Ephemeral });
    }

    // Ses kanalında mı kontrol et
    const memberVoice = interaction.member?.voice?.channelId;
    if (!memberVoice || memberVoice !== this.voiceChannel.id) {
      return interaction.reply({
        content: `⚠️ Oyuna katılmak ve tahmin yapmak için <#${this.voiceChannel.id}> ses kanalında olmalısın!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const { targetSong, options, correctIndex } = this.currentQuestion;

    if (selectedIdx === correctIndex) {
      // DOĞRU CEVAP
      this.currentQuestion.answered = true;
      if (this.roundTimeout) clearTimeout(this.roundTimeout);
      this.player.stop();
      if (this.currentFfmpeg) {
        try { this.currentFfmpeg.kill('SIGKILL'); } catch (_) {}
      }

      // Puan ver
      const userId = interaction.user.id;
      const currentScore = (this.scores.get(userId) || 0) + 10;
      this.scores.set(userId, currentScore);

      // Kartı tebrik formatına güncelle
      const winContainer = new ContainerBuilder().setAccentColor(0x3ba55c);
      winContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🏆 DOĞRU TAHMİN! • Tur ${this.currentRound}/${this.totalRounds}`
        )
      );
      winContainer.addSeparatorComponents(new SeparatorBuilder());
      winContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `🎉 Tebrikler <@${userId}> doğru bildi!\n\n` +
          `🎵 **Şarkı:** **${targetSong.artist} — ${targetSong.title}**\n` +
          `🏅 **Ödül:** +10 Trivia Puanı (Toplam: **${currentScore} Puan**)\n\n` +
          `*Sıradaki tura 4 saniye içinde geçiliyor...*`
        )
      );

      // Butonları devre dışı bırak ve doğru olanı yeşil yap
      const disabledRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ans_0_dis')
          .setLabel(`A) ${options[0].artist} - ${options[0].title}`.slice(0, 80))
          .setStyle(correctIndex === 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('ans_1_dis')
          .setLabel(`B) ${options[1].artist} - ${options[1].title}`.slice(0, 80))
          .setStyle(correctIndex === 1 ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true)
      );
      const disabledRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ans_2_dis')
          .setLabel(`C) ${options[2].artist} - ${options[2].title}`.slice(0, 80))
          .setStyle(correctIndex === 2 ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('ans_3_dis')
          .setLabel(`D) ${options[3].artist} - ${options[3].title}`.slice(0, 80))
          .setStyle(correctIndex === 3 ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true)
      );

      winContainer.addSeparatorComponents(new SeparatorBuilder());
      winContainer.addActionRowComponents(disabledRow1);
      winContainer.addActionRowComponents(disabledRow2);

      await interaction.update({
        components: [winContainer],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});

      // 4 saniye sonra sonraki tur
      setTimeout(() => {
        this.currentRound++;
        this.runNextRound();
      }, 4000);
    } else {
      // YANLIŞ CEVAP
      return interaction.reply({
        content: `❌ **Yanlış tahmin!** Başka bir seçeneği deneyebilirsin.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  async handleTimeout() {
    if (this.isEnding || !this.currentQuestion || this.currentQuestion.answered) return;

    this.currentQuestion.answered = true;
    this.player.stop();
    if (this.currentFfmpeg) {
      try { this.currentFfmpeg.kill('SIGKILL'); } catch (_) {}
    }

    const { targetSong, options, correctIndex } = this.currentQuestion;

    const timeoutContainer = new ContainerBuilder().setAccentColor(0xed4245);
    timeoutContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ⏰ SÜRE DOLDU! • Tur ${this.currentRound}/${this.totalRounds}`
      )
    );
    timeoutContainer.addSeparatorComponents(new SeparatorBuilder());
    timeoutContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Kimse şarkıyı 20 saniye içinde doğru tahmin edemedi.\n\n` +
        `🎵 **Doğru Şarkı:** **${targetSong.artist} — ${targetSong.title}** idi!\n\n` +
        `*Sıradaki tura 4 saniye içinde geçiliyor...*`
      )
    );

    const disabledRow1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ans_0_t_dis')
        .setLabel(`A) ${options[0].artist} - ${options[0].title}`.slice(0, 80))
        .setStyle(correctIndex === 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('ans_1_t_dis')
        .setLabel(`B) ${options[1].artist} - ${options[1].title}`.slice(0, 80))
        .setStyle(correctIndex === 1 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(true)
    );
    const disabledRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ans_2_t_dis')
        .setLabel(`C) ${options[2].artist} - ${options[2].title}`.slice(0, 80))
        .setStyle(correctIndex === 2 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('ans_3_t_dis')
        .setLabel(`D) ${options[3].artist} - ${options[3].title}`.slice(0, 80))
        .setStyle(correctIndex === 3 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(true)
    );

    timeoutContainer.addSeparatorComponents(new SeparatorBuilder());
    timeoutContainer.addActionRowComponents(disabledRow1);
    timeoutContainer.addActionRowComponents(disabledRow2);

    if (this.roundMessage) {
      await this.roundMessage.edit({
        components: [timeoutContainer],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }

    setTimeout(() => {
      this.currentRound++;
      this.runNextRound();
    }, 4000);
  }

  async endGame(reason = 'completed') {
    this.isEnding = true;
    if (this.roundTimeout) clearTimeout(this.roundTimeout);
    if (this.player) this.player.stop();
    if (this.currentFfmpeg) {
      try { this.currentFfmpeg.kill('SIGKILL'); } catch (_) {}
    }

    // Skor tablosu
    const sorted = Array.from(this.scores.entries()).sort((a, b) => b[1] - a[1]);

    const endContainer = new ContainerBuilder().setAccentColor(0xffd700);
    endContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🏆 Müzik Trivia Sona Erdi!`)
    );
    endContainer.addSeparatorComponents(new SeparatorBuilder());

    let leaderboardText = '';
    if (sorted.length === 0) {
      leaderboardText = 'Hiç kimse puan kazanamadı. Bir dahaki sefere daha iyi şanslar!';
    } else {
      leaderboardText = '### 🏅 Skor Tablosu & Kazananlar:\n';
      const medals = ['🥇', '🥈', '🥉'];

      sorted.slice(0, 5).forEach(([userId, score], index) => {
        const medal = medals[index] || '🎖️';
        leaderboardText += `${medal} **${index + 1}. Sıra:** <@${userId}> — **${score} Puan**\n`;
      });
    }

    endContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${leaderboardText}\n\n` +
        `Katılan herkese teşekkürler! Tekrar oynamak için **/games** komutunu kullanabilirsiniz.`
      )
    );

    await this.textChannel.send({
      components: [endContainer],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});

    this.cleanup();
  }

  cleanup() {
    activeSessions.delete(this.guildId);
    if (this.roundTimeout) clearTimeout(this.roundTimeout);
    if (this.currentFfmpeg) {
      try { this.currentFfmpeg.kill('SIGKILL'); } catch (_) {}
    }
    if (this.connection) {
      try { this.connection.destroy(); } catch (_) {}
    }
  }
}

function startTrivia(interaction, rounds = 5) {
  const memberVoice = interaction.member?.voice?.channel;
  if (!memberVoice) {
    return { ok: false, message: '⚠️ Şarkı tahmin oyununu başlatmak için önce bir ses kanalına girmelisin!' };
  }

  if (activeSessions.has(interaction.guildId)) {
    return { ok: false, message: '⚠️ Bu sunucuda zaten aktif bir Şarkı Tahmin oyunu devam ediyor!' };
  }

  const session = new TriviaSession({
    guildId: interaction.guildId,
    textChannel: interaction.channel,
    voiceChannel: memberVoice,
    rounds,
    starterUser: interaction.user,
  });

  session.start().catch((err) => {
    session.cleanup();
  });

  return { ok: true, message: `🎮 **Şarkıyı Tahmin Et** oyunu <#${memberVoice.id}> ses kanalında başlatılıyor!` };
}

function handleTriviaButton(interaction) {
  const customId = interaction.customId;
  const session = activeSessions.get(interaction.guildId);

  if (customId.startsWith('trivia_stop_')) {
    if (!session) {
      return interaction.reply({ content: '⚠️ Aktif bir oyun bulunamadı.', flags: MessageFlags.Ephemeral });
    }
    session.endGame('stopped');
    return interaction.reply({ content: '⏹️ Oyun durduruldu ve sonlandırıldı.', flags: MessageFlags.Ephemeral });
  }

  if (customId.startsWith('trivia_ans_')) {
    if (!session) {
      return interaction.reply({ content: '⚠️ Aktif bir oyun bulunamadı.', flags: MessageFlags.Ephemeral });
    }
    const parts = customId.split('_'); // trivia_ans_sessionId_optIdx_round
    const optIdx = parseInt(parts[3], 10);
    const roundNum = parseInt(parts[4], 10);
    return session.handleAnswer(interaction, optIdx, roundNum);
  }

  return false;
}

function isTriviaActive(guildId) {
  return activeSessions.has(guildId);
}

module.exports = {
  startTrivia,
  handleTriviaButton,
  isTriviaActive,
  activeSessions,
};
