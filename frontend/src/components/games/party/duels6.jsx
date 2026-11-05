import { useState } from 'react';
import { Big, Cells, D8, Glow, K, NumBtns, Stone, countOf, duelDef, lineHeur, lineOwner, nbrs, perfect, rc, rnd, shuffle, usePick, windows, xorAll } from './gkit';

// Batch 6 duels: placement-then-move games, sowing, dominoes and more.
const sq = (b) => Math.round(Math.sqrt(b.length));

// ---------- Teeko & Achi: place pieces, then slide them ----------
const TEEKO_SQ = []; for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) TEEKO_SQ.push([r * 5 + c, r * 5 + c + 1, r * 5 + c + 5, r * 5 + c + 6]);
const teekoWin = (c) => { const w = lineOwner(c, 5, 5, 4); if (w) return w; for (const q of TEEKO_SQ) { const v = c[q[0]]; if (v && q.every((i) => c[i] === v)) return v; } return 0; };
const ACHI_ADJ = [[1, 3, 4], [0, 2, 4], [1, 5, 4], [0, 6, 4], [0, 1, 2, 3, 5, 6, 7, 8], [2, 8, 4], [3, 7, 4], [6, 8, 4], [7, 5, 4]];
const placeMove = ({ per, adj }) => (s) => { const { c, ply } = s.b; if (ply < per * 2) return c.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0); return c.flatMap((v, i) => (v === s.turn ? adj(i).filter((j) => !c[j]).map((j) => (i + 1) * K + j) : [])); };
const placePlay = (s, m) => { const c = [...s.b.c]; if (m < K) c[m] = s.turn; else { c[m % K] = s.turn; c[Math.floor(m / K) - 1] = 0; } return { b: { c, ply: s.b.ply + 1 }, turn: 3 - s.turn, snd: m < K ? 'drop' : 'slide' }; };
function PlaceBoard({ g, legal, onMove, cols }) {
  const { sel, tg, tap } = usePick(legal, onMove, 1);
  return <Cells cols={cols} cells={g.b.c} onCell={(i) => (legal.includes(i) ? onMove(i) : tap(i))} cellCls={(v, i) => (sel === i ? 'bg-amber-400/80 rounded-full' : 'rounded-full bg-amber-950/50 shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]')} render={(v, i) => <>{v ? <Stone side={v} cls="inset-[10%]" last={g.last != null && g.last % K === i} /> : null}{tg.has(i) && <Glow />}</>} />;
}
const teekoMoves = placeMove({ per: 4, adj: (i) => nbrs(i, 5, 5, D8) });
export const TEEKO = duelDef({
  id: 'teeko', title: 'Teeko', bot: 0, hint: 'Place 4 pieces, then slide one step. Make 4 in a row or a 2×2 square',
  init: () => ({ c: Array(25).fill(0), ply: 0 }), legal: teekoMoves, play: placePlay,
  result: (s) => teekoWin(s.b.c) || (s.b.ply >= 80 ? 0 : teekoMoves(s).length ? null : 3 - s.turn),
  score: (b) => lineHeur(b.c, 5, 5, 4) + TEEKO_SQ.reduce((t, q) => { const a = q.filter((i) => b.c[i] === 2).length; const h = q.filter((i) => b.c[i] === 1).length; return a && h ? t : t + (a ? 4 ** a : 0) - (h ? 4 ** h * 1.2 : 0); }, 0),
  depth: (lv) => (lv <= 5 ? 2 : 3), Board: (p) => <PlaceBoard {...p} cols={5} />,
});
const achiMoves = placeMove({ per: 4, adj: (i) => ACHI_ADJ[i] });
export const ACHI = duelDef({
  id: 'achi', title: 'Achi', bot: 2, hint: 'Place 4 pieces, then slide along a line into the gap. Three in a row wins',
  init: () => ({ c: Array(9).fill(0), ply: 0 }), legal: achiMoves, play: placePlay,
  result: (s) => lineOwner(s.b.c, 3, 3, 3) || (s.b.ply >= 70 ? 0 : achiMoves(s).length ? null : 3 - s.turn),
  score: (b) => lineHeur(b.c, 3, 3, 3), depth: (lv) => (lv <= 3 ? 2 : 6), Board: (p) => <PlaceBoard {...p} cols={3} />,
});

