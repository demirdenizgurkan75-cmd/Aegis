module.exports = {
  name: 'guildCreate',
  async execute(guild, client) {
    const startTime = Date.now();

    // Sunucu analizi başlat (arkada, bloke etmez)
    setTimeout(() => {
      const { analyzeServer } = require('../utils/serverAnalysis');
      analyzeServer(guild, client).catch(err => {
        console.error('[guildCreate] Server analysis failed:', err.message);
      });
    }, 5000); // 5 sn sonra başlat ki bot hazır olsun

    // ─── Davet ödülü: aynı kişi Aegis'i ikinci bir sunucuya eklediyse ilk sunucusu 30 gün Ballad alır ───
    require('../utils/tier').handleReferral(guild).then(async (r) => {
      if (!r?.rewardedGuildId) return;
      const rewarded = client.guilds.cache.get(r.rewardedGuildId);
      const user = await client.users.fetch(r.adderId).catch(() => null);
      if (!user) return;
      await user.send(
        `Teşekkürler! Aegis'i **${guild.name}** sunucusuna da eklediğin için **${rewarded?.name || 'ilk sunucun'}** 30 gün boyunca ücretsiz **Ballad** paketini aldı.\n` +
        `-# Thanks! Because you added Aegis to **${guild.name}** too, **${rewarded?.name || 'your first server'}** gets the **Ballad** plan free for 30 days.`
      ).catch(() => {});
    }).catch((e) => console.error('[guildCreate] referral:', e.message));

    // ─── Temel sunucu bilgileri ────────────────────────────────────────────────
    const owner = await guild.fetchOwner().catch(() => ({ user: { tag: 'Bilinmiyor', id: '?' } }));
    const memberCount = guild.memberCount;
    const botCount = guild.members.cache.filter(m => m.user.bot).size;
    const humanCount = memberCount - botCount;
    const boostTier = guild.premiumTier;
    const boostCount = guild.premiumSubscriptionCount || 0;
    const createdAt = guild.createdTimestamp;
    const verificationLevel = guild.verificationLevel;
    const explicitContentFilter = guild.explicitContentFilter;
    const defaultMessageNotifications = guild.defaultMessageNotifications;

    // ─── Botun sunucudaki yetkileri ────────────────────────────────────────────
    const me = guild.members.me;
    const botPermissions = me?.permissions.toArray() || [];
    const hasAdmin = me?.permissions.has('Administrator') || false;
    const missingCriticalPerms = [];
    const criticalPerms = [
      'ManageChannels', 'ManageRoles', 'ManageMessages',
      'ModerateMembers', 'BanMembers', 'KickMembers',
      'ViewChannel', 'SendMessages', 'EmbedLinks',
      'ReadMessageHistory', 'UseSlashCommands'
    ];
    for (const perm of criticalPerms) {
      if (!me?.permissions.has(perm)) missingCriticalPerms.push(perm);
    }

    // ─── Kanal sayıları ────────────────────────────────────────────────────────
    const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
    const categories = guild.channels.cache.filter(c => c.type === 4).size;
    const forumChannels = guild.channels.cache.filter(c => c.type === 15).size;
    const stageChannels = guild.channels.cache.filter(c => c.type === 13).size;
    const announcementChannels = guild.channels.cache.filter(c => c.type === 5).size;

    // ─── Rol sayısı ────────────────────────────────────────────────────────────
    const roleCount = guild.roles.cache.size - 1; // @everyone hariç

    // ─── Emoji / Sticker ───────────────────────────────────────────────────────
    const emojiCount = guild.emojis.cache.size;
    const stickerCount = guild.stickers.cache.size;

    // ─── Slash komut sayısı (global + guild) ───────────────────────────────────
    const globalCmdCount = client.commands.size;
    let guildCmdCount = 0;
    try {
      const guildCmds = await guild.commands.fetch();
      guildCmdCount = guildCmds.size;
    } catch {}

    // ─── Web API erişilebilirlik kontrolü ─────────────────────────────────────
    let apiStatus = 'bilinmiyor';
    try {
      const baseUrl = process.env.PUBLIC_BASE_URL || 'https://betterwithaegis.com';
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${baseUrl}/api/stats`, { signal: ctrl.signal });
      clearTimeout(timeout);
      apiStatus = res.ok ? '✅ erişilebilir' : `❌ HTTP ${res.status}`;
    } catch (e) {
      apiStatus = `❌ ${e.name}: ${e.message}`;
    }

    // ─── Discord API ping ──────────────────────────────────────────────────────
    const wsPing = client.ws.ping;

    // ─── Kuyrukta bekleyen siparişler (bu sunucu için) ─────────────────────────
    let pendingOrdersForGuild = 0;
    try {
      const { listPendingOrders } = require('../utils/database');
      const pending = listPendingOrders();
      // Sunucu linkinde guild ID veya invite kodunu kontrol et (basit heuristic)
      for (const order of pending) {
        if (order.serverLink && (order.serverLink.includes(guild.id) || order.serverLink.includes(guild.name))) {
          pendingOrdersForGuild++;
        }
      }
    } catch {}

    // ─── Log formatı ───────────────────────────────────────────────────────────
    const duration = Date.now() - startTime;
    const lines = [
      '',
      '═══════════════════════════════════════════════════════════════',
      `➕  YENİ SUNUCUYA EKLENDİM  —  ${new Date().toLocaleString('tr-TR')}`,
      '═══════════════════════════════════════════════════════════════',
      `📛 Sunucu: ${guild.name} (${guild.id})`,
      `👑 Sahip: ${owner.user.tag} (${owner.user.id})`,
      `📅 Oluşturulma: <t:${Math.floor(createdAt / 1000)}:F> (<t:${Math.floor(createdAt / 1000)}:R>)`,
      `👥 Üyeler: ${memberCount} toplam (${humanCount} insan + ${botCount} bot)`,
      `🚀 Boost: Seviye ${boostTier} • ${boostCount} boost`,
      `🔒 Doğrulama: ${verificationLevelNames[verificationLevel] || verificationLevel}`,
      `🛡️ İçerik Filtresi: ${explicitContentFilterNames[explicitContentFilter] || explicitContentFilter}`,
      `🔔 Bildirim: ${notificationNames[defaultMessageNotifications] || defaultMessageNotifications}`,
      `📝 Kanallar: ${textChannels} metin • ${voiceChannels} ses • ${categories} kategori • ${forumChannels} forum • ${stageChannels} stage • ${announcementChannels} duyuru`,
      `🎭 Roller: ${roleCount} • 😀 Emoji: ${emojiCount} • 🎨 Sticker: ${stickerCount}`,
      '',
      `🤖 BOT BİLGİLERİ`,
      `   Yetki: ${hasAdmin ? '🟢 ADMINISTRATOR' : '🟡 Özel izinler'}`,
      `   Eksik kritik izinler: ${missingCriticalPerms.length === 0 ? 'yok ✅' : missingCriticalPerms.join(', ') + ' ⚠️'}`,
      `   WS Ping: ${wsPing}ms`,
      `   Global komut: ${globalCmdCount} • Sunucu komut: ${guildCmdCount}`,
      '',
      `🌐 WEB API`,
      `   /api/stats: ${apiStatus}`,
      `   Bekleyen sipariş (bu sunucu): ${pendingOrdersForGuild}`,
      '',
      `⏱️  İşlem süresi: ${duration}ms`,
      '═══════════════════════════════════════════════════════════════',
      '',
    ];

    console.log(lines.join('\n'));

    // ─── Üyeleri önbelleğe al (presence takibi için) ──────────────────────────
    try {
      const members = await guild.members.fetch();
      console.log(`👥 ${guild.name}: ${members.size} üye önbelleğe alındı (presence takibi için)`);
    } catch (err) {
      console.error(`⚠️ ${guild.name} üyeleri çekilemedi:`, err.message);
    }

    // ─── Eksik izinler varsa sahibe DM at ─────────────────────────────────────
    if (missingCriticalPerms.length > 0 && owner.user.id !== client.user.id) {
      try {
        await owner.send(
          `⚠️ **${guild.name}** sunucusuna eklendim ama bazı **kritik izinler eksik**!\n` +
          `Eksik izinler: **${missingCriticalPerms.join(', ')}**\n\n` +
          `Bu izinler olmadan AutoMod, Anti-Raid, Ticket, Log sistemi ve slash komutlar düzgün çalışmayabilir.\n` +
          `Lütfen bot rolüne **Administrator** verin veya eksik izinleri ekleyin.`
        );
      } catch {}
    }

    // ─── Yönetici doğrulaması daveti (cmd-nuke koruması) ──────────────────────
    if (owner.user.id !== client.user.id) {
      try {
        await owner.send(
          `🔐 **Yönetici doğrulaması**\n\nAegis'in anti-nuke koruması için sunucu yöneticilerinin doğrulanması gerekir.\n` +
          `Şu linkten Discord ile giriş yap ve doğrula:\nhttps://betterwithaegis.com/verify\n\n` +
          `Doğrulanmayan hesapların yıkıcı işlemleri (toplu kanal/rol silme, mass ban, yetki verme) otomatik engellenir ve sunucu kilitlenir.`
        );
      } catch {}
    }

    // ─── Tüm yöneticilere de doğrulama DM'i (sadece sahip değil) ─────────────
    {
      const { PermissionFlagsBits } = require('discord.js');
      for (const [, m] of guild.members.cache) {
        if (m.user.bot || m.id === client.user.id || m.id === owner.user.id) continue;
        const admin = m.permissions.has(PermissionFlagsBits.Administrator) || m.permissions.has(PermissionFlagsBits.ManageGuild);
        if (!admin) continue;
        try {
          await m.send(
            `🔐 **Yönetici doğrulaması**\n\nAegis'in anti-nuke koruması için sunucu yöneticilerinin doğrulanması gerekir.\n` +
            `Şu linkten Discord ile giriş yap ve doğrula:\nhttps://betterwithaegis.com/verify\n\n` +
            `Doğrulanmayan hesapların yıkıcı işlemleri otomatik engellenir.`
          );
        } catch {}
      }
    }

    // ─── Hoş geldin mesajı (sistem kanalı varsa) ──────────────────────────────
    const systemChannel = guild.systemChannel;
    if (systemChannel && systemChannel.permissionsFor(me).has(['SendMessages'])) {
      try {
        const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
        const { banner } = require('../features/util');
        const container = new ContainerBuilder()
          .setAccentColor(0x0066ff)
          .addMediaGalleryComponents(banner('setup', 'Aegis Guard'))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## :aegis_love: Aegis Guard'ı eklediğin için teşekkürler\n` +
              `Üç adımda hazırsın:\n\n` +
              `• \`/setup\` — Log kanalları, karşılama ve güvenlik ayarlarını tek komutla kurar\n` +
              `• \`/help\` — Tüm komutları kategorilere göre listeler\n` +
              `• \`/gate\` ve \`/jury\` — Yeni üyeler için kural sınavı ve topluluk jürisi\n\n` +
              `:aegis_globe: **Dashboard:** https://betterwithaegis.com/dashboard\n` +
              `:aegis_gift: **Paketler:** https://betterwithaegis.com/pro\n` +
              `:aegis_chat: **Destek:** https://discord.gg/kET8XumjQ`
            )
          )
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Aegis Guard • Discord sunucunun botu'));

        await systemChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch {}
    }
  },
};

// ─── Yardımcı label'lar ──────────────────────────────────────────────────────
const verificationLevelNames = {
  0: 'Yok',
  1: 'Düşük (Doğrulanmış e-posta)',
  2: 'Orta (5 dk üyelik)',
  3: 'Yüksek (10 dk üyelik)',
  4: 'En Yüksek (Doğrulanmış telefon)',
};

const explicitContentFilterNames = {
  0: 'Filtre yok',
  1: 'Rolü olmayan üyelerden medya filtrele',
  2: 'Tüm üyelerden medya filtrele',
};

const notificationNames = {
  0: 'Tüm mesajlar',
  1: 'Sadece @bahset',
};