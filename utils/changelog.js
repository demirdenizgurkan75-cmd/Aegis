// ─── SÜRÜM NOTLARI ────────────────────────────────────────────────────────
// /changelog komutu ve site için. Yeni özellik ekledikçe en üste ekle.
const CHANGELOG = [
  { version: '1.3.0', date: '2026-08-11', items: ['Özel komut sistemi (/ozel-komut)', 'Emoji rol paneli (/role-panel)', 'Haftalık yönetici raporu', 'DB yedekleme sistemi', 'Demo modu (dashboard/?demo=1)', 'top.gg oy /oy-ver', 'Tehdit ağı yanlış-pozitif koruması'] },
  { version: '1.2.0', date: '2026-08-10', items: ['Cookie tabanlı güvenli oturum (502 fix)', 'Dashboard 9 sekmeli panel', 'Çapraz sunucu tehdit veritabanı', 'Web üzerinden paket siparişi'] },
  { version: '1.1.0', date: '2026-08-08', items: ['AI moderasyon (Gemini)', 'Link sandbox + tehdit tespiti', 'Anti-raid anti-nuke koruması'] },
  { version: '1.0.0', date: '2026-08-06', items: ['İlk sürüm — 63 slash komut, otomasyon, ekonomi, ticket'] },
];

module.exports = { CHANGELOG };
