import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { difficultyOf, lerpLevel } from '../../../lib/difficulty';
import { Board3D, useFeedback } from './kit';

const done = (onComplete, start, accuracy) => onComplete({ solved: true, accuracy: Math.max(0.05, Math.min(1, accuracy)), duration_ms: Date.now() - start });
function useFinish(onComplete) {
  const finished = useRef(false);
  return (start, accuracy) => { if (finished.current) return; finished.current = true; done(onComplete, start, accuracy); };
}
const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i -= 1) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const btn = 'rounded-xl border-b-[5px] font-black shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0.5';
const PALETTE = ['#f43f5e', '#3b82f6', '#22c55e', '#facc15', '#a855f7', '#f97316', '#14b8a6', '#ec4899'];

// ---------- Pipe Connect: rotate tiles until every pipe joins the source ----------
const rot = (m) => ((m << 1) | (m >> 3)) & 15;
function makePipes(n) {
  const mask = Array(n * n).fill(0);
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const c = stack[stack.length - 1];
    const x = c % n; const y = Math.floor(c / n);
    const opts = shuffle([[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]]).filter(([dx, dy]) => { const nx = x + dx; const ny = y + dy; return nx >= 0 && ny >= 0 && nx < n && ny < n && !seen.has(ny * n + nx); });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy, a, b] = opts[0]; const nc = (y + dy) * n + x + dx;
    mask[c] |= a; mask[nc] |= b; seen.add(nc); stack.push(nc);
  }
  return mask;
}
function connected(tiles, n) {
  const on = new Set([0]); const q = [0];
  const dirs = [[1, 0, -1, 4], [2, 1, 0, 8], [4, 0, 1, 1], [8, -1, 0, 2]];
  while (q.length) {
    const c = q.shift(); const x = c % n; const y = Math.floor(c / n);
    dirs.forEach(([bit, dx, dy, back]) => { const nx = x + dx; const ny = y + dy; const nc = ny * n + nx;
      if ((tiles[c] & bit) && nx >= 0 && ny >= 0 && nx < n && ny < n && (tiles[nc] & back) && !on.has(nc)) { on.add(nc); q.push(nc); } });
  }
  return on;
}
function PipeTile({ m, lit, source, onClick, testid }) {
  const c = lit ? '#22d3ee' : '#64748b';
  return (
    <button type="button" onClick={onClick} className="relative aspect-square rounded-md bg-slate-900/80 ring-1 ring-white/10" data-testid={testid}>
      <svg viewBox="0 0 40 40" className="h-full w-full">
        {(m & 1) > 0 && <line x1="20" y1="20" x2="20" y2="0" stroke={c} strokeWidth="8" />}
        {(m & 2) > 0 && <line x1="20" y1="20" x2="40" y2="20" stroke={c} strokeWidth="8" />}
        {(m & 4) > 0 && <line x1="20" y1="20" x2="20" y2="40" stroke={c} strokeWidth="8" />}
        {(m & 8) > 0 && <line x1="20" y1="20" x2="0" y2="20" stroke={c} strokeWidth="8" />}
        <circle cx="20" cy="20" r={source ? 9 : 5} fill={source ? '#facc15' : c} />
      </svg>
    </button>
  );
}
export function PremiumPipeConnect({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = lerpLevel(level, 3, 7);
  const [tiles, setTiles] = useState(() => {
    const sol = makePipes(n);
    let t;
    do { t = sol.map((m) => { let r = m; for (let k = rnd(4); k > 0; k -= 1) r = rot(r); return r; }); } while (connected(t, n).size === n * n);
    return t;
  });
  const [moves, setMoves] = useState(0);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  const lit = useMemo(() => connected(tiles, n), [tiles, n]);
  const turn = (k) => {
    if (lit.size === n * n) return;
    const t = tiles.map((m, i) => (i === k ? rot(m) : m));
    setTiles(t); setMoves((v) => v + 1); fire('tap');
    if (connected(t, n).size === n * n) { fire('good'); setTimeout(() => finish(start, Math.min(1, (n * n * 1.5) / (moves + 1))), 250); }
  };
  return (
    <Board3D theme="math" title="Pipe Connect" level={level} flash={flash} stats={[['Grid', `${n}×${n}`], ['Linked', `${lit.size}/${n * n}`], ['Turns', moves]]}>
      <p className="mb-2 text-center text-xs text-white/70">Tap pipes to rotate them. Link every pipe to the gold source.</p>
      <div className="mx-auto grid max-w-sm gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} data-testid="pipe-board">
        {tiles.map((m, k) => <PipeTile key={k} m={m} lit={lit.has(k)} source={k === 0} onClick={() => turn(k)} testid={`pipe-${k}`} />)}
      </div>
    </Board3D>
  );
}

// ---------- Ball Sort: sort coloured balls so each tube holds one colour ----------
const CAP = 4;
const sortedTubes = (tubes) => tubes.every((t) => t.length === 0 || (t.length === CAP && t.every((b) => b === t[0])));
export function PremiumBallSort({ config, onComplete }) {
  const level = difficultyOf(config);
  const colours = lerpLevel(level, 3, 7);
  const deal = useCallback(() => {
    let tubes = [...Array(colours).keys()].map((c) => Array(CAP).fill(c)).concat([[], []]);
    for (let step = 0; step < colours * 60 || sortedTubes(tubes); step += 1) {
      const from = tubes.map((t, i) => i).filter((i) => { const t = tubes[i]; return t.length && (t.length === 1 || t[t.length - 2] === t[t.length - 1]); });
      const fi = from[rnd(from.length)];
      const to = tubes.map((t, i) => i).filter((i) => i !== fi && tubes[i].length < CAP);
      if (fi === undefined || !to.length) continue;
      const ti = to[rnd(to.length)]; const ball = tubes[fi][tubes[fi].length - 1];
      tubes = tubes.map((t, i) => (i === fi ? t.slice(0, -1) : i === ti ? [...t, ball] : t));
    }
    return tubes;
  }, [colours]);
  const [initial] = useState(deal);
  const [tubes, setTubes] = useState(initial);
  const [pick, setPick] = useState(null);
  const [moves, setMoves] = useState(0);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  const tap = (i) => {
    if (pick === null) { if (tubes[i].length) { setPick(i); fire('tap'); } return; }
    if (pick === i) { setPick(null); return; }
    const from = tubes[pick]; const to = tubes[i]; const ball = from[from.length - 1];
    if (to.length >= CAP || (to.length && to[to.length - 1] !== ball)) { fire('bad'); setPick(null); return; }
    const next = tubes.map((t, k) => (k === pick ? t.slice(0, -1) : k === i ? [...t, ball] : t));
    setTubes(next); setPick(null); setMoves((m) => m + 1); fire('tap');
    if (sortedTubes(next)) { fire('good'); setTimeout(() => finish(start, Math.min(1, (colours * 4) / (moves + 1))), 250); }
  };
  return (
    <Board3D theme="party" title="Ball Sort" level={level} flash={flash} stats={[['Colours', colours], ['Moves', moves]]}>
      <p className="mb-3 text-center text-xs text-white/70">Tap a tube, then another, to move the top ball. A ball can only go on the same colour or an empty tube.</p>
      <div className="flex flex-wrap justify-center gap-2" data-testid="ballsort-board">
        {tubes.map((t, i) => (
          <button key={i} type="button" onClick={() => tap(i)} className={`flex h-40 w-11 flex-col-reverse items-center gap-1 rounded-b-2xl border-2 p-1 transition-transform ${pick === i ? '-translate-y-2 border-amber-300' : 'border-white/30'} bg-white/5`} data-testid={`tube-${i}`}>
            {t.map((b, k) => <span key={k} className="h-8 w-8 rounded-full shadow-inner" style={{ background: PALETTE[b] }} />)}
          </button>
        ))}
      </div>
      <div className="mt-3 text-center"><button type="button" onClick={() => { setTubes(initial); setPick(null); setMoves(0); }} className="rounded-full border border-white/30 px-4 py-1.5 text-xs font-bold text-white" data-testid="ballsort-restart">Restart puzzle</button></div>
    </Board3D>
  );
}

// ---------- Colour Flood: flood the board into one colour in few moves ----------
function floodRegion(grid, n) {
  const c = grid[0]; const seen = new Set([0]); const q = [0];
  while (q.length) { const k = q.pop(); const x = k % n; const y = Math.floor(k / n);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = x + dx; const ny = y + dy; const nk = ny * n + nx; if (nx >= 0 && ny >= 0 && nx < n && ny < n && !seen.has(nk) && grid[nk] === c) { seen.add(nk); q.push(nk); } }); }
  return seen;
}
const floodWith = (grid, n, colour) => { const region = floodRegion(grid, n); return grid.map((v, k) => (region.has(k) ? colour : v)); };
function greedyMoves(grid, n, colours) {
  let g = grid; let count = 0;
  while (floodRegion(g, n).size < n * n && count < 200) {
    let best = null; let bestSize = -1;
    for (let c = 0; c < colours; c += 1) { if (c === g[0]) continue; const s = floodRegion(floodWith(g, n, c), n).size; if (s > bestSize) { bestSize = s; best = c; } }
    g = floodWith(g, n, best); count += 1;
  }
  return count;
}
export function PremiumColourFlood({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = lerpLevel(level, 6, 14);
  const colours = lerpLevel(level, 3, 6);
  const [grid, setGrid] = useState(() => Array.from({ length: n * n }, () => rnd(colours)));
  const par = useMemo(() => greedyMoves(grid, n, colours), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [moves, setMoves] = useState(0);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  const pickColour = (c) => {
    if (c === grid[0]) return;
    const g = floodWith(grid, n, c); const m = moves + 1;
    setGrid(g); setMoves(m); fire('tap');
    if (floodRegion(g, n).size === n * n) { fire('good'); setTimeout(() => finish(start, par / m), 250); }
  };
  return (
    <Board3D theme="memory" title="Colour Flood" level={level} flash={flash} stats={[['Moves', moves], ['Target', par]]}>
      <p className="mb-2 text-center text-xs text-white/70">Pick colours to grow the top-left area until the whole board is one colour.</p>
      <div className="mx-auto grid max-w-sm overflow-hidden rounded-lg" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} data-testid="flood-board">
        {grid.map((c, k) => <span key={k} className="aspect-square transition-colors duration-200" style={{ background: PALETTE[c] }} />)}
      </div>
      <div className="mt-3 flex justify-center gap-2">
        {[...Array(colours).keys()].map((c) => <button key={c} type="button" onClick={() => pickColour(c)} className={`${btn} h-11 w-11 border-black/40`} style={{ background: PALETTE[c] }} aria-label={`colour ${c + 1}`} data-testid={`flood-colour-${c}`} />)}
      </div>
    </Board3D>
  );
}

// ---------- Code Breaker: deduce the hidden colour code ----------
export function PremiumCodeBreaker({ config, onComplete }) {
  const level = difficultyOf(config);
  const len = lerpLevel(level, 3, 5);
  const colours = lerpLevel(level, 4, 7);
  const [secret] = useState(() => { const pool = shuffle([...Array(colours).keys()]); return level >= 6 ? Array.from({ length: len }, () => rnd(colours)) : pool.slice(0, len); });
  const [guess, setGuess] = useState([]);
  const [history, setHistory] = useState([]);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  const submit = () => {
    const exact = guess.filter((g, i) => g === secret[i]).length;
    const common = [...Array(colours).keys()].reduce((s, c) => s + Math.min(guess.filter((g) => g === c).length, secret.filter((x) => x === c).length), 0);
    const h = [...history, { guess, exact, near: common - exact }];
    setHistory(h); setGuess([]);
    if (exact === len) { fire('good'); setTimeout(() => finish(start, (len + 2) / h.length), 300); } else fire('bad');
  };
  return (
    <Board3D theme="target" title="Code Breaker" level={level} flash={flash} stats={[['Code length', len], ['Guesses', history.length]]}>
      <p className="mb-2 text-center text-xs text-white/70">Guess the hidden code. Gold = right colour, right place. White = right colour, wrong place.{level >= 6 ? ' Colours may repeat.' : ''}</p>
      <div className="mx-auto max-h-52 max-w-xs space-y-1 overflow-y-auto" data-testid="code-history">
        {history.map((h, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg bg-black/30 px-2 py-1">
            <div className="flex gap-1">{h.guess.map((g, k) => <span key={k} className="h-6 w-6 rounded-full" style={{ background: PALETTE[g] }} />)}</div>
            <div className="flex gap-0.5">{Array.from({ length: h.exact }, (_, k) => <span key={`e${k}`} className="h-3 w-3 rounded-full bg-amber-300" />)}{Array.from({ length: h.near }, (_, k) => <span key={`n${k}`} className="h-3 w-3 rounded-full bg-white" />)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-1.5" data-testid="code-current">
        {Array.from({ length: len }, (_, k) => <button key={k} type="button" onClick={() => setGuess(guess.filter((_, i) => i !== k))} className="h-9 w-9 rounded-full border-2 border-dashed border-white/40" style={{ background: guess[k] !== undefined ? PALETTE[guess[k]] : 'transparent' }} aria-label={`slot ${k + 1}`} />)}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {[...Array(colours).keys()].map((c) => <button key={c} type="button" disabled={guess.length >= len} onClick={() => setGuess([...guess, c])} className={`${btn} h-10 w-10 border-black/40 disabled:opacity-40`} style={{ background: PALETTE[c] }} aria-label={`colour ${c + 1}`} data-testid={`code-colour-${c}`} />)}
      </div>
      <div className="mt-3 text-center"><button type="button" disabled={guess.length !== len} onClick={submit} className={`${btn} border-amber-700 bg-amber-400 px-6 py-2 text-slate-900 disabled:opacity-40`} data-testid="code-submit">Check code</button></div>
    </Board3D>
  );
}

// ---------- Word Search: find hidden words in a letter grid ----------
const WORDS = ['APPLE', 'BRAVE', 'CROWN', 'DREAM', 'EAGLE', 'FLAME', 'GRAPE', 'HONEY', 'IVORY', 'JEWEL', 'KNIGHT', 'LEMON', 'MAGIC', 'NOBLE', 'OCEAN', 'PRIZE', 'QUEEN', 'RIVER', 'STORM', 'TIGER', 'UNITY', 'VALUE', 'WHALE', 'YOUTH', 'ZEBRA', 'CASTLE', 'DRAGON', 'FOREST', 'GARDEN', 'HUNTER', 'ISLAND', 'JUNGLE', 'LEGEND', 'MARKET', 'PLANET', 'ROCKET', 'SILVER', 'TROPHY', 'WINNER', 'VOYAGE', 'BRIDGE', 'CANDLE', 'GOLD', 'STAR', 'MOON', 'KING', 'GAME', 'PLAY', 'WIN', 'LUCK'];
function makeWordSearch(n, count, level) {
  const dirs = [[1, 0], [0, 1]].concat(level >= 4 ? [[1, 1], [1, -1]] : []).concat(level >= 8 ? [[-1, 0], [0, -1], [-1, -1], [-1, 1]] : []);
  const grid = Array(n * n).fill(null);
  const placed = [];
  for (const word of shuffle(WORDS.filter((w) => w.length <= n))) {
    if (placed.length >= count) break;
    for (let tries = 0; tries < 60; tries += 1) {
      const [dx, dy] = dirs[rnd(dirs.length)]; const x = rnd(n); const y = rnd(n);
      const cells = [...word].map((_, i) => [x + dx * i, y + dy * i]);
      if (cells.every(([cx, cy], i) => cx >= 0 && cy >= 0 && cx < n && cy < n && (grid[cy * n + cx] === null || grid[cy * n + cx] === word[i]))) {
        cells.forEach(([cx, cy], i) => { grid[cy * n + cx] = word[i]; });
        placed.push({ word, cells: cells.map(([cx, cy]) => cy * n + cx) });
        break;
      }
    }
  }
  return { grid: grid.map((c) => c || String.fromCharCode(65 + rnd(26))), placed };
}
export function PremiumWordSearch({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = lerpLevel(level, 6, 11);
  const [{ grid, placed }] = useState(() => makeWordSearch(n, lerpLevel(level, 3, 8), level));
  const [found, setFound] = useState([]);
  const [first, setFirst] = useState(null);
  const [misses, setMisses] = useState(0);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  const [foundCells, setFoundCells] = useState(() => new Set());
  const tap = (k) => {
    if (first === null) { setFirst(k); fire('tap'); return; }
    setFirst(null);
    const [x0, y0, x1, y1] = [first % n, Math.floor(first / n), k % n, Math.floor(k / n)];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    const dx = Math.sign(x1 - x0); const dy = Math.sign(y1 - y0);
    const straight = steps > 0 && (x0 + dx * steps === x1) && (y0 + dy * steps === y1);
    const cells = straight ? Array.from({ length: steps + 1 }, (_, i) => (y0 + dy * i) * n + x0 + dx * i) : [];
    const letters = cells.map((c) => grid[c]).join('');
    const hit = placed.find((p) => !found.includes(p.word) && (p.word === letters || p.word === [...letters].reverse().join('')));
    if (!hit) { fire('bad'); setMisses((m) => m + 1); return; }
    const f = [...found, hit.word]; setFound(f); setFoundCells(new Set([...foundCells, ...cells])); fire('good');
    if (f.length === placed.length) setTimeout(() => finish(start, placed.length / (placed.length + misses)), 250);
  };
  return (
    <Board3D theme="words" title="Word Search" level={level} flash={flash} stats={[['Found', `${found.length}/${placed.length}`], ['Misses', misses]]}>
      <p className="mb-2 text-center text-xs text-white/70">Tap the first and last letter of each word.</p>
      <div className="mb-2 flex flex-wrap justify-center gap-1.5">{placed.map((p) => <span key={p.word} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${found.includes(p.word) ? 'bg-emerald-400 text-slate-900 line-through' : 'bg-white/10 text-white'}`}>{p.word}</span>)}</div>
      <div className="mx-auto grid max-w-sm gap-0.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} data-testid="wordsearch-board">
        {grid.map((c, k) => <button key={k} type="button" onClick={() => tap(k)} className={`aspect-square rounded text-xs font-black sm:text-sm ${first === k ? 'bg-amber-300 text-slate-900' : foundCells.has(k) ? 'bg-emerald-500/70 text-white' : 'bg-white/10 text-white'}`} data-testid={`ws-${k}`}>{c}</button>)}
      </div>
    </Board3D>
  );
}

// ---------- Speed Typing: type each word exactly ----------
export function PremiumSpeedTyping({ config, onComplete }) {
  const level = difficultyOf(config);
  const [words] = useState(() => shuffle(WORDS.filter((w) => w.length >= (level >= 6 ? 5 : 3))).slice(0, lerpLevel(level, 5, 15)));
  const [i, setI] = useState(0);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState(0);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  const typed = useRef(0);
  const change = (v) => {
    const t = v.toUpperCase().trim(); const w = words[i];
    typed.current += 1;
    if (!w.startsWith(t)) { fire('bad'); setErrors((e) => e + 1); setText(''); return; }
    if (t === w) { fire('good'); setText(''); if (i + 1 === words.length) { finish(start, 1 - errors / typed.current); return; } setI(i + 1); return; }
    setText(v);
  };
  return (
    <Board3D theme="words" title="Speed Typing" level={level} flash={flash} stats={[['Word', `${Math.min(i + 1, words.length)}/${words.length}`], ['Errors', errors]]}>
      <div className="mb-3 text-center text-3xl font-black tracking-widest text-white" data-testid="typing-word">{words[i]}</div>
      <div className="mb-3 flex flex-wrap justify-center gap-1 text-[11px] text-white/50">{words.slice(i + 1, i + 6).map((w, k) => <span key={k}>{w}</span>)}</div>
      <input autoFocus value={text} onChange={(e) => change(e.target.value)} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="mx-auto block w-full max-w-xs rounded-xl border-2 border-emerald-400 bg-black/40 px-4 py-3 text-center text-xl font-black uppercase tracking-widest text-white outline-none" placeholder="Type here" data-testid="typing-input" />
      <p className="mt-2 text-center text-xs text-white/60">A wrong letter clears the word.</p>
    </Board3D>
  );
}

// ---------- Quick Count: count the flashed dots ----------
export function PremiumQuickCount({ config, onComplete }) {
  const level = difficultyOf(config);
  const rounds = lerpLevel(level, 3, 6);
  const showMs = lerpLevel(level, 2200, 700);
  const [round, setRound] = useState(0);
  const [seed, setSeed] = useState(0);
  const [phase, setPhase] = useState('show');
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  const { count, dots, options } = useMemo(() => {
    const c = lerpLevel(level, 5, 22) + rnd(4);
    const d = shuffle([...Array(100).keys()]).slice(0, c).map((cell) => [5 + (cell % 10) * 9.5 + rnd(4), 5 + Math.floor(cell / 10) * 9.5 + rnd(4), PALETTE[rnd(level >= 6 ? 6 : 1)]]);
    return { count: c, dots: d, options: shuffle([c, c + 1, c - 1, c + (rnd(2) ? 2 : -2)]) };
  }, [round, seed, level]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPhase('show'); const t = setTimeout(() => setPhase('answer'), showMs); return () => clearTimeout(t); }, [round, seed, showMs]);
  const answer = (v) => {
    if (v !== count) { fire('bad'); setWrong((w) => w + 1); setSeed((s) => s + 1); return; }
    fire('good');
    if (round + 1 >= rounds) finish(start, rounds / (rounds + wrong)); else setRound(round + 1);
  };
  return (
    <Board3D theme="reaction" title="Quick Count" level={level} flash={flash} stats={[['Round', `${round + 1}/${rounds}`], ['Wrong', wrong]]}>
      <div className="relative mx-auto aspect-square max-w-xs rounded-2xl bg-black/40" data-testid="count-board">
        {phase === 'show' ? dots.map(([x, y, c], k) => <span key={k} className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x}%`, top: `${y}%`, background: level >= 6 ? c : '#fbbf24' }} />)
          : <div className="flex h-full items-center justify-center text-sm font-bold text-white/70">How many dots{level >= 6 ? ' in total' : ''}?</div>}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {options.map((o) => <button key={o} type="button" disabled={phase !== 'answer'} onClick={() => answer(o)} className={`${btn} border-amber-700 bg-amber-400 py-2 text-lg text-slate-900 disabled:opacity-40`} data-testid={`count-option-${o}`}>{o}</button>)}
      </div>
    </Board3D>
  );
}

// ---------- Shape Rotation: which option is the same shape, just rotated? ----------
function makeShape(size) {
  const cells = new Set(['0,0']);
  while (cells.size < size) { const [x, y] = [...cells][rnd(cells.size)].split(',').map(Number); const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][rnd(4)]; cells.add(`${x + dx},${y + dy}`); }
  return [...cells].map((c) => c.split(',').map(Number));
}
const norm = (pts) => { const mx = Math.min(...pts.map((p) => p[0])); const my = Math.min(...pts.map((p) => p[1])); return pts.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); };
const key = (pts) => JSON.stringify(norm(pts));
const rotate = (pts, t) => { let p = pts; for (let i = 0; i < t; i += 1) p = p.map(([x, y]) => [-y, x]); return norm(p); };
const mirror = (pts) => norm(pts.map(([x, y]) => [-x, y]));
const allRotations = (pts) => new Set([0, 1, 2, 3].map((t) => key(rotate(pts, t))));
function Mini({ pts, colour }) {
  const n = norm(pts); const w = Math.max(...n.map((p) => p[0])) + 1; const h = Math.max(...n.map((p) => p[1])) + 1; const s = Math.max(w, h);
  return <svg viewBox={`0 0 ${s} ${s}`} className="h-full w-full">{n.map(([x, y]) => <rect key={`${x},${y}`} x={x + (s - w) / 2} y={y + (s - h) / 2} width="0.92" height="0.92" rx="0.15" fill={colour} />)}</svg>;
}
export function PremiumShapeRotation({ config, onComplete }) {
  const level = difficultyOf(config);
  const rounds = lerpLevel(level, 3, 6);
  const [round, setRound] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  const q = useMemo(() => {
    let target; let mir;
    do { target = makeShape(lerpLevel(level, 4, 7)); mir = mirror(target); } while (allRotations(target).has(key(mir)));
    const right = rotate(target, 1 + rnd(3));
    const used = new Set([key(right)]);
    const wrongs = [];
    if (level >= 4) { const m = rotate(mir, rnd(4)); wrongs.push(m); used.add(key(m)); }
    while (wrongs.length < 3) { const s = makeShape(target.length); if (!allRotations(s).has(key(target)) && !used.has(key(s))) { wrongs.push(s); used.add(key(s)); } }
    return { target, options: shuffle([{ pts: right, ok: true }, ...wrongs.map((pts) => ({ pts, ok: false }))]) };
  }, [round, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (o) => {
    if (!o.ok) { fire('bad'); setWrong((w) => w + 1); return; }
    fire('good');
    if (round + 1 >= rounds) finish(start, rounds / (rounds + wrong)); else setRound(round + 1);
  };
  return (
    <Board3D theme="math" title="Shape Rotation" level={level} flash={flash} stats={[['Round', `${round + 1}/${rounds}`], ['Wrong', wrong]]}>
      <p className="mb-2 text-center text-xs text-white/70">Which shape is the same as this one, only rotated?{level >= 4 ? ' Watch out for mirror images.' : ''}</p>
      <div className="mx-auto mb-3 h-24 w-24 rounded-xl bg-black/30 p-2" data-testid="shape-target"><Mini pts={q.target} colour="#facc15" /></div>
      <div className="grid grid-cols-4 gap-2">
        {q.options.map((o, k) => <button key={k} type="button" onClick={() => pick(o)} className="aspect-square rounded-xl bg-white/10 p-2 hover:bg-white/20" data-testid={`shape-option-${k}`}><Mini pts={o.pts} colour="#60a5fa" /></button>)}
      </div>
    </Board3D>
  );
}

// ---------- Path Memory: watch the path, then retrace it ----------
function makePath(n, len) {
  const path = [rnd(n * n)];
  while (path.length < len) {
    const c = path[path.length - 1]; const x = c % n; const y = Math.floor(c / n);
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n).map(([a, b]) => b * n + a).filter((k) => !path.includes(k));
    if (!next.length) return makePath(n, len);
    path.push(next[rnd(next.length)]);
  }
  return path;
}
export function PremiumPathMemory({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = lerpLevel(level, 3, 6);
  const len = lerpLevel(level, 3, 11);
  const rounds = lerpLevel(level, 2, 4);
  const stepMs = lerpLevel(level, 650, 300);
  const [round, setRound] = useState(0);
  const path = useMemo(() => makePath(n, len), [round, n, len]); // eslint-disable-line react-hooks/exhaustive-deps
  const [show, setShow] = useState(-1);
  const [replay, setReplay] = useState(0);
  const [pos, setPos] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  useEffect(() => {
    setPos(0); setShow(0);
    let i = 0; const t = setInterval(() => { i += 1; if (i >= path.length) { clearInterval(t); setShow(-1); } else setShow(i); }, stepMs);
    return () => clearInterval(t);
  }, [path, replay, stepMs]);
  const tap = (k) => {
    if (show !== -1) return;
    if (k !== path[pos]) { fire('bad'); setWrong((w) => w + 1); setReplay((r) => r + 1); return; }
    fire('tap');
    if (pos + 1 === path.length) { fire('good'); if (round + 1 >= rounds) finish(start, rounds / (rounds + wrong)); else setRound(round + 1); } else setPos(pos + 1);
  };
  return (
    <Board3D theme="memory" title="Path Memory" level={level} flash={flash} stats={[['Round', `${round + 1}/${rounds}`], ['Path', len], ['Wrong', wrong]]}>
      <p className="mb-2 text-center text-xs text-white/70" data-testid="path-phase">{show !== -1 ? 'Watch the path…' : 'Now tap the path in the same order.'}</p>
      <div className="mx-auto grid max-w-xs gap-1.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} data-testid="path-board">
        {Array.from({ length: n * n }, (_, k) => {
          const lit = show !== -1 && path[show] === k; const doneCell = show === -1 && path.slice(0, pos).includes(k);
          return <button key={k} type="button" onClick={() => tap(k)} className={`aspect-square rounded-lg transition-colors duration-150 ${lit ? 'bg-fuchsia-400 shadow-[0_0_18px_rgba(232,121,249,0.8)]' : doneCell ? 'bg-emerald-500' : 'bg-white/10'}`} data-testid={`path-${k}`} />;
        })}
      </div>
    </Board3D>
  );
}

// ---------- Stack Tower: drop sliding blocks to build a tall tower ----------
export function PremiumStackTower({ config, onComplete }) {
  const level = difficultyOf(config);
  const goal = lerpLevel(level, 6, 15);
  const speed = lerpLevel(level, 35, 85);
  const [stack, setStack] = useState([{ x: 25, w: 50 }]);
  const [fails, setFails] = useState(0);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  const [x, setX] = useState(0);
  const state = useRef({ x: 0, dir: 1, last: 0 });
  const top = stack[stack.length - 1];
  useEffect(() => {
    let raf;
    const tick = (t) => {
      const s = state.current; const dt = s.last ? (t - s.last) / 1000 : 0; s.last = t;
      s.x += s.dir * speed * (1 + stack.length * 0.04) * dt;
      if (s.x <= 0) { s.x = 0; s.dir = 1; } if (s.x >= 100 - top.w) { s.x = 100 - top.w; s.dir = -1; }
      setX(s.x); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stack, top.w, speed]);
  const drop = () => {
    const left = Math.max(top.x, state.current.x); const right = Math.min(top.x + top.w, state.current.x + top.w);
    if (right - left < 2) { fire('bad'); setFails((f) => f + 1); setStack([{ x: 25, w: 50 }]); state.current = { x: 0, dir: 1, last: 0 }; return; }
    const next = [...stack, { x: left, w: right - left }];
    fire(right - left > top.w - 1 ? 'good' : 'tap'); setStack(next); state.current = { x: 0, dir: 1, last: 0 };
    if (next.length - 1 >= goal) finish(start, (next[next.length - 1].w / 50) / (1 + fails * 0.25));
  };
  const visible = stack.slice(-10);
  return (
    <Board3D theme="reaction" title="Stack Tower" level={level} flash={flash} stats={[['Floors', `${stack.length - 1}/${goal}`], ['Collapses', fails]]}>
      <button type="button" onClick={drop} className="relative mx-auto block h-72 w-full max-w-xs overflow-hidden rounded-2xl bg-black/40" data-testid="stack-board">
        {visible.map((b, i) => <span key={stack.length - visible.length + i} className="absolute h-6 rounded-sm bg-amber-400" style={{ left: `${b.x}%`, width: `${b.w}%`, bottom: `${i * 26}px`, filter: `hue-rotate(${(stack.length - visible.length + i) * 18}deg)` }} />)}
        <span className="absolute h-6 rounded-sm bg-white" style={{ left: `${x}%`, width: `${top.w}%`, bottom: `${visible.length * 26}px` }} data-testid="stack-moving" />
      </button>
      <p className="mt-2 text-center text-xs text-white/60">Tap to drop the block. Overhanging parts are cut off.</p>
    </Board3D>
  );
}

// ---------- Sum Hunt: pick tiles that add up to the target ----------
export function PremiumSumHunt({ config, onComplete }) {
  const level = difficultyOf(config);
  const n = lerpLevel(level, 4, 6);
  const rounds = lerpLevel(level, 3, 6);
  const [round, setRound] = useState(0);
  const { nums, target } = useMemo(() => {
    const g = Array.from({ length: n * n }, () => 1 + rnd(level >= 6 ? 15 : 9));
    const k = lerpLevel(level, 2, 5);
    return { nums: g, target: shuffle([...g.keys()]).slice(0, k).reduce((s, i) => s + g[i], 0) };
  }, [round, n, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState([]);
  const [busts, setBusts] = useState(0);
  const [start] = useState(Date.now);
  const finish = useFinish(onComplete);
  const [flash, fire] = useFeedback();
  const sum = sel.reduce((s, i) => s + nums[i], 0);
  const tap = (k) => {
    const s = sel.includes(k) ? sel.filter((i) => i !== k) : [...sel, k];
    const total = s.reduce((a, i) => a + nums[i], 0);
    if (total > target) { fire('bad'); setBusts((b) => b + 1); setSel([]); return; }
    setSel(s); fire('tap');
    if (total === target) { fire('good'); setSel([]); if (round + 1 >= rounds) finish(start, rounds / (rounds + busts)); else setRound(round + 1); }
  };
  return (
    <Board3D theme="math" title="Sum Hunt" level={level} flash={flash} stats={[['Target', target], ['Sum', sum], ['Round', `${round + 1}/${rounds}`]]}>
      <p className="mb-2 text-center text-xs text-white/70">Tap tiles that add up exactly to the target. Going over resets your pick.</p>
      <div className="mx-auto grid max-w-xs gap-1.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} data-testid="sum-board">
        {nums.map((v, k) => <button key={`${round}-${k}`} type="button" onClick={() => tap(k)} className={`${btn} aspect-square text-lg ${sel.includes(k) ? 'border-sky-800 bg-sky-400 text-slate-900' : 'border-slate-800 bg-slate-200 text-slate-900'}`} data-testid={`sum-${k}`}>{v}</button>)}
      </div>
    </Board3D>
  );
}

export const GAMES_V3 = {
  pipe_connect: (config, onComplete) => <PremiumPipeConnect config={config} onComplete={onComplete} />,
  ball_sort: (config, onComplete) => <PremiumBallSort config={config} onComplete={onComplete} />,
  colour_flood: (config, onComplete) => <PremiumColourFlood config={config} onComplete={onComplete} />,
  code_breaker: (config, onComplete) => <PremiumCodeBreaker config={config} onComplete={onComplete} />,
  word_search: (config, onComplete) => <PremiumWordSearch config={config} onComplete={onComplete} />,
  speed_typing: (config, onComplete) => <PremiumSpeedTyping config={config} onComplete={onComplete} />,
  quick_count: (config, onComplete) => <PremiumQuickCount config={config} onComplete={onComplete} />,
  shape_rotation: (config, onComplete) => <PremiumShapeRotation config={config} onComplete={onComplete} />,
  path_memory: (config, onComplete) => <PremiumPathMemory config={config} onComplete={onComplete} />,
  stack_tower: (config, onComplete) => <PremiumStackTower config={config} onComplete={onComplete} />,
  sum_hunt: (config, onComplete) => <PremiumSumHunt config={config} onComplete={onComplete} />,
};

export const GAMES_V3_CATALOG = [
  { id: 'pipe_connect', label: 'Pipe Connect', category: 'Logic', target_time_s: 90 },
  { id: 'ball_sort', label: 'Ball Sort', category: 'Logic', target_time_s: 120 },
  { id: 'colour_flood', label: 'Colour Flood', category: 'Strategy', target_time_s: 90 },
  { id: 'code_breaker', label: 'Code Breaker', category: 'Logic', target_time_s: 150 },
  { id: 'word_search', label: 'Word Search', category: 'Trivia & Words', target_time_s: 120 },
  { id: 'speed_typing', label: 'Speed Typing', category: 'Reaction', target_time_s: 60 },
  { id: 'quick_count', label: 'Quick Count', category: 'Memory', target_time_s: 45 },
  { id: 'shape_rotation', label: 'Shape Rotation', category: 'Puzzles', target_time_s: 60 },
  { id: 'path_memory', label: 'Path Memory', category: 'Memory', target_time_s: 60 },
  { id: 'stack_tower', label: 'Stack Tower', category: 'Reaction', target_time_s: 60 },
  { id: 'sum_hunt', label: 'Sum Hunt', category: 'Logic', target_time_s: 60 },
];
