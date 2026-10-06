// Ücretsiz seviye, ödüllü paket süresi ve "Aegis ile korunuyor" satırı.
//
// - Aegis'in temel özellikleri herkese ücretsizdir; hiçbir şey paketsiz sunucudan geri alınmaz.
// - Ücretli paket (activePackageId) ya da davet ödülü (rewardUntil) olan sunucularda marka satırı görünmez.
// - Davet ödülü: Aegis'i daha önce bir sunucuya eklemiş biri yeni bir sunucuya da eklerse, ilk
//   eklediği sunucu 30 gün Ballad (filo-komutani) seviyesini ücretsiz alır.
const { TextDisplayBuilder } = require('discord.js');
const { getGuild, updateGuild, readDB, writeDB } = require('./database');

const PAID_IDS = new Set(['onculer', 'filo-komutani', 'galaksi-imparatoru']);
const REWARD_PACKAGE = 'filo-komutani';
const REWARD_DAYS = 30;
const MIN_MEMBERS_FOR_REWARD = 10;
const SITE = 'https://betterwithaegis.com';

/**
 * Sunucunun şu an geçerli paketi: satın alınmış paket, yoksa süresi dolmamış davet ödülü,
 * yoksa otomatik olarak 'free'. Siteden hiçbir paket etkinleştirmeyen her sunucu Free paketindedir.
 */
function effectivePackage(guildId) {
  const s = getGuild(guildId);
  if (s.activePackageId && PAID_IDS.has(s.activePackageId)) return s.activePackageId;
  if (s.rewardUntil && s.rewardUntil > Date.now()) return REWARD_PACKAGE;
  return 'free';
}

const PACKAGE_NAMES = { free: 'Free', onculer: 'Verse', 'filo-komutani': 'Ballad', 'galaksi-imparatoru': 'Epic' };

/** Panelde gösterilecek paket adı ve (varsa) ödül bitiş zamanı. */
function packageInfo(guildId) {
  const id = effectivePackage(guildId);
  const s = getGuild(guildId);
  const viaReward = id === REWARD_PACKAGE && s.activePackageId !== REWARD_PACKAGE;
  return { id, name: PACKAGE_NAMES[id], rewardUntil: viaReward ? s.rewardUntil : null };
}

function isFree(guildId) {
  return effectivePackage(guildId) === 'free';
}

/** Ücretsiz sunucularda mesajın altına eklenen küçük satır (Discord'un -# alt metni). */
function brandLine(guildId) {
  if (!guildId || !isFree(guildId)) return null;
  const en = require('./i18n').getGuildLanguage(guildId) === 'en';
  return en
    ? `-# Protected by [Aegis](${SITE}/?ref=bot) · free Discord bot`
    : `-# [Aegis](${SITE}/?ref=bot) ile korunuyor · ücretsiz Discord botu`;
}

/** Components V2 kapsayıcısına marka satırını ekler (ücretli sunucuda hiçbir şey yapmaz). */
function addBrand(container, guildId) {
  const line = brandLine(guildId);
  if (line) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(line));
  return container;
}

/** Düz metin mesajın sonuna marka satırını ekler. */
function withBrand(text, guildId) {
  const line = brandLine(guildId);
  return line ? `${text}\n${line}` : text;
}

/**
 * Bot yeni bir sunucuya eklendiğinde çağrılır. Ekleyen kişiyi denetim kaydından bulur, kaydeder ve
 * daha önce başka bir sunucuya da eklemişse o sunucuya ödül verir. Döndürür: { adderId, rewardedGuildId } | null
 */
async function handleReferral(guild) {
  let adderId = null;
  try {
    const logs = await guild.fetchAuditLogs({ type: 28 /* BotAdd */, limit: 5 });
    const entry = logs.entries.find((e) => e.target?.id === guild.client.user.id);
    adderId = entry?.executor?.id || null;
  } catch {
    return null;
  }
  if (!adderId) return null;

  const db = readDB();
  if (!db._referrals) db._referrals = { adders: {}, rewardedNewGuilds: [] };
  const ref = db._referrals;
  const previous = (ref.adders[adderId] || []).filter((id) => id !== guild.id && guild.client.guilds.cache.has(id));
  if (!ref.adders[adderId]) ref.adders[adderId] = [];
  if (!ref.adders[adderId].includes(guild.id)) ref.adders[adderId].push(guild.id);

  let rewardedGuildId = null;
  const eligible = previous.length > 0 && guild.memberCount >= MIN_MEMBERS_FOR_REWARD && !ref.rewardedNewGuilds.includes(guild.id);
  if (eligible) {
    ref.rewardedNewGuilds.push(guild.id);
    rewardedGuildId = previous[0];
  }
  writeDB(db);

  if (rewardedGuildId) {
    const s = getGuild(rewardedGuildId);
    const base = Math.max(Date.now(), s.rewardUntil || 0);
    updateGuild(rewardedGuildId, { rewardUntil: base + REWARD_DAYS * 86400000 });
  }
  return { adderId, rewardedGuildId };
}

// AI sohbet: paket başına günlük yanıt hakkı. Free yalnızca etiketlenince / yanıtlanınca konuşur.
const CHAT_LIMITS = { free: 30, onculer: 300, 'filo-komutani': 1000, 'galaksi-imparatoru': Infinity };

/** Bugünkü sohbet hakkını kontrol eder; izin varsa sayacı bir artırır. */
function useChatQuota(guildId) {
  const pkg = effectivePackage(guildId);
  const limit = CHAT_LIMITS[pkg] ?? CHAT_LIMITS.free;
  const today = new Date().toISOString().slice(0, 10);
  const s = getGuild(guildId);
  const usage = s.chatAiUsage && s.chatAiUsage.date === today ? s.chatAiUsage : { date: today, count: 0 };
  if (usage.count >= limit) return { allowed: false, pkg, limit, used: usage.count };
  usage.count += 1;
  updateGuild(guildId, { chatAiUsage: usage });
  return { allowed: true, pkg, limit, used: usage.count };
}

module.exports = { CHAT_LIMITS, useChatQuota, effectivePackage, packageInfo, PACKAGE_NAMES, isFree, brandLine, addBrand, withBrand, handleReferral, REWARD_DAYS, PAID_IDS };
