import { useEffect, useMemo, useRef, useState } from 'react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, sfx, themeFor, useBanter } from './kit';
import { Dice3D, PartyStage } from './stage';

// Snakes & Ladders: classic single die, exact roll to land on 100, a 6 rolls again. Harder levels add snakes and rivals.
const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#eab308'];
const die = () => 1 + Math.floor(Math.random() * 6);
function makeBoard(level) {
  const ladders = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };
  const snakes = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 95: 75, 99: 41 };
  const extra = { 18: 2, 37: 9, 59: 22, 71: 34, 85: 47, 97: 61 };
  Object.entries(extra).slice(0, Math.max(0, level - 4)).forEach(([a, b]) => { snakes[a] = b; });
  const nl = Math.max(4, 7 - Math.floor(level / 3));
  return { ladders: Object.fromEntries(Object.entries(ladders).slice(0, nl)), snakes };
}
const xy = (n) => { const row = Math.floor((n - 1) / 10); const col = row % 2 === 0 ? (n - 1) % 10 : 9 - ((n - 1) % 10); return [col * 10 + 5, (9 - row) * 10 + 5]; };

function Ladder({ a, b }) {
  const [x1, y1] = xy(a); const [x2, y2] = xy(b);
  const len = Math.hypot(x2 - x1, y2 - y1); const nx = (-(y2 - y1) / len) * 2.2; const ny = ((x2 - x1) / len) * 2.2;
  const rungs = Math.floor(len / 4);
  return (
    <g filter="url(#sl-shadow)">
      {[1, -1].map((s) => <line key={s} x1={x1 + nx * s} y1={y1 + ny * s} x2={x2 + nx * s} y2={y2 + ny * s} stroke="url(#sl-wood)" strokeWidth="1.3" strokeLinecap="round" />)}
      {Array.from({ length: rungs }, (_, i) => { const k = (i + 0.5) / rungs; const x = x1 + (x2 - x1) * k; const y = y1 + (y2 - y1) * k; return <line key={i} x1={x + nx} y1={y + ny} x2={x - nx} y2={y - ny} stroke="#92400e" strokeWidth="0.9" strokeLinecap="round" />; })}
    </g>
  );
}
const SNAKE_COLORS = [['#22c55e', '#14532d'], ['#a855f7', '#4c1d95'], ['#f97316', '#7c2d12'], ['#06b6d4', '#164e63'], ['#ef4444', '#7f1d1d']];
function Snake({ a, b, i }) {
  const [x1, y1] = xy(a); const [x2, y2] = xy(b);
  const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2; const w = 9 + (i % 3) * 3;
  const d = `M${x1},${y1} C${mx + w},${y1 + (y2 - y1) * 0.25} ${mx - w},${y1 + (y2 - y1) * 0.75} ${x2},${y2}`;
  const [c1, c2] = SNAKE_COLORS[i % SNAKE_COLORS.length];
  return (
    <g filter="url(#sl-shadow)">
      <path d={d} fill="none" stroke={c2} strokeWidth="3.6" strokeLinecap="round" />
      <path d={d} fill="none" stroke={c1} strokeWidth="2.6" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#fef08a" strokeWidth="0.7" strokeDasharray="1.2 2.2" strokeLinecap="round" opacity="0.85" />
      <ellipse cx={x1} cy={y1} rx="2.6" ry="2.2" fill={c1} stroke={c2} strokeWidth="0.6" />
      <circle cx={x1 - 0.9} cy={y1 - 0.6} r="0.6" fill="#fff" /><circle cx={x1 + 0.9} cy={y1 - 0.6} r="0.6" fill="#fff" />
      <circle cx={x1 - 0.9} cy={y1 - 0.6} r="0.3" fill="#000" /><circle cx={x1 + 0.9} cy={y1 - 0.6} r="0.3" fill="#000" />
      <path d={`M${x1},${y1 + 1.8} l0,1.4 l-0.6,0.6 M${x1},${y1 + 3.2} l0.6,0.6`} stroke="#ef4444" strokeWidth="0.35" fill="none" />
    </g>
  );
}

