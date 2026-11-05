import { useEffect, useRef, useState } from 'react';
import { D8, nbrs, pickOne, rnd, shuffle } from './gkit';
import { sfx } from './kit';

// Batch 3 solos: you vs the level. def: { id, title, clock, sound, init(lv, d), act(s, a), won, lost, moves, Board }
const btn = 'transition-transform active:scale-95';

// ---------- Slide Fifteen ----------
const slideN = (i, n) => [i - n, i + n, i % n ? i - 1 : -1, (i + 1) % n ? i + 1 : -1].filter((j) => j >= 0 && j < n * n);
export const SLIDE = {
  id: 'slide15', title: 'Slide Fifteen', clock: 300, sound: 'slide',
  init: (lv, d) => { const n = lv <= 5 ? 3 : lv <= 20 ? 4 : 5; const b = [...Array(n * n - 1).keys()].map((x) => x + 1).concat(0); let e = n * n - 1; let prev = -1; const k = 10 + d * 10 + n * 8; for (let t = 0; t < k; t += 1) { const j = pickOne(slideN(e, n).filter((x) => x !== prev)); [b[e], b[j]] = [b[j], b[e]]; prev = e; e = j; } return { b, n, left: k * 2 + 40 }; },
  act: (s, i) => { const e = s.b.indexOf(0); if (!slideN(e, s.n).includes(i)) return null; const b = [...s.b]; [b[e], b[i]] = [b[i], b[e]]; return { ...s, b, left: s.left - 1, cheer: b[e] === e + 1 && Math.random() < 0.15 }; },
  won: (s) => s.b.every((v, i) => v === (i + 1) % (s.n * s.n)), lost: (s) => s.left <= 0, moves: (s) => `${s.left} moves left`,
  Board: ({ s, act }) => <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${s.n}, minmax(0,1fr))` }}>{s.b.map((v, i) => <button key={i} type="button" onClick={() => act(i)} className={`flex aspect-square items-center justify-center rounded-xl font-display text-3xl font-black ${btn} ${v ? 'bg-gradient-to-b from-orange-300 to-orange-500 text-white shadow-[0_5px_0_#9a3412]' : 'bg-black/30'} ${v === i + 1 ? 'ring-2 ring-emerald-300' : ''}`} data-testid={`slide-${i}`}>{v || ''}</button>)}</div>,
};

// ---------- Merge 2048 ----------
const mergeLine = (a) => { const f = a.filter(Boolean); const o = []; let gain = 0; for (let i = 0; i < f.length; i += 1) { if (f[i] === f[i + 1]) { o.push(f[i] * 2); gain += f[i] * 2; i += 1; } else o.push(f[i]); } while (o.length < 4) o.push(0); return { o, gain }; };
const IDX = { left: (r, k) => r * 4 + k, right: (r, k) => r * 4 + 3 - k, up: (r, k) => k * 4 + r, down: (r, k) => (3 - k) * 4 + r };
const shift = (b, dir) => { const n = [...b]; let gain = 0; for (let r = 0; r < 4; r += 1) { const line = [0, 1, 2, 3].map((k) => b[IDX[dir](r, k)]); const m = mergeLine(line); gain += m.gain; m.o.forEach((v, k) => { n[IDX[dir](r, k)] = v; }); } return { n, gain }; };
const spawn = (b) => { const e = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0); if (!e.length) return b; const n = [...b]; n[pickOne(e)] = Math.random() < 0.9 ? 2 : 4; return n; };
const TC = { 2: '#fde68a', 4: '#fcd34d', 8: '#fb923c', 16: '#f97316', 32: '#f43f5e', 64: '#e11d48', 128: '#a855f7', 256: '#7c3aed', 512: '#2563eb', 1024: '#0891b2', 2048: '#16a34a' };
function useSwipe(act, keys) {
  const t = useRef(null);
  useEffect(() => { const h = (e) => { const d = keys[e.key]; if (d) { e.preventDefault(); act(d); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); });
  return { onTouchStart: (e) => { t.current = [e.touches[0].clientX, e.touches[0].clientY]; }, onTouchEnd: (e) => { if (!t.current) return; const dx = e.changedTouches[0].clientX - t.current[0]; const dy = e.changedTouches[0].clientY - t.current[1]; if (Math.max(Math.abs(dx), Math.abs(dy)) > 25) act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); t.current = null; } };
}
const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
export const MERGE = {
  id: 'merge2048', title: 'Merge 2048', clock: 360, sound: 'slide',
  init: (lv) => ({ b: spawn(spawn(Array(16).fill(0))), score: 0, goal: lv <= 5 ? 128 : lv <= 20 ? 256 : 512 }),
  act: (s, dir) => { const { n, gain } = shift(s.b, dir); if (n.every((v, i) => v === s.b[i])) return null; return { ...s, b: spawn(n), score: s.score + gain, cheer: gain >= 64, snd: gain ? 'combo' : 'slide' }; },
  won: (s) => Math.max(...s.b) >= s.goal, lost: (s) => ['left', 'right', 'up', 'down'].every((d) => shift(s.b, d).n.every((v, i) => v === s.b[i])), moves: (s) => `Make a ${s.goal} tile · ${s.score} pts`,
  Board: ({ s, act }) => { const sw = useSwipe(act, ARROWS); return (<div {...sw}><div className="grid touch-none grid-cols-4 gap-2 rounded-xl bg-stone-800/80 p-2">{s.b.map((v, i) => <span key={i} className={`flex aspect-square items-center justify-center rounded-lg font-display font-black ${v >= 128 ? 'text-xl' : 'text-2xl'} ${v ? 'pty-new text-white' : ''}`} style={{ background: v ? TC[v] || '#0f172a' : 'rgba(255,255,255,0.08)' }}>{v || ''}</span>)}</div>
    <div className="mt-2 grid grid-cols-4 gap-2">{[['←', 'left'], ['↑', 'up'], ['↓', 'down'], ['→', 'right']].map(([l, d]) => <button key={d} type="button" onClick={() => act(d)} className={`rounded-xl bg-white/15 py-2 text-xl font-black text-white ${btn}`} data-testid={`merge-${d}`}>{l}</button>)}</div></div>); },
};

// ---------- Mine Sweep ----------
const mineFlood = (s, i) => { const rev = [...s.rev]; const q = [i]; while (q.length) { const x = q.pop(); if (rev[x] || s.flag[x]) continue; rev[x] = true; if (!s.cnt[x]) nbrs(x, s.n, s.n, D8).forEach((j) => { if (!rev[j] && !s.mine[j]) q.push(j); }); } return rev; };
const NUMC = ['', '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#b45309', '#0891b2', '#111', '#555'];
export const MINES = {
  id: 'mines', title: 'Mine Sweep', clock: 300, sound: 'pop',
  init: (lv, d) => { const n = lv <= 10 ? 8 : lv <= 25 ? 9 : 10; return { n, total: Math.round(n * n * (0.11 + d * 0.008)), mine: null, cnt: null, rev: Array(n * n).fill(false), flag: Array(n * n).fill(false), boom: false }; },
  act: (s, { i, flag }) => {
    if (s.rev[i]) return null;
    if (flag) { const f = [...s.flag]; f[i] = !f[i]; return { ...s, flag: f, snd: 'flip' }; }
    if (s.flag[i]) return null;
    let { mine, cnt } = s;
    if (!mine) { const safe = new Set([i, ...nbrs(i, s.n, s.n, D8)]); const spots = shuffle([...Array(s.n * s.n).keys()].filter((x) => !safe.has(x))).slice(0, s.total); mine = Array(s.n * s.n).fill(false); spots.forEach((x) => { mine[x] = true; }); cnt = mine.map((_, x) => nbrs(x, s.n, s.n, D8).filter((j) => mine[j]).length); }
    if (mine[i]) return { ...s, mine, cnt, boom: true, rev: s.rev.map((r, x) => r || mine[x]), snd: 'capture' };
    const n2 = { ...s, mine, cnt }; const rev = mineFlood(n2, i); return { ...n2, rev, cheer: rev.filter(Boolean).length - s.rev.filter(Boolean).length > 8 };
  },
  won: (s) => !!s.mine && s.rev.filter(Boolean).length === s.n * s.n - s.total, lost: (s) => s.boom, moves: (s) => `${s.total} mines · ${s.flag.filter(Boolean).length} flags`,
  Board: ({ s, act }) => { const [fl, setFl] = useState(false); return (<div>
    <div className="mb-2 flex justify-center"><button type="button" onClick={() => setFl(!fl)} className={`rounded-full px-4 py-1.5 text-xs font-black ${fl ? 'bg-rose-500 text-white' : 'bg-white/15 text-white'}`} data-testid="mines-flag-mode">{fl ? '🚩 Flag mode ON' : '⛏ Dig mode (tap for flags)'}</button></div>
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${s.n}, minmax(0,1fr))` }}>{s.rev.map((r, i) => <button key={i} type="button" onClick={() => act({ i, flag: fl })} onContextMenu={(e) => { e.preventDefault(); act({ i, flag: true }); }} className={`flex aspect-square items-center justify-center rounded-[4px] text-sm font-black ${r ? (s.mine?.[i] ? 'bg-rose-600' : 'bg-amber-100') : 'bg-gradient-to-b from-lime-400 to-green-600 shadow-[inset_0_-3px_0_rgba(0,0,0,0.25)]'}`} style={{ color: r ? NUMC[s.cnt?.[i]] : undefined }} data-testid={`mine-${i}`}>{r ? (s.mine?.[i] ? '💣' : s.cnt[i] || '') : s.flag[i] ? '🚩' : ''}</button>)}</div></div>); },
};

