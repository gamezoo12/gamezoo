import { useState } from 'react';
import { sfx } from './kit';

// More 2-player games on the duel engine. Moves: placement = 9900 + cell, movement = from * 100 + to.
const P = 9900;
const nOf = (b) => Math.round(Math.sqrt(b.length));
const adj = (i, n, diag = true) => { const r = Math.floor(i / n); const c = i % n; const out = []; for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) { if ((!dr && !dc) || (!diag && dr && dc)) continue; const y = r + dr; const x = c + dc; if (y >= 0 && y < n && x >= 0 && x < n) out.push(y * n + x); } return out; };
const PIECE = { 1: 'radial-gradient(circle at 35% 30%, #e0f2fe, #0ea5e9 50%, #0c4a6e)', 2: 'radial-gradient(circle at 35% 30%, #ffe4e6, #f43f5e 50%, #4c0519)' };

// Generic tap board: tap a piece then a target, or tap a cell to place.
function PickBoard({ g, legal, onMove, view, cols, dark = '#1e1b4b', light = '#312e81' }) {
  const [sel, setSel] = useState(null);
  const n = cols || nOf(g.b);
  const targets = new Set(legal.filter((m) => Math.floor(m / 100) === sel).map((m) => m % 100));
  const froms = new Set(legal.filter((m) => m < P).map((m) => Math.floor(m / 100)));
  const tap = (i) => {
    if (legal.includes(P + i)) { onMove(P + i); setSel(null); return; }
    if (sel != null && targets.has(i)) { onMove(sel * 100 + i); setSel(null); return; }
    if (froms.has(i)) { setSel(i); sfx('step'); } else sfx('bad');
  };
  return (
    <div className="grid aspect-square gap-[3px] rounded-lg bg-black/40 p-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
      {g.b.map((v, i) => (
        <button key={i} type="button" onClick={() => tap(i)} className="relative flex items-center justify-center rounded-md" style={{ background: v === -1 ? '#0b0b12' : (Math.floor(i / n) + i) % 2 ? dark : light }} data-testid={`duel-cell-${i}`}>
          {view(v, i, g)}
          {(targets.has(i) || legal.includes(P + i)) && <span className="absolute h-1/4 w-1/4 animate-pulse rounded-full bg-emerald-300/80" />}
          {sel === i && <span className="absolute inset-0 rounded-md ring-4 ring-amber-300" />}
          {g.last != null && g.last % 100 === i && <span className="absolute inset-0 rounded-md ring-2 ring-white/50" />}
        </button>
      ))}
    </div>
  );
}
const stone = (v) => (v === 1 || v === 2 ? <span key={v} className="pty-new absolute inset-[12%] rounded-full" style={{ background: PIECE[v], boxShadow: '0 3px 5px rgba(0,0,0,0.5)' }} /> : null);
const base = (o) => ({ colors: [{ name: 'blue', hex: '#0ea5e9' }, { name: 'red', hex: '#f43f5e' }], sound: 'step', ...o });

