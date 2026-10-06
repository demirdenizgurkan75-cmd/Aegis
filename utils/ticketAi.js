// Aegis open-source build: only the first 94 of 348 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * AEGIS AI TICKET ASISTANI v2
 * @google/genai SDK ile - gemma-4 modeli icin basit generateContent
 */

const { GoogleGenAI } = require('@google/genai');
const { getGuild } = require('./database');
const { getOrAnalyzeServer, buildServerContextForAI } = require('./serverAnalysis');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// ─── Chat gecmisi (basit memory) ──────────────────────────────────────────────
const chatHistories = new Map(); // channelId -> [{role, text}]

// ─── Sunucu Dilini Tespit Et ────────────────────────────────────────────────
function detectServerLanguage(guild, guildSettings) {
  // 1. ticketAiConfig özel ayarı
  if (guildSettings?.ticketAiConfig?.language && guildSettings.ticketAiConfig.language !== 'auto') {
    const l = String(guildSettings.ticketAiConfig.language).toLowerCase();
    if (l === 'en' || l === 'english') return { code: 'en', name: 'English' };
    if (l === 'tr' || l === 'turkish' || l === 'turkce') return { code: 'tr', name: 'Turkish' };
    if (l === 'de' || l === 'german') return { code: 'de', name: 'German' };
    if (l === 'fr' || l === 'french') return { code: 'fr', name: 'French' };
    if (l === 'es' || l === 'spanish') return { code: 'es', name: 'Spanish' };
    if (l === 'pt' || l === 'portuguese') return { code: 'pt', name: 'Portuguese' };
    if (l === 'ru' || l === 'russian') return { code: 'ru', name: 'Russian' };
  }

  // 2. Sunucu genel dil ayarı
  if (guildSettings?.language) {
    const l = String(guildSettings.language).toLowerCase();
    if (l === 'en' || l === 'english') return { code: 'en', name: 'English' };
    if (l === 'tr' || l === 'turkish' || l === 'turkce') return { code: 'tr', name: 'Turkish' };
  }

  // 3. Discord sunucusunun preferredLocale ayarı
  const locale = (guild?.preferredLocale || '').toLowerCase();
  if (locale.startsWith('en')) return { code: 'en', name: 'English' };
  if (locale.startsWith('tr')) return { code: 'tr', name: 'Turkish' };
  if (locale.startsWith('de')) return { code: 'de', name: 'German' };
  if (locale.startsWith('fr')) return { code: 'fr', name: 'French' };
  if (locale.startsWith('es')) return { code: 'es', name: 'Spanish' };
  if (locale.startsWith('pt')) return { code: 'pt', name: 'Portuguese' };
  if (locale.startsWith('ru')) return { code: 'ru', name: 'Russian' };
  if (locale.startsWith('it')) return { code: 'it', name: 'Italian' };
  if (locale.startsWith('ja')) return { code: 'ja', name: 'Japanese' };
  if (locale.startsWith('ko')) return { code: 'ko', name: 'Korean' };

  return { code: 'tr', name: 'Turkish' };
}

// ─── System prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(guildSettings, guild) {
  const lang = detectServerLanguage(guild, guildSettings);
  const isEn = lang.code !== 'tr';
  const skills = (guildSettings.ticketAiSkills || []).filter(s => s.enabled);
  let skillInfo = '';
  if (skills.length) {
    skillInfo = '\n\nActive Skills / Yetenekler:\n' + skills.map(s => '- ' + s.name + ': ' + s.description).join('\n');
  }

  // Sunucu analizi bağlamı
  const serverContext = guildSettings.id ? buildServerContextForAI(guildSettings.id) : '';

  return `You are the official support and assistant AI for this Discord server protected by Aegis Guard.
CRITICAL LANGUAGE REQUIREMENT (ZORUNLU DİL KURALI):
This Discord server's language is: ${lang.name} (Code: ${lang.code}).
1. You MUST speak and respond strictly in the language of this server (${lang.name}). If the server speaks ${lang.name}, you speak ${lang.name}.
2. If the user writes in another language, adapt and respond either in the user's language or in the server's primary language (${lang.name}).
3. Maintain a natural, friendly, helpful, and concise tone. Use 1-2 relevant emojis, do not overdo it.
4. For moderation requests (ban, kick, timeout, warn, unban), only return JSON as specified below.
5. If it is NOT a moderation request, reply naturally and conversationally in ${lang.name}.

${skillInfo}${serverContext}

MODERATION ACTIONS:
If the user requests a moderation action (ban, kick, timeout, warn, unban), output ONLY JSON:
{"action":"ban","user":"user_id","reason":"reason"}
{"action":"kick","user":"user_id","reason":"reason"}
{"action":"timeout","user":"user_id","duration":"1h","reason":"reason"}
{"action":"unban","user":"user_id","reason":"reason"}
{"action":"warn","user":"user_id","reason":"reason"}
Output ONLY the JSON object. Do not include any additional text or markdown wrappers for moderation commands.

IMPORTANT - BOT INVITE / ADD REQUEST (MANDATORY):
If the user's intent is how to add or invite Aegis Guard to their server, output ONLY this JSON in one single escaped line:
{
  "type": "bot_invite",
  "text": "${isEn ? "To invite Aegis Guard to your server, click the button below:\\n\\n**Steps:**\\n1. Click the button\\n2. Select your server\\n3. Click Authorize\\n4. Confirm permissions\\n\\nBot will be added with Administrator permissions and ready immediately." : "Aegis Guard\\'ı sunucuna eklemek için aşağıdaki butonu kullan:\\n\\n**Adımlar:**\\n1. Butona tıkla\\n2. Sunucunu seç\\n3. Yetkilendir butonuna bas\\n4. İzinleri onayla\\n5. Captcha varsa çöz\\n\\nBot Administrator izni ile eklenecek, hemen hazır."}",
  "buttonLabel": "${isEn ? "Invite Link" : "Davet Linki"}",
  "buttonUrl": "https://discord.com/oauth2/authorize?client_id=1527276218007687168&permissions=8&integration_type=0&scope=bot+applications.commands"
}`;
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "GEMINI_MODEL": 'gemini',
  "processTicketMessage": async () => null,
  "generateAutoReply": async () => null,
  "destroyChatSession": () => undefined,
  "getTicketAiSettingsFromGuild": () => ({}),
  "generateResponse": async () => null,
  "checkTicketAiLimit": () => ({ allowed: true, usage: 0, limit: 0 }),
  "incrementTicketAiUsage": () => undefined,
});
