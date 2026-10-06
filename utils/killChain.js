// Aegis open-source build: only the first 96 of 326 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * 🧠 KILL CHAIN PREDICTION ENGINE v1.0
 * Kullanıcı davranış dizilerini analiz ederek bir sonraki saldırı adımını tahmin eder.
 *
 * Attack Phases:
 *   0: RECON       — Keşif (join, profile browse, channel list)
 *   1: WEAPONIZE    — Hazırlık (hesap yaşı, avatar/banner yok,igt>kontrol)
 *   2: DELIVERY     — Teslim (phishing link, malicious embed, DM spam)
 *   3: EXPLOITATION — İstismar (credential phishing, scam, social engineering)
 *   4: INSTALLATION — Kurulum (webhook oluştur, bot invite, role manipulation)
 *   5: COMMAND      — Komuta (raid başlat, spam, data exfil)
 *   6: C2           — C2 Aşaması (botnet communication, coordinated action)
 *   7: ACTS ON OBJ  — Hedefe ulaşma (mass ban, data leak, server nuke)
 */

// ─── Phase Definitions ─────────────────────────────────────────────────────
const PHASES = {
  0: { name: 'RECON', emoji: '🔍', label: 'Keşif', color: 0x3b82f6 },
  1: { name: 'WEAPONIZE', emoji: '🔧', label: 'Hazırlık', color: 0xf59e0b },
  2: { name: 'DELIVERY', emoji: '📦', label: 'Teslim', color: 0xf97316 },
  3: { name: 'EXPLOITATION', emoji: '🔓', label: 'İstismar', color: 0xef4444 },
  4: { name: 'INSTALLATION', emoji: '⚙️', label: 'Kurulum', color: 0xdc2626 },
  5: { name: 'COMMAND', emoji: '🎮', label: 'Komuta', color: 0xb91c1c },
  6: { name: 'C2', emoji: '🕸️', label: 'C2 Aşaması', color: 0x7f1d1d },
  7: { name: 'ACTS_ON_OBJ', emoji: '💀', label: 'Hedefe Ulaşma', color: 0x450a0a },
};

