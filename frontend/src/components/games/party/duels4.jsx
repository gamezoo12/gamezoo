import { useState } from 'react';
import { Big, Cells, Coins, K, NumBtns, Stone, countOf, duelDef, lineHeur, lineOwner, nbrs, D4, perfect, rnd, stuckLoses, usePick, windows, xorAll } from './gkit';

// Batch 4 duels: line games, symbol games and exact-theory take-away games.
const lineGame = ({ R, C, k, gravity, misere, ...o }) => duelDef({
  init: () => Array(R * C).fill(0),
  legal: (s) => (gravity ? [...Array(C).keys()].filter((c) => !s.b[c]) : s.b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)),
  play: (s, m) => { const b = [...s.b]; let i = m; if (gravity) for (let r = R - 1; r >= 0; r -= 1) if (!b[r * C + m]) { i = r * C + m; break; } b[i] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => { const w = lineOwner(s.b, R, C, k); if (w) return misere ? 3 - w : w; return s.b.every(Boolean) ? 0 : null; },
  score: (b) => (misere ? -1 : 1) * lineHeur(b, R, C, k),
  Board: ({ g, legal, onMove }) => (
    <div className="rounded-xl p-1.5" style={{ background: gravity ? 'linear-gradient(180deg,#1d4ed8,#1e3a8a)' : 'rgba(0,0,0,0.35)' }}>
      <Cells cols={C} cells={g.b} onCell={(i) => { const m = gravity ? i % C : i; if (legal.includes(m)) onMove(m); }} cellCls={() => (gravity ? 'rounded-full bg-slate-900/80 shadow-[inset_0_3px_6px_rgba(0,0,0,0.7)]' : 'bg-white/10')}
        render={(v) => (v ? (!gravity ? <span className={`pty-new font-display text-3xl font-black ${v === 1 ? 'text-sky-300' : 'text-rose-300'}`}>{v === 1 ? 'X' : 'O'}</span> : <Stone side={v} cls="inset-[8%]" />) : null)} />
    </div>
  ),
  ...o,
});
export const MISERE = lineGame({ id: 'misere', title: 'Toe Tac Tic', bot: 1, R: 3, C: 3, k: 3, misere: true, hint: 'Your turn: place an X, do NOT make three in a row', depth: (lv) => Math.min(6, 2 + lv) });
export const TINYDROP = lineGame({ id: 'tinydrop', title: 'Tiny Drop', bot: 0, R: 4, C: 5, k: 3, gravity: true, hint: 'Your turn: drop a disc, connect three', depth: (lv) => Math.min(6, 2 + Math.floor(lv / 2)) });
export const DONTCONNECT = lineGame({ id: 'dontconnect', title: "Don't Connect", bot: 3, R: 6, C: 7, k: 4, gravity: true, misere: true, hint: 'Your turn: drop a disc, never make four in a row', depth: (lv) => (lv <= 4 ? 2 : lv <= 8 ? 3 : 4) });

// ---------- Symbol games: pick X or O each turn ----------
function SymBoard({ g, legal, onMove, n }) {
  const [sym, setSym] = useState(0);
  return (
    <div>
      <div className="mb-2 flex justify-center gap-2">{['X', 'O'].map((t, k) => <button key={t} type="button" onClick={() => setSym(k)} className={`h-9 w-14 rounded-full font-black transition-colors ${sym === k ? 'bg-amber-400 text-slate-900' : 'bg-white/15 text-white'}`} data-testid={`sym-${t}`}>{t}</button>)}</div>
      <Cells cols={n} cells={g.b} onCell={(i) => legal.includes(i * 2 + sym) && onMove(i * 2 + sym)} cellCls={() => 'bg-white/10'}
        render={(v, i) => (v ? <span className={`pty-new font-display ${n > 4 ? 'text-xl' : 'text-4xl'} font-black ${v === 1 ? 'text-amber-300' : 'text-fuchsia-300'} ${g.last != null && g.last >> 1 === i ? 'drop-shadow-[0_0_8px_#fff]' : ''}`}>{v === 1 ? 'X' : 'O'}</span> : null)} />
    </div>
  );
}
const symLegal = (s) => s.b.flatMap((v, i) => (v ? [] : [i * 2, i * 2 + 1]));
const symPlay = (s, m) => { const b = [...s.b]; b[m >> 1] = (m & 1) + 1; return { b, turn: 3 - s.turn }; };
export const ORDER = duelDef({
  id: 'order', title: 'Order & Chaos', bot: 1, hint: 'You are Order: pick X or O, then a square. Make 5 of one symbol in a row',
  colors: [{ name: 'Order', hex: '#facc15' }, { name: 'Chaos', hex: '#a855f7' }],
  init: () => Array(36).fill(0), legal: symLegal, play: symPlay,
  result: (s) => (lineOwner(s.b, 6, 6, 5) ? 1 : s.b.every(Boolean) ? 2 : null),
  score: (b) => -windows(6, 6, 5).reduce((t, w) => { const vals = new Set(w.map((i) => b[i]).filter(Boolean)); if (vals.size > 1) return t; return t + 3 ** w.filter((i) => b[i]).length; }, 0),
  depth: (lv) => (lv <= 5 ? 1 : 2), info: (b, side) => (side === 1 ? 'Order' : 'Chaos'),
  Board: (p) => <SymBoard {...p} n={6} />,
});
export const WILDTTT = duelDef({
  id: 'wild', title: 'Wild Tic Tac Toe', bot: 0, hint: 'Your turn: pick X or O. Whoever completes ANY three in a row wins',
  init: () => Array(9).fill(0), legal: symLegal, play: symPlay,
  result: (s) => (lineOwner(s.b, 3, 3, 3) ? 3 - s.turn : s.b.every(Boolean) ? 0 : null),
    depth: (lv) => (lv <= 3 ? 2 : 3), Board: (p) => <SymBoard {...p} n={3} />,
});

