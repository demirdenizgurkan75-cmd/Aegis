// Aegis open-source build: only the first 54 of 301 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * SUNUCU ANALİZ MODÜLÜ
 * Bot bir sunucuya girdiğinde o sunucuyu analiz eder, ne hakkında olduğunu anlar
 * Ticket AI bu analizi kullanarak sorulara cevap verir
 */

const { GoogleGenAI } = require('@google/genai');
const { getGuild, updateGuild } = require('./database');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

function getGenAI() {
  if (!GEMINI_API_KEY) return null;
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

// Sunucu analizi cache (memory)
const serverAnalysisCache = new Map(); // guildId -> { analysis, analyzedAt }

/**
 * Sunucuyu analiz et - kanallar, kurallar, açıklama, roller vb.
 */
async function analyzeServer(guild, client) {
  const genAI = getGenAI();
  if (!genAI) {
    console.log('[ServerAnalysis] Gemini API key yok, analiz atlanıyor');
    return null;
  }

  try {
    // Sunucu bilgilerini topla
    const info = await gatherServerInfo(guild, client);

    // AI ile analiz et
    const analysis = await generateAnalysis(info);

    // Cache'e kaydet
    serverAnalysisCache.set(guild.id, {
      analysis,
      analyzedAt: Date.now()
    });

    // Veritabanına kaydet
    updateGuild(guild.id, { serverAnalysis: analysis });

    console.log(`[ServerAnalysis] ${guild.name} analiz edildi: ${analysis.category} - ${analysis.summary}`);
    return analysis;

  } catch (error) {
    console.error('[ServerAnalysis] Hata:', error.message);
    return null;
  }
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "analyzeServer": async () => null,
  "getOrAnalyzeServer": async () => null,
  "getCachedAnalysis": () => null,
  "buildServerContextForAI": () => '',
  "serverAnalysisCache": new Map(),
});
