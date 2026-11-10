import { useEffect, useRef, useState } from 'react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, sfx, themeFor, useBanter, useClocks } from './kit';
import { PartyStage } from './stage';

// Solo puzzles: just you vs the level, a host cheers you on. def: { title, init(lv, d), act(s, a) -> s | null, won(s), lost(s), Board, moves(s) }
const HOST = { ...BOTS[3], persona: 'over-the-top cheerful game show host who hypes the player up' };
export function SoloGame({ def, config, onComplete }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const [s, setS] = useState(() => def.init(theme.lv, level));
  const [start] = useState(Date.now);
  const banter = useBanter(`${def.title} (a solo puzzle; you are the cheering host)`, [HOST]);
  const done = useRef(false);
  const matchSec = Math.max(60, def.clock - level * 6);
  const end = (won, why) => {
    if (done.current) return; done.current = true;
    sfx(won ? 'win' : 'lose');
    banter.say(0, won ? 'cheer' : 'cheer_sad', { big: true, force: true, event: won ? `the player solved the ${def.title} level` : `the player failed the ${def.title} level`, detail: why });
    { const end = Date.now(); setTimeout(() => onComplete({ solved: won, accuracy: won ? 1 : 0.3, duration_ms: end - start, delay_ms: Date.now() - end }), 1600); }
  };
  const { matchLeft } = useClocks({ matchSec, running: !done.current, onMatchOut: () => end(false, 'clock ran out') });
  useEffect(() => { banter.say(0, 'cheer_start', { force: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = (a) => {
    if (done.current) return;
    const n = def.act(s, a);
    if (!n) { sfx('bad'); return; }
    setS(n); sfx(n.snd || def.sound || 'pop');
    if (n.cheer) banter.say(0, 'cheer');
    if (def.won(n)) end(true, 'solved'); else if (def.lost(n)) end(false, 'out of moves');
  };
  const players = [{ ...YOU, color: '#38bdf8', info: def.moves(s) }, { ...HOST, name: `Host ${HOST.name}`, color: '#ec4899', info: 'cheering' }];
  const { Board } = def;
  return (
    <PartyStage config={config} title={def.title} players={players} active={0} matchLeft={matchLeft} banter={banter}>
      <div className="mx-auto max-w-[420px] rounded-[22px] p-2.5" style={{ background: theme.frame, boxShadow: `0 0 0 2px ${theme.accent}99, 0 25px 60px rgba(0,0,0,0.55)` }} data-testid={`${def.id}-board`}>
        <Board s={s} act={act} />
      </div>
      <p className="mx-auto mt-2 w-fit rounded-full bg-black/50 px-3 py-0.5 text-[11px] font-bold text-white" data-testid={`${def.id}-status`}>{def.moves(s)}</p>
    </PartyStage>
  );
}

const rnd = (k) => Math.floor(Math.random() * k);
// ---------- Lights Out ----------
const toggle = (b, n, i) => { const out = [...b]; const r = Math.floor(i / n); const c = i % n; [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { const y = r + dr; const x = c + dc; if (y >= 0 && y < n && x >= 0 && x < n) out[y * n + x] = !out[y * n + x]; }); return out; };
export const LIGHTS = {
  id: 'lights', title: 'Lights Out', clock: 180, sound: 'pop',
  init: (lv, d) => { const n = lv <= 5 ? 3 : lv <= 20 ? 4 : 5; let b = Array(n * n).fill(false); const k = 2 + d; for (let i = 0; i < k; i += 1) b = toggle(b, n, rnd(n * n)); if (b.every((x) => !x)) b = toggle(b, n, 0); return { b, n, left: k * 2 + 4 }; },
  act: (s, i) => ({ ...s, b: toggle(s.b, s.n, i), left: s.left - 1 }),
  won: (s) => s.b.every((x) => !x), lost: (s) => s.left <= 0, moves: (s) => `${s.b.filter(Boolean).length} lights on · ${s.left} taps left`,
  Board: ({ s, act }) => <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${s.n}, minmax(0,1fr))` }}>{s.b.map((on, i) => <button key={i} type="button" onClick={() => act(i)} className="aspect-square rounded-2xl transition-colors duration-300" style={{ background: on ? 'radial-gradient(circle, #fef9c3, #facc15 50%, #a16207)' : '#1e293b', boxShadow: on ? '0 0 24px #facc15' : 'inset 0 4px 8px rgba(0,0,0,0.6)' }} data-testid={`lights-${i}`} />)}</div>,
};
// ---------- Flood It ----------
const FC = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
function flood(b, n, color) {
  const from = b[0]; if (from === color) return null; const out = [...b]; const q = [0]; const seen = new Set([0]);
  while (q.length) { const i = q.pop(); out[i] = color; const r = Math.floor(i / n); const c = i % n; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { const y = r + dr; const x = c + dc; const j = y * n + x; if (y >= 0 && y < n && x >= 0 && x < n && !seen.has(j) && b[j] === from) { seen.add(j); q.push(j); } }); }
  return out;
}
export const FLOOD = {
  id: 'flood', title: 'Flood Fill', clock: 200, sound: 'drop',
  init: (lv, d) => { const n = lv <= 5 ? 8 : lv <= 20 ? 10 : 12; const k = Math.min(6, 4 + Math.floor(d / 4)); return { b: Array.from({ length: n * n }, () => rnd(k)), n, k, left: Math.round(n * 1.6 + k * 1.2 - d * 0.4) }; },
  act: (s, c) => { const b = flood(s.b, s.n, c); return b ? { ...s, b, left: s.left - 1 } : null; },
  won: (s) => s.b.every((x) => x === s.b[0]), lost: (s) => s.left <= 0, moves: (s) => `${s.left} moves left`,
  Board: ({ s, act }) => (<div><div className="grid overflow-hidden rounded-xl" style={{ gridTemplateColumns: `repeat(${s.n}, minmax(0,1fr))` }}>{s.b.map((v, i) => <span key={i} className="aspect-square transition-colors duration-300" style={{ background: FC[v] }} />)}</div>
    <div className="mt-3 flex justify-center gap-2">{FC.slice(0, s.k).map((c, i) => <button key={c} type="button" onClick={() => act(i)} className="h-11 w-11 rounded-full border-4 border-white shadow-lg transition-transform active:scale-90" style={{ background: c }} data-testid={`flood-${i}`} />)}</div></div>),
};
// ---------- Peg Solitaire (English board) ----------
const HOLE = (i) => { const r = Math.floor(i / 7); const c = i % 7; return (r >= 2 && r <= 4) || (c >= 2 && c <= 4); };
const pegMoves = (b) => { const out = []; b.forEach((p, i) => { if (!p) return; const r = Math.floor(i / 7); const c = i % 7; [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => { const y = r + dr * 2; const x = c + dc * 2; const t = y * 7 + x; if (y >= 0 && y < 7 && x >= 0 && x < 7 && HOLE(t) && !b[t] && b[(r + dr) * 7 + c + dc]) out.push([i, t, (r + dr) * 7 + c + dc]); }); }); return out; };
export const PEGS = {
  id: 'pegs', title: 'Peg Solitaire', clock: 300, sound: 'step',
  init: (lv, d) => ({ b: Array.from({ length: 49 }, (_, i) => HOLE(i) && i !== 24), sel: null, target: Math.max(1, 9 - d) }),
  act: (s, i) => { if (s.b[i] && pegMoves(s.b).some(([f]) => f === i)) return { ...s, sel: i }; const m = pegMoves(s.b).find(([f, t]) => f === s.sel && t === i); if (!m) return null; const b = [...s.b]; b[m[0]] = false; b[m[2]] = false; b[m[1]] = true; return { ...s, b, sel: null, cheer: Math.random() < 0.2 }; },
  won: (s) => !pegMoves(s.b).length && s.b.filter(Boolean).length <= s.target, lost: (s) => !pegMoves(s.b).length && s.b.filter(Boolean).length > s.target,
  moves: (s) => `${s.b.filter(Boolean).length} pegs left · goal ${s.target} or fewer`,
  Board: ({ s, act }) => { const tg = new Set(pegMoves(s.b).filter(([f]) => f === s.sel).map(([, t]) => t)); return (
    <div className="grid grid-cols-7 gap-1.5 rounded-xl bg-amber-950/60 p-2">{s.b.map((p, i) => (HOLE(i) ? <button key={i} type="button" onClick={() => act(i)} className="relative aspect-square rounded-full" style={{ background: 'radial-gradient(circle, #1c0a03, #451a03)', boxShadow: 'inset 0 3px 5px rgba(0,0,0,0.7)' }} data-testid={`peg-${i}`}>
      {p && <span className={`absolute inset-[12%] rounded-full ${s.sel === i ? 'ring-4 ring-amber-300' : ''}`} style={{ background: 'radial-gradient(circle at 35% 30%, #fff, #38bdf8 45%, #0c4a6e)' }} />}{tg.has(i) && <span className="absolute inset-[35%] animate-pulse rounded-full bg-emerald-300" />}</button> : <span key={i} />))}</div>); },
};
// ---------- Code Breaker (Mastermind) ----------
const CB = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f8fafc'];
const grade = (code, g) => { const exact = g.filter((x, i) => x === code[i]).length; const common = CB.reduce((t, _, c) => t + Math.min(code.filter((x) => x === c).length, g.filter((x) => x === c).length), 0); return [exact, common - exact]; };
export const CODE = {
  id: 'code', title: 'Code Breaker', clock: 300, sound: 'card',
  init: (lv, d) => { const k = Math.min(8, 5 + Math.floor(d / 3)); const len = lv <= 10 ? 4 : 5; return { code: Array.from({ length: len }, () => rnd(k)), k, len, rows: [], cur: [], max: Math.max(7, 11 - Math.floor(d / 2)) }; },
  act: (s, a) => { if (a === 'del') return { ...s, cur: s.cur.slice(0, -1) }; if (a === 'go') { if (s.cur.length < s.len) return null; const fb = grade(s.code, s.cur); return { ...s, rows: [...s.rows, { g: s.cur, fb }], cur: [], cheer: fb[0] >= s.len - 1 }; } if (s.cur.length >= s.len) return null; return { ...s, cur: [...s.cur, a] }; },
  won: (s) => s.rows.some((r) => r.fb[0] === s.len), lost: (s) => s.rows.length >= s.max && !s.rows.some((r) => r.fb[0] === s.len), moves: (s) => `${s.max - s.rows.length} guesses left`,
  Board: ({ s, act }) => (<div className="space-y-1.5">
    {[...s.rows, { g: s.cur, live: true }].slice(-8).map((r, k) => <div key={k} className={`flex items-center justify-between rounded-xl px-2 py-1.5 ${r.live ? 'bg-white/15 ring-1 ring-amber-300' : 'bg-black/30'}`}><div className="flex gap-1.5">{Array.from({ length: s.len }, (_, i) => <span key={i} className="h-7 w-7 rounded-full border border-white/30" style={{ background: r.g[i] != null ? CB[r.g[i]] : 'transparent' }} />)}</div>
      {r.fb && <div className="grid grid-cols-3 gap-0.5">{Array.from({ length: s.len }, (_, i) => <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: i < r.fb[0] ? '#22c55e' : i < r.fb[0] + r.fb[1] ? '#facc15' : 'rgba(255,255,255,0.15)' }} />)}</div>}</div>)}
    <div className="flex flex-wrap justify-center gap-1.5 pt-1">{CB.slice(0, s.k).map((c, i) => <button key={c} type="button" onClick={() => act(i)} className="h-9 w-9 rounded-full border-2 border-white shadow" style={{ background: c }} data-testid={`code-${i}`} />)}
      <button type="button" onClick={() => act('del')} className="h-9 rounded-full bg-white/15 px-3 text-xs font-black text-white" data-testid="code-del">⌫</button>
      <button type="button" onClick={() => act('go')} className="h-9 rounded-full bg-amber-400 px-4 text-xs font-black text-slate-900" data-testid="code-go">Check</button></div>
    <p className="text-center text-[10px] text-white/60">Green pin = right colour, right spot · Yellow = right colour, wrong spot</p></div>),
};
export const SOLOS = { pty_lights_out: LIGHTS, pty_flood_fill: FLOOD, pty_peg_solitaire: PEGS, pty_code_breaker: CODE };
export const soloRender = (def) => (config, onComplete) => <SoloGame def={def} config={config} onComplete={onComplete} />;
