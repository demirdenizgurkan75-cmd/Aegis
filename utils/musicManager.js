const { getGuildLanguage } = require("./i18n");
const fs = require("fs");
const path = require("path");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
  NoSubscriberBehavior,
} = require("@discordjs/voice");
const { spawn, execFile } = require("child_process");
const { PassThrough } = require("stream");

class BufferedAudioStream extends PassThrough {
  constructor(options = {}) {
    super({
      highWaterMark: options.highWaterMark || 1024 * 1024, // 1MB buffer (~5.2 saniyelik 48kHz s16le PCM)
    });
    this.bufferThreshold = options.threshold || (192000 * 1.5); // 1.5 saniye ön yükleme (~288 KB)
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
const https = require("https");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const CACHE_DIR = "/tmp/aegis-music-cache";
if (!fs.existsSync(CACHE_DIR)) {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}
}

function pruneCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const files = fs.readdirSync(CACHE_DIR);
    const now = Date.now();
    for (const f of files) {
      const p = path.join(CACHE_DIR, f);
      const stat = fs.statSync(p);
      if (now - stat.mtimeMs > 6 * 3600 * 1000) {
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }
  } catch (_) {}
}
setInterval(pruneCache, 60 * 60 * 1000);

// Per-guild queue map: Map<guildId, Queue>
const queues = new Map();

// Radio Station presets
const RADIO_STATIONS = {
  powerfm: {
    name: "Power FM",
    url: "https://listen.powerapp.com.tr/powerfm/mpeg/icecast.audio",
    duration: "Canlı Radyo",
    thumbnail: "https://betterwithaegis.com/images/icon-512.png",
  },
  kralpop: {
    name: "Kral Pop",
    url: "https://kralpopwms.daioncdn.net/kralpop/kralpop.stream/playlist.m3u8",
    duration: "Canlı Radyo",
    thumbnail: "https://betterwithaegis.com/images/icon-512.png",
  },
  slowturk: {
    name: "Slow Türk",
    url: "https://slowturkwms.daioncdn.net/slowturk/slowturk.stream/playlist.m3u8",
    duration: "Canlı Radyo",
    thumbnail: "https://betterwithaegis.com/images/icon-512.png",
  },
  fenomen: {
    name: "Radyo Fenomen",
    url: "https://listen.powerapp.com.tr/fenomen/mpeg/icecast.audio",
    duration: "Canlı Radyo",
    thumbnail: "https://betterwithaegis.com/images/icon-512.png",
  },
  lofi: {
    name: "Lofi Hip Hop Radio",
    url: "https://play.streamafrica.net/lofiradio",
    duration: "Canlı Radyo",
    thumbnail: "https://betterwithaegis.com/images/icon-512.png",
  },
};

// Audio Filter Presets
const AUDIO_FILTERS = {
  none: {
    name: "Normal (Filtresiz)",
    filter: null,
    emoji: "🎵",
    description: "Orijinal ses kalitesi",
  },
  bassboost: {
    name: "Bassboost (Güçlü Bas)",
    filter: "equalizer=f=40:width_type=h:width=50:g=10,equalizer=f=80:width_type=h:width=50:g=8",
    emoji: "🔊",
    description: "Derin ve güçlü bas deneyimi",
  },
  nightcore: {
    name: "Nightcore (Hızlı & Tiz)",
    filter: "aresample=48000,asetrate=48000*1.25",
    emoji: "⚡",
    description: "Yüksek tempo ve tiz ses tonu",
  },
  slowed: {
    name: "Slowed + Reverb",
    filter: "aresample=48000,asetrate=48000*0.85,aecho=0.8:0.88:60:0.4",
    emoji: "🌙",
    description: "Yavaşlatılmış, yankılı atmosferik ses",
  },
  "8d": {
    name: "8D Audio (Dönen Stereo)",
    filter: "apulsator=hz=0.125",
    emoji: "🎧",
    description: "Kulaklıkta 360 derece dönen stereo ses",
  },
  vaporwave: {
    name: "Vaporwave (Lo-Fi)",
    filter: "aresample=48000,asetrate=48000*0.80",
    emoji: "📼",
    description: "Nostaljik lo-fi yavaş ton",
  },
  karaoke: {
    name: "Karaoke (Vokal Azaltma)",
    filter: "stereotools=mlev=0.05",
    emoji: "🎤",
    description: "Ana vokali filtreleyip enstrümanı öne çıkarır",
  },
};

/**
 * Validates if string is an HTTP/HTTPS URL
 */
function isValidUrl(str) {
  if (!str || typeof str !== "string") return false;
  return str.startsWith("http://") || str.startsWith("https://");
}

/**
 * Searches music using yt-dlp or direct URL
 */
/**
 * Resolves direct audio stream URL with caching
 */
function getStreamUrl(song) {
  return new Promise((resolve) => {
    if (song.localFilePath && fs.existsSync(song.localFilePath)) {
      return resolve(song.localFilePath);
    }
    if (song.isDirect || song.isRadio) {
      return resolve(song.url);
    }

    const targetUrl = song.webpageUrl || song.url;
    // Check if already downloaded in cache
    try {
      if (song.id) {
        for (const ext of ["webm", "m4a", "opus", "mp3"]) {
          const candidate = path.join(CACHE_DIR, `${song.id}.${ext}`);
          if (fs.existsSync(candidate) && fs.statSync(candidate).size > 50000) {
            song.localFilePath = candidate;
            return resolve(candidate);
          }
        }
      }
    } catch (_) {}

    // Download to local cache to ensure zero network stutter
    execFile(
      "yt-dlp",
      [
        "-f", "ba/b",
        "--no-playlist",
        "--no-simulate",
        "-o", path.join(CACHE_DIR, "%(id)s.%(ext)s"),
        "--print", "after_move:filepath",
        targetUrl
      ],
      { timeout: 30000 },
      (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          const localPath = stdout.trim().split("\n")[0];
          if (fs.existsSync(localPath)) {
            song.localFilePath = localPath;
            return resolve(localPath);
          }
        }
        // Fallback to streamUrl or raw url
        if (song.streamUrl) return resolve(song.streamUrl);
        resolve(song.url);
      }
    );
  });
}

function searchMusic(query) {
  return new Promise((resolve) => {
    // If query is an HTTP direct link to an audio file
    if (/^https?:\/\/.*?\.(mp3|wav|ogg|flac|m4a|aac)(\?.*)?$/i.test(query)) {
      const filename = query.split("/").pop().split("?")[0];
      return resolve({
        title: decodeURIComponent(filename) || "Ses Dosyası",
        url: query,
        duration: "Dosya / Akış",
        thumbnail: "https://betterwithaegis.com/images/icon-512.png",
        webpageUrl: query,
        isDirect: true,
      });
    }

    const searchArg = /^https?:\/\//i.test(query) ? query : `ytsearch1:${query}`;

    execFile(
      "yt-dlp",
      [
        searchArg,
        "-f", "ba/b",
        "--no-playlist",
        "--no-simulate",
        "-o", path.join(CACHE_DIR, "%(id)s.%(ext)s"),
        "--print", "%(title)s|||%(duration_string)s|||%(thumbnail)s|||%(webpage_url)s|||%(id)s|||%(ext)s|||%(duration)s",
      ],
      { timeout: 35000 },
      (error, stdout) => {
        if (error || !stdout || !stdout.trim()) {
          return resolve(null);
        }

        const lines = stdout.trim().split("\n");
        const first = lines[0].split("|||");

        if (!first || first.length < 4) {
          return resolve(null);
        }

        const rawThumb = first[2].trim();
        const thumbnail = isValidUrl(rawThumb) ? rawThumb : "https://betterwithaegis.com/images/icon-512.png";
        const videoId = first[4] ? first[4].trim() : null;
        const ext = first[5] ? first[5].trim() : "webm";
        const localPath = videoId ? path.join(CACHE_DIR, `${videoId}.${ext}`) : null;
        const hasLocal = localPath && fs.existsSync(localPath);
        const durationSec = Number(first[6]) || parseDurationSec(first[1]);

        resolve({
          title: first[0].trim() || "Bilinmeyen Şarkı",
          duration: first[1].trim() || "Bilinmiyor",
          durationSec: durationSec || 0,
          thumbnail,
          url: first[3].trim(),
          webpageUrl: first[3].trim(),
          id: videoId,
          localFilePath: hasLocal ? localPath : null,
          isDirect: false,
        });
      }
    );
  });
}

