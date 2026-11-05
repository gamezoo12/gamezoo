import { useEffect, useState } from 'react';
import { Board3D, useFeedback } from '../premium/kit';
import { difficultyOf } from '../../../lib/difficulty';
import { playGameSound } from '../../../lib/gameExperience';

// Four in a Row: drop discs and connect four before the AI does. Higher levels make the AI look further ahead.
const R = 6; const C = 7;
const lines = [];
for (let r = 0; r < R; r += 1) for (let c = 0; c < C; c += 1) [[0, 1], [1, 0], [1, 1], [1, -1]].forEach(([dr, dc]) => {
  const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
  if (cells.every(([a, b]) => a >= 0 && a < R && b >= 0 && b < C)) lines.push(cells.map(([a, b]) => a * C + b));
});
const winnerOf = (b) => { for (const l of lines) { const v = b[l[0]]; if (v && l.every((i) => b[i] === v)) return { v, l }; } return null; };
const dropRow = (b, c) => { for (let r = R - 1; r >= 0; r -= 1) if (!b[r * C + c]) return r; return -1; };
const score = (b) => lines.reduce((s, l) => { const a = l.filter((i) => b[i] === 2).length; const h = l.filter((i) => b[i] === 1).length; if (a && h) return s; return s + [0, 1, 4, 20, 1000][a] - [0, 1, 5, 25, 1000][h]; }, 0);
function minimax(b, depth, ai, alpha, beta) {
  const w = winnerOf(b);
  if (w) return w.v === 2 ? 100000 + depth : -100000 - depth;
  if (depth === 0 || b.every(Boolean)) return score(b);
  let best = ai ? -Infinity : Infinity;
  for (const c of [3, 2, 4, 1, 5, 0, 6]) {
    const r = dropRow(b, c);
    if (r < 0) continue;
    const nb = [...b]; nb[r * C + c] = ai ? 2 : 1;
    const v = minimax(nb, depth - 1, !ai, alpha, beta);
    if (ai) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

export function FourInRow({ config, onComplete }) {
  const level = difficultyOf(config);
  const depth = Math.min(6, 1 + Math.ceil(level / 2));
  const [b, setB] = useState(Array(R * C).fill(0));
  const [turn, setTurn] = useState(1);
  const [win, setWin] = useState(null);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const finish = (nb) => {
    const w = winnerOf(nb);
    if (w || nb.every(Boolean)) {
      setWin(w || { v: 0, l: [] });
      playGameSound(w?.v === 1 ? 'success' : 'failure');
      setTimeout(() => onComplete({ solved: w?.v === 1, accuracy: w?.v === 1 ? 1 : 0.3, duration_ms: Date.now() - start }), 900);
      return true;
    }
    return false;
  };
  const drop = (c) => {
    if (turn !== 1 || win) return;
    const r = dropRow(b, c);
    if (r < 0) { fire('bad'); return; }
    const nb = [...b]; nb[r * C + c] = 1;
    playGameSound('tap');
    setB(nb);
    if (!finish(nb)) setTurn(2);
  };
  useEffect(() => {
    if (turn !== 2 || win) return undefined;
    const t = setTimeout(() => {
      let bestC = 3; let best = -Infinity;
      [3, 2, 4, 1, 5, 0, 6].forEach((c) => {
        const r = dropRow(b, c);
        if (r < 0) return;
        const nb = [...b]; nb[r * C + c] = 2;
        const v = minimax(nb, depth - 1, false, -Infinity, Infinity) + (level <= 2 ? Math.random() * 40 : 0);
        if (v > best) { best = v; bestC = c; }
      });
      const nb = [...b]; nb[dropRow(b, bestC) * C + bestC] = 2;
      setB(nb);
      if (!finish(nb)) setTurn(1);
    }, 450);
    return () => clearTimeout(t);
  }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Board3D theme="math" title="Four in a Row" level={level} flash={flash} stats={[['Turn', win ? (win.v === 1 ? 'You win!' : win.v === 2 ? 'AI wins' : 'Draw') : turn === 1 ? 'You' : 'AI…']]}>
      <div className="grid gap-1.5 rounded-2xl bg-blue-700 p-2 shadow-[inset_0_-6px_0_rgba(0,0,0,0.3)]" style={{ gridTemplateColumns: `repeat(${C}, minmax(0, 1fr))` }} data-testid="four-row-board">
        {b.map((v, i) => (
          <button key={i} type="button" onClick={() => drop(i % C)} data-testid={`four-row-cell-${i}`} aria-label={`Drop in column ${(i % C) + 1}`}
            className={`aspect-square rounded-full shadow-[inset_0_4px_6px_rgba(0,0,0,0.45)] transition-colors ${v === 1 ? 'bg-gradient-to-br from-yellow-300 to-amber-500' : v === 2 ? 'bg-gradient-to-br from-rose-400 to-red-600' : 'bg-slate-900/80'} ${win?.l.includes(i) ? 'animate-pulse ring-4 ring-white' : ''}`} />
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/70">You are yellow. Tap a column to drop. Connect 4 in any direction.</p>
    </Board3D>
  );
}
