import { D4, D8, nbrs, pickOne, rnd, shuffle } from './gkit';
import { WORDS } from './solos3';

// Batch 4 solos: cards, words, numbers and chess puzzles.
const btn = 'transition-transform active:scale-95';
const RK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SU = ['♠', '♥', '♦', '♣'];
const deck = () => shuffle(Array.from({ length: 52 }, (_, i) => ({ r: (i % 13) + 1, s: Math.floor(i / 13), id: i })));
const Card = ({ c, onClick, sel, dim, testid, small }) => <button type="button" onClick={onClick} disabled={!onClick} className={`pty-new flex flex-col items-center justify-center rounded-lg border border-slate-300 bg-white font-black leading-none shadow-md ${small ? 'h-12 w-9 text-xs' : 'h-16 w-11 text-sm'} ${sel ? 'ring-4 ring-amber-400 -translate-y-1' : ''} ${dim ? 'brightness-75' : ''} ${c.s === 1 || c.s === 2 ? 'text-rose-600' : 'text-slate-900'} ${btn}`} data-testid={testid}><span>{RK[c.r]}</span><span className="text-lg">{SU[c.s]}</span></button>;
const Back = ({ n, onClick, testid }) => <button type="button" onClick={onClick} className={`flex h-16 w-11 items-center justify-center rounded-lg border-2 border-white bg-gradient-to-br from-indigo-500 to-rose-500 text-xs font-black text-white shadow-md ${btn}`} data-testid={testid}>{n}</button>;

// ---------- Pyramid 13 ----------
const pyrExposed = (p, i) => { const r = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2); const k = i - (r * (r + 1)) / 2; if (r === 6) return true; const a = ((r + 1) * (r + 2)) / 2 + k; return !p[a] && !p[a + 1]; };
const pyrAvail = (s) => [...s.p.map((c, i) => (c && pyrExposed(s.p, i) ? c : null)).filter(Boolean), ...(s.w.length ? [s.w[s.w.length - 1]] : [])];
export const PYRAMID = {
  id: 'pyramid', title: 'Pyramid 13', clock: 300, sound: 'card',
  init: (lv, d) => { const dk = deck(); return { p: dk.slice(0, 28), st: dk.slice(28), w: [], sel: null, passes: d <= 4 ? 2 : 1, removed: 0, goal: Math.min(28, 8 + d * 2 + Math.floor(lv / 10)) }; },
  act: (s, a) => {
    if (a === 'draw') { if (s.st.length) return { ...s, st: s.st.slice(0, -1), w: [...s.w, s.st[s.st.length - 1]], sel: null }; if (!s.passes || !s.w.length) return null; return { ...s, st: [...s.w].reverse(), w: [], passes: s.passes - 1, sel: null, snd: 'whoosh' }; }
    const card = a.w ? s.w[s.w.length - 1] : s.p[a.p]; if (!card || (a.p != null && !pyrExposed(s.p, a.p))) return null;
    const take = (st, cs) => { const ids = new Set(cs.map((c) => c.id)); const n = { ...st, p: st.p.map((c) => (c && ids.has(c.id) ? null : c)), w: st.w.filter((c) => !ids.has(c.id)), sel: null }; return { ...n, removed: n.p.filter((c) => !c).length, cheer: cs.length === 2 && Math.random() < 0.3, snd: 'chime' }; };
    if (card.r === 13) return take(s, [card]);
    if (!s.sel || s.sel.id === card.id) return { ...s, sel: s.sel?.id === card.id ? null : card };
    if (s.sel.r + card.r === 13) return take(s, [s.sel, card]);
    return { ...s, sel: card };
  },
  won: (s) => s.removed >= s.goal,
  lost: (s) => { if (s.st.length || (s.passes && s.w.length)) return false; const av = pyrAvail(s); return !av.some((c) => c.r === 13 || av.some((o) => o.id !== c.id && o.r + c.r === 13)); },
  moves: (s) => `${s.removed}/${s.goal} cleared · pairs make 13 (K alone)`,
  Board: ({ s, act }) => (<div className="space-y-2">
    <div className="flex flex-col items-center">{[0, 1, 2, 3, 4, 5, 6].map((r) => <div key={r} className="-mt-2 flex gap-0.5 first:mt-0">{Array.from({ length: r + 1 }, (_, k) => { const i = (r * (r + 1)) / 2 + k; const c = s.p[i]; return c ? <Card key={i} c={c} small sel={s.sel?.id === c.id} dim={!pyrExposed(s.p, i)} onClick={() => act({ p: i })} testid={`pyr-${i}`} /> : <span key={i} className="h-12 w-9" />; })}</div>)}</div>
    <div className="flex items-center justify-center gap-3"><Back n={s.st.length || (s.passes ? '↺' : '✕')} onClick={() => act('draw')} testid="pyr-stock" />{s.w.length ? <Card c={s.w[s.w.length - 1]} sel={s.sel?.id === s.w[s.w.length - 1].id} onClick={() => act({ w: true })} testid="pyr-waste" /> : <span className="h-16 w-11 rounded-lg border-2 border-dashed border-white/30" />}</div></div>),
};