// ---------- Sudoku Six (2×3 boxes) ----------
const sudokuOk = (v) => { const groups = []; for (let r = 0; r < 6; r += 1) groups.push([0, 1, 2, 3, 4, 5].map((c) => r * 6 + c)); for (let c = 0; c < 6; c += 1) groups.push([0, 1, 2, 3, 4, 5].map((r) => r * 6 + c)); for (let br = 0; br < 3; br += 1) for (let bc = 0; bc < 2; bc += 1) groups.push([0, 1, 2, 3, 4, 5].map((k) => (br * 2 + Math.floor(k / 3)) * 6 + bc * 3 + (k % 3))); const bad = new Set(); groups.forEach((g) => { const seen = {}; g.forEach((i) => { if (!v[i]) return; if (seen[v[i]] != null) { bad.add(i); bad.add(seen[v[i]]); } else seen[v[i]] = i; }); }); return bad; };
const NumPad = ({ n, act, testid, extra }) => <div className="mt-3 flex flex-wrap justify-center gap-1.5">{Array.from({ length: n }, (_, k) => <button key={k} type="button" onClick={() => act({ v: k + 1 })} className={`h-10 w-10 rounded-xl bg-gradient-to-b from-sky-300 to-sky-600 font-display text-lg font-black text-white shadow-[0_3px_0_#075985] ${btn}`} data-testid={`${testid}-${k + 1}`}>{k + 1}</button>)}<button type="button" onClick={() => act({ v: 0 })} className={`h-10 rounded-xl bg-white/15 px-3 text-xs font-black text-white ${btn}`} data-testid={`${testid}-erase`}>Erase</button>{extra}</div>;
export const SUDOKU6 = {
  id: 'sudoku6', title: 'Sudoku Six', clock: 420, sound: 'pop',
  init: (lv, d) => { const dig = shuffle([1, 2, 3, 4, 5, 6]); const rows = [...shuffle([0, 1]), ...shuffle([2, 3]), ...shuffle([4, 5])]; const bands = shuffle([0, 1, 2]); const rOrder = bands.flatMap((b) => [rows[b * 2], rows[b * 2 + 1]]); const cols = [...shuffle([0, 1, 2]), ...shuffle([3, 4, 5])]; const sol = []; for (let r = 0; r < 6; r += 1) for (let c = 0; c < 6; c += 1) { const R = rOrder[r]; const C = cols[c]; sol.push(dig[(3 * (R % 2) + Math.floor(R / 2) + C) % 6]); } const holes = new Set(shuffle([...Array(36).keys()]).slice(0, Math.min(26, 10 + d * 2 + Math.floor(lv / 10)))); const v = sol.map((x, i) => (holes.has(i) ? 0 : x)); return { v, giv: v.map(Boolean), sel: null }; },
  act: (s, a) => { if (a.sel != null) return s.giv[a.sel] ? null : { ...s, sel: a.sel, snd: 'step' }; if (s.sel == null) return null; const v = [...s.v]; v[s.sel] = a.v; return { ...s, v }; },
  won: (s) => s.v.every(Boolean) && !sudokuOk(s.v).size, lost: () => false, moves: (s) => `${s.v.filter((x) => !x).length} empty squares`,
  Board: ({ s, act }) => { const bad = sudokuOk(s.v); return (<div><div className="grid grid-cols-6 gap-[2px] rounded-lg bg-slate-900 p-1">{s.v.map((x, i) => { const r = Math.floor(i / 6); const c = i % 6; return <button key={i} type="button" onClick={() => act({ sel: i })} className={`flex aspect-square items-center justify-center font-display text-xl font-black ${s.sel === i ? 'bg-amber-300' : 'bg-slate-100'} ${bad.has(i) ? 'text-rose-600' : s.giv[i] ? 'text-slate-900' : 'text-sky-600'} ${c === 2 ? 'mr-[3px]' : ''} ${r % 2 === 1 && r < 5 ? 'mb-[3px]' : ''}`} data-testid={`sudoku-${i}`}>{x || ''}</button>; })}</div><NumPad n={6} act={act} testid="sudoku-num" /></div>); },
};

