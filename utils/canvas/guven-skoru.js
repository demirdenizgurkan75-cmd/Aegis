const { createCanvas } = require('canvas');
const { AttachmentBuilder } = require('discord.js');

const CATEGORIES = [
  { key: 'accountAge', label: 'Hesap Yaşı', max: 365 },
  { key: 'messageCount', label: 'Mesaj Sayısı', max: 10000 },
  { key: 'voiceMinutes', label: 'Ses Süresi (dk)', max: 10000 },
  { key: 'reputation', label: 'İtibar', max: 100 },
  { key: 'invites', label: 'Davetler', max: 50 },
  { key: 'warnings', label: 'Uyarı (ters)', max: 10, invert: true },
];

function normalizeValue(value, max, invert = false) {
  const normalized = Math.min(value || 0, max) / max;
  return invert ? 1 - normalized : normalized;
}

async function renderGuvenRadar(userData, guildData = {}) {
  const size = 400;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const center = size / 2;
  const radius = 160;
  const angleStep = (Math.PI * 2) / CATEGORIES.length;

  // Dark theme background
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#23272a');
  grad.addColorStop(1, '#1a1c1f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Grid circles
  [0.2, 0.4, 0.6, 0.8, 1.0].forEach(r => {
    ctx.beginPath();
    for (let i = 0; i < CATEGORIES.length; i++) {
      const a = i * angleStep - Math.PI / 2;
      const x = center + Math.cos(a) * radius * r;
      const y = center + Math.sin(a) * radius * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(255,255,255,${r * 0.15})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Axis lines & labels
  CATEGORIES.forEach((cat, i) => {
    const a = i * angleStep - Math.PI / 2;
    const x = center + Math.cos(a) * (radius + 20);
    const y = center + Math.sin(a) * (radius + 20);
    ctx.fillStyle = '#fff';
    ctx.font = '11px Whitney, Helvetica Neue, Helvetica, Arial';
    ctx.textAlign = Math.cos(a) > 0 ? 'left' : 'right';
    ctx.textBaseline = Math.sin(a) > 0 ? 'top' : 'bottom';
    ctx.fillText(cat.label, x, y);

    // Axis line
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + Math.cos(a) * radius, center + Math.sin(a) * radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // User data polygon
  ctx.beginPath();
  CATEGORIES.forEach((cat, i) => {
    const value = guildData[cat.key] ?? userData[cat.key] ?? 0;
    const normalized = normalizeValue(value, cat.max, cat.invert);
    const r = radius * normalized;
    const a = i * angleStep - Math.PI / 2;
    const x = center + Math.cos(a) * r;
    const y = center + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(85, 255, 159, 0.35)';
  ctx.fill();
  ctx.strokeStyle = '#55ff9f';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Data points
  CATEGORIES.forEach((cat, i) => {
    const value = guildData[cat.key] ?? userData[cat.key] ?? 0;
    const normalized = normalizeValue(value, cat.max, cat.invert);
    const r = radius * normalized;
    const a = i * angleStep - Math.PI / 2;
    const x = center + Math.cos(a) * r;
    const y = center + Math.sin(a) * r;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#55ff9f';
    ctx.fill();
    ctx.strokeStyle = '#23272a';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Score text
  const scores = CATEGORIES.map(cat => {
    const value = guildData[cat.key] ?? userData[cat.key] ?? 0;
    return normalizeValue(value, cat.max, cat.invert);
  });
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 32px Whitney, Helvetica Neue, Helvetica, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${avgScore}/100`, center, center - 10);
  ctx.font = '13px Whitney, Helvetica Neue, Helvetica, Arial';
  ctx.fillStyle = '#aaa';
  ctx.fillText('Güven Skoru', center, center + 25);

  // Legend
  ctx.font = '10px Whitney, Helvetica Neue, Helvetica, Arial';
  ctx.fillStyle = '#888';
  ctx.textAlign = 'left';
  let legendY = size - 50;
  CATEGORIES.forEach((cat, i) => {
    const value = guildData[cat.key] ?? userData[cat.key] ?? 0;
    const pct = Math.round(normalizeValue(value, cat.max, cat.invert) * 100);
    const x = 20 + (i % 3) * 125;
    const y = legendY + Math.floor(i / 3) * 18;
    ctx.fillStyle = '#55ff9f';
    ctx.fillRect(x, y - 8, 8, 8);
    ctx.fillStyle = '#ddd';
    ctx.fillText(`${cat.label}: ${pct}%`, x + 12, y);
  });

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'guven-skoru.png' });
}

module.exports = { renderGuvenRadar, CATEGORIES };