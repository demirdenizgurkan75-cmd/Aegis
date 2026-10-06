/**
 * Aegis kart seti (reklam dili: beyaz zemin, kobalt blok, maskot, Panchang başlık).
 * Hepsi PNG Buffer döndürür. Dil için isEn bayrağı alır. Avatar yüklenemezse sade bir daire çizilir.
 */
const { createCanvas, loadImage } = require('canvas');
const { drawMascot, drawDotFloor, roundRect, fit, BLUE, INK, DISPLAY, BODY } = require('./mascotArt');

const SOFT = '#44506a';
const TINT = '#eef4ff';

async function drawAvatar(ctx, url, cx, cy, r) {
  ctx.fillStyle = BLUE;
  ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, Math.PI * 2); ctx.fill();
  try {
    if (!url) throw new Error('no avatar');
    const img = await loadImage(url);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2); ctx.restore();
  } catch (_) {
    ctx.fillStyle = '#dbe6ff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    drawMascot(ctx, cx - r * 0.62, cy - r * 0.55, (r * 1.24) / 13, 'idle', 'blue');
  }
}

/** 900x340: solda avatar ve metin, sağda kobalt blokta maskot. */
async function sideCard({ mood = 'happy', heading, name, line, pill, avatarUrl = null, headingSize = 34 }) {
  const W = 900, H = 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const bx = 600;
  ctx.fillStyle = BLUE; ctx.fillRect(bx, 0, W - bx, H);
  drawDotFloor(ctx, bx, 150, W - bx, 190, 'rgba(255,255,255,0.32)');
  drawMascot(ctx, bx + 52, 80, 15.5, mood, 'white');
  ctx.fillStyle = 'rgba(0,30,110,0.28)';
  ctx.beginPath(); ctx.ellipse(bx + 150, 258, 82, 10, 0, 0, Math.PI * 2); ctx.fill();

  await drawAvatar(ctx, avatarUrl, 118, 170, 62);

  const tx = 224;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `800 ${headingSize}px ${DISPLAY}`;
  ctx.fillText(fit(ctx, heading, 360, `800 ${headingSize}px ${DISPLAY}`), tx, 128);
  ctx.fillStyle = BLUE;
  ctx.font = `700 28px ${DISPLAY}`;
  ctx.fillText(fit(ctx, name, 350, `700 28px ${DISPLAY}`), tx, 176);
  ctx.fillStyle = SOFT;
  ctx.font = `500 18px ${BODY}`;
  ctx.fillText(fit(ctx, line, 350, `500 18px ${BODY}`), tx, 210);
  if (pill) {
    ctx.font = `700 16px ${BODY}`;
    const label = fit(ctx, pill, 340, `700 16px ${BODY}`);
    const pw = ctx.measureText(label).width + 36;
    ctx.fillStyle = TINT; roundRect(ctx, tx, 236, pw, 36, 18); ctx.fill();
    ctx.fillStyle = BLUE; ctx.fillText(label, tx + 18, 260);
  }
  return canvas.toBuffer('image/png');
}

const nm = (u) => u?.displayName || u?.username || u?.user?.displayName || u?.user?.username || '—';
const av = (u) => { try { return (u?.user || u).displayAvatarURL({ extension: 'png', size: 256 }); } catch (_) { return null; } };

/** Çekiliş kazananı. winners: [{ name, avatarUrl }] */
function winnerCard({ prize, winners = [], entries = 0, isEn }) {
  const first = winners[0] || { name: '—' };
  const more = winners.length > 1 ? ` +${winners.length - 1}` : '';
  return sideCard({
    mood: 'happy', headingSize: 32,
    heading: winners.length > 1 ? (isEn ? 'WINNERS' : 'KAZANANLAR') : (isEn ? 'WINNER' : 'KAZANAN'),
    name: `${first.name}${more}`, line: prize, avatarUrl: first.avatarUrl,
    pill: entries ? (isEn ? `${entries} entries` : `${entries} katılım`) : null,
  });
}

/** Gate sınavını geçen üye. */
function gateCard(member, isEn) {
  return sideCard({
    mood: 'happy', headingSize: 30,
    heading: isEn ? 'YOU ARE IN' : 'İÇERİDESİN', name: nm(member), avatarUrl: av(member),
    line: member.guild?.name || '', pill: isEn ? 'Rules accepted' : 'Kurallar onaylandı',
  });
}

/** Ayrılan üye. */
function goodbyeCard(member, isEn) {
  return sideCard({
    mood: 'sad', headingSize: 32,
    heading: isEn ? 'GOODBYE' : 'GÖRÜŞÜRÜZ', name: nm(member), avatarUrl: av(member),
    line: isEn ? `left ${member.guild?.name || 'the server'}` : `${member.guild?.name || 'sunucu'} sunucusundan ayrıldı`,
    pill: isEn ? `${member.guild?.memberCount || 0} members left` : `${member.guild?.memberCount || 0} üye kaldık`,
  });
}

