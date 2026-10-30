import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { difficultyOf, lerpLevel, seeded, seededShuffle } from '../../../lib/difficulty';
import { Board3D, useFeedback } from './kit';
import { useKeyMoves } from './batch4';

const done = (onComplete, start, accuracy) => onComplete({ solved: true, accuracy: Math.max(0.05, Math.min(1, accuracy)), duration_ms: Date.now() - start });
const key3d = 'rounded-xl border-b-[5px] shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0.5';
const rand = () => Math.floor(Math.random() * 1e6);

function Pad({ onMove }) {
  const b = (d, Icon) => <button type="button" onClick={() => onMove(d)} className={`${key3d} flex h-11 w-11 items-center justify-center border-slate-800 bg-slate-300 text-slate-900`} data-testid={`pad-${d}`} aria-label={d}><Icon className="h-5 w-5" /></button>;
  return <div className="mt-3 grid grid-cols-3 justify-center gap-1.5" style={{ gridTemplateColumns: 'repeat(3, 44px)', justifyContent: 'center' }}><span />{b('up', ArrowUp)}<span />{b('left', ArrowLeft)}{b('down', ArrowDown)}{b('right', ArrowRight)}</div>;
}
function useSwipe(onMove) {
  const p = useRef(null);
  return {
    onTouchStart: (e) => { p.current = [e.touches[0].clientX, e.touches[0].clientY]; },
    onTouchEnd: (e) => { if (!p.current) return; const dx = e.changedTouches[0].clientX - p.current[0]; const dy = e.changedTouches[0].clientY - p.current[1]; if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) onMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); p.current = null; },
  };
}

