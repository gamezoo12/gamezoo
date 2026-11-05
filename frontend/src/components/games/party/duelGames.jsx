import { DuelGame } from './duel';

// Game rules plugged into the shared duel engine: Reversi, Gomoku, Tic Tac Toe Showdown, Mancala.
const W = { 1: 'radial-gradient(circle at 35% 30%, #ffffff, #e2e8f0 45%, #94a3b8)', 2: 'radial-gradient(circle at 35% 30%, #64748b, #0f172a 55%, #000)' };
const lineCache = {};
function windows(n, k) {
  const key = `${n}-${k}`; if (lineCache[key]) return lineCache[key];
  const out = [];
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) [[0, 1], [1, 0], [1, 1], [1, -1]].forEach(([dr, dc]) => {
    const cells = Array.from({ length: k }, (_, i) => [r + dr * i, c + dc * i]);
    if (cells.every(([a, b]) => a >= 0 && a < n && b >= 0 && b < n)) out.push(cells.map(([a, b]) => a * n + b));
  });
  lineCache[key] = out; return out;
}
const lineWinner = (b, n, k) => { for (const w of windows(n, k)) { const v = b[w[0]]; if (v && w.every((i) => b[i] === v)) return v; } return null; };
const lineScore = (b, n, k) => windows(n, k).reduce((s, w) => { let a = 0; let h = 0; w.forEach((i) => { if (b[i] === 2) a += 1; else if (b[i] === 1) h += 1; }); if (a && h) return s; return s + (a ? 4 ** a : 0) - (h ? 4 ** h * 1.2 : 0); }, 0);
const sideN = (b) => Math.round(Math.sqrt(b.length));

function Stones({ g, legal, onMove, colors, n, dot }) {
  return (
    <div className="grid aspect-square gap-[2px] rounded-lg p-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, background: colors.bg }}>
      {g.b.map((v, i) => (
        <button key={i} type="button" onClick={() => onMove(i)} className="relative flex items-center justify-center rounded-[3px]" style={{ background: colors.cell }} data-testid={`duel-cell-${i}`}>
          {v > 0 && <span key={v} className={`pty-new absolute inset-[9%] rounded-full ${g.last === i ? 'ring-2 ring-amber-300' : ''}`} style={{ background: colors.stone[v], boxShadow: '0 3px 4px rgba(0,0,0,0.5)' }} />}
          {!v && dot && legal.includes(i) && <span className="h-1/4 w-1/4 rounded-full bg-amber-300/70" />}
        </button>
      ))}
    </div>
  );
}

// ---------- Reversi ----------
const DIR8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
function flips(b, i, side) {
  if (b[i]) return [];
  const r = Math.floor(i / 8); const c = i % 8; const out = [];
  DIR8.forEach(([dr, dc]) => { const run = []; let y = r + dr; let x = c + dc; while (y >= 0 && y < 8 && x >= 0 && x < 8 && b[y * 8 + x] === 3 - side) { run.push(y * 8 + x); y += dr; x += dc; } if (run.length && y >= 0 && y < 8 && x >= 0 && x < 8 && b[y * 8 + x] === side) out.push(...run); });
  return out;
}
const CORNERS = new Set([0, 7, 56, 63]);
export const REVERSI = {
  id: 'reversi', title: 'Reversi', bot: 1, hint: 'Your turn: tap a glowing dot to flip discs', sound: 'card',
  colors: [{ name: 'white', hex: '#e2e8f0' }, { name: 'black', hex: '#334155' }], frame: 'linear-gradient(145deg,#14532d,#052e16)',
  init: () => { const b = Array(64).fill(0); b[27] = 1; b[36] = 1; b[28] = 2; b[35] = 2; return b; },
  legal: (s) => s.b.map((_, i) => (flips(s.b, i, s.turn).length ? i : -1)).filter((i) => i >= 0),
  play: (s, m) => { const f = flips(s.b, m, s.turn); const b = [...s.b]; b[m] = s.turn; f.forEach((i) => { b[i] = s.turn; }); return { b, turn: 3 - s.turn, ev: f.length >= 4 || CORNERS.has(m) ? 'big' : 'move' }; },
  result: (s) => { if (REVERSI.legal(s).length) return null; const a = s.b.filter((v) => v === 1).length; const z = s.b.filter((v) => v === 2).length; return a === z ? 0 : a > z ? 1 : 2; },
  score: (b) => b.reduce((v, x, i) => v + (x === 2 ? 1 : x === 1 ? -1 : 0) * (CORNERS.has(i) ? 8 : 1), 0),
  depth: (lv) => Math.min(4, 1 + Math.ceil(lv / 3)),
  info: (b, side) => `${b.filter((v) => v === side).length} discs`,
  Board: ({ g, legal, onMove }) => <Stones g={g} legal={legal} onMove={onMove} n={8} dot colors={{ bg: '#052e16', cell: 'linear-gradient(145deg,#15803d,#166534)', stone: W }} />,
};

