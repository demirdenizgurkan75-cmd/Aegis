/**
 * Aegis emoji seti: 12 maskot ruh hâli + 12 durum işareti + 26 özellik simgesi (toplam 50).
 * Simgeler 12x12 piksel ızgarada çizilir, etrafına otomatik 1 piksel koyu çerçeve eklenir (açık ve koyu temada okunur),
 * sonra 128x128 şeffaf PNG'ye büyütülür. Maskotlar mascotArt.js'teki geometriyle çizilir.
 */
const { createCanvas } = require('canvas');
const { drawMascot } = require('./mascotArt');

const PAL = {
  B: '#0066ff', b: '#0047b3', L: '#8ec1ff', W: '#ffffff', K: '#07101f', Y: '#f0b232', y: '#b57d0a',
  G: '#3ba55c', g: '#2a7f45', R: '#ed4245', r: '#a5262a', S: '#c9d3e3', s: '#8f9bb3', P: '#ff7aa8',
  O: '#f57c00', N: '#8a5a2b', n: '#c48a4a',
};
const N = 12;
const grid = () => Array.from({ length: N }, () => Array(N).fill(null));
const set = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = c; };
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(g, x + i, y + j, c); };
const pts = (g, list, c) => list.forEach(([x, y]) => set(g, x, y, c));
const disc = (g, cx, cy, r, c) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y][x] = c; };
const clear = (g, cx, cy, r) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y][x] = null; };
function map(rows) {
  const g = grid();
  const w = Math.max(...rows.map((r) => r.length));
  const ox = Math.floor((N - w) / 2), oy = Math.floor((N - rows.length) / 2);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && ch !== ' ') set(g, x + ox, y + oy, PAL[ch]); }));
  return g;
}
const line = (g, x0, y0, x1, y1, c, th = 1) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    rect(g, x, y, th, th, c);
  }
};