function formatDurationString(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * Searches tracks via iTunes Music metadata + YouTube suggestions + yt-dlp fallback
 */
async function searchTracks(query) {
  if (!query || !query.trim()) return { tracks: [], suggestions: [] };
  const cleanQ = query.trim();

  // 1. YouTube anlık arama önerileri (autocomplete)
  let suggestions = [];
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(cleanQ)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[1])) {
        suggestions = data[1].slice(0, 8);
      }
    }
  } catch (_) {}

  // 2. iTunes Music API (TR & Global) yüksek çözünürlüklü şarkı arama
  const tracks = [];
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&country=TR&entity=song&limit=10`;
    const res = await fetch(itunesUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.results)) {
        for (const item of data.results) {
          const art = item.artworkUrl100
            ? item.artworkUrl100.replace("100x100bb.jpg", "600x600bb.jpg")
            : null;
          const durationSec = Math.round((item.trackTimeMillis || 0) / 1000);
          tracks.push({
            id: String(item.trackId),
            title: item.trackName,
            artist: item.artistName,
            album: item.collectionName || "",
            duration: formatDurationString(durationSec),
            durationSec,
            thumbnail: art,
            previewUrl: item.previewUrl || null,
            genre: item.primaryGenreName || "Müzik",
            query: `${item.artistName} - ${item.trackName}`,
            source: "spotify",
          });
        }
      }
    }
  } catch (_) {}

  // 3. 3'ten az sonuç varsa veya remix/özel içerik için yt-dlp ile destekle
  if (tracks.length < 3) {
    try {
      const ytTracks = await new Promise((resolve) => {
        execFile(
          "yt-dlp",
          [
            `ytsearch6:${cleanQ}`,
            "--flat-playlist",
            "--print",
            "%(title)s|||%(duration_string)s|||%(thumbnails.-1.url)s|||%(url)s|||%(uploader)s|||%(id)s",
          ],
          { timeout: 8000 },
          (err, stdout) => {
            if (err || !stdout || !stdout.trim()) return resolve([]);
            const lines = stdout.trim().split("\n");
            const items = [];
            for (const line of lines) {
              const parts = line.split("|||");
              if (parts.length >= 4) {
                const title = parts[0]?.trim() || "Bilinmeyen Şarkı";
                const durStr = parts[1]?.trim() || "0:00";
                const thumb = parts[2]?.trim() || "https://betterwithaegis.com/images/icon-512.png";
                const url = parts[3]?.trim() || "";
                const artist = parts[4]?.trim() || "YouTube";
                const id = parts[5]?.trim() || url;
                items.push({
                  id,
                  title,
                  artist,
                  album: "YouTube",
                  duration: durStr,
                  durationSec: parseDurationSec(durStr),
                  thumbnail: thumb,
                  previewUrl: null,
                  genre: "YouTube",
                  query: url.startsWith("http") ? url : title,
                  source: "youtube",
                });
              }
            }
            resolve(items);
          }
        );
      });

      for (const yt of ytTracks) {
        if (!tracks.some((t) => t.title.toLowerCase() === yt.title.toLowerCase())) {
          tracks.push(yt);
        }
      }
    } catch (_) {}
  }

  return { query: cleanQ, suggestions, tracks };
}

/**
 * Resolves Spotify track, album or playlist URLs without API keys
 */
async function resolveSpotify(url) {
  try {
    const isTrack = url.includes("/track/");
    const isPlaylist = url.includes("/playlist/");
    const isAlbum = url.includes("/album/");

    if (isTrack) {
      const trackId = url.split("/track/")[1]?.split("?")[0];
      const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
      const res = await fetch(embedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(6000),
      });
      const html = await res.text();
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
      if (match) {
        const data = JSON.parse(match[1]);
        const entity = data.props?.pageProps?.state?.data?.entity;
        if (entity && entity.name) {
          const artist = entity.artists?.map((a) => a.name).join(", ") || "";
          return {
            type: "track",
            query: `${artist} ${entity.name}`.trim(),
            title: entity.name,
            artist,
            thumbnail: entity.coverArt?.sources?.[0]?.url || "https://betterwithaegis.com/images/icon-512.png",
          };
        }
      }
    } else if (isPlaylist || isAlbum) {
      const type = isPlaylist ? "playlist" : "album";
      const id = url.split(`/${type}/`)[1]?.split("?")[0];
      const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
      const res = await fetch(embedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(6000),
      });
      const html = await res.text();
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
      if (match) {
        const data = JSON.parse(match[1]);
        const entity = data.props?.pageProps?.state?.data?.entity;
        const trackList = entity?.trackList || [];
        if (trackList.length > 0) {
          return {
            type,
            name: entity.name || "Spotify Çalma Listesi",
            tracks: trackList.map((t) => ({
              query: `${t.subtitle || ""} ${t.title}`.trim(),
              title: t.title,
              artist: t.subtitle,
            })),
          };
        }
      }
    }
  } catch (e) {
    console.error("[Spotify Resolve Error]:", e.message);
  }
  return null;
}

/**
 * Fetches lyrics from LRCLIB with Gemini 3.1 Flash Lite fallback
 */
async function getLyrics(query) {
  if (!query || !query.trim()) return null;
  const clean = query
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/official\s+video|official\s+music\s+video|lyric\s+video|audio|klip|video|hd|4k/gi, "")
    .trim();

  // Try 1: LRCLIB API
  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(clean)}`, {
      headers: { "User-Agent": "AegisBot/2.0 (music@betterwithaegis.com)" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        const found = list.find((item) => item.plainLyrics) || list[0];
        if (found && found.plainLyrics) {
          return {
            title: found.trackName || found.name || clean,
            artist: found.artistName || "Bilinmeyen Sanatçı",
            lyrics: found.plainLyrics.trim(),
            source: "LRCLIB",
          };
        }
      }
    }
  } catch (err) {
    console.error("[LRCLIB Lyrics Error]:", err.message);
  }

  // Try 2: Gemini 3.1 Flash Lite Fallback
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const prompt = `Aşağıdaki şarkının orijinal şarkı sözlerini eksiksiz şekilde getir. Hiçbir selamlama, not veya giriş cümlesi kurma, doğrudan şarkı sözlerini ver:\n\nŞarkı: "${clean}"`;
      const postData = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.1,
        },
      });

      const geminiRes = await new Promise((resolve) => {
        const req = https.request(
          {
            hostname: "generativelanguage.googleapis.com",
            path: `/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postData),
            },
          },
          (r) => {
            let chunkData = "";
            r.on("data", (c) => (chunkData += c));
            r.on("end", () => {
              try {
                const json = JSON.parse(chunkData);
                const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
                resolve(text || null);
              } catch (_) {
                resolve(null);
              }
            });
          }
        );
        req.on("error", () => resolve(null));
        req.setTimeout(8000, () => {
          req.destroy();
          resolve(null);
        });
        req.write(postData);
        req.end();
      });

      if (geminiRes && geminiRes.trim().length > 30) {
        return {
          title: clean,
          artist: "Aegis AI",
          lyrics: geminiRes.trim(),
          source: "Aegis AI Lyrics",
        };
      }
    } catch (gErr) {
      console.error("[Gemini Lyrics Error]:", gErr.message);
    }
  }

  return null;
}

/**
 * Builds control buttons for playing track
 */
function createControlButtons(isPaused = false, loopMode = "none", volumePercent = 100) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music_replay")
      .setLabel("Başa Sar")
      .setEmoji("⏮️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_toggle_pause")
      .setLabel(isPaused ? "Devam Et" : "Duraklat")
      .setEmoji(isPaused ? "▶️" : "⏸️")
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music_skip")
      .setLabel("Geç")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_stop")
      .setLabel("Durdur")
      .setEmoji("⏹️")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("music_loop")
      .setLabel(loopMode === "song" ? "Döngü: Şarkı" : loopMode === "queue" ? "Döngü: Kuyruk" : "Döngü: Kapalı")
      .setEmoji(loopMode === "song" ? "🔂" : loopMode === "queue" ? "🔁" : "🔄")
      .setStyle(loopMode !== "none" ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music_vol_down")
      .setLabel("-10%")
      .setEmoji("🔉")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_vol_up")
      .setLabel("+10%")
      .setEmoji("🔊")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_shuffle")
      .setLabel("Karıştır")
      .setEmoji("🔀")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_queue")
      .setLabel("Kuyruk")
      .setEmoji("📜")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_lyrics")
      .setLabel("Sözler")
      .setEmoji("🎤")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

/**
 * Helper to build standard message container in Components V2
 */
function buildMessageContainer(title, text, color = 0x5865f2) {
  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}\n\n> ${text}`)
  );
  return container;
}

/**
 * Builds Now Playing Container (Components V2)
 */
function buildNowPlayingContainer(song, isPaused = false, activeFilter = "none", queue = null) {
  const container = new ContainerBuilder().setAccentColor(isPaused ? 0xffa500 : 0x5865f2);
  const guildId = queue?.guildId || queue?.textChannel?.guild?.id;
  const isEn = guildId ? getGuildLanguage(guildId) === "en" : false;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      isPaused
        ? (isEn ? "## ⏸️ Aegis Music — Paused" : "## ⏸️ Aegis Music — Duraklatıldı")
        : (isEn ? "## 🎵 Aegis Music — Now Playing" : "## 🎵 Aegis Music — Şu An Çalıyor")
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const sourceText = song.isFile
    ? "`📁 MP3 Dosyası`"
    : song.isDirect
    ? "`🔗 Doğrudan Bağlantı`"
    : song.isSpotify
    ? "`🟢 Spotify Eşleşmesi`"
    : "`▶️ YouTube / Çevrimiçi`";

  const filterText = activeFilter && activeFilter !== "none" && AUDIO_FILTERS[activeFilter]
    ? `${AUDIO_FILTERS[activeFilter].emoji} \`${AUDIO_FILTERS[activeFilter].name}\``
    : "`Kapalı`";

  const loopMode = queue?.loopMode || "none";
  const loopText = loopMode === "song" ? "🔂 `Tekrar: Şarkı`" : loopMode === "queue" ? "🔁 `Tekrar: Kuyruk`" : "`Kapalı`";
  const volText = `${typeof queue?.volumePercent === "number" ? queue.volumePercent : 100}%`;
  const queueCount = queue?.songs?.length || 0;
  const queueText = queueCount > 0 ? `\`${queueCount} şarkı bekliyor\`` : "`Sırada şarkı yok`";

  const requestedByText = song.requestedBy ? `${song.requestedBy}` : "Bilinmiyor";
  const songUrl = isValidUrl(song.webpageUrl) ? song.webpageUrl : "https://betterwithaegis.com";

  const infoText =
    `### [${song.title.slice(0, 240)}](${songUrl})\n\n` +
    `⏱️ **Süre:** \`${song.duration}\`  •  👤 **İsteyen:** ${requestedByText}\n` +
    `📻 **Kaynak:** ${sourceText}\n` +
    `🔊 **Ses:** \`${volText}\`  •  🔁 **Döngü:** ${loopText}\n` +
    `📜 **Kuyruk:** ${queueText}`;

  if (isValidUrl(song.thumbnail)) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  const rows = createControlButtons(isPaused, loopMode, queue?.volumePercent || 100);
  rows.forEach(r => container.addActionRowComponents(r));

  return container;
}

/**
 * Builds Added to Queue Container (Components V2)
 */
function buildAddedToQueueContainer(song, queuePosition, guildId = null) {
  const container = new ContainerBuilder().setAccentColor(0x57f287);
  const isEn = guildId ? getGuildLanguage(guildId) === "en" : false;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(isEn ? "## ➕ Added to Queue" : "## ➕ Şarkı Kuyruğa Eklendi")
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const sourceText = song.isFile
    ? "`📁 MP3 Dosyası`"
    : song.isDirect
    ? "`🔗 Doğrudan Bağlantı`"
    : song.isSpotify
    ? "`🟢 Spotify Eşleşmesi`"
    : "`▶️ YouTube / Çevrimiçi`";

  const requestedByText = song.requestedBy ? `${song.requestedBy}` : "Bilinmiyor";
  const songUrl = isValidUrl(song.webpageUrl) ? song.webpageUrl : "https://betterwithaegis.com";

  const infoText =
    `### [${song.title.slice(0, 240)}](${songUrl})\n\n` +
    `🔢 **Kuyruk Sırası:** \`#${queuePosition}\`\n` +
    `⏱️ **Süre:** \`${song.duration}\`\n` +
    `👤 **Ekleyen:** ${requestedByText}\n` +
    `📻 **Kaynak:** ${sourceText}`;

  if (isValidUrl(song.thumbnail)) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));
  }

  return container;
}