// ---------- Pixel Picross ----------
const runs = (a) => { const o = []; let k = 0; a.forEach((v) => { if (v === 1) k += 1; else if (k) { o.push(k); k = 0; } }); if (k) o.push(k); return o.length ? o : [0]; };
const rowsOf = (b, n) => Array.from({ length: n }, (_, r) => b.slice(r * n, r * n + n));
const colsOf = (b, n) => Array.from({ length: n }, (_, c) => Array.from({ length: n }, (_, r) => b[r * n + c]));
export const PICROSS = {
  id: 'picross', title: 'Pixel Picross', clock: 360, sound: 'pop',
  init: (lv) => { const n = lv <= 10 ? 5 : lv <= 25 ? 6 : 7; const sol = Array.from({ length: n * n }, () => (Math.random() < 0.58 ? 1 : 0)); return { n, rc: rowsOf(sol, n).map(runs), cc: colsOf(sol, n).map(runs), cur: Array(n * n).fill(0) }; },
  act: (s, { i, x }) => { const cur = [...s.cur]; cur[i] = x ? (cur[i] === 2 ? 0 : 2) : cur[i] === 1 ? 0 : 1; return { ...s, cur, snd: x ? 'flip' : 'pop' }; },
  won: (s) => rowsOf(s.cur, s.n).every((r, k) => runs(r).join() === s.rc[k].join()) && colsOf(s.cur, s.n).every((c, k) => runs(c).join() === s.cc[k].join()), lost: () => false, moves: (s) => `${s.cur.filter((v) => v === 1).length} squares filled`,
  Board: ({ s, act }) => { const [x, setX] = useState(false); return (<div>
    <div className="mb-2 flex justify-center"><button type="button" onClick={() => setX(!x)} className="rounded-full bg-white/15 px-4 py-1.5 text-xs font-black text-white" data-testid="picross-mode">{x ? '✕ Marking empty squares' : '■ Filling squares'}</button></div>
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: `auto repeat(${s.n}, minmax(0,1fr))` }}><span />{s.cc.map((c, k) => <span key={k} className="flex flex-col items-center justify-end text-[11px] font-black leading-tight text-amber-200">{c.map((v, j) => <span key={j}>{v}</span>)}</span>)}
      {rowsOf(s.cur, s.n).map((row, r) => [<span key={`c${r}`} className="flex items-center justify-end gap-1 pr-1 text-[11px] font-black text-amber-200">{s.rc[r].join(' ')}</span>, ...row.map((v, c) => <button key={c} type="button" onClick={() => act({ i: r * s.n + c, x })} className={`flex aspect-square items-center justify-center rounded-[3px] text-white/50 ${v === 1 ? 'bg-fuchsia-500 shadow-[0_0_8px_#d946ef]' : 'bg-white/15'}`} data-testid={`picross-${r * s.n + c}`}>{v === 2 ? '✕' : ''}</button>)])}</div></div>); },
};

