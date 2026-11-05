import { useEffect, useRef, useState } from 'react';
import { Crown } from 'lucide-react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, onlinePlayers, sfx, themeFor, useBanter, useClocks, useGameState } from './kit';
import { PartyStage } from './stage';

// Checkers (draughts): diagonal moves, captures are compulsory, chain jumps continue, reach the far row to crown a king.
const sideOf = (p) => (p === 0 ? 0 : p <= 2 ? 1 : 2);
export const checkersInit = () => ({ b: Array.from({ length: 64 }, (_, i) => { const r = Math.floor(i / 8); const c = i % 8; if ((r + c) % 2 === 0) return 0; return r < 3 ? 3 : r > 4 ? 1 : 0; }), turn: 1, jumping: null, last: null, ev: { kind: 'start', id: 0 }, over: false });
function moves(s, side) {
  const steps = []; const jumps = [];
  s.b.forEach((p, i) => {
    if (sideOf(p) !== side || (s.jumping != null && s.jumping !== i)) return;
    const r = Math.floor(i / 8); const c = i % 8; const king = p === 2 || p === 4;
    const dirs = king ? [-1, 1] : [side === 1 ? -1 : 1];
    dirs.forEach((dr) => [-1, 1].forEach((dc) => {
      const r1 = r + dr; const c1 = c + dc; if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) return;
      const t = r1 * 8 + c1;
      if (!s.b[t]) { steps.push({ from: i, to: t }); return; }
      const r2 = r1 + dr; const c2 = c1 + dc;
      if (sideOf(s.b[t]) !== side && r2 >= 0 && r2 <= 7 && c2 >= 0 && c2 <= 7 && !s.b[r2 * 8 + c2]) jumps.push({ from: i, to: r2 * 8 + c2, cap: t });
    }));
  });
  return jumps.length ? jumps : s.jumping != null ? [] : steps;
}
function apply(s, m) {
  const b = [...s.b]; let p = b[m.from]; b[m.from] = 0;
  const row = Math.floor(m.to / 8); let crowned = false;
  if ((p === 1 && row === 0) || (p === 3 && row === 7)) { p += 1; crowned = true; }
  b[m.to] = p; if (m.cap != null) b[m.cap] = 0;
  let next = { ...s, b, last: m, jumping: null };
  if (m.cap != null && !crowned) { const more = moves({ ...next, jumping: m.to }, s.turn); if (more.length && more[0].cap != null) next = { ...next, jumping: m.to }; }
  if (next.jumping == null) next.turn = s.turn === 1 ? 2 : 1;
  const over = !moves(next, next.turn).length;
  return { ...next, over, roomWinner: over ? s.turn - 1 : null, ev: { kind: over ? 'over' : m.cap != null ? 'cap' : crowned ? 'king' : 'move', side: s.turn, crowned, id: s.ev.id + 1 } };
}
const evalB = (b) => b.reduce((v, p, i) => v + (p === 3 ? 1 + Math.floor(i / 8) * 0.05 : p === 4 ? 1.7 : p === 1 ? -1 - (7 - Math.floor(i / 8)) * 0.05 : p === 2 ? -1.7 : 0), 0);
function search(s, depth, alpha, beta) {
  if (s.over) return s.turn === 2 ? -100 : 100;
  if (depth <= 0) return evalB(s.b);
  const max = s.turn === 2; let best = max ? -Infinity : Infinity;
  for (const m of moves(s, s.turn)) {
    const n = apply(s, m); const v = search(n, n.turn === s.turn ? depth : depth - 1, alpha, beta);
    if (max) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}
const BOT = BOTS[2];

export function Checkers({ config, onComplete, online }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const [g, setG] = useGameState(checkersInit, online);
  const mySide = online ? online.seat + 1 : 1;
  const botChat = useBanter('Checkers', online ? [] : [BOT]);
  const banter = online ? online.chat : botChat;
  const [sel, setSel] = useState(null);
  const [start] = useState(Date.now);
  const done = useRef(false);
  const turnSec = Math.max(10, 30 - level * 2);
  const matchSec = online ? null : Math.max(240, 480 - level * 15);
  const nameOf = (side) => (side === mySide ? 'You' : online ? online.names[side - 1] : BOT.name);
  const legal = g.turn === mySide && !g.over ? moves(g, mySide) : [];
  const count = (side) => g.b.filter((p) => sideOf(p) === side).length;
  const move = (m) => { setSel(null); setG((s) => apply(s, m)); };
  const tap = (i) => {
    if (g.turn !== mySide || g.over) return;
    const m = legal.find((x) => x.from === (g.jumping ?? sel) && x.to === i);
    if (m) { move(m); return; }
    if (legal.some((x) => x.from === i)) { setSel(i); sfx('step'); } else if (sideOf(g.b[i]) === mySide) { sfx('bad'); if (legal[0]?.cap != null) banter.line(0, 'You have to take the capture! Rules are rules 😏'); }
  };
  const { turnLeft, matchLeft } = useClocks({ turnSec, matchSec, turnKey: g.ev.id, running: !g.over,
    onTurnOut: () => { if (g.turn === mySide && legal.length) { move(legal[Math.floor(Math.random() * legal.length)]); banter.say(0, 'taunt', { force: true }); } },
    onMatchOut: () => { done.current = true; const won = count(mySide) > count(mySide === 1 ? 2 : 1); sfx(won ? 'win' : 'lose'); setTimeout(() => onComplete({ solved: won, accuracy: 0.5, duration_ms: Date.now() - start }), 1200); } });

  useEffect(() => {
    if (online || g.over || g.turn !== 2) return undefined;
    const t = setTimeout(() => setG((s) => {
      if (s.turn !== 2 || s.over) return s;
      const ms = moves(s, 2); const depth = Math.min(5, 1 + Math.ceil(level / 2));
      if (level <= 2 && Math.random() < 0.35) return apply(s, ms[Math.floor(Math.random() * ms.length)]);
      let best = ms[0]; let bv = -Infinity;
      ms.forEach((m) => { const n = apply(s, m); const v = search(n, n.turn === 2 ? depth : depth - 1, -Infinity, Infinity) + Math.random() * 0.1; if (v > bv) { bv = v; best = m; } });
      return apply(s, best);
    }), 650);
    return () => clearTimeout(t);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const e = g.ev;
    if (e.kind === 'start') { banter.say(0, 'start', { force: true }); return; }
    sfx(e.kind === 'cap' ? 'capture' : e.crowned ? 'home' : 'step');
    if (e.kind === 'cap') banter.say(0, e.side === mySide ? 'you_hit' : 'bot_hit', { big: Math.random() < 0.4, event: e.side === mySide ? 'the human just captured your checkers piece' : 'you just captured the human\'s checkers piece' });
    if (e.crowned && e.side !== mySide) banter.line(0, 'King me! 👑 Bow down.');
    if (e.kind === 'over' && !done.current) {
      done.current = true; const won = e.side === mySide;
      sfx(won ? 'win' : 'lose');
      banter.say(0, won ? 'you_win' : 'bot_win', { big: true, force: true, event: won ? 'the human beat you at checkers' : 'you beat the human at checkers' });
      setTimeout(() => onComplete({ solved: won, accuracy: Math.min(1, 0.4 + count(mySide) / 12), duration_ms: Date.now() - start }), 1800);
    }
  }, [g.ev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const from = g.jumping ?? sel;
  const targets = legal.filter((m) => m.from === from).map((m) => m.to);
  const movable = new Set(legal.map((m) => m.from));
  const players = online ? onlinePlayers(online, ['#ef4444', '#64748b'], (i) => `${count(i + 1)} pieces`) : [{ ...YOU, color: '#ef4444', info: `${count(1)} pieces` }, { ...BOT, color: '#64748b', info: `${count(2)} pieces` }];
  return (
    <PartyStage config={config} title="Checkers" players={players} active={g.over ? -1 : g.turn - 1} turnLeft={turnLeft} turnSec={turnSec} matchLeft={matchLeft} banter={banter} meIdx={mySide - 1}>
      <div className="mx-auto max-w-[440px] rounded-[22px] p-2.5" style={{ background: 'linear-gradient(145deg,#78350f,#3f1d0b)', boxShadow: `0 0 0 2px ${theme.accent}99, 0 25px 60px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.25)` }}>
        <div className="grid aspect-square grid-cols-8 overflow-hidden rounded-lg" style={{ transform: mySide === 2 ? 'rotate(180deg)' : 'none' }} data-testid="checkers-board">
          {g.b.map((p, i) => { const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1; const isT = targets.includes(i); return (
            <button key={i} type="button" onClick={() => tap(i)} data-testid={`checkers-cell-${i}`} className="relative flex items-center justify-center" style={{ background: dark ? (g.last && (g.last.to === i || g.last.from === i) ? '#a16207' : '#5b3a1e') : '#f5deb3' }}>
              {isT && <span className="absolute h-1/3 w-1/3 animate-pulse rounded-full bg-emerald-400/80 shadow-[0_0_12px_#34d399]" />}
              {p > 0 && <span className={`relative flex h-[78%] w-[78%] items-center justify-center rounded-full transition-transform ${from === i ? 'scale-110 ring-4 ring-amber-300' : movable.has(i) ? 'ring-2 ring-emerald-300/80' : ''}`}
                style={{ background: sideOf(p) === 1 ? 'radial-gradient(circle at 35% 30%, #fecaca, #dc2626 45%, #7f1d1d)' : 'radial-gradient(circle at 35% 30%, #e2e8f0, #334155 45%, #020617)', boxShadow: '0 4px 0 rgba(0,0,0,0.45), inset 0 0 0 3px rgba(255,255,255,0.18)', transform: mySide === 2 ? 'rotate(180deg)' : undefined }}>
                {(p === 2 || p === 4) && <Crown className="h-1/2 w-1/2 text-amber-300 drop-shadow" fill="#fbbf24" />}
              </span>}
            </button>); })}
        </div>
      </div>
      <p className="mx-auto mt-2 w-fit rounded-full bg-black/50 px-3 py-0.5 text-[11px] font-bold text-white" data-testid="checkers-status">{g.over ? (g.roomWinner === mySide - 1 ? 'You win! 🎉' : `${nameOf(g.roomWinner + 1)} wins`) : g.turn === mySide ? (g.jumping != null ? 'Keep jumping!' : legal[0]?.cap != null ? 'You must capture!' : 'Your turn: tap a piece, then a green spot') : `${nameOf(g.turn)} is thinking…`}</p>
    </PartyStage>
  );
}