/**
 * Builds Queue Container (Components V2)
 */
function buildQueueContainer(queue) {
  const container = new ContainerBuilder().setAccentColor(0x5865f2);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("## 📜 Aegis Music — Şarkı Kuyruğu")
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  if (queue && queue.currentSong) {
    const cs = queue.currentSong;
    const songUrl = isValidUrl(cs.webpageUrl) ? cs.webpageUrl : "https://betterwithaegis.com";
    const filterInfo = queue.activeFilter && queue.activeFilter !== "none"
      ? ` | Filtre: \`${AUDIO_FILTERS[queue.activeFilter]?.name || queue.activeFilter}\``
      : "";
    const nowText =
      `**▶️ Şu An Çalıyor:**\n` +
      `[${cs.title.slice(0, 200)}](${songUrl})\n` +
      `⏱️ Süre: \`${cs.duration}\` | İsteyen: ${cs.requestedBy || "Bilinmiyor"}${filterInfo}`;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(nowText));
    container.addSeparatorComponents(new SeparatorBuilder());
  }

  if (queue && queue.songs && queue.songs.length > 0) {
    let queueList = `**📋 Sıradaki Şarkılar (${queue.songs.length}):**\n`;
    queue.songs.slice(0, 10).forEach((s, idx) => {
      const sUrl = isValidUrl(s.webpageUrl) ? s.webpageUrl : "https://betterwithaegis.com";
      queueList += `\`${idx + 1}.\` [${s.title.slice(0, 150)}](${sUrl}) | \`${s.duration}\`\n`;
    });
    if (queue.songs.length > 10) {
      queueList += `\n*...ve ${queue.songs.length - 10} şarkı daha*`;
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(queueList));
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("*Sırada bekleyen başka şarkı bulunmuyor.*")
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(createControlButtons(queue ? queue.isPaused : false));

  return container;
}

/**
 * Builds Lyrics Container (Components V2)
 */
function buildLyricsContainer(title, artist, lyrics, source = "LRCLIB") {
  const container = new ContainerBuilder().setAccentColor(0x9b59b6);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 📜 ${title.slice(0, 150)}\n` +
      `👤 **Sanatçı:** ${artist.slice(0, 100)} | 🌐 Kaynak: \`${source}\``
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  let displayLyrics = lyrics;
  if (displayLyrics.length > 3500) {
    displayLyrics = displayLyrics.slice(0, 3450) + "\n\n...*(Sözler uzun olduğu için kısaltıldı)*";
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(displayLyrics)
  );

  return container;
}

