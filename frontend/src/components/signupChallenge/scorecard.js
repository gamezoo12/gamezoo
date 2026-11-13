// Draws the shareable Prize League scorecard on a canvas and returns a PNG blob.
const SIZES = { story: [1080, 1920], square: [1080, 1080] };

const loadImg = (src, cors) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  if (cors) img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

function cover(ctx, img, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
}

function paint(ctx, d, w, h, logo, bg) {
  const sq = h === w;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#120a2e'); g.addColorStop(0.55, '#24105e'); g.addColorStop(1, '#0b0d1f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (bg) { ctx.globalAlpha = 0.28; cover(ctx, bg, w, h); ctx.globalAlpha = 1; }
  const glow = ctx.createRadialGradient(w / 2, h * 0.3, 10, w / 2, h * 0.3, w * 0.8);
  glow.addColorStop(0, 'rgba(255,213,74,0.28)'); glow.addColorStop(1, 'rgba(255,213,74,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,213,74,0.55)'; ctx.lineWidth = 6; ctx.strokeRect(30, 30, w - 60, h - 60);

  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  let y = sq ? 90 : 300;
  if (logo) { const lh = sq ? 90 : 150; ctx.drawImage(logo, w / 2 - (lh * logo.width) / logo.height / 2, y, (lh * logo.width) / logo.height, lh); y += lh + 30; }
  const line = (text, size, color, weight = 900, gap = 1.35) => {
    ctx.font = `${weight} ${size}px "Arial Black", Arial, sans-serif`; ctx.fillStyle = color; y += size; ctx.fillText(text, w / 2, y); y += size * (gap - 1);
  };
  line('PRIZE LEAGUE', sq ? 44 : 60, '#FFD54A');
  line(d.title.toUpperCase(), sq ? 34 : 46, '#ffffff', 800);
  line(d.prize.toUpperCase(), sq ? 60 : 92, '#FFD54A', 900, 1.5);
  line(`Player: ${d.name}`, sq ? 30 : 40, '#e9e3ff', 700, 1.4);
  line(`Game: ${d.game}`, sq ? 30 : 40, '#e9e3ff', 700, sq ? 1.6 : 1.9);

  const rows = d.attempts;
  const rowH = sq ? Math.min(52, 300 / Math.max(rows.length, 1)) : Math.min(96, 640 / Math.max(rows.length, 1));
  ctx.font = `700 ${Math.round(rowH * 0.6)}px Arial, sans-serif`;
  rows.forEach((r) => {
    const best = r.best;
    ctx.fillStyle = best ? 'rgba(255,213,74,0.18)' : 'rgba(255,255,255,0.07)';
    ctx.fillRect(w * 0.16, y, w * 0.68, rowH - 8);
    ctx.fillStyle = best ? '#FFD54A' : '#ffffff';
    ctx.textAlign = 'left'; ctx.fillText(`Attempt ${r.no}`, w * 0.2, y + rowH * 0.65);
    ctx.textAlign = 'right'; ctx.fillText(r.label, w * 0.8, y + rowH * 0.65);
    y += rowH;
  });
  ctx.textAlign = 'center'; y += sq ? 20 : 50;
  line(`${d.headline || 'BEST TIME'}: ${d.best}`, sq ? 56 : 84, '#FFD54A', 900, 1.45);
  if (d.partial) line('Partial results - challenge left early', sq ? 24 : 32, '#fda4af', 700);
  line('Think you can beat my time?', sq ? 32 : 46, '#ffffff', 800, sq ? 1.4 : 1.8);
  ctx.font = `800 ${sq ? 30 : 40}px Arial, sans-serif`; ctx.fillStyle = '#c4b5fd';
  ctx.fillText(d.url.replace(/^https?:\/\//, ''), w / 2, h - (sq ? 70 : 110));
}

export async function renderScorecard(data, format = 'story') {
  const [w, h] = SIZES[format];
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const [logo, bg] = await Promise.all([loadImg('/logo.png?v=5'), loadImg(data.bgUrl, true)]);
  paint(ctx, data, w, h, logo, bg);
  const toBlob = () => new Promise((res) => canvas.toBlob(res, 'image/png'));
  try {
    const b = await toBlob();
    if (b) return b;
  } catch { /* tainted by background image */ }
  paint(ctx, data, w, h, logo, null);
  return toBlob();
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
