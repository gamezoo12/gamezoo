// Synthesised public-domain festive tunes + sleigh bells + drum, and Santa's voice — no audio files needed.
const SONGS = {
  jingle: [['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5], ['E5', 4],
    ['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5], ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5], ['E5', 1], ['D5', 1], ['D5', 1], ['E5', 1], ['D5', 2], ['G5', 2]],
  wish: [['G4', 1], ['C5', 1], ['C5', 0.5], ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 1], ['A4', 1], ['A4', 1], ['D5', 1], ['D5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 0.5],
    ['B4', 1], ['G4', 1], ['G4', 1], ['E5', 1], ['E5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 1], ['A4', 1], ['G4', 0.5], ['G4', 0.5], ['A4', 1], ['D5', 1], ['B4', 1], ['C5', 2]],
  deck: [['D5', 1.5], ['C5', 0.5], ['B4', 1], ['A4', 1], ['G4', 1], ['A4', 1], ['B4', 1], ['G4', 1], ['A4', 0.5], ['B4', 0.5], ['C5', 0.5], ['A4', 0.5], ['B4', 1.5], ['A4', 0.5], ['G4', 1], ['F#4', 1], ['G4', 2],
    ['D5', 1.5], ['C5', 0.5], ['B4', 1], ['A4', 1], ['G4', 1], ['A4', 1], ['B4', 1], ['G4', 1]],
  auld: [['D4', 1], ['G4', 1.5], ['G4', 0.5], ['G4', 1], ['B4', 1], ['A4', 1.5], ['G4', 0.5], ['A4', 1], ['B4', 0.5], ['A4', 0.5], ['G4', 1.5], ['G4', 0.5], ['B4', 1], ['D5', 1], ['E5', 3],
    ['E5', 1], ['D5', 1.5], ['B4', 0.5], ['B4', 1], ['G4', 1], ['A4', 1.5], ['G4', 0.5], ['A4', 1], ['B4', 0.5], ['A4', 0.5], ['G4', 1.5], ['E4', 0.5], ['E4', 1], ['D4', 1], ['G4', 3]],
};
export const SONG_NAMES = Object.keys(SONGS);
const SEMI = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
const freq = (n) => { const m = n.match(/^([A-G]#?)(\d)$/); return 440 * 2 ** ((SEMI[m[1]] + (Number(m[2]) - 4) * 12) / 12); };
const KEY = 'pl_santa_muted';
let ctx = null;
let master = null;
let stopAt = 0;

export const isSantaMuted = () => localStorage.getItem(KEY) === '1';
export const setSantaMuted = (muted) => {
  localStorage.setItem(KEY, muted ? '1' : '0');
  if (muted) { voiceToken += 1; stopSantaSong(); if (ctx) { ctx.close(); ctx = null; master = null; stopAt = 0; } window.speechSynthesis?.cancel(); }
};

function audio() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (!master) { master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); }
  if (ctx.state === 'suspended') { ctx.resume(); window.addEventListener('pointerdown', () => ctx?.resume(), { once: true }); }
  return ctx;
}

function noise(ac, t, len, filterType, f, gain) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = ac.createBufferSource(); src.buffer = buf;
  const fl = ac.createBiquadFilter(); fl.type = filterType; fl.frequency.value = f;
  const g = ac.createGain(); g.gain.value = gain;
  src.connect(fl).connect(g).connect(master); src.start(t);
}
function tone(ac, t, f, len, type, gain) {
  const o = ac.createOscillator(); const g = ac.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(master); o.start(t); o.stop(t + len + 0.02);
}
function kick(ac, t) {
  const o = ac.createOscillator(); const g = ac.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.22);
}

export function playJingle(seconds = 6, song) {
  if (isSantaMuted()) return;
  try {
    const ac = audio();
    const now = ac.currentTime;
    if (now < stopAt) return;
    const melody = SONGS[song] || SONGS[SONG_NAMES[Math.floor(Math.random() * SONG_NAMES.length)]];
    const beat = song === 'auld' ? 0.34 : 0.24;
    const voice = Math.random() < 0.5 ? 'triangle' : 'sine';
    let t = now + 0.05;
    for (let loop = 0; t - now < seconds && loop < 4; loop += 1) {
      for (const [note, len] of melody) {
        if (t - now > seconds) break;
        tone(ac, t, freq(note), len * beat * 0.95, voice, voice === 'square' ? 0.07 : 0.16);
        tone(ac, t, freq(note) / 2, len * beat * 0.9, 'sine', 0.06);
        t += len * beat;
      }
    }
    for (let b = now + 0.05, i = 0; b < t; b += beat, i += 1) { noise(ac, b, 0.12, 'highpass', 6000, 0.05); if (i % 2 === 0) kick(ac, b); else noise(ac, b, 0.08, 'bandpass', 1800, 0.08); }
    stopAt = t;
  } catch {
    // Audio is optional.
  }
}

export function playSfx(kind) {
  if (isSantaMuted()) return;
  try {
    const ac = audio(); const t = ac.currentTime + 0.02;
    if (kind === 'magic') [1319, 1568, 1976, 2637].forEach((f, i) => tone(ac, t + i * 0.07, f, 0.35, 'sine', 0.12));
    if (kind === 'pop') { noise(ac, t, 0.25, 'lowpass', 1200, 0.5); [880, 1320].forEach((f, i) => tone(ac, t + 0.05 + i * 0.05, f, 0.3, 'triangle', 0.08)); }
    if (kind === 'whoosh') noise(ac, t, 0.6, 'bandpass', 900, 0.25);
  } catch {
    // Audio is optional.
  }
}

let song = null;
const SONG_COUNT = 10;
// Plays one of the pre-recorded sung Santa greetings (public/santa-songs). Returns false if it can't play.
export function playSantaSong(onFail, onEnded) {
  if (isSantaMuted()) return;
  const recent = JSON.parse(localStorage.getItem('pl_santa_songs') || '[]');
  const pool = [...Array(SONG_COUNT).keys()].map((i) => i + 1).filter((n) => !recent.includes(n));
  const n = pool[Math.floor(Math.random() * pool.length)];
  localStorage.setItem('pl_santa_songs', JSON.stringify([n, ...recent].slice(0, 6)));
  stopSantaSong();
  song = new Audio(`${process.env.PUBLIC_URL || ''}/santa-songs/song-${n}.mp3`);
  song.volume = 0;
  song.onerror = () => onFail?.();
  song.onended = () => onEnded?.();
  song.play().then(() => {
    let v = 0;
    const fade = setInterval(() => { v = Math.min(1, v + 0.1); if (song) song.volume = v; if (v >= 1) clearInterval(fade); }, 80);
  }).catch(() => {
    const retry = () => song?.play().catch(() => {});
    window.addEventListener('pointerdown', retry, { once: true });
    song.volume = 1;
    onFail?.();
  });
}
export function softenSantaSong() {
  const s = song; if (!s) return;
  const fade = setInterval(() => { s.volume = Math.max(0, s.volume - 0.08); if (s.volume <= 0) { clearInterval(fade); s.pause(); } }, 80);
}
export function stopSantaSong() { if (song) { song.pause(); song = null; } }

let voiceToken = 0;
// Plays pre-recorded Santa voice clips (public/santa-voice/*.mp3) one after another, softening the music underneath.
export function playVoice(clips) {
  if (isSantaMuted() || !clips.length) return;
  const token = ++voiceToken;
  const duck = (v) => { if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.15); };
  const next = (i) => {
    if (token !== voiceToken || isSantaMuted()) { duck(0.9); return; }
    if (i >= clips.length) { duck(0.9); return; }
    const a = new Audio(`${process.env.PUBLIC_URL || ''}/santa-voice/${clips[i]}.mp3`);
    a.volume = 1;
    a.onended = () => setTimeout(() => next(i + 1), 180);
    a.onerror = () => next(i + 1);
    duck(0.32);
    a.play().catch(() => duck(0.9));
  };
  next(0);
}

export function santaSay(text) {
  if (isSantaMuted() || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.pitch = 0.55; u.rate = 0.92; u.volume = 0.95;
  const voice = window.speechSynthesis.getVoices().find((v) => /en-GB|en_GB/.test(v.lang) && /male|daniel|george|arthur/i.test(v.name))
    || window.speechSynthesis.getVoices().find((v) => /^en/.test(v.lang));
  if (voice) u.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
