// Pure timeline + canvas painter for the Visual Draw Studio. The result is supplied; nothing here selects winners.
export const INTRO_MS = 3200;
export const OUTRO_MS = 3500;

export function buildTimeline(rounds) {
  const segments = [];
  let t = 0;
  rounds.forEach((round, r) => {
    segments.push({ kind: 'intro', r, start: t, end: t + INTRO_MS });
    t += INTRO_MS;
    const per = (round.duration_s * 1000) / Math.max(1, round.winners.length);
    round.winners.forEach((winner, w) => {
      segments.push({ kind: 'winner', r, w, first: w === 0, start: t, end: t + per });
      t += per;
    });
  });
  segments.push({ kind: 'outro', start: t, end: t + OUTRO_MS });
  return { segments, total: t + OUTRO_MS };
}

export function phaseOf(seg, t) {
  const p = (t - seg.start) / (seg.end - seg.start);
  if (seg.kind !== 'winner') return { name: seg.kind, p };
  if (seg.first && p < 0.18) return { name: 'countdown', p, local: p / 0.18 };
  if (p < 0.6) return { name: 'swirl', p, local: (p - (seg.first ? 0.18 : 0)) / (0.6 - (seg.first ? 0.18 : 0)) };
  if (p < 0.85) return { name: 'slowdown', p, local: (p - 0.6) / 0.25 };
  return { name: 'reveal', p, local: (p - 0.85) / 0.15 };
}

