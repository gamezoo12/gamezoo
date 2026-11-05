import { useCallback, useMemo, useState } from 'react';
import { Board3D, useFeedback } from '../premium/kit';
import { difficultyOf } from '../../../lib/difficulty';
import { playGameSound } from '../../../lib/gameExperience';

// Sweet Swap: swap neighbouring sweets to line up 3+ of a kind. Hit the score target before you run out of moves.
const SWEETS = ['🍓', '🍋', '🍇', '🍏', '🫐', '🍊', '🍬'];
const N = 7;
const rnd = (k) => Math.floor(Math.random() * k);

function findMatches(b) {
  const hit = new Set();
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) {
    const v = b[r * N + c];
    if (v == null) continue;
    if (c <= N - 3 && b[r * N + c + 1] === v && b[r * N + c + 2] === v) [0, 1, 2].forEach((k) => hit.add(r * N + c + k));
    if (r <= N - 3 && b[(r + 1) * N + c] === v && b[(r + 2) * N + c] === v) [0, 1, 2].forEach((k) => hit.add((r + k) * N + c));
  }
  return hit;
}
function collapse(b, kinds) {
  const out = [...b];
  for (let c = 0; c < N; c += 1) {
    const col = [];
    for (let r = N - 1; r >= 0; r -= 1) if (out[r * N + c] != null) col.push(out[r * N + c]);
    for (let r = N - 1, i = 0; r >= 0; r -= 1, i += 1) out[r * N + c] = i < col.length ? col[i] : rnd(kinds);
  }
  return out;
}
function settle(b, kinds) {
  let board = b; let gained = 0; let combo = 0;
  for (;;) {
    const m = findMatches(board);
    if (!m.size) return { board, gained, combo };
    combo += 1;
    gained += m.size * 10 * combo;
    board = collapse(board.map((v, i) => (m.has(i) ? null : v)), kinds);
  }
}

export function SweetSwap({ config, onComplete }) {
  const level = difficultyOf(config);
  const kinds = Math.min(7, 4 + Math.floor(level / 3));
  const goal = 300 + level * 120;
  const movesMax = Math.max(10, 24 - level);
  const fresh = useMemo(() => settle(Array.from({ length: N * N }, () => rnd(kinds)), kinds).board, [kinds]);
  const [board, setBoard] = useState(fresh);
  const [sel, setSel] = useState(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(movesMax);
  const [pop, setPop] = useState('');
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();

  const tap = useCallback((i) => {
    if (moves <= 0) return;
    if (sel == null) { setSel(i); playGameSound('tap'); return; }
    const adj = Math.abs(sel - i) === N || (Math.abs(sel - i) === 1 && Math.floor(sel / N) === Math.floor(i / N));
    if (!adj) { setSel(i); return; }
    const swapped = [...board];
    [swapped[sel], swapped[i]] = [swapped[i], swapped[sel]];
    setSel(null);
    if (!findMatches(swapped).size) { fire('bad'); return; }
    const res = settle(swapped, kinds);
    const total = score + res.gained;
    const left = moves - 1;
    fire('good');
    setBoard(res.board); setScore(total); setMoves(left);
    setPop(res.combo > 1 ? `Combo x${res.combo}! +${res.gained}` : `+${res.gained}`);
    setTimeout(() => setPop(''), 700);
    if (total >= goal) onComplete({ solved: true, accuracy: Math.min(1, 0.5 + left / movesMax), duration_ms: Date.now() - start });
    else if (left <= 0) onComplete({ solved: false, accuracy: total / goal, duration_ms: Date.now() - start });
  }, [board, sel, score, moves, kinds, goal, movesMax, fire, onComplete, start]);

  return (
    <Board3D theme="sweet" title="Sweet Swap" level={level} flash={flash} stats={[['Score', `${score}/${goal}`], ['Moves', moves]]}>
      <div className="relative">
        <div className="mb-2 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-amber-300 transition-[width] duration-300" style={{ width: `${Math.min(100, (score / goal) * 100)}%` }} /></div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }} data-testid="sweet-swap-board">
          {board.map((v, i) => (
            <button key={i} type="button" onClick={() => tap(i)} data-testid={`sweet-${i}`}
              className={`flex aspect-square items-center justify-center rounded-xl bg-white/15 text-[clamp(1.1rem,6vw,1.9rem)] shadow-inner transition-transform duration-150 ${sel === i ? 'scale-110 ring-4 ring-amber-300' : 'hover:scale-105'}`}>{SWEETS[v]}</button>
          ))}
        </div>
        {pop && <div className="pl-practice-pop pointer-events-none absolute inset-x-0 top-1/3 text-center font-display text-3xl font-black text-amber-300 drop-shadow-[0_4px_0_#7a1d4a]">{pop}</div>}
        <p className="mt-2 text-center text-[11px] text-white/70">Tap a sweet, then a neighbour to swap. Line up 3 or more.</p>
      </div>
    </Board3D>
  );
}