// ---------- Golf Solitaire ----------
const golfOk = (a, b, wrap) => Math.abs(a - b) === 1 || (wrap && Math.abs(a - b) === 12);
const golfPlayable = (s) => s.cols.some((c) => c.length && golfOk(c[c.length - 1].r, s.w[s.w.length - 1].r, s.wrap));
export const GOLF = {
  id: 'golf', title: 'Golf Solitaire', clock: 300, sound: 'card',
  init: (lv, d) => { const dk = deck(); const cols = Array.from({ length: 7 }, (_, c) => dk.slice(c * 5, c * 5 + 5)); return { cols, st: dk.slice(36), w: [dk[35]], wrap: d <= 4, cleared: 0, goal: Math.min(35, 14 + d * 2) }; },
  act: (s, a) => { if (a === 'draw') return s.st.length ? { ...s, st: s.st.slice(0, -1), w: [...s.w, s.st[s.st.length - 1]] } : null; const col = s.cols[a]; if (!col.length) return null; const c = col[col.length - 1]; if (!golfOk(c.r, s.w[s.w.length - 1].r, s.wrap)) return null; return { ...s, cols: s.cols.map((x, i) => (i === a ? x.slice(0, -1) : x)), w: [...s.w, c], cleared: s.cleared + 1, cheer: Math.random() < 0.12 }; },
  won: (s) => s.cleared >= s.goal, lost: (s) => !s.st.length && !golfPlayable(s), moves: (s) => `${s.cleared}/${s.goal} cards cleared · play one higher or lower`,
  Board: ({ s, act }) => (<div className="space-y-3"><div className="grid grid-cols-7 gap-1">{s.cols.map((col, i) => <button key={i} type="button" onClick={() => act(i)} className="flex flex-col items-center" data-testid={`golf-col-${i}`}>{col.map((c, k) => <span key={c.id} className={k ? '-mt-8' : ''}><Card c={c} small dim={k < col.length - 1} /></span>)}</button>)}</div>
    <div className="flex items-center justify-center gap-3"><Back n={s.st.length} onClick={() => act('draw')} testid="golf-stock" /><Card c={s.w[s.w.length - 1]} testid="golf-waste" /></div></div>),
};