// ---------- Word Hunt ----------
export const WORDS = ['APPLE', 'TIGER', 'CANDY', 'ROBOT', 'PIZZA', 'MAGIC', 'OCEAN', 'PLANET', 'DRAGON', 'CASTLE', 'GUITAR', 'ROCKET', 'JUNGLE', 'PIRATE', 'WIZARD', 'BANANA', 'COOKIE', 'MONKEY', 'PARROT', 'TURTLE', 'SUMMER', 'WINTER', 'FOREST', 'ISLAND', 'COMET', 'STAR', 'MOON', 'LION', 'BEAR', 'FROG', 'CAKE', 'GOLD', 'KING', 'QUEEN', 'CROWN', 'PRIZE', 'MUSIC', 'DANCE', 'PARTY', 'HAPPY', 'LUCKY', 'SMILE', 'BEACH', 'CLOUD', 'STORM', 'RIVER', 'HONEY', 'LEMON', 'MANGO', 'PEACH', 'GRAPE', 'TRAIN', 'PLANE', 'TRUCK', 'HORSE', 'SNAKE', 'EAGLE', 'SHARK', 'WHALE', 'ZEBRA'];
const WH_DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
export const WORDHUNT = {
  id: 'wordhunt', title: 'Word Hunt', clock: 300, sound: 'pop',
  init: (lv, d) => { const n = lv <= 10 ? 7 : 8; const dirs = WH_DIRS.slice(0, lv <= 5 ? 2 : d >= 6 ? 8 : 4); const g = Array(n * n).fill(''); const words = []; shuffle(WORDS.filter((w) => w.length <= n)).forEach((w) => { if (words.length >= Math.min(8, 4 + Math.floor(d / 2))) return; for (let t = 0; t < 80; t += 1) { const [dr, dc] = pickOne(dirs); const r = rnd(n); const c = rnd(n); const cells = [...w].map((_, k) => [r + dr * k, c + dc * k]); if (!cells.every(([y, x]) => y >= 0 && y < n && x >= 0 && x < n)) continue; const idx = cells.map(([y, x]) => y * n + x); if (!idx.every((i, k) => !g[i] || g[i] === w[k])) continue; idx.forEach((i, k) => { g[i] = w[k]; }); words.push({ w, idx }); break; } }); const AZ = 'ABCDEFGHIJKLMNOPRSTUVWY'; return { n, g: g.map((ch) => ch || AZ[rnd(AZ.length)]), words, found: [], sel: null }; },
  act: (s, i) => { if (s.sel == null) return { ...s, sel: i, snd: 'step' }; const [r1, c1] = [Math.floor(s.sel / s.n), s.sel % s.n]; const [r2, c2] = [Math.floor(i / s.n), i % s.n]; const dr = Math.sign(r2 - r1); const dc = Math.sign(c2 - c1); const len = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1)) + 1; if ((r1 !== r2 && c1 !== c2 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) || len < 2) return { ...s, sel: i === s.sel ? null : i, snd: 'step' }; const idx = Array.from({ length: len }, (_, k) => (r1 + dr * k) * s.n + c1 + dc * k); const hit = s.words.findIndex((w, k) => !s.found.includes(k) && (w.idx.join() === idx.join() || w.idx.join() === [...idx].reverse().join())); if (hit < 0) return { ...s, sel: null, snd: 'bad' }; return { ...s, sel: null, found: [...s.found, hit], cheer: true, snd: 'chime' }; },
  won: (s) => s.found.length === s.words.length, lost: () => false, moves: (s) => `${s.found.length}/${s.words.length} words found`,
  Board: ({ s, act }) => { const hot = new Set(s.found.flatMap((k) => s.words[k].idx)); return (<div>
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${s.n}, minmax(0,1fr))` }}>{s.g.map((ch, i) => <button key={i} type="button" onClick={() => act(i)} className={`flex aspect-square items-center justify-center rounded-md font-display text-lg font-black ${s.sel === i ? 'bg-amber-400 text-slate-900' : hot.has(i) ? 'bg-emerald-500 text-white' : 'bg-white/90 text-slate-800'}`} data-testid={`hunt-${i}`}>{ch}</button>)}</div>
    <div className="mt-2 flex flex-wrap justify-center gap-1.5">{s.words.map((w, k) => <span key={w.w} className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${s.found.includes(k) ? 'bg-emerald-500/30 text-emerald-200 line-through' : 'bg-white/15 text-white'}`}>{w.w}</span>)}</div>
    <p className="mt-1 text-center text-[10px] text-white/60">Tap the first letter, then the last letter of a word</p></div>); },
};

