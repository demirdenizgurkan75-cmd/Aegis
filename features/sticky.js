// Aegis open-source build: only the first 98 of 247 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * SABİT MESAJ (sticky)
 * Kanalın en altında hep duran bir mesaj: kanala biri yazınca Aegis yeni kopyayı en alta koyar, eskisini siler.
 * Yoğun kanalı ve Discord API'sini yormamak için kanal başına en çok 15 saniyede bir taşınır; ilk taşıma 4 saniye bekler.
 * Veri: guild.sticky = { [channelId]: { title, text, color, paused, messageId, by, at } } (sunucu başına en çok 10 kanal)
 * Panel: /sticky tek komut, komutun yazıldığı kanalı açar; menüden başka kanal seçilir. customId'ler "stickyui:" ile başlar.
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { readDB, updateGuild } = require('../utils/database');
const { tx, banner } = require('./util');

const MAX_STICKIES = 10;
const MIN_GAP_MS = 15 * 1000;
const QUIET_MS = 4 * 1000;

const COLORS = {
  blue: { hex: 0x0066ff, tr: 'Mavi', en: 'Blue' },
  green: { hex: 0x3ba55c, tr: 'Yeşil', en: 'Green' },
  gold: { hex: 0xf0b232, tr: 'Altın', en: 'Gold' },
  red: { hex: 0xed4245, tr: 'Kırmızı', en: 'Red' },
  purple: { hex: 0x7c3aed, tr: 'Mor', en: 'Purple' },
  grey: { hex: 0x99aab5, tr: 'Gri', en: 'Grey' },
};

const canManage = (m) => !!(m?.permissions?.has(PermissionFlagsBits.ManageMessages) || m?.permissions?.has(PermissionFlagsBits.ManageGuild));
const txt = (s) => new TextDisplayBuilder().setContent(s);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const deny = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});

/** Sunucunun sabit mesajları (kayıt yoksa boş nesne; getGuild gibi varsayılan kayıt açmaz, her mesajda çağrılır). */
function getAll(guildId) {
  const s = readDB()[guildId]?.sticky;
  return s && typeof s === 'object' ? s : {};
}
function saveAll(guildId, all) { return updateGuild(guildId, { sticky: all }); }

function canPost(channel, me) {
  if (!channel?.isTextBased?.() || !me) return false;
  return !!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
}

/** Kanala giden sabit mesaj. */
function stickyPayload(gid, entry) {
  const c = new ContainerBuilder().setAccentColor((COLORS[entry.color] || COLORS.blue).hex);
  if (entry.title) c.addTextDisplayComponents(txt(`### :aegis_pin: ${entry.title}`));
  c.addTextDisplayComponents(txt(entry.text));
  if (!entry.title) c.addTextDisplayComponents(txt(`-# :aegis_pin: ${tx(gid, 'Sabit mesaj', 'Sticky message')}`));
  return { components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

// Kanal başına bellek durumu: bekleyen zamanlayıcı, son taşıma anı, gönderim sürüyor mu
const states = new Map();
function state(channelId) {
  let st = states.get(channelId);
  if (!st) { st = { timer: null, lastAt: 0, sending: false }; states.set(channelId, st); }
  return st;
}

/** Sabit mesajı en alta taşır. force: kanal zaten sabit mesajla bitse ya da duraklatılmış olsa da gönder. */
async function repost(channel, gid, { force = false } = {}) {
  const st = state(channel.id);
  if (st.sending) return false;
  const entry = getAll(gid)[channel.id];
  if (!entry || (entry.paused && !force)) return false;
  if (!force && entry.messageId && channel.lastMessageId === entry.messageId) return true;
  st.sending = true;
  try {
    const sent = await channel.send(stickyPayload(gid, entry));
    const all = getAll(gid);
    const cur = all[channel.id];
    if (!cur) { await sent.delete().catch(() => {}); return false; } // bu arada kaldırıldı
    const old = cur.messageId;
    cur.messageId = sent.id;
    saveAll(gid, all);
    if (old && old !== sent.id) channel.messages.delete(old).catch(() => {});
    st.lastAt = Date.now();
    return true;
  } catch (e) {
    console.error(`[sticky] ${channel.id}:`, e.message);
    return false;
  } finally {
    st.sending = false;
  }
}

function schedule(channel, gid) {
  const st = state(channel.id);
  if (st.timer) return;
  const wait = Math.max(QUIET_MS, st.lastAt + MIN_GAP_MS - Date.now());
  st.timer = setTimeout(() => {
    st.timer = null;
    repost(channel, gid).catch(() => {});
  }, wait);
  st.timer.unref?.();
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "open": (i) => require('../utils/ossStub').unavailable(i),
  "handle": (i) => require('../utils/ossStub').unavailable(i),
  "onMessage": () => undefined,
});