// ---------- Isolation: move like a king; every square you leave crumbles. Trap the rival. ----------
const isoLegal = (s) => { const at = s.b.indexOf(s.turn); return adj(at, nOf(s.b)).filter((i) => s.b[i] === 0).map((i) => at * 100 + i); };
export const ISOLATION = base({
  id: 'isolation', title: 'Isolation', bot: 1, noPass: true, hint: 'Your turn: tap your piece, then a green square',
  init: (lv) => { const n = lv <= 10 ? 6 : 7; const b = Array(n * n).fill(0); b[n * (n - 1)] = 1; b[n - 1] = 2; return b; },
  legal: isoLegal,
  play: (s, m) => { const b = [...s.b]; b[Math.floor(m / 100)] = -1; b[m % 100] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => (isoLegal(s).length ? null : 3 - s.turn),
  score: (b) => { const n = nOf(b); const mob = (side) => adj(b.indexOf(side), n).filter((i) => b[i] === 0).length; return mob(2) * 1.5 - mob(1) * 2; },
  depth: (lv) => Math.min(6, 2 + Math.ceil(lv / 2)),
  Board: (p) => <PickBoard {...p} view={(v) => (v > 0 ? <span className="pty-new absolute inset-[10%] flex items-center justify-center rounded-full text-xl" style={{ background: PIECE[v] }}>{v === 1 ? '♔' : '♚'}</span> : null)} />,
});

// ---------- Breakthrough: pawns march forward; reach the far row or capture everything. ----------
const btLegal = (s) => { const n = nOf(s.b); const dir = s.turn === 1 ? -1 : 1; const out = []; s.b.forEach((v, i) => { if (v !== s.turn) return; const r = Math.floor(i / n) + dir; const c = i % n; if (r < 0 || r >= n) return; [-1, 0, 1].forEach((dc) => { const x = c + dc; if (x < 0 || x >= n) return; const t = r * n + x; if (s.b[t] === 0 || (dc && s.b[t] === 3 - s.turn)) out.push(i * 100 + t); }); }); return out; };
export const BREAKTHROUGH = base({
  id: 'breakthrough', title: 'Breakthrough', bot: 0, noPass: true, hint: 'Your turn: move a blue pawn forward',
  init: (lv) => { const n = lv <= 10 ? 6 : 7; return Array.from({ length: n * n }, (_, i) => (i < n * 2 ? 2 : i >= n * (n - 2) ? 1 : 0)); },
  legal: btLegal,
  play: (s, m) => { const b = [...s.b]; const cap = b[m % 100] !== 0; b[m % 100] = s.turn; b[Math.floor(m / 100)] = 0; return { b, turn: 3 - s.turn, ev: cap ? 'big' : 'move' }; },
  result: (s) => { const n = nOf(s.b); if (s.b.slice(0, n).includes(1)) return 1; if (s.b.slice(-n).includes(2)) return 2; if (!s.b.includes(1)) return 2; if (!s.b.includes(2)) return 1; return btLegal(s).length ? null : 3 - s.turn; },
  score: (b) => { const n = nOf(b); return b.reduce((v, x, i) => v + (x === 2 ? 1 + Math.floor(i / n) * 0.3 : x === 1 ? -1 - (n - 1 - Math.floor(i / n)) * 0.3 : 0), 0); },
  depth: (lv) => Math.min(4, 1 + Math.ceil(lv / 3)),
  Board: (p) => <PickBoard {...p} dark="#3f3f46" light="#a1a1aa" view={(v) => (v > 0 ? <span className="pty-new absolute inset-[14%] flex items-center justify-center rounded-full text-lg text-white" style={{ background: PIECE[v] }}>♟</span> : null)} />,
});

// ---------- Domineering: you place vertical dominoes, the bot horizontal. No room = you lose. ----------
const domLegal = (s) => { const n = nOf(s.b); return s.b.map((v, i) => { if (v) return -1; const r = Math.floor(i / n); const c = i % n; if (s.turn === 1) return r + 1 < n && !s.b[i + n] ? P + i : -1; return c + 1 < n && !s.b[i + 1] ? P + i : -1; }).filter((m) => m >= 0); };
export const DOMINEERING = base({
  id: 'domineering', title: 'Domino Duel', bot: 2, noPass: true, hint: 'Your turn: tap the top square of a vertical domino', sound: 'drop',
  init: (lv) => Array((lv <= 10 ? 6 : 7) ** 2).fill(0),
  legal: domLegal,
  play: (s, m) => { const n = nOf(s.b); const i = m - P; const b = [...s.b]; b[i] = s.turn; b[s.turn === 1 ? i + n : i + 1] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => (domLegal(s).length ? null : 3 - s.turn),
  score: (b) => domLegal({ b, turn: 2 }).length - domLegal({ b, turn: 1 }).length,
  depth: (lv) => Math.min(3, 1 + Math.ceil(lv / 3)),
  Board: (p) => <PickBoard {...p} view={(v) => (v > 0 ? <span className="pty-new absolute inset-[6%] rounded-md" style={{ background: PIECE[v] }} /> : null)} />,
});

// ---------- Clobber: move onto a neighbouring enemy stone to capture it. Last to move wins. ----------
const clLegal = (s) => { const n = nOf(s.b); const out = []; s.b.forEach((v, i) => { if (v === s.turn) adj(i, n, false).forEach((t) => { if (s.b[t] === 3 - s.turn) out.push(i * 100 + t); }); }); return out; };
export const CLOBBER = base({
  id: 'clobber', title: 'Clobber', bot: 3, noPass: true, hint: 'Your turn: tap a blue stone, then an enemy next to it', sound: 'capture',
  init: (lv) => { const n = lv <= 10 ? 5 : 6; return Array.from({ length: n * n }, (_, i) => ((Math.floor(i / n) + i) % 2 ? 2 : 1)); },
  legal: clLegal,
  play: (s, m) => { const b = [...s.b]; b[m % 100] = s.turn; b[Math.floor(m / 100)] = 0; return { b, turn: 3 - s.turn }; },
  result: (s) => (clLegal(s).length ? null : 3 - s.turn),
  score: (b) => clLegal({ b, turn: 2 }).length - clLegal({ b, turn: 1 }).length,
  depth: (lv) => Math.min(4, 1 + Math.ceil(lv / 3)),
  Board: (p) => <PickBoard {...p} view={stone} />,
});

// ---------- Nim: take any number of sticks from one row. Take the last stick to win. ----------
const nimLegal = (s) => s.b.flatMap((k, r) => Array.from({ length: k }, (_, t) => P + r * 10 + t + 1));
export const NIM = base({
  id: 'nim', title: 'Matchstick Nim', bot: 2, noPass: true, hint: 'Your turn: tap a stick to take it and every stick to its right', sound: 'card',
  init: (lv) => (lv <= 5 ? [1, 3, 5] : lv <= 15 ? [2, 3, 5, 6] : [1, 3, 5, 7, 9]),
  legal: nimLegal,
  play: (s, m) => { const r = Math.floor((m - P) / 10); const t = (m - P) % 10; const b = [...s.b]; b[r] -= t; return { b, turn: 3 - s.turn }; },
  result: (s) => (s.b.every((k) => !k) ? 3 - s.turn : null),
  score: (b) => (b.reduce((x, k) => x ^ k, 0) ? -5 : 5),
  depth: (lv) => (lv <= 2 ? 1 : 3),
  Board: ({ g, legal, onMove }) => (
    <div className="space-y-3 rounded-xl bg-black/40 p-4">
      {g.b.map((k, r) => (
        <div key={r} className="flex h-14 items-center justify-center gap-2">
          {Array.from({ length: k }, (_, i) => <button key={i} type="button" onClick={() => legal.includes(P + r * 10 + (k - i)) && onMove(P + r * 10 + (k - i))} className="group relative h-12 w-3 rounded-full bg-gradient-to-b from-amber-200 to-amber-600 transition-transform hover:-translate-y-1" data-testid={`nim-${r}-${i}`}><span className="absolute -top-1.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-gradient-to-b from-rose-400 to-red-700 shadow-[0_0_8px_#f43f5e]" /></button>)}
          {!k && <span className="text-xs text-white/40">empty</span>}
        </div>
      ))}
    </div>
  ),
});

// ---------- Hex: blue links top to bottom, red links left to right. No draws. ----------
const hexN = (i, n) => { const r = Math.floor(i / n); const c = i % n; return [[r - 1, c], [r - 1, c + 1], [r, c - 1], [r, c + 1], [r + 1, c - 1], [r + 1, c]].filter(([y, x]) => y >= 0 && y < n && x >= 0 && x < n).map(([y, x]) => y * n + x); };
function hexDist(b, side) {
  const n = nOf(b); const dist = Array(b.length).fill(Infinity); const q = [];
  for (let k = 0; k < n; k += 1) { const i = side === 1 ? k : k * n; if (b[i] !== 3 - side) { dist[i] = b[i] === side ? 0 : 1; q.push(i); } }
  while (q.length) { q.sort((a, c) => dist[a] - dist[c]); const i = q.shift(); hexN(i, n).forEach((j) => { if (b[j] === 3 - side) return; const d = dist[i] + (b[j] === side ? 0 : 1); if (d < dist[j]) { dist[j] = d; q.push(j); } }); }
  let best = Infinity; for (let k = 0; k < n; k += 1) best = Math.min(best, dist[side === 1 ? (n - 1) * n + k : k * n + n - 1]); return best;
}
export const HEX = base({
  id: 'hex', title: 'Hex Link', bot: 1, hint: 'Your turn: link the top edge to the bottom edge', sound: 'pop',
  init: (lv) => Array((lv <= 10 ? 6 : 7) ** 2).fill(0),
  legal: (s) => s.b.map((v, i) => (v ? -1 : P + i)).filter((m) => m >= 0),
  candidates: (s) => { const n = nOf(s.b); const all = s.b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0); const nearby = all.filter((i) => hexN(i, n).some((j) => s.b[j])); return (nearby.length ? nearby : all).map((i) => P + i).slice(0, 14); },
  play: (s, m) => { const b = [...s.b]; b[m - P] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => (hexDist(s.b, 1) === 0 ? 1 : hexDist(s.b, 2) === 0 ? 2 : null),
  score: (b) => hexDist(b, 1) - hexDist(b, 2),
  depth: (lv) => (lv <= 3 ? 1 : 2),
  Board: ({ g, legal, onMove }) => { const n = nOf(g.b); return (
    <div className="rounded-xl bg-black/40 p-3" style={{ borderTop: '6px solid #0ea5e9', borderBottom: '6px solid #0ea5e9', borderLeft: '6px solid #f43f5e', borderRight: '6px solid #f43f5e' }}>
      {Array.from({ length: n }, (_, r) => (
        <div key={r} className="flex gap-[3px]" style={{ marginLeft: `${(r * 50) / n}%`, marginTop: r ? -2 : 0 }}>
          {Array.from({ length: n }, (_, c) => { const i = r * n + c; const v = g.b[i]; return <button key={c} type="button" onClick={() => legal.includes(P + i) && onMove(P + i)} className="relative aspect-square" style={{ width: `${100 / (n * 1.5)}%`, clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)', background: v ? PIECE[v] : g.last === P + i ? '#64748b' : '#334155' }} data-testid={`duel-cell-${i}`} />; })}
        </div>
      ))}
    </div>); },
});

// ---------- Treblecross: both play X on one strip. Whoever makes three in a row wins. ----------
const tcLegal = (s) => s.b.map((v, i) => (v ? -1 : P + i)).filter((m) => m >= 0);
const tcWin = (b) => b.some((v, i) => v && b[i + 1] && b[i + 2]);
export const TREBLECROSS = base({
  id: 'treblecross', title: 'Treblecross', bot: 0, noPass: true, hint: 'Your turn: place an X, avoid setting up the rival', sound: 'pop',
  init: (lv) => Array(lv <= 5 ? 9 : lv <= 15 ? 12 : 15).fill(0),
  legal: tcLegal,
  play: (s, m) => { const b = [...s.b]; b[m - P] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => (tcWin(s.b) ? 3 - s.turn : s.b.every(Boolean) ? 0 : null),
  score: (b) => { let danger = 0; b.forEach((v, i) => { if (!v && (b[i - 1] && b[i - 2] || b[i + 1] && b[i + 2] || b[i - 1] && b[i + 1])) danger += 1; }); return danger % 2 ? 3 : -3; },
  depth: (lv) => (lv <= 2 ? 2 : 4),
  Board: ({ g, legal, onMove }) => (
    <div className="grid gap-1.5 rounded-xl bg-black/40 p-3" style={{ gridTemplateColumns: `repeat(${Math.min(g.b.length, 8)}, minmax(0,1fr))` }}>
      {g.b.map((v, i) => <button key={i} type="button" onClick={() => legal.includes(P + i) && onMove(P + i)} className="flex aspect-square items-center justify-center rounded-xl bg-white/10 font-display text-3xl font-black" style={{ color: v === 1 ? '#38bdf8' : '#fb7185', textShadow: '0 0 14px currentColor' }} data-testid={`duel-cell-${i}`}>{v ? <span className="pty-new">X</span> : <span className="text-xs text-white/30">{i + 1}</span>}</button>)}
    </div>),
});

// ---------- Three Men's Morris: place 3 pieces each, then slide them. Three in a row wins. ----------
const L3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const mmWin = (b) => { for (const l of L3) if (b[l[0]] && l.every((i) => b[i] === b[l[0]])) return b[l[0]]; return null; };
const mmLegal = (s) => { const mine = s.b.filter((v) => v === s.turn).length; if (mine < 3) return s.b.map((v, i) => (v ? -1 : P + i)).filter((m) => m >= 0); const out = []; s.b.forEach((v, i) => { if (v === s.turn) adj(i, 3, i % 2 === 0).forEach((t) => { if (!s.b[t]) out.push(i * 100 + t); }); }); return out; };
export const MORRIS = base({
  id: 'morris', title: "Three Men's Morris", bot: 2, noPass: true, hint: 'Your turn: place or slide a piece to make three in a row',
  init: () => Array(9).fill(0),
  legal: mmLegal,
  play: (s, m) => { const b = [...s.b]; if (m >= P) b[m - P] = s.turn; else { b[m % 100] = s.turn; b[Math.floor(m / 100)] = 0; } return { b, turn: 3 - s.turn }; },
  result: (s) => mmWin(s.b) || (mmLegal(s).length ? null : 3 - s.turn),
  score: (b) => L3.reduce((v, l) => { const a = l.filter((i) => b[i] === 2).length; const h = l.filter((i) => b[i] === 1).length; return v + (h ? 0 : a * a) - (a ? 0 : h * h); }, 0),
  depth: (lv) => Math.min(6, 2 + lv),
  Board: (p) => <PickBoard {...p} dark="#57534e" light="#78716c" view={stone} />,
});

// ---------- Fox & Hounds: your 4 hounds must trap the fox before it slips past them. ----------
const fhLegal = (s) => { const out = []; s.b.forEach((v, i) => { if (v !== s.turn) return; const r = Math.floor(i / 8); const c = i % 8; (s.turn === 1 ? [-1] : [-1, 1]).forEach((dr) => [-1, 1].forEach((dc) => { const y = r + dr; const x = c + dc; if (y >= 0 && y < 8 && x >= 0 && x < 8 && !s.b[y * 8 + x]) out.push(i * 100 + y * 8 + x); })); }); return out; };
export const FOXHOUNDS = base({
  id: 'foxhounds', title: 'Fox & Hounds', bot: 1, noPass: true, hint: 'Your turn: move a hound diagonally up to trap the fox',
  colors: [{ name: 'hounds', hex: '#0ea5e9' }, { name: 'fox', hex: '#f97316' }],
  init: () => { const b = Array(64).fill(0); [57, 59, 61, 63].forEach((i) => { b[i] = 1; }); b[4] = 2; return b; },
  legal: fhLegal,
  play: (s, m) => { const b = [...s.b]; b[m % 100] = s.turn; b[Math.floor(m / 100)] = 0; return { b, turn: 3 - s.turn }; },
  result: (s) => { const fox = s.b.indexOf(2); const houndRows = s.b.map((v, i) => (v === 1 ? Math.floor(i / 8) : -1)).filter((r) => r >= 0); if (Math.floor(fox / 8) >= Math.max(...houndRows)) return 2; return fhLegal(s).length ? null : 3 - s.turn; },
  score: (b) => { const fox = b.indexOf(2); return Math.floor(fox / 8) * 2 + fhLegal({ b, turn: 2 }).length * 3; },
  depth: (lv) => Math.min(6, 2 + Math.ceil(lv / 2)),
  Board: (p) => <PickBoard {...p} dark="#7c2d12" light="#fde68a" view={(v) => (v > 0 ? <span className="pty-new absolute inset-[8%] flex items-center justify-center rounded-full text-2xl" style={{ background: v === 1 ? PIECE[1] : 'radial-gradient(circle at 35% 30%, #ffedd5, #f97316 50%, #7c2d12)' }}>{v === 1 ? '🐕' : '🦊'}</span> : null)} />,
});

export const DUELS2 = { pty_morris: MORRIS, pty_fox_hounds: FOXHOUNDS, pty_isolation: ISOLATION, pty_breakthrough: BREAKTHROUGH, pty_domineering: DOMINEERING, pty_clobber: CLOBBER, pty_nim: NIM, pty_hex: HEX, pty_treblecross: TREBLECROSS };
