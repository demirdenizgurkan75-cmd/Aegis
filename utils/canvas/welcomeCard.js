const { createCanvas, loadImage } = require('canvas');
const { drawMascot, drawDotFloor, roundRect, fit, BLUE, INK, DISPLAY, BODY } = require('./mascotArt');
const { getGuildLanguage } = require('../i18n');

/**
 * 900x340 karşılama kartı: beyaz zemin, kobalt nokta zemini, maskot el sallıyor.
 * (Sitedeki reklam diliyle aynı: kobalt, beyaz, Panchang başlık.)
 */
async function createWelcomeCard(member) {
  const isEn = getGuildLanguage(member.guild.id) === 'en';
  const W = 900, H = 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Sağ blok: kobalt zemin, nokta zemini ve maskot
  const bx = 600;
  ctx.fillStyle = BLUE;
  ctx.fillRect(bx, 0, W - bx, H);
  drawDotFloor(ctx, bx, 150, W - bx, 190, 'rgba(255,255,255,0.32)');
  drawMascot(ctx, bx + 52, 80, 15.5, 'happy', 'white');
  ctx.fillStyle = 'rgba(0,30,110,0.28)';
  ctx.beginPath(); ctx.ellipse(bx + 150, 258, 82, 10, 0, 0, Math.PI * 2); ctx.fill();

  // Avatar
  const ax = 118, ay = 170, ar = 62;
  ctx.fillStyle = BLUE;
  ctx.beginPath(); ctx.arc(ax, ay, ar + 7, 0, Math.PI * 2); ctx.fill();
  try {
    const img = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
    ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, ax - ar, ay - ar, ar * 2, ar * 2); ctx.restore();
  } catch (_) {
    ctx.fillStyle = '#dbe6ff'; ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.fill();
  }

  // Metin
  const tx = 224;
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 34px ${DISPLAY}`;
  ctx.fillText(isEn ? 'WELCOME' : 'HOŞ GELDİN', tx, 128);

  const name = fit(ctx, member.user.displayName || member.user.username || '', 350, `700 28px ${DISPLAY}`);
  ctx.fillStyle = BLUE;
  ctx.font = `700 28px ${DISPLAY}`;
  ctx.fillText(name, tx, 176);

  const server = fit(ctx, member.guild.name || 'Sunucu', 340, `500 18px ${BODY}`);
  ctx.fillStyle = '#44506a';
  ctx.font = `500 18px ${BODY}`;
  ctx.fillText(server, tx, 210);

  const count = member.guild.memberCount || 1;
  const label = isEn ? `Member #${count}` : `${count}. üye`;
  ctx.font = `700 16px ${BODY}`;
  const pw = ctx.measureText(label).width + 36;
  ctx.fillStyle = '#eef4ff';
  roundRect(ctx, tx, 236, pw, 36, 18); ctx.fill();
  ctx.fillStyle = BLUE;
  ctx.fillText(label, tx + 18, 260);

  return canvas.toBuffer('image/png');
}

module.exports = { createWelcomeCard };