// ---------- Binary Grid (Takuzu) ----------
const binOk = (v, n, i) => { const r = Math.floor(i / n); const c = i % n; const x = v[i]; if (c >= 2 && v[i - 1] === x && v[i - 2] === x) return false; if (r >= 2 && v[i - n] === x && v[i - 2 * n] === x) return false; const row = v.slice(r * n, r * n + c + 1).filter((y) => y === x).length; const col = Array.from({ length: r + 1 }, (_, k) => v[k * n + c]).filter((y) => y === x).length; return row <= n / 2 && col <= n / 2; };
const binGen = (n) => { const v = Array(n * n).fill(-1); const go = (i) => { if (i === n * n) return true; for (const x of shuffle([0, 1])) { v[i] = x; if (binOk(v, n, i) && go(i + 1)) return true; } v[i] = -1; return false; }; go(0); return v; };
const binValid = (v, n) => { if (v.includes(-1)) return false; for (let k = 0; k < n; k += 1) { const row = v.slice(k * n, k * n + n); const col = Array.from({ length: n }, (_, r) => v[r * n + k]); for (const l of [row, col]) { if (l.filter((x) => x === 1).length !== n / 2) return false; for (let j = 2; j < n; j += 1) if (l[j] === l[j - 1] && l[j] === l[j - 2]) return false; } } return true; };
export const BINARY = {
  id: 'binary', title: 'Binary Grid', clock: 360, sound: 'flip',
  init: (lv, d) => { const n = lv <= 15 ? 6 : 8; const sol = binGen(n); const keep = new Set(shuffle([...Array(n * n).keys()]).slice(0, Math.round(n * n * Math.max(0.28, 0.55 - d * 0.03)))); const v = sol.map((x, i) => (keep.has(i) ? x : -1)); return { n, v, giv: v.map((x) => x >= 0) }; },
  act: (s, i) => { if (s.giv[i]) return null; const v = [...s.v]; v[i] = v[i] === -1 ? 0 : v[i] === 0 ? 1 : -1; return { ...s, v }; },
  won: (s) => binValid(s.v, s.n), lost: () => false, moves: (s) => `${s.v.filter((x) => x < 0).length} empty · equal suns & moons, never 3 in a row`,
  Board: ({ s, act }) => <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${s.n}, minmax(0,1fr))` }}>{s.v.map((x, i) => <button key={i} type="button" onClick={() => act(i)} className={`flex aspect-square items-center justify-center rounded-lg text-2xl ${s.giv[i] ? 'bg-slate-700' : 'bg-slate-800/70 ring-1 ring-white/10'}`} data-testid={`binary-${i}`}>{x === 0 ? <span className="pty-new">☀️</span> : x === 1 ? <span className="pty-new">🌙</span> : ''}</button>)}</div>,
};

// ---------- Line Up Five (Color Lines) ----------
const LC = ['#ef4444', '#3b82f6', '#22c55e', '#facc15', '#a855f7', '#f97316', '#06b6d4'];
const linesAt = (b, n, i, k) => { const out = new Set(); [[0, 1], [1, 0], [1, 1], [1, -1]].forEach(([dr, dc]) => { const cells = [i]; [1, -1].forEach((sg) => { let r = Math.floor(i / n) + dr * sg; let c = (i % n) + dc * sg; while (r >= 0 && r < n && c >= 0 && c < n && b[r * n + c] === b[i]) { cells.push(r * n + c); r += dr * sg; c += dc * sg; } }); if (cells.length >= k) cells.forEach((x) => out.add(x)); }); return out; };
const lineSpawn = (s, b, cnt) => { let n2 = [...b]; let gain = 0; for (let t = 0; t < cnt; t += 1) { const e = n2.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0); if (!e.length) break; const i = pickOne(e); n2[i] = rnd(s.k2); const l = linesAt(n2, s.n, i, s.k); if (l.size) { gain += l.size * 2; n2 = n2.map((v, x) => (l.has(x) ? -1 : v)); } } return { b: n2, gain }; };
export const LINEFIVE = {
  id: 'linefive', title: 'Line Up Five', clock: 360, sound: 'slide',
  init: (lv, d) => { const n = lv <= 10 ? 7 : 9; const base = { n, k: n === 7 ? 4 : 5, k2: Math.min(7, 4 + Math.floor(d / 3)), sel: null, score: 0, goal: 16 + d * 6 }; return { ...base, b: lineSpawn(base, Array(n * n).fill(-1), 5).b }; },
  act: (s, i) => { if (s.b[i] >= 0) return { ...s, sel: i, snd: 'step' }; if (s.sel == null) return null; const seen = new Set([s.sel]); const q = [s.sel]; while (q.length) { const x = q.pop(); nbrs(x, s.n, s.n, D4).forEach((j) => { if (s.b[j] < 0 && !seen.has(j)) { seen.add(j); q.push(j); } }); } if (!seen.has(i)) return null; const b = [...s.b]; b[i] = b[s.sel]; b[s.sel] = -1; const l = linesAt(b, s.n, i, s.k); if (l.size) return { ...s, b: b.map((v, x) => (l.has(x) ? -1 : v)), sel: null, score: s.score + l.size * 2, cheer: true, snd: 'combo' }; const sp = lineSpawn(s, b, 3); return { ...s, b: sp.b, sel: null, score: s.score + sp.gain }; },
  won: (s) => s.score >= s.goal, lost: (s) => !s.b.includes(-1), moves: (s) => `${s.score}/${s.goal} pts · line up ${s.k}`,
  Board: ({ s, act }) => <div className="grid gap-[2px] rounded-lg bg-slate-900 p-1" style={{ gridTemplateColumns: `repeat(${s.n}, minmax(0,1fr))` }}>{s.b.map((v, i) => <button key={i} type="button" onClick={() => act(i)} className="relative aspect-square rounded-[4px] bg-slate-700" data-testid={`lines-${i}`}>{v >= 0 && <span className={`pty-new absolute inset-[12%] rounded-full ${s.sel === i ? 'animate-bounce' : ''}`} style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${LC[v]} 45%, #0008)` }} />}</button>)}</div>,
};

