import { useEffect, useMemo, useState } from 'react';
import { Board3D, useFeedback } from '../premium/kit';
import { difficultyOf } from '../../../lib/difficulty';
import { playGameSound } from '../../../lib/gameExperience';

const COLORS = ['#facc15', '#ef4444', '#22c55e', '#3b82f6'];
const NAMES = ['You', 'Rex', 'Nova', 'Pip'];
const die = () => 1 + Math.floor(Math.random() * 6);
const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ---------- Ludo Royale: race your tokens round the board, knock rivals home, get everyone round first ----------
const L = 28;
const cellRC = (i) => (i < 8 ? [0, i] : i < 15 ? [i - 7, 7] : i < 22 ? [7, 21 - i] : [28 - i, 0]);
const SAFE = new Set([0, 7, 14, 21]);
const absPos = (p, steps) => (p * 7 + steps) % L;

export function LudoRoyale({ config, onComplete }) {
  const level = difficultyOf(config);
  const players = level <= 3 ? 2 : level <= 6 ? 3 : 4;
  const tokens = level <= 3 ? 2 : level <= 7 ? 3 : 4;
  const needSix = level >= 4;
  const [pos, setPos] = useState(() => Array.from({ length: players }, () => Array(tokens).fill(-1))); // -1 base, 0..L-1 travelled, L = home
  const [turn, setTurn] = useState(0);
  const [roll, setRoll] = useState(null);
  const [msg, setMsg] = useState('Roll the dice to start');
  const [over, setOver] = useState(false);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const canEnter = (r) => r === 6 || (!needSix && r === 5);
  const movable = (p, r, P = pos) => P[p].map((s, t) => (s === -1 ? canEnter(r) : s < L) ? t : -1).filter((t) => t >= 0);
  const move = (p, t, r) => {
    const next = pos.map((a) => [...a]);
    const s = next[p][t];
    next[p][t] = s === -1 ? 0 : Math.min(L, s + r);
    let text = `${NAMES[p]} moved`;
    if (next[p][t] < L) {
      const here = absPos(p, next[p][t]);
      if (!SAFE.has(here)) next.forEach((arr, q) => { if (q !== p) arr.forEach((st, k) => { if (st >= 0 && st < L && absPos(q, st) === here) { arr[k] = -1; text = `${NAMES[p]} knocked ${NAMES[q]} home!`; playGameSound(p === 0 ? 'success' : 'failure'); } }); });
    } else text = `${NAMES[p]} got a token home!`;
    setPos(next); setMsg(text); setRoll(null);
    if (next[p].every((x) => x === L)) {
      setOver(true);
      setTimeout(() => onComplete({ solved: p === 0, accuracy: p === 0 ? 1 : 0.3, duration_ms: Date.now() - start }), 700);
      return;
    }
    setTurn(r === 6 ? p : (p + 1) % players);
  };
  const rollNow = () => {
    if (turn !== 0 || roll || over) return;
    const r = die(); setRoll(r); playGameSound('tap');
    if (!movable(0, r).length) { setMsg(`You rolled ${r}: no move`); setTimeout(() => { setRoll(null); setTurn(1 % players); }, 900); }
    else setMsg(`You rolled ${r}: tap a glowing token`);
  };
  useEffect(() => {
    if (turn === 0 || over) return undefined;
    const t = setTimeout(() => {
      const r = die();
      const opts = movable(turn, r);
      if (!opts.length) { setMsg(`${NAMES[turn]} rolled ${r}: no move`); setTurn((turn + 1) % players); return; }
      const hits = opts.find((k) => { const s = pos[turn][k]; const n = s === -1 ? 0 : s + r; return n < L && pos[0].some((st) => st >= 0 && st < L && absPos(0, st) === absPos(turn, n) && !SAFE.has(absPos(turn, n))); });
      const pick = level >= 5 && hits !== undefined ? hits : opts.sort((a, b) => pos[turn][b] - pos[turn][a])[0];
      move(turn, pick, r);
    }, 750);
    return () => clearTimeout(t);
  }, [turn, over]); // eslint-disable-line react-hooks/exhaustive-deps
  const opts = turn === 0 && roll ? movable(0, roll) : [];
  const onCell = useMemo(() => {
    const m = {};
    pos.forEach((arr, p) => arr.forEach((s, t) => { if (s >= 0 && s < L) (m[absPos(p, s)] ||= []).push({ p, t }); }));
    return m;
  }, [pos]);
  const tokenBtn = (p, t, key) => (
    <button key={key} type="button" disabled={!(p === 0 && opts.includes(t))} onClick={() => { fire('good'); move(0, t, roll); }} data-testid={p === 0 ? `ludo-token-${t}` : undefined}
      className={`h-[60%] w-[60%] rounded-full border-2 border-white shadow-md ${p === 0 && opts.includes(t) ? 'animate-bounce ring-2 ring-white' : ''}`} style={{ background: COLORS[p] }} />
  );
  return (
    <Board3D theme="reaction" title="Ludo Royale" level={level} flash={flash} stats={pos.map((a, p) => [NAMES[p], `${a.filter((x) => x === L).length}/${tokens}`])}>
      <div className="relative grid aspect-square gap-1" style={{ gridTemplateColumns: 'repeat(8, minmax(0,1fr))', gridTemplateRows: 'repeat(8, minmax(0,1fr))' }} data-testid="ludo-board">
        {Array.from({ length: L }, (_, i) => { const [r, c] = cellRC(i); const owner = SAFE.has(i) ? i / 7 : -1; return (
          <div key={i} className="flex items-center justify-center gap-0.5 rounded-lg border border-white/20" style={{ gridRow: r + 1, gridColumn: c + 1, background: owner >= 0 && owner < players ? `${COLORS[owner]}55` : 'rgba(255,255,255,0.12)' }}>
            {(onCell[i] || []).slice(0, 2).map(({ p, t }) => tokenBtn(p, t, `${p}-${t}`))}
          </div>); })}
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/30 p-2 text-center" style={{ gridRow: '2 / 8', gridColumn: '2 / 8' }}>
          <div className="flex flex-wrap justify-center gap-1">{pos[0].map((s, t) => s === -1 ? <span key={t} className="flex h-7 w-7 items-center justify-center">{tokenBtn(0, t, t)}</span> : null)}</div>
          <button type="button" onClick={rollNow} disabled={turn !== 0 || !!roll || over} className="text-6xl leading-none text-white transition-transform hover:scale-110 disabled:opacity-60" data-testid="ludo-roll">{FACES[roll || 6]}</button>
          <div className="text-[11px] font-bold text-white" data-testid="ludo-status">{turn === 0 ? msg : `${NAMES[turn]} is rolling…`}</div>
          <div className="text-[10px] text-white/60">{needSix ? 'Roll a 6 to bring a token out' : 'Roll 5 or 6 to bring a token out'} · coloured squares are safe</div>
        </div>
      </div>
    </Board3D>
  );
}

