import { useEffect, useRef, useState } from 'react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, sfx, themeFor, useBanter, useClocks } from './kit';
import { PartyStage } from './stage';

// Four in a Row vs a bot that looks further ahead each level. Turn clock (random drop on time-out) + match clock (best position wins).
const R = 6; const C = 7;
const lines = [];
for (let r = 0; r < R; r += 1) for (let c = 0; c < C; c += 1) [[0, 1], [1, 0], [1, 1], [1, -1]].forEach(([dr, dc]) => {
  const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
  if (cells.every(([a, b]) => a >= 0 && a < R && b >= 0 && b < C)) lines.push(cells.map(([a, b]) => a * C + b));
});
const winnerOf = (b) => { for (const l of lines) { const v = b[l[0]]; if (v && l.every((i) => b[i] === v)) return { v, l }; } return null; };
const dropRow = (b, c) => { for (let r = R - 1; r >= 0; r -= 1) if (!b[r * C + c]) return r; return -1; };
const score = (b) => lines.reduce((s, l) => { const a = l.filter((i) => b[i] === 2).length; const h = l.filter((i) => b[i] === 1).length; if (a && h) return s; return s + [0, 1, 4, 20, 1000][a] - [0, 1, 5, 25, 1000][h]; }, 0);
const threes = (b, v) => lines.filter((l) => l.filter((i) => b[i] === v).length === 3 && l.some((i) => !b[i])).length;
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
const BOT = BOTS[1];

export function FourInRow({ config, onComplete }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const depth = Math.min(6, 1 + Math.ceil(level / 2));
  const [b, setB] = useState(Array(R * C).fill(0));
  const [turn, setTurn] = useState(1);
  const [moves, setMoves] = useState(0);
  const [last, setLast] = useState(-1);
  const [win, setWin] = useState(null);
  const [start] = useState(Date.now);
  const banter = useBanter('Four in a Row', [BOT]);
  const done = useRef(false);
  const turnSec = Math.max(6, 16 - level);
  const matchSec = Math.max(90, 200 - level * 8);

  const end = (solved, w, why) => {
    if (done.current) return; done.current = true;
    setWin(w);
    sfx(solved ? 'win' : 'lose');
    banter.say(0, solved ? 'you_win' : 'bot_win', { big: true, force: true, event: solved ? 'the human beat you at four in a row' : 'you beat the human at four in a row', detail: why || '' });
    setTimeout(() => onComplete({ solved, accuracy: solved ? Math.max(0.5, 1 - moves / 42) : 0.3, duration_ms: Date.now() - start }), 1800);
  };
  const place = (nb, i, who) => {
    setB(nb); setLast(i); setMoves((m) => m + 1); sfx('drop');
    const w = winnerOf(nb);
    if (w) { end(w.v === 1, w); return; }
    if (nb.every(Boolean)) { end(false, { v: 0, l: [] }, 'board full, a draw'); return; }
    if (who === 1 && threes(nb, 1) > threes(b, 1)) banter.say(0, 'you_good');
    if (who === 2 && threes(nb, 2) > threes(b, 2)) banter.say(0, 'bot_good', { big: threes(nb, 2) >= 2, event: 'you set up a double threat in four in a row' });
    setTurn(who === 1 ? 2 : 1);
  };
  const drop = (c) => {
    if (turn !== 1 || win) return;
    const r = dropRow(b, c);
    if (r < 0) { sfx('bad'); return; }
    const nb = [...b]; nb[r * C + c] = 1; place(nb, r * C + c, 1);
  };
  const { turnLeft, matchLeft } = useClocks({ turnSec, matchSec, turnKey: moves, running: !win,
    onTurnOut: () => { if (turn === 1) { const open = [0, 1, 2, 3, 4, 5, 6].filter((c) => dropRow(b, c) >= 0); drop(open[Math.floor(Math.random() * open.length)]); banter.say(0, 'taunt', { force: true }); } },
    onMatchOut: () => end(score(b) < 0, { v: 0, l: [] }, 'match clock ran out, best position won') });

  useEffect(() => { banter.say(0, 'start', { force: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (turn !== 2 || win) return undefined;
    const t = setTimeout(() => {
      let bestC = 3; let best = -Infinity;
      [3, 2, 4, 1, 5, 0, 6].forEach((c) => {
        const r = dropRow(b, c);
        if (r < 0) return;
        const nb = [...b]; nb[r * C + c] = 2;
        const v = minimax(nb, depth - 1, false, -Infinity, Infinity) + (level <= 3 ? Math.random() * 60 : 0);
        if (v > best) { best = v; bestC = c; }
      });
      const blocked = threes(b, 1) > 0 && (() => { const nb = [...b]; nb[dropRow(b, bestC) * C + bestC] = 1; return !!winnerOf(nb); })();
      const nb = [...b]; const i = dropRow(b, bestC) * C + bestC; nb[i] = 2;
      if (blocked) banter.say(0, 'bot_good', { big: true, event: 'you just blocked the human\'s winning four-in-a-row move' });
      place(nb, i, 2);
    }, 700);
    return () => clearTimeout(t);
  }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps

  const players = [{ ...YOU, color: '#facc15', info: 'yellow' }, { ...BOT, color: '#ef4444', info: 'red' }];
  return (
    <PartyStage config={config} title="Four in a Row" players={players} active={win ? -1 : turn - 1} turnLeft={turnLeft} turnSec={turnSec} matchLeft={matchLeft} banter={banter}>
      <div className="mx-auto max-w-[440px] rounded-[24px] p-2.5 sm:p-3" style={{ background: theme.frame, boxShadow: `0 0 0 2px ${theme.accent}99, 0 25px 60px rgba(0,0,0,0.6), inset 0 -8px 0 rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.3)` }} data-testid="four-row-board">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${C}, minmax(0, 1fr))` }}>
          {b.map((v, i) => (
            <button key={i} type="button" onClick={() => drop(i % C)} data-testid={`four-row-cell-${i}`} aria-label={`Drop in column ${(i % C) + 1}`}
              className={`relative aspect-square rounded-full ${turn === 1 && !win ? 'cursor-pointer' : ''}`} style={{ background: 'radial-gradient(circle at 50% 40%, rgba(0,0,0,0.75), rgba(0,0,0,0.45))', boxShadow: 'inset 0 5px 8px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.2)' }}>
              {v > 0 && <span key={`${i}-${v}`} className={`absolute inset-[6%] rounded-full ${i === last ? 'pty-dropin' : ''} ${win?.l.includes(i) ? 'animate-pulse ring-4 ring-white' : ''}`}
                style={{ '--fall': `-${(Math.floor(i / C) + 1) * 115}%`, background: v === 1 ? 'radial-gradient(circle at 35% 30%, #fff7c2, #facc15 40%, #b45309)' : 'radial-gradient(circle at 35% 30%, #ffd1d1, #ef4444 40%, #7f1d1d)', boxShadow: 'inset 0 -4px 6px rgba(0,0,0,0.35), inset 0 0 0 4px rgba(255,255,255,0.15)' }} />}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] font-bold text-white/80" data-testid="four-row-status">{win ? (win.v === 1 ? 'Four in a row! You win 🎉' : win.v === 2 ? `${BOT.name} connected four` : 'Draw') : turn === 1 ? 'Your turn: tap a column' : `${BOT.name} is thinking…`}</p>
    </PartyStage>
  );
}
