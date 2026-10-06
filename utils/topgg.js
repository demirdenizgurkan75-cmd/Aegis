// ─── top.gg OTOMATİK SUNUCU SAYACI ──────────────────────────────────────
// TOPGG_TOKEN set edilirse botun sunucu sayısını top.gg'ye gönderir
// (30 dakikada bir). Liste sayfasını https://top.gg'den oluşturman gerekir:
// botu oraya eklersen ve token'ı .env'e yazarsan bu modül devreye girer.
const API = 'https://top.gg/api/bots';

let interval = null;

function startTopggPoster(client) {
  const token = process.env.TOPGG_TOKEN;
  if (!token) {
    console.log('⏭️  top.gg: TOPGG_TOKEN tanımlı değil, sunucu sayacı kapalı.');
    return;
  }

  const post = async () => {
    try {
      const count = client.guilds.cache.size;
      const res = await fetch(`${API}/${client.user.id}/stats`, {
        method: 'POST',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ server_count: count }),
      });
      if (!res.ok) {
        console.error(`⚠️ top.gg güncelleme hatası (${res.status}):`, (await res.text()).slice(0, 200));
      } else {
        console.log(`📊 top.gg güncellendi: ${count} sunucu`);
      }
    } catch (e) {
      console.error('⚠️ top.gg hata:', e.message);
    }
  };

  post();
  interval = setInterval(post, 30 * 60 * 1000);
}

module.exports = { startTopggPoster };