// ---------- Corner Race (mini Halma) ----------
const CR_N = 6;
const zone = (side) => [...Array(CR_N * CR_N).keys()].filter((i) => { const [r, c] = rc(i, CR_N); return side === 1 ? CR_N - 1 - r + c <= 2 : r + CR_N - 1 - c <= 2; });
const Z1 = zone(1); const Z2 = zone(2);
const crMoves = (c, side) => { const o = []; c.forEach((v, i) => { if (v !== side) return; const seen = new Set(); nbrs(i, CR_N, CR_N, D8).forEach((j) => { if (!c[j]) seen.add(j); }); const q = [i]; const hop = new Set([i]); while (q.length) { const x = q.pop(); const [r, cc] = rc(x, CR_N); D8.forEach(([dr, dc]) => { const my = r + dr; const mx = cc + dc; const y = r + 2 * dr; const z = cc + 2 * dc; if (y < 0 || y >= CR_N || z < 0 || z >= CR_N) return; const t = y * CR_N + z; if (c[my * CR_N + mx] && !c[t] && !hop.has(t)) { hop.add(t); seen.add(t); q.push(t); } }); } seen.forEach((t) => o.push(i * K + t)); }); return o; };
const crDist = (c, side) => c.reduce((t, v, i) => { if (v !== side) return t; const [r, x] = rc(i, CR_N); return t + (side === 1 ? Math.max(r, CR_N - 1 - x) : Math.max(CR_N - 1 - r, x)); }, 0);
export const CORNERRACE = duelDef({
  id: 'cornerrace', title: 'Corner Race', bot: 3, hint: 'Your turn: step or hop (chains allowed). Move all 6 into the far corner',
  init: () => { const c = Array(CR_N * CR_N).fill(0); Z1.forEach((i) => { c[i] = 1; }); Z2.forEach((i) => { c[i] = 2; }); return { c, ply: 0 }; },
  legal: (s) => crMoves(s.b.c, s.turn),
  play: (s, m) => { const c = [...s.b.c]; const f = Math.floor(m / K); const t = m % K; c[t] = c[f]; c[f] = 0; return { b: { c, ply: s.b.ply + 1 }, turn: 3 - s.turn, snd: cheb2(f, t) > 1 ? 'ladder' : 'step' }; },
  result: (s) => { if (Z2.every((i) => s.b.c[i] === 1)) return 1; if (Z1.every((i) => s.b.c[i] === 2)) return 2; if (s.b.ply >= 200) { const a = crDist(s.b.c, 1); const z = crDist(s.b.c, 2); return a < z ? 1 : z < a ? 2 : 0; } return null; },
  score: (b) => crDist(b.c, 1) - crDist(b.c, 2), depth: (lv) => (lv <= 3 ? 1 : 2), noPass: false,
  info: (b, side) => `${(side === 1 ? Z2 : Z1).filter((i) => b.c[i] === side).length}/6 home`,
  Board: ({ g, legal, onMove }) => { const { sel, tg, tap } = usePick(legal, onMove); return <Cells cols={CR_N} cells={g.b.c} onCell={tap} cellCls={(v, i) => (sel === i ? 'bg-amber-400' : Z2.includes(i) ? 'bg-sky-900/70' : Z1.includes(i) ? 'bg-rose-900/70' : 'bg-white/10')} render={(v, i) => <>{v ? <Stone side={v} cls="inset-[12%]" /> : null}{tg.has(i) && <Glow />}</>} />; },
});
const cheb2 = (a, b) => { const [r1, c1] = rc(a, CR_N); const [r2, c2] = rc(b, CR_N); return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)); };

