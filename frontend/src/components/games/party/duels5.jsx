import { useState } from 'react';
import { Cells, D4, D8, Glow, K, Stone, countOf, duelDef, lineHeur, lineOwner, nbrs, rc, rnd, stuckLoses, usePick, xorAll, perfect } from './gkit';

// Batch 5 duels: movement and capture games.
const sq = (b) => Math.round(Math.sqrt(b.length));
const mob = (fn) => (b) => fn(b, 2).length - fn(b, 1).length;
const MoveBoard = ({ g, legal, onMove, cols, cells, piece, bg }) => {
  const { sel, tg, tap } = usePick(legal, onMove);
  return <Cells cols={cols} cells={cells || g.b} onCell={tap} cellCls={(v, i) => (sel === i ? 'bg-amber-400/80' : bg ? bg(v, i) : (Math.floor(i / cols) + i) % 2 ? 'bg-slate-800' : 'bg-slate-600')} render={(v, i) => <>{piece(v, i)}{tg.has(i) && <Glow />}</>} />;
};

// ---------- Konane ----------
const konMoves = (b, side) => { const n = sq(b); const o = []; b.forEach((v, i) => { if (v !== side) return; const [r, c] = rc(i, n); D4.forEach(([dr, dc]) => { for (let k = 1; ; k += 1) { const y = r + dr * 2 * k; const x = c + dc * 2 * k; const my = r + dr * (2 * k - 1); const mx = c + dc * (2 * k - 1); if (y < 0 || y >= n || x < 0 || x >= n || b[my * n + mx] !== 3 - side || b[y * n + x]) break; o.push(i * K + y * n + x); } }); }); return o; };
export const KONANE = duelDef({
  id: 'konane', title: 'Konane', bot: 2, hint: 'Your turn: jump a blue stone over a red one into a gap (straight lines only)', sound: 'capture',
  init: (lv) => { const n = lv <= 15 ? 6 : 8; const b = Array.from({ length: n * n }, (_, i) => ((Math.floor(i / n) + (i % n)) % 2 ? 2 : 1)); const c = (n / 2 - 1) * n + n / 2 - 1; b[c] = 0; b[c + 1] = 0; return b; },
  legal: (s) => konMoves(s.b, s.turn),
  play: (s, m) => { const n = sq(s.b); const f = Math.floor(m / K); const t = m % K; const b = [...s.b]; const [r1, c1] = rc(f, n); const [r2, c2] = rc(t, n); const dr = Math.sign(r2 - r1); const dc = Math.sign(c2 - c1); let caps = 0; for (let y = r1 + dr, x = c1 + dc; y !== r2 || x !== c2; y += dr, x += dc) if (b[y * n + x]) { b[y * n + x] = 0; caps += 1; } b[f] = 0; b[t] = s.turn; return { b, turn: 3 - s.turn, ev: caps > 1 ? 'big' : 'move' }; },
  result: (s) => (konMoves(s.b, s.turn).length ? null : 3 - s.turn), score: mob(konMoves), depth: (lv) => (lv <= 3 ? 2 : 3),
  info: (b, side) => `${countOf(b, side)} stones`,
  Board: (p) => <MoveBoard {...p} cols={sq(p.g.b)} bg={(v, i) => ((Math.floor(i / sq(p.g.b)) + i) % 2 ? 'bg-amber-900' : 'bg-amber-700')} piece={(v) => (v ? <span className="pty-new absolute inset-[12%] rounded-full" style={{ background: v === 1 ? 'radial-gradient(circle at 35% 30%,#475569,#020617)' : 'radial-gradient(circle at 35% 30%,#fff,#e2e8f0 50%,#94a3b8)' }} /> : null)} />,
  colors: [{ name: 'lava', hex: '#334155' }, { name: 'coral', hex: '#e2e8f0' }],
});