/** Sunucuyu boost'layan üye. */
function boostCard(member, isEn) {
  const g = member.guild || {};
  return sideCard({
    mood: 'happy', headingSize: 30,
    heading: isEn ? 'THANK YOU' : 'TEŞEKKÜRLER', name: nm(member), avatarUrl: av(member),
    line: isEn ? `boosted ${g.name || 'the server'}` : `${g.name || 'sunucuyu'} boost'ladı`,
    pill: isEn ? `Tier ${g.premiumTier || 0} · ${g.premiumSubscriptionCount || 0} boosts` : `Seviye ${g.premiumTier || 0} · ${g.premiumSubscriptionCount || 0} boost`,
  });
}

/** Jüri kararı. outcome: dismissed | removed | severe | lifted | upheld */
function verdictCard({ id, outcome, votes = {}, isEn }) {
  const W = 900, H = 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const T = {
    dismissed: { tr: 'TEMİZ', en: 'CLEAR', sub: ['Mesaj temiz bulundu', 'The message was found fine'], mood: 'happy', col: '#3ba55c' },
    removed: { tr: 'İHLAL', en: 'VIOLATION', sub: ['Mesaj silindi, uyarı verildi', 'Message removed, warning issued'], mood: 'alert', col: '#ed4245' },
    severe: { tr: 'AĞIR İHLAL', en: 'SEVERE', sub: ['Silindi, uyarı ve timeout', 'Removed, warned and timed out'], mood: 'alert', col: '#ed4245' },
    lifted: { tr: 'KABUL', en: 'ACCEPTED', sub: ['İtiraz kabul edildi, ceza kalktı', 'Appeal accepted, penalty lifted'], mood: 'happy', col: '#3ba55c' },
    upheld: { tr: 'RED', en: 'REJECTED', sub: ['İtiraz reddedildi, ceza sürüyor', 'Appeal rejected, penalty stands'], mood: 'sad', col: '#ed4245' },
  }[outcome] || { tr: '—', en: '—', sub: ['', ''], mood: 'idle', col: BLUE };
  const L = isEn ? 1 : 0;

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#eef4ff'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = SOFT; ctx.font = `700 20px ${BODY}`;
  ctx.fillText(`${isEn ? 'Jury case' : 'Jüri davası'} #${id}`, 56, 70);

  // Damga
  ctx.save();
  ctx.translate(64, 190); ctx.rotate(-0.07);
  const label = T[isEn ? 'en' : 'tr'];
  let size = 74; ctx.font = `800 ${size}px ${DISPLAY}`;
  while (ctx.measureText(label).width > 430 && size > 36) { size -= 4; ctx.font = `800 ${size}px ${DISPLAY}`; }
  const w = ctx.measureText(label).width;
  ctx.strokeStyle = T.col; ctx.lineWidth = 8; roundRect(ctx, -18, -size - 6, w + 36, size + 38, 14); ctx.stroke();
  ctx.fillStyle = T.col; ctx.fillText(label, 0, 0);
  ctx.restore();

  ctx.fillStyle = INK; ctx.font = `600 20px ${BODY}`;
  ctx.fillText(T.sub[L], 56, 262);
  const pills = outcome === 'lifted' || outcome === 'upheld'
    ? [[isEn ? 'Lift' : 'Kaldır', votes.ok || 0], [isEn ? 'Uphold' : 'Sürdür', votes.bad || 0]]
    : [[isEn ? 'Fine' : 'Temiz', votes.ok || 0], [isEn ? 'Violation' : 'İhlal', (votes.bad || 0) + (votes.severe || 0)]];
  let px = 56;
  for (const [k, v] of pills) {
    ctx.font = `700 16px ${BODY}`;
    const text = `${k}: ${v}`; const pw = ctx.measureText(text).width + 32;
    ctx.fillStyle = TINT; roundRect(ctx, px, 282, pw, 34, 17); ctx.fill();
    ctx.fillStyle = BLUE; ctx.fillText(text, px + 16, 305); px += pw + 10;
  }

  ctx.fillStyle = TINT; roundRect(ctx, 612, 24, 264, 292, 28); ctx.fill();
  ctx.fillStyle = 'rgba(0,40,140,0.13)'; ctx.beginPath(); ctx.ellipse(744, 280, 76, 10, 0, 0, Math.PI * 2); ctx.fill();
  drawMascot(ctx, 648, 66, 14.5, T.mood, 'blue');
  return canvas.toBuffer('image/png');
}