// ─── Signal Definitions ────────────────────────────────────────────────────
// Her sinyal bir phase'e aittir ve confidence skoru taşır.
const SIGNALS = {
  // RECON (Phase 0)
  'guild_join':          { phase: 0, weight: 0.15, desc: 'Sunucuya katıldı' },
  'channel_list_browse': { phase: 0, weight: 0.10, desc: 'Kanalları gezdi' },
  'profile_view':        { phase: 0, weight: 0.08, desc: 'Profil inceledi' },
  'role_list_browse':    { phase: 0, weight: 0.12, desc: 'Rolleri inceledi' },
  'no_first_message':    { phase: 0, weight: 0.20, desc: 'İlk mesajı yok (10dk+)' },
  'low_account_age':     { phase: 0, weight: 0.30, desc: 'Hesap yaşı <30 gün' },
  'no_avatar':           { phase: 0, weight: 0.15, desc: 'Avatar yok' },
  'no_banner':           { phase: 0, weight: 0.05, desc: 'Banner yok' },

  // WEAPONIZE (Phase 1)
  'dm_send':             { phase: 1, weight: 0.25, desc: 'DM gönderdi' },
  'dm_bulk':             { phase: 1, weight: 0.45, desc: 'Toplu DM gönderdi' },
  'external_link_share': { phase: 1, weight: 0.30, desc: 'Dış link paylaştı' },
  'invite_link_share':   { phase: 1, weight: 0.35, desc: 'Discord davet linki paylaştı' },
  'multiple_accounts':   { phase: 1, weight: 0.50, desc: 'Aynı IP/FP ile çoklu hesap' },
  'vpn_usage':           { phase: 1, weight: 0.20, desc: 'VPN/Proxy kullanımı' },

  // DELIVERY (Phase 2)
  'phishing_link':       { phase: 2, weight: 0.60, desc: 'Phishing link tespit edildi' },
  'malware_attachment':  { phase: 2, weight: 0.70, desc: 'Zararlı dosya paylaşıldı' },
  'social_engineering':  { phase: 2, weight: 0.40, desc: 'Sosyal mühendislik kalıbı' },
  'scam_pattern':        { phase: 2, weight: 0.55, desc: 'Scam kalıbı tespit edildi' },
  'fake_token_share':    { phase: 2, weight: 0.65, desc: 'Sahte token/nitro linki' },

  // EXPLOITATION (Phase 3)
  'credential_request':  { phase: 3, weight: 0.70, desc: 'Kimlik bilgisi istendi' },
  'webhook_create':      { phase: 3, weight: 0.50, desc: 'Webhook oluşturuldu' },
  'bot_invite':          { phase: 3, weight: 0.55, desc: 'Bot davet edildi' },
  'role_manipulation':   { phase: 3, weight: 0.65, desc: 'Rol manipülasyonu denendi' },
  'permission_escalation': { phase: 3, weight: 0.80, desc: 'Yetki yükseltme denendi' },

  // INSTALLATION (Phase 4)
  'webhook_spam':        { phase: 4, weight: 0.75, desc: 'Webhook ile spam' },
  'auto_mod_bypass':     { phase: 4, weight: 0.60, desc: 'AutoMod bypass denemesi' },
  'embed_manipulation':  { phase: 4, weight: 0.55, desc: 'Embed manipülasyonu' },
  'rate_limit_abuse':    { phase: 4, weight: 0.40, desc: 'Rate limit istismarı' },

  // COMMAND (Phase 5)
  'mass_action':         { phase: 5, weight: 0.85, desc: 'Toplu aksiyon (ban/kick/mute)' },
  'raid_pattern':        { phase: 5, weight: 0.90, desc: 'Raid kalıbı tespit edildi' },
  'channel_nuke':        { phase: 5, weight: 0.88, desc: 'Kanal silme dalgası' },
  'role_nuke':           { phase: 5, weight: 0.92, desc: 'Rol silme dalgası' },
  'member_purge':        { phase: 5, weight: 0.95, desc: 'Toplu üyeler silindi' },

  // C2 (Phase 6)
  'coordinated_action':  { phase: 6, weight: 0.80, desc: 'Koordine eylem (çoklu hesap)' },
  'botnet_communication': { phase: 6, weight: 0.75, desc: 'Botnet iletişimi' },

  // ACTS ON OBJECTIVE (Phase 7)
  'data_exfiltration':   { phase: 7, weight: 0.95, desc: 'Veri sızıntısı tespit edildi' },
  'server_nuke':         { phase: 7, weight: 0.99, desc: 'Sunucu yıkma girişimi' },
};

// ─── Transition Probabilities ──────────────────────────────────────────────
// Bir phase'ten diğerine geçiş olasılıkları (Markov Chain)
const TRANSITIONS = {
  0: { 1: 0.45, 0: 0.55 },              // Recon → Weaponize veya kalır
  1: { 2: 0.50, 1: 0.35, 0: 0.15 },    // Weaponize → Delivery
  2: { 3: 0.60, 2: 0.30, 1: 0.10 },    // Delivery → Exploitation
  3: { 4: 0.55, 3: 0.35, 2: 0.10 },    // Exploitation → Installation
  4: { 5: 0.65, 4: 0.25, 3: 0.10 },    // Installation → Command
  5: { 6: 0.40, 5: 0.40, 7: 0.20 },    // Command → C2 or Acts
  6: { 7: 0.70, 6: 0.30 },              // C2 → Acts
  7: { 7: 1.0 },                        // Terminal state
};

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "PHASES": {},
  "SIGNALS": {},
  "TRANSITIONS": {},
  "recordSignal": () => undefined,
  "getKillChainMap": () => [],
  "getPrediction": () => null,
  "getAllPredictions": () => [],
  "clearKillChain": () => undefined,
  "getStats": () => ({}),
  "autoAnalyzeNewMember": () => undefined,
  "onRaidDetected": () => undefined,
});