// ---------- Hexapawn ----------
const hexMoves = (b, side) => { const n = sq(b); const dr = side === 1 ? -1 : 1; const o = []; b.forEach((v, i) => { if (v !== side) return; const [r, c] = rc(i, n); const y = r + dr; if (y < 0 || y >= n) return; if (!b[y * n + c]) o.push(i * K + y * n + c); [c - 1, c + 1].forEach((x) => { if (x >= 0 && x < n && b[y * n + x] === 3 - side) o.push(i * K + y * n + x); }); }); return o; };
export const HEXAPAWN = duelDef({
  id: 'hexapawn', title: 'Hexapawn', bot: 0, hint: 'Your turn: move a pawn up, or capture diagonally. Reach the far row', sound: 'step',
  init: (lv) => { const n = lv <= 10 ? 3 : 4; return Array.from({ length: n * n }, (_, i) => (i < n ? 2 : i >= n * (n - 1) ? 1 : 0)); },
  legal: (s) => hexMoves(s.b, s.turn),
  play: (s, m) => { const b = [...s.b]; const t = m % K; const cap = b[t]; b[t] = b[Math.floor(m / K)]; b[Math.floor(m / K)] = 0; return { b, turn: 3 - s.turn, snd: cap ? 'capture' : 'step' }; },
  result: (s) => { const n = sq(s.b); if (s.b.slice(0, n).includes(1) || !s.b.includes(2)) return 1; if (s.b.slice(-n).includes(2) || !s.b.includes(1)) return 2; return hexMoves(s.b, s.turn).length ? null : 3 - s.turn; },
  score: (b) => { const n = sq(b); return b.reduce((t, v, i) => t + (v === 2 ? Math.floor(i / n) : v === 1 ? -(n - 1 - Math.floor(i / n)) : 0), 0); },
  depth: (lv) => (lv <= 3 ? 2 : 8),
  Board: (p) => <MoveBoard {...p} cols={sq(p.g.b)} piece={(v) => (v ? <span className={`pty-new text-4xl ${v === 1 ? 'text-white' : 'text-slate-950'} drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)]`}>♟</span> : null)} bg={(v, i) => ((Math.floor(i / sq(p.g.b)) + i) % 2 ? 'bg-stone-500' : 'bg-stone-300')} />,
  colors: [{ name: 'white', hex: '#f8fafc' }, { name: 'black', hex: '#1e293b' }],
});

