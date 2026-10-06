// ─── AEGIS SERVER BACKUP & RESTORE MANAGER ────────────────────────────────
const fs = require('fs');
const path = require('path');
const { ChannelType } = require('discord.js');

const BACKUPS_ROOT = path.join(__dirname, '..', 'data', 'backups', 'guilds');
const MAX_BACKUPS_PER_GUILD = 10;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getGuildBackupDir(guildId) {
  const dir = path.join(BACKUPS_ROOT, guildId);
  ensureDir(dir);
  return dir;
}

function generateBackupId() {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 7);
  return `bk_${stamp}${rand}`;
}

function pruneOldBackups(guildId) {
  try {
    const dir = getGuildBackupDir(guildId);
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(dir, f);
        return { file: f, path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    while (files.length > MAX_BACKUPS_PER_GUILD) {
      const oldest = files.pop();
      try { fs.unlinkSync(oldest.path); } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Sunucunun tam yedeğini alır ve kaydeder.
 */
async function createBackup(guild, creator = null, customName = null) {
  await guild.fetch().catch(() => {});
  const allRoles = await guild.roles.fetch().catch(() => guild.roles.cache);
  const allChannels = await guild.channels.fetch().catch(() => guild.channels.cache);

  // Roller (managed ve entegrasyon bot rolleri hariç)
  const roles = [];
  for (const [, r] of allRoles) {
    if (r.id === guild.id || r.managed) continue;
    roles.push({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      mentionable: r.mentionable,
      permissions: r.permissions.bitfield.toString(),
      position: r.position,
    });
  }
  roles.sort((a, b) => b.position - a.position);

  // @everyone rol izinleri
  const everyoneRole = guild.roles.everyone;
  const everyonePermissions = everyoneRole ? everyoneRole.permissions.bitfield.toString() : '0';

  // Kanallar ve Kategoriler
  const categories = [];
  const channels = [];

  for (const [, ch] of allChannels) {
    if (!ch) continue;

    // İzin geçersiz kılmaları (permission overwrites)
    const overwrites = [];
    if (ch.permissionOverwrites && ch.permissionOverwrites.cache) {
      for (const [, ow] of ch.permissionOverwrites.cache) {
        let roleName = null;
        if (ow.type === 0) { // Role
          const targetRole = allRoles.get(ow.id);
          roleName = targetRole ? targetRole.name : null;
        }
        overwrites.push({
          id: ow.id,
          type: ow.type,
          roleName: roleName,
          allow: ow.allow.bitfield.toString(),
          deny: ow.deny.bitfield.toString(),
        });
      }
    }

    if (ch.type === ChannelType.GuildCategory) {
      categories.push({
        id: ch.id,
        name: ch.name,
        position: ch.position,
        permissionOverwrites: overwrites,
      });
    } else {
      const parentCat = ch.parentId ? allChannels.get(ch.parentId) : null;
      channels.push({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        parentId: ch.parentId || null,
        parentName: parentCat ? parentCat.name : null,
        position: ch.position,
        topic: ch.topic || null,
        nsfw: Boolean(ch.nsfw),
        rateLimitPerUser: ch.rateLimitPerUser || 0,
        userLimit: ch.userLimit || undefined,
        bitrate: ch.bitrate || undefined,
        permissionOverwrites: overwrites,
      });
    }
  }

  categories.sort((a, b) => a.position - b.position);
  channels.sort((a, b) => a.position - b.position);

  const backupId = generateBackupId();
  const backupData = {
    id: backupId,
    guildId: guild.id,
    guildName: guild.name,
    name: customName && customName.trim().length > 0 ? customName.trim().slice(0, 50) : `${guild.name} - Yedek`,
    createdAt: Date.now(),
    createdBy: {
      id: creator ? creator.id : null,
      tag: creator ? (creator.tag || creator.username) : 'Admin',
    },
    stats: {
      rolesCount: roles.length,
      categoriesCount: categories.length,
      channelsCount: channels.length,
    },
    guildSettings: {
      name: guild.name,
      iconURL: guild.iconURL({ extension: 'png', size: 256 }),
      description: guild.description || null,
      verificationLevel: guild.verificationLevel,
      explicitContentFilter: guild.explicitContentFilter,
      afkTimeout: guild.afkTimeout,
    },
    everyonePermissions,
    roles,
    categories,
    channels,
  };

  const guildDir = getGuildBackupDir(guild.id);
  const filePath = path.join(guildDir, `${backupId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');

  pruneOldBackups(guild.id);

  return {
    id: backupId,
    name: backupData.name,
    createdAt: backupData.createdAt,
    rolesCount: roles.length,
    categoriesCount: categories.length,
    channelsCount: channels.length,
    filePath,
  };
}

/**
 * Sunucuya ait yedeklerin özet listesini getirir.
 */
function listBackups(guildId) {
  try {
    const dir = getGuildBackupDir(guildId);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const list = [];

    for (const f of files) {
      try {
        const fullPath = path.join(dir, f);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        list.push({
          id: data.id || f.replace('.json', ''),
          name: data.name || 'Yedek',
          createdAt: data.createdAt || fs.statSync(fullPath).mtimeMs,
          createdBy: data.createdBy || { tag: 'Bilinmiyor' },
          rolesCount: data.stats ? data.stats.rolesCount : (data.roles ? data.roles.length : 0),
          categoriesCount: data.stats ? data.stats.categoriesCount : (data.categories ? data.categories.length : 0),
          channelsCount: data.stats ? data.stats.channelsCount : (data.channels ? data.channels.length : 0),
        });
      } catch (_) {}
    }

    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  } catch (_) {
    return [];
  }
}

/**
 * Belirtilen yedek verisini getirir.
 */
function getBackup(guildId, backupId) {
  try {
    const cleanId = String(backupId).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = getGuildBackupDir(guildId);
    const filePath = path.join(dir, `${cleanId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Belirtilen yedeği siler.
 */
function deleteBackup(guildId, backupId) {
  try {
    const cleanId = String(backupId).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = getGuildBackupDir(guildId);
    const filePath = path.join(dir, `${cleanId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Yedeği sunucuya uygular / geri yükler.
 */
async function restoreBackup(guild, backupData, client = null, onProgress = null) {
  if (!guild || !backupData) {
    return { ok: false, error: 'Geçersiz sunucu veya yedek verisi.' };
  }

  const result = {
    recreatedRoles: 0,
    updatedRoles: 0,
    recreatedCategories: 0,
    recreatedChannels: 0,
    errors: 0,
  };

  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  // 1) Sunucu Temel Bilgileri
  try {
    if (backupData.guildSettings && backupData.guildSettings.name && guild.name !== backupData.guildSettings.name) {
      await guild.setName(backupData.guildSettings.name).catch(() => {});
    }
  } catch (_) {}

  // 2) @everyone İzinleri
  if (backupData.everyonePermissions && guild.roles.everyone) {
    try {
      await guild.roles.everyone.setPermissions(BigInt(backupData.everyonePermissions)).catch(() => {});
    } catch (_) {}
  }

  if (onProgress) await onProgress(1, 3, 'Roller senkronize ediliyor...').catch(() => {});

  // 3) Roller: eşleme haritası (eski rol id / rol ismi -> yeni rol id)
  const roleMap = new Map();
  const roleNameMap = new Map();

  await guild.roles.fetch().catch(() => {});
  const currentRoles = guild.roles.cache;

  for (const [, curRole] of currentRoles) {
    roleNameMap.set(curRole.name.toLowerCase(), curRole.id);
  }

  const backupRoles = backupData.roles || [];
  for (const r of backupRoles) {
    let existingRole = currentRoles.get(r.id);
    if (!existingRole && roleNameMap.has(r.name.toLowerCase())) {
      existingRole = currentRoles.get(roleNameMap.get(r.name.toLowerCase()));
    }

    if (existingRole && !existingRole.managed) {
      roleMap.set(r.id, existingRole.id);
      roleNameMap.set(r.name.toLowerCase(), existingRole.id);
      try {
        const needsUpdate =
          existingRole.name !== r.name ||
          existingRole.color !== r.color ||
          existingRole.hoist !== r.hoist ||
          existingRole.mentionable !== r.mentionable;

        if (needsUpdate) {
          await existingRole.edit({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            mentionable: r.mentionable,
            permissions: BigInt(r.permissions || '0'),
          }).catch(() => {});
          result.updatedRoles++;
        }
      } catch (_) {
        result.errors++;
      }
    } else {
      try {
        const createdRole = await guild.roles.create({
          name: r.name,
          color: r.color,
          hoist: r.hoist,
          mentionable: r.mentionable,
          permissions: BigInt(r.permissions || '0'),
          reason: 'Aegis Sunucu Yedeği Geri Yükleme',
        });
        roleMap.set(r.id, createdRole.id);
        roleNameMap.set(r.name.toLowerCase(), createdRole.id);
        result.recreatedRoles++;
        await delay(120);
      } catch (_) {
        result.errors++;
      }
    }
  }

  if (onProgress) await onProgress(2, 3, 'Kategoriler ve kanallar kuruluyor...').catch(() => {});

  // 4) Kategoriler
  await guild.channels.fetch().catch(() => {});
  const currentChannels = guild.channels.cache;
  const categoryMap = new Map();
  const categoryNameMap = new Map();

  for (const [, ch] of currentChannels) {
    if (ch.type === ChannelType.GuildCategory) {
      categoryNameMap.set(ch.name.toLowerCase(), ch.id);
    }
  }

  const backupCategories = backupData.categories || [];
  for (const cat of backupCategories) {
    let existingCat = currentChannels.get(cat.id);
    if (!existingCat && categoryNameMap.has(cat.name.toLowerCase())) {
      existingCat = currentChannels.get(categoryNameMap.get(cat.name.toLowerCase()));
    }

    if (existingCat) {
      categoryMap.set(cat.id, existingCat.id);
      categoryNameMap.set(cat.name.toLowerCase(), existingCat.id);
    } else {
      try {
        const createdCat = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          position: cat.position,
          reason: 'Aegis Sunucu Yedeği Geri Yükleme',
        });
        categoryMap.set(cat.id, createdCat.id);
        categoryNameMap.set(cat.name.toLowerCase(), createdCat.id);
        result.recreatedCategories++;
        await delay(150);
      } catch (_) {
        result.errors++;
      }
    }
  }

  // 5) Kanallar (Metin, Ses, Duyuru vb.)
  const channelNameMap = new Map();
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildCategory) {
      channelNameMap.set(`${ch.type}_${ch.name.toLowerCase()}`, ch.id);
    }
  }

  const backupChannels = backupData.channels || [];
  for (const chData of backupChannels) {
    let parentId = null;
    if (chData.parentId && categoryMap.has(chData.parentId)) {
      parentId = categoryMap.get(chData.parentId);
    } else if (chData.parentName && categoryNameMap.has(chData.parentName.toLowerCase())) {
      parentId = categoryNameMap.get(chData.parentName.toLowerCase());
    }

    // İzinleri çözümle (eski rol id -> yeni rol id)
    const overwrites = [];
    for (const ow of (chData.permissionOverwrites || [])) {
      let targetId = ow.id;
      if (ow.id === guild.id) {
        targetId = guild.id; // @everyone
      } else if (ow.type === 0) { // Role
        if (roleMap.has(ow.id)) {
          targetId = roleMap.get(ow.id);
        } else if (ow.roleName && roleNameMap.has(ow.roleName.toLowerCase())) {
          targetId = roleNameMap.get(ow.roleName.toLowerCase());
        } else {
          continue; // Rol bulunamadı, atla
        }
      }

      overwrites.push({
        id: targetId,
        allow: BigInt(ow.allow || '0'),
        deny: BigInt(ow.deny || '0'),
      });
    }

    const key = `${chData.type}_${chData.name.toLowerCase()}`;
    let existingChannel = guild.channels.cache.get(chData.id) || (channelNameMap.has(key) ? guild.channels.cache.get(channelNameMap.get(key)) : null);

    if (existingChannel) {
      try {
        const edits = {};
        if (parentId && existingChannel.parentId !== parentId) edits.parent = parentId;
        if (chData.topic && existingChannel.topic !== chData.topic && (chData.type === ChannelType.GuildText || chData.type === ChannelType.GuildAnnouncement)) {
          edits.topic = chData.topic;
        }
        if (Object.keys(edits).length > 0) {
          await existingChannel.edit(edits).catch(() => {});
        }
        if (overwrites.length > 0) {
          await existingChannel.permissionOverwrites.set(overwrites).catch(() => {});
        }
      } catch (_) {
        result.errors++;
      }
    } else {
      try {
        const createOptions = {
          name: chData.name,
          type: chData.type,
          parent: parentId || undefined,
          position: chData.position,
          topic: (chData.type === ChannelType.GuildText || chData.type === ChannelType.GuildAnnouncement) ? chData.topic : undefined,
          nsfw: (chData.type === ChannelType.GuildText || chData.type === ChannelType.GuildForum) ? chData.nsfw : undefined,
          rateLimitPerUser: chData.rateLimitPerUser || 0,
          userLimit: chData.userLimit || undefined,
          bitrate: chData.bitrate || undefined,
          permissionOverwrites: overwrites,
          reason: 'Aegis Sunucu Yedeği Geri Yükleme',
        };

        await guild.channels.create(createOptions);
        result.recreatedChannels++;
        await delay(200);
      } catch (_) {
        result.errors++;
      }
    }
  }

  if (onProgress) await onProgress(3, 3, 'Geri yükleme tamamlandı.').catch(() => {});

  return {
    ok: true,
    result,
  };
}

module.exports = {
  createBackup,
  listBackups,
  getBackup,
  deleteBackup,
  restoreBackup,
};
