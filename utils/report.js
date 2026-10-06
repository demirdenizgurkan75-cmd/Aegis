/**
 * Weekly Health Report Scheduler
 * Her Pazar 12:00'de çalışır, rapor üretir, sahiplere DM atar
 */

const { generateHealthReport } = require('./healthReport');
const { getGuild, updateGuild } = require('./database');

let scheduleTimer = null;

function startWeeklyReportSchedule(client) {
  // Clear existing timer
  if (scheduleTimer) clearTimeout(scheduleTimer);

  // Calculate next Sunday 12:00
  function getNextSundayNoon() {
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + ((7 - now.getDay()) % 7 || 7));
    nextSunday.setHours(12, 0, 0, 0);
    return nextSunday.getTime() - now.getTime();
  }

  const delay = getNextSundayNoon();
  console.log(`📅 Weekly Health Report scheduled in ${Math.round(delay / 36e5)} hours`);

  scheduleTimer = setTimeout(async () => {
    await runWeeklyReports(client);
    // Re-schedule for next week
    startWeeklyReportSchedule(client);
  }, delay);
}

async function runWeeklyReports(client) {
  console.log('📊 [HealthReport] Starting weekly health reports...');

  for (const guild of client.guilds.cache.values()) {
    try {
      const settings = getGuild(guild.id);

      // Check if reports enabled
      if (!settings.healthReportEnabled) continue;

      // Generate report
      const report = await generateHealthReport(guild, client);

      // Send to owner(s)
      await sendReportToOwners(guild, report);

      console.log(`✅ [HealthReport] ${guild.name}: Score ${report.analysis.score}, Status: ${report.analysis.status}`);
    } catch (e) {
      console.error(`❌ [HealthReport] ${guild.name}:`, e.message);
    }
  }

  console.log('📊 [HealthReport] Weekly reports completed');
}

async function sendReportToOwners(guild, report) {
  const ownerId = guild.ownerId;
  if (!ownerId) return;

  try {
    const owner = await guild.members.fetch(ownerId).catch(() => null);
    if (!owner) return;

    // Create Components V2 message
    const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
            SectionBuilder, ThumbnailBuilder, ActionRowBuilder,
            ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

    const a = report.analysis;
    const m = report.metrics;

    const statusColor = {
      'Mükemmel': 0x00ff88,
      'İyi': 0x44ff44,
      'Orta': 0xffaa00,
      'Riskli': 0xff6600,
      'Kritik': 0xff0000
    }[a.status] || 0x5b7cfa;

    const statusEmoji = {
      'Mükemmel': '🟢',
      'İyi': '🟢',
      'Orta': '🟡',
      'Riskli': '🟠',
      'Kritik': '🔴'
    }[a.status] || '⚪';

    const container = new ContainerBuilder()
      .setAccentColor(statusColor)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${statusEmoji} **Haftalık Sağlık Raporu**\n` +
          `**${guild.name}** • ${new Date(report.generatedAt).toLocaleDateString('tr-TR')}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### 📊 **Genel Skor: ${a.score}/100**\n` +
              `**Durum:** ${a.status}\n\n` +
              `👥 Üyeler: ${m.humanCount} (${m.botCount} bot)\n` +
              `🎫 Ticket: ${m.ticketsOpen} açık, ${m.ticketsClosed} kapalı (%${m.ticketResolutionRate} çözüm)\n` +
              `⚠️ Uyarılar (30g): ${m.warnings30d}\n` +
              `📥 Katılım (7g): +${m.joins7d}\n` +
              `💬 Mesaj (24s): ${m.messages24h}`
            )
          )
          .setThumbnailAccessory({ url: guild.iconURL({ size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png' })
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### 📝 **AI Özeti**\n${a.summary}`)
      )
      .addSeparatorComponents(new SeparatorBuilder());

    // Risks
    if (a.risks && a.risks.length > 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ⚠️ **Riskler**\n${a.risks.map(r => `• ${r}`).join('\n')}`
        )
      );
      container.addSeparatorComponents(new SeparatorBuilder());
    }

    // Recommendations
    if (a.recommendations && a.recommendations.length > 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### 💡 **Öneriler**\n${a.recommendations.map(r => `• ${r}`).join('\n')}`
        )
      );
      container.addSeparatorComponents(new SeparatorBuilder());
    }

    // Trends
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### 📈 **Trendler**\n` +
        `📈 Büyüme: **${a.trends.growth}**\n` +
        `💬 Etkileşim: **${a.trends.engagement}**\n` +
        `🔄 Tutundurma: **${a.trends.retention}**`
      )
    );

    // Dashboard button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('📊 Dashboard\'da Görüntüle')
        .setStyle(ButtonStyle.Link)
        .setURL(`${process.env.DASHBOARD_URL || 'https://aegisbot.xyz'}/dashboard/${guild.id}/health`)
    );
    container.addActionRowComponents(row);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# 🤖 Aegis Guard • Otomatik Haftalık Rapor')
    );

    await owner.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {
      // DM failed, skip
    });
  } catch (e) {
    console.error('[HealthReport] DM send error:', e.message);
  }
}

// Manual trigger command
async function triggerHealthReport(guild, client) {
  const report = await generateHealthReport(guild, client);
  await sendReportToOwners(guild, report);
  return report;
}

module.exports = {
  startWeeklyReportSchedule,
  runWeeklyReports,
  triggerHealthReport,
};