// ---------- Point-and-line boards (Pong Hau K'i, Mu Torere) ----------
function PointBoard({ g, legal, onMove, pts, edges, cells }) {
  const { sel, tg, tap } = usePick(legal, onMove);
  return (
    <svg viewBox="0 0 100 100" className="block aspect-square w-full rounded-xl bg-amber-950/60">
      {edges.map(([a, b]) => <line key={`${a}-${b}`} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke="#fcd34d" strokeWidth="1.5" opacity="0.7" />)}
      {pts.map(([x, y], i) => <g key={i} onClick={() => tap(i)} className="cursor-pointer" data-testid={`duel-cell-${i}`}><circle cx={x} cy={y} r="8" fill={sel === i ? '#fbbf24' : tg.has(i) ? '#fde68a' : '#451a03'} stroke="#fcd34d" strokeWidth="1" />{cells[i] > 0 && <circle cx={x} cy={y} r="6" fill={cells[i] === 1 ? '#0ea5e9' : '#f43f5e'} stroke="#fff" strokeWidth="0.8" />}</g>)}
    </svg>
  );
}
const PH_PTS = [[12, 12], [88, 12], [50, 50], [12, 88], [88, 88]];
const PH_E = [[0, 2], [1, 2], [3, 2], [4, 2], [0, 3], [1, 4], [3, 4]];
const adjOf = (edges, n) => Array.from({ length: n }, (_, i) => edges.flatMap(([a, b]) => (a === i ? [b] : b === i ? [a] : [])));
const PH_ADJ = adjOf(PH_E, 5);
const phMoves = (p, side) => p.flatMap((v, i) => (v === side ? PH_ADJ[i].filter((j) => !p[j]).map((j) => i * K + j) : []));
const slidePlay = (s, m) => { const p = [...s.b.p]; p[m % K] = p[Math.floor(m / K)]; p[Math.floor(m / K)] = 0; return { b: { p, ply: s.b.ply + 1 }, turn: 3 - s.turn, snd: 'slide' }; };
export const PONGHAU = duelDef({
  id: 'ponghau', title: "Pong Hau K'i", bot: 2, hint: 'Your turn: slide a piece along a line into the empty point. Block the rival',
  init: () => ({ p: [2, 2, 0, 1, 1], ply: 0 }), legal: (s) => phMoves(s.b.p, s.turn), play: slidePlay,
  result: (s) => (s.b.ply >= 40 ? 0 : phMoves(s.b.p, s.turn).length ? null : 3 - s.turn),
  score: (b) => phMoves(b.p, 2).length - phMoves(b.p, 1).length, depth: (lv) => (lv <= 3 ? 2 : 6),
  Board: ({ g, legal, onMove }) => <PointBoard g={g} legal={legal} onMove={onMove} pts={PH_PTS} edges={PH_E} cells={g.b.p} />,
});
const MT_PTS = [...Array.from({ length: 8 }, (_, i) => [50 + 40 * Math.cos((i * Math.PI) / 4 - Math.PI / 2), 50 + 40 * Math.sin((i * Math.PI) / 4 - Math.PI / 2)]), [50, 50]];
const MT_E = [...Array.from({ length: 8 }, (_, i) => [i, (i + 1) % 8]), ...Array.from({ length: 8 }, (_, i) => [i, 8])];
const mtMoves = (p, side) => { const o = []; p.forEach((v, i) => { if (v !== side) return; if (i === 8) { p.forEach((w, j) => { if (j < 8 && !w) o.push(8 * K + j); }); return; } [(i + 7) % 8, (i + 1) % 8].forEach((j) => { if (!p[j]) o.push(i * K + j); }); if (!p[8] && (p[(i + 7) % 8] === 3 - side || p[(i + 1) % 8] === 3 - side)) o.push(i * K + 8); }); return o; };
export const MUTORERE = duelDef({
  id: 'mutorere', title: 'Mu Torere', bot: 3, hint: 'Your turn: move to the empty point. The centre is only reachable next to a rival',
  init: () => ({ p: [1, 1, 1, 1, 2, 2, 2, 2, 0], ply: 0 }), legal: (s) => mtMoves(s.b.p, s.turn), play: slidePlay,
  result: (s) => (s.b.ply >= 60 ? 0 : mtMoves(s.b.p, s.turn).length ? null : 3 - s.turn),
  score: (b) => mtMoves(b.p, 2).length - mtMoves(b.p, 1).length, depth: (lv) => (lv <= 3 ? 2 : 6),
  Board: ({ g, legal, onMove }) => <PointBoard g={g} legal={legal} onMove={onMove} pts={MT_PTS} edges={MT_E} cells={g.b.p} />,
});

