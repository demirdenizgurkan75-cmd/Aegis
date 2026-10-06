/**
 * Türkçe sabit metinlerin İngilizce karşılıkları (utils/outputLocalizer.js bunu İngilizce sunucularda uygular).
 * EXACT: tüm metin bu değere eşitse (buton etiketi gibi kısa metinler). FRAGMENTS: metnin içinde geçen sabit parçalar
 * (değişken kısımlar olduğu gibi kalır). REGEX: değişkenin cümlenin ortasında kaldığı kalıplar.
 * Yeni bir Türkçe metin eklenirse ve İngilizce sunucuda Türkçe görünürse buraya karşılığını ekle.
 */
const EXACT = {
  'Başa Sar': 'Restart', 'Devam Et': 'Resume', 'Duraklat': 'Pause', 'Geç': 'Skip', 'Durdur': 'Stop',
  'Döngü: Şarkı': 'Loop: Song', 'Döngü: Kuyruk': 'Loop: Queue', 'Döngü: Kapalı': 'Loop: Off',
  'Karıştır': 'Shuffle', 'Kuyruk': 'Queue', 'Sözler': 'Lyrics',
};

const FRAGMENTS = {
  // ── Müzik: kaynaklar ve filtreler ──
  'Canlı Radyo': 'Live Radio', 'Dosya / Akış': 'File / Stream', 'Ses Dosyası': 'Audio File',
  'Bilinmeyen Şarkı': 'Unknown Song', 'Bilinmeyen Sanatçı': 'Unknown Artist', 'Bilinmiyor': 'Unknown',
  'Spotify Çalma Listesi': 'Spotify Playlist', 'Yüklenen MP3 Dosyası': 'Uploaded MP3 File', 'MP3 Dosyası': 'MP3 File',
  'Doğrudan Bağlantı': 'Direct Link', 'Spotify Eşleşmesi': 'Spotify Match', 'YouTube / Çevrimiçi': 'YouTube / Online',
  'Bassboost (Güçlü Bas)': 'Bassboost (Heavy Bass)', 'Nightcore (Hızlı & Tiz)': 'Nightcore (Fast & High)', '8D Audio (Dönen Stereo)': '8D Audio (Rotating Stereo)',
  'Derin ve güçlü bas deneyimi': 'Deep, powerful bass', 'Yüksek tempo ve tiz ses tonu': 'Fast tempo and a high-pitched tone',
  'Yavaşlatılmış, yankılı atmosferik ses': 'Slowed, reverbed atmospheric sound', 'Kulaklıkta 360 derece dönen stereo ses': 'Stereo sound that rotates 360° in headphones',
  'Nostaljik lo-fi yavaş ton': 'Nostalgic slow lo-fi tone', 'Ana vokali filtreleyip enstrümanı öne çıkarır': 'Filters out the lead vocal and brings the instrumental forward',
  // ── Müzik: oynatıcı ──
  '`Kapalı`': '`Off`', 'Tekrar: Şarkı': 'Repeat: Song', 'Tekrar: Kuyruk': 'Repeat: Queue',
  ' şarkı bekliyor': ' songs waiting', 'Sırada şarkı yok': 'No songs in the queue',
  '**Süre:**': '**Duration:**', '**İsteyen:**': '**Requested by:**', '**Kaynak:**': '**Source:**', '**Ses:**': '**Volume:**', '**Döngü:**': '**Loop:**', '**Kuyruk:**': '**Queue:**',
  '## ➕ Şarkı Kuyruğa Eklendi': '## ➕ Added to Queue', '**Kuyruk Sırası:**': '**Queue Position:**',
  '## 📜 Aegis Music — Şarkı Kuyruğu': '## 📜 Aegis Music — Song Queue', '**▶️ Şu An Çalıyor:**': '**▶️ Now Playing:**',
  '⏱️ Süre:': '⏱️ Duration:', ' | İsteyen:': ' | Requested by:', '**📋 Sıradaki Şarkılar (': '**📋 Up Next (',
  '*...ve ': '*...and ', ' şarkı daha*': ' more songs*', '*Sırada bekleyen başka şarkı bulunmuyor.*': '*There are no other songs waiting in the queue.*',
  '**Sanatçı:**': '**Artist:**', '🌐 Kaynak:': '🌐 Source:', '*(Sözler uzun olduğu için kısaltıldı)*': '*(Lyrics were shortened because they are long)*',
  '⚠️ Oynatma Hatası': '⚠️ Playback Error', 'Çalma sırasında bir hata oluştu:': 'An error occurred while playing:',
  '📭 Kuyruk Tamamlandı': '📭 Queue Finished',
  'Kuyruktaki tüm şarkılar bitti. 3 dakika içinde yeni şarkı gelmezse kanaldan ayrılacağım.': 'All songs in the queue have finished. If no new song arrives within 3 minutes I will leave the channel.',
  '❌ Ses Bağlantı Hatası': '❌ Voice Connection Error', 'Ses kanalına bağlanılamadı:': 'Could not connect to the voice channel:',
  'Botun kanala katılma ve konuşma izinlerini kontrol edin.': "Check the bot's permission to join and speak in the channel.",
  '❌ Başlatılamadı': '❌ Could Not Start', 'Şarkı başlatılamadı:': 'Could not start the song:',
  '❌ Ses Kanalı Gerekli': '❌ Voice Channel Required',
  'Müziği yönetmek için bir ses kanalında olmalısın. (Yöneticiler `/music` ile **uzaktan kumandayı** açabilir.)': 'You need to be in a voice channel to control the music. (Admins can turn on the **remote** with `/music`.)',
  'Müzik çalmak için önce bir **ses kanalına** katılmalısın!': 'Join a **voice channel** first to play music!',
  'Geçersiz şarkı sırası': 'Invalid queue position', 'Şu an aktif müzik yok': 'No music is active right now',
  'Şu an aktif bir müzik oturumu bulunmuyor.': 'There is no active music session right now.', '🎛️ Ses Filtresi Güncellendi': '🎛️ Audio Filter Updated', '🎛️ Ses Filtresi': '🎛️ Audio Filter',
  'Geçersiz filtre! Kullanabileceğin filtreler:': 'Invalid filter! Available filters:', '❌ Geçersiz Filtre': '❌ Invalid Filter', 'Kullanabileceğin filtreler:': 'Available filters:',
  ' filtresi uygulandı!': ' filter applied!', ' uygulandı!': ' applied!', 'Filtre: ': 'Filter: ',
  'Sunucuda uygun bir ses kanalı bulunamadı!': 'No suitable voice channel was found in the server!',
  'Botun ses kanalına bağlanma veya konuşma yetkisi yok!': 'The bot has no permission to connect or speak in the voice channel!',
  ' şarkı) eklendi!': ' songs) added!', 'Şarkı bulunamadı veya oynatılamadı!': 'Song not found or could not be played!',
  'hemen oynatılıyor...': 'is playing right now...', 'kuyruğa eklendi': 'was added to the queue', 'çalınmaya başlandı': 'started playing',
  'Bu ses kanalına bağlanmak veya konuşmak için yeterli yetkim yok! (Kanalı görüntüleme, bağlanma veya konuşma izni eksik)': 'I do not have enough permission to connect or speak in this voice channel! (Missing View Channel, Connect or Speak)',
  '❌ Yetki Yetersiz': '❌ Not Enough Permission', '❌ Spotify Listesi Boş': '❌ Spotify List Is Empty', 'Çalma listesinde parça bulunamadı.': 'No tracks were found in the playlist.',
  'Albümü': 'Album', '** listesinden **': '** — queuing **', '** şarkı sıraya alınıyor...': '** songs...', '▶️ İlk şarkı:': '▶️ First song:',
  '❌ Şarkı Bulunamadı': '❌ Song Not Found',
  'Şarkı bulunamadı veya oynatılamadı. Lütfen başka bir şarkı adı, Spotify bağlantısı ya da geçerli bir MP3 dosyası dene!': 'The song was not found or could not be played. Try another song name, a Spotify link or a valid MP3 file!',
  '🔍 Şarkı Başlatılıyor': '🔍 Starting Song', ' bulundu ve ses kanalına bağlanılıyor...': ' was found, connecting to the voice channel...',
  'Şu an çalan bir müzik yok.': 'No music is playing right now.', '⏹️ Müzik Durduruldu': '⏹️ Music Stopped', 'Müzik durduruldu ve ses kanalından ayrıldım.': 'Music stopped and I left the voice channel.',
  'Şu an geçilecek bir müzik yok.': 'There is nothing to skip right now.', '⏭️ Şarkı Geçildi': '⏭️ Song Skipped', '⏭️ Şarkı Geç': '⏭️ Skip Song', ' geçildi!': ' was skipped!',
  '⏸️ Müzik Duraklatıldı': '⏸️ Music Paused', '⏸️ Duraklat': '⏸️ Pause', 'Müzik zaten duraklatılmış durumda.': 'Music is already paused.', 'Müzik duraklatıldı.': 'Music paused.',
  '▶️ Müzik Devam Ediyor': '▶️ Music Resumed', '▶️ Devam Et': '▶️ Resume', 'Müzik zaten çalıyor.': 'Music is already playing.', 'Müzik devam ediyor.': 'Music resumed.', 'Müzik çalmaya devam ediyor.': 'Music keeps playing.',
  'Şu an aktif bir müzik oturumu yok.': 'There is no active music session right now.',
  'Kuyrukta karıştırılacak en az 2 şarkı olmalıdır.': 'The queue needs at least 2 songs to shuffle.', 'Kuyrukta şarkı bulunmuyor.': 'There are no songs in the queue.',
  '📜 Şarkı Kuyruğu': '📜 Song Queue', 'Kuyrukta herhangi bir şarkı bulunmuyor.': 'There are no songs in the queue.',
  '❌ Şarkı Belirtilmedi': '❌ No Song Given', 'Lütfen bir şarkı adı girin veya ses kanalında bir şarkı çalarken bu komutu kullanın!': 'Enter a song name or use this command while a song is playing in the voice channel!', 'Örnek:': 'Example:',
  '🔍 Şarkı Sözü Bulunamadı': '🔍 Lyrics Not Found', ' için şarkı sözü bulunamadı.': ': no lyrics were found.', 'Lütfen şarkı ve sanatçı adını daha belirgin yazarak tekrar dene!': 'Try again with a clearer song and artist name!',
  '❌ Oturum Bulunamadı': '❌ Session Not Found', 'Aktif bir müzik oturumu bulunamadı.': 'No active music session was found.', '⚠️ Hata': '⚠️ Error', 'Şu an çalan bir şarkı yok.': 'No song is playing right now.',
  '⏮️ Başa Sarıldı': '⏮️ Restarted', ' baştan başlatılıyor...': ' is restarting from the beginning...',
  '🔂 **Tek Şarkı Döngüsü** açıldı (çalan şarkı sürekli tekrarlanacak).': '🔂 **Single Song Loop** is on (the current song will repeat).',
  '🔁 **Tüm Kuyruk Döngüsü** açıldı (biten şarkılar kuyruğun sonuna eklenecek).': '🔁 **Queue Loop** is on (finished songs are added to the end of the queue).',
  '🔄 **Döngü Kapatıldı**.': '🔄 **Loop is off**.', '🔁 Döngü Durumu Güncellendi': '🔁 Loop Updated', '🔊 Ses Seviyesi': '🔊 Volume', '🔉 Ses Seviyesi': '🔉 Volume',
  '🔀 Kuyruk Karıştırıldı': '🔀 Queue Shuffled', '🔀 Karıştır': '🔀 Shuffle', 'Kuyrukta karıştırılacak yeterli şarkı yok (en az 2 şarkı gerekli).': 'Not enough songs in the queue to shuffle (at least 2 needed).',
  // ── Müzik tahmin oyunu ──
  '# 🎵 Şarkıyı Tahmin Et! • Tur ': '# 🎵 Guess the Song! • Round ', '🔊 Ses kanalında **20 saniyelik** müzik kesiti çalıyor!': '🔊 A **20-second** music clip is playing in the voice channel!',
  'Aşağıdaki butonlardan doğru şarkıyı ilk sen bul ve **+10 Puan** kazan!': 'Be the first to pick the right song with the buttons below and win **+10 points**!',
  '⏱️ **Kalan Süre:** 20 saniye': '⏱️ **Time Left:** 20 seconds', '⚠️ Bu turun süresi dolmuş veya başka tura geçilmiş!': '⚠️ This round has expired or moved on!',
  '⚠️ Bu tur zaten başka bir üye tarafından cevaplandı!': '⚠️ Someone else already answered this round!',
  '# 🏆 DOĞRU TAHMİN! • Tur ': '# 🏆 CORRECT GUESS! • Round ', '🎉 Tebrikler <@': '🎉 Congratulations <@', '> doğru bildi!': '> got it right!', '🎵 **Şarkı:**': '🎵 **Song:**',
  '🏅 **Ödül:** +10 Trivia Puanı (Toplam: **': '🏅 **Reward:** +10 Trivia points (Total: **', ' Puan**)': ' points**)', '*Sıradaki tura 4 saniye içinde geçiliyor...*': '*Moving on to the next round in 4 seconds...*',
  '❌ **Yanlış tahmin!** Başka bir seçeneği deneyebilirsin.': '❌ **Wrong guess!** You can try another option.', '# ⏰ SÜRE DOLDU! • Tur ': '# ⏰ TIME IS UP! • Round ',
  'Kimse şarkıyı 20 saniye içinde doğru tahmin edemedi.': 'Nobody guessed the song correctly within 20 seconds.', '🎵 **Doğru Şarkı:** **': '🎵 **Correct Song:** **', '** idi!': '** was the answer!',
  '# 🏆 Müzik Trivia Sona Erdi!': '# 🏆 Music Trivia Is Over!', 'Hiç kimse puan kazanamadı. Bir dahaki sefere daha iyi şanslar!': 'Nobody scored. Better luck next time!',
  '. Sıra:**': '. Place:**', ' Puan**': ' pts**', 'Katılan herkese teşekkürler! Tekrar oynamak için **/games** komutunu kullanabilirsiniz.': 'Thanks to everyone who played! Use **/games** to play again.',
  '⚠️ Şarkı tahmin oyununu başlatmak için önce bir ses kanalına girmelisin!': '⚠️ Join a voice channel first to start the song guessing game!',
  '⚠️ Bu sunucuda zaten aktif bir Şarkı Tahmin oyunu devam ediyor!': '⚠️ A Song Guess game is already running in this server!',
  '⚠️ Aktif bir oyun bulunamadı.': '⚠️ No active game was found.', '⏹️ Oyun durduruldu ve sonlandırıldı.': '⏹️ The game was stopped and ended.',
  // ── Sunucuya katılma mesajları ──
  'Bu izinler olmadan AutoMod, Anti-Raid, Ticket, Log sistemi ve slash komutlar düzgün çalışmayabilir.': 'Without these permissions AutoMod, Anti-Raid, Tickets, the log system and slash commands may not work properly.',
  'Lütfen bot rolüne **Administrator** verin veya eksik izinleri ekleyin.': 'Please give the bot role **Administrator** or add the missing permissions.',
  '🔐 **Yönetici doğrulaması**': '🔐 **Admin verification**', "Aegis'in anti-nuke koruması için sunucu yöneticilerinin doğrulanması gerekir.": "Server admins need to be verified for Aegis's anti-nuke protection.",
  'Şu linkten Discord ile giriş yap ve doğrula:': 'Log in with Discord at this link and verify:',
  'Doğrulanmayan hesapların yıkıcı işlemleri (toplu kanal/rol silme, mass ban, yetki verme) otomatik engellenir ve sunucu kilitlenir.': 'Destructive actions by unverified accounts (mass channel/role deletes, mass bans, granting permissions) are blocked automatically and the server is locked.',
  'Doğrulanmayan hesapların yıkıcı işlemleri otomatik engellenir.': 'Destructive actions by unverified accounts are blocked automatically.',
  "## :aegis_love: Aegis Guard'ı eklediğin için teşekkürler": '## :aegis_love: Thanks for adding Aegis Guard', 'Üç adımda hazırsın:': 'You are ready in three steps:',
  ' — Log kanalları, karşılama ve güvenlik ayarlarını tek komutla kurar': ' — Sets up log channels, welcome messages and security in one command',
  ' — Tüm komutları kategorilere göre listeler': ' — Lists all commands by category', ' ve `/jury` — Yeni üyeler için kural sınavı ve topluluk jürisi': ' and `/jury` — Rules quiz and community jury for new members',
  ' ve \\`/jury\\` — Yeni üyeler için kural sınavı ve topluluk jürisi': ' and \\`/jury\\` — Rules quiz and community jury for new members',
  // ── Token / OAuth koruması ──
  '**Güvenlik Koruması Devrede!** Paylaştığın içerikte gizli Discord API anahtarı': '**Security Protection Active!** A secret Discord API key was found in what you shared',
  ') tespit edildi ve güvenliğin için anında **silindi**.': ') and it was **deleted** immediately for your safety.',
  "⚠️ *Token'lar şifreniz gibidir; lütfen derhal sıfırlayın. Acil güvenlik rehberi DM kutunuza iletildi.*": '⚠️ *Tokens are like passwords; please reset it right away. An urgent security guide was sent to your DMs.*',
  '**OAuth2 Yetki Tuzağı Engellendi!** Paylaştığın link, kullanıcıların Discord hesaplarına `guilds.join` yetkisi alarak hesaplarını raid ve spam amaçlı kullanan **Sahte Doğrulama / Token Tuzağı** olduğu için derhal imha edildi!': '**OAuth2 Permission Trap Blocked!** The link you shared was destroyed immediately because it is a **Fake Verification / Token Trap** that takes the `guilds.join` permission to use accounts for raids and spam!',
  '**OAuth2 Yetki Tuzağı Engellendi!** Paylaştığın link, kullanıcıların Discord hesaplarına \\`guilds.join\\` yetkisi alarak hesaplarını raid ve spam amaçlı kullanan **Sahte Doğrulama / Token Tuzağı** olduğu için derhal imha edildi!': '**OAuth2 Permission Trap Blocked!** The link you shared was destroyed immediately because it is a **Fake Verification / Token Trap** that takes the \\`guilds.join\\` permission to use accounts for raids and spam!',
  '**Yönetici Yetkili Bot Daveti Engellendi!** Sunucuda Yönetici (Administrator) izinli şüpheli bot davet linki paylaşımı güvenlik nedeniyle yasaklanmıştır.': '**Admin Bot Invite Blocked!** Sharing a suspicious bot invite link that asks for Administrator permission is not allowed for security reasons.',
  '🚨 **AEGIS SHIELD: OAuth2 Yetkilendirme Tuzağı Engellendi!**': '🚨 **AEGIS SHIELD: OAuth2 Authorization Trap Blocked!**',
  "sunucusunda paylaştığın link Discord'un `guilds.join` iznini talep eden bir **OAuth2 Yetki Tuzağı** olarak tespit edildi.": 'The link you shared in this server was detected as an **OAuth2 Permission Trap** that asks for Discord\'s `guilds.join` permission.',
  "sunucusunda paylaştığın link Discord'un \\`guilds.join\\` iznini talep eden bir **OAuth2 Yetki Tuzağı** olarak tespit edildi.": 'The link you shared in this server was detected as an **OAuth2 Permission Trap** that asks for Discord\'s \\`guilds.join\\` permission.',
  '⚠️ **BU TUZAK NASIL ÇALIŞIR?**': '⚠️ **HOW DOES THIS TRAP WORK?**',
  'Bu tür botlar/linkler "Doğrulanmak için yetkilendir", "Rol almak için tıkla" veya "Nitro çekilişi" diyerek kullanıcıları kandırır. Kullanıcı "Yetkilendir"e bastığında saldırgan hesabınızın kontrolünü ele geçirir ve hesabınızı haberiniz olmadan yasa dışı raid sunucularına sokar!': 'Bots and links like this trick users with "Authorize to verify", "Click to get a role" or "Nitro giveaway". When you press "Authorize", the attacker takes control of your account and puts it into illegal raid servers without you knowing!',
  '🛡️ **KORUNMAK İÇİN:**': '🛡️ **TO PROTECT YOURSELF:**',
  '1. Discord Ayarları ➔ **Yetkili Uygulamalar (Authorized Apps)** sekmesine git.': '1. Go to Discord Settings ➔ **Authorized Apps**.',
  '2. Tanımadığın, şüpheli veya yakın zamanda yetkilendirdiğin tüm uygulamaların yanındaki **"Yetkiyi Kaldır"** butonuna bas.': '2. Press **"Deauthorize"** next to every app you do not know, find suspicious or authorized recently.',
  '3. Bu linki başka sunucularda da paylaşma.': '3. Do not share this link in other servers either.',
  '🚨 **AEGIS SHIELD: Discord API / Token Sızıntısı Tespit Edildi!**': '🚨 **AEGIS SHIELD: Discord API / Token Leak Detected!**',
  'sunucusunda gönderdiğin mesajda gizli Discord API anahtarı tespit edildi ve üçüncü şahısların eline geçmemesi için Aegis Guard tarafından anında **silindi**.': 'A secret Discord API key was detected in your message in this server and Aegis Guard **deleted** it immediately so it cannot reach third parties.',
  '🔍 **Tespit Edilen Tür:**': '🔍 **Detected Type:**', '🔑 **Sızan Veri (Maskelenmiş):**': '🔑 **Leaked Data (Masked):**', '📁 **Kaynak:**': '📁 **Source:**', 'Dosya Eki (': 'File Attachment (', 'Mesaj Metni': 'Message Text',
  '⚠️ **BU NEDEN ÇOK TEHLİKELİ?**': '⚠️ **WHY IS THIS SO DANGEROUS?**',
  "Token'lar Discord botlarının ve kullanıcı hesaplarının en yetkili şifresiz anahtarıdır. Bir token ele geçirildiğinde saldırgan:": 'Tokens are the most powerful passwordless keys of Discord bots and user accounts. When a token is captured the attacker can:',
  '• Botunuza tam erişim sağlayıp sunucuları silebilir, üyelere ban atabilir veya spam yapabilir.': '• Gain full access to your bot, delete servers, ban members or spam.',
  '• Hesabınızın tokenı ise şifrenizi bilmeden hesabınıza girip sunucularınızı patlatabilir.': '• With an account token, log into your account without your password and wreck your servers.',
  '⚡ **HEMEN YAPMAN GEREKENLER (ACİL PROTOKOL):**': '⚡ **WHAT YOU MUST DO NOW (URGENT PROTOCOL):**',
  '1️⃣ **Eğer bu bir BOT TOKEN ise:**': '1️⃣ **If this is a BOT TOKEN:**', "   • Discord Developer Portal'a git:": '   • Go to the Discord Developer Portal:',
  '   • İlgili botunu seç ➔ Sol menüden **"Bot"** sekmesine tıkla.': '   • Select your bot ➔ click **"Bot"** in the left menu.',
  '   • **"Reset Token"** butonuna bas! Eski sızan token anında geçersiz kalır.': '   • Press **"Reset Token"**! The leaked token becomes invalid immediately.',
  '2️⃣ **Eğer bu senin KİŞİSEL DİSCORD HESABIN ise:**': '2️⃣ **If this is your PERSONAL DISCORD ACCOUNT:**',
  '   • Discord şifreni **DERHAL DEĞİŞTİR**! (Şifre değiştiğinde Discord tüm cihazlardaki aktif tokenları anında sıfırlar).': '   • **CHANGE your Discord password RIGHT NOW**! (Changing it resets the active tokens on all devices).',
  '   • İki Aşamalı Doğrulamayı (2FA) aktif et.': '   • Turn on Two-Factor Authentication (2FA).',
  '   • Discord Ayarları ➔ **Cihazlar (Devices)** sekmesine girip tanımadığın tüm aktif oturumları kapat.': '   • Go to Discord Settings ➔ **Devices** and close every active session you do not recognize.',
  '3️⃣ **Eğer bu bir WEBHOOK ise:**': '3️⃣ **If this is a WEBHOOK:**',
  "   • İlgili kanalın Kanal Ayarları ➔ Entegrasyonlar ➔ Webhooks kısmından o webhook'u derhal sil.": '   • Delete that webhook right away in the channel\'s Settings ➔ Integrations ➔ Webhooks.',
  '# 🚨 OAuth2 Yetki Tuzağı Engellendi': '# 🚨 OAuth2 Permission Trap Blocked', '# 🛡️ Discord Token / API Sızıntısı Engellendi': '# 🛡️ Discord Token / API Leak Blocked',
  'Kullanıcı mesajında zararlı yetki / kimlik sızıntısı saptandı ve içeriğe anında müdahale edildi.': "A harmful permission / credential leak was found in the user's message and it was dealt with immediately.",
  '**Kullanıcı:**': '**User:**', '**Kanal:**': '**Channel:**', '**Tür:**': '**Type:**', '**Özet:**': '**Summary:**', '**Kaynak:**': '**Source:**',
  '**Müdahale Hızı:**': '**Response Time:**', '< 15ms (Anında Silindi)': '< 15ms (Deleted Instantly)',
  '**Harici Kullanıcı Uygulaması (': '**External User App (', ' ile sunucuda izinsiz saldırı/spam yaptığı için **sunucudan anında yasaklandı (BAN)!**': ' attacked/spammed the server without permission, so they were **banned from the server immediately (BAN)!**',
  '🛡️ *Aegis Zero-Trust Shield devrede.*': '🛡️ *Aegis Zero-Trust Shield is active.*',
  // ── Honeytoken ──
  '## 🚨 [HONEYTOKEN ALARMI] İç Tehdit Engellendi': '## 🚨 [HONEYTOKEN ALARM] Insider Threat Blocked',
  'sunucunuzda kurulan sahte yetki / gizli kanal tuzağı tetiklendi!': 'The fake permission / hidden channel trap set in your server was triggered!',
  'Yetkisini suistimal etmeye çalışan veya hesabı ele geçirilmiş olan yetkili anında etkisiz hale getirildi.': 'The staff member who tried to abuse their permissions, or whose account was taken over, was neutralized immediately.',
  '**Saldırgan / Yetkili:**': '**Attacker / Staff:**', '**Uygulanan Yaptırım:**': '**Action Taken:**', '**Gerekçe:**': '**Reason:**', '**Sunucu Kilidi (Panic Mode):**': '**Server Lock (Panic Mode):**',
  'AKTİF EDİLDİ': 'ACTIVATED', 'Devre Dışı': 'Disabled', '## 🚨 [GÜVENLİK İHLALİ] Honeytoken Tuzağı Tetiklendi': '## 🚨 [SECURITY BREACH] Honeytoken Trap Triggered',
  'Yetki sızması veya darbe girişimi engellendi. Hedef üyenin rolleri temizlendi.': 'A permission leak or takeover attempt was blocked. The target member\'s roles were removed.', '**Yürütücü:**': '**Executor:**', '**Sonuç:**': '**Result:**',
  'Sunucudan Yasaklandı (Ban)': 'Banned from the server (Ban)', 'Sunucudan Atıldı (Kick)': 'Kicked from the server (Kick)', 'Tüm Rolleri Alındı + 28 Gün İzolasyon (Timeout)': 'All roles removed + 28-day isolation (Timeout)',
  'Tuzak Rol Ataması (Honey Role Assign)': 'Trap Role Assignment (Honey Role Assign)', 'Tuzak Kanal Erişimi (Honey Channel Breach)': 'Trap Channel Access (Honey Channel Breach)',
  'Tuzak Kanal İmha Girişimi': 'Trap Channel Destruction Attempt', 'Tuzak Rol İmha Girişimi': 'Trap Role Destruction Attempt',
};

