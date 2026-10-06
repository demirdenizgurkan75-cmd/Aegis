// Aegis open-source build: only the first 69 of 200 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
// ─── RAID SNAPSHOT + GERİ SAR (rollback) ───────────────────────────────────
// Sunucu sağlıklıyken anlık görüntü alınır (data/snapshots/<guildId>.json).
// Raid/nuke algılanınca yöneticilere DM: "Sunucunuz raidlendi" + [🛡️ Geri Sar].
// Buton tıklanınca silinen kanal/roller yeniden oluşturulur, banlar geri alınır,
// üye rolleri ve izinler onarılır. (NOT: Discord silinen kanal/rollerin ID'sini
// geri vermez; aynı isim/yapı/izinlerle yeniden kurulur, ID bağları güncellenir.)
const fs = require('fs');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const SNAP_DIR = () => path.join(__dirname, '..', 'data', 'snapshots');

function snapFile(guildId) {
  return path.join(SNAP_DIR(), `${guildId}.json`);
}

function ensureDir() {
  const d = SNAP_DIR();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function load(guildId) {
  try { return JSON.parse(fs.readFileSync(snapFile(guildId), 'utf8')); }
  catch { return null; }
}

function save(guildId, snap) {
  ensureDir();
  const tmp = snapFile(guildId) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(snap));
  fs.renameSync(tmp, snapFile(guildId));
}

// ─── Anlık görüntü al ────────────────────────────────────────────────────────
async function captureSnapshot(guild) {
  const roles = guild.roles.cache
    .filter(r => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map(r => ({
      id: r.id, name: r.name, color: r.color, hoist: r.hoist,
      mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position,
    }));

  const channels = guild.channels.cache.map(ch => ({
    id: ch.id, name: ch.name, type: ch.type, parentId: ch.parentId, position: ch.position,
    topic: ch.topic || null, nsfw: ch.nsfw || false, rateLimitPerUser: ch.rateLimitPerUser || 0,
    overwrites: ch.permissionOverwrites
      ? ch.permissionOverwrites.cache.map(o => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() }))
      : [],
  }));

  const bans = await guild.bans.fetch().catch(() => new Map());
  const bannedIds = [...bans.keys()].map(u => typeof u === 'string' ? u : u.id);

  // Üyelerin özel (managed olmayan) rolleri
  const memberRoles = [];
  for (const [, m] of guild.members.cache) {
    if (m.user.bot) continue;
    const rids = [...m.roles.cache.keys()].filter(id => id !== guild.id);
    if (rids.length) memberRoles.push({ id: m.id, roles: rids });
  }

  return {
    takenAt: Date.now(),
    guildName: guild.name,
    guildIcon: guild.iconURL({ extension: 'png', size: 256 }),
    roles, channels, bannedIds, memberRoles,
  };
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "captureSnapshot": async () => null,
  "save": () => undefined,
  "load": () => null,
  "rollback": async () => ({ ok: false, message: 'Not included in the open-source build.' }),
  "sendRaidRollbackAlert": () => undefined,
});
