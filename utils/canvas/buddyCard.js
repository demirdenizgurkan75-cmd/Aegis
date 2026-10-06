const { createCanvas } = require('canvas');

const BLUE = '#0066ff';
const EYE = '#07101f';
const SIGN = '#f0b232';
const INK = '#07101f';
const SOFT = '#44506a';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Maskotu hücre birimiyle çizer: viewBox x 0–13, y -3–8 (sitedeki PixelMascot ile aynı geometri). */
function drawMascot(ctx, ox, oy, S, mood, stage) {
  const X = (x) => ox + x * S;
  const Y = (y) => oy + (y + 3) * S;
  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(X(x), Y(y), w * S, h * S); };
  const up = mood === 'happy' || mood === 'alert';
  const typing = mood === 'type';
  const armY = up ? 0 : typing ? 2.6 : 2;
  const armH = up ? 3.2 : 2;

  // Pelerin (arkada)
  if (stage >= 2) {
    ctx.fillStyle = '#d63a3a';
    ctx.beginPath();
    ctx.moveTo(X(1.2), Y(1)); ctx.lineTo(X(11.8), Y(1)); ctx.lineTo(X(12.8), Y(7.4)); ctx.lineTo(X(0.2), Y(7.4)); ctx.closePath();
    ctx.fill();
  }
  // Gövde
  ctx.fillStyle = BLUE;
  ctx.beginPath();
  [[2, 0], [11, 0], [11, 1], [12, 1], [12, 5], [11, 5], [11, 6], [2, 6], [2, 5], [1, 5], [1, 1], [2, 1]].forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.closePath();
  ctx.fill();
  [2, 4, 8, 10].forEach((x) => rect(x, 5.9, 1, 2.1, BLUE));
  rect(0, armY, 1.05, armH, BLUE);
  rect(11.95, armY, 1.05, armH, BLUE);

  // Gözler
  const T = 0.375;
  if (mood === 'happy') {
    [4, 8].forEach((cx) => { rect(cx - 0.1, 1.5, 1.2, T, EYE); rect(cx - 0.1 - T, 1.5 + T, T, T, EYE); rect(cx + 1.1, 1.5 + T, T, T, EYE); });
  } else if (mood === 'sad') {
    rect(3.95, 2.2, 1.1, T, EYE); rect(7.95, 2.2, 1.1, T, EYE);
  } else {
    const wide = mood === 'alert';
    const w = wide ? 0.5 : T, h = wide ? 2 : 1.5, y = wide ? 0.75 : 1;
    rect(4.3 + (T - w) / 2, y, w, h, EYE); rect(8.3 + (T - w) / 2, y, w, h, EYE);
  }
  if (typing) { rect(2, 3, 9, 4, '#c9d3e3'); rect(2, 7, 9, 1, '#8f9bb3'); rect(6, 4, 1, 1, BLUE); }

  // Başlık aksesuarları
  if (stage >= 3) { rect(2, -0.9, 9, 0.9, '#9aa7bd'); rect(3.5, -1.6, 6, 0.7, '#b8c3d6'); }
  if (stage >= 4) {
    rect(3, -0.6, 7, 0.6, SIGN);
    [3, 6, 9].forEach((x) => rect(x, -1.9, 1, 1.4, SIGN));
  }
  if (mood === 'alert') { const sx = stage >= 3 ? 11.6 : 6; rect(sx, -2.9, 1, 1.7, SIGN); rect(sx, -0.9, 1, 0.7, SIGN); }
}

/**
 * 900x400 Buddy kartı.
 * data: { name, level, stageName, moodKey, moodLabel, xpIntoLevel, xpForNext, msgs, voiceHours, days,
 *         labels:{ level, messages, voice, days, xp } }
 */
function createBuddyCard(data) {
  const W = 900, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#eef4ff';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

  // Sol panel + maskot
  ctx.fillStyle = '#eef4ff';
  roundRect(ctx, 24, 24, 380, 352, 28); ctx.fill();
  const S = 23;
  const stageScale = [0.78, 0.88, 1, 1, 1][Math.min(4, data.stage || 0)];
  const s = S * stageScale;
  const mw = 13 * s;
  const ox = 24 + (380 - mw) / 2;
  const oy = 70 + (S - s) * 4;
  ctx.fillStyle = 'rgba(0, 40, 140, 0.13)';
  ctx.beginPath(); ctx.ellipse(24 + 190, 326, 105 * stageScale, 14, 0, 0, Math.PI * 2); ctx.fill();
  drawMascot(ctx, ox, oy, s, data.moodKey || 'idle', data.stage || 0);

  // Sağ taraf
  const x0 = 444;
  ctx.fillStyle = INK;
  ctx.font = '900 46px sans-serif';
  ctx.textBaseline = 'alphabetic';
  let name = String(data.name || 'Aegis');
  while (ctx.measureText(name).width > 420 && name.length > 3) name = name.slice(0, -1);
  ctx.fillText(name, x0, 86);

  ctx.fillStyle = SOFT;
  ctx.font = '600 22px sans-serif';
  ctx.fillText(`${data.stageName} • ${data.labels.level} ${data.level}`, x0, 122);

  // Ruh hâli hapı
  ctx.font = '700 18px sans-serif';
  const moodText = data.moodLabel || '';
  const mwid = ctx.measureText(moodText).width + 36;
  ctx.fillStyle = '#eef4ff';
  roundRect(ctx, x0, 144, mwid, 34, 17); ctx.fill();
  ctx.fillStyle = BLUE;
  ctx.fillText(moodText, x0 + 18, 167);

  // XP çubuğu
  const bx = x0, by = 212, bw = 420, bh = 20;
  ctx.fillStyle = '#dbe6ff';
  roundRect(ctx, bx, by, bw, bh, 10); ctx.fill();
  const pct = Math.max(0, Math.min(1, data.xpForNext ? data.xpIntoLevel / data.xpForNext : 0));
  if (pct > 0.01) { ctx.fillStyle = BLUE; roundRect(ctx, bx, by, Math.max(20, bw * pct), bh, 10); ctx.fill(); }
  ctx.fillStyle = SOFT;
  ctx.font = '600 16px sans-serif';
  ctx.fillText(`${data.labels.xp} ${Math.floor(data.xpIntoLevel)} / ${Math.floor(data.xpForNext)}`, bx, by + 46);

  // İstatistik kutuları
  const stats = [
    [String(data.msgs), data.labels.messages],
    [String(data.voiceHours), data.labels.voice],
    [String(data.days), data.labels.days],
  ];
  const tw = 132, th = 84, gap = 12, ty = 276;
  stats.forEach(([v, label], i) => {
    const tx = x0 + i * (tw + gap);
    ctx.fillStyle = '#f4f7ff';
    roundRect(ctx, tx, ty, tw, th, 16); ctx.fill();
    ctx.fillStyle = INK; ctx.font = '900 30px sans-serif';
    ctx.fillText(v, tx + 16, ty + 40);
    ctx.fillStyle = SOFT; ctx.font = '600 15px sans-serif';
    ctx.fillText(label, tx + 16, ty + 66);
  });

  return canvas.toBuffer('image/png');
}

module.exports = { createBuddyCard };