// ---------- Word Five ----------
const FIVES = ['APPLE', 'BEACH', 'BRAVE', 'BREAD', 'CANDY', 'CHAIR', 'CHESS', 'CLOUD', 'CROWN', 'DANCE', 'DREAM', 'EAGLE', 'FAIRY', 'FLAME', 'FROST', 'GHOST', 'GIANT', 'GRAPE', 'HAPPY', 'HEART', 'HONEY', 'HORSE', 'JELLY', 'JEWEL', 'KNIFE', 'LEMON', 'LIGHT', 'LUCKY', 'MAGIC', 'MANGO', 'MONEY', 'MUSIC', 'NIGHT', 'OCEAN', 'PARTY', 'PEACH', 'PIANO', 'PIZZA', 'PLANE', 'PLANT', 'PRIZE', 'QUEEN', 'RIVER', 'ROBOT', 'SHARK', 'SHINE', 'SMILE', 'SNAKE', 'SPACE', 'STORM', 'SUGAR', 'SWEET', 'TABLE', 'TIGER', 'TOAST', 'TRAIN', 'TREAT', 'WATER', 'WHALE', 'WORLD', 'ZEBRA', 'BLAST', 'CRISP', 'FLUTE', 'GLOVE', 'LASER', 'MOUSE', 'PEARL', 'SCARF', 'TORCH'];
const grade5 = (ans, g) => { const out = Array(5).fill(0); const left = {}; [...ans].forEach((ch, i) => { if (g[i] === ch) out[i] = 2; else left[ch] = (left[ch] || 0) + 1; }); [...g].forEach((ch, i) => { if (out[i] !== 2 && left[ch]) { out[i] = 1; left[ch] -= 1; } }); return out; };
const KB = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const GC5 = ['bg-slate-600', 'bg-amber-500', 'bg-emerald-500'];
const Keyboard = ({ act, status, extra }) => <div className="mt-3 space-y-1">{KB.map((row, k) => <div key={row} className="flex justify-center gap-1">{k === 2 && extra?.[0]}{[...row].map((ch) => <button key={ch} type="button" onClick={() => act(ch)} className={`h-10 min-w-0 flex-1 rounded-md text-sm font-black text-white ${status[ch] != null ? GC5[status[ch]] || 'bg-slate-900 opacity-40' : 'bg-white/25'} ${btn}`} style={{ maxWidth: 34 }} data-testid={`key-${ch}`}>{ch}</button>)}{k === 2 && extra?.[1]}</div>)}</div>;
export const WORDFIVE = {
  id: 'wordfive', title: 'Word Five', clock: 300, sound: 'card',
  init: (lv, d) => ({ ans: pickOne(FIVES), rows: [], cur: '', max: d >= 8 ? 5 : 6 }),
  act: (s, k) => { if (k === 'del') return { ...s, cur: s.cur.slice(0, -1), snd: 'step' }; if (k === 'go') { if (s.cur.length < 5) return null; const fb = grade5(s.ans, s.cur); return { ...s, rows: [...s.rows, { g: s.cur, fb }], cur: '', cheer: fb.filter((x) => x === 2).length >= 3, snd: 'flip' }; } if (s.cur.length >= 5) return null; return { ...s, cur: s.cur + k }; },
  won: (s) => s.rows.some((r) => r.g === s.ans), lost: (s) => s.rows.length >= s.max && !s.rows.some((r) => r.g === s.ans), moves: (s) => `${s.max - s.rows.length} guesses left`,
  Board: ({ s, act }) => { const st = {}; s.rows.forEach((r) => [...r.g].forEach((ch, i) => { st[ch] = Math.max(st[ch] ?? 0, r.fb[i]); })); return (<div>
    <div className="space-y-1">{Array.from({ length: s.max }, (_, r) => { const row = s.rows[r]; const g = row ? row.g : r === s.rows.length ? s.cur : ''; return <div key={r} className="flex justify-center gap-1">{Array.from({ length: 5 }, (_, i) => <span key={i} className={`flex h-11 w-11 items-center justify-center rounded-lg border-2 font-display text-xl font-black text-white ${row ? `${GC5[row.fb[i]]} border-transparent pty-new` : g[i] ? 'border-white/70' : 'border-white/20'}`}>{g[i] || ''}</span>)}</div>; })}</div>
    <Keyboard act={act} status={st} extra={[<button key="go" type="button" onClick={() => act('go')} className="h-10 rounded-md bg-emerald-500 px-2 text-[11px] font-black text-white" data-testid="key-enter">ENTER</button>, <button key="del" type="button" onClick={() => act('del')} className="h-10 rounded-md bg-white/25 px-2 text-sm font-black text-white" data-testid="key-del">⌫</button>]} /></div>); },
};