// ---------- Dodgem ----------
const EXIT = 999;
const dodgeMoves = (c, side) => { const n = sq(c); const dirs = side === 1 ? [[-1, 0], [0, -1], [0, 1]] : [[0, 1], [-1, 0], [1, 0]]; const o = []; c.forEach((v, i) => { if (v !== side) return; const [r, x] = rc(i, n); dirs.forEach(([dr, dc]) => { const y = r + dr; const z = x + dc; if (side === 1 && y < 0) o.push(i * K + EXIT); else if (side === 2 && z >= n) o.push(i * K + EXIT); else if (y >= 0 && y < n && z >= 0 && z < n && !c[y * n + z]) o.push(i * K + y * n + z); }); }); return o; };
export const DODGEM = duelDef({
  id: 'dodgem', title: 'Dodgem', bot: 1, hint: 'Your turn: drive a blue car up, left or right. Get every car off the TOP edge',
  init: (lv) => { const n = lv <= 10 ? 3 : 4; return { c: Array.from({ length: n * n }, (_, i) => { const [r, x] = rc(i, n); return r === n - 1 && x > 0 ? 1 : x === 0 && r < n - 1 ? 2 : 0; }), ply: 0 }; },
  legal: (s) => dodgeMoves(s.b.c, s.turn),
  play: (s, m) => { const c = [...s.b.c]; const f = Math.floor(m / K); const t = m % K; if (t !== EXIT) c[t] = c[f]; c[f] = 0; return { b: { c, ply: s.b.ply + 1 }, turn: 3 - s.turn, ev: t === EXIT ? 'big' : 'move', snd: 'whoosh' }; },
  result: (s) => { if (!s.b.c.includes(1)) return 1; if (!s.b.c.includes(2)) return 2; if (s.b.ply >= 80) return 0; return dodgeMoves(s.b.c, s.turn).length ? null : s.turn; },
  score: (b) => { const n = sq(b.c); return b.c.reduce((t, v, i) => { const [r, x] = rc(i, n); return t + (v === 1 ? r + 1 : v === 2 ? -(n - x) : 0); }, 0) + (countOf(b.c, 1) - countOf(b.c, 2)) * 2; },
  depth: (lv) => (lv <= 3 ? 2 : 5),
  Board: ({ g, legal, onMove }) => { const { sel, tg, tap } = usePick(legal, onMove); const n = sq(g.b.c); return (<div>
    <Cells cols={n} cells={g.b.c} onCell={tap} cellCls={(v, i) => (sel === i ? 'bg-amber-400' : (Math.floor(i / n) + i) % 2 ? 'bg-slate-700' : 'bg-slate-500')} render={(v, i) => <>{v ? <span className="pty-new text-4xl">{v === 1 ? '🚙' : '🏎️'}</span> : null}{tg.has(i) && <Glow />}</>} />
    {tg.has(EXIT) && <button type="button" onClick={() => tap(EXIT)} className="mt-2 w-full rounded-full bg-emerald-400 py-2 text-sm font-black text-slate-900" data-testid="dodgem-exit">Drive off the board!</button>}</div>); },
  info: (b, side) => `${countOf(b.c, side)} cars left`,
});

// ---------- Blob Wars (Ataxx) ----------
const CL = 999;
const cheb = (a, b, n) => { const [r1, c1] = rc(a, n); const [r2, c2] = rc(b, n); return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)); };
const ataxxMoves = (b, side) => { const n = sq(b); const o = []; const clones = new Set(); b.forEach((w, f) => { if (w !== side) return; const r = Math.floor(f / n); const c = f % n; for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) { const y = r + dr; const x = c + dc; if (y < 0 || y >= n || x < 0 || x >= n || b[y * n + x]) continue; if (Math.max(Math.abs(dr), Math.abs(dc)) === 1) clones.add(y * n + x); else o.push(f * K + y * n + x); } }); clones.forEach((t) => o.push(CL * K + t)); return o; };
export const ATAXX = duelDef({
  id: 'ataxx', title: 'Blob Wars', bot: 0, noPass: false, hint: 'Your turn: tap a blob, then 1 step to clone or 2 steps to jump. Neighbours turn blue',
  init: (lv) => { const n = lv <= 10 ? 5 : 7; const b = Array(n * n).fill(0); b[0] = 1; b[n * n - 1] = 1; b[n - 1] = 2; b[n * (n - 1)] = 2; return b; },
  legal: (s) => ataxxMoves(s.b, s.turn),
  play: (s, m) => { const n = sq(s.b); const b = [...s.b]; const f = Math.floor(m / K); const t = m % K; if (f !== CL) b[f] = 0; b[t] = s.turn; let conv = 0; nbrs(t, n, n, D8).forEach((j) => { if (b[j] === 3 - s.turn) { b[j] = s.turn; conv += 1; } }); return { b, turn: 3 - s.turn, ev: conv >= 3 ? 'big' : 'move', snd: conv ? 'capture' : 'pop' }; },
  result: (s) => { const a = countOf(s.b, 1); const z = countOf(s.b, 2); if (s.b.includes(0) && a && z && (ataxxMoves(s.b, 1).length || ataxxMoves(s.b, 2).length)) return null; return a > z ? 1 : z > a ? 2 : 0; },
  score: (b) => countOf(b, 2) - countOf(b, 1), depth: (lv) => (lv <= 5 ? 1 : 2),
  info: (b, side) => `${countOf(b, side)} blobs`,
  Board: ({ g, legal, onMove }) => { const [sel, setSel] = useState(null); const n = sq(g.b); const tg = new Set(legal.filter((m) => (sel != null && Math.floor(m / K) === sel) || (sel != null && Math.floor(m / K) === CL && cheb(sel, m % K, n) === 1)).map((m) => m % K));
    const tap = (i) => { if (sel != null && tg.has(i)) { setSel(null); onMove(cheb(sel, i, n) === 1 ? CL * K + i : sel * K + i); } else if (g.b[i] && legal.some((m) => Math.floor(m / K) === i || (Math.floor(m / K) === CL && cheb(i, m % K, n) === 1))) setSel(i); else if (!g.b[i] && legal.includes(CL * K + i)) onMove(CL * K + i); else setSel(null); };
    return <Cells cols={n} cells={g.b} onCell={tap} cellCls={(v, i) => (sel === i ? 'bg-amber-400/70' : 'bg-indigo-950/80')} render={(v, i) => <>{v ? <span className="pty-new absolute inset-[10%] rounded-[40%]" style={{ background: v === 1 ? 'radial-gradient(circle at 35% 30%,#bbf7d0,#22c55e 50%,#14532d)' : 'radial-gradient(circle at 35% 30%,#fbcfe8,#ec4899 50%,#831843)' }} /> : null}{tg.has(i) && <span className={`absolute rounded-full ${cheb(sel, i, n) === 1 ? 'inset-[30%] bg-emerald-300/80' : 'inset-[36%] bg-amber-300/70'}`} />}</>} />; },
  colors: [{ name: 'green', hex: '#22c55e' }, { name: 'pink', hex: '#ec4899' }],
});