// ---------- Hanoi Towers ----------
const DISC = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#6366f1', '#d946ef'];
export const HANOI = {
  id: 'hanoi', title: 'Hanoi Towers', clock: 300, sound: 'drop',
  init: (lv, d) => { const n = lv <= 5 ? 3 : lv <= 15 ? 4 : lv <= 30 ? 5 : 6; return { n, pegs: [Array.from({ length: n }, (_, k) => n - k), [], []], sel: null, moves: 0, limit: 2 ** n - 1 + Math.max(3, 16 - d) }; },
  act: (s, p) => { if (s.sel == null) return s.pegs[p].length ? { ...s, sel: p, snd: 'step' } : null; if (s.sel === p) return { ...s, sel: null, snd: 'step' }; const from = s.pegs[s.sel]; const disc = from[from.length - 1]; const to = s.pegs[p]; if (to.length && to[to.length - 1] < disc) return null; const pegs = s.pegs.map((x, i) => (i === s.sel ? x.slice(0, -1) : i === p ? [...x, disc] : x)); return { ...s, pegs, sel: null, moves: s.moves + 1 }; },
  won: (s) => s.pegs[2].length === s.n, lost: (s) => s.moves >= s.limit && s.pegs[2].length !== s.n, moves: (s) => `${s.limit - s.moves} moves left · move all to the right peg`,
  Board: ({ s, act }) => <div className="grid grid-cols-3 gap-2">{s.pegs.map((pg, p) => <button key={p} type="button" onClick={() => act(p)} className={`relative flex h-48 flex-col-reverse items-center rounded-xl pb-2 ${s.sel === p ? 'bg-amber-400/25' : 'bg-black/30'}`} data-testid={`hanoi-${p}`}><span className="absolute bottom-2 top-4 w-2 rounded-full bg-amber-800" />{pg.map((d, k) => <span key={d} className={`pty-new relative z-10 h-6 rounded-full shadow-[0_3px_0_rgba(0,0,0,0.35)] ${s.sel === p && k === pg.length - 1 ? '-translate-y-3' : ''} transition-transform`} style={{ width: `${30 + (d / s.n) * 65}%`, background: DISC[(d - 1) % 7] }} />)}<span className="absolute bottom-0 h-2 w-full rounded bg-amber-900" /></button>)}</div>,
};

