/**
 * HAFTALIK SUNUCU KARTI
 * Her hafta seçilen kanala son 7 günün özeti (günlük mesaj grafiği, yeni üye, en aktif kanallar) tek bir kartla gider.
 * Veri: guild._msgStats (saatlik, kanal bazlı) ve guild._joinStats (günlük) — botun zaten tuttuğu istatistikler.
 * Ayar: guild.weekly = { enabled, channelId, nextAt, lastSentAt }
 */
const { getGuild, updateGuild, readDB } = require('../utils/database');
const { getGuildLanguage } = require('../utils/i18n');
const { cardPayload } = require('../utils/cardMessage');
const { weeklyCard } = require('../utils/canvas/cards');

const WEEK = 7 * 24 * 3600 * 1000;

function getCfg(guildId) {
  const w = getGuild(guildId).weekly || {};
  return { enabled: !!w.enabled, channelId: w.channelId || null, nextAt: w.nextAt || 0, lastSentAt: w.lastSentAt || 0 };
}
function saveCfg(guildId, cfg) { return updateGuild(guildId, { weekly: cfg }); }

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Son 7 günün istatistiği. */
function collect(guild, isEn) {
  const g = readDB()[guild.id] || {};
  const msg = g._msgStats || {};
  const joinStats = g._joinStats || {};
  const names = isEn ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const days = [];
  const perChannel = {};
  let joins = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dayKey(d);
    let count = 0;
    for (const [k, chans] of Object.entries(msg)) {
      if (!k.startsWith(key)) continue;
      for (const [cid, n] of Object.entries(chans)) { count += n; perChannel[cid] = (perChannel[cid] || 0) + n; }
    }
    joins += joinStats[key] || 0;
    days.push({ label: names[d.getDay()], count });
  }
  // Silinmiş kanallar listeye girmez
  const topChannels = Object.entries(perChannel).filter(([cid]) => guild.channels.cache.get(cid)).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([cid, count]) => ({ name: guild.channels.cache.get(cid).name, count }));
  return { days, joins, messages: days.reduce((a, b) => a + b.count, 0), topChannels };
}

/** Kartı üretip kanala gönderir. Dönüş: { ok } | { err } */
async function send(guild, channelId) {
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return { err: 'channel' };
  const isEn = getGuildLanguage(guild.id) === 'en';
  const data = collect(guild, isEn);
  const png = await weeklyCard({
    guildName: guild.name, iconUrl: guild.iconURL({ extension: 'png', size: 128 }),
    ...data, members: guild.memberCount, boosts: guild.premiumSubscriptionCount || 0, isEn,
  });
  const text = isEn
    ? `-# Last 7 days: ${data.messages.toLocaleString('en-US')} messages, ${data.joins} new members`
    : `-# Son 7 gün: ${data.messages.toLocaleString('tr-TR')} mesaj, ${data.joins} yeni üye`;
  const sent = await channel.send(cardPayload(png, { name: 'weekly.png', text })).catch(() => null);
  return sent ? { ok: true } : { err: 'send' };
}

/** Saatlik kontrol: zamanı gelen sunuculara haftalık kartı gönderir. */
async function tick(client) {
  const db = readDB();
  const now = Date.now();
  for (const gid of Object.keys(db)) {
    if (gid.startsWith('_')) continue;
    const w = db[gid]?.weekly;
    if (!w?.enabled || !w.channelId || !w.nextAt || w.nextAt > now) continue;
    const guild = client.guilds.cache.get(gid);
    if (!guild) continue;
    const cfg = getCfg(gid);
    // Bot kapalıyken kaçan haftalar için art arda göndermemek: sonraki zamanı şimdiden hesapla
    cfg.nextAt = now + WEEK;
    saveCfg(gid, cfg);
    const res = await send(guild, cfg.channelId).catch((e) => ({ err: e.message }));
    if (res.ok) { cfg.lastSentAt = now; saveCfg(gid, cfg); }
    else console.error(`[weekly] ${guild.name}: ${res.err}`);
  }
}

module.exports = { getCfg, saveCfg, send, tick, collect, WEEK };