// ---------- First Capture Go ----------
const goGroup = (b, i, n) => { const v = b[i]; const seen = new Set([i]); const q = [i]; const libs = new Set(); while (q.length) { const x = q.pop(); nbrs(x, n, n, D4).forEach((j) => { if (!b[j]) libs.add(j); else if (b[j] === v && !seen.has(j)) { seen.add(j); q.push(j); } }); } return { stones: [...seen], libs: libs.size }; };
const goPlace = (c, i, side) => { const n = sq(c); const b = [...c]; b[i] = side; let cap = 0; nbrs(i, n, n, D4).forEach((j) => { if (b[j] === 3 - side) { const gr = goGroup(b, j, n); if (!gr.libs) { gr.stones.forEach((x) => { b[x] = 0; }); cap += gr.stones.length; } } }); return { b, cap, ok: cap > 0 || goGroup(b, i, n).libs > 0 }; };
const goLegal = (c, side) => c.map((v, i) => (!v && goPlace(c, i, side).ok ? i : -1)).filter((i) => i >= 0);
export const ATARIGO = duelDef({
  id: 'atarigo', title: 'First Capture Go', bot: 2, noPass: false, hint: 'Your turn: place a stone. First to capture any rival stones wins',
  init: (lv) => ({ c: Array((lv <= 10 ? 5 : lv <= 25 ? 6 : 7) ** 2).fill(0), cap: 0 }), legal: (s) => goLegal(s.b.c, s.turn),
  play: (s, m) => { const r = goPlace(s.b.c, m, s.turn); return { b: { c: r.b, cap: r.cap ? s.turn : 0 }, turn: 3 - s.turn, ev: r.cap ? 'big' : 'move' }; },
  result: (s) => (s.b.cap ? s.b.cap : s.b.c.every(Boolean) || (!goLegal(s.b.c, 1).length && !goLegal(s.b.c, 2).length) ? 0 : null),
  score: (b) => { const n = sq(b.c); const seen = new Set(); let t = 0; b.c.forEach((v, i) => { if (!v || seen.has(i)) return; const gr = goGroup(b.c, i, n); gr.stones.forEach((x) => seen.add(x)); t += (v === 2 ? 1 : -1) * (gr.libs === 1 ? -12 : Math.min(gr.libs, 4)); }); return t; },
  depth: () => 2,
  Board: ({ g, legal, onMove }) => { const n = sq(g.b.c); return <div className="rounded-lg bg-amber-300 p-2"><Cells cols={n} cells={g.b.c} gap="gap-0" onCell={(i) => legal.includes(i) && onMove(i)} cellCls={() => 'rounded-none border border-amber-800/60 bg-amber-300'} render={(v, i) => (v ? <span className={`pty-new absolute inset-[8%] rounded-full ${g.last === i ? 'ring-2 ring-rose-500' : ''}`} style={{ background: v === 1 ? 'radial-gradient(circle at 35% 30%,#475569,#000)' : 'radial-gradient(circle at 35% 30%,#fff,#cbd5e1)' }} /> : null)} /></div>; },
  colors: [{ name: 'black', hex: '#0f172a' }, { name: 'white', hex: '#f1f5f9' }],
});

