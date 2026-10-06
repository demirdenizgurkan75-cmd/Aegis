// ─── AEGIS SMART MATH & CALCULATION ENGINE ──────────────────────────────────
const { GoogleGenAI } = require('@google/genai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Faktöriyel hesaplayıcı
 */
function factorial(n) {
  if (n < 0 || n > 170 || !Number.isInteger(n)) return NaN;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

/**
 * Sayıyı yerel formatta temiz gösterir
 */
function formatNumber(num, isEn = false) {
  if (typeof num !== 'number' || Number.isNaN(num)) return String(num);
  if (!Number.isFinite(num)) return isEn ? 'Infinity' : 'Sonsuz';

  const locale = isEn ? 'en-US' : 'tr-TR';
  if (Number.isInteger(num)) {
    return num.toLocaleString(locale);
  }
  // En fazla 6 basamak ondalık
  const rounded = parseFloat(num.toFixed(6));
  return rounded.toLocaleString(locale, { maximumFractionDigits: 6 });
}

/**
 * Güvenli ve hızlı aritmetik/fonksiyon hesaplayıcı
 */
function evaluateMath(rawExpr, isEn = false) {
  if (!rawExpr || typeof rawExpr !== 'string') {
    return { success: false, error: isEn ? 'Empty expression' : 'Boş ifade' };
  }

  let expr = rawExpr.trim();

  // Yüzde kalıpları: "15% of 80", "20% off 500"
  const pctOfRegex = /(\d+(?:\.\d+)?)\s*%\s*(?:of|si|si\s*kac|i|i\s*kac|'si|'i)\s*(\d+(?:\.\d+)?)/i;
  const matchPct1 = expr.match(pctOfRegex);
  if (matchPct1) {
    const pct = parseFloat(matchPct1[1]);
    const total = parseFloat(matchPct1[2]);
    const val = (pct / 100) * total;
    return {
      success: true,
      result: val,
      formatted: formatNumber(val, isEn),
      expr: isEn ? `${pct}% of ${formatNumber(total, isEn)}` : `${formatNumber(total, isEn)} sayısının %${pct}'i`,
      type: 'percentage'
    };
  }

  // Türkçe yüzde kalıpları: "500'ün %20'si", "200 ün yüzde 15 i"
  const pctTrRegex = /(\d+(?:\.\d+)?)(?:['’]?(?:ün|un|in|ın|nin|nın|den|dan))?\s*(?:%\s*|yüzde\s+|yuzde\s+)(\d+(?:\.\d+)?)(?:['’]?(?:si|i|si\s*kaç|i\s*kaç))?/i;
  const matchPct2 = expr.match(pctTrRegex);
  if (matchPct2) {
    const total = parseFloat(matchPct2[1]);
    const pct = parseFloat(matchPct2[2]);
    const val = (pct / 100) * total;
    return {
      success: true,
      result: val,
      formatted: formatNumber(val, isEn),
      expr: `${formatNumber(total, isEn)} sayısının %${pct}'i`,
      type: 'percentage'
    };
  }

  // Sık kullanılan matematiksel semboller ve kısaltmalar
  let cleanExpr = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**')
    .replace(/karek[oö]k\s*\(/gi, 'Math.sqrt(')
    .replace(/k[oö]k\s*\(/gi, 'Math.sqrt(')
    .replace(/sqrt\s*\(/gi, 'Math.sqrt(')
    .replace(/cbrt\s*\(/gi, 'Math.cbrt(')
    .replace(/abs\s*\(/gi, 'Math.abs(')
    .replace(/mutlak\s*\(/gi, 'Math.abs(')
    .replace(/ln\s*\(/gi, 'Math.log(')
    .replace(/log\s*\(/gi, 'Math.log10(')
    .replace(/pi\b/gi, 'Math.PI')
    .replace(/π/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E');

  // Faktöriyel (Örn: 5!)
  cleanExpr = cleanExpr.replace(/(\d+)!/g, (_, n) => `factorial(${n})`);

  // Güvenlik denetimi (Sadece izinli Math fonksiyonları, sayılar ve matematik operatörleri)
  const stripped = cleanExpr.replace(/Math\.(sqrt|cbrt|abs|log|log10|round|floor|ceil|min|max|pow|sin|cos|tan|PI|E)|factorial/g, '');
  if (!/^[0-9+\-*/%*()\s.,]+$/.test(stripped)) {
    return { success: false, error: isEn ? 'Not a pure arithmetic expression' : 'Saf bir aritmetik işlem değil' };
  }

  try {
    const func = new Function('factorial', `return (${cleanExpr});`);
    const val = func(factorial);

    if (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)) {
      return {
        success: true,
        result: val,
        formatted: formatNumber(val, isEn),
        expr: rawExpr,
        type: 'arithmetic'
      };
    }
    return { success: false, error: isEn ? 'Calculation resulted in NaN or Infinity' : 'İşlem tanımsız veya sonsuz sonuç verdi' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Denklem, sözel problem veya ileri matematik için AI Çözücü
 */
async function solveMathWithAi(problem, isEn = false) {
  const apiKey = process.env.GEMINI_API_KEY || GEMINI_API_KEY;
  if (!apiKey) {
    return isEn
      ? "I don't have my AI engine active right now to solve this complex equation!"
      : "Şu an bu karmaşık denklemi çözmek için yapay zeka motorum aktif değil!";
  }

  const prompt = isEn
    ? `You are Aegis, a sharp, genius AI Discord companion with elite math skills.
Solve the following math question, equation, or word problem clearly and accurately:
"${problem}"

RULES:
- DO NOT start with any greeting (never say "hello", "hey", "what's up").
- State the final result clearly in bold (e.g. "**Result: x = 12**").
- Provide a brief, crisp explanation of the solution steps in 1 to 2 short sentences.
- Keep the tone confident, casual, and friendly like a Discord friend. Max 3 sentences total.`
    : `Sen matematik, denklem ve problem çözmede dahi, kafa dengi ve samimi Discord arkadaşı Aegis'sin.
Şu matematik sorusunu, denklemini veya problemini net, hatasız ve anlaşılır şekilde çöz:
"${problem}"

KURALLAR:
- KESİNLİKLE hiçbir selam veya giriş cümlesiyle başlama ("selam", "merhaba", "naber" YASAK).
- Nihai sonucu açıkça ve kalın olarak belirt (Örn: "**Sonuç: x = 12**").
- Çözüm adımlarını veya mantığını 1-2 kısa, net cümleyle açıkla.
- Samimi ve kafa dengi bir tonda yaz. Toplamda en fazla 3 cümle olsun.`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const mathModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.5-flash'];
    let res = null;
    for (const m of mathModels) {
      try {
        res = await ai.models.generateContent({
          model: m,
          contents: [{ parts: [{ text: prompt }] }],
          config: { maxOutputTokens: 250, temperature: 0.2 },
        });
        if (res && res.text) break;
      } catch (err) {
        // try next
      }
    }

    if (res && typeof res.text === 'string' && res.text.trim().length > 0) {
      let clean = res.text.trim();
      clean = clean.replace(/^(Aegis|Bot|AI):\s*/i, '');
      return clean;
    }
  } catch (err) {
    console.error('[solveMathWithAi Error]:', err.message);
  }

  return isEn
    ? `Could not solve this mathematical problem right now: ${problem}`
    : `Bu matematik problemini şu an çözemedim: ${problem}`;
}

/**
 * Hem hızlı aritmetik hem AI denklem çözümünü birleştiren ana fonksiyon
 */
async function calculateOrSolve(query, isEn = false) {
  if (!query || typeof query !== 'string') {
    return {
      text: isEn ? 'Please provide a valid math expression!' : 'Lütfen geçerli bir matematiksel işlem veya soru belirtin!',
      success: false,
    };
  }

  // Temizlik
  let cleanQuery = query
    .replace(/<@!?\d+>/g, '')
    .replace(/\baegis\s*(guard)?\b/gi, '')
    .replace(/\b(hesapla|calculate|solve|çöz|coz|matematik|math|calc|islem|işlem|kaç eder|kac eder|kaçtır|kactir|nedir)\b/gi, '')
    .replace(/[?=]/g, ' ')
    .trim();

  if (!cleanQuery) {
    cleanQuery = query.trim();
  }

  // 1. Önce hızlı ve kesin aritmetik hesaplayıcıyı dene
  const evalResult = evaluateMath(cleanQuery, isEn);
  if (evalResult.success) {
    const replyText = isEn
      ? `🧮 **${evalResult.expr}** = **${evalResult.formatted}**`
      : `�� **${evalResult.expr}** = **${evalResult.formatted}**`;
    return {
      success: true,
      text: replyText,
      result: evalResult.formatted,
      expr: evalResult.expr,
      type: evalResult.type
    };
  }

  // 2. Aritmetik değilse (Örn: "3x + 15 = 45 ise x kaçtır", sözel soru vb.), AI Çözücüye devret
  const aiAnswer = await solveMathWithAi(query, isEn);
  return {
    success: true,
    text: aiAnswer,
    type: 'ai_solved'
  };
}

module.exports = {
  evaluateMath,
  solveMathWithAi,
  calculateOrSolve,
  formatNumber,
};
