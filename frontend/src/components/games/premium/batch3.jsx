import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Shuffle } from 'lucide-react';
import { difficultyOf, lerpLevel, seeded, seededShuffle } from '../../../lib/difficulty';
import { Board3D, useFeedback } from './kit';

const done = (onComplete, start, accuracy) => onComplete({ solved: true, accuracy: Math.max(0.05, Math.min(1, accuracy)), duration_ms: Date.now() - start });
const tile3d = 'rounded-xl border-b-[6px] shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0.5';

// ---------- Number Sequence: new look, same 1→20 rules the server expects ----------
export function PremiumNumberSequence({ config, onComplete }) {
  const level = difficultyOf(config);
  const nums = useMemo(() => seededShuffle(Array.from({ length: 20 }, (_, i) => i + 1), Math.floor(Math.random() * 1e6)), []);
  const [next, setNext] = useState(1);
  const [misses, setMisses] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const tap = (n) => {
    if (n !== next) { fire('bad'); setMisses((m) => m + 1); return; }
    fire(n === 20 ? 'good' : 'tap');
    if (n === 20) onComplete({ solved: true, accuracy: Math.max(0.1, 1 - misses * 0.05), duration_ms: Date.now() - start });
    setNext(n + 1);
  };
  return (
    <Board3D theme="math" title="Sequence Grid" level={level} flash={flash} stats={[['Next', next > 20 ? '✓' : next], ['Misses', misses]]}>
      <div className="grid grid-cols-5 gap-2">
        {nums.map((n) => <button key={n} type="button" disabled={n < next} onClick={() => tap(n)} data-testid={`seq-num-${n}`}
          className={`${tile3d} aspect-square text-xl font-black ${n < next ? 'border-emerald-800 bg-emerald-500/40 text-white/40' : 'border-sky-800 bg-gradient-to-b from-sky-200 to-sky-400 text-sky-950'}`}>{n}</button>)}
      </div>
    </Board3D>
  );
}

// ---------- Emoji Riddle: more riddles, harder answers, hints vanish ----------
const RIDDLES = [
  ['🚀🌕', 'MOON', 1], ['☀️🌻', 'SUNFLOWER', 1], ['🍎🥧', 'APPLE PIE', 1], ['⭐🐟', 'STARFISH', 1], ['🌧️🎀', 'RAINBOW', 1], ['🔥🚒', 'FIRE ENGINE', 1],
  ['🕷️🕸️👨', 'SPIDERMAN', 2], ['🦁👑', 'LION KING', 2], ['❄️👸', 'FROZEN', 2], ['🧙‍♂️💍', 'LORD OF THE RINGS', 2], ['🦇👨', 'BATMAN', 2], ['🏴‍☠️🌊', 'PIRATES', 2],
  ['🐝🍿', 'BEE MOVIE', 3], ['⏰🍊', 'CLOCKWORK ORANGE', 3], ['🦈🌊🚤', 'JAWS', 3], ['👻🔫', 'GHOSTBUSTERS', 3], ['🧊🚢', 'TITANIC', 3], ['🦖🏝️', 'JURASSIC PARK', 3],
];
export function PremiumEmojiRiddle({ config, onComplete }) {
  const level = difficultyOf(config);
  const rounds = lerpLevel(level, 1, 5);
  const tier = level <= 3 ? 1 : level <= 6 ? 2 : 3;
  const list = useMemo(() => seededShuffle(RIDDLES.filter((r) => r[2] === tier), 1200 + level).concat(seededShuffle(RIDDLES, 1201)).slice(0, rounds), [tier, level, rounds]);
  const [i, setI] = useState(0);
  const [ans, setAns] = useState('');
  const [tries, setTries] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const [emoji, answer] = list[i];
  const clean = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');
  const submit = (e) => {
    e.preventDefault();
    if (!clean(ans).includes(clean(answer))) { fire('bad'); setTries((t) => t + 1); return; }
    fire('good');
    setAns('');
    if (i + 1 >= rounds) done(onComplete, start, rounds / (rounds + tries)); else setI(i + 1);
  };
  return (
    <Board3D theme="memory" title="Emoji Cinema" level={level} flash={flash} stats={[['Riddle', `${i + 1}/${rounds}`], ['Wrong', tries]]}>
      <div className="mb-4 rounded-2xl bg-black/30 py-8 text-center text-6xl drop-shadow-[0_8px_0_rgba(0,0,0,0.3)]" data-testid="emoji-riddle">{emoji}</div>
      {level <= 6 && <p className="mb-3 text-center text-xs font-bold tracking-widest text-violet-200" data-testid="emoji-hint">{answer.replace(/[A-Z]/g, (c, k) => (k === 0 || (level <= 3 && answer[k - 1] === ' ') ? c : '•'))} · {answer.replace(/ /g, '').length} letters</p>}
      <form onSubmit={submit} className="flex gap-2">
        <input value={ans} onChange={(e) => setAns(e.target.value)} placeholder="Type your answer" className="h-12 flex-1 rounded-xl border border-white/20 bg-black/30 px-4 font-bold uppercase text-white placeholder:text-white/40" data-testid="emoji-input" />
        <button type="submit" className={`${tile3d} border-violet-800 bg-violet-400 px-5 font-black text-violet-950`} data-testid="emoji-submit">Go</button>
      </form>
    </Board3D>
  );
}