// ---------- Hangman Rescue ----------
const HM = [...WORDS, 'ELEPHANT', 'RAINBOW', 'TREASURE', 'BALLOON', 'FIREWORK', 'PENGUIN', 'VOLCANO', 'UNICORN', 'DINOSAUR', 'SANDWICH'];
export const HANGMAN = {
  id: 'hangman', title: 'Balloon Rescue', clock: 240, sound: 'pop',
  init: (lv, d) => ({ w: pickOne(HM.filter((x) => x.length >= (lv <= 10 ? 4 : 6))), g: [], lives: Math.max(4, 8 - Math.floor(d / 2)) }),
  act: (s, ch) => { if (s.g.includes(ch)) return null; const hit = s.w.includes(ch); return { ...s, g: [...s.g, ch], lives: hit ? s.lives : s.lives - 1, snd: hit ? 'chime' : 'bad', cheer: hit && Math.random() < 0.25 }; },
  won: (s) => [...s.w].every((ch) => s.g.includes(ch)), lost: (s) => s.lives <= 0, moves: (s) => `${s.lives} balloons left`,
  Board: ({ s, act }) => { const st = {}; s.g.forEach((ch) => { st[ch] = s.w.includes(ch) ? 2 : 3; }); return (<div>
    <div className="flex justify-center gap-1 text-3xl" data-testid="hangman-lives">{Array.from({ length: s.lives }, (_, i) => <span key={i} className="animate-bounce" style={{ animationDelay: `${i * 0.12}s` }}>🎈</span>)}</div>
    <div className="mt-3 flex flex-wrap justify-center gap-1">{[...s.w].map((ch, i) => <span key={i} className="flex h-11 w-9 items-end justify-center border-b-4 border-amber-300 pb-1 font-display text-2xl font-black text-white">{s.g.includes(ch) ? ch : ''}</span>)}</div>
    <Keyboard act={act} status={st} /></div>); },
};