/** Anket sonucu. options: [{ label, votes }] */
function pollCard({ question, options = [], total = 0, isEn }) {
  const rows = options.slice(0, 10);
  const W = 900, H = 170 + rows.length * 56 + 30;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, 112);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 26px ${DISPLAY}`;
  const q = fit(ctx, question, 640, `800 26px ${DISPLAY}`);
  ctx.fillText(q, 40, 62);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `600 17px ${BODY}`;
  ctx.fillText(`${isEn ? 'Poll results' : 'Anket sonuçları'} · ${total} ${isEn ? 'votes' : 'oy'}`, 40, 92);
  drawMascot(ctx, 770, 14, 6.4, 'happy', 'white');

  const top = Math.max(0, ...rows.map((r) => r.votes));
  rows.forEach((r, i) => {
    const y = 140 + i * 56;
    const pct = total ? r.votes / total : 0;
    const lead = top > 0 && r.votes === top;
    ctx.fillStyle = TINT; roundRect(ctx, 40, y, 820, 42, 12); ctx.fill();
    if (pct > 0) { ctx.fillStyle = lead ? BLUE : '#9cc4ff'; roundRect(ctx, 40, y, Math.max(24, 820 * pct), 42, 12); ctx.fill(); }
    ctx.font = `700 17px ${BODY}`;
    ctx.fillStyle = lead && pct > 0.3 ? '#ffffff' : INK;
    ctx.fillText(fit(ctx, r.label, 600, `700 17px ${BODY}`), 58, y + 27);
    ctx.textAlign = 'right'; ctx.fillStyle = INK;
    ctx.fillText(`${Math.round(pct * 100)}%  ·  ${r.votes}`, 846, y + 27);
    ctx.textAlign = 'left';
  });
  return canvas.toBuffer('image/png');
}

/** Haftalık sunucu özeti. */
async function weeklyCard({ guildName, iconUrl, days = [], joins = 0, messages = 0, members = 0, boosts = 0, topChannels = [], isEn }) {
  const W = 1000, H = 540;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, 120);
  drawDotFloor(ctx, 520, 20, 480, 100, 'rgba(255,255,255,0.22)');
  ctx.textBaseline = 'alphabetic';
  if (iconUrl) {
    try { const img = await loadImage(iconUrl); ctx.save(); ctx.beginPath(); ctx.arc(70, 60, 34, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, 36, 26, 68, 68); ctx.restore(); } catch (_) {}
  }
  ctx.fillStyle = '#ffffff'; ctx.font = `800 30px ${DISPLAY}`;
  ctx.fillText(fit(ctx, guildName, 560, `800 30px ${DISPLAY}`), iconUrl ? 124 : 40, 62);
  ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = `600 18px ${BODY}`;
  ctx.fillText(isEn ? 'Weekly summary' : 'Haftalık özet', iconUrl ? 124 : 40, 94);
  drawMascot(ctx, 868, 12, 7.2, 'happy', 'white');

  // Sütun grafik
  const cx = 40, cy = 160, cw = 560, ch = 250;
  ctx.fillStyle = INK; ctx.font = `800 18px ${DISPLAY}`;
  ctx.fillText(isEn ? 'Messages per day' : 'Günlük mesaj', cx, cy);
  const max = Math.max(1, ...days.map((d) => d.count));
  const bw = 52, gap = (cw - bw * 7) / 6;
  days.slice(-7).forEach((d, i) => {
    const h = Math.max(6, (d.count / max) * (ch - 70));
    const x = cx + i * (bw + gap), y = cy + 24 + (ch - 70) - h + 6;
    ctx.fillStyle = d.count === max && max > 1 ? BLUE : '#9cc4ff'; roundRect(ctx, x, y, bw, h, 10); ctx.fill();
    ctx.fillStyle = INK; ctx.font = `700 14px ${BODY}`; ctx.textAlign = 'center';
    ctx.fillText(String(d.count), x + bw / 2, y - 8);
    ctx.fillStyle = SOFT; ctx.font = `600 14px ${BODY}`;
    ctx.fillText(d.label, x + bw / 2, cy + ch - 12);
    ctx.textAlign = 'left';
  });

  // KPI kutuları
  const tiles = [[isEn ? 'Messages' : 'Mesaj', messages], [isEn ? 'New members' : 'Yeni üye', joins], [isEn ? 'Members' : 'Üye', members], ['Boost', boosts]];
  tiles.forEach(([k, v], i) => {
    const x = 640 + (i % 2) * 176, y = 150 + Math.floor(i / 2) * 104;
    ctx.fillStyle = TINT; roundRect(ctx, x, y, 164, 92, 18); ctx.fill();
    ctx.fillStyle = INK; ctx.font = `800 30px ${DISPLAY}`; ctx.fillText(Number(v).toLocaleString(isEn ? 'en-US' : 'tr-TR'), x + 16, y + 50);
    ctx.fillStyle = SOFT; ctx.font = `600 15px ${BODY}`; ctx.fillText(k, x + 16, y + 76);
  });

  // En aktif kanallar
  ctx.fillStyle = INK; ctx.font = `800 18px ${DISPLAY}`;
  ctx.fillText(isEn ? 'Most active channels' : 'En aktif kanallar', 40, 452);
  ctx.font = `700 16px ${BODY}`;
  let x = 40;
  for (const c of topChannels.slice(0, 3)) {
    const text = `#${fit(ctx, c.name, 150, `700 16px ${BODY}`)}  ${c.count}`;
    const pw = ctx.measureText(text).width + 30;
    ctx.fillStyle = TINT; roundRect(ctx, x, 470, pw, 38, 19); ctx.fill();
    ctx.fillStyle = BLUE; ctx.fillText(text, x + 15, 495); x += pw + 12;
  }
  if (!topChannels.length) { ctx.fillStyle = SOFT; ctx.font = `500 16px ${BODY}`; ctx.fillText(isEn ? 'Not enough data yet' : 'Henüz yeterli veri yok', 40, 495); }
  return canvas.toBuffer('image/png');
}