// ---------- Image Jigsaw: preview disappears and swaps become adjacent-only at high levels ----------
export function PremiumJigsaw({ size = 3, config, onComplete }) {
  const level = difficultyOf(config);
  const image = config?.image || 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&w=600';
  const total = size * size;
  const adjacentOnly = level >= 8;
  const [tiles, setTiles] = useState(() => { let s; do { s = seededShuffle([...Array(total).keys()], 1300 + level + Math.floor(Math.random() * 1e5)); } while (s.every((v, k) => v === k)); return s; });
  const [sel, setSel] = useState(null);
  const [moves, setMoves] = useState(0);
  const [peek, setPeek] = useState(level < 6);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const near = (a, b) => Math.abs((a % size) - (b % size)) + Math.abs(Math.floor(a / size) - Math.floor(b / size)) === 1;
  const click = (k) => {
    if (sel === null) { setSel(k); fire('tap'); return; }
    if (sel === k || (adjacentOnly && !near(sel, k))) { setSel(null); if (sel !== k) fire('bad'); return; }
    const next = [...tiles];
    [next[sel], next[k]] = [next[k], next[sel]];
    setTiles(next); setSel(null); setMoves((m) => m + 1);
    fire(next[k] === k || next[sel] === sel ? 'good' : 'tap');
    if (next.every((v, idx) => v === idx)) done(onComplete, start, Math.min(1, total / Math.max(moves + 1, total)));
  };
  return (
    <Board3D theme="words" title={`Picture Vault ${size}×${size}`} level={level} flash={flash} stats={[['Moves', moves], ['In place', `${tiles.filter((v, k) => v === k).length}/${total}`]]}>
      <div className="mb-3 flex justify-between text-xs text-white/70"><span>{adjacentOnly ? 'Swap neighbouring tiles only' : 'Tap two tiles to swap them'}</span>
        {level < 9 && <button type="button" onClick={() => setPeek(!peek)} className="inline-flex items-center gap-1 font-bold text-emerald-200" data-testid="jigsaw-peek">{peek ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{peek ? 'Hide' : 'Show'} picture</button>}</div>
      <div className="grid gap-1 rounded-xl bg-black/40 p-1" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {tiles.map((v, k) => <button key={k} type="button" onClick={() => click(k)} data-testid={`jigsaw-tile-${k}`} aria-label={`Tile ${k + 1}`}
          className={`aspect-square rounded-md bg-cover transition-transform ${sel === k ? 'scale-95 ring-4 ring-amber-300' : 'hover:scale-[0.98]'}`}
          style={{ backgroundImage: `url(${image})`, backgroundSize: `${size * 100}% ${size * 100}%`, backgroundPosition: `${((v % size) / (size - 1)) * 100}% ${(Math.floor(v / size) / (size - 1)) * 100}%` }} />)}
      </div>
      {peek && <img src={image} alt="Target" className="mx-auto mt-3 h-24 w-24 rounded-lg object-cover opacity-90 shadow-lg" data-testid="jigsaw-preview" />}
    </Board3D>
  );
}

// ---------- Slider Puzzle: bigger board and deeper scramble ----------
export function PremiumSlider({ config, onComplete }) {
  const level = difficultyOf(config);
  const size = level >= 6 ? 4 : 3;
  const total = size * size;
  const [board, setBoard] = useState(() => {
    const r = seeded(1400 + level + Math.floor(Math.random() * 1e5));
    const b = [...Array(total).keys()].map((x) => (x + 1) % total);
    let blank = total - 1;
    let prev = -1;
    for (let k = 0; k < lerpLevel(level, 20, 220); k += 1) {
      const opts = [blank - size, blank + size, blank % size ? blank - 1 : -1, blank % size < size - 1 ? blank + 1 : -1].filter((x) => x >= 0 && x < total && x !== prev);
      const pick = opts[Math.floor(r() * opts.length)];
      [b[blank], b[pick]] = [b[pick], b[blank]]; prev = blank; blank = pick;
    }
    return b;
  });
  const [moves, setMoves] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const move = (k) => {
    const blank = board.indexOf(0);
    const adj = Math.abs((k % size) - (blank % size)) + Math.abs(Math.floor(k / size) - Math.floor(blank / size)) === 1;
    if (!adj) { fire('bad'); return; }
    const next = [...board];
    [next[k], next[blank]] = [next[blank], next[k]];
    setBoard(next); setMoves((m) => m + 1); fire('tap');
    if (next.every((v, idx) => v === (idx + 1) % total)) { fire('good'); done(onComplete, start, Math.min(1, (total * 3) / Math.max(moves + 1, total * 3))); }
  };
  return (
    <Board3D theme="target" title="Slide Vault" level={level} flash={flash} stats={[['Moves', moves], ['Board', `${size}×${size}`]]}>
      <div className="grid gap-2 rounded-2xl bg-black/40 p-2" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {board.map((v, k) => (v === 0 ? <div key={k} className="aspect-square rounded-xl bg-black/50 shadow-inner" data-testid="slider-blank" /> :
          <button key={k} type="button" onClick={() => move(k)} data-testid={`slider-tile-${v}`} className={`${tile3d} aspect-square border-rose-900 bg-gradient-to-b from-rose-300 to-rose-500 text-2xl font-black text-rose-950`}>{v}</button>))}
      </div>
    </Board3D>
  );
}

// ---------- Pattern Repeat: longer number patterns, faster flashes ----------
export function PremiumPatternRepeat({ config, onComplete }) {
  const level = difficultyOf(config);
  const target = lerpLevel(level, 4, 12);
  const speed = lerpLevel(level, 650, 280);
  const seq = useMemo(() => { const r = seeded(1500 + level + Math.floor(Math.random() * 1e5)); return Array.from({ length: target }, () => Math.floor(r() * 9) + 1); }, [level, target]);
  const [len, setLen] = useState(Math.min(3, target));
  const [input, setInput] = useState([]);
  const [lit, setLit] = useState(null);
  const [showing, setShowing] = useState(true);
  const [errors, setErrors] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  useEffect(() => {
    setShowing(true);
    const timers = seq.slice(0, len).flatMap((n, k) => [setTimeout(() => setLit(n), speed * k + 150), setTimeout(() => setLit(null), speed * k + speed * 0.7)]);
    timers.push(setTimeout(() => setShowing(false), speed * len + 200));
    return () => timers.forEach(clearTimeout);
  }, [len, seq, speed, errors]);
  const press = (n) => {
    if (showing) return;
    const k = input.length;
    if (n !== seq[k]) { fire('bad'); setErrors((e) => e + 1); setInput([]); return; }
    fire('tap');
    if (k + 1 < len) { setInput([...input, n]); return; }
    fire('good'); setInput([]);
    if (len >= target) done(onComplete, start, target / (target + errors)); else setLen(len + 1);
  };
  return (
    <Board3D theme="reaction" title="Pattern Pulse" level={level} flash={flash} stats={[['Length', `${len}/${target}`], ['Errors', errors], ['Status', showing ? 'Watch' : 'Repeat']]}>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
        {Array.from({ length: 9 }, (_, k) => k + 1).map((n) => <button key={n} type="button" onClick={() => press(n)} data-testid={`pattern-pad-${n}`}
          className={`${tile3d} aspect-square text-2xl font-black ${lit === n ? 'scale-105 border-amber-700 bg-amber-200 text-amber-950 shadow-[0_0_30px_rgba(251,191,36,0.9)]' : 'border-amber-900 bg-gradient-to-b from-amber-500 to-amber-700 text-amber-100'}`}>{n}</button>)}
      </div>
      <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-white/50"><Shuffle className="h-3 w-3" />Watch the flashes, then tap them in order</p>
    </Board3D>
  );
}
