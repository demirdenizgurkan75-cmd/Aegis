const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
const { getGuildLanguage } = require('../utils/i18n');
const { banner } = require('../features/util');

const { CHANGELOG } = require('../utils/changelogData');

/** "Yenilikler" bölümü: son sürüm madde madde, eskileri tek satırlık başlıkla. */
function newsLines(lang) {
  const [latest, ...older] = CHANGELOG;
  const lines = [`**v${latest.version}** · ${latest.date} · ${latest.title[lang]}`, ...latest.items[lang].map((i) => `• ${i}`), ''];
  lines.push(...older.map((o) => `-# v${o.version} · ${o.date} · ${o.title[lang]}`));
  return lines;
}

// Kategori ve komut listesi, kayıtlı komutlarla birebir aynıdır (eksik ya da fazla komut yok).
// Başlıklarda :aegis_ad: kısa kodları emoji katmanı tarafından Aegis emojisine çevrilir.
const CATEGORIES = [
  {
    id: 'security', emoji: ':aegis_shield:',
    name: { tr: 'Güvenlik', en: 'Security' },
    description: { tr: 'Raid, nuke, link ve webhook koruması, yedek', en: 'Raid, nuke, link and webhook protection, backups' },
    commands: {
      tr: [
        '`/antiraid` — Anti-Raid, Anti-Nuke, panik kilidi ve honeypot tek panelde',
        '`/protection` — Karantina, çift onay, sahte link ve webhook kalkanı',
        '`/automod` — Otomatik moderasyon kuralları, filtreler ve etiket spam koruması',
        '`/commandlock` — Bot komutlarını seçtiğin kanallara kilitle',
        '`/backup create` — Sunucunun rollerini ve kanallarını yedekle',
        '`/backup panel` — Yedekleri listele, geri yükle, sil',
      ],
      en: [
        '`/antiraid` — Anti-Raid and Anti-Nuke control panel',
        '`/protection` — Quarantine, double approval, fake-link and webhook shield',
        '`/automod` — Auto-moderation rules, filters and mention-spam protection',
        '`/commandlock` — Lock bot commands to the channels you pick',
        '`/backup create` — Back up your roles and channels',
        '`/backup panel` — List, restore and delete backups',
      ],
    },
  },
  {
    id: 'moderation', emoji: ':aegis_hammer:',
    name: { tr: 'Moderasyon', en: 'Moderation' },
    description: { tr: 'Ceza, topluluk jürisi, itiraz, giriş kapısı ve kurallar', en: 'Penalties, community jury, appeals, entry gate and rules' },
    commands: {
      tr: [
        '`/moderation` — Uyar, timeout, kick, ban ve mesaj temizle',
        '`/jury` — Topluluk jürisi paneli (mesaja sağ tık → **Send to Jury**)',
        '`/appeal` — Aldığın cezaya jüriye itiraz et',
        '`/modlog` — Moderasyon dosyası: üye geçmişi, dava düzenleme/silme, otomatik ceza',
        '**Moderate Author** (mesaja sağ tık → Uygulamalar) — Yazarı uyar, sustur ya da mesajı sil',
        '`/parole` — Kural sınavını geçen üyenin timeout süresi kısalır',
        '`/gate` — Kural sınavını geçen üye giriş rolünü alır',
        '`/rules` — Kurallar paneli ve kural onay rolü',
      ],
      en: [
        '`/moderation` — Warn, timeout, kick, ban and purge messages',
        '`/jury` — Community jury panel (right-click a message → **Send to Jury**)',
        '`/appeal` — Appeal a penalty to the community jury',
        '`/modlog` — Moderation file: member history, case edit/delete, automatic penalty',
        '**Moderate Author** (right-click a message → Apps) — Warn, time out or delete the message',
        '`/parole` — Pass a rules quiz to shorten your timeout',
        '`/gate` — Pass a rules quiz to get the member role',
        '`/rules` — Rules panel and rules-accept role',
      ],
    },
  },
  {
    id: 'community', emoji: ':aegis_party:',
    name: { tr: 'Topluluk', en: 'Community' },
    description: { tr: 'Karşılama, roller, çekiliş, anket, Buddy ve oyunlar', en: 'Welcome, roles, giveaways, polls, Buddy and games' },
    commands: {
      tr: [
        '`/welcome` — Karşılama mesajı ve kartı',
        '`/autorole` — Yeni üyelere otomatik rol',
        '`/role-panel` — Butonla rol alma paneli',
        '`/giveaway` — Çekiliş paneli: başlat, bitir, yeniden seç',
        '`/poll` — Anket oluştur',
        '`/confession` — Anonim itiraf paneli',
        '`/buddy` — Sunucunun maskotu: kart, kurulum, ayarlar',
        '`/profile` — Üye profil kartı',
        '`/rank` — Seviye kartın, XP\'n ve sıralaman',
        '`/levels` — Seviye sistemi: XP, seviye rolleri, duyuru, sıralama (üyelere sıralamayı gösterir)',
        '`/bump` — Bump hatırlatıcısı (DISBOARD)',
        '`/suggest` — Öneri yaz; topluluk oylar, yetkililer karara bağlar',
        '`/announce` — Etkinlik afişi oluştur ve gönder',
        '`/games` — Oyun menüsü: müzik tahmin, kelime türetmece, sayı tahmin, doğruluk mu cesaret mi',
      ],
      en: [
        '`/welcome` — Welcome message and card',
        '`/autorole` — Give new members a role automatically',
        '`/role-panel` — Self-assign role button panel',
        '`/giveaway` — Giveaway panel: start, end, reroll',
        '`/poll` — Create a poll',
        '`/confession` — Anonymous confession panel',
        '`/buddy` — Your server\'s mascot: card, setup, settings',
        '`/profile` — Member profile card',
        '`/rank` — Your level card, XP and rank',
        '`/levels` — Levels: XP, role rewards, announcements, leaderboard (members see the leaderboard)',
        '`/bump` — Bump reminder (DISBOARD)',
        '`/suggest` — Post a suggestion; the community votes, staff decide',
        '`/announce` — Create and post an event poster',
        '`/games` — Game menu: music trivia, word chain, number guess, truth or dare',
      ],
    },
  },
  {
    id: 'tickets', emoji: ':aegis_ticket:',
    name: { tr: 'Destek biletleri', en: 'Tickets' },
    description: { tr: 'Bilet paneli, yapay zeka asistanı ve canlı çeviri', en: 'Ticket panel, AI assistant and live translation' },
    commands: {
      tr: [
        '`/ticket` — Destek biletleri tek panelde: kurulum (kategori, yetkili, log, panel), yapay zeka asistanı ve canlı çeviri',
      ],
      en: [
        '`/ticket` — Support tickets in one panel: setup (category, staff, log, panel), AI assistant and live translation',
      ],
    },
  },
  {
    id: 'server', emoji: ':aegis_gear:',
    name: { tr: 'Sunucu ve bot', en: 'Server and bot' },
    description: { tr: 'Kurulum, bilgi, paneller, müzik ve dil', en: 'Setup, info, panels, music and language' },
    commands: {
      tr: [
        '`/setup` — Tek tıkla otomatik sunucu kurulumu',
        '`/ai` — Yapay zeka paneli: kurallara sor, kanalı özetle, sunucu raporu ve haftalık özet kartı',
        '**Translate** (mesaja sağ tık → Uygulamalar) — Mesajı kendi diline çevir',
        '`/server-panel` — Sunucu yönetim merkezi',
        '`/sticky` — Kanalın en altında hep duran sabit mesaj',
        '`/music` — Müzik çal ve yönet; uzaktan kumanda ile ses kanalında olmayanlar da yönetebilir',
        '`/language` — Bot dilini değiştir (30 dil)',
        '`/help` — Bu komut rehberi',
      ],
      en: [
        '`/setup` — One-click automatic server setup',
        '`/ai` — AI panel: ask about the rules, summarize the channel, server report and weekly summary card',
        '**Translate** (right-click a message → Apps) — Translate a message into your language',
        '`/server-panel` — Server management center',
        '`/sticky` — A message that always stays at the bottom of a channel',
        '`/music` — Play and manage music; with remote control people outside voice can manage it too',
        '`/language` — Change the bot language (30 languages)',
        '`/help` — This command guide',
      ],
    },
  },
  {
    id: 'news', emoji: ':aegis_party:',
    name: { tr: 'Yenilikler', en: "What's new" },
    description: { tr: 'Son sürümde değişenler ve eski sürümler', en: 'What changed in the latest version and older releases' },
    commands: { tr: newsLines('tr'), en: newsLines('en') },
  },
];

