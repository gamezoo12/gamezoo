const P = 9900;
import { LIGHTS } from './solo';

// Batch: Sim, Chomp, Kayles, Notakto (duels) + Same Game, Ball Sort, Tile Triple, Star Lights (solo).
const base = (o) => ({ colors: [{ name: 'blue', hex: '#0ea5e9' }, { name: 'red', hex: '#f43f5e' }], sound: 'pop', noPass: true, ...o });
const rnd = (k) => Math.floor(Math.random() * k);

// ---------- Sim: draw edges between 6 dots; whoever completes a triangle in their colour loses. ----------
const EDGES = []; for (let a = 0; a < 6; a += 1) for (let b = a + 1; b < 6; b += 1) EDGES.push([a, b]);
const tri = (b, side) => { for (let x = 0; x < 6; x += 1) for (let y = x + 1; y < 6; y += 1) for (let z = y + 1; z < 6; z += 1) { const e = (p, q) => b[EDGES.findIndex(([m, n]) => m === p && n === q)]; if (e(x, y) === side && e(y, z) === side && e(x, z) === side) return true; } return false; };
const DOT = Array.from({ length: 6 }, (_, i) => [50 + 40 * Math.cos((i * Math.PI) / 3 - Math.PI / 2), 50 + 40 * Math.sin((i * Math.PI) / 3 - Math.PI / 2)]);
export const SIM = base({
  id: 'sim', title: 'Triangle Trap', bot: 0, hint: 'Your turn: draw a line, never close a blue triangle',
  init: () => Array(15).fill(0), legal: (s) => s.b.map((v, i) => (v ? -1 : P + i)).filter((m) => m >= 0),
  play: (s, m) => { const b = [...s.b]; b[m - P] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => (tri(s.b, 1) ? 2 : tri(s.b, 2) ? 1 : null),
  score: (b) => b.filter((v) => !v).length % 2 ? 1 : -1, depth: (lv) => (lv <= 3 ? 2 : 4),
  Board: ({ g, legal, onMove }) => (
    <svg viewBox="0 0 100 100" className="block aspect-square w-full rounded-xl bg-black/40">
      {EDGES.map(([a, b], i) => <g key={i} onClick={() => legal.includes(P + i) && onMove(P + i)} data-testid={`duel-cell-${i}`} className="cursor-pointer"><line x1={DOT[a][0]} y1={DOT[a][1]} x2={DOT[b][0]} y2={DOT[b][1]} stroke="transparent" strokeWidth="7" /><line x1={DOT[a][0]} y1={DOT[a][1]} x2={DOT[b][0]} y2={DOT[b][1]} stroke={g.b[i] === 1 ? '#0ea5e9' : g.b[i] === 2 ? '#f43f5e' : 'rgba(255,255,255,0.15)'} strokeWidth={g.b[i] ? 2.2 : 1} strokeDasharray={g.b[i] ? '' : '2 2'} /></g>)}
      {DOT.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="#fde68a" />)}
    </svg>),
});

// ---------- Chomp: bite the chocolate bar; whoever eats the poisoned top-left square loses. ----------
export const CHOMP = base({
  id: 'chomp', title: 'Chomp', bot: 2, hint: 'Your turn: tap a square to bite it and everything below-right', sound: 'card',
  init: (lv) => { const [r, c] = lv <= 5 ? [4, 5] : lv <= 15 ? [5, 6] : [6, 7]; return Array(r * 7).fill(0).map((_, i) => (i % 7 < c ? 1 : -1)); },
  legal: (s) => s.b.map((v, i) => (v === 1 ? P + i : -1)).filter((m) => m >= 0),
  play: (s, m) => { const i = m - P; const b = s.b.map((v, j) => (v === 1 && Math.floor(j / 7) >= Math.floor(i / 7) && j % 7 >= i % 7 ? 0 : v)); return { b, turn: 3 - s.turn }; },
  result: (s) => (s.b[0] !== 1 ? s.turn : null),
  score: (b) => (b.filter((v) => v === 1).length % 2 ? 1 : -1), depth: (lv) => (lv <= 3 ? 2 : 4),
  Board: ({ g, legal, onMove }) => <div className="grid grid-cols-7 gap-1 rounded-xl bg-black/40 p-2">{g.b.map((v, i) => <button key={i} type="button" onClick={() => legal.includes(P + i) && onMove(P + i)} className="relative aspect-square rounded-md" style={{ background: v === 1 ? (i === 0 ? 'linear-gradient(145deg,#a3e635,#365314)' : 'linear-gradient(145deg,#a16207,#451a03)') : 'transparent', boxShadow: v === 1 ? 'inset 0 -3px 0 rgba(0,0,0,0.35)' : 'none', visibility: v === -1 ? 'hidden' : 'visible' }} data-testid={`duel-cell-${i}`}>{v === 1 && i === 0 ? '☠' : ''}</button>)}</div>,
});