// ---------- Pick Fifteen ----------
const TRIPLES = []; for (let a = 1; a <= 9; a += 1) for (let b = a + 1; b <= 9; b += 1) { const c = 15 - a - b; if (c > b && c <= 9) TRIPLES.push([a, b, c]); }
export const PICK15 = duelDef({
  id: 'pick15', title: 'Pick Fifteen', bot: 2, hint: 'Your turn: claim a number. Own three that add up to 15', sound: 'card',
  init: () => Array(9).fill(0), legal: (s) => s.b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0),
  play: (s, m) => { const b = [...s.b]; b[m] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => { for (const t of TRIPLES) { const v = s.b[t[0] - 1]; if (v && t.every((x) => s.b[x - 1] === v)) return v; } return s.b.every(Boolean) ? 0 : null; },
  score: (b) => TRIPLES.reduce((t, tr) => { const a = tr.filter((x) => b[x - 1] === 2).length; const h = tr.filter((x) => b[x - 1] === 1).length; return a && h ? t : t + (a ? 4 ** a : 0) - (h ? 4 ** h : 0); }, 0),
  depth: (lv) => Math.min(6, 2 + Math.floor(lv / 2)),
  info: (b, side) => `${b.map((v, i) => (v === side ? i + 1 : 0)).filter(Boolean).join(' ') || 'no numbers'}`,
  Board: ({ g, legal, onMove }) => <Cells cols={3} cells={g.b} gap="gap-2" onCell={(i) => legal.includes(i) && onMove(i)} cellCls={(v) => (v === 1 ? 'bg-sky-500' : v === 2 ? 'bg-rose-500' : 'bg-gradient-to-b from-amber-100 to-amber-300 shadow-[0_4px_0_#b45309]')} render={(v, i) => <span className={`font-display text-4xl font-black ${v ? 'text-white' : 'text-slate-900'}`}>{i + 1}</span>} />,
});