// ---------- Stalk Chop (Red-Blue Hackenbush) ----------
const stalkVal = (st) => { if (!st.length) return 0; let v = 0; let i = 0; const sg = (c) => (c === 1 ? 1 : -1); while (i < st.length && st[i] === st[0]) { v += sg(st[i]); i += 1; } let d = 1; for (; i < st.length; i += 1) { d /= 2; v += sg(st[i]) * d; } return v; };
const stalkMoves = (b, side) => b.flatMap((st, j) => st.map((c, i) => (c === side ? j * 100 + i : -1)).filter((m) => m >= 0));
export const STALKS = duelDef({
  id: 'stalks', title: 'Stalk Chop', bot: 1, hint: 'Your turn: chop a BLUE segment. Everything above it falls. Last chop wins', sound: 'capture',
  init: (lv) => { const k = 3 + (lv > 10 ? 1 : 0) + (lv > 25 ? 1 : 0); let b; do { b = Array.from({ length: k }, () => Array.from({ length: 2 + rnd(4) }, () => 1 + rnd(2))); } while (!stalkMoves(b, 1).length || !stalkMoves(b, 2).length); return b; },
  legal: (s) => stalkMoves(s.b, s.turn),
  play: (s, m) => { const j = Math.floor(m / 100); const i = m % 100; const b = s.b.map((st, x) => (x === j ? st.slice(0, i) : st)); return { b, turn: 3 - s.turn, ev: s.b[j].length - i >= 3 ? 'big' : 'move' }; },
  result: (s) => (stalkMoves(s.b, s.turn).length ? null : 3 - s.turn), score: (b) => -10 * b.reduce((t, st) => t + stalkVal(st), 0), depth: (lv) => (lv <= 3 ? 2 : 4),
  Board: ({ g, legal, onMove }) => <div className="flex h-64 items-end justify-around rounded-xl bg-gradient-to-b from-sky-900/40 to-green-900/70 px-2 pb-2">{g.b.map((st, j) => <div key={j} className="flex flex-col-reverse items-center">{st.map((c, i) => <button key={`${j}-${i}-${st.length}`} type="button" onClick={() => legal.includes(j * 100 + i) && onMove(j * 100 + i)} className={`pty-new my-0.5 h-9 w-6 rounded-md border border-black/30 ${legal.includes(j * 100 + i) ? 'hover:scale-110' : ''}`} style={{ background: c === 1 ? 'linear-gradient(90deg,#0369a1,#38bdf8,#0369a1)' : 'linear-gradient(90deg,#9f1239,#fb7185,#9f1239)' }} data-testid={`stalk-${j}-${i}`} />)}<span className="h-2 w-10 rounded bg-amber-900" /></div>)}</div>,
});