// ---------- Make 24 ----------
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const fr = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return [n / g, d / g]; };
const OPS = { '+': (a, b) => fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]), '−': (a, b) => fr(a[0] * b[1] - b[0] * a[1], a[1] * b[1]), '×': (a, b) => fr(a[0] * b[0], a[1] * b[1]), '÷': (a, b) => (b[0] ? fr(a[0] * b[1], a[1] * b[0]) : null) };
const solvable = (ns) => { if (ns.length === 1) return Math.abs(ns[0] - 24) < 1e-6; for (let i = 0; i < ns.length; i += 1) for (let j = 0; j < ns.length; j += 1) { if (i === j) continue; const rest = ns.filter((_, k) => k !== i && k !== j); const a = ns[i]; const b = ns[j]; for (const v of [a + b, a - b, a * b, b ? a / b : NaN]) if (!Number.isNaN(v) && solvable([...rest, v])) return true; } return false; };
const deal24 = (hi) => { let ns; do { ns = Array.from({ length: 4 }, () => 1 + rnd(hi)); } while (!solvable(ns)); return ns.map((n, i) => ({ v: [n, 1], id: i })); };
const fmt = ([n, d]) => (d === 1 ? `${n}` : `${n}/${d}`);
export const MAKE24 = {
  id: 'make24', title: 'Make 24', clock: 300, sound: 'chime',
  init: (lv, d) => { const hi = lv <= 10 ? 9 : 13; const nums = deal24(hi); return { hi, nums, orig: nums, sel: null, op: null, round: 1, goal: 3 + Math.floor(d / 3), skips: 2, nid: 10 }; },
  act: (s, a) => {
    if (a === 'reset') return { ...s, nums: s.orig, sel: null, op: null, snd: 'whoosh' };
    if (a === 'skip') { if (!s.skips) return null; const nums = deal24(s.hi); return { ...s, nums, orig: nums, sel: null, op: null, skips: s.skips - 1, snd: 'whoosh' }; }
    if (a.op) return s.sel == null ? null : { ...s, op: a.op, snd: 'step' };
    const n = s.nums.find((x) => x.id === a.id); if (!n) return null;
    if (s.sel == null || s.op == null || s.sel === a.id) return { ...s, sel: s.sel === a.id ? null : a.id, op: null, snd: 'step' };
    const v = OPS[s.op](s.nums.find((x) => x.id === s.sel).v, n.v); if (!v) return null;
    const nums = s.nums.filter((x) => x.id !== s.sel && x.id !== a.id).concat({ v, id: s.nid });
    if (nums.length === 1 && v[0] === 24 && v[1] === 1) { const nx = deal24(s.hi); return { ...s, nums: nx, orig: nx, sel: null, op: null, round: s.round + 1, cheer: true, snd: 'combo', nid: s.nid + 1 }; }
    return { ...s, nums, sel: s.nid, op: null, nid: s.nid + 1 };
  },
  won: (s) => s.round > s.goal, lost: () => false, moves: (s) => `Puzzle ${Math.min(s.round, s.goal)}/${s.goal} · ${s.skips} skips`,
  Board: ({ s, act }) => (<div className="space-y-3 p-1">
    <div className="grid grid-cols-2 gap-2">{s.nums.map((n) => <button key={n.id} type="button" onClick={() => act({ id: n.id })} className={`pty-new flex h-20 items-center justify-center rounded-2xl font-display text-3xl font-black shadow-[0_5px_0_#1e3a8a] ${s.sel === n.id ? 'bg-amber-300 text-slate-900' : 'bg-gradient-to-b from-sky-400 to-blue-600 text-white'} ${btn}`} data-testid={`n24-${n.id}`}>{fmt(n.v)}</button>)}</div>
    <div className="flex justify-center gap-2">{Object.keys(OPS).map((o) => <button key={o} type="button" onClick={() => act({ op: o })} className={`h-12 w-12 rounded-full text-2xl font-black ${s.op === o ? 'bg-amber-400 text-slate-900' : 'bg-white/20 text-white'} ${btn}`} data-testid={`op-${o}`}>{o}</button>)}</div>
    <div className="flex justify-center gap-2"><button type="button" onClick={() => act('reset')} className="rounded-full bg-white/15 px-4 py-1.5 text-xs font-black text-white" data-testid="n24-reset">Reset</button><button type="button" onClick={() => act('skip')} className="rounded-full bg-white/15 px-4 py-1.5 text-xs font-black text-white" data-testid="n24-skip">Skip ({s.skips})</button></div>
    <p className="text-center text-[10px] text-white/60">Tap a number, an operation, then another number. Use all four to make 24.</p></div>),
};