// ---------- Take-away games with exact bot theory ----------
const takeBoard = (label, btns) => ({ g, legal, onMove }) => (
  <div className="space-y-3 p-2"><Big testid="pile-count">{label(g.b)}</Big><Coins n={Math.min(60, g.b.n)} /><NumBtns items={btns(g.b).filter(([, m]) => legal.includes(m))} onPick={onMove} testid="take" /></div>
);
export const LASTCOIN = duelDef({
  id: 'lastcoin', title: 'Last Coin', bot: 0, hint: 'Your turn: take some coins. Take the LAST coin to win', sound: 'coin',
  init: (lv) => ({ n: 15 + rnd(10) + (lv > 10 ? 10 : 0), k: lv <= 10 ? 3 : 4 }),
  legal: (s) => Array.from({ length: Math.min(s.b.k, s.b.n) }, (_, i) => i + 1),
  play: (s, m) => ({ b: { ...s.b, n: s.b.n - m }, turn: 3 - s.turn }),
  result: (s) => (s.b.n === 0 ? 3 - s.turn : null), score: (b, s) => perfect(s, b.n % (b.k + 1) === 0), depth: () => 1,
  Board: takeBoard((b) => `${b.n} coins`, (b) => Array.from({ length: b.k }, (_, i) => [`Take ${i + 1}`, i + 1])),
});
const SQW = [false]; for (let n = 1; n <= 200; n += 1) { let w = false; for (let q = 1; q * q <= n; q += 1) if (!SQW[n - q * q]) w = true; SQW.push(w); }
export const SQCOINS = duelDef({
  id: 'sqcoins', title: 'Square Coins', bot: 2, hint: 'Your turn: take 1, 4, 9, 16… coins. Take the last coin to win', sound: 'coin',
  init: (lv) => ({ n: 20 + rnd(15) + (lv > 10 ? 20 : 0) }),
  legal: (s) => { const o = []; for (let q = 1; q * q <= s.b.n; q += 1) o.push(q * q); return o; },
  play: (s, m) => ({ b: { n: s.b.n - m }, turn: 3 - s.turn }),
  result: (s) => (s.b.n === 0 ? 3 - s.turn : null), score: (b, s) => perfect(s, !SQW[b.n]), depth: () => 1,
  Board: takeBoard((b) => `${b.n} coins`, () => [1, 4, 9, 16, 25, 36, 49].map((q) => [`Take ${q}`, q])),
});
const HALF = [false]; for (let n = 1; n <= 400; n += 1) HALF.push(!HALF[n - 1] || !HALF[Math.floor(n / 2)]);
export const HALFONE = duelDef({
  id: 'halfone', title: 'Half or One', bot: 3, hint: 'Your turn: subtract 1 or halve the number. Hit 0 to win', sound: 'chime',
  init: (lv) => ({ n: 20 + rnd(30) + (lv > 10 ? 40 : 0) }), legal: () => [1, 2],
  play: (s, m) => ({ b: { n: m === 1 ? s.b.n - 1 : Math.floor(s.b.n / 2) }, turn: 3 - s.turn }),
  result: (s) => (s.b.n === 0 ? 3 - s.turn : null), score: (b, s) => perfect(s, !HALF[b.n]), depth: () => 1,
  Board: ({ g, legal, onMove }) => <div className="space-y-3 p-4"><Big testid="half-number">{g.b.n}</Big><NumBtns items={[['− 1', 1], ['Halve ÷2', 2]].filter(([, m]) => legal.includes(m))} onPick={onMove} testid="half" /></div>,
});

// ---------- Corner the Queen (Wythoff) ----------
const PHI = (1 + Math.sqrt(5)) / 2;
const WY = new Set(); for (let k = 0; k < 20; k += 1) { const a = Math.floor(k * PHI); WY.add(`${a},${a + k}`); WY.add(`${a + k},${a}`); }
export const QUEEN = duelDef({
  id: 'queen', title: 'Corner the Queen', bot: 1, hint: 'Your turn: slide the queen left, down or diagonally down-left. Reach the gold corner',
  init: (lv) => { const N = lv <= 10 ? 8 : 10; let x; let y; do { x = 3 + rnd(N - 3); y = 3 + rnd(N - 3); } while (WY.has(`${x},${y}`) && Math.random() < 0.6); return { x, y, N }; },
  legal: (s) => { const { x, y } = s.b; const o = []; for (let d = 1; d <= x; d += 1) o.push(y * 16 + x - d); for (let d = 1; d <= y; d += 1) o.push((y - d) * 16 + x); for (let d = 1; d <= Math.min(x, y); d += 1) o.push((y - d) * 16 + x - d); return o; },
  play: (s, m) => ({ b: { ...s.b, x: m % 16, y: Math.floor(m / 16) }, turn: 3 - s.turn, snd: 'slide' }),
  result: (s) => (s.b.x === 0 && s.b.y === 0 ? 3 - s.turn : null), score: (b, s) => perfect(s, WY.has(`${b.x},${b.y}`)), depth: () => 1,
  Board: ({ g, legal, onMove }) => { const { N } = g.b; const cells = Array.from({ length: N * N }, (_, i) => { const x = i % N; const y = N - 1 - Math.floor(i / N); return y * 16 + x; }); return (
    <Cells cols={N} cells={cells} gap="gap-0" onCell={(i) => legal.includes(cells[i]) && onMove(cells[i])} cellCls={(m, i) => `rounded-none ${m === 0 ? 'bg-amber-400' : (Math.floor(i / N) + i) % 2 ? 'bg-emerald-900' : 'bg-emerald-200/80'}`}
      render={(m) => (m === g.b.y * 16 + g.b.x ? <span className="pty-new text-3xl drop-shadow-[0_0_8px_#fde68a]">♛</span> : legal.includes(m) ? <span className="h-1/3 w-1/3 rounded-full bg-amber-300/80" /> : m === 0 ? '🏁' : null)} />); },
});

