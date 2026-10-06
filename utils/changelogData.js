/** Yenilikler: /help içindeki "Yenilikler" bölümü bunu okur. Yeni sürüm gelince en üste eklenir. */
const CHANGELOG = [
  {
    version: '2.7.0',
    date: '2026-10-05',
    title: { tr: 'Seviyeler, Katılım Kapısı, sıkı yetki koruması ve spam filtreleri', en: 'Levels, Join Gate, strict permission guard and spam filters' },
    items: {
      tr: [
        '`/levels` ve `/rank`: sohbet ve sesle XP, seviye rolleri, seviye mesajı, sıralama. Ücretsiz',
        '`/antiraid` → **Katılım Kapısı**: profil fotoğrafı olmayan, adında link ya da engelli kelime geçen hesapları ve doğrulanmamış botları girişte durdurur',
        '`/antiraid` → **Sıkı koruma**: bir role tehlikeli yetki eklenince, vanity URL değişince veya toplu üye temizliğinde eşik beklemeden geri alır',
        '`/automod` → **Spam filtreleri**: büyük harf, emoji seli, metin duvarı, tekrar eden mesaj, art arda dosya; her ihlalde süre ikiye katlanır',
      ],
      en: [
        '`/levels` and `/rank`: XP from chat and voice, role rewards, level-up message, leaderboard. Free',
        '`/antiraid` → **Join Gate**: stops accounts with no avatar, a link or blocked word in the name, and unverified bots when they join',
        '`/antiraid` → **Strict guard**: reverts a dangerous permission change, flags vanity URL changes and member prunes without waiting for a threshold',
        '`/automod` → **Spam filters**: caps, emoji floods, walls of text, repeated messages, attachment spam; timeouts double each time',
      ],
    },
  },
  {
    version: '2.6.0',
    date: '2026-10-05',
    title: { tr: 'Giriş kapısı, itiraz, kartlar ve sadeleşme', en: 'Entry gate, appeals, cards and a simpler command list' },
    items: {
      tr: [
        '`/gate` kural sınavı, `/appeal` jüriye itiraz, `/jury` ve `/parole`',
        '`/games`: tek komut, menüden müzik tahmin, kelime türetmece, sayı tahmin ve doğruluk mu cesaret mi',
        '`/antiraid`: Anti-Raid ve Anti-Nuke tek panelde (şövalye maskotlu)',
        '`/ai`: seçeneksiz tek panel: kurallara sor, kanalı özetle, sunucu raporu, haftalık özet kartı',
        '`/ticket`: kurulum, bilet yapay zekası ve canlı çeviri tek komut, üç sekmeli panel',
        '`/moderation`: seçeneksiz tek panel; üyeyi seç, uyar, sustur, at, banla, mesaj temizle',
        '`/modlog`: dava seç, sebebi düzenle ya da sil; atılan/banlanan üyeye sebep kartla özelden gider',
        '`/automod`: etiket spam koruması (kişi 1, rol 3 puan)',
        '`/commandlock`: komutları seçtiğin kanallara kilitle',
        '`/suggest`: öneri panosu; oy kartı, yetkili kararı ve öneri sahibine bildirim',
        '`/sticky`: kanalın en altında duran sabit mesaj',
        'Mesaja sağ tık: **Translate** ve **Moderate Author**',
        '`/music`: ses kanalında olmayanlar da uzaktan yönetebilir',
        '`/bump`, `/profile`, `/announce` kartları; her panelde komuta özel piksel kostümlü maskot',
        'Kaldırılanlar: ekonomi, borsa, verify, webhook-panel, server-info, changelog-panel, custom-role, weekly ve aegis-analysis komutları (yenilikler artık burada)',
      ],
      en: [
        '`/gate` rules quiz, `/appeal` jury appeals, `/jury` and `/parole`',
        '`/games`: one command, pick music trivia, word chain, number guess or truth or dare from a menu',
        '`/antiraid`: Anti-Raid and Anti-Nuke in one panel (with the knight mascot)',
        '`/ai`: one option-free panel: ask about the rules, summarize the channel, server report, weekly summary card',
        '`/ticket`: setup, ticket AI and live translation in one command with three tabs',
        '`/moderation`: one option-free panel; pick a member, warn, time out, kick, ban, purge',
        '`/modlog`: pick a case, edit its reason or delete it; kicked/banned members get the reason by DM',
        '`/automod`: mention-spam protection (person 1, role 3 points)',
        '`/commandlock`: lock commands to channels you pick',
        '`/suggest`: suggestion board with a vote card, staff decisions and author notifications',
        '`/sticky`: a message that stays at the bottom of a channel',
        'Right-click a message: **Translate** and **Moderate Author**',
        '`/music`: people outside voice can control it remotely',
        '`/bump`, `/profile`, `/announce` cards; every panel has the mascot in a pixel costume for that command',
        'Removed: economy, market, and the verify, webhook-panel, server-info, changelog-panel, custom-role, weekly and aegis-analysis commands (news now live here)',
      ],
    },
  },
  { version: '2.5.0', date: '2026-08-22', title: { tr: 'Components V2 yeniden yazımı', en: 'Components V2 rewrite' } },
  { version: '2.4.0', date: '2026-08-15', title: { tr: 'AI bilet asistanı', en: 'AI ticket assistant' } },
  { version: '2.3.0', date: '2026-08-01', title: { tr: 'Güvenlik ve moderasyon', en: 'Security and moderation' } },
  { version: '2.1.0', date: '2026-07-01', title: { tr: 'Bilet ve otomasyon', en: 'Tickets and automation' } },
];

module.exports = { CHANGELOG };