/** Profil kartı. stats: [{ k, v }] (en fazla 4). */
async function profileCard({ name, handle, avatarUrl, roleName, roleColor, stats = [], mood = 'happy', badge, isEn }) {
  const W = 900, H = 420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#eef4ff'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

  // Sağ panel: maskot
  ctx.fillStyle = TINT; roundRect(ctx, 652, 24, 224, 372, 28); ctx.fill();
  ctx.fillStyle = 'rgba(0,40,140,0.13)'; ctx.beginPath(); ctx.ellipse(764, 340, 70, 9, 0, 0, Math.PI * 2); ctx.fill();
  drawMascot(ctx, 700, 130, 12.2, mood, 'blue');

  await drawAvatar(ctx, avatarUrl, 110, 112, 62);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK; ctx.font = `800 32px ${DISPLAY}`;
  ctx.fillText(fit(ctx, name, 450, `800 32px ${DISPLAY}`), 204, 100);
  ctx.fillStyle = SOFT; ctx.font = `600 18px ${BODY}`;
  ctx.fillText(fit(ctx, handle || '', 450, `600 18px ${BODY}`), 204, 130);

  let px = 204;
  const pills = [];
  if (roleName) pills.push({ text: roleName, color: roleColor && roleColor !== '#000000' ? roleColor : BLUE, dot: true });
  if (badge) pills.push({ text: badge, color: BLUE });
  for (const pl of pills) {
    ctx.font = `700 15px ${BODY}`;
    const label = fit(ctx, pl.text, 180, `700 15px ${BODY}`);
    const pw = ctx.measureText(label).width + (pl.dot ? 52 : 32);
    ctx.fillStyle = TINT; roundRect(ctx, px, 150, pw, 32, 16); ctx.fill();
    if (pl.dot) { ctx.fillStyle = pl.color; ctx.beginPath(); ctx.arc(px + 18, 166, 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = INK; ctx.fillText(label, px + (pl.dot ? 34 : 16), 171); px += pw + 10;
  }

  // İstatistik kutuları
  stats.slice(0, 4).forEach((st, i) => {
    const x = 40 + (i % 2) * 300, y = 226 + Math.floor(i / 2) * 92;
    ctx.fillStyle = TINT; roundRect(ctx, x, y, 288, 80, 18); ctx.fill();
    ctx.fillStyle = INK; ctx.font = `800 28px ${DISPLAY}`; ctx.fillText(fit(ctx, String(st.v), 256, `800 28px ${DISPLAY}`), x + 18, y + 44);
    ctx.fillStyle = SOFT; ctx.font = `600 15px ${BODY}`; ctx.fillText(st.k, x + 18, y + 68);
  });
  return canvas.toBuffer('image/png');
}

/** Etkinlik afişi 1200x630. */
function posterCard({ title, date, place, desc, isEn }) {
  const W = 1200, H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, H);
  drawDotFloor(ctx, 0, 330, W, 300, 'rgba(255,255,255,0.26)');
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `700 24px ${DISPLAY}`;
  ctx.fillText(isEn ? 'EVENT' : 'ETKİNLİK', 72, 92);

  // Başlık: gerekirse iki satıra böl
  let size = 84; ctx.fillStyle = '#ffffff';
  const words = String(title).split(/\s+/);
  const lines = [];
  const maxW = 760;
  for (;;) {
    ctx.font = `800 ${size}px ${DISPLAY}`;
    lines.length = 0; let cur = '';
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    lines.push(cur);
    if ((lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW)) || size <= 40) break;
    size -= 6;
  }
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, 72, 190 + i * (size + 10)));
  const afterTitle = 190 + (Math.min(lines.length, 2) - 1) * (size + 10);

  const chip = (text, x, y, font) => {
    ctx.font = font; const w = ctx.measureText(text).width + 44;
    ctx.fillStyle = '#ffffff'; roundRect(ctx, x, y, w, 56, 28); ctx.fill();
    ctx.fillStyle = BLUE; ctx.fillText(text, x + 22, y + 38); return w;
  };
  let cy = afterTitle + 52;
  let cx = 72;
  if (date) cx += chip(fit(ctx, date, 420, `800 26px ${DISPLAY}`), cx, cy, `800 26px ${DISPLAY}`) + 14;
  if (place) chip(fit(ctx, place, 400, `700 26px ${BODY}`), cx, cy, `700 26px ${BODY}`);
  if (desc) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = `500 26px ${BODY}`;
    const dw = String(desc).split(/\s+/); let line = ''; let y = cy + 110; let n = 0;
    for (const w of dw) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > 700 && line) { ctx.fillText(line, 72, y); y += 36; line = w; if (++n >= 3) break; } else line = t; }
    if (n < 3 && line) ctx.fillText(line, 72, y);
  }
  drawMascot(ctx, 880, 150, 22, 'happy', 'white');
  ctx.fillStyle = 'rgba(0,30,110,0.28)'; ctx.beginPath(); ctx.ellipse(1000, 420, 120, 14, 0, 0, Math.PI * 2); ctx.fill();
  return canvas.toBuffer('image/png');
}

