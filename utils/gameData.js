// Shared game data and state
const activeGames = new Map(); // channelId -> { type, data, collector }

const kelimeListesi = [
  'Bilgisayar', 'Telefon', 'Masa', 'Kalem', 'Kitap', 'Defter', 'Araba', 'Ucak', 'Deniz', 'Gokyuzu',
  'Cicek', 'Agac', 'Kedi', 'Kopek', 'Kus', 'Balik', 'Ev', 'Okul', 'Sinif', 'Ogretmen',
  'Ogrenci', 'Arkadas', 'Aile', 'Sehir', 'Ulke', 'Dunya', 'Uzay', 'Gezegen', 'Yildiz', 'Ay',
  'Gunes', 'Bulut', 'Yagmur', 'Kar', 'Ruzgar', 'Firtina', 'Gokkusagi', 'Gol', 'Nehir', 'Dag',
  'Orman', 'Col', 'Vadi', 'Kopru', 'Yol', 'Sokak', 'Park', 'Bahce', 'Pencere', 'Kapi',
];

const dogrulukSorulari = [
  'En son yalan soyledigin ne zamandi?',
  'Siniftaki/Isyerindeki en sevmedigin kim ve neden?',
  'Bugune kadar yaptigin en utanir anin neydi?',
  'Hayatinda yapmak istedigin ama hic yapamadigin sey ne?',
  'En buyuk korkun ne?',
  'Sahip oldugun en tuhaf aliskanlik ne?',
  'Kimse bilmemeni istedigin bir sirrin var mi?',
  'En buyuk hayalin ne?',
  'Gecmisine donup bir seyi degistirmek ister misin? Ne?',
  'En cok hangi alanda kendini gelistirmek istersin?',
];

const cesaretGorevleri = [
  'Sunucuda 1 dakika boyunca sadece emoji kullanarak konus.',
  'Profil resminizi 10 dakika icin komik bir seye degistir.',
  'Rastgele bir kullaniciya "Sen harikasin!" mesaji at.',
  'Sesli kanala girip 10 saniye sarki soyle.',
  'Sunucuda 5 dakika boyunca sadece buyuk harflerle yaz.',
  'Hakkinda uydurma bir hikaye anlat.',
  'Sunucudaki bir yetkiliye komik bir takma ad oner.',
  'Son gonderdigin mesaji ters cevirip tekrar gonder.',
  'Hangi hayvan oldugunu tahmin ettir (sessiz sinema).',
  'Sunucuda "Ben bir muzum" diye bir mesaj at.',
];

const truthQuestionsEn = [
  'When was the last time you lied?',
  'Who is the person you like least at school or work, and why?',
  'What is the most embarrassing thing you have ever done?',
  'What is something you always wanted to do but never did?',
  'What is your biggest fear?',
  'What is your weirdest habit?',
  'Is there a secret you hope nobody ever finds out?',
  'What is your biggest dream?',
  'If you could go back and change one thing, what would it be?',
  'What skill would you most like to get better at?',
];

const dareTasksEn = [
  'Talk using only emojis in the server for 1 minute.',
  'Change your profile picture to something funny for 10 minutes.',
  'Send a random member the message "You are awesome!".',
  'Join a voice channel and sing for 10 seconds.',
  'Write in ALL CAPS in the server for 5 minutes.',
  'Tell a made-up story about yourself.',
  'Suggest a funny nickname for a moderator.',
  'Send your last message again, but reversed.',
  'Act out an animal and let the others guess it (charades).',
  'Post "I am a banana" in the server.',
];

module.exports = {
  truthQuestionsEn,
  dareTasksEn,
  activeGames,
  kelimeListesi,
  dogrulukSorulari,
  cesaretGorevleri,
};