// ---------- Gomoku (five in a row) ----------
const near = (b, n) => { const out = []; b.forEach((v, i) => { if (v) return; const r = Math.floor(i / n); const c = i % n; for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) { const y = r + dr; const x = c + dc; if (y >= 0 && y < n && x >= 0 && x < n && b[y * n + x]) { out.push(i); return; } } }); return out.length ? out : [Math.floor(b.length / 2)]; };
export const GOMOKU = {
  id: 'gomoku', title: 'Five in a Row', bot: 3, hint: 'Your turn: place a stone, line up five', sound: 'step',
  colors: [{ name: 'jade', hex: '#34d399' }, { name: 'ruby', hex: '#f43f5e' }], frame: 'linear-gradient(145deg,#92400e,#451a03)',
  init: (lv) => Array((lv <= 15 ? 11 : 13) ** 2).fill(0),
  legal: (s) => s.b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0),
  candidates: (s) => { const n = sideN(s.b); return near(s.b, n).map((m) => { const b = [...s.b]; b[m] = s.turn; return [m, Math.abs(lineScore(b, n, 5))]; }).sort((a, c) => c[1] - a[1]).slice(0, 12).map(([m]) => m); },
  play: (s, m) => { const b = [...s.b]; b[m] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => { const w = lineWinner(s.b, sideN(s.b), 5); return w || (s.b.every(Boolean) ? 0 : null); },
  score: (b) => lineScore(b, sideN(b), 5),
  depth: (lv) => (lv <= 3 ? 1 : 2),
  Board: ({ g, legal, onMove }) => <Stones g={g} legal={legal} onMove={onMove} n={sideN(g.b)} colors={{ bg: '#78350f', cell: '#d6a35c', stone: { 1: 'radial-gradient(circle at 35% 30%, #d1fae5, #10b981 50%, #064e3b)', 2: 'radial-gradient(circle at 35% 30%, #ffe4e6, #e11d48 50%, #4c0519)' } }} />,
};

// ---------- Tic Tac Toe Showdown (board grows with level) ----------
const tttK = (n) => (n === 3 ? 3 : 4);
export const TICTACTOE = {
  id: 'tictactoe', title: 'Tic Tac Toe Showdown', bot: 0, hint: 'Your turn: you are X, line them up', sound: 'pop',
  colors: [{ name: 'X', hex: '#38bdf8' }, { name: 'O', hex: '#fb923c' }],
  init: (lv) => Array((lv <= 5 ? 3 : lv <= 15 ? 4 : 5) ** 2).fill(0),
  legal: (s) => s.b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0),
  play: (s, m) => { const b = [...s.b]; b[m] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => { const n = sideN(s.b); const w = lineWinner(s.b, n, tttK(n)); return w || (s.b.every(Boolean) ? 0 : null); },
  score: (b) => lineScore(b, sideN(b), tttK(sideN(b))),
  candidates: (s) => { const n = sideN(s.b); const all = TICTACTOE.legal(s); if (n === 3) return all; return near(s.b, n).map((m) => { const b = [...s.b]; b[m] = s.turn; return [m, Math.abs(lineScore(b, n, tttK(n)))]; }).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([m]) => m); },
  depth: (lv) => (lv <= 2 ? 2 : lv <= 5 ? 4 : 3),
  Board: ({ g, onMove }) => { const n = sideN(g.b); return (
    <div className="grid aspect-square gap-2 rounded-xl bg-black/40 p-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
      {g.b.map((v, i) => <button key={i} type="button" onClick={() => onMove(i)} className="flex items-center justify-center rounded-xl bg-white/10 font-display font-black" style={{ fontSize: `${12 / n}rem`, color: v === 1 ? '#38bdf8' : '#fb923c', textShadow: `0 0 18px ${v === 1 ? '#38bdf8' : '#fb923c'}` }} data-testid={`duel-cell-${i}`}>{v ? <span key={v} className="pty-new">{v === 1 ? 'X' : 'O'}</span> : ''}</button>)}
    </div>); },
};

