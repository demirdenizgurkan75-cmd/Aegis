/** Sitenin "Kartlar" galerisi için örnek kartları üretir: node scripts/render-card-samples.js [çıktı klasörü] */
const fs = require('fs');
const path = require('path');
const c = require('../utils/canvas/cards');
const { createWelcomeCard } = require('../utils/canvas/welcomeCard');

const OUT = process.argv[2] || './card-samples';
fs.mkdirSync(OUT, { recursive: true });
const guild = { name: 'Örnek Sunucu', memberCount: 1284, premiumTier: 2, premiumSubscriptionCount: 9 };
const member = { id: '1', guild, user: { displayName: 'Ece', username: 'ece', displayAvatarURL: () => null } };

(async () => {
  const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((label, i) => ({ label, count: [120, 340, 280, 90, 410, 520, 260][i] }));
  const files = {
    welcome: await createWelcomeCard(member),
    goodbye: await c.goodbyeCard(member, false),
    boost: await c.boostCard(member, false),
    gate: await c.gateCard(member, false),
    winner: await c.winnerCard({ prize: '1 aylık Discord Nitro', winners: [{ name: 'Ece' }], entries: 41, isEn: false }),
    verdict: c.verdictCard({ id: 12, outcome: 'removed', votes: { ok: 1, bad: 3, severe: 1 }, isEn: false }),
    poll: c.pollCard({ question: 'Hangi etkinliği yapalım?', options: [{ label: 'Film gecesi', votes: 18 }, { label: 'Turnuva', votes: 31 }, { label: 'Soru-cevap', votes: 7 }], total: 56, isEn: false }),
    weekly: await c.weeklyCard({ guildName: 'Örnek Sunucu', iconUrl: null, days, joins: 37, messages: 2020, members: 1284, boosts: 9, topChannels: [{ name: 'sohbet', count: 980 }, { name: 'oyun-odasi', count: 640 }, { name: 'duyurular', count: 120 }], isEn: false }),
    profile: await c.profileCard({ name: 'Ece', handle: '@ece', avatarUrl: null, roleName: 'Moderatör', roleColor: '#3ba55c', badge: 'Booster', mood: 'happy', stats: [{ k: 'Sunucuda gün', v: '214' }, { k: 'Hesap yaşı (gün)', v: '1.842' }, { k: 'Rol sayısı', v: '5' }, { k: 'Uyarı', v: '0' }], isEn: false }),
    poster: c.posterCard({ title: 'Cuma Turnuva Gecesi', date: 'Cuma 21:00', place: 'Ses kanalı #arena', desc: 'Takımını kur, ödüller sunucu parası.', isEn: false }),
    raid: await c.raidCard({ actorName: 'spam_hesap_8841', avatarUrl: null, reason: '3 kanal 10 saniyede silindi', result: 'Sunucudan atıldı.', isEn: false }),
    ticket: await c.ticketCard({ id: '12', openerName: 'Ece', avatarUrl: null, duration: '2sa 14dk', messages: 31, closedBy: 'Moderatör Can', isEn: false }),
  };
  for (const [name, buf] of Object.entries(files)) fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
  console.log(`${Object.keys(files).length} örnek kart yazıldı → ${OUT}`);
})();