// ---------- Euclid's Duel ----------
const euWin = (a, b) => { if (a < b) [a, b] = [b, a]; if (b === 0) return false; if (a >= 2 * b || a % b === 0) return true; return !euWin(b, a - b); };
export const EUCLID = duelDef({
  id: 'euclid', title: "Euclid's Duel", bot: 1, hint: 'Your turn: take a multiple of the small number from the big one. Make a 0 to win', sound: 'chime',
  init: (lv) => { const a = 20 + rnd(40) + (lv > 10 ? 40 : 0); return { a, z: 3 + rnd(a - 4) }; },
  legal: (s) => { const lo = Math.min(s.b.a, s.b.z); const hi = Math.max(s.b.a, s.b.z); return Array.from({ length: Math.floor(hi / lo) }, (_, k) => k + 1); },
  play: (s, m) => { const lo = Math.min(s.b.a, s.b.z); const hi = Math.max(s.b.a, s.b.z); return { b: { a: hi - m * lo, z: lo }, turn: 3 - s.turn }; },
  result: (s) => (s.b.a === 0 || s.b.z === 0 ? 3 - s.turn : null), score: (b, s) => perfect(s, !euWin(b.a, b.z)), depth: () => 1,
  Board: ({ g, legal, onMove }) => { const lo = Math.min(g.b.a, g.b.z); return <div className="space-y-3 p-3"><div className="flex justify-center gap-6"><Big testid="euclid-a">{Math.max(g.b.a, g.b.z)}</Big><Big testid="euclid-b">{lo}</Big></div><NumBtns items={legal.slice(0, 10).map((k) => [`− ${k * lo}`, k])} onPick={onMove} testid="euclid" /></div>; },
});

// ---------- Staircase Nim ----------
export const STAIRCASE = duelDef({
  id: 'staircase', title: 'Staircase Nim', bot: 2, hint: 'Your turn: tap a coin. It and every coin to its right drop one stair. Last move wins', sound: 'coin',
  init: (lv) => { const S = lv <= 10 ? 4 : lv <= 25 ? 5 : 6; let b; do { b = [0, ...Array.from({ length: S }, () => rnd(5))]; } while (b.slice(1).reduce((x, y) => x + y, 0) < 5); return b; },
  legal: (s) => s.b.flatMap((n, i) => (i ? Array.from({ length: n }, (_, k) => i * 100 + k + 1) : [])),
  play: (s, m) => { const i = Math.floor(m / 100); const k = m % 100; const b = [...s.b]; b[i] -= k; b[i - 1] += k; return { b, turn: 3 - s.turn }; },
  result: (s) => (s.b.slice(1).some(Boolean) ? null : 3 - s.turn), score: (b, s) => perfect(s, xorAll(b.filter((_, i) => i % 2)) === 0), depth: () => 1,
  Board: ({ g, legal, onMove }) => <div className="space-y-1 p-1">{[...g.b.keys()].reverse().map((i) => <div key={i} className="flex items-center gap-1 rounded-lg p-1.5" style={{ marginLeft: `${i * 8}%`, background: i ? 'linear-gradient(90deg,#78350f,#b45309)' : '#14532d' }}><span className="w-12 text-[10px] font-black text-white/80">{i ? `Stair ${i}` : 'Ground'}</span>{Array.from({ length: g.b[i] }, (_, j) => <button key={j} type="button" onClick={() => i && legal.includes(i * 100 + g.b[i] - j) && onMove(i * 100 + g.b[i] - j)} className="pty-new h-7 w-7 rounded-full border-2 border-amber-700" style={{ background: 'radial-gradient(circle at 35% 30%,#fff7,#facc15 50%,#a16207)' }} data-testid={`stair-${i}-${j}`} />)}</div>)}</div>,
});