const ICONS = {
  // ── Durum işaretleri ──
  ok: () => { const g = grid(); disc(g, 5.5, 5.5, 5.8, PAL.G); pts(g, [[2, 6], [3, 7], [4, 8], [5, 7], [6, 6], [7, 5], [8, 4], [9, 3], [2, 7], [3, 8], [4, 9], [5, 8], [6, 7], [7, 6], [8, 5], [9, 4]].map(([x, y]) => [x, y - 1]), PAL.W); return g; },
  no: () => { const g = grid(); disc(g, 5.5, 5.5, 5.8, PAL.R); for (let i = 0; i < 6; i++) { pts(g, [[3 + i, 3 + i], [4 + i, 3 + i], [8 - i, 3 + i], [7 - i, 3 + i]], PAL.W); } return g; },
  warn: () => { const g = grid(); for (let y = 0; y < 11; y++) { const half = y * 0.55; for (let x = 0; x < N; x++) if (Math.abs(x - 5.5) <= half + 0.5) g[y][x] = PAL.Y; } rect(g, 5, 4, 2, 3, PAL.K); rect(g, 5, 8, 2, 1, PAL.K); return g; },
  info: () => { const g = grid(); disc(g, 5.5, 5.5, 5.8, PAL.B); rect(g, 5, 2, 2, 2, PAL.W); rect(g, 5, 5, 2, 5, PAL.W); return g; },
  lock: () => { const g = grid(); rect(g, 3, 1, 2, 5, PAL.S); rect(g, 7, 1, 2, 5, PAL.S); rect(g, 4, 0, 4, 2, PAL.S); rect(g, 1, 5, 10, 7, PAL.Y); rect(g, 1, 10, 10, 2, PAL.y); rect(g, 5, 7, 2, 3, PAL.K); return g; },
  unlock: () => { const g = grid(); rect(g, 2, 1, 2, 5, PAL.S); rect(g, 3, 0, 6, 2, PAL.S); rect(g, 8, 1, 2, 3, PAL.S); rect(g, 1, 5, 10, 7, PAL.Y); rect(g, 1, 10, 10, 2, PAL.y); rect(g, 5, 7, 2, 3, PAL.K); return g; },
  wait: () => map(['SSSSSSSSSS', 'SSSSSSSSSS', '.LLLLLLLL.', '..LYYYYL..', '...LYYL...', '....LL....', '....LL....', '...LyyL...', '..LyyyyL..', '.LYYYYYYL.', 'SSSSSSSSSS', 'SSSSSSSSSS']),
  on: () => { const g = grid(); rect(g, 0, 3, 12, 6, PAL.G); rect(g, 1, 2, 10, 8, PAL.G); disc(g, 8.5, 5.5, 2.4, PAL.W); return g; },
  off: () => { const g = grid(); rect(g, 0, 3, 12, 6, PAL.s); rect(g, 1, 2, 10, 8, PAL.s); disc(g, 3.5, 5.5, 2.4, PAL.W); return g; },
  bell: () => map(['.....YY.....', '....YYYY....', '...YYYYYY...', '..YYYYYYYY..', '..YYYYYYYY..', '..YYYYYYYY..', '.YYYYYYYYYY.', '.yyyyyyyyyy.', '.YYYYYYYYYY.', '.....yy.....', '.....yy.....']),
  pin: () => { const g = grid(); disc(g, 5.5, 3, 3.2, PAL.R); pts(g, [[4, 2], [4, 3]], PAL.W); rect(g, 4, 6, 4, 1, PAL.r); rect(g, 5, 7, 2, 2, PAL.S); rect(g, 5, 9, 1, 3, PAL.s); return g; },
  clock: () => { const g = grid(); disc(g, 5.5, 5.5, 5.8, PAL.S); disc(g, 5.5, 5.5, 4.4, PAL.W); rect(g, 5, 2, 1, 4, PAL.B); rect(g, 5, 5, 4, 1, PAL.B); return g; },

  // ── Özellik simgeleri ──
  shield: () => map(['BBBBBBBBBB', 'BLLBBBBBBb', 'BLLBBBBBBb', 'BLBBBBBBBb', 'BBBBBBBBBb', 'BBBBBBBBBb', '.BBBBBBBb.', '..BBBBBb..', '...BBBb...', '....Bb....']),
  gate: () => { const g = grid(); rect(g, 0, 0, 12, 12, PAL.B); rect(g, 0, 10, 12, 2, PAL.b); rect(g, 3, 4, 6, 8, PAL.L); rect(g, 4, 2, 4, 2, PAL.L); rect(g, 6, 3, 1, 9, PAL.s); rect(g, 5, 7, 1, 2, PAL.W); rect(g, 7, 7, 1, 2, PAL.W); return g; },
  scales: () => map(['.....YY.....', 'YYYYYYYYYYYY', '.y...YY...y.', '.y...YY...y.', 'YYYY.YY.YYYY', '.YY..YY..YY.', '.....YY.....', '.....YY.....', '....YYYY....', '...YYYYYY...']),
  ticket: () => { const g = grid(); rect(g, 0, 2, 12, 8, PAL.B); pts(g, [[0, 5], [0, 6], [11, 5], [11, 6]], null); rect(g, 2, 4, 4, 1, PAL.W); rect(g, 2, 7, 4, 1, PAL.W); pts(g, [[8, 3], [8, 5], [8, 7], [8, 9]], PAL.W); return g; },
  gift: () => map(['...YY..YY...', '..YYYYYYYY..', '...YYYYYY...', 'RRRRYYYYRRRR', 'RRRRYYYYRRRR', '.RRRYYYYRRR.', '.RRRYYYYRRR.', '.RRRYYYYRRR.', '.RRRYYYYRRR.', '.rrrYYYYrrr.']),
  medal: () => { const g = grid(); rect(g, 2, 0, 3, 5, PAL.R); rect(g, 7, 0, 3, 5, PAL.B); disc(g, 5.5, 7.5, 4.1, PAL.Y); disc(g, 5.5, 7.5, 2.6, PAL.y); rect(g, 5, 6, 2, 3, PAL.Y); return g; },
  crown: () => map(['.Y...YY...Y.', '.YY..YY..YY.', '.YYY.YY.YYY.', '.YYYYYYYYYY.', '.YYYYYYYYYY.', '.YYYYYYYYYY.', '.yyyyyyyyyy.', '.YRYYBYYRYY.', '.yyyyyyyyyy.']),
  hammer: () => { const g = grid(); rect(g, 1, 0, 9, 5, PAL.S); rect(g, 1, 4, 9, 1, PAL.s); rect(g, 10, 1, 1, 3, PAL.s); rect(g, 4, 5, 3, 7, PAL.N); rect(g, 6, 5, 1, 7, PAL.n); return g; },
  ban: () => { const g = grid(); disc(g, 5.5, 5.5, 5.8, PAL.R); disc(g, 5.5, 5.5, 3.8, PAL.W); line(g, 2, 9, 9, 2, PAL.R, 2); return g; },
  globe: () => { const g = grid(); disc(g, 5.5, 5.5, 5.8, PAL.B); pts(g, [[3, 2], [4, 2], [2, 3], [3, 3], [4, 3], [3, 4], [6, 3], [7, 3], [7, 4], [8, 4], [6, 6], [7, 6], [7, 7], [8, 7], [5, 8], [6, 8], [5, 9], [3, 6], [4, 6]], PAL.G); pts(g, [[2, 7], [2, 8]], PAL.L); return g; },
  chat: () => { const g = grid(); rect(g, 0, 1, 12, 7, PAL.W); pts(g, [[0, 1], [11, 1], [0, 7], [11, 7]], null); rect(g, 2, 8, 3, 2, PAL.W); rect(g, 1, 10, 2, 1, PAL.W); pts(g, [[3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4]], null); pts(g, [[3, 4], [6, 4], [9, 4]], PAL.B); return g; },
  bot: () => { const g = grid(); rect(g, 5, 1, 2, 2, PAL.Y); rect(g, 1, 3, 10, 7, PAL.B); pts(g, [[1, 3], [10, 3], [1, 9], [10, 9]], null); rect(g, 0, 5, 1, 3, PAL.b); rect(g, 11, 5, 1, 3, PAL.b); rect(g, 3, 5, 2, 2, PAL.W); rect(g, 7, 5, 2, 2, PAL.W); rect(g, 4, 8, 4, 1, PAL.L); return g; },
  heart: () => map(['..RRR..RRR..', '.RRRRRRRRRR.', '.RWRRRRRRRR.', '.RWRRRRRRRR.', '.RRRRRRRRRR.', '..RRRRRRRR..', '...RRRRRR...', '....RRRR....', '.....RR.....']),
  star: () => map(['.....YY.....', '.....YY.....', '....YYYY....', 'YYYYYYYYYYYY', '.YYYYYYYYYY.', '..YYYYYYYY..', '...YYYYYY...', '..YYYYYYYY..', '..YYY..YYY..', '.YYY....YYY.', '.YY......YY.']),
  flame: () => map(['.....O......', '....OO......', '....OOO..O..', '...OOOO.OO..', '..OOOOOOOO..', '..OOYYYYOO..', '.OOOYYYYOOO.', '.OOYYYYYYOO.', '.OOYYWWYYOO.', '..OOYWWYOO..', '...OOOOOO...']),
  trophy: () => { const g = grid(); rect(g, 2, 0, 8, 6, PAL.Y); rect(g, 0, 1, 2, 3, PAL.Y); rect(g, 10, 1, 2, 3, PAL.Y); pts(g, [[0, 1], [11, 1]], null); rect(g, 4, 6, 4, 1, PAL.Y); rect(g, 5, 7, 2, 2, PAL.y); rect(g, 3, 9, 6, 2, PAL.y); pts(g, [[3, 1], [3, 2], [3, 3]], PAL.W); return g; },
  note: () => { const g = grid(); rect(g, 6, 0, 2, 9, PAL.B); pts(g, [[8, 1], [9, 2], [10, 3], [10, 4], [9, 5]], PAL.B); pts(g, [[8, 2], [9, 3], [9, 4]], PAL.B); disc(g, 4.2, 9, 2.7, PAL.B); pts(g, [[3, 8]], PAL.L); return g; },
  chart: () => { const g = grid(); rect(g, 0, 6, 3, 5, PAL.B); rect(g, 4, 2, 3, 9, PAL.G); rect(g, 8, 4, 3, 7, PAL.Y); rect(g, 0, 11, 12, 1, PAL.s); return g; },
  key: () => { const g = grid(); disc(g, 3, 4, 3.2, PAL.Y); clear(g, 3, 4, 1.2); rect(g, 5, 5, 7, 2, PAL.Y); rect(g, 9, 7, 2, 3, PAL.Y); rect(g, 7, 7, 1, 2, PAL.Y); return g; },
  mail: () => { const g = grid(); rect(g, 0, 2, 12, 8, PAL.W); for (let i = 0; i < 6; i++) { pts(g, [[i, 2 + i], [11 - i, 2 + i]], PAL.B); } pts(g, [[5, 8], [6, 8]], PAL.B); return g; },
  eye: () => { const g = grid(); rect(g, 3, 2, 6, 1, PAL.W); rect(g, 1, 3, 10, 1, PAL.W); rect(g, 0, 4, 12, 4, PAL.W); rect(g, 1, 8, 10, 1, PAL.W); rect(g, 3, 9, 6, 1, PAL.W); disc(g, 5.5, 6, 2.6, PAL.B); rect(g, 5, 5, 2, 2, PAL.K); return g; },
  trash: () => { const g = grid(); rect(g, 4, 0, 4, 1, PAL.s); rect(g, 1, 1, 10, 2, PAL.s); rect(g, 2, 3, 8, 8, PAL.S); rect(g, 4, 4, 1, 6, PAL.s); rect(g, 7, 4, 1, 6, PAL.s); return g; },
  gear: () => { const g = grid(); disc(g, 5.5, 5.5, 4.2, PAL.S); rect(g, 5, 0, 2, 2, PAL.S); rect(g, 5, 10, 2, 2, PAL.S); rect(g, 0, 5, 2, 2, PAL.S); rect(g, 10, 5, 2, 2, PAL.S); rect(g, 1, 1, 2, 2, PAL.S); rect(g, 9, 1, 2, 2, PAL.S); rect(g, 1, 9, 2, 2, PAL.S); rect(g, 9, 9, 2, 2, PAL.S); clear(g, 5.5, 5.5, 1.9); return g; },
  search: () => { const g = grid(); disc(g, 4.5, 4.5, 4.2, PAL.B); disc(g, 4.5, 4.5, 2.7, PAL.L); line(g, 7, 7, 10, 10, PAL.N, 2); return g; },
  bolt: () => map(['.....YYYY...', '....YYYYY...', '...YYYYY....', '..YYYYYYYY..', '.....YYYY...', '....YYYY....', '...YYY......', '..YY........']),
};