// ---------- Nonogram: bigger pictures ----------
const clues = (line) => { const out = []; let run = 0; line.forEach((v) => { if (v) run += 1; else if (run) { out.push(run); run = 0; } }); if (run) out.push(run); return out.length ? out : [0]; };
export function PremiumNonogram({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = level <= 3 ? 5 : level <= 7 ? 6 : 7;
  const sol = useMemo(() => { const r = seeded(2400 + level + rand()); return Array.from({ length: n * n }, () => r() < 0.58); }, [level, n]);
  const rows = (g) => [...Array(n).keys()].map((r) => g.slice(r * n, r * n + n));
  const cols = (g) => [...Array(n).keys()].map((c) => [...Array(n).keys()].map((r) => g[r * n + c]));
  const rc = useMemo(() => rows(sol).map(clues), [sol]); // eslint-disable-line react-hooks/exhaustive-deps
  const cc = useMemo(() => cols(sol).map(clues), [sol]); // eslint-disable-line react-hooks/exhaustive-deps
  const [grid, setGrid] = useState(() => Array(n * n).fill(0));
  const [taps, setTaps] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const tap = (k) => {
    const g = grid.map((v, x) => (x === k ? (v + 1) % 3 : v));
    setGrid(g); setTaps((t) => t + 1); fire('tap');
    const filled = g.map((v) => v === 1);
    if (rows(filled).every((l, i) => clues(l).join() === rc[i].join()) && cols(filled).every((l, i) => clues(l).join() === cc[i].join())) { fire('good'); done(onComplete, start, Math.min(1, sol.filter(Boolean).length / Math.max(1, taps + 1))); }
  };
  return (
    <Board3D theme="memory" title="Picture Logic" level={level} flash={flash} stats={[['Grid', `${n}×${n}`], ['Taps', taps]]}>
      <div className="mx-auto w-fit">
        <div className="flex"><div style={{ width: 56 }} />{cc.map((c, i) => <div key={i} className="flex w-9 flex-col items-center justify-end pb-1 text-[11px] font-black leading-tight text-violet-200" style={{ minHeight: 56 }}>{c.map((v, k) => <span key={k}>{v}</span>)}</div>)}</div>
        {[...Array(n).keys()].map((r) => <div key={r} className="flex items-center"><div className="w-14 pr-2 text-right text-[11px] font-black text-violet-200">{rc[r].join(' ')}</div>
          {[...Array(n).keys()].map((c) => { const k = r * n + c; return <button key={c} type="button" onClick={() => tap(k)} data-testid={`nonogram-cell-${k}`} className={`m-px h-9 w-9 rounded-md transition-colors ${grid[k] === 1 ? 'bg-violet-300 shadow-[inset_0_-4px_0_rgba(0,0,0,0.25)]' : grid[k] === 2 ? 'bg-black/40 text-rose-300' : 'bg-white/10 hover:bg-white/20'}`}>{grid[k] === 2 ? '×' : ''}</button>; })}</div>)}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/60">Tap once to fill, twice to mark empty. Match every row and column clue.</p>
    </Board3D>
  );
}

// ---------- 2048: higher target tiles ----------
const TARGETS = [32, 64, 128, 128, 256, 256, 512, 512, 1024, 2048];
const TILE = { 2: '#fef3c7', 4: '#fde68a', 8: '#fdba74', 16: '#fb923c', 32: '#f87171', 64: '#ef4444', 128: '#facc15', 256: '#eab308', 512: '#a3e635', 1024: '#22d3ee', 2048: '#a78bfa' };
function slide(row) { const a = row.filter(Boolean); for (let i = 0; i < a.length - 1; i += 1) if (a[i] === a[i + 1]) { a[i] *= 2; a.splice(i + 1, 1); } while (a.length < 4) a.push(0); return a; }
function shift(g, d) {
  const get = (r, c) => g[r * 4 + c];
  const out = Array(16).fill(0);
  for (let i = 0; i < 4; i += 1) {
    const line = [0, 1, 2, 3].map((j) => (d === 'left' ? get(i, j) : d === 'right' ? get(i, 3 - j) : d === 'up' ? get(j, i) : get(3 - j, i)));
    slide(line).forEach((v, j) => { const [r, c] = d === 'left' ? [i, j] : d === 'right' ? [i, 3 - j] : d === 'up' ? [j, i] : [3 - j, i]; out[r * 4 + c] = v; });
  }
  return out;
}
const spawn = (g) => { const empty = g.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0); if (!empty.length) return g; const k = empty[Math.floor(Math.random() * empty.length)]; return g.map((v, x) => (x === k ? (Math.random() < 0.9 ? 2 : 4) : v)); };
export function Premium2048({ config, onComplete }) {
  const level = difficultyOf(config);
  const target = TARGETS[level - 1];
  const [g, setG] = useState(() => spawn(spawn(Array(16).fill(0))));
  const [moves, setMoves] = useState(0);
  const [resets, setResets] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const fin = useRef(false);
  const gRef = useRef(g);
  gRef.current = g;
  const move = useCallback((d) => {
    const cur = gRef.current;
    if (fin.current) return;
    const next = shift(cur, d);
    if (next.every((v, k) => v === cur[k])) return;
    const s = spawn(next);
    setMoves((m) => m + 1);
    fire(Math.max(...s) > Math.max(...cur) ? 'good' : 'tap');
    if (Math.max(...s) >= target) { fin.current = true; setG(s); setTimeout(() => done(onComplete, start, 1 / (1 + resets * 0.3)), 200); return; }
    if (['left', 'right', 'up', 'down'].every((x) => shift(s, x).every((v, k) => v === s[k]))) { fire('bad'); setResets((r) => r + 1); setG(spawn(spawn(Array(16).fill(0)))); return; }
    setG(s);
  }, [target, fire, onComplete, start, resets]);
  useKeyMoves(move);
  const swipe = useSwipe(move);
  return (
    <Board3D theme="reaction" title={`Reach ${target}`} level={level} flash={flash} stats={[['Best tile', Math.max(...g)], ['Moves', moves], ['Resets', resets]]}>
      <div {...swipe} className="mx-auto grid max-w-xs touch-none grid-cols-4 gap-2 rounded-2xl bg-amber-950/60 p-2" data-testid="tf2048-board">
        {g.map((v, k) => <div key={k} className="flex aspect-square items-center justify-center rounded-xl text-xl font-black shadow-[inset_0_-5px_0_rgba(0,0,0,0.2)] transition-colors" style={{ background: v ? TILE[v] || '#f0abfc' : 'rgba(0,0,0,0.3)', color: v > 4 ? '#fff' : '#78350f' }}>{v || ''}</div>)}
      </div>
      <Pad onMove={move} />
    </Board3D>
  );
}