// ---------- Pipe Flow ----------
const rot = (m) => ((m << 1) | (m >> 3)) & 15;
const BIT = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]];
const pipeFlow = (m, n, src) => { const seen = new Set([src]); const q = [src]; let ok = true; m.forEach((v, i) => { const r = Math.floor(i / n); const c = i % n; BIT.forEach(([b, dr, dc, opp]) => { if (!(v & b)) return; const y = r + dr; const x = c + dc; if (y < 0 || y >= n || x < 0 || x >= n || !(m[y * n + x] & opp)) ok = false; }); }); while (q.length) { const i = q.pop(); const r = Math.floor(i / n); const c = i % n; BIT.forEach(([b, dr, dc, opp]) => { const y = r + dr; const x = c + dc; const j = y * n + x; if (m[i] & b && y >= 0 && y < n && x >= 0 && x < n && m[j] & opp && !seen.has(j)) { seen.add(j); q.push(j); } }); } return { seen, ok }; };
export const PIPES = {
  id: 'pipes', title: 'Pipe Flow', clock: 300, sound: 'flip',
  init: (lv) => { const n = lv <= 5 ? 4 : lv <= 20 ? 5 : 6; const m = Array(n * n).fill(0); const seen = new Set([0]); const st = [0]; while (st.length) { const i = st[st.length - 1]; const r = Math.floor(i / n); const c = i % n; const opts = BIT.filter(([, dr, dc]) => { const y = r + dr; const x = c + dc; return y >= 0 && y < n && x >= 0 && x < n && !seen.has(y * n + x); }); if (!opts.length) { st.pop(); continue; } const [b, dr, dc, opp] = pickOne(opts); const j = (r + dr) * n + c + dc; m[i] |= b; m[j] |= opp; seen.add(j); st.push(j); } const src = Math.floor(n / 2) * n + Math.floor(n / 2); const cur = m.map((v) => { let x = v; for (let k = rnd(4); k > 0; k -= 1) x = rot(x); return x; }); return { n, m: cur, src, taps: 0 }; },
  act: (s, i) => { const m = [...s.m]; m[i] = rot(m[i]); return { ...s, m, taps: s.taps + 1 }; },
  won: (s) => { const { seen, ok } = pipeFlow(s.m, s.n, s.src); return ok && seen.size === s.n * s.n; }, lost: () => false, moves: (s) => `${pipeFlow(s.m, s.n, s.src).seen.size}/${s.n * s.n} pipes flowing`,
  Board: ({ s, act }) => { const { seen } = pipeFlow(s.m, s.n, s.src); return <div className="grid gap-1 rounded-xl bg-slate-900 p-1.5" style={{ gridTemplateColumns: `repeat(${s.n}, minmax(0,1fr))` }}>{s.m.map((v, i) => { const col = seen.has(i) ? '#38bdf8' : '#a16207'; return <button key={i} type="button" onClick={() => act(i)} className={`aspect-square rounded-md ${i === s.src ? 'bg-sky-900' : 'bg-slate-800'}`} data-testid={`pipe-${i}`}><svg viewBox="0 0 10 10" className="h-full w-full transition-transform">{v & 1 ? <line x1="5" y1="5" x2="5" y2="0" stroke={col} strokeWidth="2.6" strokeLinecap="round" /> : null}{v & 2 ? <line x1="5" y1="5" x2="10" y2="5" stroke={col} strokeWidth="2.6" strokeLinecap="round" /> : null}{v & 4 ? <line x1="5" y1="5" x2="5" y2="10" stroke={col} strokeWidth="2.6" strokeLinecap="round" /> : null}{v & 8 ? <line x1="5" y1="5" x2="0" y2="5" stroke={col} strokeWidth="2.6" strokeLinecap="round" /> : null}<circle cx="5" cy="5" r={i === s.src ? 2.2 : 1.4} fill={col} /></svg></button>; })}</div>; },
};

