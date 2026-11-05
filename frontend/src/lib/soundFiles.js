// Real recorded game sounds (CC0, Kenney + cc0-sounds) played through one shared Web Audio bus.
const BASE = `${process.env.PUBLIC_URL || ''}/sounds/party/`;
const FILES = {
  dice: ['dice1', 'dice2', 'dice3'], step: ['step1', 'step2', 'step3'], capture: ['capture1', 'capture2'], card: ['card1', 'card2', 'card3'],
  drop: ['drop1', 'drop2'], pop: ['pop1', 'pop2', 'pop3'], combo: ['combo1'], home: ['home1'], chat: ['chat1'], tick: ['tick1'], bad: ['bad1'],
  ladder: ['ladder1'], six: ['six1'], coin: ['coin1', 'coin2'], slide: ['slide1', 'slide2'], flip: ['flip1', 'flip2'], chime: ['chime1'],
  thud: ['thud1'], whoosh: ['whoosh1'], snake: ['snake1'], open: ['open1'], win: ['win1'], lose: ['lose1'], click: ['click1'],
};
const VOL = { tick: 0.6, chat: 0.7, step: 1.2, pop: 1.1, dice: 1.2 };
let ctx; let out; let loading = false;
const buf = {};

export function audioCtx() {
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
  if (!ctx) { ctx = new C(); const comp = ctx.createDynamicsCompressor(); out = ctx.createGain(); out.gain.value = 1; out.connect(comp); comp.connect(ctx.destination); }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}
export const masterOut = () => { audioCtx(); return out; };

export function preloadSounds() {
  if (loading) return; const a = audioCtx(); if (!a) return; loading = true;
  Object.values(FILES).flat().forEach((n) => {
    fetch(`${BASE}${n}.mp3`).then((r) => r.arrayBuffer()).then((ab) => new Promise((res, rej) => a.decodeAudioData(ab, res, rej))).then((b) => { buf[n] = b; }).catch(() => {});
  });
}

// Returns true when a recorded sound was played (otherwise callers fall back to synth tones).
export function playFile(kind) {
  const list = FILES[kind]; if (!list) return false;
  const a = audioCtx(); if (!a) return false;
  preloadSounds();
  const b = buf[list[Math.floor(Math.random() * list.length)]] || list.map((n) => buf[n]).find(Boolean);
  if (!b) return false;
  const src = a.createBufferSource(); const g = a.createGain();
  src.buffer = b; src.playbackRate.value = 0.94 + Math.random() * 0.12; g.gain.value = VOL[kind] || 1;
  src.connect(g); g.connect(out); src.start();
  return true;
}

// iPhone/iPad: allow sound with the silent switch on, and unlock audio on the first tap anywhere.
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const EVENTS = ['pointerdown', 'touchend', 'keydown', 'click'];
function unlock() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
  try { const el = new Audio(SILENT); el.setAttribute('playsinline', ''); el.play().catch(() => {}); } catch { /* unsupported */ }
  const a = audioCtx(); if (!a) return;
  try { const b = a.createBuffer(1, 1, 22050); const s = a.createBufferSource(); s.buffer = b; s.connect(a.destination); s.start(0); } catch { /* ignore */ }
  preloadSounds();
  if (a.state === 'running') EVENTS.forEach((e) => window.removeEventListener(e, unlock, true));
}
if (typeof window !== 'undefined') EVENTS.forEach((e) => window.addEventListener(e, unlock, true));
