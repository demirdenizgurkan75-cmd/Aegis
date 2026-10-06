// ─── AEGIS BOT i18n — TR/EN yerelleştirme sistemi ────────────────────────────
// Kullanım: const t = require('../utils/i18n')(guildId); t('key', { vars })

const fs = require('fs');
const path = require('path');
const { readDB } = require('./database');

const I18N = {
  tr: {

    // Changelog
    'changelog.date': 'Tarih',
    'changelog.type': 'Tip',

    // Rules
    'rules.title': '# 📜 Sunucu Kuralları',
    'rules.description': 'Sunucumuza hoş geldiniz! Aşağıdaki kuralları okuyup onaylayarak sohbet kanallarına erişim kazanın.\n\n1️⃣ Saygılı olun, küfür/argo/taciz yapmayın\n2️⃣ Spam/reklam/link paylaşmayın (izin verilmedikçe)\n3️⃣ Konu dışı/uygunsuz tartışmalara girmeyin\n4️⃣ Yetkililere saygı duyun, yönergeleri takip edin\n5️⃣ Hesap paylaşımı/çalıntı hesap yasaktır\n6️⃣ Yasadışı içerik/paylaşım kesinlikle yasaktır',
    'rules.accept': '✅ Kabul Ediyorum',
    'rules.footer': '*Aegis Guard • Kural Botu*',
    'rules.created': '# ✅ Kural Botu Kuruldu!',
    'rules.configured': '**Kanal:** {channel}\n**Rol:** {role}\n\nKullanıcılar {channel} kanalına gidip "Kabul Ediyorum" butonuna tıkladığında {role} rolünü alacak.',

    // Ticket AI
    'ticket_ai.limit_exceeded': '⚠️ Günlük limit doldu ({usage}/{limit}).',
    'ticket_ai.test_title': '# 🤖 AI Ticket Asistanı Test',
    'ticket_ai.question': '**Soru:** {question}',
    'ticket_ai.answer': '**Cevap:**\n{answer}',
    'ticket_ai.powered_by': '*Gemini 3.6 Flash ile oluşturuldu*',

    // Ticket
    'ticket.created': '🎫 Ticket oluşturuldu: {id}',
    'ticket.closed': '🎫 Ticket #{id} {user} tarafından kapatıldı',
    'ticket.transcript_saved': '📝 Transcript {channel} kanalına kaydedildi',
    'ticket.settings_configured': '✅ **Ticket Ayarları Yapılandırıldı**\n• Kategori: {category}\n• Yetkili Rolü: {staffRole}\n• Log Kanalı: {logChannel}',
    'ticket.config_missing': '❌ **Yapılandırma Eksik**\nÖnce `/ticket` komutunun Kurulum sekmesinde kategori, yetkili rolü ve log kanalı ayarlayın.',
    'ticket.panel_title': '# 🎫 Destek Ticketları\n\nAşağıdaki butona tıklayarak özel bir destek **ticket** oluşturun.\nEkibimiz en kısa sürede size yardımcı olacaktır.',
    'ticket.panel_desc': '**Nasıl çalışır:**\n• "Ticket Oluştur" butonuna tıklayarak özel kanal açın\n• Sadece siz ve yetkililer tiketi görebilir\n• Çözüldüğünde kapat butonunu kullanın',
    'ticket.open_ticket': '**Aşağıdaki butona tıklayarak **ticket** açın:**',
    'ticket.panel_created': '✅ **Ticket Paneli Oluşturuldu**\nPanel bu kanala gönderildi.',
    'ticket.button_create': '🎫 **Ticket** Oluştur',
    'ticket.button_close': '🔒 **Ticket** Kapat',
    'ticket.close_button_desc': '**Ticket**ı kapatmak için aşağıdaki butona basın:**',
    'ticket.already_open': '❌ Zaten açık bir **ticket**ın var! {channel}',
    'ticket.creation_failed': '❌ Ticket kanalı oluşturulamadı!',
    'ticket.new_ticket': '## 🎫 **{ticketId}**\nYeni destek **ticket**ı oluşturuldu!',
    'ticket.ticket_owner': '**Ticket** Sahibi',
    'ticket.staff_team': 'Destek Ekibi',
    'ticket.staff_will_help': 'Bir yetkili en kısa sürede yardımcı olacak.',
    'ticket.describe_issue': '### 💬 **Sorununuzu aşağıya yazın**\nDestek ekibi **ticket**ı gördüğünde yanıtlayacak.',
    'ticket.not_a_ticket': '❌ Bu kanal bir **ticket** değil!',
    'ticket.no_permission_close': '❌ Bu **ticket**ı kapatma yetkin yok! Sadece yetkililer/adminler kapatabilir.',
    'ticket.transcript_title': '# 📋 **Ticket** Transcript — {ticketId}',
    'ticket.transcript_info': '**Açan:** {opener} ({openerTag})\n**Kapatan:** {closer}\n**Açılış:** {opened}\n**Kapanış:** {closed}\n**Mesaj Sayısı:** {count}',
    'ticket.transcript_recent': '**Son Mesajlar:**',
    'ticket.closed_info': 'Bu **ticket** {closer} tarafından kapatıldı.',
    'ticket.transcript_saved_delete': 'Transcript log kanalına kaydedildi. **Ticket** kanalı **10 saniye** içinde silinecek.',
    'ticketai.title': '# 🤖 AI Ticket Asistanı Ayarları',
    'ticketai.enabled': '✅ AI Ticket Asistanı Açık',
    'ticketai.disabled': '❌ AI Ticket Asistanı Kapalı',
    'ticketai.limit': '**Günlük Limit:** {limit} istek/gün',
    'ticketai.model': '**Model:** {model}',
    'ticketai.toggle_on': 'Aç',
    'ticketai.toggle_off': 'Kapat',

    // Anket
    'anket.title': '📊 Anket',
    'anket.invalid_options': 'Anket {min}-{max} seçenek arasında olmalı.',
    'anket.invalid_duration': 'Geçersiz süre. Format: 30m, 2h, 1d (10s - 7g).',
    'anket.zero_votes': '0 oy',
    'anket.footer': '{author} tarafından oluşturuldu | {duration} sonra sona erer',
    'anket.created': 'Anket {channel} kanalına oluşturuldu!',

    // Arabuluculuk
    'arabuluculuk.owner_only': '❌ Bu komut sadece bot sahibi kullanabilir.',

    // Common
    'common.prev': '◀ Önceki',
    'common.next': 'Sonraki ▶',
    'common.back': '← Geri',
    'common.unknown': 'Bilinmiyor',

    'lang.current': 'Mevcut dil: **Türkçe**',
    'lang.changed': '✅ Dil **{lang}** olarak değiştirildi!',
    'lang.changed_tr': '✅ Dil **Türkçe** olarak değiştirildi!',
    'lang.select': 'Dil seçin:',
    'lang.en_notice': '🇬🇧 **İngilizce sürüm etkin** — Prefix komutları `a.` ile çalışır.\nÖrnek: `a.help`, `a.kurulum`, `a.ping`\n\nSlash komutları (`/`) normal çalışır.\n\n**Mevcut komutlar:**\n{cmds}',

    'lang.current': 'Mevcut dil: **Türkçe**',
    'lang.changed': '✅ Dil **{lang}** olarak değiştirildi!',
    'lang.changed_tr': '✅ Dil **Türkçe** olarak değiştirildi!',
    'lang.select': 'Dil seçin:',
    'lang.en_notice': '🇬🇧 **İngilizce sürüm etkin** — Prefix komutları `a.` ile çalışır.\nÖrnek: `a.help`, `a.kurulum`, `a.ping`\n\nSlash komutları (`/`) normal çalışır.\n\n**Mevcut komutlar:**\n{cmds}',
    // Genel
    'common.yes': 'Evet',
    'common.no': 'Hayır',
    'common.enabled': 'Açık',
    'common.disabled': 'Kapalı',
    'common.save': 'Kaydet',
    'common.cancel': 'İptal',
    'common.loading': 'Yükleniyor...',
    'common.error': 'Bir hata oluştu',
    'common.success': 'Başarılı',
    'common.perms_missing': 'Bu işlem için yetkiniz yok',
    'common.bot_perms_missing': 'Botun yetkileri yetersiz',
    'common.try_again': 'Lütfen tekrar deneyin',

    // Setup
    'setup.title': '🛡️ Aegis Guard — Kurulum Sihirbazı',
    'setup.already_setup': '⚠️ Bot zaten kurulu! Ayarları değiştirmek için `/ayarlar` kullan.',
    'setup.select_package': 'Hangi paket seviyesini kurmak istersiniz?',
    'setup.basic_tier': '📦 Verse — 5 log kanalı',
    'setup.full_tier': '🚀 Tam Donanım — Tüm kanallar + Özel özellikler',
    'setup.creating': 'Kurulum yapılıyor...',
    'setup.done': '✅ Kurulum tamamlandı! Log kategorisi ve kanallar oluşturuldu.',
    'setup.done_desc': 'Artık `/ayarlar` ile detaylı yapılandırma yapabilirsiniz.',
    'setup.welcome_configured': '👋 Karşılama mesajı ve otomatik rol ayarlandı.',
    'setup.ticket_configured': '🎫 Ticket sistemi kuruldu.',
    'setup.failed': '❌ Kurulum sırasında hata: {error}',

    // Kurulum (detailed)
    'kurulum.dm_sent': '📩 DM\'de kurulum rehberini gönderiyorum...',
    'kurulum.dm_sent_success': '✅ DM\'de kurulum rehberini gönderdim!',
    'kurulum.dm_failed': '❌ DM gönderilemedi: {error}\n\nDM gizliliğinizi kontrol edin.',
    'kurulum.title': '# 🛡️ Aegis Guard Kurulum Rehberi\n> **Sunucu:** {guildName}\n> **Kurulum durumu:** {setupStatus}',
    'kurulum.setup_completed': '✅ Tamamlandı',
    'kurulum.setup_pending': '⏳ Kurulacak',
    'kurulum.section_language': '## 1️⃣ Dil Ayarı\nBotun hangi dille cevap vereceğini seç.',
    'kurulum.button_tr': '🇹🇷 Türkçe',
    'kurulum.button_en': '🇺🇸 English',
    'kurulum.section_channels': '## 2️⃣ Kanallar\nGerekli kanallar otomatik oluşturulur.\n• `#mod-logs` → Moderasyon logları\n• `#hoşgeldin` → Yeni üye karşılaması\n• `#duyurular` → Duyuru kanalı\n• `tickets/` → Ticket kategorisi',
    'kurulum.button_create_channels': '🔧 Kanalları Oluştur',
    'kurulum.section_security': '## 3️⃣ Güvenlik Modülleri\nHangilerini etkinleştirmek istersin?\n• Anti-Raid → Raid/spam engelleme\n• AutoMod → Küfür/spam filtresi\n• Link Sandbox → Phishing link engelleme',
    'kurulum.antiraid_status': '**Anti-Raid:** {status}\n**AutoMod:** {status2}\n**Link Sandbox:** {status3}',
    'kurulum.status_enabled': '✅ Açık',
    'kurulum.status_disabled': '❌ Kapalı',
    'kurulum.button_antiraid_on': '🛡️ Anti-Raid Aç',
    'kurulum.button_antiraid_off': '🛡️ Anti-Raid Kapat',
    'kurulum.button_automod_on': '🤖 AutoMod Aç',
    'kurulum.button_automod_off': '🤖 AutoMod Kapat',
    'kurulum.button_sandbox_on': '🔗 Sandbox Aç',
    'kurulum.button_sandbox_off': '🔗 Sandbox Kapat',
    'kurulum.section_moderation': '## 4️⃣ Moderasyon\nKomutlar:\n• `/moderation @kullanıcı` → Ban/Kick/Timeout/Uyarı/Temizle\n• `/automod` → Yasaklı kelimeleri yönet\n• `/killchain analiz @kullanıcı` → Saldırı zinciri analizi',
    'kurulum.section_extras': '## 5️⃣ Ekstra Özellikler\n• `/çekiliş başlat` → Çekiliş\n• `/role-panel` → Emoji → Rol select menüsü\n• `/guven-skoru @kullanıcı` → Güven skoru hesaplama',
    'kurulum.section_dashboard': '## 6️⃣ Dashboard\n**betterwithaegis.com/dashboard**\n\nDashboard\'da tüm ayarları görsel olarak yönetebilirsin:\n• Güvenlik modülleri aç/kapa\n• Yasaklı kelime yönetimi\n• Log kanalı seçimi\n• Rol paneli oluşturma',
    'kurulum.button_dashboard': '🌐 Dashboard\'a Git',
    'kurulum.section_next': '## 📋 Sonraki Adımlar\n1. 📌 Kanallar oluştur\n2. 🛡️ Güvenlik modüllerini aç\n3. 🌐 Dashboard\'dan ayarları özelleştir\n4. 🎮 Deneme yap\n\n**Sorun varsa?** Destek sunucumuz: discord.gg/aegisguard',
    'kurulum.footer': '🛡️ *Aegis Guard • Yeni Nesil Discord Güvenliği*',

    // Yardım / Help
    'help.title': '🛡️ Aegis Guard — Komut Rehberi',
    'help.description': 'Bot kullanmak için mesaj kutusuna `/` yaz ve komut adını seç — Discord seni adım adım yönlendirir.\n\n**🎯 Herkesin kullanabildiği:** oyunlar, bilgi, çekiliş\n**👑 Sadece admin/yetkili:** güvenlik, moderasyon, kurulum, otomasyon\n\nYeni misin? Aşağıda **✨ Yeni Komutlar** bölümünden başla — hepsi tek tek açıklanıyor.',
    'help.new_commands': '✨ Yeni Komutlar — Adım Adım',
    'help.custom_cmd': '**1. /ozel-komut** — Kendi `!komut`larını ekle.\n`/ozel-komut ekle komut:merhaba yanit:Selam {kullanici}!` yaz.\nSunucuda artık `!merhaba` yazan herkes o cevabı alır. Değişkenler: `{kullanici}`, `{sunucu}`.',
    'help.role_panel': '**2. /role-panel** — Emojiye tıklayan rol alır (ör: 🎮→Oyun rolü).\n`/role-panel kur kanal:#roller` → bir panel mesajı oluşur.\n`/role-panel ekle panel-id:<mesajın id> emoji:🎮 rol:@Oyun` → eşleştir.',
    'help.trust_score': '**3. /guven-skoru** — Yeni üyenin güvenilirliğini hesaplar (hesap yaşı, avatar, rozetler).\n`/guven-skoru kontrol @üye` → skor + risk seviyesi gösterir.',
    'help.anti_raid': '**4. /antiraid** — Raid koruma panelini açar (kanal/rol silme, mass ban, spam eşikleri).',
    'help.automod': '**5. /automod** — Küfür, link, spam, büyük harf filtresi + AI ton analizi.',
    'help.setup': '**6. /setup** — Botu sunucuna kur (log kanalları, karşılama, ticket).',
    'help.everyone': '**Herkes İçin**',
    'help.admin_only': '**Sadece Yöneticiler**',
    'help.games': '🎮 Oyunlar',
    'help.info': 'ℹ️ Bilgi',
    'help.security': '🛡️ Güvenlik',
    'help.moderation': '⚖️ Moderasyon',
    'help.automation': '⚙️ Otomasyon',
    'help.other': '📦 Diğer',

    // Paket / Package
    'pkg.title': '📦 Aegis Pro Paketler',
    'pkg.trial': '🎁 14 gün ücretsiz deneme — kart bilgisi gerekmez',
    'pkg.select': 'Paketi Seç',
    'pkg.selected': '📦 Seçili paket: **{pkg}**',
    'pkg.trial_remaining': '🎁 Ücretsiz deneme: **{days} gün** kaldı',
    'pkg.trial_expired': '⏳ Deneme süren doldu. Devam etmek için bir paket seç.',
    'pkg.order_prompt': 'Bu paketi hangi sunucuna eklemek istiyorsun? Sunucunun davet linkini yapıştır:',
    'pkg.order_sent': '✅ Sipariş alındı! Ekibimiz Discord üzerinden birkaç saat içinde onaylayacak.',
    'pkg.order_error': '❌ Sipariş oluşturulamadı, lütfen tekrar dene.',

    // Dil / Language
    'lang.current': 'Mevcut dil: **Türkçe**',
    'lang.changed': '✅ Dil **{lang}** olarak değiştirildi!',
    'lang.changed_tr': '✅ Dil **Türkçe** olarak değiştirildi!',
    'lang.select': 'Dil seçin:',
    'lang.en_notice': '🇬🇧 **English version enabled** — Prefix commands use `a.` for all languages.\nExample: `a.help`, `a.setup`, `a.ping`\n\nSlash commands (`/`) still work normally.\n\n**Available commands:**\n{cmds}',

    // Prefix komutları için
    'prefix.help': '📚 **Aegis Guard — Command Guide**\n\n**Everyone:** `a.help`, `a.ping`, `a.giveaway`, `a.poll`\n**Admins:** `a.setup`, `a.settings`, `a.automod`, `a.antiraid`, `a.moderation`, `a.ticket`, `a.welcome`, `a.rolepanel`\n\nUse `a.help <command>` for details.\n\n💡 *Slash commands (`/`) also work if you prefer.*',
    'prefix.ping': '🏓 Pong! WS: {ws}ms | REST: {rest}ms',
    'prefix.setup': 'Use `/setup` slash command for guided setup.',
    'prefix.settings': 'Use `/ayarlar` slash command for settings.',

    // Hata / Error
    'error.guild_only': 'Bu komut sadece sunucularda çalışır',
    'error.dm_only': 'Bu komut sadece DM\'de çalışır',
    'error.nsfw_only': 'Bu komut sadece NSFW kanallarında çalışır',
    'error.owner_only': 'Bu komut sadece bot sahibi tarafından kullanılabilir',
    'error.cooldown': 'Bu komutu kullanmak için {time} saniye beklemelisiniz',
    'error.missing_args': 'Eksik argüman: {args}',
    'error.invalid_args': 'Geçersiz argüman: {args}',

    // ─── TR için doldurulan eksik anahtarlar (panel içerikleri) ───
    // Anti-Nuke
    'antinuke.title': '# 💣 Anti-Nuke Koruması',
    'antinuke.enabled': '✅ Anti-Nuke aktif',
    'antinuke.disabled': '❌ Anti-Nuke kapalı',
    'antinuke.toggle_on': '🟢 Etkinleştir',
    'antinuke.toggle_off': '🔴 Kapat',
    'antinuke.config_btn': '⚙️ Yapılandır',
    // Anti-Raid
    'antiraid.title': '# 🛡️ Anti-Raid Koruması {status}',
    'antiraid.status_enabled': '🟢 AÇIK',
    'antiraid.status_disabled': '🔴 KAPALI',
    'antiraid.status_active': '✅ Aktif — Şüpheli hareketler engelleniyor',
    'antiraid.status_inactive': '❌ Pasif — Koruma kapalı',
    'antiraid.thresholds_title': '**Eşikler:**',
    'antiraid.channel_delete': '• Kanal Silme: {count} / {window}s',
    'antiraid.channel_create': '• Kanal Oluşturma: {count} / {window}s',
    'antiraid.role_delete': '• Rol Silme: {count} / {window}s',
    'antiraid.role_create': '• Rol Oluşturma: {count} / {window}s',
    'antiraid.ban_threshold': '• Ban: {count} / {window}s',
    'antiraid.kick_threshold': '• Kick: {count} / {window}s',
    'antiraid.action': '**Eylem:** {action}',
    'antiraid.punish_duration': '**Ceza Süresi:** {duration}',
    'antiraid.log_channel': '**Log Kanalı:** {channel}',
    'antiraid.no_log_channel': 'Ayarlanmadı',
    'antiraid.toggle_on': '🟢 Etkinleştir',
    'antiraid.toggle_off': '🔴 Kapat',
    'antiraid.config_btn': '⚙️ Eşikleri Yapılandır',
    'antiraid.dashboard_btn': '🌐 Dashboard\'da Yönet',
    'antiraid.whitelist_btn': '👥 Beyaz Liste',
    'antiraid.blacklist_btn': '🚫 Kara Liste',
    // AutoMod
    'automod.title': '# 🤖 AutoMod Paneli',
    'automod.enabled': '✅ AutoMod aktif',
    'automod.disabled': '❌ AutoMod kapalı',
    'automod.profanity': '🤬 Küfür Filtresi',
    'automod.links': '🔗 Link Filtresi',
    'automod.ai_tone': '🧠 AI Ton Analizi',
    'automod.word_list': '📝 Kelime Listesi',
    'automod.add_word': '➕ Kelime Ekle',
    'automod.remove_word': '➖ Kelime Kaldır',
    'automod.dashboard_btn': '🌐 Dashboard',
    'automod.toggle_on': 'Etkinleştir',
    'automod.toggle_off': 'Kapat',
    // Çekiliş
    'cekilis.title': '# 🎉 Çekiliş Paneli',
    'cekilis.prize': 'Ödül: {prize}',
    'cekilis.winners': 'Kazanan: {count}',
    'cekilis.hosted_by': 'Başlatan: {user}',
    'cekilis.enter_btn': '🎉 Katıl',
    'cekilis.ended': '✅ Çekiliş sona erdi',
    'cekilis.no_entries': 'Katılım yok',
    // Oyunlar
    'games.title': '# 🎮 Oyunlar',
    'games.sayi_tahmin': 'Sayı Tahmin',
    'games.adam_asmaca': 'Adam Asmaca',
    'games.kazandiran': 'Kazandıran Oyun',
    'games.start_btn': '▶️ Başlat',
    // Güven Skoru
    'guven.title': '# 🛡️ Güven Skoru',
    'guven.score': 'Skor: {score}/100',
    'guven.factors_title': 'Güven Faktörleri',
    'guven.risk_low': '🟢 Düşük Risk',
    'guven.risk_medium': '🟡 Orta Risk',
    'guven.risk_high': '🔴 Yüksek Risk',
    'guven.account_age': 'Hesap Yaşı: {days} gün',
    'guven.has_avatar': 'Avatar: {status}',
    'guven.has_badges': 'Rozetler: {badges}',
    'guven.is_bot': 'Bot: {status}',
    // Moderasyon
    'moderation.reason': 'Sebep: {reason}',
    'moderation.duration': 'Süre: {duration}',
    // Rol Paneli
    'rolepanel.created': '🎭 Rol paneli {channel} kanalında oluşturuldu',
    'rolepanel.no_pairs': 'Henüz rol-emoji eşleşmesi yok.',
    // Mağaza
    // İstatistik
    'stats.title_full': '# 📊 Sunucu İstatistikleri',
    'stats.members': 'Üyeler: {count}',
    'stats.channels': 'Kanallar: {count}',
    'stats.roles': 'Roller: {count}',
    'stats.created': 'Kuruluş Tarihi',
    'stats.owner': 'Sahip',
    // Stats ek (sabit içerik taşınan komutlar için)
    'stats.boost_level': 'Boost Seviyesi',
    'stats.boost_tier': 'Tier {tier} ({boosts} boost)',
    'stats.total': 'Toplam',
    'stats.humans': 'İnsan',
    'stats.bots': 'Bot',
    'stats.text': 'Yazı',
    'stats.voice': 'Ses',
    'stats.categories': 'Kategori',
    'stats.forums': 'Forum',
    'stats.announcements': 'Duyuru',
    'stats.stages': 'Sahne',
    'stats.threads': 'Konu',
    'stats.emojis_label': 'Emojiler',
    'stats.user_info': 'Kullanıcı Bilgisi: {user}',
    'stats.bot': 'Bot',
    'stats.joined': 'Katılım',
    'stats.account_created': 'Hesap Oluşturulma',
    'stats.roles_count_label': 'Roller [{count}]',
    'stats.id': 'ID',
    'stats.members_word': 'üye',
    'stats.none': 'Yok',
    'stats.member_not_found': 'Kullanıcı bu sunucuda bulunamadı.',
    'stats.role_distribution': 'Rol Dağılımı',
    'stats.no_roles': 'Rol yok',
    'stats.choose_category': 'Lütfen bir kategori kanalı seç.',
    'stats.chan_total_members': 'Toplam Üye',
    'stats.chan_humans': 'İnsanlar',
    'stats.chan_bots': 'Botlar',
    'stats.chan_online': 'Çevrimiçi',
    'stats.chan_boosts': 'Boostlar',
    'stats.created_in': 'İstatistik kanalları {category} kategorisinde oluşturuldu. Otomatik güncellenecek.',
    'stats.value_total': 'Toplam: {total}',
    'stats.value_humans': 'İnsan: {humans}',
    'stats.value_bots': 'Bot: {bots}',
    'stats.value_roles': 'Roller: {count}',
    'stats.value_emojis': 'Emojiler: {count}',
    // Sunucu Paneli
    'sunucu.title': '🏠 Sunucu Paneli — {guild}',
    'sunucu.stats': 'Sunucu İstatistikleri',
    'sunucu.members': 'Üyeler',
    'sunucu.channels': 'Kanallar',
    'sunucu.roles': 'Roller',
    'sunucu.emojis': 'Emojiler',
    'sunucu.owner': 'Sahip',
    // Webhook
    'webhook.title': '# 🔗 Webhook Paneli',
    // Karşılama
    'welcome.enabled': '✅ Karşılama mesajları açık',
    'welcome.disabled': '❌ Karşılama mesajları kapalı',
    // Yardım
    'yardim.title': '# 🛡️ Aegis Guard — Komut Rehberi',
    'yardim.click_category': 'Aşağıdan bir kategori seçmek için **›** butonuna tıklayın.',
    'common.only_author': '❌ Bu butonları yalnızca komutu kullanan kişi kullanabilir.',
  },

  en: {
    // General
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.enabled': 'Enabled',
    'common.disabled': 'Disabled',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.loading': 'Loading...',
    'common.error': 'An error occurred',
    'common.success': 'Success',
    'common.perms_missing': 'You don\'t have permission for this',
    'common.bot_perms_missing': 'Bot lacks required permissions',
    'common.try_again': 'Please try again',

    // Setup
    'setup.title': '🛡️ Aegis Guard — Setup Wizard',
    'setup.already_setup': '⚠️ Bot is already set up! Use `/settings` to change configuration.',
    'setup.select_package': 'Which package tier would you like to set up?',
    'setup.basic_tier': '📦 Verse — 5 log channels only',
    'setup.full_tier': '🚀 Full Setup — All channels + Premium features',
    'setup.creating': 'Setting up...',
    'setup.done': '✅ Setup complete! Log category and channels created.',
    'setup.done_desc': 'You can now use `/settings` for detailed configuration.',
    'setup.welcome_configured': '👋 Welcome message and auto-role configured.',
    'setup.ticket_configured': '🎫 Ticket system set up.',
    'setup.failed': '❌ Setup failed: {error}',

    // Kurulum (detailed)
    'kurulum.dm_sent': '📩 Sending setup guide to your DMs...',
    'kurulum.dm_sent_success': '✅ Setup guide sent to your DMs!',
    'kurulum.dm_failed': '❌ Could not send DM: {error}\n\nPlease check your DM privacy settings.',
    'kurulum.title': '# 🛡️ Aegis Guard Setup Guide\n> **Server:** {guildName}\n> **Setup status:** {setupStatus}',
    'kurulum.setup_completed': '✅ Completed',
    'kurulum.setup_pending': '⏳ Pending',
    'kurulum.section_language': '## 1️⃣ Language Setting\nChoose the language the bot will reply in.',
    'kurulum.button_tr': '🇹🇷 Turkish',
    'kurulum.button_en': '🇺🇸 English',
    'kurulum.section_channels': '## 2️⃣ Channels\nRequired channels are created automatically.\n• `#mod-logs` → Moderation logs\n• `#welcome` → New member welcome\n• `#announcements` → Announcements channel\n• `tickets/` → Ticket category',
    'kurulum.button_create_channels': '🔧 Create Channels',
    'kurulum.section_security': '## 3️⃣ Security Modules\nWhich ones would you like to enable?\n• Anti-Raid → Raid/spam prevention\n• AutoMod → Profanity/spam filter\n• Link Sandbox → Phishing link blocker',
    'kurulum.antiraid_status': '**Anti-Raid:** {status}\n**AutoMod:** {status2}\n**Link Sandbox:** {status3}',
    'kurulum.status_enabled': '✅ Enabled',
    'kurulum.status_disabled': '❌ Disabled',
    'kurulum.button_antiraid_on': '🛡️ Enable Anti-Raid',
    'kurulum.button_antiraid_off': '🛡️ Disable Anti-Raid',
    'kurulum.button_automod_on': '🤖 Enable AutoMod',
    'kurulum.button_automod_off': '🤖 Disable AutoMod',
    'kurulum.button_sandbox_on': '🔗 Enable Sandbox',
    'kurulum.button_sandbox_off': '🔗 Disable Sandbox',
    'kurulum.section_moderation': '## 4️⃣ Moderation\nCommands:\n• `/moderation @user` → Ban/Kick/Timeout/Warn/Purge\n• `/automod` → Manage banned words\n• `/killchain analyze @user` → Attack chain analysis',
    'kurulum.section_extras': '## 5️⃣ Extra Features\n• `/giveaway` → Giveaway\n• `/role-panel` → Emoji → Role select menu\n• `/trust-score @user` → Trust score calculation',
    'kurulum.section_dashboard': '## 6️⃣ Dashboard\n**betterwithaegis.com/dashboard**\n\nManage all settings visually in the dashboard:\n• Toggle security modules\n• Banned word management\n• Log channel selection\n• Role panel creation',
    'kurulum.button_dashboard': '🌐 Go to Dashboard',
    'kurulum.section_next': '## 📋 Next Steps\n1. 📌 Create channels\n2. 🛡️ Enable security modules\n3. 🌐 Customize settings in dashboard\n4. 🎮 Test it out\n\n**Need help?** Support server: discord.gg/aegisguard',
    'kurulum.footer': '🛡️ *Aegis Guard • Your Server\'s Shield*',

    // Help
    'help.title': '🛡️ Aegis Guard — Command Guide',
    'help.description': 'Type `/` in the chat box and select a command — Discord will guide you step by step.\n\n**🎯 Everyone can use:** games, info, giveaways\n**👑 Admins only:** security, moderation, setup, automation\n\nNew here? Start with the **✨ New Commands** section below — each is explained.',
    'help.new_commands': '✨ New Commands — Step by Step',
    'help.custom_cmd': '**1. /custom-command** — Add your own `!commands`.\n`/custom-command add cmd:hello reply:Hi {user}!` — now everyone typing `!hello` gets that reply. Variables: `{user}`, `{server}`.',
    'help.role_panel': '**2. /role-panel** — Click emoji to get role (e.g. 🎮→Gamer).\n`/role-panel create channel:#roles` → creates panel message.\n`/role-panel add panel-id:<msg-id> emoji:🎮 role:@Gamer` → link them.',
    'help.trust_score': '**3. /trust-score** — Calculate new member reliability (account age, avatar, badges).\n`/trust-score check @member` → shows score + risk level.',
    'help.anti_raid': '**4. /antiraid** — Opens raid protection panel (channel/role delete, mass ban, spam thresholds).',
    'help.automod': '**5. /automod** — Profanity, link, spam, caps filter + AI tone analysis.',
    'help.setup': '**6. /setup** — Set up bot in your server (log channels, welcome, tickets).',
    'help.everyone': '**For Everyone**',
    'help.admin_only': '**Admins Only**',
    'help.games': '🎮 Games',
    'help.info': 'ℹ️ Info',
    'help.security': '🛡️ Security',
    'help.moderation': '⚖️ Moderation',
    'help.automation': '⚙️ Automation',
    'help.other': '📦 Other',

    // AI Moderation
    'ai.analysis_start': '🤖 Analyzing message tone...',
    'ai.threat_detected': '⚠️ **AI Threat Detected**',
    'ai.safe': '✅ Message is safe',
    'ai.reasoning': '**AI Reasoning:** {reasoning}',
    'ai.confidence': 'Confidence: {confidence}%',
    'ai.mode_ai': '🤖 AI Analysis',
    'ai.mode_heuristic': '⚡ Heuristic Analysis',

    // Moderation actions
    'mod.user_timeout': '⏳ {user} has been timed out for {duration}',
    'mod.user_kick': '👢 {user} has been kicked',
    'mod.user_ban': '🔨 {user} has been banned',
    'mod.user_unban': '✅ {user} has been unbanned',
    'mod.user_warn': '⚠️ {user} has been warned ({count}/3)',
    'mod.user_mute': '🔇 {user} has been muted',

    // Anti-Raid
    'raid.detected': '🚨 **RAID DETECTED** in {guild}',
    'raid.channel_delete': 'Channel deletion spam detected',
    'raid.channel_create': 'Channel creation spam detected',
    'raid.role_delete': 'Role deletion spam detected',
    'raid.mass_ban': 'Mass ban detected',
    'raid.mass_kick': 'Mass kick detected',
    'raid.message_spam': 'Message spam detected',
    'raid.action_taken': 'Action taken: {action}',
    'raid.raider_timeout': 'Raider timed out: {user}',

    // Ticket
    'ticket.created': '🎫 Ticket created: {id}',
    'ticket.closed': '🎫 Ticket #{id} closed by {user}',
    'ticket.transcript_saved': '📝 Transcript saved to {channel}',


    // AutoMod
    'automod.enabled': '✅ AutoMod enabled',
    'automod.disabled': '❌ AutoMod disabled',
    'automod.profanity_blocked': '🚫 Profanity blocked from {user}',
    'automod.link_blocked': '🔗 Link blocked from {user}',
    'automod.spam_blocked': '📨 Spam blocked from {user}',
    'automod.caps_blocked': '🔠 Excessive caps blocked from {user}',
    'automod.invite_blocked': '🚫 Invite link blocked from {user}',

    // Welcome
    'welcome.configured': '👋 Welcome message configured for {channel}',
    'welcome.enabled': '✅ Welcome messages enabled',
    'welcome.disabled': '❌ Welcome messages disabled',
    'welcome.message': 'Welcome to **{server}**, {user}! 🎉',

    // Role Panel
    'rolepanel.created': '🎭 Role panel created in {channel}',
    'rolepanel.added': '✅ Role {role} added to panel with emoji {emoji}',
    'rolepanel.removed': '🗑️ Role removed from panel',

    // Ticket
    'ticket.settings_configured': '✅ **Ticket Ayarları Yapılandırıldı**\n• Kategori: {category}\n• Yetkili Rolü: {staffRole}\n• Log Kanalı: {logChannel}',
    'ticket.config_missing': '❌ **Yapılandırma Eksik**\nÖnce `/ticket` komutunun Kurulum sekmesinde kategori, yetkili rolü ve log kanalı ayarlayın.',
    'ticket.panel_title': '# 🎫 Destek Ticketları\n\nAşağıdaki butona tıklayarak özel bir destek **ticket** oluşturun.\nEkibimiz en kısa sürede size yardımcı olacaktır.',
    'ticket.panel_desc': '**Nasıl çalışır:**\n• "Ticket Oluştur" butonuna tıklayarak özel kanal açın\n• Sadece siz ve yetkililer tiketi görebilir\n• Çözüldüğünde kapat butonunu kullanın',
    'ticket.open_ticket': '**Aşağıdaki butona tıklayarak **ticket** açın:**',
    'ticket.panel_created': '✅ **Ticket Paneli Oluşturuldu**\nPanel bu kanala gönderildi.',
    'ticket.button_create': '🎫 **Ticket** Oluştur',
    'ticket.button_close': '🔒 **Ticket** Kapat',
    'ticket.close_button_desc': '**Ticket**ı kapatmak için aşağıdaki butona basın:**',
    'ticket.already_open': '❌ Zaten açık bir **ticket**ın var! {channel}',
    'ticket.creation_failed': '❌ Ticket kanalı oluşturulamadı!',
    'ticket.created': '✅ Ticket oluşturuldu! {channel}',
    'ticket.new_ticket': '## 🎫 **{ticketId}**\nYeni destek **ticket**ı oluşturuldu!',
    'ticket.ticket_owner': '**Ticket** Sahibi',
    'ticket.staff_team': 'Destek Ekibi',
    'ticket.staff_will_help': 'Bir yetkili en kısa sürede yardımcı olacak.',
    'ticket.describe_issue': '### 💬 **Sorununuzu aşağıya yazın**\nDestek ekibi **ticket**ı gördüğünde yanıtlayacak.',
    'ticket.not_a_ticket': '❌ Bu kanal bir **ticket** değil!',
    'ticket.no_permission_close': '❌ Bu **ticket**ı kapatma yetkin yok! Sadece yetkililer/adminler kapatabilir.',
    'ticket.transcript_title': '# 📋 **Ticket** Transcript — {ticketId}',
    'ticket.transcript_info': '**Açan:** {opener} ({openerTag})\n**Kapatan:** {closer}\n**Açılış:** {opened}\n**Kapanış:** {closed}\n**Mesaj Sayısı:** {count}',
    'ticket.transcript_recent': '**Son Mesajlar:**',
    'ticket.closed': '# 🔒 Ticket Kapatıldı',
    'ticket.closed_info': 'Bu **ticket** {closer} tarafından kapatıldı.',
    'ticket.transcript_saved_delete': 'Transcript log kanalına kaydedildi. **Ticket** kanalı **10 saniye** içinde silinecek.',


    // Stats
    'stats.title': '📊 Server Statistics',
    'stats.members': 'Members: **{count}**',
    'stats.bots': 'Bots: **{count}**',
    'stats.channels': 'Channels: **{count}**',
    'stats.roles': 'Roles: **{count}**',
    'stats.boosts': 'Boosts: **{count}**',

    // Package
    'pkg.title': '📦 Aegis Pro Packages',
    'pkg.trial': '🎁 14-day free trial — no card required',
    'pkg.select': 'Select Package',
    'pkg.selected': '📦 Selected package: **{pkg}**',
    'pkg.trial_remaining': '🎁 Free trial: **{days} days** left',
    'pkg.trial_expired': '⏳ Trial expired. Pick a package to continue.',
    'pkg.order_prompt': 'Which server do you want to add this package to? Paste the server invite link:',
    'pkg.order_sent': '✅ Order received! Our team will approve via Discord within hours.',
    'pkg.order_error': '❌ Failed to create order, please try again.',

    // Ticket
    'ticket.settings_configured': '✅ **Ticket Settings Configured**\n• Category: {category}\n• Staff Role: {staffRole}\n• Log Channel: {logChannel}',
    'ticket.config_missing': '❌ **Configuration Missing**\nOpen `/ticket` and use the Setup tab to set the category, staff role and log channel first.',
    'ticket.panel_title': '# 🎫 Support Tickets\n\nClick the button below to create a private support ticket.\nOur staff will assist you shortly.',
    'ticket.panel_desc': '**How it works:**\n• Click "Create Ticket" to open a private channel\n• Only you and staff can see the ticket\n• Use the close button when resolved',
    'ticket.open_ticket': '**Click the button below to open a ticket:**',
    'ticket.panel_created': '✅ **Ticket Panel Created**\nPanel sent to this channel.',
    'ticket.button_create': '🎫 Create Ticket',
    'ticket.button_close': '🔒 Close Ticket',
    'ticket.close_button_desc': '**Click the button below to close the ticket:**',
    'ticket.already_open': '❌ You already have an open ticket! {channel}',
    'ticket.creation_failed': '❌ Failed to create ticket channel!',
    'ticket.created': '✅ Ticket created! {channel}',
    'ticket.new_ticket': '## 🎫 **{ticketId}**\nNew support ticket created!',
    'ticket.ticket_owner': 'Ticket Owner',
    'ticket.staff_team': 'Staff Team',
    'ticket.staff_will_help': 'A staff member will assist you shortly.',
    'ticket.describe_issue': '### 💬 **Describe your issue below**\nStaff will respond when they see it.',
    'ticket.not_a_ticket': '❌ This channel is not a ticket!',
    'ticket.no_permission_close': '❌ You don\'t have permission to close this ticket! Only staff/admins can close.',
    'ticket.transcript_title': '# 📋 **Ticket** Transcript — {ticketId}',
    'ticket.transcript_info': '**Opened by:** {opener} ({openerTag})\n**Closed by:** {closer}\n**Opened:** {opened}\n**Closed:** {closed}\n**Message Count:** {count}',
    'ticket.transcript_recent': '**Recent Messages:**',
    'ticket.closed': '# 🔒 Ticket Closed',
    'ticket.closed_info': 'This ticket was closed by {closer}.',
    'ticket.transcript_saved_delete': 'Transcript saved to log channel. Channel will be deleted in **10 seconds**.',


    // Language
    'lang.current': 'Current language: **English**',
    'lang.changed': '✅ Language changed to **{lang}**!',
    'lang.changed_tr': '✅ Language changed to **Turkish**!',
    'lang.select': 'Select language:',
    'lang.en_notice': '🇬🇧 **English version enabled** — Prefix commands use `a.` for all languages.\nExample: `a.help`, `a.setup`, `a.ping`\n\nSlash commands (`/`) still work normally.\n\n**Available commands:**\n{cmds}',

    // Prefix commands
    'prefix.help': '📚 **Aegis Guard — Command Guide**\n\n**Everyone:** `a.help`, `a.ping`, `a.giveaway`, `a.poll`\n**Admins:** `a.setup`, `a.settings`, `a.automod`, `a.antiraid`, `a.moderation`, `a.ticket`, `a.welcome`, `a.rolepanel`\n\nUse `a.help <command>` for details.\n\n💡 *Slash commands (`/`) also work if you prefer.*',
    'prefix.help.owner': '👑 **Owner-Only Commands**\n\n`a.siparis-listele` — List pending orders\n`a.siparis-onayla <id>` — Approve order\n`a.siparis-reddet <id>` — Reject order\n\n`a.restart` — Restart bot (PM2)\n`a.reload` — Reload slash commands\n`a.deploy` — Trigger auto-deploy\n\n`a.db <key>` — View database value\n`a.eval <code>` — Evaluate JavaScript (DANGEROUS)\n\n*Only bot owners can use these commands.*',
    'prefix.ping': '🏓 Pong! WS: {ws}ms | REST: {rest}ms',
    'prefix.setup': 'Use `/setup` slash command for guided setup.',
    'prefix.settings': 'Use `/settings` slash command for settings.',

    // Errors
    'error.guild_only': 'This command only works in servers',
    'error.dm_only': 'This command only works in DMs',
    'error.nsfw_only': 'This command only works in NSFW channels',
    'error.owner_only': 'This command can only be used by the bot owner',
    'error.cooldown': 'You must wait {time} seconds before using this command again',
    'error.missing_args': 'Missing argument: {args}',
    'error.invalid_args': 'Invalid argument: {args}',

    // Anti-Raid
    'antiraid.title': '# 🛡️ Anti-Raid Protection {status}',
    'antiraid.status_enabled': '🟢 ENABLED',
    'antiraid.status_disabled': '🔴 DISABLED',
    'antiraid.status_active': '✅ Active - Blocking suspicious activity',
    'antiraid.status_inactive': '❌ Inactive - Protection off',
    'antiraid.thresholds_title': '**Thresholds:**',
    'antiraid.channel_delete': '• Channel Delete: {count} / {window}s',
    'antiraid.channel_create': '• Channel Create: {count} / {window}s',
    'antiraid.role_delete': '• Role Delete: {count} / {window}s',
    'antiraid.role_create': '• Role Create: {count} / {window}s',
    'antiraid.ban_threshold': '• Ban: {count} / {window}s',
    'antiraid.kick_threshold': '• Kick: {count} / {window}s',
    'antiraid.action': '**Action:** {action}',
    'antiraid.punish_duration': '**Punishment Duration:** {duration}',
    'antiraid.log_channel': '**Log Channel:** {channel}',
    'antiraid.no_log_channel': 'Not set',
    'antiraid.toggle_on': '🟢 Enable',
    'antiraid.toggle_off': '🔴 Disable',
    'antiraid.config_btn': '⚙️ Configure Thresholds',
    'antiraid.dashboard_btn': '🌐 Manage in Dashboard',
    'antiraid.whitelist_btn': '👥 Whitelist',
    'antiraid.blacklist_btn': '🚫 Blacklist',

    // Anti-Nuke
    'antinuke.title': '# 💣 Anti-Nuke Protection',
    'antinuke.enabled': '✅ Anti-Nuke active',
    'antinuke.disabled': '❌ Anti-Nuke disabled',
    'antinuke.threshold': '**Threshold:** {count} actions / {window}s',
    'antinuke.punishment': '**Punishment:** {punishment}',
    'antinuke.whitelist': '**Whitelist:** {count} members',
    'antinuke.toggle_on': '🟢 Enable',
    'antinuke.toggle_off': '🔴 Disable',
    'antinuke.config_btn': '⚙️ Configure',
    'antinuke.dashboard_btn': '🌐 Dashboard',

    // Automod
    'automod.title': '# 🤖 AutoMod Panel',
    'automod.enabled': '✅ AutoMod active',
    'automod.disabled': '❌ AutoMod disabled',
    'automod.profanity': '🤬 Profanity Filter',
    'automod.links': '🔗 Link Filter',
    'automod.spam': '📨 Spam Filter',
    'automod.caps': '🔠 Caps Lock Filter',
    'automod.invites': '🚫 Invite Link Filter',
    'automod.ai_tone': '🧠 AI Tone Analysis',
    'automod.toggle_on': 'Enable',
    'automod.toggle_off': 'Disable',
    'automod.word_list': '📝 Word List',
    'automod.add_word': '➕ Add Word',
    'automod.remove_word': '➖ Remove Word',
    'automod.dashboard_btn': '🌐 Dashboard',

    // Çekiliş
    'cekilis.title': '# 🎉 Giveaway Panel',
    'cekilis.create': 'Create Giveaway',
    'cekilis.list': 'Active Giveaways',
    'cekilis.end': 'End Giveaway',
    'cekilis.reroll': 'Reroll',
    'cekilis.prize': 'Prize: {prize}',
    'cekilis.winners': 'Winners: {count}',
    'cekilis.duration': 'Duration: {duration}',
    'cekilis.hosted_by': 'Hosted by: {user}',
    'cekilis.enter_btn': '🎉 Enter',
    'cekilis.ended': '✅ Giveaway ended',
    'cekilis.no_entries': 'No entries',


    // Games
    'games.title': '# 🎮 Games',
    'games.sayi_tahmin': 'Number Guess',
    'games.adam_asmaca': 'Hangman',
    'games.kazandiran': 'Winner Game',
    'games.start_btn': '▶️ Start',
    'games.stop_btn': '⏹️ Stop',

    // Güven Skoru
    'guven.title': '# 🛡️ Trust Score',
    'guven.check': 'User Analysis',
    'guven.score': 'Score: {score}/100',
    'guven.risk_low': '🟢 Low Risk',
    'guven.risk_medium': '🟡 Medium Risk',
    'guven.risk_high': '🔴 High Risk',
    'guven.account_age': 'Account Age: {days} days',
    'guven.has_avatar': 'Avatar: {status}',
    'guven.has_badges': 'Badges: {badges}',
    'guven.is_bot': 'Bot: {status}',

    // Moderasyon
    'moderation.title': '# ⚖️ Moderation Panel',
    'moderation.ban': '🔨 Ban',
    'moderation.kick': '👢 Kick',
    'moderation.timeout': '⏱️ Timeout',
    'moderation.warn': '⚠️ Warn',
    'moderation.purge': '🗑️ Purge',
    'moderation.unban': '🔓 Unban',
    'moderation.unwarn': '✅ Remove Warn',
    'moderation.reason': 'Reason: {reason}',
    'moderation.duration': 'Duration: {duration}',

    // Otomasyon
    'otomasyon.title': '# ⚙️ Automation Panel',
    'otomasyon.welcome': '👋 Welcome',
    'otomasyon.autorole': '🎭 Auto Role',
    'otomasyon.leave': '👋 Leave Message',
    'otomasyon.boost': '💎 Boost Message',
    'otomasyon.welcome_channel': 'Channel: {channel}',
    'otomasyon.welcome_msg': 'Message: {message}',
    'otomasyon.autorole_role': 'Role: {role}',
    'otomasyon.save_btn': '💾 Save',

    // Özel Komut
    'ozelkomut.title': '# 📝 Custom Commands',
    'ozelkomut.add': '➕ Add',
    'ozelkomut.remove': '➖ Remove',
    'ozelkomut.list': '📋 List',
    'ozelkomut.cmd_name': 'Command: {name}',
    'ozelkomut.cmd_reply': 'Reply: {reply}',
    'ozelkomut.no_commands': 'No custom commands yet',

    // Paket
    'paket.title': '# 📦 Packages',
    'paket.basic': '📦 Verse',
    'paket.pro': '🚀 Pro (Full Setup)',
    'paket.trial': '🎁 14 Day Trial',
    'paket.select_btn': 'Select',
    'paket.current': 'Current: {package}',

    // Rol Panel
    'rolpanel.title': '# 🎭 Role Panel',
    'rolpanel.create': 'Create',
    'rolpanel.add': 'Add Role',
    'rolpanel.remove': 'Remove Role',
    'rolpanel.list': 'List Panels',
    'rolpanel.channel': 'Channel: {channel}',
    'rolpanel.emoji_role': '{emoji} → {role}',
    'rolpanel.no_panels': 'No panels yet',

    // Rules
    'rules.title': '# 📜 Rules',
    'rules.create': 'Create',
    'rules.edit': 'Edit',
    'rules.delete': 'Delete',
    'rules.accept_btn': '✅ Accept',
    'rules.accepted': 'You accepted the rules!',
    'rules.channel': 'Channel: {channel}',

    // Şablon
    'sablon.title': '# 🏗️ Server Templates',
    'sablon.create': 'Create Template',
    'sablon.apply': 'Apply Template',
    'sablon.list': 'Templates',
    'sablon.name': 'Name: {name}',
    'sablon.desc': 'Description: {desc}',

    // Setup
    'setup.title_full': '# 🛡️ Aegis Guard — Setup',
    'setup.select_tier': 'Select Package Tier',
    'setup.basic': 'Basic (5 log channels)',
    'setup.full': 'Full (All channels)',
    'setup.creating': 'Setting up...',
    'setup.done': '✅ Setup complete!',

    // Shop Panel

    // Stats
    'stats.title_full': '# 📊 Server Statistics',
    'stats.members': 'Members: {count}',
    'stats.bots': 'Bots: {count}',
    'stats.channels': 'Channels: {count}',
    'stats.roles': 'Roles: {count}',
    'stats.boosts': 'Boosts: {count}',
    'stats.created': 'Created: {date}',
    'stats.owner': 'Owner: {owner}',
    // Stats extra (migrated hardcoded content)
    'stats.boost_level': 'Boost Level',
    'stats.boost_tier': 'Tier {tier} ({boosts} boosts)',
    'stats.total': 'Total',
    'stats.humans': 'Humans',
    'stats.bots': 'Bots',
    'stats.text': 'Text',
    'stats.voice': 'Voice',
    'stats.categories': 'Categories',
    'stats.forums': 'Forums',
    'stats.announcements': 'Announcements',
    'stats.stages': 'Stages',
    'stats.threads': 'Threads',
    'stats.emojis_label': 'Emojis',
    'stats.user_info': 'User Info: {user}',
    'stats.bot': 'Bot',
    'stats.joined': 'Joined',
    'stats.account_created': 'Account Created',
    'stats.roles_count_label': 'Roles [{count}]',
    'stats.id': 'ID',
    'stats.members_word': 'members',
    'stats.none': 'None',
    'stats.member_not_found': 'Member not found in this server.',
    'stats.role_distribution': 'Role Distribution',
    'stats.no_roles': 'No roles',
    'stats.choose_category': 'Please select a category channel.',
    'stats.chan_total_members': 'Total Members',
    'stats.chan_humans': 'Humans',
    'stats.chan_bots': 'Bots',
    'stats.chan_online': 'Online',
    'stats.chan_boosts': 'Boosts',
    'stats.created_in': 'Stats channels created in {category}! They will update automatically.',
    'stats.value_total': 'Total: {total}',
    'stats.value_humans': 'Humans: {humans}',
    'stats.value_bots': 'Bots: {bots}',
    'stats.value_roles': 'Roles: {count}',
    'stats.value_emojis': 'Emojis: {count}',

    // Sunucu Paneli
    'sunucupanel.title': '# 🏠 Server Panel',
    'sunucupanel.overview': 'Overview',
    'sunucupanel.security': 'Security',
    'sunucupanel.moderation': 'Moderation',
    'sunucupanel.settings': 'Settings',

    // Ticket AI
    'ticketai.title': '# 🤖 Ticket AI Assistant',
    'ticketai.enabled': '✅ AI Assistant active',
    'ticketai.disabled': '❌ AI Assistant disabled',
    'ticketai.limit': 'Daily Limit: {limit}',
    'ticketai.model': 'Model: {model}',
    'ticketai.toggle_on': 'Enable',
    'ticketai.toggle_off': 'Disable',

    // Time Capsule
    'timecapsule.title': '# ⏰ Time Capsule',
    'timecapsule.create': 'Create',
    'timecapsule.list': 'My Capsules',
    'timecapsule.open': 'Open',
    'timecapsule.message': 'Message: {message}',
    'timecapsule.open_date': 'Opens: {date}',
    'timecapsule.no_capsules': 'No capsules yet',

    // Webhook Panel
    'webhook.title': '# 🔗 Webhook Panel',
    'webhook.create': 'Create',
    'webhook.edit': 'Edit',
    'webhook.delete': 'Delete',
    'webhook.test': 'Test',
    'webhook.list': 'Webhooks',
    'webhook.name': 'Name: {name}',
    'webhook.channel': 'Channel: {channel}',
    'webhook.url': 'URL: {url}',
    'webhook.no_webhooks': 'No webhooks yet',

    // Yardım
    'yardim.title': '# 🛡️ Aegis Guard — Command Guide',
    'yardim.description': 'Type `/` in chat and select a command — Discord guides you.',
    'yardim.categories': '**Categories:**',
    'yardim.everyone': '🎯 Everyone',
    'yardim.admin': '👑 Admin',
    'yardim.owner': '👑 Owner',
    'yardim.prefix_note': '> **Prefix commands:** `a.help` | `a.ping`\n> **Prefix only:** `a.help owner` (bot owner)',

    // ─── EN için doldurulan eksik anahtarlar (TR'de zaten vardı) ───
    // Anket
    'anket.title': '📊 Poll',
    'anket.invalid_options': 'Poll must have {min}-{max} options.',
    'anket.invalid_duration': 'Invalid duration. Format: 30m, 2h, 1d (10s - 7d).',
    'anket.zero_votes': '0 votes',
    'anket.footer': 'Created by {author} | Ends in {duration}',
    'anket.created': 'Poll created in {channel}!',
    // Arabuluculuk
    'arabuluculuk.owner_only': '❌ This command can only be used by the bot owner.',
    // Changelog
    'changelog.date': 'Date',
    'changelog.type': 'Type',
    // Common
    'common.prev': '◀ Previous',
    'common.next': 'Next ▶',
    'common.back': '← Back',
    'common.unknown': 'Unknown',
    'common.only_author': '❌ Only the user who ran the command can use these buttons.',
    // Güven Skoru
    'guven.factors_title': 'Trust Factors',
    // Rol Paneli
    'rolepanel.no_pairs': 'No role-emoji pairs yet.',
    // Rules
    'rules.accept': '✅ I Accept',
    'rules.created': '# ✅ Rules Bot Set Up!',
    'rules.description': 'Welcome to our server! Read the rules below and accept them to gain access to the chat channels.\n\n1️⃣ Be respectful, no profanity/slurs/harassment\n2️⃣ No spam/advertising/link sharing (unless permitted)\n3️⃣ No off-topic/inappropriate discussions\n4️⃣ Respect staff, follow their instructions\n5️⃣ Account sharing/stolen accounts are forbidden\n6️⃣ Illegal content/sharing is strictly forbidden',
    'rules.footer': '*Aegis Guard • Rules Bot*',
    // Sunucu Paneli
    'sunucu.title': '🏠 Server Panel — {guild}',
    'sunucu.stats': 'Server Statistics',
    'sunucu.members': 'Members',
    'sunucu.channels': 'Channels',
    'sunucu.roles': 'Roles',
    'sunucu.emojis': 'Emojis',
    'sunucu.owner': 'Owner',
    // Ticket AI
        // Ticket AI extra
    'ticket_ai.limit_exceeded': '⚠️ Daily limit reached ({usage}/{limit}).',
    'rules.configured': '**Channel:** {channel}\n**Role:** {role}\n\nWhen users visit {channel} and click "I Accept", they will receive the {role} role.',
    'ticket_ai.test_title': '# 🤖 AI Ticket Assistant Test',
    'ticket_ai.question': '**Question:** {question}',
    'ticket_ai.answer': '**Answer:**\n{answer}',
    'ticket_ai.powered_by': '*Powered by Gemini 3.6 Flash*',
    // Yardım
    'yardim.click_category': 'Click **›** below to choose a category.',
  },
};

