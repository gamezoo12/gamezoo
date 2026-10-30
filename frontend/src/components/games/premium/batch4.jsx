import { useEffect, useMemo, useState } from 'react';
import { difficultyOf, lerpLevel, seeded, seededShuffle } from '../../../lib/difficulty';
import { Board3D, useFeedback } from './kit';

const done = (onComplete, start, accuracy) => onComplete({ solved: true, accuracy: Math.max(0.05, Math.min(1, accuracy)), duration_ms: Date.now() - start });
const key3d = 'rounded-xl border-b-[5px] shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0.5';
const rand = () => Math.floor(Math.random() * 1e6);

// ---------- Sudoku: 4×4 → 6×6 with more blanks ----------
export function PremiumSudoku({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = level >= 6 ? 6 : 4;
  const [bw, bh] = n === 6 ? [3, 2] : [2, 2];
  const { solution, given } = useMemo(() => {
    const r = seeded(1600 + level + rand());
    const digits = seededShuffle([...Array(n).keys()].map((x) => x + 1), Math.floor(r() * 1e6));
    const sol = Array.from({ length: n * n }, (_, k) => { const row = Math.floor(k / n); const col = k % n; return digits[(row * bw + Math.floor(row / bh) + col) % n]; });
    const blanks = n === 6 ? lerpLevel(level - 5, 14, 24) : lerpLevel(level, 5, 10);
    const hide = new Set(seededShuffle([...Array(n * n).keys()], Math.floor(r() * 1e6)).slice(0, blanks));
    return { solution: sol, given: sol.map((v, k) => (hide.has(k) ? 0 : v)) };
  }, [level, n, bw, bh]);
  const [grid, setGrid] = useState(given);
  const [sel, setSel] = useState(given.findIndex((v) => v === 0));
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const put = (v) => {
    if (sel < 0 || given[sel]) return;
    if (solution[sel] !== v) { fire('bad'); setWrong((w) => w + 1); return; }
    const next = grid.map((x, k) => (k === sel ? v : x));
    setGrid(next); fire('good');
    const nextEmpty = next.findIndex((x) => x === 0);
    setSel(nextEmpty);
    if (nextEmpty === -1) done(onComplete, start, 1 / (1 + wrong * 0.15));
  };
  return (
    <Board3D theme="math" title={`Sudoku ${n}×${n}`} level={level} flash={flash} stats={[['Empty', grid.filter((x) => !x).length], ['Wrong', wrong]]}>
      <div className="mx-auto grid max-w-sm gap-0.5 rounded-xl bg-sky-300/40 p-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {grid.map((v, k) => { const row = Math.floor(k / n); const col = k % n; return (
          <button key={k} type="button" onClick={() => setSel(k)} data-testid={`sudoku-cell-${k}`}
            className={`aspect-square text-xl font-black ${given[k] ? 'bg-sky-950 text-sky-200' : v ? 'bg-emerald-900 text-emerald-100' : sel === k ? 'bg-amber-300 text-amber-950' : 'bg-[#0d1b3f] text-white'}`}
            style={{ marginRight: (col + 1) % bw === 0 && col < n - 1 ? 3 : 0, marginBottom: (row + 1) % bh === 0 && row < n - 1 ? 3 : 0 }}>{v || ''}</button>); })}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">{[...Array(n).keys()].map((x) => <button key={x} type="button" onClick={() => put(x + 1)} data-testid={`sudoku-key-${x + 1}`} className={`${key3d} h-12 w-12 border-sky-800 bg-sky-300 text-xl font-black text-sky-950`}>{x + 1}</button>)}</div>
    </Board3D>
  );
}