/** Anti-raid olay kartı. */
async function raidCard({ actorName, avatarUrl, reason, result, isEn }) {
  const W = 900, H = 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#eef4ff'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  ctx.textBaseline = 'alphabetic';

  ctx.save(); ctx.translate(48, 96); ctx.rotate(-0.05);
  ctx.font = `800 44px ${DISPLAY}`; const label = 'ANTI-RAID';
  const w = ctx.measureText(label).width;
  ctx.strokeStyle = '#ed4245'; ctx.lineWidth = 6; roundRect(ctx, -14, -50, w + 28, 70, 12); ctx.stroke();
  ctx.fillStyle = '#ed4245'; ctx.fillText(label, 0, 0); ctx.restore();

  await drawAvatar(ctx, avatarUrl, 96, 214, 46);
  ctx.fillStyle = INK; ctx.font = `800 26px ${DISPLAY}`;
  ctx.fillText(fit(ctx, actorName, 360, `800 26px ${DISPLAY}`), 170, 206);
  ctx.fillStyle = SOFT; ctx.font = `600 17px ${BODY}`;
  ctx.fillText(isEn ? 'suspect' : 'şüpheli', 170, 232);

  ctx.fillStyle = INK; ctx.font = `600 18px ${BODY}`;
  ctx.fillText(fit(ctx, reason, 520, `600 18px ${BODY}`), 48, 290);
  ctx.font = `700 15px ${BODY}`;
  const res = fit(ctx, result, 520, `700 15px ${BODY}`); const rw = ctx.measureText(res).width + 32;
  ctx.fillStyle = TINT; roundRect(ctx, 48, 300, rw, 30, 15); ctx.fill();
  ctx.fillStyle = BLUE; ctx.fillText(res, 64, 321);

  ctx.fillStyle = TINT; roundRect(ctx, 628, 24, 248, 292, 28); ctx.fill();
  ctx.fillStyle = 'rgba(0,40,140,0.13)'; ctx.beginPath(); ctx.ellipse(752, 280, 72, 9, 0, 0, Math.PI * 2); ctx.fill();
  drawMascot(ctx, 668, 68, 13.5, 'alert', 'blue');
  return canvas.toBuffer('image/png');
}

/** Grid arka planlı damga kartı: sol yarıda damga + metin, sağda maskot paneli. */
function stampBase(W, H) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#eef4ff'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx };
}
function drawStamp(ctx, label, x, y, color, maxW = 420, size = 64) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.06);
  ctx.font = `800 ${size}px ${DISPLAY}`;
  while (ctx.measureText(label).width > maxW && size > 30) { size -= 4; ctx.font = `800 ${size}px ${DISPLAY}`; }
  const w = ctx.measureText(label).width;
  ctx.strokeStyle = color; ctx.lineWidth = 7; roundRect(ctx, -16, -size - 4, w + 32, size + 34, 14); ctx.stroke();
  ctx.fillStyle = color; ctx.fillText(label, 0, 0);
  ctx.restore();
}
function mascotPanel(ctx, W, H, mood, px = 628) {
  ctx.fillStyle = TINT; roundRect(ctx, px, 24, W - px - 24, H - 48, 28); ctx.fill();
  const cx = px + (W - px - 24) / 2;
  ctx.fillStyle = 'rgba(0,40,140,0.13)'; ctx.beginPath(); ctx.ellipse(cx, H - 70, 70, 9, 0, 0, Math.PI * 2); ctx.fill();
  drawMascot(ctx, cx - 6.5 * 12.5, 56, 12.5, mood, 'blue');
}
function wrapLines(ctx, text, maxW, maxLines) {
  const out = []; let line = '';
  for (const w of String(text).split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; if (out.length >= maxLines) break; } else line = t;
  }
  if (out.length < maxLines && line) out.push(line);
  return out;
}