// ---------- Grundy's Split ----------
const GR = [0, 0, 0]; for (let n = 3; n <= 40; n += 1) { const s = new Set(); for (let a = 1; a < n - a; a += 1) s.add(GR[a] ^ GR[n - a]); let m = 0; while (s.has(m)) m += 1; GR.push(m); }
const PILEC = ['#f472b6', '#38bdf8', '#a3e635', '#facc15', '#c084fc'];
export const GRUNDY = duelDef({
  id: 'grundy', title: "Grundy's Split", bot: 2, hint: 'Your turn: tap a block to split that stack into two UNEQUAL stacks', sound: 'capture',
  init: (lv) => (lv <= 10 ? [9 + rnd(5)] : [7 + rnd(4), 6 + rnd(5)]),
  legal: (s) => s.b.flatMap((n, p) => Array.from({ length: n - 1 }, (_, i) => i + 1).filter((a) => a !== n - a).map((a) => p * 100 + a)),
  play: (s, m) => { const p = Math.floor(m / 100); const a = m % 100; const b = [...s.b]; b.splice(p, 1, a, s.b[p] - a); return { b: b.sort((x, y) => y - x), turn: 3 - s.turn }; },
  result: (s) => stuckLoses(GRUNDY.legal)(s), score: (b, s) => perfect(s, xorAll(b.map((n) => GR[n])) === 0), depth: () => 1,
  Board: ({ g, legal, onMove }) => <div className="space-y-2 p-2">{g.b.map((n, p) => <div key={`${p}-${n}`} className="flex items-center gap-0.5 rounded-lg bg-black/30 p-1.5">{Array.from({ length: n }, (_, i) => <button key={i} type="button" onClick={() => legal.includes(p * 100 + i + 1) && onMove(p * 100 + i + 1)} className={`h-8 flex-1 rounded transition-transform hover:-translate-y-0.5 ${legal.includes(p * 100 + i + 1) ? 'ring-1 ring-white/60' : 'opacity-80'}`} style={{ background: PILEC[p % 5], maxWidth: 28 }} data-testid={`grundy-${p}-${i}`} />)}<span className="ml-2 text-xs font-black text-white">{n}</span></div>)}</div>,
});

// ---------- Row Slide (Northcott) ----------
export const NORTHCOTT = duelDef({
  id: 'northcott', title: 'Row Slide', bot: 3, hint: 'Your turn: slide one of your blue sliders toward the red one', sound: 'slide',
  init: (lv) => Array.from({ length: lv <= 10 ? 4 : 5 }, () => [rnd(3), 5 + rnd(3)]),
  legal: (s) => s.b.flatMap(([a, z], r) => Array.from({ length: z - a - 1 }, (_, k) => r * 100 + a + 1 + k)),
  play: (s, m) => { const r = Math.floor(m / 100); const p = m % 100; const b = s.b.map((x) => [...x]); b[r][s.turn - 1] = p; return { b, turn: 3 - s.turn }; },
  result: (s) => stuckLoses(NORTHCOTT.legal)(s), score: (b, s) => perfect(s, xorAll(b.map(([a, z]) => z - a - 1)) === 0), depth: () => 1,
  Board: ({ g, legal, onMove }) => <div className="space-y-2 p-1">{g.b.map(([a, z], r) => <div key={r} className="grid grid-cols-8 gap-1 rounded-lg bg-slate-900/70 p-1">{Array.from({ length: 8 }, (_, c) => <button key={c} type="button" onClick={() => legal.includes(r * 100 + c) && onMove(r * 100 + c)} className="relative aspect-square rounded bg-white/10" data-testid={`row-${r}-${c}`}>{c === a && <Stone side={1} cls="inset-[8%] rounded-md" />}{c === z && <Stone side={2} cls="inset-[8%] rounded-md" />}{legal.includes(r * 100 + c) && <span className="absolute inset-[38%] rounded-full bg-amber-300/70" />}</button>)}</div>)}</div>,
});