// ---------- Kayles: knock down 1 pin or 2 touching pins. Knock the last pin to win. ----------
export const KAYLES = base({
  id: 'kayles', title: 'Bowling Kayles', bot: 3, hint: 'Your turn: tap a pin (or the gap between two touching pins)', sound: 'capture',
  init: (lv) => Array(lv <= 5 ? 8 : lv <= 15 ? 11 : 14).fill(1),
  legal: (s) => { const out = []; s.b.forEach((v, i) => { if (v) { out.push(P + i * 2); if (s.b[i + 1]) out.push(P + i * 2 + 1); } }); return out; },
  play: (s, m) => { const k = m - P; const i = Math.floor(k / 2); const b = [...s.b]; b[i] = 0; if (k % 2) b[i + 1] = 0; return { b, turn: 3 - s.turn }; },
  result: (s) => (s.b.every((v) => !v) ? 3 - s.turn : null),
  score: (b) => (b.filter(Boolean).length % 3 ? -1 : 1), depth: (lv) => (lv <= 3 ? 2 : 5),
  Board: ({ g, legal, onMove }) => <div className="flex flex-wrap items-end justify-center gap-0 rounded-xl bg-black/40 p-4">{g.b.map((v, i) => <span key={i} className="flex items-end">
    <button type="button" onClick={() => legal.includes(P + i * 2) && onMove(P + i * 2)} className="flex h-16 w-7 flex-col items-center justify-end" data-testid={`kayles-${i}`}>{v ? <span className="pty-new h-14 w-5 rounded-t-full rounded-b-lg bg-gradient-to-b from-white to-slate-300 shadow-[0_0_10px_#fff6]"><span className="mt-3 block h-1 w-full bg-rose-500" /></span> : <span className="h-1 w-5 rounded bg-white/20" />}</button>
    {i < g.b.length - 1 && <button type="button" onClick={() => legal.includes(P + i * 2 + 1) && onMove(P + i * 2 + 1)} className={`mb-6 h-4 w-3 rounded-full ${legal.includes(P + i * 2 + 1) ? 'bg-amber-300/60' : 'bg-transparent'}`} data-testid={`kayles-pair-${i}`} />}</span>)}</div>,
});