/** Ceza DM kartı (kick / ban): sunucu adı, sebep ve itiraz ipucu. */
function punishCard({ type, guildName, reason, isEn }) {
  const W = 900, H = 340;
  const { canvas, ctx } = stampBase(W, H);
  const T = { kick: ['KICK', isEn ? 'You were removed from' : 'Şu sunucudan atıldın'], ban: ['BAN', isEn ? 'You were banned from' : 'Şu sunucudan banlandın'] }[type] || ['!', ''];
  ctx.fillStyle = SOFT; ctx.font = `700 20px ${BODY}`;
  ctx.fillText(T[1], 56, 62);
  ctx.fillStyle = INK; ctx.font = `800 28px ${DISPLAY}`;
  ctx.fillText(fit(ctx, guildName, 520, `800 28px ${DISPLAY}`), 56, 104);
  drawStamp(ctx, T[0], 62, 190, '#ed4245', 360, 64);
  ctx.fillStyle = SOFT; ctx.font = `700 15px ${BODY}`; ctx.fillText(isEn ? 'REASON' : 'SEBEP', 56, 238);
  ctx.fillStyle = INK; ctx.font = `600 19px ${BODY}`;
  wrapLines(ctx, reason, 540, 2).forEach((l, i) => ctx.fillText(l, 56, 266 + i * 26));
  mascotPanel(ctx, W, H, 'sad');
  return canvas.toBuffer('image/png');
}

/** Moderasyon dava kartı. kase: { id, type, reason, at, edited }, userName/avatar, modName. */
async function caseCard({ id, type, userName, avatarUrl, modName, reason, dateText, edited, isEn }) {
  const W = 900, H = 340;
  const { canvas, ctx } = stampBase(W, H);
  const T = {
    warn: [isEn ? 'WARNING' : 'UYARI', '#f0b232', 'idle'], timeout: ['TIMEOUT', '#f0b232', 'sad'], kick: ['KICK', '#ed4245', 'alert'],
    ban: ['BAN', '#ed4245', 'alert'], purge: [isEn ? 'PURGE' : 'TEMİZLİK', '#3ba55c', 'happy'],
  }[type] || [String(type).toUpperCase(), BLUE, 'idle'];
  ctx.fillStyle = SOFT; ctx.font = `700 20px ${BODY}`;
  ctx.fillText(`${isEn ? 'Case' : 'Dava'} #${id}${edited ? (isEn ? ' · edited' : ' · düzenlendi') : ''}`, 56, 62);
  drawStamp(ctx, T[0], 62, 140, T[1], 360, 56);
  await drawAvatar(ctx, avatarUrl, 96, 224, 38);
  ctx.fillStyle = INK; ctx.font = `800 24px ${DISPLAY}`;
  ctx.fillText(fit(ctx, userName, 380, `800 24px ${DISPLAY}`), 152, 222);
  ctx.fillStyle = SOFT; ctx.font = `600 16px ${BODY}`;
  ctx.fillText(`${isEn ? 'by' : 'yetkili'}: ${modName}  ·  ${dateText}`, 152, 248);
  ctx.fillStyle = INK; ctx.font = `600 18px ${BODY}`;
  wrapLines(ctx, reason || '—', 560, 2).forEach((l, i) => ctx.fillText(l, 56, 292 + i * 24));
  mascotPanel(ctx, W, H, T[2]);
  return canvas.toBuffer('image/png');
}

/** Etiket spam bildirimi (kanalda kısa süre görünür). */
async function mentionCard({ userName, avatarUrl, count, minutes, isEn }) {
  const W = 900, H = 300;
  const { canvas, ctx } = stampBase(W, H);
  drawStamp(ctx, isEn ? 'MENTION SPAM' : 'ETİKET SPAM', 60, 110, '#ed4245', 480, 52);
  await drawAvatar(ctx, avatarUrl, 96, 200, 38);
  ctx.fillStyle = INK; ctx.font = `800 24px ${DISPLAY}`;
  ctx.fillText(fit(ctx, userName, 380, `800 24px ${DISPLAY}`), 152, 198);
  ctx.fillStyle = SOFT; ctx.font = `600 17px ${BODY}`;
  ctx.fillText(isEn ? `${count} mentions at once` : `Tek seferde ${count} etiket`, 152, 226);
  ctx.font = `700 15px ${BODY}`;
  const label = !minutes ? (isEn ? 'Message deleted' : 'Mesaj silindi') : (isEn ? `Message deleted · ${minutes} min timeout` : `Mesaj silindi · ${minutes} dk susturuldu`);
  const pw = ctx.measureText(label).width + 32;
  ctx.fillStyle = TINT; roundRect(ctx, 56, 248, pw, 34, 17); ctx.fill();
  ctx.fillStyle = BLUE; ctx.fillText(label, 72, 271);
  mascotPanel(ctx, W, H, 'alert');
  return canvas.toBuffer('image/png');
}