// ---------- Domino Block ----------
const TILES = []; for (let a = 0; a <= 6; a += 1) for (let b = a; b <= 6; b += 1) TILES.push([a, b]);
const pips = (h) => h.reduce((t, id) => t + TILES[id][0] + TILES[id][1], 0);
const domFor = (b, side) => { const h = b.h[side - 1]; if (!b.ends) return h.map((t) => t * 2); return h.flatMap((t) => { const [x, y] = TILES[t]; const o = []; if (x === b.ends[0] || y === b.ends[0]) o.push(t * 2); if (x === b.ends[1] || y === b.ends[1]) o.push(t * 2 + 1); return o; }); };
const PIP = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const Half = ({ n, sm }) => <span className={`grid grid-cols-3 gap-[1px] ${sm ? 'h-4 w-4 p-[1px]' : 'h-8 w-8 p-1'}`}>{[...Array(9).keys()].map((k) => <span key={k} className={`rounded-full ${PIP[n].includes(k) ? 'bg-slate-900' : ''}`} />)}</span>;
const Tile = ({ t, sm, onClick, hot, testid }) => <button type="button" onClick={onClick} className={`pty-new flex ${sm ? 'flex-row' : 'flex-col'} items-center rounded-md bg-gradient-to-b from-white to-stone-200 shadow-[0_3px_0_#78716c] ${hot ? 'ring-2 ring-amber-400 -translate-y-1' : ''}`} data-testid={testid}><Half n={t[0]} sm={sm} /><span className={sm ? 'h-3 w-[1px] bg-slate-400' : 'h-[1px] w-6 bg-slate-400'} /><Half n={t[1]} sm={sm} /></button>;
export const DOMINOES = duelDef({
  id: 'dominoes', title: 'Domino Block', bot: 2, noPass: false, hint: 'Your turn: tap a glowing domino to match an end of the chain', sound: 'thud',
  init: () => { const d = shuffle([...TILES.keys()]); return { h: [d.slice(0, 7), d.slice(7, 14)], ends: null, line: [] }; },
  legal: (s) => domFor(s.b, s.turn),
  play: (s, m) => { const t = Math.floor(m / 2); const side = m % 2; const [x, y] = TILES[t]; const h = s.b.h.map((hh, i) => (i === s.turn - 1 ? hh.filter((z) => z !== t) : hh)); let ends; let line; if (!s.b.ends) { ends = [x, y]; line = [[x, y]]; } else if (side === 0) { const nx = x === s.b.ends[0] ? y : x; ends = [nx, s.b.ends[1]]; line = [[nx, s.b.ends[0]], ...s.b.line]; } else { const nx = x === s.b.ends[1] ? y : x; ends = [s.b.ends[0], nx]; line = [...s.b.line, [s.b.ends[1], nx]]; } return { b: { h, ends, line }, turn: 3 - s.turn, ev: x === y ? 'big' : 'move' }; },
  result: (s) => { if (!s.b.h[0].length) return 1; if (!s.b.h[1].length) return 2; if (domFor(s.b, 1).length || domFor(s.b, 2).length) return null; const a = pips(s.b.h[0]); const z = pips(s.b.h[1]); return a < z ? 1 : z < a ? 2 : 0; },
  score: (b) => (b.h[0].length - b.h[1].length) * 4 + (pips(b.h[0]) - pips(b.h[1])) * 0.3, depth: (lv) => (lv <= 5 ? 2 : 3),
  info: (b, side) => `${b.h[side - 1].length} tiles`,
  Board: ({ g, legal, onMove, mySide }) => { const [pend, setPend] = useState(null); const mine = g.b.h[mySide - 1]; const theirs = g.b.h[2 - mySide];
    const tap = (t) => { const ms = legal.filter((m) => Math.floor(m / 2) === t); if (!ms.length) return; if (ms.length === 1 || g.b.ends[0] === g.b.ends[1]) { setPend(null); onMove(ms[0]); } else setPend(t); };
    return (<div className="space-y-3 p-1">
      <div className="flex justify-center gap-1">{theirs.map((t) => <span key={t} className="h-10 w-5 rounded-md bg-gradient-to-b from-rose-700 to-rose-900 shadow" />)}</div>
      <div className="flex min-h-[64px] flex-wrap items-center justify-center gap-1 rounded-xl bg-emerald-900/80 p-2" data-testid="domino-line">{g.b.line.length ? g.b.line.map((t, i) => <Tile key={`${i}-${t[0]}-${t[1]}`} t={t} sm />) : <span className="text-xs text-white/60">Play any domino to start</span>}</div>
      {pend != null && <div className="flex justify-center gap-2"><button type="button" onClick={() => { setPend(null); onMove(pend * 2); }} className="rounded-full bg-amber-400 px-4 py-1.5 text-xs font-black text-slate-900" data-testid="domino-left">◀ Left end</button><button type="button" onClick={() => { setPend(null); onMove(pend * 2 + 1); }} className="rounded-full bg-amber-400 px-4 py-1.5 text-xs font-black text-slate-900" data-testid="domino-right">Right end ▶</button></div>}
      <div className="flex flex-wrap justify-center gap-1.5">{mine.map((t) => <Tile key={t} t={TILES[t]} hot={legal.some((m) => Math.floor(m / 2) === t)} onClick={() => tap(t)} testid={`domino-${t}`} />)}</div></div>); },
});