/** Dış çerçeve (1 piksel koyu) ekleyip 128x128 şeffaf PNG üretir. */
function renderIcon(g) {
  const M = N + 2, S = 9;
  const out = Array.from({ length: M }, () => Array(M).fill(null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g[y][x]) out[y + 1][x + 1] = g[y][x];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const ring = [];
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) if (!out[y][x] && dirs.some(([dx, dy]) => out[y + dy]?.[x + dx])) ring.push([x, y]);
  ring.forEach(([x, y]) => { out[y][x] = PAL.K; });
  const c = createCanvas(128, 128);
  const ctx = c.getContext('2d');
  out.forEach((row, y) => row.forEach((col, x) => { if (col) { ctx.fillStyle = col; ctx.fillRect(1 + x * S, 1 + y * S, S, S); } }));
  return c.toBuffer('image/png');
}

// ── Maskot ruh hâlleri ──
const MASCOT_BASE = ['idle', 'happy', 'sad', 'alert', 'confused', 'type'];
const MASCOT_EXTRA = ['sleep', 'party', 'guard', 'love', 'cool', 'think'];

function renderMascot(mood) {
  const size = 128;
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const S = size / 13.6;
  const ox = (size - 13 * S) / 2, oy = (size - 11 * S) / 2 + 1;
  const X = (x) => ox + x * S, Y = (y) => oy + (y + 3) * S;
  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(X(x), Y(y), w * S, h * S); };
  const base = { sleep: 'sad', party: 'happy', guard: 'idle', love: 'idle', cool: 'idle', think: 'idle' }[mood] || mood;
  drawMascot(ctx, ox, oy, S, base, 'blue');
  if (mood === 'sleep') { rect(8.4, -2.6, 1.6, 0.45, '#f0b232'); rect(9.6, -2.15, 0.45, 0.6, '#f0b232'); rect(8.4, -1.55, 1.6, 0.45, '#f0b232'); rect(10.6, -3, 1.2, 0.4, '#f0b232'); rect(11.4, -2.6, 0.4, 0.5, '#f0b232'); rect(10.6, -2.1, 1.2, 0.4, '#f0b232'); }
  if (mood === 'party') {
    rect(6, -2.8, 1, 0.8, '#f0b232'); rect(5.4, -2, 2.2, 0.8, '#ff7aa8'); rect(4.8, -1.2, 3.4, 1.2, '#f0b232');
    [[1, -2, '#ff7aa8'], [11.4, -2.4, '#8ec1ff'], [0.2, 0.3, '#f0b232'], [12.2, 0.6, '#ff7aa8'], [2.6, -2.8, '#ffffff'], [10, -1.2, '#ffffff']].forEach(([x, y, col]) => rect(x, y, 0.5, 0.5, col));
  }
  if (mood === 'guard') { rect(4.3, 2.4, 4.4, 3.6, '#07101f'); rect(4.7, 2.8, 3.6, 2.8, '#ffffff'); rect(5.3, 5.6, 2.4, 0.6, '#07101f'); rect(5.7, 6.2, 1.6, 0.5, '#07101f'); rect(5.9, 3.5, 1.2, 0.5, '#0066ff'); rect(6.3, 4, 0.5, 1.2, '#0066ff'); }
  if (mood === 'love') {
    rect(3.2, 0.7, 2.4, 2.4, '#0066ff'); rect(7.2, 0.7, 2.4, 2.4, '#0066ff');
    const u = 0.34;
    [4.4, 8.4].forEach((cx) => ['.X.X.', 'XXXXX', '.XXX.', '..X..'].forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') rect(cx - 2.5 * u + i * u, 1.0 + j * u, u, u, '#ff7aa8'); })));
  }
  if (mood === 'cool') { rect(3, 0.9, 7, 1.5, '#07101f'); rect(3.5, 1.15, 0.9, 0.3, '#ffffff'); rect(7.5, 1.15, 0.9, 0.3, '#ffffff'); }
  if (mood === 'think') { rect(5.2, -2.4, 0.6, 0.6, '#f0b232'); rect(6.4, -2.4, 0.6, 0.6, '#f0b232'); rect(7.6, -2.4, 0.6, 0.6, '#f0b232'); }
  return c.toBuffer('image/png');
}

/** Tüm emoji tanımları: [{ name, png }]. İsimler Discord'da aegis_<ad> olur. */
function allEmojis() {
  const list = [];
  for (const m of [...MASCOT_BASE, ...MASCOT_EXTRA]) list.push({ name: m, png: renderMascot(m) });
  for (const [name, fn] of Object.entries(ICONS)) list.push({ name, png: renderIcon(fn()) });
  return list;
}

module.exports = { allEmojis, renderIcon, renderMascot, ICONS, MASCOT_BASE, MASCOT_EXTRA };