// ---------- Sum Ten ----------
const rectSum = (s, a, b) => { const C = s.C; const [r1, r2] = [Math.floor(a / C), Math.floor(b / C)].sort((x, y) => x - y); const [c1, c2] = [a % C, b % C].sort((x, y) => x - y); const cells = []; for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) cells.push(r * C + c); return { cells, sum: cells.reduce((t, i) => t + s.v[i], 0) }; };
const anyTen = (s) => { for (let a = 0; a < s.v.length; a += 1) for (let b = a; b < s.v.length; b += 1) if (b % s.C >= a % s.C && rectSum(s, a, b).sum === 10) return true; return false; };
export const SUMTEN = {
  id: 'sumten', title: 'Sum Ten', clock: 240, sound: 'pop',
  init: (lv, d) => { const R = lv <= 10 ? 7 : 8; const C = 6; return { R, C, v: Array.from({ length: R * C }, () => 1 + rnd(9)), a: null, score: 0, goal: Math.min(R * C - 8, 16 + d * 3) }; },
  act: (s, i) => { if (s.a == null) return { ...s, a: i, snd: 'step' }; const { cells, sum } = rectSum(s, s.a, i); if (sum !== 10) return { ...s, a: null, snd: 'bad' }; const got = cells.filter((x) => s.v[x]).length; return { ...s, v: s.v.map((x, j) => (cells.includes(j) ? 0 : x)), a: null, score: s.score + got, cheer: got >= 4, snd: 'combo' }; },
  won: (s) => s.score >= s.goal, lost: (s) => !anyTen(s), moves: (s) => `${s.score}/${s.goal} apples · box numbers adding to 10`,
  Board: ({ s, act }) => <div><div className="grid gap-1 rounded-xl bg-green-900/60 p-1.5" style={{ gridTemplateColumns: `repeat(${s.C}, minmax(0,1fr))` }}>{s.v.map((x, i) => <button key={i} type="button" onClick={() => act(i)} className={`flex aspect-square items-center justify-center rounded-full font-display text-lg font-black ${x ? 'text-white' : 'invisible'} ${s.a === i ? 'ring-4 ring-amber-300' : ''}`} style={{ background: 'radial-gradient(circle at 35% 30%,#fecaca,#ef4444 50%,#7f1d1d)' }} data-testid={`ten-${i}`}>{x || ''}</button>)}</div><p className="mt-1 text-center text-[10px] text-white/60">Tap two corners of a box. If the apples inside add up to exactly 10, they are picked.</p></div>,
};