// ─── Desteklenen diller (Discord'u en çok kullanan ülkelerin dilleri) ────────
// Yerel adlar: /language komutunun otomatik tamamlamasında kullanılır.
const LOCALES = {
  tr: 'Türkçe', en: 'English', 'pt-BR': 'Português (Brasil)', ru: 'Русский', es: 'Español',
  fr: 'Français', de: 'Deutsch', ja: '日本語', ko: '한국어', pl: 'Polski',
  it: 'Italiano', nl: 'Nederlands', id: 'Bahasa Indonesia', ar: 'العربية', hi: 'हिन्दी',
  vi: 'Tiếng Việt', th: 'ไทย', uk: 'Українська', cs: 'Čeština', ro: 'Română',
  sv: 'Svenska', hu: 'Magyar', el: 'Ελληνικά', bg: 'Български', fi: 'Suomi',
  da: 'Dansk', no: 'Norsk', he: 'עברית', 'zh-CN': '简体中文', fil: 'Filipino',
};

// Dil dosyalarını diskten oku (locales/<kod>.json). Eksik anahtarlar İngilizce'ye düşer.
function loadLocaleFile(locale) {
  const filePath = path.join(__dirname, '..', 'locales', `${locale}.json`);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      console.error(`[i18n] ${locale}.json okunamadı:`, e.message);
    }
  }
  return {};
}

