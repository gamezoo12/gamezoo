import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { gameSoundEnabled } from '../../../lib/gameExperience';
import './party.css';

const IMG = 'https://static.prod-images.emergentagent.com/jobs/bed71dc8-b9d4-4162-83af-25036da88173/images/';
export const PARTY_THEMES = [
  { id: 'neon', name: 'Neon City', bg: `${IMG}cee5e2c44d41c6aa784515b05912ce01610364bee6259b0a395e08b44ed438c3.jpeg`, accent: '#f472b6', glow: '#22d3ee', frame: 'linear-gradient(145deg,#1e1b4b,#581c87)', felt: '#1a1036', spark: '#f0abfc' },
  { id: 'jungle', name: 'Jungle Temple', bg: `${IMG}4ee47c30f935b6314d7cd72ab435f49323809a52fdddaebe567dae2bdef5be9d.jpeg`, accent: '#facc15', glow: '#4ade80', frame: 'linear-gradient(145deg,#3f2a14,#14532d)', felt: '#0f3d24', spark: '#fde68a' },
  { id: 'space', name: 'Cosmic Space', bg: `${IMG}625174d15792314d3890c0f801eb72f371b1ef880dd3b3e676af4bb5057357ee.jpeg`, accent: '#a78bfa', glow: '#60a5fa', frame: 'linear-gradient(145deg,#0f172a,#312e81)', felt: '#111334', spark: '#e0e7ff' },
  { id: 'lava', name: 'Lava Cave', bg: `${IMG}7ddce2d58250a6ace5b3041e3424e9119e9c3918a25a52c8f321c59a539602d5.jpeg`, accent: '#fb923c', glow: '#ef4444', frame: 'linear-gradient(145deg,#1c0a05,#7c2d12)', felt: '#2a0d06', spark: '#fdba74' },
  { id: 'ocean', name: 'Coral Reef', bg: `${IMG}d51e8681293f9c101d911e1adf94eaf8916176f41540c057aae6fee251900622.jpeg`, accent: '#2dd4bf', glow: '#38bdf8', frame: 'linear-gradient(145deg,#083344,#155e75)', felt: '#06303d', spark: '#a5f3fc' },
  { id: 'candy', name: 'Candy Land', bg: `${IMG}b1891491e401f701512b2269d9f72b08cfd213ca7e392ee870111ebe983f3ecd.jpeg`, accent: '#fb7185', glow: '#f9a8d4', frame: 'linear-gradient(145deg,#831843,#db2777)', felt: '#4a0f2c', spark: '#fbcfe8' },
  { id: 'winter', name: 'Frozen Peaks', bg: `${IMG}bb06e871daf261dc90fb53fb4a3ad75653cd86eefeb7deec173c1cb31b3905b8.jpeg`, accent: '#7dd3fc', glow: '#a5b4fc', frame: 'linear-gradient(145deg,#0c4a6e,#1e3a8a)', felt: '#0b2545', spark: '#ffffff' },
  { id: 'palace', name: 'Royal Palace', bg: `${IMG}a3cd9e6dc930169a66e31506b16b16ed17e8c059b0d2e57cbe0a5e23c8417fc9.jpeg`, accent: '#fbbf24', glow: '#f59e0b', frame: 'linear-gradient(145deg,#451a03,#92400e)', felt: '#3b0a0a', spark: '#fde68a' },
];
// A new world every 5 levels; each level inside a world shifts the light, camera and sparkle count a little.
export function themeFor(config) {
  const lv = Math.max(1, Number(config?.stage_level) || Number(config?.difficulty) || 1);
  const t = PARTY_THEMES[Math.floor((lv - 1) / 5) % PARTY_THEMES.length];
  const step = (lv - 1) % 5;
  return { ...t, lv, step, hue: step * 7 + Math.floor((lv - 1) / 40) * 25, sparks: 6 + step * 3, pan: ['50% 50%', '30% 60%', '70% 40%', '40% 30%', '60% 70%'][step] };
}