const BRAND = 0x0066ff;

function buildMainContainer(lang) {
  const isEn = lang === 'en';
  const container = new ContainerBuilder().setAccentColor(BRAND);
  container.addMediaGalleryComponents(banner('help', 'Aegis Guard'));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# :aegis_happy: ${isEn ? 'Command guide' : 'Komut rehberi'}\n` +
      (isEn ? 'Pick a category with **›** to see its commands. Every feature opens one panel; the rest is buttons and menus.' : 'Komutlarını görmek için bir kategorinin **›** düğmesine bas. Her özellik tek bir panel açar, gerisi düğme ve menüdür.')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  for (const cat of CATEGORIES) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`${cat.emoji} **${isEn ? cat.name.en : cat.name.tr}**\n-# ${isEn ? cat.description.en : cat.description.tr}`)
        )
        .setButtonAccessory(new ButtonBuilder().setCustomId(`helpcat_${cat.id}`).setLabel('›').setStyle(ButtonStyle.Secondary))
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      isEn
        ? '-# Prefix commands: `a.help` · `a.ping`'
        : '-# Prefix komutları: `a.yardım` · `a.ping`'
    )
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(isEn ? 'Open the dashboard' : 'Paneli aç')
        .setStyle(ButtonStyle.Link)
        .setURL('https://betterwithaegis.com/dashboard'),
      new ButtonBuilder()
        .setLabel(isEn ? 'All commands on the site' : 'Tüm komutlar sitede')
        .setStyle(ButtonStyle.Link)
        .setURL('https://betterwithaegis.com/features')
    )
  );
  return container;
}