const GOLD = '#FFD54A';
const money = (v) => `£${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function makeParticles(count) {
  const n = Math.min(count, 1400);
  return Array.from({ length: n }, (_, i) => ({
    a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()), z: Math.random(), s: 0.6 + Math.random() * 0.8,
    tilt: Math.random() * Math.PI, hue: i % 3,
  }));
}

function text(ctx, str, x, y, size, color, { weight = 800, align = 'center', glow = 0, font = 'Outfit, system-ui, sans-serif' } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

export function paint(ctx, W, H, state) {
  const { t, seg, phase, show, particles, confetti, spin, cycleNumber } = state;
  const round = seg.r !== undefined ? show.rounds[seg.r] : null;
  const winner = seg.kind === 'winner' ? round.winners[seg.w] : null;
  const cx = W / 2;
  const cy = H * 0.49;
  const R = Math.min(W, H) * 0.23;
  const pulse = 0.5 + 0.5 * Math.sin(t / (phase.name === 'swirl' ? 160 : 420));

  const bg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.max(W, H) * 0.8);
  bg.addColorStop(0, '#2a1160');
  bg.addColorStop(0.55, '#0d1240');
  bg.addColorStop(1, '#04061a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 6; i += 1) {
    const ang = -Math.PI / 2 + Math.sin(t / 1800 + i) * 0.5 + (i - 2.5) * 0.25;
    ctx.save();
    ctx.globalAlpha = 0.06 + 0.06 * pulse;
    ctx.fillStyle = i % 2 ? '#8b5cf6' : GOLD;
    ctx.beginPath();
    ctx.moveTo(cx + (i - 2.5) * W * 0.15, -20);
    ctx.lineTo(cx + Math.cos(ang) * W, cy + Math.sin(ang) * -H);
    ctx.lineTo(cx + Math.cos(ang + 0.08) * W, cy + Math.sin(ang + 0.08) * -H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Glass pool
  ctx.save();
  const glass = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
  glass.addColorStop(0, 'rgba(255,255,255,0.18)');
  glass.addColorStop(0.7, 'rgba(120,90,255,0.06)');
  glass.addColorStop(1, 'rgba(255,213,74,0.18)');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(255,213,74,${0.35 + 0.35 * pulse})`;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 25 * pulse;
  ctx.stroke();
  ctx.restore();

  const colors = ['#FFD54A', '#a78bfa', '#60a5fa'];
  particles.forEach((p, i) => {
    const ang = p.a + spin * p.s;
    const rr = p.r * R * 0.9 * (0.92 + 0.08 * Math.sin(t / 300 + i));
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr * 0.92 + Math.sin(spin * 2 + p.tilt) * 6;
    const scale = 0.55 + p.z * 0.9;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin * p.s + p.tilt);
    ctx.globalAlpha = 0.35 + p.z * 0.6;
    ctx.fillStyle = colors[p.hue];
    ctx.fillRect(-7 * scale, -4 * scale, 14 * scale, 8 * scale);
    ctx.restore();
  });

  // Header
  const hs = Math.max(14, Math.min(W * 0.016, H * 0.03));
  text(ctx, show.title || 'PRIZE LEAGUE DRAW', cx, hs * 1.6, hs, '#e9d5ff', { weight: 700 });
  if (round) {
    text(ctx, round.name.toUpperCase(), cx, hs * 3.6, hs * 1.9, GOLD, { weight: 900, glow: 18 });
    text(ctx, `${money(round.prize_amount)} · ${round.winners.length} winner${round.winners.length > 1 ? 's' : ''}`, cx, hs * 5.6, hs, '#fff', { weight: 700 });
  }
  text(ctx, `${show.poolCount.toLocaleString('en-GB')} ELIGIBLE TICKETS IN THE POOL`, cx, cy + R + hs * 1.3, Math.max(12, W * 0.011), '#c4b5fd', { weight: 700 });
  if (show.mode === 'preview') {
    ctx.save();
    ctx.translate(W - 120, 60);
    ctx.rotate(0.12);
    text(ctx, 'PREVIEW', 0, 0, 34, 'rgba(244,63,94,0.85)', { weight: 900 });
    text(ctx, 'SIMULATED RESULT', 0, 30, 13, 'rgba(244,63,94,0.85)', { weight: 800 });
    ctx.restore();
  } else {
    text(ctx, '● OFFICIAL DRAW', 120, 50, 16, '#34d399', { weight: 900 });
  }

  const big = Math.max(40, Math.min(W * 0.07, H * 0.11));
  if (seg.kind === 'intro') {
    const a = Math.min(1, phase.p * 3);
    ctx.save();
    ctx.globalAlpha = a;
    text(ctx, `Round ${seg.r + 1} of ${show.rounds.length}`, cx, cy - 30, Math.max(18, W * 0.02), '#e9d5ff', { weight: 700 });
    text(ctx, round.name, cx, cy + 20, big * 0.6, GOLD, { weight: 900, glow: 30 });
    ctx.restore();
  } else if (phase.name === 'countdown') {
    const n = 3 - Math.floor(phase.local * 3);
    const local = (phase.local * 3) % 1;
    text(ctx, String(Math.max(1, n)), cx, cy, big * (1.6 - local * 0.5), GOLD, { weight: 900, glow: 50 });
  } else if (phase.name === 'swirl' || phase.name === 'slowdown') {
    const plate = phase.name === 'slowdown' ? '#fff' : '#e9d5ff';
    roundedPlate(ctx, cx, H * 0.89, Math.max(220, W * 0.22), big * 0.95);
    text(ctx, `#${cycleNumber}`, cx, H * 0.89, big * 0.72, plate, { weight: 900, glow: phase.name === 'slowdown' ? 25 : 8, font: 'JetBrains Mono, ui-monospace, monospace' });
    if (phase.name === 'slowdown') text(ctx, 'THE POOL IS SLOWING…', cx, cy - R - hs * 0.2, Math.max(13, W * 0.013), '#fda4af', { weight: 800 });
  } else if (phase.name === 'reveal' && winner) {
    const e = Math.min(1, phase.local * 2.2);
    const y = cy;
    ctx.save();
    ctx.globalAlpha = Math.min(1, e * 1.5);
    roundedPlate(ctx, cx, y, Math.max(320, W * 0.4) * (0.6 + 0.4 * e), big * 1.6, true);
    text(ctx, `#${winner.ticket_number}`, cx, y - big * 0.12, big * (0.7 + 0.35 * e), GOLD, { weight: 900, glow: 60, font: 'JetBrains Mono, ui-monospace, monospace' });
    ctx.restore();
    if (phase.local > 0.35) {
      text(ctx, winner.display_name, cx, H * 0.8, Math.max(24, W * 0.034), '#fff', { weight: 900, glow: 12 });
      text(ctx, `WINS ${money(round.prize_amount)}`, cx, H * 0.875, Math.max(20, W * 0.026), GOLD, { weight: 900, glow: 20 });
      if (round.announcement_text) text(ctx, round.announcement_text.replace('{winners}', winner.display_name).slice(0, 90), cx, H * 0.935, Math.max(12, W * 0.012), '#e9d5ff', { weight: 600 });
    }
  } else if (seg.kind === 'outro') {
    text(ctx, 'CONGRATULATIONS TO ALL OUR WINNERS', cx, cy - 10, Math.max(20, W * 0.028), GOLD, { weight: 900, glow: 30 });
    text(ctx, show.mode === 'preview' ? 'Preview complete — no results were recorded' : 'Results recorded and verifiable in the audit report', cx, cy + 34, Math.max(13, W * 0.013), '#e9d5ff', { weight: 600 });
  }

  confetti.forEach((c) => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  });
}

function roundedPlate(ctx, cx, cy, w, h, gold = false) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2.4);
  const g = ctx.createLinearGradient(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
  g.addColorStop(0, gold ? 'rgba(60,30,110,0.95)' : 'rgba(20,16,60,0.9)');
  g.addColorStop(1, gold ? 'rgba(30,15,70,0.95)' : 'rgba(40,20,90,0.9)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = gold ? 4 : 2;
  ctx.strokeStyle = gold ? GOLD : 'rgba(167,139,250,0.8)';
  ctx.shadowColor = gold ? GOLD : '#8b5cf6';
  ctx.shadowBlur = gold ? 40 : 14;
  ctx.stroke();
  ctx.restore();
}