// Rivals grow with the real level: 1 rival for levels 1-5, 2 for 6-15, then 3.
export const rivalsFor = (config, max) => { const lv = Number(config?.stage_level) || 1; return Math.min(max, lv <= 5 ? 1 : lv <= 15 ? 2 : 3); };
export const YOU = { name: 'You', img: `${IMG}bb736dae19f777db839aa7565128418e483a8cbdb827de37bc6fce03ce24f865.jpeg` };
export const BOTS = [
  { name: 'Rex', img: `${IMG}c8fcf5370774ad1512e566ca73db208b345dcc5b8043ba0d582d07802dc93dd3.jpeg`, persona: 'cocky show-off who thinks he is unbeatable' },
  { name: 'Nova', img: `${IMG}83519252a22c32ade59d77333ee50e5f77445cae9ec27b30ee2f2ccac3c2464b.jpeg`, persona: 'sarcastic queen of savage comebacks' },
  { name: 'Grandpa Pip', img: `${IMG}a149421cde389c1a5a9848d2ddea04dab5e91c88f758a690802e34a5550ce397.jpeg`, persona: 'cheerful grandpa who tells cheesy dad jokes' },
  { name: 'Zara', img: `${IMG}7bc8ba8e7a591f3a4ceb8cd03470b033f65c5102c4bde88ebd124f102f40742f.jpeg`, persona: 'dramatic diva who overreacts to everything' },
];