// ---------- Toads & Frogs ----------
const tfMoves = (b, side) => { const d = side === 1 ? 1 : -1; return b.map((v, i) => { if (v !== side) return -1; const j = i + d; if (j < 0 || j >= b.length) return -1; if (!b[j]) return i; const k = j + d; return b[j] === 3 - side && k >= 0 && k < b.length && !b[k] ? i : -1; }).filter((i) => i >= 0); };
export const TOADS = duelDef({
  id: 'toads', title: 'Toads & Frogs', bot: 3, hint: 'Your turn: tap a toad to hop right (or jump over one frog). Last move wins', sound: 'step',
  init: (lv) => { const t = lv <= 10 ? 3 : 4; const L = t * 2 + 2 + (lv > 25 ? 2 : 0); return Array.from({ length: L }, (_, i) => (i < t ? 1 : i >= L - t ? 2 : 0)); },
  legal: (s) => tfMoves(s.b, s.turn),
  play: (s, m) => { const d = s.turn === 1 ? 1 : -1; const b = [...s.b]; const to = b[m + d] ? m + 2 * d : m + d; b[to] = s.turn; b[m] = 0; return { b, turn: 3 - s.turn, snd: to - m === 2 * d ? 'ladder' : 'step' }; },
  result: (s) => (tfMoves(s.b, s.turn).length ? null : 3 - s.turn), score: mob(tfMoves), depth: (lv) => (lv <= 3 ? 3 : 7),
  Board: ({ g, legal, onMove }) => <div className="flex justify-center gap-1 rounded-xl bg-cyan-900/60 p-2">{g.b.map((v, i) => <button key={i} type="button" onClick={() => legal.includes(i) && onMove(i)} className={`relative flex aspect-square flex-1 items-center justify-center rounded-full bg-green-700/80 ${legal.includes(i) ? 'ring-2 ring-amber-300' : ''}`} style={{ maxWidth: 44 }} data-testid={`duel-cell-${i}`}>{v ? <span className="pty-new text-2xl">{v === 1 ? '🐸' : '🐊'}</span> : null}</button>)}</div>,
  colors: [{ name: 'toads', hex: '#22c55e' }, { name: 'frogs', hex: '#f97316' }],
});

// ---------- Ultimate Tic Tac Toe ----------
const L3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const l3win = (a) => { for (const l of L3) { const v = a[l[0]]; if (v && v !== 3 && l.every((i) => a[i] === v)) return v; } return 0; };
const uLegal = (b) => { const boards = b.nx >= 0 && !b.big[b.nx] ? [b.nx] : [...Array(9).keys()].filter((k) => !b.big[k]); return boards.flatMap((k) => [...Array(9).keys()].map((p) => k * 9 + p).filter((i) => !b.c[i])); };
export const ULTIMATE = duelDef({
  id: 'ultimate', title: 'Ultimate Tic Tac Toe', bot: 1, hint: 'Your turn: play in a glowing board. Your square picks the rival’s next board', sound: 'pop',
  init: () => ({ c: Array(81).fill(0), big: Array(9).fill(0), nx: -1 }), legal: (s) => uLegal(s.b),
  play: (s, m) => { const c = [...s.b.c]; c[m] = s.turn; const k = Math.floor(m / 9); const big = [...s.b.big]; const sub = c.slice(k * 9, k * 9 + 9); const w = l3win(sub); let ev = 'move'; if (w) { big[k] = w; ev = 'big'; } else if (sub.every(Boolean)) big[k] = 3; return { b: { c, big, nx: m % 9 }, turn: 3 - s.turn, ev }; },
  result: (s) => { const w = l3win(s.b.big); if (w) return w; if (s.b.big.every(Boolean)) { const a = countOf(s.b.big, 1); const z = countOf(s.b.big, 2); return a > z ? 1 : z > a ? 2 : 0; } return null; },
  score: (b) => 25 * (countOf(b.big, 2) - countOf(b.big, 1)) + lineHeur(b.big.map((v) => (v === 3 ? 0 : v)), 3, 3, 3) * 3 + b.big.reduce((t, v, k) => (v ? t : t + lineHeur(b.c.slice(k * 9, k * 9 + 9), 3, 3, 3) * 0.3), 0),
  depth: () => 2,
  info: (b, side) => `${countOf(b.big, side)} boards`,
  Board: ({ g, legal, onMove }) => { const act = new Set(legal.map((m) => Math.floor(m / 9))); return (
    <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-950 p-1.5">{[...Array(9).keys()].map((k) => <div key={k} className={`relative grid grid-cols-3 gap-0.5 rounded-md p-0.5 transition-colors ${act.has(k) ? 'bg-amber-300/40 ring-2 ring-amber-300' : 'bg-white/10'}`}>
      {[...Array(9).keys()].map((p) => { const i = k * 9 + p; const v = g.b.c[i]; return <button key={p} type="button" onClick={() => legal.includes(i) && onMove(i)} className="flex aspect-square items-center justify-center rounded-sm bg-slate-800 text-sm font-black" data-testid={`duel-cell-${i}`}>{v ? <span className={`pty-new ${v === 1 ? 'text-sky-300' : 'text-rose-300'} ${g.last === i ? 'drop-shadow-[0_0_5px_#fff]' : ''}`}>{v === 1 ? 'X' : 'O'}</span> : ''}</button>; })}
      {g.b.big[k] > 0 && g.b.big[k] < 3 && <span className={`pty-new absolute inset-0 flex items-center justify-center rounded-md bg-slate-950/70 font-display text-6xl font-black ${g.b.big[k] === 1 ? 'text-sky-400' : 'text-rose-400'}`}>{g.b.big[k] === 1 ? 'X' : 'O'}</span>}</div>)}</div>); },
});