// ---------- Echo Pads ----------
const PADC = ['#ef4444', '#22c55e', '#3b82f6', '#facc15', '#a855f7', '#f97316'];
export const ECHO = {
  id: 'echo', title: 'Echo Pads', clock: 300, sound: 'pop',
  init: (lv, d) => { const P = lv <= 15 ? 4 : 6; return { P, seq: [rnd(P), rnd(P)], phase: 'show', at: 0, round: 1, goal: 4 + d, lives: d <= 4 ? 2 : 1, speed: Math.max(330, 650 - d * 30) }; },
  act: (s, a) => { if (a === 'shown') return { ...s, phase: 'input', at: 0, snd: 'none' }; if (s.phase !== 'input') return null; if (a !== s.seq[s.at]) return { ...s, lives: s.lives - 1, phase: 'show', at: 0, snd: 'bad' }; const at = s.at + 1; if (at < s.seq.length) return { ...s, at, snd: `pad${a}` }; return { ...s, round: s.round + 1, seq: [...s.seq, rnd(s.P)], phase: 'show', at: 0, cheer: true, snd: `pad${a}` }; },
  won: (s) => s.round > s.goal, lost: (s) => s.lives <= 0, moves: (s) => `Round ${Math.min(s.round, s.goal)}/${s.goal} · ${s.lives} ${s.lives === 1 ? 'life' : 'lives'}`,
  Board: ({ s, act }) => { const [lit, setLit] = useState(-1); useEffect(() => { if (s.phase !== 'show') return undefined; const ts = []; s.seq.forEach((p, k) => { ts.push(setTimeout(() => { setLit(p); sfx(`pad${p}`); }, 700 + k * s.speed)); ts.push(setTimeout(() => setLit(-1), 700 + k * s.speed + s.speed * 0.6)); }); ts.push(setTimeout(() => act('shown'), 800 + s.seq.length * s.speed)); return () => ts.forEach(clearTimeout); }, [s.phase, s.round, s.lives]); // eslint-disable-line react-hooks/exhaustive-deps
    return (<div><p className="mb-2 text-center text-xs font-black text-white" data-testid="echo-phase">{s.phase === 'show' ? 'Watch and listen…' : 'Your turn: repeat it!'}</p><div className={`grid gap-3 ${s.P === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>{Array.from({ length: s.P }, (_, p) => <button key={p} type="button" disabled={s.phase !== 'input'} onClick={() => act(p)} className={`aspect-square rounded-3xl border-4 border-white/20 transition-all duration-150 ${lit === p ? 'scale-105 brightness-150' : 'brightness-75'} active:scale-95 active:brightness-150`} style={{ background: PADC[p], boxShadow: lit === p ? `0 0 40px ${PADC[p]}` : 'none' }} data-testid={`echo-pad-${p}`} />)}</div></div>); },
};

// ---------- Pair Flip ----------
const PF = ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🐯', '🐨', '🐵', '🦉', '🐳', '🦋'];
export const PAIRFLIP = {
  id: 'pairflip', title: 'Pair Flip', clock: 240, sound: 'flip',
  init: (lv, d) => { const pairs = lv <= 5 ? 6 : lv <= 20 ? 8 : 10; const cards = shuffle(PF.slice(0, pairs).flatMap((e) => [e, e])); return { cards, open: [], done: cards.map(() => false), miss: 0, maxMiss: Math.max(pairs, Math.round(pairs * 2.4 - d * 0.7)) }; },
  act: (s, i) => { if (i === 'hide') return { ...s, open: [], snd: 'none' }; if (s.done[i] || s.open.includes(i)) return null; const open = [...(s.open.length === 2 ? [] : s.open), i]; if (open.length < 2) return { ...s, open }; if (s.cards[open[0]] === s.cards[open[1]]) { const done = [...s.done]; done[open[0]] = true; done[open[1]] = true; return { ...s, done, open: [], cheer: Math.random() < 0.3, snd: 'chime' }; } return { ...s, open, miss: s.miss + 1 }; },
  won: (s) => s.done.every(Boolean), lost: (s) => s.miss > s.maxMiss, moves: (s) => `${s.maxMiss - s.miss} misses left`,
  Board: ({ s, act }) => { useEffect(() => { if (s.open.length !== 2) return undefined; const t = setTimeout(() => act('hide'), 900); return () => clearTimeout(t); }, [s.open.join()]); // eslint-disable-line react-hooks/exhaustive-deps
    return <div className="grid grid-cols-4 gap-2">{s.cards.map((e, i) => { const up = s.done[i] || s.open.includes(i); return <button key={i} type="button" onClick={() => act(i)} className={`flex aspect-[3/4] items-center justify-center rounded-xl text-3xl transition-all duration-300 ${up ? 'bg-white' : 'bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-[0_4px_0_#581c87]'} ${s.done[i] ? 'opacity-60' : ''}`} style={{ transform: up ? 'rotateY(0deg)' : 'rotateY(180deg)' }} data-testid={`pair-${i}`}>{up ? e : ''}</button>; })}</div>; },
};

export const SOLOS3 = { pty_slide15: SLIDE, pty_merge2048: MERGE, pty_mine_sweep: MINES, pty_sudoku6: SUDOKU6, pty_picross: PICROSS, pty_word_hunt: WORDHUNT, pty_hanoi: HANOI, pty_pipe_flow: PIPES, pty_echo_pads: ECHO, pty_pair_flip: PAIRFLIP };