// ---------- Sound: small synth so every game has real effects without audio files ----------
let ctx;
function ac() { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx ||= new C(); if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
function tone(a, f, d, { type = 'sine', at = 0, vol = 0.08, to } = {}) {
  const o = a.createOscillator(); const g = a.createGain(); const t = a.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(a, d, { at = 0, vol = 0.12, freq = 2500 } = {}) {
  const b = a.createBuffer(1, Math.ceil(a.sampleRate * d), a.sampleRate); const ch = b.getChannelData(0);
  for (let i = 0; i < ch.length; i += 1) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
  const s = a.createBufferSource(); const f = a.createBiquadFilter(); const g = a.createGain(); const t = a.currentTime + at;
  s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol; s.connect(f); f.connect(g); g.connect(a.destination); s.start(t);
}
const SFX = {
  dice: (a) => [0, 0.07, 0.15, 0.25, 0.37, 0.5].forEach((at, i) => noise(a, 0.05, { at, freq: 1800 + i * 200, vol: 0.18 })),
  step: (a) => tone(a, 880, 0.05, { type: 'triangle', vol: 0.06 }),
  capture: (a) => { tone(a, 700, 0.4, { type: 'sawtooth', to: 110, vol: 0.06 }); noise(a, 0.15, { at: 0.35, freq: 200, vol: 0.3 }); },
  home: (a) => [523, 659, 784, 1046].forEach((f, i) => tone(a, f, 0.18, { at: i * 0.09, type: 'triangle', vol: 0.07 })),
  six: (a) => { tone(a, 1318, 0.25, { vol: 0.06 }); tone(a, 1760, 0.3, { at: 0.08, vol: 0.05 }); },
  win: (a) => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(a, f, 0.22, { at: i * 0.11, type: 'square', vol: 0.04 })),
  lose: (a) => [392, 370, 349, 262].forEach((f, i) => tone(a, f, i === 3 ? 0.6 : 0.3, { at: i * 0.3, type: 'sawtooth', vol: 0.05 })),
  card: (a) => noise(a, 0.08, { freq: 4000, vol: 0.14 }),
  drop: (a) => { tone(a, 420, 0.22, { to: 90, vol: 0.09 }); noise(a, 0.06, { at: 0.2, freq: 600, vol: 0.2 }); },
  pop: (a) => tone(a, 320, 0.12, { to: 980, vol: 0.08 }),
  combo: (a) => [660, 880, 1100, 1320].forEach((f, i) => tone(a, f, 0.1, { at: i * 0.05, type: 'triangle', vol: 0.06 })),
  chat: (a) => { tone(a, 990, 0.06, { vol: 0.04 }); tone(a, 1320, 0.07, { at: 0.07, vol: 0.04 }); },
  tick: (a) => tone(a, 1400, 0.03, { type: 'square', vol: 0.03 }),
  bad: (a) => tone(a, 200, 0.2, { type: 'square', vol: 0.05, to: 140 }),
  ladder: (a) => [440, 554, 659, 880, 1108].forEach((f, i) => tone(a, f, 0.1, { at: i * 0.06, type: 'triangle', vol: 0.06 })),
  laugh: (a) => [0, 0.13, 0.26, 0.39].forEach((at, i) => tone(a, 620 - i * 40, 0.1, { at, type: 'triangle', vol: 0.07, to: 480 - i * 40 })),
  clap: (a) => [0, 0.12, 0.24, 0.36, 0.48].forEach((at) => noise(a, 0.06, { at, freq: 1400, vol: 0.3 })),
  cry: (a) => tone(a, 520, 0.7, { type: 'sine', vol: 0.06, to: 260 }),
  snake: (a) => { noise(a, 0.5, { freq: 5000, vol: 0.1 }); tone(a, 600, 0.6, { to: 150, vol: 0.05, type: 'sawtooth' }); },
};
export function sfx(kind) { if (!gameSoundEnabled()) return; try { const a = ac(); if (a) SFX[kind]?.(a); } catch { /* audio unavailable */ } }

// ---------- Bot banter: instant ready-made lines, AI-written lines at big moments ----------
const LINES = {
  start: ['Hope you stretched, this is gonna hurt 😏', 'I have never lost. Today is not the day.', 'Grab snacks, you will be here a while.', 'Let us make this quick, I have a nap booked.'],
  bot_hit: ['Oops! Was that yours? 😂', 'Sit down, take a seat, back to the start!', 'Nothing personal… OK it is a bit personal.', 'Did that sting? It looked like it stung.', 'Sending you home, pack a lunch!'],
  you_hit: ['HEY! I had plans for that!', 'Rude. Very rude. Noted.', 'Revenge is coming, just so you know 😤', 'Lucky. Pure luck. Zero skill.', 'I let you do that. Strategy.'],
  bot_good: ['Too easy. Are you even trying?', 'Chef’s kiss 🤌', 'Watch and learn, rookie.', 'That move had style AND grace.'],
  you_good: ['OK, OK, not bad… for a beginner.', 'Who taught you that? Give them back.', 'Fine. That was decent. Do not get used to it.', 'Hmm, suspicious. Are you secretly a pro?'],
  bot_bad: ['That was a… warm-up move.', 'My finger slipped. Totally not my fault.', 'I meant to do that. Obviously.', 'Shh, nobody saw that.'],
  taunt: ['Any day now… ⏳', 'Thinking hard? Do not hurt yourself.', 'I could do this in my sleep. Actually I just did.', 'Take your time, I am only ageing.'],
  bot_win: ['GG! Better luck next time, champ 👑', 'Another win for the trophy shelf!', 'Was there ever any doubt? 😎', 'Rematch? I could use the practice… not.'],
  you_win: ['NOOO! I demand a rematch!', 'Fine, you win. This time. 😤', 'I let you win. You are welcome.', 'The dice were rigged, I swear!'],
  cheer_start: ['Welcome, superstar! Let us make it rain sweets 🍬', 'Your board is ready. Show me something sweet!', 'Deep breath… and SWAP!'],
  cheer: ['WOW! Look at that combo! 🎉', 'Sweet move, you are on fire 🔥', 'The crowd goes wild!', 'Delicious! Keep it coming!', 'That was pure magic ✨'],
  cheer_sad: ['Ooh, so close! Try another swap.', 'No match there, keep looking 👀', 'Hmm, not that one. You got this!'],
  reply: ['Big talk for someone losing 😏', 'Words are cute, moves are better.', 'Oh you have jokes now? Cute.', 'Talk to the scoreboard 📋', 'Haha, keep dreaming!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const REACTIONS = [['😂', 'laugh'], ['😡', 'bad'], ['👏', 'clap'], ['😭', 'cry'], ['🔥', 'combo'], ['😎', 'six']];
export const reactSound = (e) => sfx((REACTIONS.find(([x]) => x === e) || [])[1] || 'pop');
export const QUICK_REPLIES = ['Bring it on 😤', 'So lucky!', 'Haha 😂', 'Watch this…', 'GG'];

export function useBanter(game, bots) {
  const [msgs, setMsgs] = useState([]);
  const lastAi = useRef(0);
  const lastLine = useRef(0);
  const push = useCallback((who, text, emoji = '') => { setMsgs((m) => (m.some((x) => x.who === who && x.text === text && x.emoji === emoji && Date.now() - x.at < 3000) ? m : [...m.slice(-7), { id: Math.random(), who, text, emoji, mine: who < 0, name: who >= 0 ? `${bots[who]?.name}: ` : '', at: Date.now() }])); if (emoji) reactSound(emoji); else if (who >= 0) sfx('chat'); }, [bots]);
  const ai = useCallback(async (who, event, detail, said, kind) => {
    const bot = bots[who];
    try {
      const { data } = await api.post('/games/practice/banter', { game, bot: bot.name, persona: bot.persona, event, detail, player_said: said || '' }, { timeout: 4000 });
      push(who, data.text || pick(LINES[kind]));
    } catch { push(who, pick(LINES[kind] || LINES.reply)); }
  }, [bots, game, push]);
  // kind: key of LINES; big=true lets the AI write it (at most one AI line every 7s)
  const say = useCallback((who, kind, { big = false, event, detail = '', force = false } = {}) => {
    if (!bots[who]) return;
    const now = Date.now();
    if (!force && !big && now - lastLine.current < 3500) return;
    lastLine.current = now;
    if (big && now - lastAi.current > 7000) { lastAi.current = now; ai(who, event || kind.replace('_', ' '), detail, '', kind); return; }
    push(who, pick(LINES[kind]));
  }, [ai, bots, push]);
  const reply = useCallback((text) => {
    push(-1, text);
    const who = Math.floor(Math.random() * bots.length);
    const now = Date.now();
    if (now - lastAi.current > 5000) { lastAi.current = now; setTimeout(() => ai(who, 'player sent a chat message', '', text, 'reply'), 500); }
    else setTimeout(() => push(who, pick(LINES.reply)), 700);
  }, [ai, bots.length, push]);
  const react = useCallback((emoji) => {
    push(-1, '', emoji);
    if (!bots.length) return;
    const who = Math.floor(Math.random() * bots.length);
    setTimeout(() => push(who, '', pick(REACTIONS.filter(([e]) => e !== emoji))[0]), 900);
    if (Math.random() < 0.5) setTimeout(() => push(who, pick(LINES.reply)), 1700);
  }, [bots, push]);
  return { msgs, say, reply, react, line: push, quick: true };
}

// ---------- Clocks: per-turn countdown + whole-match countdown ----------
export function useClocks({ turnSec, matchSec, turnKey, running, onTurnOut, onMatchOut }) {
  const [now, setNow] = useState(Date.now());
  const turnStart = useRef(Date.now());
  const matchStart = useRef(Date.now());
  const fired = useRef({ turn: null, match: false });
  const cb = useRef({ onTurnOut, onMatchOut });
  cb.current = { onTurnOut, onMatchOut };
  useEffect(() => { turnStart.current = Date.now(); fired.current.turn = null; setNow(Date.now()); }, [turnKey]);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      const t = Date.now(); setNow(t);
      const tl = turnSec ? turnSec * 1000 - (t - turnStart.current) : Infinity;
      const ml = matchSec ? matchSec * 1000 - (t - matchStart.current) : Infinity;
      if (tl < 4000 && tl > 0 && Math.floor(tl / 1000) !== Math.floor((tl + 250) / 1000)) sfx('tick');
      if (ml <= 0 && !fired.current.match) { fired.current.match = true; cb.current.onMatchOut?.(); return; }
      if (tl <= 0 && fired.current.turn !== turnKey) { fired.current.turn = turnKey; cb.current.onTurnOut?.(turnKey); }
    }, 250);
    return () => clearInterval(id);
  }, [running, turnSec, matchSec, turnKey]);
  return {
    turnLeft: turnSec ? Math.max(0, turnSec * 1000 - (now - turnStart.current)) / 1000 : null,
    matchLeft: matchSec ? Math.max(0, matchSec * 1000 - (now - matchStart.current)) / 1000 : null,
  };
}