// ---------- Turning Turtles ----------
export const TURTLES = duelDef({
  id: 'turtles', title: 'Turning Turtles', bot: 2, hint: 'Your turn: flip a standing turtle, and optionally one turtle to its left', sound: 'flip',
  init: (lv) => { const L = 10 + (lv > 10 ? 3 : 0); let b; do { b = Array.from({ length: L }, () => (Math.random() < 0.5 ? 1 : 0)); } while (countOf(b, 1) < 3); return b; },
  legal: (s) => s.b.flatMap((v, i) => (v ? [i * 100, ...Array.from({ length: i }, (_, j) => i * 100 + j + 1)] : [])),
  play: (s, m) => { const i = Math.floor(m / 100); const j = (m % 100) - 1; const b = [...s.b]; b[i] = 0; if (j >= 0) b[j] = 1 - b[j]; return { b, turn: 3 - s.turn }; },
  result: (s) => (s.b.includes(1) ? null : 3 - s.turn), score: (b, s) => perfect(s, xorAll(b.map((v, i) => (v ? i + 1 : 0))) === 0), depth: () => 1,
  Board: ({ g, legal, onMove }) => { const [sel, setSel] = useState(null); const tap = (i) => { if (sel == null || i >= sel) { setSel(legal.includes(i * 100) ? i : null); return; } setSel(null); onMove(sel * 100 + i + 1); };
    return (<div className="p-1"><div className="grid grid-cols-7 gap-1.5 rounded-xl bg-amber-200/30 p-2">{g.b.map((v, i) => <button key={i} type="button" onClick={() => tap(i)} className={`flex aspect-square items-center justify-center rounded-full text-3xl transition-transform duration-300 ${sel === i ? 'bg-amber-400' : sel != null && i < sel ? 'bg-emerald-300/50' : 'bg-cyan-800/60'}`} style={{ transform: v ? 'none' : 'rotate(180deg)' }} data-testid={`turtle-${i}`}>🐢</button>)}</div>
      {sel != null && <button type="button" onClick={() => { setSel(null); onMove(sel * 100); }} className="mt-2 w-full rounded-full bg-amber-400 py-2 text-sm font-black text-slate-900" data-testid="turtle-flip-one">Flip just this turtle</button>}
      <p className="mt-1 text-center text-[10px] text-white/70">Standing turtles can be flipped. After picking one, tap a green turtle to its left to flip it too.</p></div>); },
});

export const DUELS5 = { pty_konane: KONANE, pty_hexapawn: HEXAPAWN, pty_pong_hau: PONGHAU, pty_mu_torere: MUTORERE, pty_dodgem: DODGEM, pty_ataxx: ATAXX, pty_atari_go: ATARIGO, pty_stalks: STALKS, pty_toads_frogs: TOADS, pty_ultimate_ttt: ULTIMATE, pty_turtles: TURTLES };
