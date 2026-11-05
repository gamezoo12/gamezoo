import { useState } from 'react';

// Small shared helpers for the batch-built duel and solo games.
export const rnd = (k) => Math.floor(Math.random() * k);
export const pickOne = (a) => a[rnd(a.length)];
export const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i -= 1) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
export const K = 1000;
export const C2 = [{ name: 'blue', hex: '#0ea5e9' }, { name: 'red', hex: '#f43f5e' }];
export const duelDef = (o) => ({ colors: C2, sound: 'drop', noPass: true, depth: (lv) => (lv <= 3 ? 2 : lv <= 7 ? 3 : 4), score: () => 0, ...o });
export const stuckLoses = (legalFn) => (s) => (legalFn(s).length ? null : 3 - s.turn);
// Exact-theory games: player to move is losing -> bad for them.
export const perfect = (s, moverLoses) => ((s.turn === 2) === moverLoses ? -100 : 100);
export const xorAll = (a) => a.reduce((x, v) => x ^ v, 0);
export const countOf = (b, v) => b.reduce((t, x) => t + (x === v ? 1 : 0), 0);
export const STONE = { 1: 'radial-gradient(circle at 35% 30%, #e0f2fe, #0ea5e9 45%, #0c4a6e)', 2: 'radial-gradient(circle at 35% 30%, #ffe4e6, #f43f5e 45%, #881337)' };
export const Stone = ({ side, cls = 'inset-[12%]', last, children }) => (
  <span className={`pty-new absolute flex items-center justify-center rounded-full text-white ${cls} ${last ? 'ring-2 ring-amber-300' : ''}`} style={{ background: STONE[side], boxShadow: '0 3px 5px rgba(0,0,0,0.5)' }}>{children}</span>
);
export const Glow = () => <span className="absolute inset-[34%] animate-pulse rounded-full bg-amber-300/80" />;

export const rc = (i, C) => [Math.floor(i / C), i % C];
export const nbrs = (i, R, C, dirs) => { const [r, c] = rc(i, C); return dirs.map(([dr, dc]) => [r + dr, c + dc]).filter(([y, x]) => y >= 0 && y < R && x >= 0 && x < C).map(([y, x]) => y * C + x); };
export const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const D8 = [...D4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

const winCache = {};
export function windows(R, C, k) {
  const key = `${R}-${C}-${k}`; if (winCache[key]) return winCache[key];
  const out = [];
  for (let r = 0; r < R; r += 1) for (let c = 0; c < C; c += 1) [[0, 1], [1, 0], [1, 1], [1, -1]].forEach(([dr, dc]) => {
    const cells = Array.from({ length: k }, (_, i) => [r + dr * i, c + dc * i]);
    if (cells.every(([a, b]) => a >= 0 && a < R && b >= 0 && b < C)) out.push(cells.map(([a, b]) => a * C + b));
  });
  winCache[key] = out; return out;
}
export const lineOwner = (b, R, C, k) => { for (const w of windows(R, C, k)) { const v = b[w[0]]; if (v && w.every((i) => b[i] === v)) return v; } return 0; };
export const lineHeur = (b, R, C, k) => windows(R, C, k).reduce((t, w) => { let a = 0; let h = 0; w.forEach((i) => { if (b[i] === 2) a += 1; else if (b[i] === 1) h += 1; }); if (a && h) return t; return t + (a ? 4 ** a : 0) - (h ? 4 ** h * 1.2 : 0); }, 0);

export function Cells({ cols, cells, onCell, render, cellCls, gap = 'gap-1', testid = 'duel-cell' }) {
  return (
    <div className={`grid ${gap}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {cells.map((v, i) => (
        <button key={i} type="button" onClick={() => onCell(i)} className={`relative flex aspect-square items-center justify-center rounded-md transition-colors duration-200 ${cellCls ? cellCls(v, i) : 'bg-white/10'}`} data-testid={`${testid}-${i}`}>{render(v, i)}</button>
      ))}
    </div>
  );
}
// Two-tap moves encoded as (from + off) * K + to.
export function usePick(legal, onMove, off = 0) {
  const [sel, setSel] = useState(null);
  const picks = legal.filter((m) => m >= off * K);
  const src = new Set(picks.map((m) => Math.floor(m / K) - off));
  const tg = new Set(sel == null ? [] : picks.filter((m) => Math.floor(m / K) - off === sel).map((m) => m % K));
  const tap = (i) => { if (sel != null && tg.has(i)) { setSel(null); onMove((sel + off) * K + i); } else setSel(src.has(i) ? i : null); };
  return { sel, tg, src, tap };
}
export const NumBtns = ({ items, onPick, testid }) => (
  <div className="mt-3 flex flex-wrap justify-center gap-2">{items.map(([label, m]) => <button key={m} type="button" onClick={() => onPick(m)} className="h-10 min-w-[3rem] rounded-full bg-gradient-to-b from-amber-300 to-amber-500 px-3 text-sm font-black text-slate-900 shadow-[0_3px_0_#92400e] transition-transform active:translate-y-0.5" data-testid={`${testid}-${m}`}>{label}</button>)}</div>
);
export const Coins = ({ n, color = '#facc15' }) => (
  <div className="flex flex-wrap justify-center gap-1 rounded-xl bg-black/40 p-3">{Array.from({ length: n }, (_, i) => <span key={i} className="pty-new h-6 w-6 rounded-full border-2 border-amber-700" style={{ background: `radial-gradient(circle at 35% 30%, #fff7, ${color} 50%, #a16207)` }} />)}</div>
);
export const Big = ({ children, testid }) => <p className="text-center font-display text-5xl font-black text-white drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]" data-testid={testid}>{children}</p>;