// ---------- Square Hunt ----------
const sqCache = {};
const squaresOf = (n) => { if (sqCache[n]) return sqCache[n]; const o = []; for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) for (let d = 1; r + d < n && c + d < n; d += 1) o.push([r * n + c, r * n + c + d, (r + d) * n + c, (r + d) * n + c + d]); sqCache[n] = o; return o; };
export const SQHUNT = duelDef({
  id: 'sqhunt', title: 'Square Hunt', bot: 3, hint: 'Your turn: claim a dot. Own the 4 corners of any square to win', sound: 'pop',
  init: (lv) => Array((lv <= 10 ? 6 : 7) ** 2).fill(0), legal: (s) => s.b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0),
  play: (s, m) => { const b = [...s.b]; b[m] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => { for (const q of squaresOf(sq(s.b))) { const v = s.b[q[0]]; if (v && q.every((i) => s.b[i] === v)) return v; } return s.b.every(Boolean) ? 0 : null; },
  score: (b) => squaresOf(sq(b)).reduce((t, q) => { const a = q.filter((i) => b[i] === 2).length; const h = q.filter((i) => b[i] === 1).length; return a && h ? t : t + (a ? 4 ** a : 0) - (h ? 4 ** h * 1.1 : 0); }, 0), depth: () => 2,
  Board: ({ g, legal, onMove }) => <Cells cols={sq(g.b)} cells={g.b} gap="gap-2" onCell={(i) => legal.includes(i) && onMove(i)} cellCls={() => 'rounded-full bg-indigo-950/70'} render={(v, i) => (v ? <Stone side={v} cls="inset-[15%]" last={g.last === i} /> : <span className="h-2 w-2 rounded-full bg-white/40" />)} />,
});

