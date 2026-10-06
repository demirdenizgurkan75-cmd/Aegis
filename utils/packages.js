// Aegis paket tanımları — hem API'nin hem de sitenin tek doğruluk kaynağı.
// Aegis'in temel özellikleri herkese ücretsizdir (FREE_FEATURES). Paketler bunun üstüne eklenir;
// kimlikler (onculer, filo-komutani, galaksi-imparatoru) eski siparişlerle uyum için değişmez.
const FREE_FEATURES = [
  'Anti-Nuke & Anti-Raid',
  'Çift dilli AutoMod (TR + EN)',
  '15+ log kanalı',
  'Bilet sistemi ve transkript',
  'Karşılama, otorol, çekiliş',
  'Ticket AI: günde 1.000 yanıt',
  'AI sohbet: günde 30 yanıt (etiketlenince)',
];

const PACKAGES = [
  {
    id: 'onculer',
    name: 'Verse',
    tagline: 'Aegis satırı olmadan, daha fazla AI',
    priceOriginal: 149,
    priceMonthly: 99,
    period: 'ay',
    badge: null,
    features: [
      'Ücretsiz sürümdeki her şey',
      'AI sohbet: günde 300 yanıt',
      '"Aegis ile korunuyor" satırı kaldırılır',
      'Ticket AI: günde 5.000 yanıt',
      'Temel Destek',
    ],
  },
  {
    id: 'filo-komutani',
    name: 'Ballad',
    tagline: 'Büyüyen topluluklar için',
    priceOriginal: 299,
    priceMonthly: 199,
    period: 'ay',
    badge: 'En Çok Tercih Edilen',
    features: [
      'Verse paketindeki her şey',
      'AI sohbet: günde 1.000 yanıt',
      'Ticket AI: günde 10.000 yanıt',
      'Öncelikli Destek',
      'Özel Sunucu Rozeti',
    ],
  },
  {
    id: 'galaksi-imparatoru',
    name: 'Epic',
    tagline: 'Sınırsız ölçek, özel geliştirme',
    priceOriginal: 599,
    priceMonthly: 449,
    period: 'ay',
    badge: 'Premium',
    features: [
      'Ballad paketindeki her şey',
      'Sınırsız AI sohbet ve Ticket AI',
      'Özel Komut Geliştirme',
      '7/24 Öncelikli Destek Hattı',
      'Aylık Sunucu Danışmanlığı',
    ],
  },
];

const TRIAL_DAYS = 14;

module.exports = { PACKAGES, FREE_FEATURES, TRIAL_DAYS };
