/**
 * Ortak çizim parçaları: Aegis maskotu, nokta zemin, Panchang yazı tipi.
 * Sitedeki PixelMascot ile aynı geometri (viewBox x 0–13, y -3–8, hücre birimi S).
 */
const path = require('path');
const { registerFont } = require('canvas');

try {
  registerFont(path.join(__dirname, '../../assets/fonts/Panchang-Bold.otf'), { family: 'Panchang', weight: '700' });
  registerFont(path.join(__dirname, '../../assets/fonts/Panchang-Extrabold.otf'), { family: 'Panchang', weight: '800' });
} catch (_) { /* yazı tipi yoksa sans-serif kullanılır */ }

const BLUE = '#0066ff';
const INK = '#07101f';
const SIGN = '#f0b232';
const DISPLAY = '"Panchang", "Arial Black", sans-serif';
const BODY = 'sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** mood: idle | happy | sad | alert | confused | type. tone: 'blue' (açık zemin) | 'white' (mavi zemin). */
function drawMascot(ctx, ox, oy, S, mood = 'idle', tone = 'blue') {
  const body = tone === 'white' ? '#ffffff' : BLUE;
  const X = (x) => ox + x * S;
  const Y = (y) => oy + (y + 3) * S;
  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(X(x), Y(y), w * S, h * S); };
  const up = mood === 'happy' || mood === 'alert';
  const typing = mood === 'type';
  const armY = up ? 0 : typing ? 2.6 : 2;
  const armH = up ? 3.2 : 2;

  ctx.fillStyle = body;
  ctx.beginPath();
  [[2, 0], [11, 0], [11, 1], [12, 1], [12, 5], [11, 5], [11, 6], [2, 6], [2, 5], [1, 5], [1, 1], [2, 1]]
    .forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.closePath();
  ctx.fill();
  [2, 4, 8, 10].forEach((x) => rect(x, 5.9, 1, 2.1, body));
  rect(0, armY, 1.05, armH, body);
  rect(11.95, armY, 1.05, armH, body);

  const T = 0.375;
  if (mood === 'happy') {
    [4, 8].forEach((cx) => { rect(cx - 0.1, 1.5, 1.2, T, INK); rect(cx - 0.1 - T, 1.5 + T, T, T, INK); rect(cx + 1.1, 1.5 + T, T, T, INK); });
  } else if (mood === 'sad') {
    rect(3.95, 2.2, 1.1, T, INK); rect(7.95, 2.2, 1.1, T, INK);
  } else {
    const wide = mood === 'alert';
    const w = wide ? 0.5 : T, h = wide ? 2 : 1.5, y = wide ? 0.75 : 1;
    rect(4.3 + (T - w) / 2, y, w, h, INK); rect(8.3 + (T - w) / 2, y, w, h, INK);
  }
  if (typing) { rect(2, 3, 9, 4, '#c9d3e3'); rect(2, 7, 9, 1, '#8f9bb3'); rect(6, 4, 1, 1, BLUE); }
  if (mood === 'alert') { rect(6, -2.9, 1, 1.7, SIGN); rect(6, -0.9, 1, 0.7, SIGN); }
  if (mood === 'confused') {
    rect(5.5, -3, 2, 0.55, SIGN); rect(7.05, -2.45, 0.55, 0.75, SIGN); rect(6.25, -1.7, 0.8, 0.55, SIGN); rect(6.25, -0.75, 0.55, 0.55, SIGN);
  }
}

/** Sitedeki nokta zemin: perspektifte küçülen nokta ızgarası (alt kenara doğru büyür). */
function drawDotFloor(ctx, x, y, w, h, color = 'rgba(0,102,255,0.35)') {
  ctx.fillStyle = color;
  const rows = 9;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const yy = y + h * (t * t * 0.9 + 0.1 * t);
    const cols = 30;
    const spread = 0.35 + 0.65 * t;
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1) - 0.5) * 2;
      const xx = x + w / 2 + u * (w / 2) * spread * (1 + t * 0.6);
      if (xx < x - 4 || xx > x + w + 4) continue;
      const d = 1 + t * 3.2;
      ctx.beginPath(); ctx.arc(xx, yy, d / 2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function fit(ctx, text, maxW, font) {
  ctx.font = font;
  let s = String(text);
  while (ctx.measureText(s).width > maxW && s.length > 2) s = s.slice(0, -1);
  return s === String(text) ? s : s.trimEnd() + '…';
}

module.exports = { drawMascot, drawDotFloor, roundRect, fit, BLUE, INK, SIGN, DISPLAY, BODY };