// ---------- Knight Trap ----------
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const knMoves = (b, side) => { const n = sq(b.c); const other = b.p[2 - side]; return nbrs(b.p[side - 1], n, n, KN).filter((j) => !b.c[j] && j !== other); };
export const KNIGHTTRAP = duelDef({
  id: 'knighttrap', title: 'Knight Trap', bot: 0, hint: 'Your turn: jump your knight. Every square you leave crumbles. Trap the rival',
  init: (lv) => { const n = lv <= 10 ? 6 : 7; return { c: Array(n * n).fill(0), p: [(n - 1) * n, n - 1] }; },
  legal: (s) => knMoves(s.b, s.turn),
  play: (s, m) => { const c = [...s.b.c]; c[s.b.p[s.turn - 1]] = -1; const p = [...s.b.p]; p[s.turn - 1] = m; return { b: { c, p }, turn: 3 - s.turn, snd: 'thud' }; },
  result: (s) => (knMoves(s.b, s.turn).length ? null : 3 - s.turn), score: (b) => knMoves(b, 2).length - knMoves(b, 1).length, depth: (lv) => (lv <= 3 ? 2 : lv <= 7 ? 4 : 5),
  Board: ({ g, legal, onMove }) => { const n = sq(g.b.c); return <Cells cols={n} cells={g.b.c} gap="gap-0.5" onCell={(i) => legal.includes(i) && onMove(i)} cellCls={(v, i) => (v === -1 ? 'bg-orange-950/40 shadow-[inset_0_0_12px_#ea580c]' : (Math.floor(i / n) + i) % 2 ? 'bg-slate-700' : 'bg-slate-400')} render={(v, i) => <>{g.b.p[0] === i && <span className="pty-new text-3xl text-sky-300 drop-shadow-[0_0_6px_#0ea5e9]">♞</span>}{g.b.p[1] === i && <span className="pty-new text-3xl text-rose-400 drop-shadow-[0_0_6px_#f43f5e]">♞</span>}{legal.includes(i) && <Glow />}</>} />; },
});

// ---------- Oware ----------
const owSow = (p, i) => { const o = [...p]; let k = o[i]; o[i] = 0; let j = i; while (k) { j = (j + 1) % 12; if (j !== i) { o[j] += 1; k -= 1; } } return { o, j }; };
const owRange = (side) => (side === 1 ? [0, 5] : [6, 11]);
const owLegal = (b, side) => { const [a, z] = owRange(side); const [oa, oz] = owRange(3 - side); const opp = b.p.slice(oa, oz + 1).reduce((x, y) => x + y, 0); const ms = []; for (let i = a; i <= z; i += 1) if (b.p[i]) { if (opp || owSow(b.p, i).o.slice(oa, oz + 1).some(Boolean)) ms.push(i); } return ms; };
const owTotals = (b) => [b.st[0] + b.p.slice(0, 6).reduce((x, y) => x + y, 0), b.st[1] + b.p.slice(6).reduce((x, y) => x + y, 0)];
export const OWARE = duelDef({
  id: 'oware', title: 'Oware', bot: 3, hint: 'Your turn: sow a bottom pit. End in a rival pit with 2 or 3 seeds to capture', sound: 'card',
  init: () => ({ p: Array(12).fill(4), st: [0, 0], ply: 0 }), legal: (s) => owLegal(s.b, s.turn),
  play: (s, m) => { const { o, j } = owSow(s.b.p, m); const [oa, oz] = owRange(3 - s.turn); const before = [...o]; let cap = 0; let k = j; while (k >= oa && k <= oz && (o[k] === 2 || o[k] === 3)) { cap += o[k]; o[k] = 0; k -= 1; } let p = o; if (cap && !o.slice(oa, oz + 1).some(Boolean)) { p = before; cap = 0; } const st = [...s.b.st]; st[s.turn - 1] += cap; return { b: { p, st, ply: s.b.ply + 1 }, turn: 3 - s.turn, ev: cap >= 4 ? 'big' : 'move', snd: cap ? 'coin' : 'card' }; },
  result: (s) => { if (s.b.st[0] > 24) return 1; if (s.b.st[1] > 24) return 2; if (s.b.ply < 200 && owLegal(s.b, s.turn).length) return null; const [a, z] = owTotals(s.b); return a > z ? 1 : z > a ? 2 : 0; },
  score: (b) => b.st[1] - b.st[0], depth: (lv) => (lv <= 3 ? 2 : lv <= 7 ? 4 : 5),
  info: (b, side) => `${b.st[side - 1]} seeds`,
  Board: ({ g, legal, onMove }) => { const pit = (i) => <button key={i} type="button" onClick={() => legal.includes(i) && onMove(i)} className={`relative flex aspect-square items-center justify-center rounded-full bg-amber-950 shadow-[inset_0_4px_8px_rgba(0,0,0,0.8)] ${legal.includes(i) ? 'ring-2 ring-amber-300' : ''}`} data-testid={`duel-cell-${i}`}><span className="flex flex-wrap justify-center gap-[2px] p-1">{Array.from({ length: Math.min(g.b.p[i], 12) }, (_, k) => <span key={k} className="h-1.5 w-1.5 rounded-full bg-lime-300" />)}</span><span className="absolute -bottom-1 rounded-full bg-black/70 px-1 text-[9px] font-black text-white">{g.b.p[i]}</span></button>;
    return (<div className="space-y-2 rounded-2xl bg-gradient-to-b from-amber-700 to-amber-900 p-2"><div className="grid grid-cols-6 gap-1.5">{[11, 10, 9, 8, 7, 6].map(pit)}</div><div className="grid grid-cols-6 gap-1.5">{[0, 1, 2, 3, 4, 5].map(pit)}</div></div>); },
});

