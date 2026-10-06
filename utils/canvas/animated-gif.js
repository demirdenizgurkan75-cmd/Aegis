const { createCanvas } = require('canvas');
const GIFEncoder = require('gif-encoder-2');

async function createProgressGIF(steps, currentStep, options = {}) {
  const {
    width = 500,
    height = 80,
    frameDelay = 500,
    bgColor = '#23272a',
    barBgColor = '#2f3136',
    barFillColor = '#55ff9f',
    textColor = '#fff',
    fontFamily = 'Whitney, Helvetica Neue, Helvetica, Arial',
  } = options;

  const encoder = new GIFEncoder(width, height);
  encoder.setDelay(frameDelay);
  encoder.setRepeat(0);
  encoder.start();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  steps.forEach((step, i) => {
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Progress bar background
    const barX = 20;
    const barY = height / 2;
    const barWidth = width - 40;
    const barHeight = 20;
    const radius = barHeight / 2;

    ctx.fillStyle = barBgColor;
    roundRect(ctx, barX, barY - radius, barWidth, barHeight, radius);
    ctx.fill();

    // Progress fill
    const progress = (i + 1) / steps.length;
    const fillWidth = barWidth * progress;

    if (fillWidth > 0) {
      ctx.fillStyle = i < currentStep ? '#3ba55c' : (i === currentStep ? '#faa61a' : barFillColor);
      roundRect(ctx, barX, barY - radius, Math.max(fillWidth, radius * 2), barHeight, radius);
      ctx.fill();
    }

    // Step label
    ctx.fillStyle = textColor;
    ctx.font = `14px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(step, barX, barY - radius - 8);

    // Percentage
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(progress * 100)}%`, width - 20, barY - radius - 8);

    encoder.addFrame(ctx);
  });

  encoder.finish();
  return encoder.out.getData();
}

function roundRect(ctx, x, y, width, height, radius) {
  if (width < 2 * radius) radius = width / 2;
  if (height < 2 * radius) radius = height / 2;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

async function createSpinnerGIF(frames = 12, options = {}) {
  const {
    size = 80,
    color = '#55ff9f',
    bgColor = '#23272a',
    frameDelay = 100,
  } = options;

  const encoder = new GIFEncoder(size, size);
  encoder.setDelay(frameDelay);
  encoder.setRepeat(0);
  encoder.start();

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const center = size / 2;
  const radius = size / 2 - 10;

  for (let i = 0; i < frames; i++) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    const angle = (i / frames) * Math.PI * 2;
    const startAngle = angle;
    const endAngle = angle + Math.PI * 1.5;

    ctx.beginPath();
    ctx.arc(center, center, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}

module.exports = { createProgressGIF, createSpinnerGIF };