// ---------- Notakto: both play X; whoever completes three in a row loses. ----------
const L3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const dead = (b, k) => L3.some((l) => l.every((i) => b[k * 9 + i]));
export const NOTAKTO = base({
  id: 'notakto', title: 'Notakto', bot: 1, hint: 'Your turn: place an X, do not complete a line', sound: 'pop',
  init: (lv) => Array((lv <= 10 ? 1 : 2) * 9).fill(0),
  legal: (s) => s.b.map((v, i) => (v || dead(s.b, Math.floor(i / 9)) ? -1 : P + i)).filter((m) => m >= 0),
  play: (s, m) => { const b = [...s.b]; b[m - P] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => (Array.from({ length: s.b.length / 9 }, (_, k) => dead(s.b, k)).every(Boolean) ? s.turn : null),
  score: () => 0, depth: (lv) => (lv <= 2 ? 2 : 5),
  Board: ({ g, legal, onMove }) => <div className="flex flex-col gap-3">{Array.from({ length: g.b.length / 9 }, (_, k) => <div key={k} className={`grid grid-cols-3 gap-1.5 rounded-xl p-2 ${dead(g.b, k) ? 'bg-rose-900/50 opacity-60' : 'bg-black/40'}`}>{g.b.slice(k * 9, k * 9 + 9).map((v, j) => <button key={j} type="button" onClick={() => legal.includes(P + k * 9 + j) && onMove(P + k * 9 + j)} className="flex aspect-square items-center justify-center rounded-lg bg-white/10 font-display text-4xl font-black text-amber-300" data-testid={`duel-cell-${k * 9 + j}`}>{v ? 'X' : ''}</button>)}</div>)}</div>,
});
export const DUELS3 = { pty_sim: SIM, pty_chomp: CHOMP, pty_kayles: KAYLES, pty_notakto: NOTAKTO };

// ---------- Solo: Same Game ----------
const SG = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
const group = (b, n, i) => { const v = b[i]; if (v < 0) return []; const seen = new Set([i]); const q = [i]; while (q.length) { const x = q.pop(); const r = Math.floor(x / n); const c = x % n; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { const y = r + dr; const z = c + dc; const j = y * n + z; if (y >= 0 && y < n && z >= 0 && z < n && !seen.has(j) && b[j] === v) { seen.add(j); q.push(j); } }); } return [...seen]; };
const gravity = (b, n) => { const out = Array(n * n).fill(-1); const cols = []; for (let c = 0; c < n; c += 1) { const col = []; for (let r = n - 1; r >= 0; r -= 1) if (b[r * n + c] >= 0) col.push(b[r * n + c]); if (col.length) cols.push(col); } cols.forEach((col, c) => col.forEach((v, k) => { out[(n - 1 - k) * n + c] = v; })); return out; };
const sgMoves = (b, n) => b.some((v, i) => v >= 0 && group(b, n, i).length > 1);
export const SAME = {
  id: 'same', title: 'Same Game', clock: 240, sound: 'pop',
  init: (lv, d) => { const n = lv <= 10 ? 8 : 10; const k = Math.min(5, 3 + Math.floor(d / 3)); return { b: Array.from({ length: n * n }, () => rnd(k)), n, score: 0, goal: Math.round(n * n * (4 + d * 1.2)) }; },
  act: (s, i) => { const gp = group(s.b, s.n, i); if (gp.length < 2) return null; const b = gravity(s.b.map((v, j) => (gp.includes(j) ? -1 : v)), s.n); return { ...s, b, score: s.score + (gp.length - 1) ** 2 * 2, cheer: gp.length >= 8 }; },
  won: (s) => s.score >= s.goal, lost: (s) => !sgMoves(s.b, s.n) && s.score < s.goal, moves: (s) => `${s.score}/${s.goal} points`,
  Board: ({ s, act }) => <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${s.n}, minmax(0,1fr))` }}>{s.b.map((v, i) => <button key={i} type="button" onClick={() => act(i)} className="aspect-square rounded-full" style={{ background: v >= 0 ? `radial-gradient(circle at 35% 30%, #fff, ${SG[v]} 45%, #0008)` : 'transparent' }} data-testid={`same-${i}`} />)}</div>,
};
// ---------- Solo: Ball Sort ----------
const BS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
export const BALLSORT = {
  id: 'ballsort', title: 'Ball Sort', clock: 300, sound: 'drop',
  init: (lv, d) => { const k = Math.min(7, 3 + Math.floor(lv / 8)); const balls = Array.from({ length: k * 4 }, (_, i) => i % k).sort(() => Math.random() - 0.5); const tubes = Array.from({ length: k }, (_, t) => balls.slice(t * 4, t * 4 + 4)); return { tubes: [...tubes, [], []], sel: null, moves: 0, d }; },
  act: (s, t) => { if (s.sel == null) return s.tubes[t].length ? { ...s, sel: t } : null; if (s.sel === t) return { ...s, sel: null }; const from = s.tubes[s.sel]; const to = s.tubes[t]; const ball = from[from.length - 1]; if (to.length >= 4 || (to.length && to[to.length - 1] !== ball)) return { ...s, sel: null }; const tubes = s.tubes.map((x, i) => (i === s.sel ? x.slice(0, -1) : i === t ? [...x, ball] : x)); return { ...s, tubes, sel: null, moves: s.moves + 1, cheer: tubes[t].length === 4 && tubes[t].every((b) => b === ball) }; },
  won: (s) => s.tubes.every((x) => !x.length || (x.length === 4 && x.every((b) => b === x[0]))), lost: (s) => s.moves > 120 - s.d * 6, moves: (s) => `${s.moves} moves`,
  Board: ({ s, act }) => <div className="flex flex-wrap justify-center gap-3 py-2">{s.tubes.map((t, i) => <button key={i} type="button" onClick={() => act(i)} className={`flex h-40 w-12 flex-col-reverse items-center gap-1 rounded-b-3xl rounded-t-lg border-2 p-1 transition-transform ${s.sel === i ? '-translate-y-3 border-amber-300' : 'border-white/40'}`} style={{ background: 'rgba(255,255,255,0.08)' }} data-testid={`tube-${i}`}>{t.map((b, k) => <span key={k} className="h-8 w-8 rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${BS[b]} 45%, #0008)` }} />)}</button>)}</div>,
};
// ---------- Solo: Tile Triple ----------
const TT = ['🍎', '🍋', '🍇', '🥝', '🍑', '🍒', '🥥', '🍍', '🫐', '🍉'];
export const TRIPLE = {
  id: 'triple', title: 'Tile Triple', clock: 240, sound: 'card',
  init: (lv, d) => { const k = Math.min(10, 4 + Math.floor(lv / 5)); const sets = 3 + Math.floor(d / 2); const tiles = Array.from({ length: k * sets }, (_, i) => TT[i % k]).flatMap((t) => [t, t, t]).sort(() => Math.random() - 0.5); return { tiles: tiles.map((t, i) => ({ t, id: i, gone: false })), tray: [] }; },
  act: (s, id) => { const tile = s.tiles.find((x) => x.id === id && !x.gone); if (!tile) return null; let tray = [...s.tray, tile.t]; let cheer = false; if (tray.filter((x) => x === tile.t).length === 3) { tray = tray.filter((x) => x !== tile.t); cheer = Math.random() < 0.3; } return { ...s, tiles: s.tiles.map((x) => (x.id === id ? { ...x, gone: true } : x)), tray, cheer }; },
  won: (s) => s.tiles.every((x) => x.gone), lost: (s) => s.tray.length >= 7, moves: (s) => `${s.tiles.filter((x) => !x.gone).length} tiles left · tray ${s.tray.length}/7`,
  Board: ({ s, act }) => (<div><div className="grid grid-cols-6 gap-1.5">{s.tiles.map((x) => <button key={x.id} type="button" disabled={x.gone} onClick={() => act(x.id)} className={`aspect-square rounded-xl text-2xl transition-transform ${x.gone ? 'invisible' : 'bg-gradient-to-b from-amber-50 to-amber-200 shadow-[0_4px_0_#b45309] active:translate-y-1'}`} data-testid={`triple-${x.id}`}>{x.t}</button>)}</div>
    <div className="mt-3 flex h-12 items-center gap-1 rounded-2xl bg-black/50 p-1.5" data-testid="triple-tray">{Array.from({ length: 7 }, (_, i) => <span key={i} className="flex aspect-square h-full items-center justify-center rounded-lg bg-white/10 text-xl">{s.tray[i] || ''}</span>)}</div></div>),
};
// ---------- Solo: Star Lights (diagonal Lights Out) ----------
const xtoggle = (b, n, i) => { const out = [...b]; const r = Math.floor(i / n); const c = i % n; [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([dr, dc]) => { const y = r + dr; const x = c + dc; if (y >= 0 && y < n && x >= 0 && x < n) out[y * n + x] = !out[y * n + x]; }); return out; };
export const STARLIGHTS = { ...LIGHTS, id: 'starlights', title: 'Star Lights',
  init: (lv, d) => { const n = lv <= 5 ? 4 : 5; let b = Array(n * n).fill(false); const k = 2 + d; for (let i = 0; i < k; i += 1) b = xtoggle(b, n, rnd(n * n)); if (b.every((x) => !x)) b = xtoggle(b, n, 0); return { b, n, left: k * 2 + 4 }; },
  act: (s, i) => ({ ...s, b: xtoggle(s.b, s.n, i), left: s.left - 1 }) };
export const SOLOS2 = { pty_same_game: SAME, pty_ball_sort: BALLSORT, pty_tile_triple: TRIPLE, pty_star_lights: STARLIGHTS };