// Live room chat in the same shape as bot banter (who = seat - 1, so seat 0 maps to the first avatar).
export function useRoomChat(room, send) {
  const msgs = (room?.chat || []).map((m) => ({ id: m.id, who: m.seat - 1, text: m.text, emoji: m.emoji, name: `${m.name}: `, mine: m.seat === room.seat, at: Date.parse(m.at) }));
  const seen = useRef(new Set(msgs.map((m) => m.id)));
  useEffect(() => { msgs.forEach((m) => { if (!seen.current.has(m.id)) { seen.current.add(m.id); if (m.emoji) reactSound(m.emoji); else if (!m.mine) sfx('chat'); } }); });
  const noop = useCallback(() => {}, []);
  return { msgs, say: noop, line: noop, reply: (text) => send({ text }), react: (emoji) => send({ emoji }), quick: false };
}

// Local state offline; in a live room the room state is the truth and every change is pushed to the server.
export function useGameState(init, online) {
  const [local, setLocal] = useState(init);
  const cur = useRef(null);
  const g = online ? online.state : local;
  cur.current = g;
  const set = useCallback((fn) => {
    if (!online) { setLocal(fn); return; }
    const next = typeof fn === 'function' ? fn(cur.current) : fn;
    if (next !== cur.current) { cur.current = next; online.push(next, next.roomWinner ?? null); }
  }, [online]);
  return [g, set];
}
export const onlinePlayers = (online, colors, info) => online.names.map((n, i) => ({ name: i === online.seat ? 'You' : n, img: i === online.seat ? YOU.img : null, color: colors[i], info: info(i) }));