for (const code of Object.keys(LOCALES)) {
  const overrides = loadLocaleFile(code);
  I18N[code] = { ...(I18N[code] || {}), ...overrides };
}

/**
 * @param {string} guildId - Sunucu ID'si
 * @returns {Function} t(key, vars) fonksiyonu
 * Anahtar çözümü: sunucu dili -> İngilizce -> Türkçe -> anahtarın kendisi.
 */
function createTranslator(guildId) {
  const settings = (guildId && readDB()[guildId]) || {};
  const locale = LOCALES[settings.language] ? settings.language : 'tr';
  const dict = I18N[locale] || I18N.tr;

  return function t(key, vars = {}) {
    let str = dict[key];
    if (!str) {
      if (locale === 'tr') str = I18N.tr[key] || I18N.en[key] || key;
      else str = I18N.en[key] || I18N.tr[key] || key;
    }
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return str;
  };
}

/**
 * Sunucunun gerçek dil kodunu al (30 dilden biri).
 */
function getGuildLocale(guildId) {
  const settings = (guildId && readDB()[guildId]) || {};
  return LOCALES[settings.language] ? settings.language : 'tr';
}

/**
 * Eski kodla uyumluluk: Türkçe değilse 'en' döner. `isEn` kontrolü yapan eski komutlar
 * yeni dillerde İngilizce'ye düşer; t() kullanan yerler gerçek dilde görünür.
 * @returns {'tr'|'en'}
 */