// ---------- Cryptogram: longer phrases, fewer revealed letters ----------
const PHRASES = ['SKILL WINS', 'PLAY TO WIN', 'THINK FAST', 'MIND OVER MATTER', 'PRACTICE MAKES PERFECT', 'FORTUNE FAVOURS THE BRAVE', 'EVERY CHAMPION WAS ONCE A CONTENDER', 'THE HARDER YOU WORK THE LUCKIER YOU GET'];
export function PremiumCryptogram({ config, onComplete }) {
  const level = difficultyOf(config);
  const phrase = useMemo(() => PHRASES[Math.min(PHRASES.length - 1, Math.floor((level - 1) * 0.8) + Math.floor(Math.random() * 2))], [level]);
  const { cipher, reveal } = useMemo(() => {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    let sh; do { sh = seededShuffle(abc, rand()); } while (sh.some((c, k) => c === abc[k]));
    const map = Object.fromEntries(abc.map((c, k) => [c, sh[k]]));
    const letters = [...new Set(phrase.replace(/ /g, ''))];
    return { cipher: map, reveal: new Set(seededShuffle(letters, rand()).slice(0, Math.max(0, lerpLevel(level, 5, 0)))) };
  }, [phrase, level]);
  const [guess, setGuess] = useState({});
  const [checks, setChecks] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const letters = [...new Set(phrase.replace(/ /g, ''))];
  const setL = (c, v) => setGuess({ ...guess, [c]: v.toUpperCase().slice(-1) });
  const check = () => {
    setChecks((x) => x + 1);
    if (letters.every((c) => reveal.has(c) || guess[c] === c)) { fire('good'); done(onComplete, start, 1 / (1 + checks * 0.2)); } else fire('bad');
  };
  return (
    <Board3D theme="words" title="Cipher Room" level={level} flash={flash} stats={[['Letters', letters.length], ['Checks', checks]]}>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-3" data-testid="crypto-phrase">
        {phrase.split(' ').map((w, wi) => <div key={wi} className="flex gap-1">{w.split('').map((c, k) => <label key={k} className="flex flex-col items-center">
          {reveal.has(c) ? <span className="flex h-10 w-8 items-center justify-center rounded-md bg-emerald-300 text-lg font-black text-emerald-950">{c}</span>
            : <input value={guess[c] || ''} onChange={(e) => setL(c, e.target.value)} maxLength={2} className="h-10 w-8 rounded-md border-b-4 border-emerald-700 bg-black/40 text-center text-lg font-black uppercase text-white" data-testid={`crypto-input-${wi}-${k}`} aria-label={`Letter for ${cipher[c]}`} />}
          <span className="mt-0.5 font-mono text-[11px] font-bold text-emerald-200/70">{cipher[c]}</span></label>)}</div>)}
      </div>
      <div className="mt-5 text-center"><button type="button" onClick={check} className={`${key3d} border-emerald-900 bg-emerald-400 px-6 py-2 font-black text-emerald-950`} data-testid="crypto-check">Check phrase</button></div>
      <p className="mt-2 text-center text-[11px] text-white/60">Each code letter always stands for the same real letter.</p>
    </Board3D>
  );
}

