const { createCanvas, loadImage } = require('canvas');
const { drawMascot, roundRect, fit, BLUE, INK, DISPLAY, BODY } = require('./mascotArt');

/**
 * 900x280 seviye kartı: beyaz zemin, kobalt ilerleme çubuğu, maskot seviyeye göre ruh hâli değiştirir.
 */
async function createRankCard(user, rankData = {}) {
  const W = 900, H = 280;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // features/levels.js seviye içi XP'yi (cur/need) hazır verir; eski çağrılar toplam XP'den hesaplatır
  const isEn = !!rankData.isEn;
  const locale = isEn ? 'en-US' : 'tr-TR';
  const level = rankData.level ?? 1;
  const rank = rankData.rank || null;
  let cur, need;
  if (Number.isFinite(rankData.cur) && Number.isFinite(rankData.need)) {
    cur = Math.max(0, rankData.cur);
    need = Math.max(1, rankData.need);
  } else {
    const xp = rankData.xp || 0;
    const xpForCurrent = Math.pow((level - 1) / 0.1, 2);
    const xpForNext = Math.pow(level / 0.1, 2);
    cur = Math.max(0, xp - xpForCurrent);
    need = Math.max(1, xpForNext - xpForCurrent);
  }
  const pct = Math.min(100, Math.max(0, Math.round((cur / need) * 100)));

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#eef4ff'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

  // Avatar
  const ax = 112, ay = 140, ar = 64;
  ctx.fillStyle = BLUE;
  ctx.beginPath(); ctx.arc(ax, ay, ar + 7, 0, Math.PI * 2); ctx.fill();
  try {
    const url = typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ extension: 'png', size: 256 }) : user.avatarURL;
    const img = await loadImage(url);
    ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, ax - ar, ay - ar, ar * 2, ar * 2); ctx.restore();
  } catch (_) {
    ctx.fillStyle = '#dbe6ff'; ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.fill();
  }

  const tx = 214;
  const username = user.displayName || user.username || (isEn ? 'Member' : 'Kullanıcı');
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `800 28px ${DISPLAY}`;
  ctx.fillText(fit(ctx, username, 280, `800 28px ${DISPLAY}`), tx, 86);
  ctx.fillStyle = '#44506a';
  ctx.font = `600 17px ${BODY}`;
  ctx.fillText(rank ? (isEn ? `Rank #${rank}` : `#${rank}. sıra`) : (isEn ? 'Not ranked yet' : 'Henüz sırada değil'), tx, 116);

  // Seviye, sağ üst
  ctx.textAlign = 'right';
  ctx.fillStyle = BLUE;
  ctx.font = `800 30px ${DISPLAY}`;
  ctx.fillText(`LVL ${level}`, 640, 86);
  ctx.textAlign = 'left';

  // XP çubuğu
  const bx = tx, by = 168, bw = 640 - tx, bh = 24;
  ctx.fillStyle = '#44506a'; ctx.font = `700 15px ${BODY}`;
  ctx.fillText(`${Math.round(cur).toLocaleString(locale)} / ${Math.round(need).toLocaleString(locale)} XP`, bx, 156);
  ctx.textAlign = 'right'; ctx.fillStyle = BLUE; ctx.fillText(isEn ? `${pct}%` : `%${pct}`, bx + bw, 156); ctx.textAlign = 'left';
  ctx.fillStyle = '#dbe6ff'; roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
  if (pct > 0) { ctx.fillStyle = BLUE; roundRect(ctx, bx, by, Math.max(bh, (bw * pct) / 100), bh, 12); ctx.fill(); }
  ctx.fillStyle = '#44506a'; ctx.font = `500 14px ${BODY}`;
  ctx.fillText(rankData.hint || (isEn ? 'Chat to earn XP' : 'Mesaj yazarak XP kazan'), bx, 226);

  // Maskot: seviyeye göre ruh hâli
  const mood = pct >= 80 ? 'happy' : 'idle';
  const mx = 676;
  ctx.fillStyle = '#eef4ff'; roundRect(ctx, mx - 12, 24, 224, 232, 28); ctx.fill();
  ctx.fillStyle = 'rgba(0, 40, 140, 0.13)';
  ctx.beginPath(); ctx.ellipse(mx + 100, 222, 70, 9, 0, 0, Math.PI * 2); ctx.fill();
  drawMascot(ctx, mx + 22, 54, 12.2, mood, 'blue');

  return canvas.toBuffer('image/png');
}

module.exports = { createRankCard };