// ---------- Coin Line ----------
export const COINLINE = duelDef({
  id: 'coinline', title: 'Coin Line', bot: 1, hint: 'Your turn: take the coin from the left or right end. Most value wins', sound: 'coin',
  init: (lv) => { const L = 8 + (lv > 10 ? 2 : 0) + (lv > 25 ? 2 : 0); const v = Array.from({ length: L }, () => 1 + rnd(9)); return { v, lo: 0, hi: L - 1, sc: [0, 0] }; },
  legal: (s) => (s.b.lo > s.b.hi ? [] : s.b.lo === s.b.hi ? [0] : [0, 1]),
  play: (s, m) => { const { v, lo, hi } = s.b; const sc = [...s.b.sc]; sc[s.turn - 1] += m ? v[hi] : v[lo]; return { b: { v, lo: m ? lo : lo + 1, hi: m ? hi - 1 : hi, sc }, turn: 3 - s.turn }; },
  result: (s) => { if (s.b.lo <= s.b.hi) return null; const [a, z] = s.b.sc; return a > z ? 1 : z > a ? 2 : 0; },
  score: (b) => b.sc[1] - b.sc[0], depth: (lv) => (lv <= 3 ? 2 : lv <= 7 ? 6 : 10),
  info: (b, side) => `${b.sc[side - 1]} pts`,
  Board: ({ g, legal, onMove }) => <div className="flex flex-wrap justify-center gap-1.5 rounded-xl bg-black/40 p-3">{g.b.v.map((x, i) => { const live = i >= g.b.lo && i <= g.b.hi; const m = i === g.b.lo ? 0 : i === g.b.hi ? 1 : -1; return <button key={i} type="button" onClick={() => live && legal.includes(m) && onMove(m)} className={`flex h-12 w-12 items-center justify-center rounded-full border-4 font-display text-xl font-black transition-all ${live ? 'border-amber-700 text-amber-950' : 'invisible'} ${live && m >= 0 && legal.length ? 'scale-110 ring-2 ring-white' : ''}`} style={{ background: 'radial-gradient(circle at 35% 30%,#fff8,#facc15 55%,#ca8a04)' }} data-testid={`coin-${i}`}>{x}</button>; })}</div>,
});

export const DUELS6 = { pty_teeko: TEEKO, pty_achi: ACHI, pty_corner_race: CORNERRACE, pty_euclid: EUCLID, pty_staircase: STAIRCASE, pty_dominoes: DOMINOES, pty_square_hunt: SQHUNT, pty_knight_trap: KNIGHTTRAP, pty_oware: OWARE, pty_coin_line: COINLINE };