// ---------- Sequence Predict: arithmetic → geometric → squares → Fibonacci-style → alternating ----------
function makeSeq(level, r) {
  const a = 1 + Math.floor(r() * 9); const d = 2 + Math.floor(r() * (2 + level));
  const kinds = level <= 2 ? ['add'] : level <= 4 ? ['add', 'sub', 'mul'] : level <= 6 ? ['mul', 'square', 'add2'] : level <= 8 ? ['fib', 'square', 'add2', 'alt'] : ['fib', 'alt', 'cube', 'tri'];
  const kind = kinds[Math.floor(r() * kinds.length)];
  const f = { add: (k) => a + d * k, sub: (k) => 100 + a - d * k, mul: (k) => a * 2 ** k, square: (k) => (k + a) ** 2, add2: (k) => a + d * k + k * (k - 1), fib: null, alt: (k) => (k % 2 ? a + d * k : a * (k + 1)), cube: (k) => (k + 1) ** 3 + a, tri: (k) => ((k + a) * (k + a + 1)) / 2 }[kind];
  let terms;
  if (kind === 'fib') { terms = [a, a + d]; while (terms.length < 6) terms.push(terms[terms.length - 1] + terms[terms.length - 2]); } else terms = Array.from({ length: 6 }, (_, k) => f(k));
  return { shown: terms.slice(0, 5), ans: terms[5] };
}
export function PremiumSequencePredict({ config, onComplete }) {
  const level = difficultyOf(config);
  const total = lerpLevel(level, 3, 8);
  const qs = useMemo(() => { const r = seeded(1700 + level + rand()); return Array.from({ length: total }, () => { const q = makeSeq(level, r); const opts = new Set([q.ans]); while (opts.size < 4) opts.add(q.ans + Math.round((r() - 0.5) * Math.max(6, Math.abs(q.ans) * 0.3)) || q.ans + 1); return { ...q, opts: seededShuffle([...opts], Math.floor(r() * 1e6)) }; }); }, [level, total]);
  const [i, setI] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const pick = (v) => { if (v !== qs[i].ans) { fire('bad'); setWrong((w) => w + 1); return; } fire('good'); if (i + 1 >= total) done(onComplete, start, total / (total + wrong)); else setI(i + 1); };
  return (
    <Board3D theme="memory" title="Pattern Oracle" level={level} flash={flash} stats={[['Sequence', `${i + 1}/${total}`], ['Wrong', wrong]]}>
      <div className="mb-5 flex flex-wrap items-center justify-center gap-2" data-testid="sequence-terms">{qs[i].shown.map((t, k) => <span key={k} className="rounded-xl bg-violet-950/70 px-3 py-2 font-mono text-xl font-black text-white shadow-inner">{t}</span>)}<span className="rounded-xl border-2 border-dashed border-amber-300 px-4 py-2 text-xl font-black text-amber-300">?</span></div>
      <div className="grid grid-cols-2 gap-3">{qs[i].opts.map((v) => <button key={v} type="button" onClick={() => pick(v)} data-testid={`sequence-option-${v}`} className={`${key3d} h-14 border-violet-900 bg-gradient-to-b from-violet-300 to-violet-500 text-xl font-black text-violet-950`}>{v}</button>)}</div>
    </Board3D>
  );
}