/**
 * Creates or retrieves the music queue for a guild
 */
function getOrCreateQueue(guild, voiceChannel, textChannel) {
  let queue = queues.get(guild.id);
  if (queue && queue.connection && queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
    queue.textChannel = textChannel || queue.textChannel;
    return queue;
  }

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play,
      maxMissedFrames: Math.round(10000 / 20),
    },
  });

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  const subscription = connection.subscribe(player);

  queue = {
    guildId: guild.id,
    voiceChannel,
    textChannel,
    connection,
    player,
    subscription,
    songs: [],
    currentSong: null,
    isPlaying: false,
    isPaused: false,
    activeProcess: null,
    disconnectTimer: null,
    volumePercent: 100,
    activeFilter: "none",
    loopMode: "none",
  };

  connection.on("stateChange", (oldState, newState) => {
    console.log(`[Music Connection ${guild.id}] ${oldState.status} -> ${newState.status}`);
  });

  player.on("stateChange", (oldState, newState) => {
    console.log(`[Music Player ${guild.id}] ${oldState.status} -> ${newState.status}`);
  });

  player.on(AudioPlayerStatus.Idle, () => {
    console.log(`[Music Player ${guild.id}] AudioPlayerStatus: Idle`);
    const previous = queue.currentSong;
    queue.isPlaying = false;
    queue.currentSong = null;
    if (queue.activeProcess) {
      try {
        queue.activeProcess.kill("SIGKILL");
      } catch (_) {}
      queue.activeProcess = null;
    }

    if (previous) {
      if (queue.loopMode === "song") {
        queue.songs.unshift(previous);
      } else if (queue.loopMode === "queue") {
        queue.songs.push(previous);
      }
    }

    playNext(guild.id);
  });

  player.on("error", (err) => {
    console.error(`[Music Player error in guild ${guild.id}]:`, err.message);
    if (queue.textChannel) {
      const errContainer = buildMessageContainer(
        "⚠️ Oynatma Hatası",
        `Çalma sırasında bir hata oluştu: \`${err.message}\``,
        0xef4444
      );
      queue.textChannel.send({ components: [errContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
    playNext(guild.id);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch (_) {
      cleanup(guild.id);
    }
  });

  queues.set(guild.id, queue);
  return queue;
}

/**
 * Parses duration string (e.g. "3:45", "1:12:30") to seconds
 */
function parseDurationSec(str) {
  if (!str || typeof str !== "string") return 0;
  if (str.includes("Canlı") || str.includes("Radyo") || str.includes("Dosya") || str.includes("Bilinmiyor")) return 0;
  const parts = str.split(":").map((p) => parseInt(p.trim(), 10));
  if (parts.some((n) => isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Computes current playback elapsed seconds accurately
 */
function getElapsedSeconds(queue) {
  if (!queue || !queue.isPlaying || !queue.playbackStartedAt) return 0;
  let elapsedMs = 0;
  if (queue.player?.state?.resource?.playbackDuration) {
    elapsedMs = queue.player.state.resource.playbackDuration;
  } else {
    const end = queue.isPaused && queue.pausedAt ? queue.pausedAt : Date.now();
    elapsedMs = Math.max(0, end - queue.playbackStartedAt - (queue.totalPausedDuration || 0));
  }
  return Math.max(0, Math.floor(elapsedMs / 1000) + (queue.seekOffsetSec || 0));
}

/**
 * Starts streaming a song with optional seek offset
 */
async function startSongStream(queue, song, seekSeconds = 0) {
  if (queue.activeProcess) {
    try { queue.activeProcess.kill(); } catch (_) {}
    queue.activeProcess = null;
  }

  const audioSource = await getStreamUrl(song);
  const isLocalFile = fs.existsSync(audioSource);
  const filterConfig = AUDIO_FILTERS[queue.activeFilter];
  const afArgs = filterConfig && filterConfig.filter ? ["-af", filterConfig.filter] : [];
  const seekArgs = seekSeconds > 0 ? ["-ss", String(seekSeconds)] : [];

  const ffmpegArgs = isLocalFile
    ? [
        ...seekArgs,
        "-i", audioSource,
        "-loglevel", "error",
        "-vn",
        ...afArgs,
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "2",
        "pipe:1",
      ]
    : [
        "-reconnect", "1",
        "-reconnect_on_network_error", "1",
        "-reconnect_on_http_error", "4xx,5xx",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-tcp_nodelay", "1",
        "-probesize", "32768",
        "-analyzeduration", "0",
        ...seekArgs,
        "-i", audioSource,
        "-loglevel", "error",
        "-vn",
        ...afArgs,
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "2",
        "pipe:1",
      ];

  console.log(`[Music ${queue.guildId}] Streaming (${seekSeconds > 0 ? `seek: ${seekSeconds}s, ` : ""}${isLocalFile ? "LOCAL DISK CACHE" : "REMOTE STREAM"}): ${audioSource}`);
  const ffmpegProcess = spawn("ffmpeg", ffmpegArgs);

  ffmpegProcess.on("error", (e) => {
    console.error("[Music ffmpeg process error]:", e.message);
  });

  const bufferStream = new BufferedAudioStream();
  ffmpegProcess.stdout.pipe(bufferStream);

  const resource = createAudioResource(bufferStream, {
    inputType: StreamType.Raw,
    inlineVolume: true,
  });

  if (resource.volume) {
    const vol = (typeof queue.volumePercent === "number" ? queue.volumePercent : 100) / 100;
    resource.volume.setVolume(vol);
  }

  queue.activeProcess = {
    kill: () => {
      if (bufferStream) {
        try { bufferStream.destroy(); } catch (_) {}
      }
      if (ffmpegProcess) {
        try { ffmpegProcess.kill("SIGKILL"); } catch (_) {}
      }
    },
  };

  queue.seekOffsetSec = seekSeconds || 0;
  queue.playbackStartedAt = Date.now();
  queue.pausedAt = null;
  queue.totalPausedDuration = 0;
  queue.isPlaying = true;
  queue.isPaused = false;

  queue.player.play(resource);
}

/**
 * Starts playing next song in queue
 */
async function playNext(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.disconnectTimer) {
    clearTimeout(queue.disconnectTimer);
    queue.disconnectTimer = null;
  }

  if (queue.songs.length === 0) {
    if (queue.textChannel) {
      const endContainer = buildMessageContainer(
        "📭 Kuyruk Tamamlandı",
        "Kuyruktaki tüm şarkılar bitti. 3 dakika içinde yeni şarkı gelmezse kanaldan ayrılacağım.",
        0xffb92e
      );
      queue.textChannel.send({ components: [endContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    queue.disconnectTimer = setTimeout(() => {
      cleanup(guildId);
    }, 3 * 60 * 1000);
    return;
  }

  // Ensure voice connection is Ready before streaming
  try {
    if (queue.connection.state.status !== VoiceConnectionStatus.Ready) {
      console.log(`[Music ${guildId}] Waiting for voice connection to reach Ready... Current: ${queue.connection.state.status}`);
      await entersState(queue.connection, VoiceConnectionStatus.Ready, 20_000);
      console.log(`[Music ${guildId}] Voice connection is Ready!`);
    }
  } catch (err) {
    console.error(`[Music ${guildId}] Voice connection failed to reach Ready:`, err.message);
    const errContainer = buildMessageContainer(
      "❌ Ses Bağlantı Hatası",
      `Ses kanalına bağlanılamadı: \`${err.message}\`\nBotun kanala katılma ve konuşma izinlerini kontrol edin.`,
      0xef4444
    );
    if (queue.initialInteraction) {
      queue.initialInteraction.editReply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      queue.initialInteraction = null;
    } else if (queue.textChannel) {
      queue.textChannel.send({ components: [errContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
    cleanup(guildId);
    return;
  }

  const song = queue.songs.shift();
  queue.currentSong = song;

  try {
    await startSongStream(queue, song, 0);
    console.log(`[Music ${guildId}] Playing "${song.title}" (Filter: ${queue.activeFilter})`);

    // Send Now Playing Components V2 container
    const container = buildNowPlayingContainer(song, false, queue.activeFilter, queue);
    if (queue.initialInteraction) {
      queue.initialInteraction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 })
        .catch(() => {
          if (queue.textChannel) {
            queue.textChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
          }
        });
      queue.initialInteraction = null;
    } else if (queue.textChannel) {
      queue.textChannel
        .send({ components: [container], flags: MessageFlags.IsComponentsV2 })
        .catch(() => {});
    }
  } catch (err) {
    console.error(`[Music] Failed to stream song in guild ${guildId}:`, err);
    const errContainer = buildMessageContainer(
      "❌ Başlatılamadı",
      `Şarkı başlatılamadı: \`${err.message}\``,
      0xef4444
    );
    if (queue.initialInteraction) {
      queue.initialInteraction.editReply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      queue.initialInteraction = null;
    } else if (queue.textChannel) {
      queue.textChannel.send({ components: [errContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
    playNext(guildId);
  }
}

/**
 * Clean up guild queue and connection
 */
function cleanup(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.disconnectTimer) {
    clearTimeout(queue.disconnectTimer);
    queue.disconnectTimer = null;
  }

  if (queue.activeProcess) {
    try { queue.activeProcess.kill(); } catch (_) {}
  }

  try {
    queue.player.stop(true);
  } catch (_) {}

  try {
    queue.connection.destroy();
  } catch (_) {}

  queues.delete(guildId);
}

/** Uzaktan kumanda: sunucu ayarı guild.musicRemote (varsayılan açık). */
function isRemoteOn(guildId) {
  try { return require("./database").getGuild(guildId).musicRemote !== false; } catch (_) { return true; }
}

/** Üye müziği yönetebilir mi? Ses kanalındaysa evet; değilse çalan bir oturum ve uzaktan kumanda açık olmalı. */
function canControl(guild, member) {
  if (member?.voice?.channel) return true;
  return !!queues.get(guild.id) && isRemoteOn(guild.id);
}

function voiceRequiredContainer(guildId, playing) {
  const tr = getGuildLanguage(guildId) !== "en";
  if (tr) return buildMessageContainer("❌ Ses Kanalı Gerekli", playing ? "Müziği yönetmek için bir ses kanalında olmalısın. (Yöneticiler `/music` ile **uzaktan kumandayı** açabilir.)" : "Müzik çalmak için önce bir **ses kanalına** katılmalısın!", 0xef4444);
  return buildMessageContainer("❌ Voice Channel Required", playing ? "Join a voice channel to control the music. (Admins can turn on the **remote** with `/music`.)" : "Join a **voice channel** first to play music!", 0xef4444);
}

module.exports = {
  isRemoteOn,
  canControl,
  hasSession(guildId) { return !!queues.get(guildId); },
  setRemote(guildId, on) { require("./database").updateGuild(guildId, { musicRemote: !!on }); return !!on; },
  searchMusic,
  searchTracks,
  resolveSpotify,
  getLyrics,
  buildLyricsContainer,
  getOrCreateQueue,
  createControlButtons,
  buildMessageContainer,
  buildNowPlayingContainer,
  buildAddedToQueueContainer,
  buildQueueContainer,
  RADIO_STATIONS,
  AUDIO_FILTERS,

  getQueueData(guildId) {
    const queue = queues.get(guildId);
    const filterList = Object.entries(AUDIO_FILTERS).map(([k, v]) => ({
      key: k,
      name: v.name,
      emoji: v.emoji,
      description: v.description,
    }));

    if (!queue) {
      return {
        isPlaying: false,
        isPaused: false,
        currentSong: null,
        songs: [],
        voiceChannel: null,
        volume: 100,
        activeFilter: "none",
        availableFilters: filterList,
        loopMode: "none",
        isShuffle: false,
        progressSec: 0,
        durationSec: 0,
      };
    }

    const progressSec = getElapsedSeconds(queue);
    const durationSec = queue.currentSong?.durationSec || parseDurationSec(queue.currentSong?.duration) || 0;

    return {
      isPlaying: queue.isPlaying,
      isPaused: queue.isPaused,
      currentSong: queue.currentSong,
      songs: queue.songs,
      voiceChannel: queue.voiceChannel
        ? { id: queue.voiceChannel.id, name: queue.voiceChannel.name }
        : null,
      volume: typeof queue.volumePercent === "number" ? queue.volumePercent : 100,
      activeFilter: queue.activeFilter || "none",
      availableFilters: filterList,
      loopMode: queue.loopMode || "none",
      isShuffle: !!queue.isShuffle,
      progressSec,
      durationSec,
      playbackStartedAt: queue.playbackStartedAt || null,
      seekOffsetSec: queue.seekOffsetSec || 0,
    };
  },

  removeSong(guildId, index) {
    const queue = queues.get(guildId);
    if (!queue || !queue.songs || index < 0 || index >= queue.songs.length) {
      return { ok: false, message: "Geçersiz şarkı sırası" };
    }
    const removed = queue.songs.splice(index, 1)[0];
    return { ok: true, removed };
  },

  setVolume(guildId, volumePercent) {
    const queue = queues.get(guildId);
    if (!queue) return { ok: false, message: "Şu an aktif müzik yok" };
    const volPercent = Math.max(0, Math.min(200, volumePercent));
    queue.volumePercent = volPercent;
    const vol = volPercent / 100;
    if (queue.player?.state?.resource?.volume) {
      queue.player.state.resource.volume.setVolume(vol);
    }
    return { ok: true, volume: volPercent };
  },

  async setFilter(guildId, filterKey) {
    const queue = queues.get(guildId);
    if (!queue) {
      return {
        ok: false,
        message: "Şu an aktif bir müzik oturumu bulunmuyor.",
        container: buildMessageContainer("🎛️ Ses Filtresi", "Şu an aktif bir müzik oturumu bulunmuyor.", 0x999999),
      };
    }

    const key = (filterKey || "").toLowerCase();
    const filterConfig = AUDIO_FILTERS[key] || (key === "kapat" || key === "clear" ? AUDIO_FILTERS.none : null);

    if (!filterConfig) {
      const list = Object.entries(AUDIO_FILTERS)
        .map(([k, v]) => `• \`${k}\`: ${v.emoji} **${v.name}**`)
        .join("\n");
      return {
        ok: false,
        message: `Geçersiz filtre! Kullanabileceğin filtreler:\n${list}`,
        container: buildMessageContainer("❌ Geçersiz Filtre", `Kullanabileceğin filtreler:\n\n${list}`, 0xef4444),
      };
    }

    queue.activeFilter = key === "kapat" || key === "clear" ? "none" : key;

    // If currently playing, restart smoothly with new filter at current position
    if (queue.isPlaying && queue.currentSong) {
      const currentPos = getElapsedSeconds(queue);
      try {
        await startSongStream(queue, queue.currentSong, currentPos);
      } catch (_) {}
    }

    return {
      ok: true,
      filter: queue.activeFilter,
      message: `${filterConfig.name} filtresi uygulandı!`,
      container: buildMessageContainer(
        "🎛️ Ses Filtresi Güncellendi",
        `Filtre: ${filterConfig.emoji} **${filterConfig.name}** uygulandı!\n` +
        `💡 *${filterConfig.description}*`,
        0x5865f2
      ),
    };
  },

  async playFromWeb(guild, queryOrStation, textChannel, requestedByUser = "Web Dashboard", playNow = false) {
    let queue = queues.get(guild.id);
    let voiceChannel = queue?.voiceChannel;

    if (!voiceChannel) {
      const channels = guild.channels.cache.filter((c) => c.isVoiceBased());
      const activeVc = channels.find((c) => c.members.filter((m) => !m.user.bot).size > 0);
      voiceChannel = activeVc || channels.first();
    }

    if (!voiceChannel) {
      return { ok: false, message: "Sunucuda uygun bir ses kanalı bulunamadı!" };
    }

    const permissions = voiceChannel.permissionsFor(guild.members.me);
    if (!permissions.has(["Connect", "Speak"])) {
      return { ok: false, message: "Botun ses kanalına bağlanma veya konuşma yetkisi yok!" };
    }

    // Spotify resolution from web
    if (typeof queryOrStation === "string" && queryOrStation.includes("open.spotify.com")) {
      const spotify = await resolveSpotify(queryOrStation);
      if (spotify) {
        if (spotify.type === "track") {
          queryOrStation = spotify.query;
        } else if (spotify.type === "playlist" || spotify.type === "album") {
          const tracks = spotify.tracks.slice(0, 25);
          queue = getOrCreateQueue(guild, voiceChannel, textChannel || guild.channels.cache.filter((c) => c.isTextBased()).first());
          const first = await searchMusic(tracks[0].query);
          if (first) {
            first.requestedBy = requestedByUser;
            first.isSpotify = true;
            queue.songs.push(first);
          }
          if (!queue.isPlaying) {
            playNext(guild.id);
          }
          (async () => {
            for (let i = 1; i < tracks.length; i++) {
              if (!queues.has(guild.id)) break;
              try {
                const s = await searchMusic(tracks[i].query);
                if (s) {
                  s.requestedBy = requestedByUser;
                  s.isSpotify = true;
                  queue.songs.push(s);
                }
              } catch (_) {}
            }
          })();
          return { ok: true, message: `🟢 Spotify: ${spotify.name} (${tracks.length} şarkı) eklendi!` };
        }
      }
    }

    let songData = null;

    if (RADIO_STATIONS[queryOrStation]) {
      const station = RADIO_STATIONS[queryOrStation];
      songData = {
        title: `📻 ${station.name}`,
        duration: station.duration,
        thumbnail: station.thumbnail,
        url: station.url,
        webpageUrl: station.url,
        isDirect: true,
        requestedBy: requestedByUser,
      };
    } else {
      songData = await searchMusic(queryOrStation);
      if (songData) {
        songData.requestedBy = requestedByUser;
      }
    }

    if (!songData) {
      return { ok: false, message: "Şarkı bulunamadı veya oynatılamadı!" };
    }

    queue = getOrCreateQueue(
      guild,
      voiceChannel,
      textChannel || guild.channels.cache.filter((c) => c.isTextBased()).first()
    );

    if (queue.isPlaying) {
      if (playNow) {
        queue.songs.unshift(songData);
        queue.player.stop();
        return { ok: true, message: `"${songData.title}" hemen oynatılıyor...`, song: songData };
      }
      queue.songs.push(songData);
      return { ok: true, message: `"${songData.title}" kuyruğa eklendi (#${queue.songs.length})`, song: songData };
    }

    queue.songs.push(songData);
    playNext(guild.id);
    return { ok: true, message: `"${songData.title}" çalınmaya başlandı`, song: songData };
  },

  /**
   * Main play entry point for interactions or messages
   */
  async play(interactionOrMessage, queryOrAttachment) {
    const isInteraction = !!interactionOrMessage.isCommand || !!interactionOrMessage.isChatInputCommand;
    const guild = interactionOrMessage.guild;
    const member = interactionOrMessage.member;
    const channel = interactionOrMessage.channel;

    // Ses kanalında değilse: bot zaten çalıyorsa ve uzaktan kumanda açıksa şarkı mevcut oturuma eklenir
    const activeQueue = queues.get(guild.id);
    const remoteVc = !member.voice?.channel && activeQueue?.voiceChannel && isRemoteOn(guild.id) ? activeQueue.voiceChannel : null;
    if (!member.voice?.channel && !remoteVc) {
      const container = voiceRequiredContainer(guild.id, false);
      return isInteraction
        ? interactionOrMessage.reply({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true })
        : interactionOrMessage.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const voiceChannel = member.voice?.channel || remoteVc;
    const botMember = guild.members.me;
    if (botMember && (botMember.permissions.has(PermissionFlagsBits.ManageChannels) || botMember.permissions.has(PermissionFlagsBits.Administrator))) {
      try {
        const currentPerms = voiceChannel.permissionsFor(botMember);
        if (!currentPerms || !currentPerms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
          await voiceChannel.permissionOverwrites.edit(botMember, {
            ViewChannel: true,
            Connect: true,
            Speak: true,
          });
        }
      } catch (_) {}
    }

    const permissions = voiceChannel.permissionsFor(guild.members.me);
    if (!permissions || !permissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      const container = buildMessageContainer(
        "❌ Yetki Yetersiz",
        "Bu ses kanalına bağlanmak veya konuşmak için yeterli yetkim yok! (Kanalı görüntüleme, bağlanma veya konuşma izni eksik)",
        0xef4444
      );
      return isInteraction
        ? interactionOrMessage.reply({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true })
        : interactionOrMessage.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // Deferred reply if interaction
    if (isInteraction) {
      await interactionOrMessage.deferReply({ flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else {
      await channel.sendTyping().catch(() => {});
    }

    let songData = null;

    // Check if attachment
    if (typeof queryOrAttachment === "object" && queryOrAttachment && queryOrAttachment.url) {
      songData = {
        title: queryOrAttachment.name || "Yüklenen MP3 Dosyası",
        duration: "MP3 Dosyası",
        thumbnail: "https://betterwithaegis.com/images/icon-512.png",
        url: queryOrAttachment.url,
        webpageUrl: queryOrAttachment.url,
        isFile: true,
        isDirect: true,
        requestedBy: member.user,
      };
    } else if (typeof queryOrAttachment === "string" && queryOrAttachment.trim()) {
      const rawQuery = queryOrAttachment.trim();

      // Check for Spotify URL
      if (rawQuery.includes("open.spotify.com")) {
        const spotify = await resolveSpotify(rawQuery);
        if (spotify) {
          if (spotify.type === "track") {
            songData = await searchMusic(spotify.query);
            if (songData) {
              songData.requestedBy = member.user;
              songData.isSpotify = true;
              if (spotify.thumbnail) songData.thumbnail = spotify.thumbnail;
            }
          } else if (spotify.type === "playlist" || spotify.type === "album") {
            const tracks = spotify.tracks.slice(0, 30);
            if (tracks.length === 0) {
              const errC = buildMessageContainer("❌ Spotify Listesi Boş", "Çalma listesinde parça bulunamadı.", 0xef4444);
              return isInteraction
                ? interactionOrMessage.editReply({ components: [errC], flags: MessageFlags.IsComponentsV2 })
                : channel.send({ components: [errC], flags: MessageFlags.IsComponentsV2 });
            }

            const queue = getOrCreateQueue(guild, voiceChannel, channel);
    if (isInteraction) {
      queue.initialInteraction = interactionOrMessage;
    }
            const first = await searchMusic(tracks[0].query);
            if (first) {
              first.requestedBy = member.user;
              first.isSpotify = true;
              queue.songs.push(first);
            }

            const spotifyContainer = new ContainerBuilder().setAccentColor(0x1db954);
            spotifyContainer.addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 🟢 Spotify ${spotify.type === "album" ? "Albümü" : "Çalma Listesi"}\n\n` +
                `📂 **${spotify.name}** listesinden **${tracks.length}** şarkı sıraya alınıyor...\n` +
                `▶️ İlk şarkı: **${first?.title || tracks[0].title}**\n` +
                `👤 Ekleyen: ${member.user}`
              )
            );

            if (isInteraction) {
              await interactionOrMessage.editReply({ components: [spotifyContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } else {
              await channel.send({ components: [spotifyContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }

            if (!queue.isPlaying) {
              playNext(guild.id);
            }

            // Queue remaining tracks in background
            (async () => {
              for (let i = 1; i < tracks.length; i++) {
                if (!queues.has(guild.id)) break;
                try {
                  const item = await searchMusic(tracks[i].query);
                  if (item) {
                    item.requestedBy = member.user;
                    item.isSpotify = true;
                    queue.songs.push(item);
                  }
                } catch (_) {}
              }
            })();

            return;
          }
        }
      }

      if (!songData) {
        songData = await searchMusic(rawQuery);
        if (songData) {
          songData.requestedBy = member.user;
        }
      }
    }

    if (!songData) {
      const container = buildMessageContainer(
        "❌ Şarkı Bulunamadı",
        "Şarkı bulunamadı veya oynatılamadı. Lütfen başka bir şarkı adı, Spotify bağlantısı ya da geçerli bir MP3 dosyası dene!",
        0xef4444
      );
      return isInteraction
        ? interactionOrMessage.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 })
        : channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const queue = getOrCreateQueue(guild, voiceChannel, channel);

    if (queue.isPlaying) {
      queue.songs.push(songData);
      const container = buildAddedToQueueContainer(songData, queue.songs.length);

      return isInteraction
        ? interactionOrMessage.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 })
        : channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    queue.songs.push(songData);

    const startContainer = buildMessageContainer(
      "🔍 Şarkı Başlatılıyor",
      `**${songData.title}** bulundu ve ses kanalına bağlanılıyor...`,
      0x5865f2
    );

    if (isInteraction) {
      await interactionOrMessage.editReply({ components: [startContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    playNext(guild.id);
  },

  /**
   * Stop command
   */
  stop(guildId) {
    const queue = queues.get(guildId);
    if (!queue) {
      return {
        ok: false,
        message: "Şu an çalan bir müzik yok.",
        container: buildMessageContainer("⏹️ Müzik Durduruldu", "Şu an çalan bir müzik yok.", 0x999999),
      };
    }
    cleanup(guildId);
    return {
      ok: true,
      message: "Müzik durduruldu ve ses kanalından ayrıldım.",
      container: buildMessageContainer("⏹️ Müzik Durduruldu", "Müzik durduruldu ve ses kanalından ayrıldım.", 0xef4444),
    };
  },

  /**
   * Skip command
   */
  skip(guildId) {
    const queue = queues.get(guildId);
    if (!queue || !queue.isPlaying) {
      return {
        ok: false,
        message: "Şu an geçilecek bir müzik yok.",
        container: buildMessageContainer("⏭️ Şarkı Geç", "Şu an geçilecek bir müzik yok.", 0x999999),
      };
    }
    const current = queue.currentSong?.title || "Şarkı";
    queue.player.stop(); // triggers Idle which runs playNext()
    return {
      ok: true,
      message: `**${current}** geçildi!`,
      container: buildMessageContainer("⏭️ Şarkı Geçildi", `**${current}** geçildi!`, 0x5865f2),
    };
  },

  /**
   * Pause command
   */
  pause(guildId) {
    const queue = queues.get(guildId);
    if (!queue || !queue.isPlaying) {
      return {
        ok: false,
        message: "Şu an çalan bir müzik yok.",
        container: buildMessageContainer("⏸️ Duraklat", "Şu an çalan bir müzik yok.", 0x999999),
      };
    }
    if (queue.isPaused) {
      return {
        ok: false,
        message: "Müzik zaten duraklatılmış durumda.",
        container: buildMessageContainer("⏸️ Duraklat", "Müzik zaten duraklatılmış durumda.", 0xffa500),
      };
    }
    queue.player.pause();
    queue.isPaused = true;
    queue.pausedAt = Date.now();
    return {
      ok: true,
      message: "Müzik duraklatıldı.",
      container: buildMessageContainer("⏸️ Müzik Duraklatıldı", "Müzik duraklatıldı.", 0xffa500),
    };
  },

  /**
   * Resume command
   */
  resume(guildId) {
    const queue = queues.get(guildId);
    if (!queue || !queue.isPlaying) {
      return {
        ok: false,
        message: "Şu an çalan bir müzik yok.",
        container: buildMessageContainer("▶️ Devam Et", "Şu an çalan bir müzik yok.", 0x999999),
      };
    }
    if (!queue.isPaused) {
      return {
        ok: false,
        message: "Müzik zaten çalıyor.",
        container: buildMessageContainer("▶️ Devam Et", "Müzik zaten çalıyor.", 0x57f287),
      };
    }
    queue.player.unpause();
    queue.isPaused = false;
    if (queue.pausedAt) {
      queue.totalPausedDuration = (queue.totalPausedDuration || 0) + (Date.now() - queue.pausedAt);
      queue.pausedAt = null;
    }
    return {
      ok: true,
      message: "Müzik devam ediyor.",
      container: buildMessageContainer("▶️ Müzik Devam Ediyor", "Müzik devam ediyor.", 0x57f287),
    };
  },

  /**
   * Seek command (scrub to timestamp in seconds)
   */
  async seek(guildId, positionSec) {
    const queue = queues.get(guildId);
    if (!queue || !queue.isPlaying || !queue.currentSong) {
      return { ok: false, message: "Şu an çalan bir müzik yok." };
    }
    const pos = Math.max(0, Math.floor(Number(positionSec) || 0));
    try {
      await startSongStream(queue, queue.currentSong, pos);
      return { ok: true, progressSec: pos };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },

  /**
   * Replay current song from beginning
   */
  async replay(guildId) {
    const queue = queues.get(guildId);
    if (!queue || !queue.isPlaying || !queue.currentSong) {
      return { ok: false, message: "Şu an çalan bir müzik yok." };
    }
    return this.seek(guildId, 0);
  },

  /**
   * Set or toggle loop mode ('none' | 'song' | 'queue')
   */
  setLoop(guildId, mode) {
    const queue = queues.get(guildId);
    if (!queue) return { ok: false, message: "Şu an aktif bir müzik oturumu yok." };
    if (mode && ["none", "song", "queue"].includes(mode)) {
      queue.loopMode = mode;
    } else {
      if (!queue.loopMode || queue.loopMode === "none") queue.loopMode = "song";
      else if (queue.loopMode === "song") queue.loopMode = "queue";
      else queue.loopMode = "none";
    }
    return { ok: true, loopMode: queue.loopMode };
  },

  /**
   * Shuffle remaining queue songs
   */
  shuffleQueue(guildId) {
    const queue = queues.get(guildId);
    if (!queue || !queue.songs || queue.songs.length <= 1) {
      return { ok: false, message: "Kuyrukta karıştırılacak en az 2 şarkı olmalıdır." };
    }
    for (let i = queue.songs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
    }
    queue.isShuffle = !queue.isShuffle;
    return { ok: true, isShuffle: queue.isShuffle, songs: queue.songs };
  },

  /**
   * Get queue info
   */
  getQueue(guildId) {
    const queue = queues.get(guildId);
    if (!queue || (!queue.currentSong && queue.songs.length === 0)) {
      return {
        ok: false,
        message: "Kuyrukta şarkı bulunmuyor.",
        container: buildMessageContainer("📜 Şarkı Kuyruğu", "Kuyrukta herhangi bir şarkı bulunmuyor.", 0x999999),
      };
    }

    const container = buildQueueContainer(queue);
    return { ok: true, container };
  },

  /**
   * Show lyrics command handler
   */
  async showLyrics(interactionOrMessage, optionalQuery) {
    const isInteraction = !!interactionOrMessage.isCommand || !!interactionOrMessage.isChatInputCommand;
    const guild = interactionOrMessage.guild;

    if (isInteraction) {
      await interactionOrMessage.deferReply({ flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else {
      await interactionOrMessage.channel.sendTyping().catch(() => {});
    }

    let searchQuery = optionalQuery;
    if (!searchQuery) {
      const queue = queues.get(guild.id);
      if (queue && queue.currentSong && queue.currentSong.title) {
        searchQuery = queue.currentSong.title;
      }
    }

    if (!searchQuery) {
      const errContainer = buildMessageContainer(
        "❌ Şarkı Belirtilmedi",
        "Lütfen bir şarkı adı girin veya ses kanalında bir şarkı çalarken bu komutu kullanın!\nÖrnek: `/sozler sarki: Duman Bal` ya da `a.sozler Tarkan Şımarık`",
        0xef4444
      );
      return isInteraction
        ? interactionOrMessage.editReply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 })
        : interactionOrMessage.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
    }

    const lyricsData = await getLyrics(searchQuery);

    if (!lyricsData || !lyricsData.lyrics) {
      const notFoundContainer = buildMessageContainer(
        "🔍 Şarkı Sözü Bulunamadı",
        `**${searchQuery}** için şarkı sözü bulunamadı.\nLütfen şarkı ve sanatçı adını daha belirgin yazarak tekrar dene!`,
        0xffa500
      );
      return isInteraction
        ? interactionOrMessage.editReply({ components: [notFoundContainer], flags: MessageFlags.IsComponentsV2 })
        : interactionOrMessage.reply({ components: [notFoundContainer], flags: MessageFlags.IsComponentsV2 });
    }

    const container = buildLyricsContainer(lyricsData.title, lyricsData.artist, lyricsData.lyrics, lyricsData.source);

    return isInteraction
      ? interactionOrMessage.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 })
      : interactionOrMessage.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },

  /**
   * Button interaction handler
   */
  async handleButton(interaction) {
    const { customId, guild, member } = interaction;
    if (!customId.startsWith("music_")) return false;

    if (!canControl(guild, member)) {
      const errContainer = voiceRequiredContainer(guild.id, true);
      await interaction.reply({
        components: [errContainer],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }

    const queue = queues.get(guild.id);
    if (!queue) {
      const errContainer = buildMessageContainer(
        "❌ Oturum Bulunamadı",
        "Aktif bir müzik oturumu bulunamadı.",
        0xef4444
      );
      await interaction.reply({
        components: [errContainer],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }

    // 1. Duraklat / Devam Et
    if (customId === "music_toggle_pause") {
      if (queue.isPaused) {
        queue.player.unpause();
        queue.isPaused = false;
        if (queue.currentSong) {
          const container = buildNowPlayingContainer(queue.currentSong, false, queue.activeFilter, queue);
          await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
        await interaction.followUp({
          components: [buildMessageContainer("▶️ Müzik Devam Ediyor", "Müzik çalmaya devam ediyor.", 0x57f287)],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        }).catch(() => {});
      } else {
        queue.player.pause();
        queue.isPaused = true;
        if (queue.currentSong) {
          const container = buildNowPlayingContainer(queue.currentSong, true, queue.activeFilter, queue);
          await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
        await interaction.followUp({
          components: [buildMessageContainer("⏸️ Müzik Duraklatıldı", "Müzik duraklatıldı.", 0xffa500)],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        }).catch(() => {});
      }
      return true;
    }

    // 2. Şarkıyı Başa Sar
    if (customId === "music_replay") {
      if (!queue.currentSong) {
        await interaction.reply({
          components: [buildMessageContainer("⚠️ Hata", "Şu an çalan bir şarkı yok.", 0xffa500)],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        }).catch(() => {});
        return true;
      }
      const cs = queue.currentSong;
      queue.songs.unshift(cs);
      queue.currentSong = null;
      queue.player.stop();
      await interaction.reply({
        components: [buildMessageContainer("⏮️ Başa Sarıldı", `**${cs.title}** baştan başlatılıyor...`, 0x5865f2)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }

    // 3. Şarkı Geç
    if (customId === "music_skip") {
      const res = this.skip(guild.id);
      await interaction.reply({
        components: [res.container],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }

    // 4. Müzik Durdur
    if (customId === "music_stop") {
      const res = this.stop(guild.id);
      await interaction.reply({
        components: [res.container],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
      return true;
    }

    // 5. Döngü Modu (Kapalı -> Şarkı -> Kuyruk -> Kapalı)
    if (customId === "music_loop") {
      if (!queue.loopMode || queue.loopMode === "none") {
        queue.loopMode = "song";
      } else if (queue.loopMode === "song") {
        queue.loopMode = "queue";
      } else {
        queue.loopMode = "none";
      }

      if (queue.currentSong) {
        const container = buildNowPlayingContainer(queue.currentSong, queue.isPaused, queue.activeFilter, queue);
        await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      const loopLabel = queue.loopMode === "song" 
        ? "🔂 **Tek Şarkı Döngüsü** açıldı (çalan şarkı sürekli tekrarlanacak)." 
        : queue.loopMode === "queue"
        ? "🔁 **Tüm Kuyruk Döngüsü** açıldı (biten şarkılar kuyruğun sonuna eklenecek)."
        : "🔄 **Döngü Kapatıldı**.";

      await interaction.followUp({
        components: [buildMessageContainer("🔁 Döngü Durumu Güncellendi", loopLabel, 0x57f287)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }

    // 6. Ses Artır (+10%)
    if (customId === "music_vol_up") {
      const current = typeof queue.volumePercent === "number" ? queue.volumePercent : 100;
      const next = Math.min(200, current + 10);
      this.setVolume(guild.id, next);

      if (queue.currentSong) {
        const container = buildNowPlayingContainer(queue.currentSong, queue.isPaused, queue.activeFilter, queue);
        await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      await interaction.followUp({
        components: [buildMessageContainer("🔊 Ses Seviyesi", `Ses seviyesi **%${next}** yapıldı.`, 0x5865f2)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }

    // 7. Ses Azalt (-10%)
    if (customId === "music_vol_down") {
      const current = typeof queue.volumePercent === "number" ? queue.volumePercent : 100;
      const next = Math.max(10, current - 10);
      this.setVolume(guild.id, next);

      if (queue.currentSong) {
        const container = buildNowPlayingContainer(queue.currentSong, queue.isPaused, queue.activeFilter, queue);
        await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      await interaction.followUp({
        components: [buildMessageContainer("🔉 Ses Seviyesi", `Ses seviyesi **%${next}** yapıldı.`, 0x5865f2)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }

    // 8. Karıştır (Shuffle)
    if (customId === "music_shuffle") {
      if (!queue.songs || queue.songs.length <= 1) {
        await interaction.reply({
          components: [buildMessageContainer("🔀 Karıştır", "Kuyrukta karıştırılacak yeterli şarkı yok (en az 2 şarkı gerekli).", 0xffa500)],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        }).catch(() => {});
        return true;
      }

      for (let i = queue.songs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
      }

      if (queue.currentSong) {
        const container = buildNowPlayingContainer(queue.currentSong, queue.isPaused, queue.activeFilter, queue);
        await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      await interaction.followUp({
        components: [buildMessageContainer("🔀 Kuyruk Karıştırıldı", `Kuyruktaki **${queue.songs.length}** şarkı rastgele karıştırıldı!`, 0x57f287)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }

    // 9. Kuyruk
    if (customId === "music_queue") {
      const res = this.getQueue(guild.id);
      await interaction.reply({
        components: [res.container],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }

    // 10. Sözler
    if (customId === "music_lyrics") {
      await this.showLyrics(interaction, queue.currentSong?.title);
      return true;
    }

    return false;
  },
};