export function SnakesLadders({ config, onComplete }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const n = level <= 3 ? 2 : level <= 6 ? 3 : 4;
  const { ladders, snakes } = useMemo(() => makeBoard(level), [level]);
  const bots = useMemo(() => BOTS.slice(0, n - 1), [n]);
  const banter = useBanter('Snakes and Ladders', bots);
  const [g, setG] = useState({ pos: Array(n).fill(1), turn: 0, phase: 'roll', roll: 1, spin: 0, target: 0, ev: { kind: 'start', id: 0 } });
  const [start] = useState(Date.now);
  const done = useRef(false);
  const ev = (s, kind, extra) => ({ kind, id: s.ev.id + 1, p: s.turn, ...extra });

  useEffect(() => {
    if (g.phase === 'over') return undefined;
    let t;
    if (g.phase === 'roll' && g.turn !== 0) t = setTimeout(() => roll(), 900);
    if (g.phase === 'anim') t = setTimeout(() => setG((s) => {
      const p = s.turn; const cur = s.pos[p];
      if (cur < s.target) { const pos = [...s.pos]; pos[p] = cur + 1; return { ...s, pos, ev: ev(s, 'step') }; }
      const to = ladders[cur] || snakes[cur];
      if (to) { const pos = [...s.pos]; pos[p] = to; return { ...s, pos, phase: 'slide', ev: ev(s, ladders[cur] ? 'ladder' : 'snake') }; }
      return land(s);
    }), 230);
    if (g.phase === 'slide') t = setTimeout(() => setG(land), 850);
    if (g.phase === 'next') t = setTimeout(() => setG((s) => ({ ...s, phase: 'roll', turn: (s.turn + 1) % n })), 700);
    return () => clearTimeout(t);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps

  function land(s) {
    if (s.pos[s.turn] === 100) return { ...s, phase: 'over', ev: ev(s, 'over') };
    return s.roll === 6 ? { ...s, phase: 'roll' } : { ...s, phase: 'next' };
  }
  function roll() {
    setG((s) => {
      if (s.phase !== 'roll') return s;
      const r = die(); const target = s.pos[s.turn] + r;
      if (target > 100) return { ...s, roll: r, spin: s.spin + 1, phase: 'next', ev: ev(s, 'roll', { over: true }) };
      return { ...s, roll: r, spin: s.spin + 1, target, phase: 'anim', ev: ev(s, 'roll') };
    });
  }

  useEffect(() => {
    const e = g.ev; const bot = e.p - 1;
    if (e.kind === 'start') banter.say(0, 'start', { force: true });
    if (e.kind === 'roll') sfx('dice');
    if (e.kind === 'step') sfx('step');
    if (e.kind === 'ladder') { sfx('ladder'); if (e.p === 0) banter.say(Math.floor(Math.random() * bots.length), 'you_good'); else banter.say(bot, 'bot_good'); }
    if (e.kind === 'snake') {
      sfx('snake');
      if (e.p === 0) banter.say(Math.floor(Math.random() * bots.length), 'bot_hit', { big: true, event: 'the human player just got bitten by a snake and slid way down the board', detail: 'laugh at them' });
      else banter.say(bot, 'bot_bad', { big: Math.random() < 0.5, event: 'you just got bitten by a snake and slid down' });
    }
    if (e.kind === 'over' && !done.current) {
      done.current = true; const won = e.p === 0;
      sfx(won ? 'win' : 'lose');
      banter.say(won ? 0 : bot, won ? 'you_win' : 'bot_win', { big: true, force: true, event: won ? 'the human beat you at snakes and ladders' : 'you won snakes and ladders' });
      const best = Math.max(...g.pos.slice(1));
      setTimeout(() => onComplete({ solved: won, accuracy: won ? Math.min(1, 1.2 - best / 100) : g.pos[0] / 100, duration_ms: Date.now() - start }), 2200);
    }
  }, [g.ev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = Array.from({ length: 100 }, (_, k) => { const row = Math.floor(k / 10); return 100 - row * 10 - (row % 2 === 0 ? k % 10 : 9 - (k % 10)); });
  const players = [YOU, ...bots].map((p, i) => ({ ...p, color: COLORS[i], info: `square ${g.pos[i]}` }));
  const myRoll = g.turn === 0 && g.phase === 'roll';
  return (
    <PartyStage config={config} title="Snakes & Ladders" players={players} active={g.turn} banter={banter}>
      <div className="mx-auto w-full max-w-[460px] rounded-[22px] p-2 sm:p-3" style={{ background: theme.frame, boxShadow: `0 0 0 2px ${theme.accent}88, 0 25px 60px rgba(0,0,0,0.6)` }}>
        <div className="relative aspect-square overflow-hidden rounded-xl" data-testid="snakes-board">
          <div className="absolute inset-0 grid grid-cols-10">
            {cells.map((c, k) => (
              <div key={c} className="relative flex items-start justify-start p-[3px] text-[8px] font-black sm:text-[10px]" style={{ background: (Math.floor(k / 10) + k) % 2 ? '#fef3c7' : `hsl(${(c * 3.6 + theme.hue * 4) % 360} 75% 78%)`, color: '#0f172a99' }}>{c}{c === 100 && <span className="absolute inset-0 m-auto h-fit w-fit text-lg">🏆</span>}</div>
            ))}
          </div>
          <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="sl-wood" x1="0" x2="1"><stop offset="0" stopColor="#fbbf24" /><stop offset="1" stopColor="#b45309" /></linearGradient>
              <filter id="sl-shadow"><feDropShadow dx="0.4" dy="0.8" stdDeviation="0.5" floodOpacity="0.5" /></filter>
            </defs>
            {Object.entries(ladders).map(([a, b]) => <Ladder key={a} a={+a} b={b} />)}
            {Object.entries(snakes).map(([a, b], i) => <Snake key={a} a={+a} b={b} i={i} />)}
          </svg>
          {g.pos.map((v, p) => { const [x, y] = xy(v); const off = [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]][p]; return (
            <span key={p} className="absolute z-10 h-[6%] w-[6%] rounded-full border-2 border-white" data-testid={`snakes-token-${p}`}
              style={{ left: `${x + off[0]}%`, top: `${y + off[1]}%`, transform: `translate(-50%,-50%) scale(${g.turn === p ? 1.25 : 1})`, transition: `left ${g.phase === 'slide' && g.turn === p ? 0.8 : 0.2}s ease-in-out, top ${g.phase === 'slide' && g.turn === p ? 0.8 : 0.2}s ease-in-out, transform .2s`,
                background: `radial-gradient(circle at 35% 30%, #fff 0 12%, ${COLORS[p]} 45%, #0f172a 130%)`, boxShadow: '0 3px 6px rgba(0,0,0,0.5)' }} />); })}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-4">
        <div className="rounded-2xl p-2.5" style={{ background: `${COLORS[g.turn]}33`, boxShadow: myRoll ? `0 0 0 2px ${COLORS[0]}, 0 0 30px ${COLORS[0]}` : 'none' }}>
          <Dice3D value={g.roll} spin={g.spin} size={54} onClick={() => myRoll && roll()} disabled={!myRoll} testId="snakes-roll" />
        </div>
        <div className="text-left">
          <div className="text-sm font-black text-white" data-testid="snakes-status">{g.phase === 'over' ? (g.turn === 0 ? 'You reached 100! 🏆' : `${bots[g.turn - 1].name} wins!`) : g.turn === 0 ? (myRoll ? 'Your turn: tap the dice' : `You rolled ${g.roll}`) : `${bots[g.turn - 1].name} is rolling…`}</div>
          <div className="text-[10px] font-semibold text-white/60">Exact roll to land on 100 · a 6 rolls again</div>
        </div>
      </div>
    </PartyStage>
  );
}