// ---------- Countdown Numbers: build the target with + − × ÷ (each tile once) ----------
function makeRound(level, r) {
  const count = lerpLevel(level, 3, 6);
  const nums = Array.from({ length: count }, (_, k) => (k === 0 && level >= 6 ? [25, 50, 75, 100][Math.floor(r() * 4)] : 1 + Math.floor(r() * 10)));
  const use = lerpLevel(level, 2, Math.min(5, count));
  let target = nums[0];
  for (let k = 1; k < use; k += 1) { const op = r(); target = op < 0.45 ? target + nums[k] : op < 0.75 && target > nums[k] ? target - nums[k] : target * nums[k]; }
  return { nums: seededShuffle(nums, Math.floor(r() * 1e6)), target };
}
function evaluate(expr, nums) {
  if (!/^[\d+\-*/()\s]+$/.test(expr)) return { error: 'Use numbers and + − × ÷ only' };
  const used = (expr.match(/\d+/g) || []).map(Number);
  const pool = [...nums];
  for (const u of used) { const k = pool.indexOf(u); if (k < 0) return { error: `${u} isn't available (each tile once)` }; pool.splice(k, 1); }
  try { const v = Function(`"use strict";return (${expr})`)(); return Number.isFinite(v) ? { value: v } : { error: 'Invalid sum' }; } catch { return { error: 'Invalid sum' }; } // eslint-disable-line no-new-func
}
export function PremiumCountdownNumbers({ config, onComplete }) {
  const level = difficultyOf(config);
  const rounds = lerpLevel(level, 1, 4);
  const list = useMemo(() => { const r = seeded(1800 + level + rand()); return Array.from({ length: rounds }, () => makeRound(level, r)); }, [level, rounds]);
  const [i, setI] = useState(0);
  const [expr, setExpr] = useState('');
  const [msg, setMsg] = useState('');
  const [tries, setTries] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const cur = list[i];
  const submit = (e) => {
    e.preventDefault();
    const res = evaluate(expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-'), cur.nums);
    if (res.error || res.value !== cur.target) { fire('bad'); setTries((t) => t + 1); setMsg(res.error || `That makes ${Math.round(res.value * 100) / 100}`); return; }
    fire('good'); setMsg(''); setExpr('');
    if (i + 1 >= rounds) done(onComplete, start, rounds / (rounds + tries)); else setI(i + 1);
  };
  return (
    <Board3D theme="reaction" title="Countdown Numbers" level={level} flash={flash} stats={[['Round', `${i + 1}/${rounds}`], ['Tries', tries]]}>
      <div className="mb-4 rounded-2xl bg-black/50 py-4 text-center font-mono text-5xl font-black text-amber-300 shadow-[inset_0_0_30px_rgba(251,191,36,0.3)]" data-testid="countdown-target">{cur.target}</div>
      <div className="mb-4 flex flex-wrap justify-center gap-2">{cur.nums.map((v, k) => <button key={k} type="button" onClick={() => setExpr((x) => `${x}${v}`)} className={`${key3d} h-12 min-w-12 border-amber-800 bg-amber-200 px-3 text-xl font-black text-amber-950`} data-testid={`countdown-num-${k}`}>{v}</button>)}</div>
      <div className="mb-3 flex justify-center gap-2">{['+', '−', '×', '÷', '(', ')'].map((o) => <button key={o} type="button" onClick={() => setExpr((x) => `${x}${o}`)} className={`${key3d} h-10 w-10 border-slate-800 bg-slate-300 font-black text-slate-900`}>{o}</button>)}</div>
      <form onSubmit={submit} className="flex gap-2"><input value={expr} onChange={(e) => setExpr(e.target.value)} className="h-12 flex-1 rounded-xl border border-white/20 bg-black/30 px-3 font-mono text-lg text-white" placeholder="e.g. 7×8+4" data-testid="countdown-input" />
        <button type="button" onClick={() => setExpr('')} className="rounded-xl bg-white/10 px-3 text-xs font-bold text-white">Clear</button>
        <button type="submit" className={`${key3d} border-emerald-800 bg-emerald-400 px-4 font-black text-emerald-950`} data-testid="countdown-submit">Check</button></form>
      {msg && <p className="mt-2 text-center text-sm text-rose-200" role="alert">{msg}</p>}
    </Board3D>
  );
}

// ---------- Word Ladder: choose each next word (one letter changes) ----------
const LADDERS = [
  ['CAT', 'COT', 'DOT', 'DOG'], ['PIG', 'PIT', 'PAT', 'HAT'], ['LEAD', 'LOAD', 'GOAD', 'GOLD'], ['BOAT', 'BOLT', 'BELT', 'MELT'],
  ['COLD', 'CORD', 'WORD', 'WORM', 'WARM'], ['MILE', 'MALE', 'MALT', 'SALT'], ['STONE', 'STORE', 'SHORE', 'SHARE', 'SHAPE'],
  ['HEAD', 'HEAL', 'TEAL', 'TELL', 'TALL', 'TAIL'], ['FLOUR', 'FLOOR', 'FLOOD', 'BLOOD', 'BROOD', 'BROOK'],
];
export function PremiumWordLadder({ config, onComplete }) {
  const level = difficultyOf(config);
  const pool = LADDERS.filter((l) => l.length - 1 <= lerpLevel(level, 3, 5) && l.length - 1 >= lerpLevel(level, 3, 4));
  const rungs = lerpLevel(level, 1, 3);
  const ladders = useMemo(() => seededShuffle(pool.length ? pool : LADDERS, 1900 + level + rand()).slice(0, rungs), [level]); // eslint-disable-line react-hooks/exhaustive-deps
  const [li, setLi] = useState(0);
  const [step, setStep] = useState(1);
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const lad = ladders[li];
  const options = useMemo(() => {
    const r = seeded(2000 + li * 10 + step + level);
    const prev = lad[step - 1];
    const fakes = new Set();
    while (fakes.size < lerpLevel(level, 2, 4)) { const p = Math.floor(r() * prev.length); const c = String.fromCharCode(65 + Math.floor(r() * 26)); const w = prev.slice(0, p) + c + prev.slice(p + 1); if (w !== prev && w !== lad[step] && !lad.includes(w)) fakes.add(w); }
    return seededShuffle([lad[step], ...fakes], Math.floor(r() * 1e6));
  }, [lad, step, li, level]);
  const pick = (w) => {
    if (w !== lad[step]) { fire('bad'); setWrong((x) => x + 1); return; }
    fire('good');
    if (step + 1 < lad.length) { setStep(step + 1); return; }
    if (li + 1 >= ladders.length) done(onComplete, start, 1 / (1 + wrong * 0.2)); else { setLi(li + 1); setStep(1); }
  };
  return (
    <Board3D theme="words" title="Word Ladder" level={level} flash={flash} stats={[['Ladder', `${li + 1}/${ladders.length}`], ['Wrong', wrong]]}>
      <p className="mb-3 text-center text-xs text-emerald-100">Change one letter at a time from <b>{lad[0]}</b> to <b>{lad[lad.length - 1]}</b></p>
      <div className="mb-4 flex flex-col items-center gap-1.5" data-testid="ladder-rungs">{lad.map((w, k) => <div key={k} className={`w-40 rounded-lg py-1.5 text-center font-mono text-lg font-black tracking-[0.3em] ${k < step || k === lad.length - 1 ? 'bg-emerald-300 text-emerald-950' : 'bg-black/30 text-white/30'}`}>{k < step || k === lad.length - 1 ? w : '· · ·'}</div>)}</div>
      <div className="flex flex-wrap justify-center gap-2">{options.map((w) => <button key={w} type="button" onClick={() => pick(w)} data-testid={`ladder-option-${w}`} className={`${key3d} border-emerald-900 bg-gradient-to-b from-emerald-200 to-emerald-400 px-4 py-2 font-mono text-lg font-black tracking-widest text-emerald-950`}>{w}</button>)}</div>
    </Board3D>
  );
}

// ---------- Chess: mate in one ----------
const P = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const CHESS = [
  { title: 'Back-rank mate', pieces: { a1: 'R', g1: 'K', g8: 'k', f7: 'p', g7: 'p', h7: 'p' }, answer: 'Ra8#', opts: ['Ra8#', 'Ra7', 'Rf1', 'Kh2'] },
  { title: 'Queen to the back rank', pieces: { d1: 'Q', g1: 'K', h8: 'k', g7: 'p', h7: 'p' }, answer: 'Qd8#', opts: ['Qd8#', 'Qd7', 'Qh5', 'Qg4'] },
  { title: "Scholar's finish", pieces: { h5: 'Q', c4: 'B', e1: 'K', e4: 'P', e8: 'k', d8: 'q', f8: 'b', c8: 'b', c6: 'n', f6: 'n', e5: 'p', f7: 'p', g7: 'p', d7: 'p' }, answer: 'Qxf7#', opts: ['Qxf7#', 'Qxe5+', 'Bxf7+', 'Qh6'] },
  { title: 'Smothered mate', pieces: { e5: 'N', g1: 'K', h8: 'k', g8: 'r', g7: 'p', h7: 'p' }, answer: 'Nf7#', opts: ['Nf7#', 'Ng6+', 'Nd7', 'Nc6'] },
  { title: 'Rook roller', pieces: { a7: 'R', b1: 'R', g1: 'K', h8: 'k' }, answer: 'Rb8#', opts: ['Rb8#', 'Ra8+', 'Rh1+', 'Rb7'] },
  { title: 'King and queen', pieces: { g6: 'K', a1: 'Q', h8: 'k' }, answer: 'Qa8#', opts: ['Qa8#', 'Qh1+', 'Qb1', 'Qa6'] },
];
export function PremiumChess({ config, onComplete }) {
  const level = difficultyOf(config);
  const total = lerpLevel(level, 1, 6);
  const list = useMemo(() => seededShuffle(CHESS, 2100 + rand()).slice(0, total), [total]);
  const [i, setI] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const cur = list[i];
  const opts = useMemo(() => seededShuffle(cur.opts.slice(0, level <= 3 ? 3 : 4), i + level), [cur, i, level]);
  const pick = (o) => { if (o !== cur.answer) { fire('bad'); setWrong((w) => w + 1); return; } fire('good'); if (i + 1 >= total) done(onComplete, start, total / (total + wrong)); else setI(i + 1); };
  return (
    <Board3D theme="reaction" title="Checkmate Arena" level={level} flash={flash} stats={[['Puzzle', `${i + 1}/${total}`], ['Wrong', wrong]]}>
      <p className="mb-2 text-center text-xs font-bold text-amber-100">{level <= 5 ? cur.title : 'White to move'} · White mates in one</p>
      <div className="mx-auto grid max-w-xs grid-cols-8 overflow-hidden rounded-lg border-4 border-amber-900 shadow-2xl" data-testid="chess-board">
        {Array.from({ length: 64 }, (_, k) => { const sq = `${'abcdefgh'[k % 8]}${8 - Math.floor(k / 8)}`; const pc = cur.pieces[sq]; const dark = (Math.floor(k / 8) + k) % 2;
          return <div key={sq} className={`flex aspect-square items-center justify-center text-2xl sm:text-3xl ${dark ? 'bg-amber-800' : 'bg-amber-100'} ${pc && pc === pc.toUpperCase() ? 'text-white [text-shadow:0_0_2px_#000,0_1px_2px_#000]' : 'text-black'}`}>{pc ? P[pc] : ''}</div>; })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">{opts.map((o) => <button key={o} type="button" onClick={() => pick(o)} data-testid={`chess-opt-${o}`} className={`${key3d} h-12 border-amber-900 bg-amber-300 font-black text-amber-950`}>{o}</button>)}</div>
    </Board3D>
  );
}

// ---------- Tower of Hanoi: more discs ----------
export function PremiumHanoi({ config, onComplete }) {
  const level = difficultyOf(config);
  const discs = lerpLevel(level, 3, 7);
  const [pegs, setPegs] = useState(() => [[...Array(discs).keys()].map((x) => discs - x), [], []]);
  const [held, setHeld] = useState(null);
  const [moves, setMoves] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const tap = (p) => {
    if (held === null) { if (pegs[p].length) { setHeld(p); fire('tap'); } return; }
    if (held === p) { setHeld(null); return; }
    const disc = pegs[held][pegs[held].length - 1];
    const top = pegs[p][pegs[p].length - 1];
    if (top && top < disc) { fire('bad'); setHeld(null); return; }
    const next = pegs.map((s) => [...s]);
    next[p].push(next[held].pop());
    setPegs(next); setHeld(null); setMoves((m) => m + 1); fire('tap');
    if (next[2].length === discs) { fire('good'); done(onComplete, start, (2 ** discs - 1) / (moves + 1)); }
  };
  const colors = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6'];
  return (
    <Board3D theme="target" title="Tower of Hanoi" level={level} flash={flash} stats={[['Discs', discs], ['Moves', moves], ['Best', 2 ** discs - 1]]}>
      <div className="grid grid-cols-3 gap-2">
        {pegs.map((s, p) => <button key={p} type="button" onClick={() => tap(p)} data-testid={`hanoi-peg-${p}`} className={`relative flex h-52 flex-col-reverse items-center rounded-2xl pb-3 transition-colors ${held === p ? 'bg-amber-300/20 ring-2 ring-amber-300' : 'bg-black/30 hover:bg-black/40'}`}>
          <span className="absolute bottom-3 top-4 w-2 rounded-full bg-gradient-to-b from-stone-300 to-stone-500" />
          {s.map((d, k) => <span key={d} className={`relative z-10 mb-0.5 h-5 rounded-full shadow-[inset_0_-4px_0_rgba(0,0,0,0.25)] transition-transform ${held === p && k === s.length - 1 ? '-translate-y-3' : ''}`} style={{ width: `${25 + (d / discs) * 70}%`, background: colors[d - 1] }} />)}
        </button>)}
      </div>
      <p className="mt-3 text-center text-[11px] text-white/60">Move every disc to the right peg. Never place a bigger disc on a smaller one.</p>
    </Board3D>
  );
}

// ---------- Lights Out: bigger grids, deeper scrambles ----------
export function PremiumLightsOut({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = level <= 3 ? 3 : level <= 6 ? 4 : 5;
  const toggle = (g, k) => { const r = Math.floor(k / n); const c = k % n; return g.map((v, x) => { const rr = Math.floor(x / n); const cc = x % n; return (rr === r && Math.abs(cc - c) <= 1) || (cc === c && Math.abs(rr - r) <= 1) ? !v : v; }); };
  const [grid, setGrid] = useState(() => { const r = seeded(2200 + level + rand()); let g = Array(n * n).fill(false); for (let k = 0; k < lerpLevel(level, 3, 14); k += 1) g = toggle(g, Math.floor(r() * n * n)); if (!g.some(Boolean)) g = toggle(g, 0); return g; });
  const [moves, setMoves] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const press = (k) => { const g = toggle(grid, k); setGrid(g); setMoves((m) => m + 1); fire('tap'); if (!g.some(Boolean)) { fire('good'); done(onComplete, start, Math.min(1, lerpLevel(level, 3, 14) / (moves + 1))); } };
  return (
    <Board3D theme="reaction" title="Lights Out" level={level} flash={flash} stats={[['Lit', grid.filter(Boolean).length], ['Moves', moves]]}>
      <div className="mx-auto grid max-w-xs gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {grid.map((on, k) => <button key={k} type="button" onClick={() => press(k)} data-testid={`lights-cell-${k}`} aria-pressed={on}
          className={`aspect-square rounded-2xl border-b-[6px] transition-colors duration-150 ${on ? 'border-amber-700 bg-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.9)]' : 'border-black/40 bg-slate-800'}`} />)}
      </div>
      <p className="mt-3 text-center text-[11px] text-white/60">Tapping a light flips it and its neighbours. Turn every light off.</p>
    </Board3D>
  );
}

// ---------- Minesweeper: bigger fields, more mines ----------
export function PremiumMinesweeper({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = lerpLevel(level, 5, 9);
  const mines = Math.round(n * n * (0.1 + level * 0.012));
  const fresh = () => ({ mines: null, open: Array(n * n).fill(false), flags: Array(n * n).fill(false) });
  const [st, setSt] = useState(fresh);
  const [flagMode, setFlagMode] = useState(false);
  const [blasts, setBlasts] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const nb = (k) => { const r = Math.floor(k / n); const c = k % n; const out = []; for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) { const rr = r + dr; const cc = c + dc; if ((dr || dc) && rr >= 0 && cc >= 0 && rr < n && cc < n) out.push(rr * n + cc); } return out; };
  const count = (m, k) => nb(k).filter((x) => m.has(x)).length;
  const tap = (k) => {
    if (flagMode) { if (!st.open[k]) setSt({ ...st, flags: st.flags.map((f, x) => (x === k ? !f : f)) }); return; }
    if (st.flags[k] || st.open[k]) return;
    let m = st.mines;
    if (!m) { const safe = new Set([k, ...nb(k)]); m = new Set(seededShuffle([...Array(n * n).keys()].filter((x) => !safe.has(x)), 2300 + level + rand()).slice(0, mines)); }
    if (m.has(k)) { fire('bad'); setBlasts((b) => b + 1); setSt(fresh()); return; }
    const open = [...st.open];
    const stack = [k];
    while (stack.length) { const x = stack.pop(); if (open[x]) continue; open[x] = true; if (count(m, x) === 0) nb(x).forEach((y) => !open[y] && !m.has(y) && stack.push(y)); }
    fire('tap');
    setSt({ ...st, mines: m, open });
    if (open.filter(Boolean).length === n * n - mines) { fire('good'); done(onComplete, start, 1 / (1 + blasts * 0.3)); }
  };
  return (
    <Board3D theme="words" title="Minefield" level={level} flash={flash} stats={[['Mines', mines], ['Flags', st.flags.filter(Boolean).length], ['Blasts', blasts]]}>
      <div className="mb-3 flex justify-center"><button type="button" onClick={() => setFlagMode(!flagMode)} className={`rounded-full px-4 py-1.5 text-xs font-black ${flagMode ? 'bg-rose-500 text-white' : 'bg-white/10 text-white'}`} data-testid="mines-flag-toggle">{flagMode ? 'Flag mode ON' : 'Flag mode OFF'}</button></div>
      <div className="mx-auto grid max-w-sm gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {st.open.map((o, k) => { const c = o && st.mines ? count(st.mines, k) : 0; return <button key={k} type="button" onClick={() => tap(k)} data-testid={`mines-cell-${k}`}
          className={`aspect-square rounded-md text-sm font-black ${o ? 'bg-emerald-950/70 text-emerald-200' : 'border-b-4 border-emerald-900 bg-gradient-to-b from-emerald-400 to-emerald-600'}`}>{o ? (c || '') : st.flags[k] ? '⚑' : ''}</button>; })}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/60">Clear every safe square. Numbers show nearby mines. Hitting a mine resets the field.</p>
    </Board3D>
  );
}

export function useKeyMoves(handler) {
  useEffect(() => {
    const onKey = (e) => { const d = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (d) { e.preventDefault(); handler(d); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler]);
}
