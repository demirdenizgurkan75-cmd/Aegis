// Aegis open-source build: only the first 87 of 253 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * AEGIS AI MODERASYON MOTORU — Gemini 2.0 Flash Lite
 * Kelime bazlı filtrelemenin ötesinde — mesajın gerçek tonunu anlar.
 * Sarkazm, şaka ve gerçek tehdidi birbirinden ayırt eder.
 *
 * Model: gemini-2.0-flash-lite
 * API Key: GEMINI_API_KEY (.env dosyasında tanımla)
 */

const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// ─── Sarkazm/şaka sinyalleri — bunlar varsa muhtemelen gerçek tehdit değil ──
const SARCASM_SIGNALS = [
  /lol\b/i, /haha/i, /😂/, /🤣/, /😆/, /xd/i, /kekw/i, /ahahah/i, /hahah/i,
  /şaka/i, /joke/i, /just kidding/i, /jk\b/i, /ya tutuyorum/i, /dalga/i, /ironi/i,
];

// ─── Gerçek ciddi tehdit kalıpları ───────────────────────────────────────────
const SERIOUS_THREAT_PATTERNS = [
  /seni (öldür|bul|dövüş|döv)/i,
  /ip.*at/i,
  /kafan.*sik/i,
  /hesabın.*ele/i,
  /dox(x)?la/i,
  /evini (bul|öğren)/i,
  /kill\s+you/i,
  /find\s+you/i,
  /i('ll)?\s+hurt/i,
  /doxx/i,
];

// ─── Filtre bypass denemeleri ─────────────────────────────────────────────────
const BYPASS_PATTERNS = [
  /[a4@]m[k|q]/i,
  /s[i1!]k/i,
  /f[u*]ck/i,
];

/**
 * Gemini API'ye raw HTTPS ile istek atar (ekstra npm paketi gerekmez)
 */
function callGemini(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 150,
        responseMimeType: 'application/json',
      },
    });

    const path = `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolve(text);
        } catch {
          reject(new Error('Gemini JSON parse hatası'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.write(body);
    req.end();
  });
}

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "analyzeTone": async () => ({ isThreat: false, mode: 'normal', reasoning: '', severity: 'low' }),
  "analyzeConflict": async () => null,
});