// ---------- Cram, Snort, Col (placement on a grid) ----------
const cramN = (lv) => (lv <= 5 ? 4 : lv <= 15 ? 5 : 6);
const cramMoves = (b, both) => { const n = Math.round(Math.sqrt(b.length)); const o = []; b.forEach((v, i) => { if (v) return; if ((i + 1) % n && !b[i + 1]) { o.push(i * K + i + 1); if (both) o.push((i + 1) * K + i); } if (i + n < b.length && !b[i + n]) { o.push(i * K + i + n); if (both) o.push((i + n) * K + i); } }); return o; };
function PickCells({ g, legal, onMove, cols, color }) {
  const { sel, tg, tap } = usePick(legal, onMove);
  return <Cells cols={cols} cells={g.b} onCell={tap} cellCls={(v, i) => (v ? (v === 1 ? 'bg-sky-500' : 'bg-rose-500') : sel === i ? 'bg-amber-300' : tg.has(i) ? 'bg-amber-200/60' : color || 'bg-white/15')} render={() => null} />;
}
export const CRAM = duelDef({
  id: 'cram', title: 'Cram', bot: 0, hint: 'Your turn: tap two side-by-side empty squares to place a domino. Last move wins', sound: 'thud',
  init: (lv) => Array(cramN(lv) ** 2).fill(0), legal: (s) => cramMoves(s.b, true), candidates: (s) => cramMoves(s.b, false),
  play: (s, m) => { const b = [...s.b]; b[Math.floor(m / K)] = s.turn; b[m % K] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => (cramMoves(s.b, false).length ? null : 3 - s.turn), depth: (lv) => (lv <= 4 ? 2 : 3),
  Board: (p) => <PickCells {...p} cols={Math.round(Math.sqrt(p.g.b.length))} />,
});
const placeFor = (b, side, snort) => { const n = Math.round(Math.sqrt(b.length)); return b.map((v, i) => (v || nbrs(i, n, n, D4).some((j) => b[j] === (snort ? 3 - side : side)) ? -1 : i)).filter((i) => i >= 0); };
const placeGame = (o, snort) => duelDef({
  init: (lv) => Array((lv <= 10 ? 5 : 6) ** 2).fill(0), legal: (s) => placeFor(s.b, s.turn, snort),
  play: (s, m) => { const b = [...s.b]; b[m] = s.turn; return { b, turn: 3 - s.turn }; },
  result: (s) => (placeFor(s.b, s.turn, snort).length ? null : 3 - s.turn),
  score: (b) => placeFor(b, 2, snort).length - placeFor(b, 1, snort).length, depth: (lv) => (lv <= 3 ? 1 : 2),
  info: (b, side) => `${countOf(b, side)} placed`,
  ...o,
});
export const SNORT = placeGame({
  id: 'snort', title: 'Snort Pasture', bot: 2, hint: 'Your turn: place a cow, never next to a bull. Last move wins', sound: 'pop',
  Board: ({ g, legal, onMove }) => <Cells cols={Math.round(Math.sqrt(g.b.length))} cells={g.b} onCell={(i) => legal.includes(i) && onMove(i)} cellCls={(v, i) => (legal.includes(i) ? 'bg-lime-500/70' : 'bg-green-900/70')} render={(v) => (v ? <span className="pty-new text-2xl">{v === 1 ? '🐄' : '🐂'}</span> : null)} />,
}, true);
export const COL = placeGame({
  id: 'col', title: 'Col Map', bot: 1, hint: 'Your turn: paint a region blue, never touching your own blue. Last move wins', sound: 'drop',
  Board: ({ g, legal, onMove }) => <Cells cols={Math.round(Math.sqrt(g.b.length))} cells={g.b} onCell={(i) => legal.includes(i) && onMove(i)} cellCls={(v, i) => (v === 1 ? 'bg-sky-500' : v === 2 ? 'bg-rose-500' : legal.includes(i) ? 'bg-amber-100/80' : 'bg-amber-100/25')} render={() => null} />,
}, false);

export const DUELS4 = { pty_misere_ttt: MISERE, pty_tiny_drop: TINYDROP, pty_dont_connect: DONTCONNECT, pty_order_chaos: ORDER, pty_wild_ttt: WILDTTT, pty_pick15: PICK15, pty_last_coin: LASTCOIN, pty_square_coins: SQCOINS, pty_half_one: HALFONE, pty_corner_queen: QUEEN, pty_grundy: GRUNDY, pty_northcott: NORTHCOTT, pty_cram: CRAM, pty_snort: SNORT, pty_col: COL };