// ---------- Anagram Finder: find more words ----------
const SETS = [
  { letters: 'AERSTL', words: ['TALES', 'LATER', 'SLATE', 'STARE', 'STEAL', 'LEAST', 'TEARS', 'RATE', 'TEAR', 'SALT', 'LAST', 'REST', 'STAR', 'SEAT', 'EAST', 'REAL'] },
  { letters: 'RAINED', words: ['RAIN', 'RIDE', 'DARE', 'READ', 'DEAR', 'DINER', 'DRAIN', 'NEAR', 'EARN', 'DINE', 'AIDE', 'RAID', 'AREN', 'IRED'] },
  { letters: 'PLANET', words: ['PLAN', 'LEAP', 'TALE', 'LATE', 'PLANE', 'PANEL', 'PLATE', 'PLANT', 'NEAT', 'PANT', 'LANE', 'PELT', 'TAPE', 'PEAT'] },
  { letters: 'STONES', words: ['NOTE', 'TONE', 'TENS', 'NEST', 'NOSE', 'STONE', 'NOTES', 'ONSET', 'ONES', 'SENT', 'TOSS', 'NESTS'] },
];
export function PremiumAnagram({ config, onComplete }) {
  const level = difficultyOf(config);
  const set = useMemo(() => SETS[Math.floor(Math.random() * SETS.length)], []);
  const need = lerpLevel(level, 2, 8);
  const minLen = level >= 7 ? 5 : 4;
  const [found, setFound] = useState([]);
  const [word, setWord] = useState('');
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const valid = set.words.filter((w) => w.length >= minLen && w !== 'AREN' && w !== 'IRED');
  const submit = (e) => {
    e.preventDefault();
    const w = word.toUpperCase().trim();
    setWord('');
    if (!valid.includes(w) || found.includes(w)) { fire('bad'); setWrong((x) => x + 1); return; }
    fire('good');
    const f = [...found, w];
    setFound(f);
    if (f.length >= Math.min(need, valid.length)) done(onComplete, start, f.length / (f.length + wrong));
  };
  return (
    <Board3D theme="math" title="Anagram Hunt" level={level} flash={flash} stats={[['Found', `${found.length}/${Math.min(need, valid.length)}`], ['Min letters', minLen], ['Wrong', wrong]]}>
      <div className="mb-4 flex justify-center gap-2">{set.letters.split('').map((c, k) => <span key={k} className="flex h-12 w-11 items-center justify-center rounded-xl border-b-[6px] border-sky-800 bg-gradient-to-b from-sky-200 to-sky-400 text-2xl font-black text-sky-950">{c}</span>)}</div>
      <form onSubmit={submit} className="flex gap-2"><input value={word} onChange={(e) => setWord(e.target.value)} className="h-12 flex-1 rounded-xl border border-white/20 bg-black/30 px-4 font-bold uppercase text-white" placeholder="Type a word" data-testid="anagram-input" />
        <button type="submit" className={`${key3d} border-sky-900 bg-sky-400 px-5 font-black text-sky-950`} data-testid="anagram-submit">Add</button></form>
      <div className="mt-3 flex flex-wrap gap-1.5">{found.map((w) => <span key={w} className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-black text-emerald-200">{w}</span>)}</div>
    </Board3D>
  );
}

// ---------- Maze: bigger mazes, fog at high levels ----------
function makeMaze(n, seed) {
  const r = seeded(seed);
  const walls = Array.from({ length: n * n }, () => [true, true, true, true]);
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const k = stack[stack.length - 1]; const x = k % n; const y = Math.floor(k / n);
    const opts = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]].filter(([dx, dy]) => { const nx = x + dx; const ny = y + dy; return nx >= 0 && ny >= 0 && nx < n && ny < n && !seen.has(ny * n + nx); });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy, w, ow] = opts[Math.floor(r() * opts.length)]; const nk = (y + dy) * n + x + dx;
    walls[k][w] = false; walls[nk][ow] = false; seen.add(nk); stack.push(nk);
  }
  return walls;
}
export function PremiumMaze({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = lerpLevel(level, 5, 14);
  const walls = useMemo(() => makeMaze(n, 2500 + level + rand()), [n, level]);
  const [pos, setPos] = useState(0);
  const [steps, setSteps] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const fog = level >= 8;
  const posRef = useRef(0);
  const move = useCallback((d) => {
    const p = posRef.current;
    if (p === n * n - 1) return;
    const [w, delta] = { up: [0, -n], right: [1, 1], down: [2, n], left: [3, -1] }[d];
    if (walls[p][w]) { fire('bad'); return; }
    const np = p + delta;
    posRef.current = np;
    setPos(np);
    setSteps((s) => s + 1);
    if (np === n * n - 1) { fire('good'); setTimeout(() => done(onComplete, start, 1), 150); } else fire('tap');
  }, [walls, n, fire, onComplete, start]);
  useKeyMoves(move);
  const swipe = useSwipe(move);
  const px = Math.floor(pos % n); const py = Math.floor(pos / n);
  return (
    <Board3D theme="target" title="Labyrinth" level={level} flash={flash} stats={[['Maze', `${n}×${n}`], ['Steps', steps]]}>
      <div {...swipe} className="mx-auto grid aspect-square max-w-sm touch-none rounded-lg bg-rose-950/60 p-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} data-testid="maze-board">
        {walls.map((w, k) => { const hidden = fog && Math.abs((k % n) - px) + Math.abs(Math.floor(k / n) - py) > 2 && k !== n * n - 1; const b = hidden ? '2px solid #000' : '2px solid #fda4af';
          return <div key={k} className={`relative ${hidden ? 'bg-black' : ''}`} style={{ borderTop: w[0] ? b : '2px solid transparent', borderRight: w[1] ? b : '2px solid transparent', borderBottom: w[2] ? b : '2px solid transparent', borderLeft: w[3] ? b : '2px solid transparent' }}>
            {k === pos && <span className="absolute inset-[18%] rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.9)]" data-testid="maze-player" />}
            {k === n * n - 1 && <span className="absolute inset-[18%] rounded-sm bg-emerald-400" data-testid="maze-exit" />}
          </div>; })}
      </div>
      <Pad onMove={move} />
    </Board3D>
  );
}

// ---------- Spot the Pattern: remember more cells, shorter look ----------
export function PremiumSpotPattern({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = lerpLevel(level, 3, 6);
  const cells = lerpLevel(level, 3, 12);
  const showMs = lerpLevel(level, 2200, 800);
  const rounds = lerpLevel(level, 2, 5);
  const [round, setRound] = useState(0);
  const pattern = useMemo(() => new Set(seededShuffle([...Array(n * n).keys()], 2600 + round + level + rand()).slice(0, cells)), [round, n, cells, level]);
  const [phase, setPhase] = useState('show');
  const [picked, setPicked] = useState(new Set());
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const timer = useRef();
  if (phase === 'show' && !timer.current) timer.current = setTimeout(() => { setPhase('recall'); timer.current = null; }, showMs);
  const tap = (k) => {
    if (phase !== 'recall' || picked.has(k)) return;
    if (!pattern.has(k)) { fire('bad'); setWrong((w) => w + 1); return; }
    fire('tap');
    const p = new Set(picked); p.add(k); setPicked(p);
    if (p.size === cells) { fire('good'); if (round + 1 >= rounds) done(onComplete, start, (rounds * cells) / (rounds * cells + wrong)); else { setRound(round + 1); setPicked(new Set()); setPhase('show'); } }
  };
  return (
    <Board3D theme="memory" title="Flash Memory" level={level} flash={flash} stats={[['Round', `${round + 1}/${rounds}`], ['Cells', `${picked.size}/${cells}`], ['Wrong', wrong]]}>
      <p className="mb-2 text-center text-xs font-black uppercase tracking-widest text-violet-200" data-testid="spot-phase">{phase === 'show' ? 'Memorise the glowing squares' : 'Tap the squares that glowed'}</p>
      <div className="mx-auto grid max-w-xs gap-1.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {[...Array(n * n).keys()].map((k) => <button key={k} type="button" onClick={() => tap(k)} data-testid={`spot-cell-${k}`} data-target={pattern.has(k) ? 'yes' : 'no'}
          className={`aspect-square rounded-lg transition-colors duration-200 ${(phase === 'show' && pattern.has(k)) || picked.has(k) ? 'bg-violet-300 shadow-[0_0_18px_rgba(196,181,253,0.9)]' : 'bg-white/10'}`} />)}
      </div>
    </Board3D>
  );
}
