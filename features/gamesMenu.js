/**
 * /games: tek komut, bir oyun menüsü. Oyun seçilince kanalda başlar.
 * Oyunların mesaj/düğme işleyicileri events/messageCreate.js ve index.js içinde (activeGames: utils/gameData.js).
 * customId: gamesui:pick (seçim menüsü).
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const { activeGames, kelimeListesi } = require('../utils/gameData');
const { tx, banner } = require('./util');

const GAME_TTL_MS = 30 * 60 * 1000;
const txt = (s) => new TextDisplayBuilder().setContent(s);
const v2 = (c) => ({ components: [c], flags: MessageFlags.IsComponentsV2 });

const GAMES = [
  { id: 'music-quiz', emoji: '🎵', tr: ['Müzik Tahmin', 'Ses kanalında kısa kesitleri dinle, şarkıyı ilk bilen kazanır (ses kanalında olmalısın)'], en: ['Music Trivia', 'Guess the song from short clips in voice; first to answer wins (you must be in voice)'] },
  { id: 'kelime-turetmece', emoji: '🔤', tr: ['Kelime Türetmece', 'Son kelimenin son harfiyle başlayan yeni bir kelime yaz'], en: ['Word Chain', 'Write a word that starts with the last letter of the previous one'] },
  { id: 'sayi-tahmin', emoji: '🔢', tr: ['Sayı Tahmin', 'Botun tuttuğu 1-100 arası sayıyı "büyük/küçük" ipuçlarıyla bul'], en: ['Number Guess', 'Find the number from 1 to 100 with higher/lower hints'] },
  { id: 'dogruluk-cesaret', emoji: '🎭', tr: ['Doğruluk mu Cesaret mi?', 'Rastgele doğruluk sorusu ya da cesaret görevi çek'], en: ['Truth or Dare', 'Draw a random truth question or dare'] },
];

function panel(gid, note = '') {
  const c = new ContainerBuilder().setAccentColor(0x0066ff);
  c.addMediaGalleryComponents(banner('games', 'Games'));
  if (note) c.addTextDisplayComponents(txt(note));
  c.addTextDisplayComponents(txt(
    `## ${tx(gid, 'Oyunlar', 'Games')}\n` +
    GAMES.map((g) => { const d = tx(gid, g.tr, g.en); return `${g.emoji} **${d[0]}**\n-# ${d[1]}`; }).join('\n') +
    `\n\n-# ${tx(gid, 'Aşağıdan bir oyun seç, oyun bu kanalda başlar. Kanalda aynı anda tek oyun oynanır.', 'Pick a game below and it starts in this channel. One game at a time per channel.')}`));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('gamesui:pick')
    .setPlaceholder(tx(gid, 'Bir oyun seç…', 'Pick a game…'))
    .addOptions(GAMES.map((g) => { const d = tx(gid, g.tr, g.en); return { label: d[0], description: d[1].slice(0, 100), value: g.id, emoji: g.emoji }; }))));
  return { components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

async function open(interaction) {
  if (!interaction.guild) return interaction.reply({ content: '❌', flags: MessageFlags.Ephemeral });
  return interaction.reply(panel(interaction.guild.id));
}

const stopRow = (id, label) => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Danger));

async function handle(interaction) {
  const g = interaction.guild;
  if (!g || interaction.customId !== 'gamesui:pick') return;
  const gid = g.id;
  const pick = interaction.values[0];
  const channel = interaction.channel;
  const refresh = (note) => interaction.update({ components: panel(gid, note).components });

  if (pick === 'music-quiz') {
    const res = require('../utils/musicTrivia').startTrivia(interaction, 5);
    return refresh(res.message);
  }

  const existing = activeGames.get(channel.id);
  if (existing && Date.now() - (existing.createdAt || 0) < GAME_TTL_MS) {
    return refresh(tx(gid, ':aegis_no: Bu kanalda zaten bir oyun oynanıyor. Bitirmesini bekle ya da başka kanalda aç.', ':aegis_no: A game is already running in this channel. Wait for it to end or start one elsewhere.'));
  }

  let c;
  if (pick === 'kelime-turetmece') {
    const first = kelimeListesi[Math.floor(Math.random() * kelimeListesi.length)].toLowerCase();
    activeGames.set(channel.id, { type: 'kelime-turetmece', lastWord: first, usedWords: [first], starter: interaction.user.id, createdAt: Date.now() });
    c = new ContainerBuilder().setAccentColor(0x3ba55c)
      .addTextDisplayComponents(txt(`# 🔤 ${tx(gid, 'Kelime Türetmece', 'Word Chain')}`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(txt(tx(gid,
        `İlk kelime: **${first}**\nSon harf: **${first.slice(-1).toUpperCase()}**\nBu harfle başlayan bir kelime yaz! Kimse aynı kelimeyi iki kez kullanamaz.`,
        `First word: **${first}**\nLast letter: **${first.slice(-1).toUpperCase()}**\nWrite a word starting with that letter! A word cannot be used twice.`)))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(stopRow('game_stop_kelime', tx(gid, '⏹️ Oyunu Bitir', '⏹️ End game')));
  } else if (pick === 'sayi-tahmin') {
    activeGames.set(channel.id, { type: 'sayi-tahmin', target: Math.floor(Math.random() * 100) + 1, attempts: 0, starter: interaction.user.id, createdAt: Date.now() });
    c = new ContainerBuilder().setAccentColor(0xf0b232)
      .addTextDisplayComponents(txt(`# 🔢 ${tx(gid, 'Sayı Tahmin', 'Number Guess')}`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(txt(tx(gid, '1 ile 100 arasında bir sayı tuttum. Kanala bir sayı yaz, "büyük" ya da "küçük" diyeceğim. İlk bulan kazanır!', 'I picked a number from 1 to 100. Type a number in the channel and I will say higher or lower. First to find it wins!')))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(stopRow('game_stop_sayi', tx(gid, '⏹️ Bitir', '⏹️ End')));
  } else if (pick === 'dogruluk-cesaret') {
    c = new ContainerBuilder().setAccentColor(0x0066ff)
      .addTextDisplayComponents(txt(`# 🎭 ${tx(gid, 'Doğruluk mu Cesaret mi?', 'Truth or Dare')}`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(txt(tx(gid, 'Birini seç, soru ya da görev gelsin!', 'Pick one and a question or dare appears!')))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dc_dogruluk').setLabel(tx(gid, '🗣️ Doğruluk', '🗣️ Truth')).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('dc_cesaret').setLabel(tx(gid, '💪 Cesaret', '💪 Dare')).setStyle(ButtonStyle.Danger)));
  } else return;

  try { await channel.send(v2(c)); } catch (_) {
    activeGames.delete(channel.id);
    return refresh(tx(gid, ':aegis_no: Bu kanala yazamıyorum.', ':aegis_no: I cannot write in this channel.'));
  }
  const d = tx(gid, GAMES.find((x) => x.id === pick).tr, GAMES.find((x) => x.id === pick).en);
  return refresh(`:aegis_ok: ${tx(gid, `**${d[0]}** bu kanalda başladı.`, `**${d[0]}** started in this channel.`)}`);
}

module.exports = { open, handle, GAMES };