function buildCategoryContainer(category, lang) {
  const isEn = lang === 'en';
  const container = new ContainerBuilder().setAccentColor(BRAND);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# ${category.emoji} ${isEn ? category.name.en : category.name.tr}\n${isEn ? category.description.en : category.description.tr}`)
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent((category.commands[lang] || category.commands.tr).join('\n')));
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('help_back').setLabel(isEn ? '← Back' : '← Geri').setStyle(ButtonStyle.Primary)
    )
  );
  return container;
}

function buildYardimCommand(name) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription('Komut rehberi ve yardım menüsü / Command guide and help menu')
    .addStringOption(opt =>
      opt.setName('lang')
        .setDescription('Dil seçimi / Language choice')
        .setRequired(false)
        .addChoices(
          { name: 'English', value: 'en' },
          { name: 'Türkçe', value: 'tr' }
        )
    );
}

module.exports = {
  data: buildYardimCommand('help'),
  CATEGORIES,

  async execute(interaction) {
    const guildId = interaction.guild ? interaction.guild.id : null;
    const guildLang = guildId ? getGuildLanguage(guildId) : 'en';
    const lang = interaction.options.getString('lang') || guildLang;

    const msg = await interaction.reply({
      components: [buildMainContainer(lang)],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = msg.createMessageComponentCollector({ time: 180000 });
    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: lang === 'en' ? 'This menu belongs to someone else. Run `/help` for your own.' : 'Bu menü başkasına ait. Kendi menün için `/help` yaz.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      if (i.customId === 'help_back') return i.update({ components: [buildMainContainer(lang)], flags: MessageFlags.IsComponentsV2 });
      if (i.customId.startsWith('helpcat_')) {
        const category = CATEGORIES.find(c => c.id === i.customId.replace('helpcat_', ''));
        if (!category) return i.deferUpdate();
        return i.update({ components: [buildCategoryContainer(category, lang)], flags: MessageFlags.IsComponentsV2 });
      }
    });
    collector.on('end', () => { interaction.editReply({ components: [] }).catch(() => {}); });
  },
};
