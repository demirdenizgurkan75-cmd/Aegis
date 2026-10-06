/**
 * Sunucu Sağlık Raporu - AI Analiz Modülü
 * Haftalık sunucu metriklerini AI ile analiz eder, Components V2 dashboard'a hazırlar
 */

const { GoogleGenAI } = require('@google/genai');
const { getGuild } = require('./database');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
const GEMINI_MODEL = 'gemini-2.0-flash-exp';

async function analyzeHealth(metrics) {
  if (!GEMINI_API_KEY) return null;

  const prompt = `Sen bir Discord sunucusu analiz uzmanısın. Bu JSON verisini analiz et ve TÜRKÇE yanıt ver.
SADECE şu JSON formatında döndür (başka metin yazma):
{
  "score": <0-100 arası sayı>,
  "status": "<\"Kritik\"|\"Riskli\"|\"Orta\"|\"İyi\"|\"Mükemmel\">",
  "summary": "<2 cümlelik özet>",
  "risks": ["<risk1>", "<risk2>", ...],
  "recommendations": ["<öneri1>", "<öneri2>", ...],
  "trends": {
    "growth": "<\"Pozitif\"|\"Negatif\"|\"Stabil\">",
    "engagement": "<\"Yüksek\"|\"Orta\"|\"Düşük\">",
    "retention": "<\"İyi\"|\"Orta\"|\"Kötü\">"
  }
}

VERİ:
${JSON.stringify(metrics, null, 2)}`;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        maxOutputTokens: 1000
      }
    });

    const text = response.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('[HealthReport] AI analysis error:', e.message);
    return null;
  }
}

async function generateHealthReport(guild, client) {
  const guildId = guild.id;
  const db = require('./database');
  const dashboardStats = db.getDashboardStats(guildId, 7);
  const guildData = getGuild(guildId);
  const tickets = Object.values(guildData?.tickets || {});
  const openTickets = tickets.filter(t => !t.closed).length;
  const closedTickets = tickets.filter(t => t.closed).length;

  // Voice channel activity
  const voiceChannels = guild.channels.cache.filter(c => c.type === 2);
  let totalVoiceMembers = 0;
  voiceChannels.forEach(c => totalVoiceMembers += c.members.size);

  // Member stats
  const totalMembers = guild.memberCount;
  const onlineMembers = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
  const botCount = guild.members.cache.filter(m => m.user.bot).size;
  const humanCount = totalMembers - botCount;

  // Activity from dashboard stats
  const messageCount = dashboardStats?.messageCount || 0;
  const commandCount = dashboardStats?.commandCount || 0;
  const modActionCount = dashboardStats?.modActionCount || 0;
  const ticketCount = dashboardStats?.ticketCount || openTickets + closedTickets;

  // Calculate growth (simplified - compare with previous week if available)
  const growthData = db.getGrowthData(guildId);

  const metrics = {
    guild: {
      name: guild.name,
      id: guild.id,
      createdAt: guild.createdAt.toISOString()
    },
    members: {
      total: totalMembers,
      humans: humanCount,
      bots: botCount,
      online: onlineMembers,
      onlineRate: totalMembers > 0 ? Math.round((onlineMembers / totalMembers) * 100) : 0
    },
    activity: {
      messages: messageCount,
      commands: commandCount,
      modActions: modActionCount,
      tickets: ticketCount,
      openTickets,
      closedTickets,
      voiceMembers: totalVoiceMembers,
      voiceChannels: voiceChannels.size
    },
    growth: growthData || { memberChange: 0, messageChange: 0 },
    period: {
      days: 7,
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString()
    }
  };

  const analysis = await analyzeHealth(metrics);

  // If AI analysis failed, provide fallback
  if (!analysis) {
    const score = calculateFallbackScore(metrics);
    return {
      generatedAt: new Date().toISOString(),
      metrics,
      analysis: {
        score,
        status: getStatusFromScore(score),
        summary: 'AI analizi şu anda kullanılamıyor. Otomatik skor hesaplandı.',
        risks: [],
        recommendations: ['AI analizi için Gemini API key ayarlayın'],
        trends: { growth: 'Stabil', engagement: 'Orta', retention: 'Orta' }
      }
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    metrics,
    analysis
  };
}

function calculateFallbackScore(metrics) {
  let score = 50; // Base score

  // Member engagement
  if (metrics.members.onlineRate > 30) score += 15;
  else if (metrics.members.onlineRate > 15) score += 5;

  // Activity
  if (metrics.activity.messages > 1000) score += 10;
  else if (metrics.activity.messages > 500) score += 5;

  if (metrics.activity.commands > 100) score += 5;
  if (metrics.activity.modActions > 20) score += 5;

  // Tickets
  if (metrics.activity.tickets > 0) {
    const resolutionRate = metrics.activity.closedTickets / (metrics.activity.openTickets + metrics.activity.closedTickets);
    if (resolutionRate > 0.8) score += 10;
    else if (resolutionRate > 0.5) score += 5;
  }

  // Voice
  if (metrics.activity.voiceMembers > 10) score += 10;
  else if (metrics.activity.voiceMembers > 5) score += 5;

  // Growth
  if (metrics.growth.memberChange > 0) score += 5;

  return Math.min(100, Math.max(0, score));
}

function getStatusFromScore(score) {
  if (score >= 90) return 'Mükemmel';
  if (score >= 70) return 'İyi';
  if (score >= 50) return 'Orta';
  if (score >= 30) return 'Riskli';
  return 'Kritik';
}

// History management
async function saveHealthReport(guildId, report) {
  const db = require('./database');
  db.saveHealthReport(guildId, report);
}

async function getHealthHistory(guildId, limit = 10) {
  const db = require('./database');
  return db.getHealthHistory(guildId, limit);
}

async function getLatestHealthReport(guildId) {
  const db = require('./database');
  return db.getLatestHealthReport(guildId);
}

module.exports = {
  generateHealthReport,
  analyzeHealth,
  saveHealthReport,
  getHealthHistory,
  getLatestHealthReport
};