function getGuildLanguage(guildId) {
  return getGuildLocale(guildId) === 'tr' ? 'tr' : 'en';
}

/**
 * Dil kodunu / adını normalize et ("pt-br", "Deutsch", "turkce" ...). Bulunamazsa null.
 */
function resolveLocale(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const lower = raw.toLowerCase();
  const aliases = { eng: 'en', english: 'en', ingilizce: 'en', tur: 'tr', turkce: 'tr', 'türkçe': 'tr', turkish: 'tr', pt: 'pt-BR', 'pt-br': 'pt-BR', zh: 'zh-CN', 'zh-cn': 'zh-CN', nb: 'no', tl: 'fil' };
  if (aliases[lower]) return aliases[lower];
  for (const [code, name] of Object.entries(LOCALES)) {
    if (code.toLowerCase() === lower || name.toLowerCase() === lower) return code;
  }
  return null;
}

/**
 * Sunucu dilini değiştir
 * @returns {string} uygulanan dil kodu
 */
function setGuildLanguage(guildId, locale) {
  const { updateGuild } = require('./database');
  const resolved = resolveLocale(locale) || 'tr';
  updateGuild(guildId, { language: resolved });
  return resolved;
}

module.exports = {
  I18N,
  LOCALES,
  createTranslator,
  getGuildLanguage,
  getGuildLocale,
  resolveLocale,
  setGuildLanguage,
};
