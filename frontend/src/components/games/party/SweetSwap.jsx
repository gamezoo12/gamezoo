import { useEffect, useRef, useState } from 'react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, sfx, themeFor, useBanter, useClocks } from './kit';
import { PartyStage } from './stage';

// Sweet Swap duel: match 3+ sweets, race a rival bot to the target. Match 4 = striped sweet (clears a line), match 5 = colour bomb.
// Turn clock (idle costs a move) + match clock (higher score wins).
const N = 7;
const KINDS = [
  { c: ['#fecaca', '#ef4444', '#7f1d1d'], shape: { borderRadius: '50%' } },
  { c: ['#fed7aa', '#f97316', '#7c2d12'], shape: { borderRadius: '45% 45% 45% 45% / 60% 60% 40% 40%', transform: 'scaleX(1.12)' } },
  { c: ['#fef9c3', '#facc15', '#854d0e'], shape: { clipPath: 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' } },
  { c: ['#bbf7d0', '#22c55e', '#14532d'], shape: { borderRadius: '24%' } },
  { c: ['#bfdbfe', '#3b82f6', '#1e3a8a'], shape: { borderRadius: '50% 50% 50% 8%', transform: 'rotate(-45deg)' } },
  { c: ['#e9d5ff', '#a855f7', '#4c1d95'], shape: { borderRadius: '18%', transform: 'rotate(45deg) scale(0.86)' } },
  { c: ['#fbcfe8', '#ec4899', '#831843'], shape: { clipPath: 'polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%)' } },
];
let nid = 0;
const rnd = (k) => Math.floor(Math.random() * k);
const fresh = (kinds) => ({ k: rnd(kinds), s: null, id: (nid += 1) });

function runs(b) {
  const out = [];
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N;) { let e = c; while (e + 1 < N && b[r * N + e + 1].k === b[r * N + c].k) e += 1; if (e - c >= 2) out.push({ cells: Array.from({ length: e - c + 1 }, (_, i) => r * N + c + i), dir: 'h' }); c = e + 1; }
  for (let c = 0; c < N; c += 1) for (let r = 0; r < N;) { let e = r; while (e + 1 < N && b[(e + 1) * N + c].k === b[r * N + c].k) e += 1; if (e - r >= 2) out.push({ cells: Array.from({ length: e - r + 1 }, (_, i) => (r + i) * N + c), dir: 'v' }); r = e + 1; }
  return out;
}
function blast(b, clear) {
  const queue = [...clear];
  while (queue.length) {
    const i = queue.pop(); const s = b[i]?.s;
    if (!s) continue;
    const extra = s === 'h' ? Array.from({ length: N }, (_, c) => Math.floor(i / N) * N + c) : s === 'v' ? Array.from({ length: N }, (_, r) => r * N + (i % N)) : b.map((x, j) => (x.k === b[i].k ? j : -1)).filter((j) => j >= 0);
    extra.forEach((j) => { if (!clear.has(j)) { clear.add(j); queue.push(j); } });
  }
}
function collapse(b, kinds) {
  const out = [...b];
  for (let c = 0; c < N; c += 1) {
    const col = [];
    for (let r = N - 1; r >= 0; r -= 1) if (out[r * N + c]) col.push(out[r * N + c]);
    for (let r = N - 1, i = 0; r >= 0; r -= 1, i += 1) out[r * N + c] = i < col.length ? col[i] : fresh(kinds);
  }
  return out;
}
function settle(start, kinds, pivots = []) {
  let b = start; let gained = 0; let combo = 0; let specials = 0;
  for (;;) {
    const rs = runs(b);
    if (!rs.length) return { b, gained, combo, specials };
    combo += 1;
    const clear = new Set(rs.flatMap((x) => x.cells));
    blast(b, clear);
    const make = [];
    rs.forEach((x) => { if (x.cells.length >= 4) { const p = x.cells.find((i) => pivots.includes(i)) ?? x.cells[1]; make.push([p, { k: b[p].k, s: x.cells.length >= 5 ? 'bomb' : x.dir === 'h' ? 'v' : 'h', id: (nid += 1) }]); } });
    gained += clear.size * 10 * combo;
    const nb = b.map((x, i) => (clear.has(i) ? null : x));
    make.forEach(([p, cell]) => { nb[p] = cell; specials += 1; });
    b = collapse(nb, kinds);
    pivots = [];
  }
}

function Candy({ cell }) {
  const k = KINDS[cell.k];
  return (
    <span key={cell.id} className="pty-new absolute inset-[10%]" style={{ filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.45))' }}>
      <span className="absolute inset-0" style={{ ...k.shape, background: cell.s === 'bomb' ? 'conic-gradient(#ef4444,#f97316,#facc15,#22c55e,#3b82f6,#a855f7,#ef4444)' : `radial-gradient(circle at 32% 28%, ${k.c[0]} 0 14%, ${k.c[1]} 45%, ${k.c[2]} 100%)` }}>
        {cell.s === 'h' && <span className="absolute inset-x-0 top-1/2 h-[30%] -translate-y-1/2 bg-[repeating-linear-gradient(90deg,#fff_0_3px,transparent_3px_7px)] opacity-80" />}
        {cell.s === 'v' && <span className="absolute inset-y-0 left-1/2 w-[30%] -translate-x-1/2 bg-[repeating-linear-gradient(0deg,#fff_0_3px,transparent_3px_7px)] opacity-80" />}
        {cell.s === 'bomb' && <span className="absolute inset-[28%] rounded-full bg-slate-900 shadow-[0_0_8px_#fff]" />}
        <span className="absolute left-[18%] top-[14%] h-[22%] w-[30%] rounded-full bg-white/70 blur-[1px]" />
      </span>
    </span>
  );
}

const RIVAL = BOTS[3];
export function SweetSwap({ config, onComplete }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const kinds = Math.min(7, 4 + Math.floor(level / 3));
  const goal = 300 + level * 120;
  const movesMax = Math.max(12, 26 - level);
  const turnSec = Math.max(6, 14 - Math.floor(level / 2));
  const matchSec = Math.max(90, 150 - level * 4);
  const [board, setBoard] = useState(() => settle(Array.from({ length: N * N }, () => fresh(kinds)), kinds).b);
  const [sel, setSel] = useState(null);
  const [score, setScore] = useState(0);
  const [rival, setRival] = useState(0);
  const [moves, setMoves] = useState(movesMax);
  const [moveNo, setMoveNo] = useState(0);
  const [pop, setPop] = useState(null);
  const [flash, setFlash] = useState(null);
  const [over, setOver] = useState(false);
  const [start] = useState(Date.now);
  const banter = useBanter('Sweet Swap (a candy matching race)', [RIVAL]);
  const done = useRef(false);

  const end = (won, why) => {
    if (done.current) return; done.current = true; setOver(true);
    sfx(won ? 'win' : 'lose');
    banter.say(0, won ? 'you_win' : 'bot_win', { big: true, force: true, event: won ? 'the human beat you in the candy race' : 'you beat the human in the candy race', detail: why });
    setTimeout(() => onComplete({ solved: won, accuracy: won ? Math.min(1, 0.5 + moves / movesMax) : Math.min(0.9, score / goal), duration_ms: Date.now() - start }), 1800);
  };
  const { turnLeft, matchLeft } = useClocks({ turnSec, matchSec, turnKey: moveNo, running: !over,
    onTurnOut: () => { sfx('bad'); setSel(null); setMoveNo((m) => m + 1); setMoves((m) => { if (m - 1 <= 0) end(score > rival, 'out of moves'); return m - 1; }); banter.say(0, 'taunt', { force: true }); },
    onMatchOut: () => end(score > rival, 'match clock ran out, higher score won') });

  useEffect(() => { banter.say(0, 'start', { force: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (over) return undefined;
    const rate = (goal / (matchSec * 0.9)) * (0.6 + level * 0.05);
    const t = setInterval(() => setRival((v) => {
      const nv = Math.round(v + rate * 3 * (0.5 + Math.random()));
      if (v < score && nv >= score && score > 0) banter.say(0, 'bot_good', { big: true, event: 'you just overtook the human in the candy race' });
      if (nv >= goal) setTimeout(() => end(false, 'rival hit the target first'), 0);
      return Math.min(goal, nv);
    }), 3000);
    return () => clearInterval(t);
  }, [over, score]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (i) => {
    if (over || moves <= 0) return;
    if (sel == null) { setSel(i); sfx('step'); return; }
    const adj = Math.abs(sel - i) === N || (Math.abs(sel - i) === 1 && Math.floor(sel / N) === Math.floor(i / N));
    if (!adj) { setSel(i); return; }
    const sw = [...board]; [sw[sel], sw[i]] = [sw[i], sw[sel]];
    setSel(null);
    let res;
    if (sw[i].s === 'bomb' || sw[sel].s === 'bomb') {
      const bomb = sw[i].s === 'bomb' ? i : sel; const other = bomb === i ? sel : i;
      const clear = new Set(sw.map((x, j) => (x.k === sw[other].k ? j : -1)).filter((j) => j >= 0)); clear.add(bomb); blast(sw, clear);
      const after = settle(collapse(sw.map((x, j) => (clear.has(j) ? null : x)), kinds), kinds);
      res = { b: after.b, gained: clear.size * 20 + after.gained, combo: after.combo + 2, specials: 1 };
    } else {
      if (!runs(sw).length) { sfx('bad'); setFlash('bad'); setTimeout(() => setFlash(null), 350); return; }
      res = settle(sw, kinds, [i, sel]);
    }
    const total = score + res.gained; const left = moves - 1;
    sfx(res.combo > 1 ? 'combo' : 'pop');
    setBoard(res.b); setScore(total); setMoves(left); setMoveNo((m) => m + 1);
    setPop({ id: Date.now(), text: res.combo > 2 ? `SWEET! x${res.combo}` : res.combo > 1 ? `Combo x${res.combo}` : `+${res.gained}`, gained: res.gained });
    if (res.combo >= 3 || res.specials) banter.say(0, 'you_good', { big: res.combo >= 4, event: `the human just made a ${res.combo}x combo` });
    if (total >= goal) end(true, 'hit the target');
    else if (left <= 0) end(total > rival, 'out of moves');
  };

  const players = [{ ...YOU, color: '#38bdf8', info: `${score}/${goal}` }, { ...RIVAL, color: '#ec4899', info: `${rival}/${goal}` }];
  return (
    <PartyStage config={config} title="Sweet Swap" players={players} active={over ? -1 : 0} turnLeft={turnLeft} turnSec={turnSec} matchLeft={matchLeft} banter={banter} flash={flash}>
      <div className="mb-2 space-y-1">
        {[[score, 'from-sky-400 to-cyan-300', 'You', 'sweet-you-bar'], [rival, 'from-pink-500 to-rose-400', RIVAL.name, 'sweet-rival-bar']].map(([v, grad, name, id]) => (
          <div key={name} className="flex items-center gap-2 text-[10px] font-black text-white"><span className="w-12 truncate">{name}</span><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/40"><div className={`h-full rounded-full bg-gradient-to-r ${grad} transition-[width] duration-500`} style={{ width: `${Math.min(100, (v / goal) * 100)}%` }} data-testid={id} /></div></div>
        ))}
        <div className="text-center text-[10px] font-bold text-white/70" data-testid="sweet-moves">Moves left: {moves}</div>
      </div>
      <div className="relative mx-auto max-w-[440px] rounded-[22px] p-2" style={{ background: theme.frame, boxShadow: `0 0 0 2px ${theme.accent}99, 0 25px 60px rgba(0,0,0,0.55)` }}>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }} data-testid="sweet-swap-board">
          {board.map((cell, i) => (
            <button key={i} type="button" onClick={() => tap(i)} data-testid={`sweet-${i}`} aria-label={`sweet ${cell.k}`}
              className={`relative aspect-square rounded-xl transition-transform duration-150 ${sel === i ? 'scale-110 ring-4 ring-amber-300' : 'hover:scale-105'}`} style={{ background: (Math.floor(i / N) + i) % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)' }}>
              <Candy cell={cell} />
            </button>
          ))}
        </div>
        {pop && <div key={pop.id} className="pty-banner pointer-events-none absolute inset-x-0 top-1/3 text-center font-display text-4xl font-black text-amber-300 drop-shadow-[0_4px_0_#7a1d4a]">{pop.text}</div>}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/70">Swap neighbours to line up 3+. Match 4 for a striped sweet, 5 for a colour bomb. Beat {RIVAL.name} to {goal}!</p>
    </PartyStage>
  );
}
