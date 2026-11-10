import { worldAPI } from './api';
import { audioCtx, masterOut } from './soundFiles';

// [name, wave, attack, decay, harmonic, sweep, vibrato, gain]
const INSTRUMENTS = [
  ['Chime', 'sine', 0.005, 0.5, 2, 0, 0, 0.32], ['Arcade', 'square', 0.002, 0.12, 0, 0, 0, 0.12],
  ['Flute', 'triangle', 0.03, 0.25, 0, 0, 5, 0.3], ['Synth', 'sawtooth', 0.01, 0.2, 0, 0, 0, 0.12],
  ['Bell', 'sine', 0.002, 0.9, 2.76, 0, 0, 0.28], ['Marimba', 'sine', 0.002, 0.18, 4, 0, 0, 0.35],
  ['Pluck', 'sawtooth', 0.002, 0.15, 0, -0.3, 0, 0.12], ['Bubble', 'sine', 0.005, 0.12, 0, 0.8, 0, 0.32],
  ['Laser', 'sawtooth', 0.002, 0.15, 0, -0.6, 0, 0.1], ['Organ', 'sine', 0.02, 0.22, 2, 0, 0, 0.25],
  ['Glass', 'sine', 0.002, 0.6, 1.5, 0, 0, 0.22], ['Bass Pop', 'triangle', 0.003, 0.14, 0, -0.4, 0, 0.4],
  ['Retro 8-bit', 'square', 0.001, 0.08, 0, 0, 0, 0.1], ['Kalimba', 'sine', 0.002, 0.35, 3, 0, 0, 0.3],
  ['Soft Pad', 'triangle', 0.06, 0.4, 2, 0, 3, 0.25], ['Whistle', 'sine', 0.02, 0.2, 0, 0.05, 7, 0.25],
  ['Toy Piano', 'triangle', 0.002, 0.3, 3, 0, 0, 0.28], ['Space', 'sine', 0.02, 0.45, 1.5, 0, 9, 0.25],
  ['Festive Bells', 'sine', 0.002, 1.1, 3.5, 0, 0, 0.25], ['Wood Block', 'triangle', 0.001, 0.06, 5, -0.2, 0, 0.4],
];
// [name, root Hz, third]
const MOODS = [['Bright', 1046.5, 4], ['Calm', 440, 4], ['Playful', 784, 4], ['Deep', 196, 3], ['Epic', 293.7, 3]];

const motif = (third) => ({
  tap: [[12, 0.04]], countdown: [[5, 0.08]], correct: [[7, 0.07], [12, 0.11]], incorrect: [[0, 0.12], [-6, 0.22]],
  start: [[0, 0.08], [third, 0.08], [7, 0.08], [12, 0.2]],
  success: [[0, 0.1], [third, 0.1], [7, 0.1], [12, 0.1], [third + 12, 0.12], [19, 0.34]],
  failure: [[7, 0.15], [6, 0.15], [5, 0.15], [0, 0.45]],
});

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const SOUND_PACKS = INSTRUMENTS.flatMap((inst) => MOODS.map((mood) => ({
  id: slug(`${inst[0]} ${mood[0]}`), name: `${inst[0]} ${mood[0]}`, inst, mood,
})));
export const SOUND_EVENTS = [['tap', 'Tap'], ['correct', 'Correct'], ['incorrect', 'Wrong'], ['countdown', 'Countdown'], ['start', 'Start'], ['success', 'Win'], ['failure', 'Lose']];
const byId = Object.fromEntries(SOUND_PACKS.map((p) => [p.id, p]));

function note(a, out, inst, freq, at, len) {
  const [, wave, attack, decay, harmonic, sweep, vibrato, gainLevel] = inst;
  const g = a.createGain();
  const end = at + len + decay;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gainLevel, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  g.connect(out);
  [[1, 1], ...(harmonic ? [[harmonic, 0.35]] : [])].forEach(([mult, level]) => {
    const o = a.createOscillator(); const og = a.createGain();
    o.type = wave; o.frequency.setValueAtTime(freq * mult, at);
    if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * mult * (1 + sweep)), at + len + decay * 0.5);
    if (vibrato) { const l = a.createOscillator(); const lg = a.createGain(); l.frequency.value = vibrato; lg.gain.value = freq * 0.012; l.connect(lg); lg.connect(o.frequency); l.start(at); l.stop(end); }
    og.gain.value = level; o.connect(og); og.connect(g); o.start(at); o.stop(end + 0.02);
  });
}

export function playPack(pack, kind) {
  const a = audioCtx(); if (!a) return false;
  const out = masterOut();
  const [, root, third] = pack.mood;
  const seq = motif(third)[kind] || motif(third).tap;
  let t = a.currentTime + 0.01;
  seq.forEach(([semi, len]) => { note(a, out, pack.inst, root * 2 ** (semi / 12), t, len); t += len; });
  return true;
}

let activeId = null;
export const setActiveSoundPack = (id) => { activeId = id && byId[id] ? id : null; };
export const activeSoundPack = () => (activeId ? byId[activeId] : null);
worldAPI.soundPack().then((r) => setActiveSoundPack(r?.pack_id)).catch(() => {});