const REGEX = [
  [/Ses seviyesi \*\*%(\d+)\*\* yapıldı\./g, 'Volume set to **$1%**.'],
  [/Kuyruktaki \*\*(\d+)\*\* şarkı rastgele karıştırıldı!/g, 'Shuffled **$1** songs in the queue!'],
  [/⚠️ Oyuna katılmak ve tahmin yapmak için <#(\d+)> ses kanalında olmalısın!/g, '⚠️ To join the game and guess you must be in the <#$1> voice channel!'],
  [/🎮 \*\*Şarkıyı Tahmin Et\*\* oyunu <#(\d+)> ses kanalında başlatılıyor!/g, '🎮 The **Guess the Song** game is starting in the <#$1> voice channel!'],
  [/Teşekkürler! Aegis'i \*\*(.+?)\*\* sunucusuna da eklediğin için \*\*(.+?)\*\* 30 gün boyunca ücretsiz \*\*Ballad\*\* paketini aldı\./g, 'Thanks! Because you also added Aegis to **$1**, **$2** received the **Ballad** package free for 30 days.'],
  [/⚠️ \*\*(.+?)\*\* sunucusuna eklendim ama bazı \*\*kritik izinler eksik\*\*!/g, '⚠️ I was added to **$1** but some **critical permissions are missing**!'],
  [/\*\*(.+?)\*\* sunucusunda paylaştığın link/g, 'The link you shared in **$1**'],
];

const ORDERED = Object.entries(FRAGMENTS).sort((a, b) => b[0].length - a[0].length);
const cache = new Map();

function translate(text) {
  if (typeof text !== 'string' || text.length < 2) return text;
  if (cache.has(text)) return cache.get(text);
  let out = EXACT[text] ?? text;
  if (out === text) {
    for (const [tr, en] of ORDERED) if (out.includes(tr)) out = out.split(tr).join(en);
    for (const [re, rep] of REGEX) out = out.replace(re, rep);
  }
  if (cache.size > 3000) cache.clear();
  cache.set(text, out);
  return out;
}

module.exports = { translate, EXACT, FRAGMENTS, REGEX };