// ---------- Knight's Tour ----------
const KNM = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const knNext = (s) => (s.path.length ? nbrs(s.path[s.path.length - 1], s.n, s.n, KNM).filter((j) => !s.path.includes(j)) : []);
export const KTOUR = {
  id: 'ktour', title: "Knight's Tour", clock: 360, sound: 'step',
  init: (lv, d) => { const n = lv <= 10 ? 5 : lv <= 25 ? 6 : 7; return { n, path: [], undo: 3, goal: n * n - Math.max(0, 6 - d) }; },
  act: (s, i) => { if (!s.path.length) return { ...s, path: [i] }; if (i === s.path[s.path.length - 2] && s.undo) return { ...s, path: s.path.slice(0, -1), undo: s.undo - 1, snd: 'whoosh' }; if (!knNext(s).includes(i)) return null; return { ...s, path: [...s.path, i], cheer: s.path.length % 10 === 9 }; },
  won: (s) => s.path.length >= s.goal, lost: (s) => s.path.length > 0 && !knNext(s).length && !s.undo && s.path.length < s.goal, moves: (s) => `${s.path.length}/${s.goal} squares · ${s.undo} undos (tap previous square)`,
  Board: ({ s, act }) => { const nx = new Set(knNext(s)); return <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${s.n}, minmax(0,1fr))` }}>{Array.from({ length: s.n * s.n }, (_, i) => { const k = s.path.indexOf(i); const last = k === s.path.length - 1 && k >= 0; return <button key={i} type="button" onClick={() => act(i)} className={`relative flex aspect-square items-center justify-center text-sm font-black ${k >= 0 ? 'bg-amber-500/80 text-white' : (Math.floor(i / s.n) + i) % 2 ? 'bg-emerald-900' : 'bg-emerald-200/70'}`} data-testid={`tour-${i}`}>{last ? <span className="pty-new text-3xl">♞</span> : k >= 0 ? k + 1 : ''}{nx.has(i) && <span className="absolute inset-[35%] animate-pulse rounded-full bg-amber-300" />}</button>; })}</div>; },
};

// ---------- Queens Puzzle ----------
const qConflicts = (q, N) => { const ids = q.map((v, i) => (v ? i : -1)).filter((i) => i >= 0); const bad = new Set(); ids.forEach((a) => ids.forEach((b) => { if (a >= b) return; const [r1, c1] = [Math.floor(a / N), a % N]; const [r2, c2] = [Math.floor(b / N), b % N]; if (r1 === r2 || c1 === c2 || Math.abs(r1 - r2) === Math.abs(c1 - c2)) { bad.add(a); bad.add(b); } })); return bad; };
export const QUEENS = {
  id: 'queens', title: 'Queens Puzzle', clock: 300, sound: 'drop',
  init: (lv) => { const N = lv <= 5 ? 5 : lv <= 15 ? 6 : lv <= 30 ? 7 : 8; return { N, q: Array(N * N).fill(false) }; },
  act: (s, i) => { const q = [...s.q]; q[i] = !q[i]; return { ...s, q, snd: q[i] ? 'drop' : 'step' }; },
  won: (s) => s.q.filter(Boolean).length === s.N && !qConflicts(s.q, s.N).size, lost: () => false, moves: (s) => `${s.q.filter(Boolean).length}/${s.N} queens · none may attack another`,
  Board: ({ s, act }) => { const bad = qConflicts(s.q, s.N); return <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${s.N}, minmax(0,1fr))` }}>{s.q.map((v, i) => <button key={i} type="button" onClick={() => act(i)} className={`flex aspect-square items-center justify-center text-3xl ${(Math.floor(i / s.N) + i) % 2 ? 'bg-violet-900' : 'bg-violet-300'}`} data-testid={`queen-${i}`}>{v ? <span className={`pty-new ${bad.has(i) ? 'text-rose-500' : 'text-amber-300'} drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]`}>♛</span> : ''}</button>)}</div>; },
};

export const SOLOS4 = { pty_pyramid: PYRAMID, pty_golf: GOLF, pty_binary: BINARY, pty_line_five: LINEFIVE, pty_word_five: WORDFIVE, pty_hangman: HANGMAN, pty_make24: MAKE24, pty_sum_ten: SUMTEN, pty_knight_tour: KTOUR, pty_queens: QUEENS };