// ---------- Mancala (Kalah rules) ----------
const own = (side) => (side === 1 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
const store = (side) => (side === 1 ? 6 : 13);
export const MANCALA = {
  id: 'mancala', title: 'Mancala', bot: 2, hint: 'Your turn: tap one of your bottom pits', sound: 'step',
  colors: [{ name: 'bottom', hex: '#22d3ee' }, { name: 'top', hex: '#f472b6' }], frame: 'linear-gradient(145deg,#7c2d12,#431407)',
  init: (lv) => { const k = lv <= 5 ? 3 : 4; return [k, k, k, k, k, k, 0, k, k, k, k, k, k, 0]; },
  legal: (s) => own(s.turn).filter((i) => s.b[i] > 0),
  play: (s, m) => {
    const b = [...s.b]; let seeds = b[m]; b[m] = 0; let i = m;
    while (seeds) { i = (i + 1) % 14; if (i === store(3 - s.turn)) continue; b[i] += 1; seeds -= 1; }
    let ev = 'move'; let turn = 3 - s.turn;
    if (i === store(s.turn)) { turn = s.turn; ev = 'extra'; } else if (own(s.turn).includes(i) && b[i] === 1 && b[12 - i] > 0) { b[store(s.turn)] += b[12 - i] + 1; b[12 - i] = 0; b[i] = 0; ev = 'big'; }
    if (own(1).every((x) => !b[x]) || own(2).every((x) => !b[x])) [1, 2].forEach((sd) => own(sd).forEach((x) => { b[store(sd)] += b[x]; b[x] = 0; }));
    return { b, turn, ev };
  },
  result: (s) => (MANCALA.legal(s).length ? null : s.b[6] === s.b[13] ? 0 : s.b[6] > s.b[13] ? 1 : 2),
  score: (b) => b[13] - b[6],
  depth: (lv) => Math.min(6, 1 + Math.ceil(lv / 2)),
  info: (b, side) => `${b[store(side)]} gems`,
  Board: ({ g, legal, onMove, mySide }) => {
    const pit = (i) => (
      <button key={i} type="button" onClick={() => onMove(i)} className={`relative flex aspect-square flex-col items-center justify-center rounded-full ${legal.includes(i) ? 'ring-2 ring-amber-300' : ''}`} style={{ background: 'radial-gradient(circle at 50% 35%, #2a1206, #7c2d12)', boxShadow: 'inset 0 6px 10px rgba(0,0,0,0.7)' }} data-testid={`duel-cell-${i}`}>
        <span className="flex flex-wrap justify-center gap-[2px] px-1">{Array.from({ length: Math.min(g.b[i], 12) }, (_, k) => <span key={k} className="h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" style={{ background: ['#22d3ee', '#f472b6', '#facc15', '#a3e635'][k % 4], boxShadow: '0 0 4px #fff8' }} />)}</span>
        <span className="text-[10px] font-black text-white">{g.b[i]}</span>
      </button>);
    const top = mySide === 1 ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0]; const bottom = mySide === 1 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
    const st = (i) => <div className="flex w-[13%] flex-col items-center justify-center rounded-full py-3" style={{ background: 'radial-gradient(circle, #2a1206, #7c2d12)', boxShadow: 'inset 0 6px 10px rgba(0,0,0,0.7)' }}><span className="font-display text-xl font-black text-amber-300">{g.b[i]}</span></div>;
    return <div className="flex items-stretch gap-1.5">{st(mySide === 1 ? 13 : 6)}<div className="flex-1 space-y-1.5"><div className="grid grid-cols-6 gap-1.5">{top.map(pit)}</div><div className="grid grid-cols-6 gap-1.5">{bottom.map(pit)}</div></div>{st(mySide === 1 ? 6 : 13)}</div>;
  },
};

export const DUELS = { pty_reversi: REVERSI, pty_gomoku: GOMOKU, pty_tictactoe: TICTACTOE, pty_mancala: MANCALA };
export const duelRender = (def) => (config, onComplete, online) => <DuelGame def={def} config={config} onComplete={onComplete} online={online} />;