/** Komut kanalı kilidi: "komutlar burada kapalı". */
function lockCard({ channels = [], isEn }) {
  const W = 900, H = 300;
  const { canvas, ctx } = stampBase(W, H);
  drawStamp(ctx, isEn ? 'WRONG CHANNEL' : 'YANLIŞ KANAL', 60, 110, '#f0b232', 480, 50);
  ctx.fillStyle = INK; ctx.font = `700 20px ${BODY}`;
  ctx.fillText(isEn ? 'Bot commands only work in:' : 'Bot komutları yalnızca şurada çalışır:', 56, 176);
  let x = 56, y = 200;
  ctx.font = `700 18px ${BODY}`;
  for (const name of channels.slice(0, 5)) {
    const text = `#${fit(ctx, name, 180, `700 18px ${BODY}`)}`;
    const w = ctx.measureText(text).width + 34;
    if (x + w > 590) { x = 56; y += 46; }
    ctx.fillStyle = TINT; roundRect(ctx, x, y, w, 36, 18); ctx.fill();
    ctx.fillStyle = BLUE; ctx.fillText(text, x + 17, y + 25); x += w + 10;
  }
  mascotPanel(ctx, W, H, 'confused');
  return canvas.toBuffer('image/png');
}

/** Müzik uzaktan kumanda durumu. */
function remoteCard({ on, isEn }) {
  const W = 900, H = 300;
  const { canvas, ctx } = stampBase(W, H);
  ctx.fillStyle = SOFT; ctx.font = `700 20px ${BODY}`;
  ctx.fillText(isEn ? 'Music remote control' : 'Müzik uzaktan kumanda', 56, 62);
  drawStamp(ctx, on ? (isEn ? 'ON' : 'AÇIK') : (isEn ? 'OFF' : 'KAPALI'), 62, 158, on ? '#3ba55c' : '#ed4245', 420, 78);
  ctx.fillStyle = INK; ctx.font = `600 19px ${BODY}`;
  const line = on ? (isEn ? 'No voice channel needed to pause, skip or queue.' : 'Duraklatmak, geçmek ya da sıraya eklemek için ses kanalı gerekmez.')
    : (isEn ? 'Only people in the voice channel can control it.' : 'Yalnızca ses kanalındakiler yönetebilir.');
  wrapLines(ctx, line, 540, 2).forEach((l, i) => ctx.fillText(l, 56, 238 + i * 26));
  mascotPanel(ctx, W, H, on ? 'happy' : 'idle');
  return canvas.toBuffer('image/png');
}

/** Hızlı moderasyon kartı: mesajın yazarı ve mesajdan alıntı. */
async function quickModCard({ userName, avatarUrl, excerpt, isEn }) {
  const W = 900, H = 340;
  const { canvas, ctx } = stampBase(W, H);
  await drawAvatar(ctx, avatarUrl, 96, 100, 46);
  ctx.fillStyle = INK; ctx.font = `800 28px ${DISPLAY}`;
  ctx.fillText(fit(ctx, userName, 420, `800 28px ${DISPLAY}`), 170, 98);
  ctx.fillStyle = SOFT; ctx.font = `600 17px ${BODY}`;
  ctx.fillText(isEn ? 'wrote this message' : 'bu mesajı yazdı', 170, 126);
  // alıntı balonu
  ctx.fillStyle = TINT; roundRect(ctx, 56, 168, 540, 130, 22); ctx.fill();
  ctx.fillStyle = BLUE; ctx.font = `800 54px ${DISPLAY}`; ctx.fillText('“', 74, 222);
  ctx.fillStyle = INK; ctx.font = `600 19px ${BODY}`;
  wrapLines(ctx, excerpt || (isEn ? '(no text)' : '(yazı yok)'), 470, 3).forEach((l, i) => ctx.fillText(l, 118, 206 + i * 28));
  mascotPanel(ctx, W, H, 'alert');
  return canvas.toBuffer('image/png');
}

/** Açılan bilet kartı: yazan maskot, bilet numarası, açan üye ve konu. */
function ticketOpenCard({ id, category, openerName, avatarUrl, isEn }) {
  return sideCard({
    mood: 'type', headingSize: 30,
    heading: `${isEn ? 'TICKET' : 'BİLET'} #${id}`, name: openerName, avatarUrl,
    line: category,
    pill: isEn ? 'Support is on the way' : 'Destek ekibi yolda',
  });
}

/** Kapanan bilet kartı. */
function ticketCard({ id, openerName, avatarUrl, duration, messages, closedBy, isEn }) {
  return sideCard({
    mood: 'happy', headingSize: 28,
    heading: `${isEn ? 'TICKET' : 'BİLET'} #${id}`, name: openerName, avatarUrl,
    line: `${isEn ? 'Closed' : 'Kapandı'} · ${duration} · ${messages} ${isEn ? 'messages' : 'mesaj'}`,
    pill: closedBy ? `${isEn ? 'Closed by' : 'Kapatan'}: ${closedBy}` : null,
  });
}

