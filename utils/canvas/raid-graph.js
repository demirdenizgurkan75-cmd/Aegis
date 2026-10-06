const { createCanvas } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const d3 = require('d3-force');

function buildGraphFromEvents(events) {
  const nodeMap = new Map();
  const linkMap = new Map();

  events.forEach(e => {
    if (!nodeMap.has(e.userId)) {
      nodeMap.set(e.userId, {
        id: e.userId,
        label: e.username?.slice(0, 12) || e.userId.slice(-6),
        risk: e.risk || 0.3,
        joinTime: e.timestamp,
      });
    }
  });

  const nodes = Array.from(nodeMap.values());

  // Link by same IP, same invite, or close join time
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const timeDiff = Math.abs(a.joinTime - b.joinTime);
      let type = null, weight = 0;

      if (a.ip && a.ip === b.ip) { type = 'ip'; weight = 1.0; }
      else if (a.inviteCode && a.inviteCode === b.inviteCode) { type = 'invite'; weight = 0.7; }
      else if (timeDiff < 5000) { type = 'time'; weight = 0.4; }

      if (type) {
        const key = `${a.id}-${b.id}`;
        if (!linkMap.has(key) || linkMap.get(key).weight < weight) {
          linkMap.set(key, { source: a.id, target: b.id, type, weight });
        }
      }
    }
  }

  return { nodes, links: Array.from(linkMap.values()) };
}

async function renderRaidGraph(nodes, links) {
  const width = 800, height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Dark background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#1a1c1f');
  grad.addColorStop(1, '#121315');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // D3 force simulation (headless)
  const simNodes = nodes.map(n => ({ ...n, x: width / 2 + (Math.random() - 0.5) * 200, y: height / 2 + (Math.random() - 0.5) * 200 }));
  const simLinks = links.map(l => ({ ...l, source: l.source, target: l.target }));

  const sim = d3.forceSimulation(simNodes)
    .force('link', d3.forceLink(simLinks).id(d => d.id).distance(100).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => 20 + d.risk * 20))
    .stop();

  for (let i = 0; i < 300; i++) sim.tick();

  // Draw links
  const typeColors = {
    ip: 'rgba(255, 85, 85, 0.7)',
    invite: 'rgba(255, 170, 0, 0.7)',
    time: 'rgba(138, 43, 226, 0.7)',
  };

  simLinks.forEach(link => {
    const s = simNodes.find(n => n.id === link.source);
    const t = simNodes.find(n => n.id === link.target);
    if (!s || !t) return;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = typeColors[link.type] || 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1 + link.weight * 3;
    ctx.stroke();
  });

  // Draw nodes
  simNodes.forEach(n => {
    const riskColor = `hsl(${120 - n.risk * 120}, 70%, 50%)`;
    const radius = 12 + n.risk * 15;
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = riskColor;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '10px Whitney, Helvetica Neue, Helvetica, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(n.label, n.x, n.y + radius + 14);
  });

  // Legend
  const legend = [
    { color: 'rgba(255, 85, 85, 0.9)', label: 'Aynı IP' },
    { color: 'rgba(255, 170, 0, 0.9)', label: 'Aynı Davet' },
    { color: 'rgba(138, 43, 226, 0.9)', label: 'Aynı Zaman (<5sn)' },
  ];
  legend.forEach((l, i) => {
    const y = 30 + i * 24;
    ctx.fillStyle = l.color;
    ctx.fillRect(20, y, 18, 18);
    ctx.fillStyle = '#fff';
    ctx.font = '12px Whitney, Helvetica Neue, Helvetica, Arial';
    ctx.textAlign = 'left';
    ctx.fillText(l.label, 48, y + 13);
  });

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px Whitney, Helvetica Neue, Helvetica, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Raid Ağ Grafiği', width / 2, 30);

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'raid-graph.png' });
}

module.exports = { renderRaidGraph, buildGraphFromEvents };