// ---------- Snakes & Ladders Duel: roll two dice, choose the smarter one, dodge snakes, reach 100 first ----------
function makeBoard(level) {
  const ladders = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };
  const snakes = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 95: 75, 99: 41 };
  const extra = { 18: 2, 37: 9, 59: 22, 71: 34, 85: 47, 97: 61 };
  Object.entries(extra).slice(0, Math.max(0, level - 4)).forEach(([a, b]) => { snakes[a] = b; });
  const nl = Math.max(3, 7 - Math.floor(level / 3));
  return { ...Object.fromEntries(Object.entries(ladders).slice(0, nl)), ...snakes };
}

export function SnakesLadders({ config, onComplete }) {
  const level = difficultyOf(config);
  const bots = level <= 4 ? 1 : 2;
  const jumps = useMemo(() => makeBoard(level), [level]);
  const [pos, setPos] = useState(Array(bots + 1).fill(1));
  const [turn, setTurn] = useState(0);
  const [dice, setDice] = useState(null);
  const [msg, setMsg] = useState('Roll two dice, then pick one to move');
  const [over, setOver] = useState(false);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const land = (from, r) => { let to = from + r; if (to > 100) to = 200 - to; const j = jumps[to]; return { to: j || to, via: j ? (j > to ? 'ladder' : 'snake') : null }; };
  const step = (p, r) => {
    const { to, via } = land(pos[p], r);
    const next = [...pos]; next[p] = to; setPos(next); setDice(null);
    setMsg(`${NAMES[p]} → ${to}${via === 'ladder' ? ' 🪜 up a ladder!' : via === 'snake' ? ' 🐍 bitten by a snake!' : ''}`);
    if (via) playGameSound(via === 'ladder' === (p === 0) ? 'success' : 'failure');
    if (to === 100) { setOver(true); setTimeout(() => onComplete({ solved: p === 0, accuracy: p === 0 ? 1 : 0.3, duration_ms: Date.now() - start }), 700); return; }
    setTurn((p + 1) % (bots + 1));
  };
  useEffect(() => {
    if (turn === 0 || over) return undefined;
    const t = setTimeout(() => { const a = die(); const b = die(); const pick = level >= 6 ? (land(pos[turn], a).to >= land(pos[turn], b).to ? a : b) : (Math.random() < 0.5 ? a : b); step(turn, pick); }, 700);
    return () => clearTimeout(t);
  }, [turn, over]); // eslint-disable-line react-hooks/exhaustive-deps
  const cells = Array.from({ length: 100 }, (_, k) => { const row = Math.floor(k / 10); const n = 100 - row * 10 - (row % 2 === 0 ? k % 10 : 9 - (k % 10)); return n; });
  return (
    <Board3D theme="words" title="Snakes & Ladders Duel" level={level} flash={flash} stats={pos.map((v, p) => [NAMES[p], v])}>
      <div className="grid gap-0.5 rounded-xl bg-emerald-950/60 p-1" style={{ gridTemplateColumns: 'repeat(10, minmax(0,1fr))' }} data-testid="snakes-board">
        {cells.map((n) => { const j = jumps[n]; return (
          <div key={n} className={`relative flex aspect-square flex-col items-center justify-center rounded text-[9px] font-bold sm:text-[10px] ${j ? (j > n ? 'bg-emerald-400/70 text-emerald-950' : 'bg-rose-500/70 text-white') : (n % 2 ? 'bg-amber-100/90 text-amber-900' : 'bg-lime-100/90 text-lime-900')}`}>
            <span>{n}</span>{j && <span className="text-[8px] leading-none">{j > n ? `🪜${j}` : `🐍${j}`}</span>}
            <span className="absolute bottom-0.5 flex gap-0.5">{pos.map((v, p) => v === n ? <span key={p} className="h-2 w-2 rounded-full border border-white sm:h-2.5 sm:w-2.5" style={{ background: COLORS[p] }} /> : null)}</span>
          </div>); })}
      </div>
      <div className="mt-3 flex flex-col items-center gap-2">
        {turn === 0 && !over && (dice ? <div className="flex gap-3">{dice.map((d, i) => <button key={i} type="button" onClick={() => { fire('good'); step(0, d); }} className="rounded-2xl bg-white/90 px-3 text-5xl leading-tight text-slate-900 shadow-[0_5px_0_rgba(0,0,0,0.3)] transition-transform hover:-translate-y-1" data-testid={`snakes-pick-${i}`}>{FACES[d]}<div className="text-[10px] font-black">→ {land(pos[0], d).to}</div></button>)}</div>
          : <button type="button" onClick={() => { setDice([die(), die()]); playGameSound('tap'); }} className="h-11 rounded-full bg-amber-400 px-6 font-black text-slate-900" data-testid="snakes-roll">Roll 2 dice</button>)}
        <div className="text-center text-[11px] font-bold text-white" data-testid="snakes-status">{turn === 0 ? msg : `${NAMES[turn]} is rolling…`}</div>
      </div>
    </Board3D>
  );
}
