// Synthesised "Jingle Bells" (public-domain melody) with sleigh bells — no audio files needed.
const MELODY = [
  ['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5], ['E5', 4],
  ['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5], ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5],
  ['E5', 1], ['D5', 1], ['D5', 1], ['E5', 1], ['D5', 2], ['G5', 2],
];
const FREQ = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99 };
const KEY = 'pl_santa_muted';
let ctx = null;
let stopAt = 0;

export const isSantaMuted = () => localStorage.getItem(KEY) === '1';
export const setSantaMuted = (muted) => { localStorage.setItem(KEY, muted ? '1' : '0'); if (muted && ctx) { ctx.close(); ctx = null; } };

function bell(ac, t, gain) {
  const len = 0.12;
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = ac.createBufferSource(); src.buffer = buf;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
  const g = ac.createGain(); g.gain.value = gain;
  src.connect(hp).connect(g).connect(ac.destination); src.start(t);
}

export function playJingle(seconds = 6) {
  if (isSantaMuted()) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    if (now < stopAt) return;
    const beat = 0.22;
    let t = now + 0.05;
    for (const [note, len] of MELODY) {
      if (t - now > seconds) break;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = FREQ[note];
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len * beat * 0.95);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + len * beat);
      t += len * beat;
    }
    for (let b = now + 0.05; b < t; b += beat) bell(ctx, b, 0.06);
    stopAt = t;
  } catch {
    // Audio is optional.
  }
}
