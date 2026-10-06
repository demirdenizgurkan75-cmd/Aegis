/**
 * Aegis Guard - Multilingual Bug Bounty Announcement Broadcaster
 * - Detects guild language (TR vs EN)
 * - Sets reward to 300 TL for TR guilds, $10 USD / €10 EUR for EN guilds
 * - Strictly includes anti-AI warning
 * - Links to https://betterwithaegis.com/bugbounty
 * - Rate-limited sending (1.5s delay per guild)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const { readDB } = require('../utils/database');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TR_ANNOUNCEMENT = `@everyone
🛡️ **Aegis Web Güvenlik & Bug Bounty (300 TL Ödül)**

Web sitemizi ve panelimizi açıklara karşı test etmek isteyen araştırmacılar için resmi Bug Bounty programını başlattık! Sitede geçerli bir güvenlik açığı (SQLi, IDOR, XSS, yetki aşımı, session bypass vb.) bulan ve bildiren ilk kişiye **300 TL** nakit ödül veriyoruz.

🔗 **Detaylar & Raporlama:** https://betterwithaegis.com/bugbounty

💡 **Yapay Zeka (AI) & Destek Serbest:** Eğer kodlama, yazılım, SQL, veritabanı veya API gibi teknik detayları hiç bilmiyorsanız; merak ettiğiniz her şeyi hem yapay zekaya hem de Discord sunucumuzdan bize sorup öğrenebilirsiniz! Önemli olan sahte/uydurma rapor yazmak yerine, sistemde gerçekten çalışan geçerli bir açığı bizzat kanıtlayarak bildirmenizdir.

Açığı ister sitedeki formdan, isterseniz doğrudan Discord'dan ticket açarak kurucularımıza iletebilirsiniz:
Destek Sunucusu: https://discord.gg/kET8XumjQ`;

const EN_ANNOUNCEMENT = `@everyone
🛡️ **Aegis Web Security & Bug Bounty ($10 / €10 Bounty)**

We have launched our official Bug Bounty program for security researchers and developers to test our web platform and dashboard! The first researcher to discover and report a valid security vulnerability (SQLi, IDOR, XSS, auth bypass, etc.) will receive a **$10 USD / €10 EUR** bounty reward.

🔗 **Details & Submission:** https://betterwithaegis.com/bugbounty

💡 **AI Assistance & Learning Allowed:** If you are new to coding, software, SQL databases, or APIs, feel free to consult AI tools and ask our core team on Discord to learn! The key requirement is that the reported vulnerability must be real, tested, and reproducible on our platform.

Submit your findings via the website form or by opening a ticket on our official support server:
Support Server: https://discord.gg/kET8XumjQ`;

client.once('ready', async () => {
  console.log(`[Broadcaster] Logged in as ${client.user.tag}`);
  const db = readDB();
  let sent = 0;
  let skipped = 0;

  for (const [, guild] of client.guilds.cache) {
    const dbLang = db[guild.id]?.language;
    const locale = guild.preferredLocale;
    const isTr = (dbLang === 'tr') || (locale === 'tr');
    const messageContent = isTr ? TR_ANNOUNCEMENT : EN_ANNOUNCEMENT;

    // Fetch guild channels to ensure cache is warm
    const fetchedChannels = await guild.channels.fetch().catch(() => guild.channels.cache);
    const channels = fetchedChannels.filter(
      (c) => c && c.type === ChannelType.GuildText && c.permissionsFor(client.user)?.has(PermissionFlagsBits.SendMessages)
    );

    let targetChannel = channels.find((c) => /duyuru|announcement/i.test(c.name));
    if (!targetChannel) {
      targetChannel = channels.find((c) => /genel|chat|sohbet|general/i.test(c.name));
    }
    if (!targetChannel) {
      targetChannel = channels.first();
    }

    if (targetChannel) {
      try {
        await targetChannel.send(messageContent);
        console.log(`[+] Sent to [${guild.name}] (#${targetChannel.name}) - Lang: ${isTr ? 'TR' : 'EN'}`);
        sent++;
      } catch (err) {
        console.error(`[-] Failed sending to [${guild.name}]:`, err.message);
        skipped++;
      }
    } else {
      console.warn(`[!] No sendable text channel found in [${guild.name}]`);
      skipped++;
    }

    // Rate-limit safety delay
    await sleep(1500);
  }

  console.log(`[Broadcaster] Completed! Sent: ${sent} | Skipped/Failed: ${skipped}`);
  process.exit(0);
});

client.login(process.env.TOKEN);