/**
 * Öneri kartı. status: open | approved | denied | implemented.
 * Öneri metni kartta değil mesajda durur (her dil ve emoji düzgün görünsün); kart kimin önerdiğini ve oyları gösterir.
 * Açıkken oy çubuğu, karar verilince damga çizilir.
 */
async function suggestionCard({ id, authorName, avatarUrl, up = 0, down = 0, status = 'open', isEn }) {
  const W = 900, H = 340;
  const { canvas, ctx } = stampBase(W, H);
  const GREEN = '#3ba55c', RED = '#ed4245';
  const S = {
    open: { tr: 'AÇIK', en: 'OPEN', col: BLUE },
    approved: { tr: 'ONAYLANDI', en: 'APPROVED', col: GREEN },
    denied: { tr: 'REDDEDİLDİ', en: 'DENIED', col: RED },
    implemented: { tr: 'YAPILDI', en: 'IMPLEMENTED', col: '#7c3aed' },
  }[status] || { tr: '—', en: '—', col: BLUE };
  const total = up + down;
  const pct = total ? Math.round((up / total) * 100) : 0;

  await drawAvatar(ctx, avatarUrl, 92, 104, 36);
  ctx.fillStyle = SOFT; ctx.font = `700 17px ${BODY}`;
  ctx.fillText(`${isEn ? 'Suggestion' : 'Öneri'} #${id}`, 152, 82);
  ctx.fillStyle = INK; ctx.font = `800 28px ${DISPLAY}`;
  ctx.fillText(fit(ctx, authorName || '—', 430, `800 28px ${DISPLAY}`), 152, 120);
  ctx.fillStyle = SOFT; ctx.font = `600 16px ${BODY}`;
  ctx.fillText(isEn ? 'suggested this' : 'bunu önerdi', 152, 146);

  // Oy hapı: renkli zeminde üçgen + sayı
  const pill = (x, y, n, label, col, bg, upward) => {
    ctx.font = `700 16px ${BODY}`;
    const text = `${n} ${label}`;
    const w = ctx.measureText(text).width + 56;
    ctx.fillStyle = bg; roundRect(ctx, x, y, w, 34, 17); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath();
    if (upward) { ctx.moveTo(x + 16, y + 23); ctx.lineTo(x + 30, y + 23); ctx.lineTo(x + 23, y + 11); }
    else { ctx.moveTo(x + 16, y + 12); ctx.lineTo(x + 30, y + 12); ctx.lineTo(x + 23, y + 24); }
    ctx.closePath(); ctx.fill();
    ctx.fillText(text, x + 40, y + 23);
    return w;
  };
  const pills = (y) => {
    const w = pill(56, y, up, isEn ? 'for' : 'destek', GREEN, '#e7f6ec', true);
    pill(56 + w + 10, y, down, isEn ? 'against' : 'karşı', RED, '#fdecec', false);
  };

  if (status === 'open') {
    const bx = 56, by = 200, bw = 540, bh = 44;
    ctx.fillStyle = SOFT; ctx.font = `700 14px ${BODY}`;
    ctx.fillText(isEn ? 'VOTES' : 'OYLAR', bx, by - 12);
    if (total) {
      ctx.textAlign = 'right'; ctx.fillStyle = INK; ctx.font = `800 16px ${DISPLAY}`;
      ctx.fillText(isEn ? `${pct}% support` : `%${pct} destek`, bx + bw, by - 12);
      ctx.textAlign = 'left';
      ctx.save(); roundRect(ctx, bx, by, bw, bh, 22); ctx.clip();
      ctx.fillStyle = RED; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = GREEN; ctx.fillRect(bx, by, bw * (up / total), bh);
      ctx.restore();
    } else {
      ctx.fillStyle = TINT; roundRect(ctx, bx, by, bw, bh, 22); ctx.fill();
      ctx.fillStyle = SOFT; ctx.font = `600 16px ${BODY}`; ctx.textAlign = 'center';
      ctx.fillText(isEn ? 'No votes yet, be the first' : 'Henüz oy yok, ilk oyu sen ver', bx + bw / 2, by + 28);
      ctx.textAlign = 'left';
    }
    pills(266);
  } else {
    drawStamp(ctx, S[isEn ? 'en' : 'tr'], 64, 248, S.col, 480, 58);
    pills(286);
  }

  let mood = 'idle';
  if (status === 'approved' || status === 'implemented') mood = 'happy';
  else if (status === 'denied') mood = 'sad';
  else if (total >= 3 && pct >= 70) mood = 'happy';
  else if (total >= 3 && pct <= 30) mood = 'sad';
  mascotPanel(ctx, W, H, mood);
  return canvas.toBuffer('image/png');
}

module.exports = { remoteCard, punishCard, caseCard, mentionCard, lockCard, quickModCard, ticketOpenCard, profileCard, posterCard, raidCard, ticketCard, winnerCard, gateCard, goodbyeCard, boostCard, verdictCard, pollCard, weeklyCard, sideCard, suggestionCard };
