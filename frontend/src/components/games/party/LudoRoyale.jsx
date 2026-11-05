import { useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, rivalsFor, sfx, themeFor, useBanter } from './kit';
import { Dice3D, PartyStage } from './stage';

// Classic Ludo on a real 15x15 cross board: 52-square track, safe stars, coloured home runs, 6 to leave base,
// extra roll on 6 / capture / reaching home, three 6s forfeit the turn, exact roll to finish.
const SEAT_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#eab308'];
const SEAT_DARK = ['#1e3a8a', '#7f1d1d', '#14532d', '#854d0e'];
const TRACK = [
  ...[1, 2, 3, 4, 5].map((c) => [6, c]), ...[5, 4, 3, 2, 1, 0].map((r) => [r, 6]), [0, 7], ...[0, 1, 2, 3, 4, 5].map((r) => [r, 8]),
  ...[9, 10, 11, 12, 13, 14].map((c) => [6, c]), [7, 14], ...[14, 13, 12, 11, 10, 9].map((c) => [8, c]), ...[9, 10, 11, 12, 13, 14].map((r) => [r, 8]),
  [14, 7], ...[14, 13, 12, 11, 10, 9].map((r) => [r, 6]), ...[5, 4, 3, 2, 1, 0].map((c) => [8, c]), [7, 0], [6, 0],
];
const HOME = [[1, 2, 3, 4, 5].map((c) => [7, c]), [1, 2, 3, 4, 5].map((r) => [r, 7]), [13, 12, 11, 10, 9].map((c) => [7, c]), [13, 12, 11, 10, 9].map((r) => [r, 7])];
const START = [0, 13, 26, 39];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const BASE_ORIGIN = [[0, 0], [0, 9], [9, 9], [9, 0]];
const SPOTS = [[1.9, 1.9], [1.9, 4.1], [4.1, 1.9], [4.1, 4.1]];
const FINISH = [[7.5, 6.6], [6.6, 7.5], [7.5, 8.4], [8.4, 7.5]];
const END = 56;
const die = () => 1 + Math.floor(Math.random() * 6);
const absOf = (seat, s) => (s >= 0 && s <= 50 ? (START[seat] + s) % 52 : null);
function centerOf(seat, s, t) {
  if (s === -1) { const [r, c] = BASE_ORIGIN[seat]; return [r + SPOTS[t][0], c + SPOTS[t][1]]; }
  if (s >= END) return FINISH[seat];
  const [r, c] = s >= 51 ? HOME[seat][s - 51] : TRACK[absOf(seat, s)];
  return [r + 0.5, c + 0.5];
}

function setup(rivals, lv) {
  const seats = [[0, 2], [0, 1, 2], [0, 1, 2, 3]][rivals - 1];
  const n = lv <= 3 ? 2 : lv <= 10 ? 3 : 4;
  return { seats, pos: [0, 1, 2, 3].map((s) => (seats.includes(s) ? Array(n).fill(-1) : [])), turn: 0, phase: 'roll', roll: 6, spin: 0, sixes: 0, opts: [], anim: null, ev: { kind: 'start', id: 0 }, msg: 'Tap the dice to roll' };
}
const movable = (pos, seat, r) => pos[seat].map((s, t) => ((s === -1 && r === 6) || (s >= 0 && s + r <= END) ? t : -1)).filter((t) => t >= 0);
const ev = (s, kind, extra = {}) => ({ kind, id: (s.ev?.id || 0) + 1, ...extra });
const nextTurn = (s) => ({ ...s, turn: (s.turn + 1) % s.seats.length, phase: 'roll', sixes: 0, opts: [], anim: null });

function rollDice(s) {
  const seat = s.seats[s.turn];
  const r = die();
  const sixes = r === 6 ? s.sixes + 1 : 0;
  const base = { ...s, roll: r, spin: s.spin + 1, sixes };
  if (sixes === 3) return { ...base, phase: 'next', msg: 'Three 6s in a row: turn lost!', ev: ev(s, 'three6', { seat }) };
  const opts = movable(s.pos, seat, r);
  if (!opts.length) return { ...base, phase: 'next', msg: `Rolled ${r}: no move`, ev: ev(s, r === 6 ? 'six' : 'roll', { seat, none: true }) };
  return { ...base, phase: 'pick', opts, msg: seat === 0 ? `You rolled ${r}: tap a glowing token` : `Rolled ${r}`, ev: ev(s, r === 6 ? 'six' : 'roll', { seat }) };
}
function choose(s, t) {
  const seat = s.seats[s.turn];
  const from = s.pos[seat][t];
  const pos = s.pos.map((a) => [...a]);
  if (from === -1) pos[seat][t] = 0;
  return { ...s, pos, phase: 'anim', opts: [], anim: { seat, t, target: from === -1 ? 0 : from + s.roll } };
}
function stepAnim(s) {
  const { seat, t, target } = s.anim;
  if (s.pos[seat][t] < target) { const pos = s.pos.map((a) => [...a]); pos[seat][t] += 1; return { ...s, pos, ev: ev(s, 'step') }; }
  const pos = s.pos.map((a) => [...a]);
  const a = absOf(seat, target);
  const victims = [];
  if (a !== null && !SAFE.has(a)) s.seats.forEach((q) => { if (q !== seat) pos[q].forEach((st, k) => { if (absOf(q, st) === a) { pos[q][k] = -1; victims.push(q); } }); });
  const home = target === END;
  if (pos[seat].every((x) => x === END)) return { ...s, pos, phase: 'over', winner: seat, anim: null, msg: seat === 0 ? 'You win!' : `${BOTS[s.seats.indexOf(seat) - 1].name} wins!`, ev: ev(s, 'over', { seat }) };
  const kind = victims.length ? 'capture' : home ? 'home' : 'moved';
  const out = { ...s, pos, anim: null, ev: ev(s, kind, { seat, victim: victims[0] }), msg: victims.length ? 'Captured! Bonus roll' : home ? 'Token home! Bonus roll' : s.roll === 6 ? 'Rolled a 6: roll again' : '' };
  return victims.length || home || s.roll === 6 ? { ...out, phase: 'roll', sixes: victims.length || home ? 0 : s.sixes } : nextTurn(out);
}
function botPick(s, level) {
  const seat = s.seats[s.turn];
  if (Math.random() < 0.5 - level * 0.05) return s.opts[Math.floor(Math.random() * s.opts.length)];
  let best = s.opts[0]; let bestV = -Infinity;
  s.opts.forEach((t) => {
    const from = s.pos[seat][t]; const to = from === -1 ? 0 : from + s.roll; const a = absOf(seat, to);
    let v = to * 0.2;
    if (from === -1) v += 22;
    if (to === END) v += 45; else if (to >= 51) v += 25;
    if (a !== null && !SAFE.has(a)) {
      s.seats.forEach((q) => { if (q === seat) return; s.pos[q].forEach((st) => { const qa = absOf(q, st); if (qa === null) return; if (qa === a) v += 60; const d = (a - qa + 52) % 52; if (level >= 4 && d >= 1 && d <= 6) v -= 4 + level * 2; }); });
    } else if (a !== null) v += 10;
    const fa = absOf(seat, from);
    if (level >= 6 && fa !== null && !SAFE.has(fa)) s.seats.forEach((q) => { if (q !== seat) s.pos[q].forEach((st) => { const qa = absOf(q, st); const d = qa === null ? 0 : (fa - qa + 52) % 52; if (d >= 1 && d <= 6) v += 12; }); });
    if (v > bestV) { bestV = v; best = t; }
  });
  return best;
}

function Pawn({ seat, at, offset, glow, onClick, testId, size }) {
  const [r, c] = at;
  return (
    <button type="button" onClick={onClick} disabled={!glow} data-testid={testId} aria-label="token"
      className={`pty-token absolute z-10 rounded-full ${glow ? 'pty-hop cursor-pointer' : ''}`}
      style={{ left: `${((c + offset[0]) / 15) * 100}%`, top: `${((r + offset[1]) / 15) * 100}%`, width: `${size}%`, height: `${size}%`, transform: 'translate(-50%,-50%)',
        background: `radial-gradient(circle at 35% 30%, #ffffff 0 10%, ${SEAT_COLORS[seat]} 38%, ${SEAT_DARK[seat]} 100%)`,
        boxShadow: glow ? `0 0 0 3px #fff, 0 0 18px 6px ${SEAT_COLORS[seat]}` : '0 3px 0 rgba(0,0,0,0.45), 0 6px 10px rgba(0,0,0,0.35)', border: '2px solid rgba(255,255,255,0.9)' }}>
      <span className="absolute inset-[26%] rounded-full border-2 border-white/70" />
    </button>
  );
}

function Board({ g, theme, onPick }) {
  const cells = [];
  TRACK.forEach(([r, c], i) => {
    const startSeat = START.indexOf(i);
    const bg = startSeat >= 0 && g.seats.includes(startSeat) ? SEAT_COLORS[startSeat] : '#f8fafc';
    cells.push(<div key={`t${i}`} className="flex items-center justify-center border border-slate-300/70" style={{ gridRow: r + 1, gridColumn: c + 1, background: bg }}>{SAFE.has(i) && <Star className="h-[70%] w-[70%]" fill={startSeat >= 0 ? '#ffffff' : '#cbd5e1'} stroke="none" />}</div>);
  });
  HOME.forEach((col, seat) => col.forEach(([r, c], k) => cells.push(<div key={`h${seat}${k}`} className="border border-slate-300/70" style={{ gridRow: r + 1, gridColumn: c + 1, background: g.seats.includes(seat) ? SEAT_COLORS[seat] : '#e2e8f0' }} />)));
  const groups = {};
  g.seats.forEach((seat) => g.pos[seat].forEach((s, t) => { const k = s === -1 ? `b${seat}${t}` : centerOf(seat, s, t).join(','); (groups[k] ||= []).push({ seat, t, s }); }));
  const pawns = [];
  Object.values(groups).forEach((list) => list.forEach(({ seat, t, s }, k) => {
    const spread = list.length > 1 ? [(k % 2 ? 0.18 : -0.18), (k > 1 ? 0.18 : -0.18)] : [0, 0];
    const glow = seat === 0 && g.phase === 'pick' && g.seats[g.turn] === 0 && g.opts.includes(t);
    pawns.push(<Pawn key={`${seat}-${t}`} seat={seat} at={centerOf(seat, s, t)} offset={spread} glow={glow} onClick={() => onPick(t)} testId={seat === 0 ? `ludo-token-${t}` : undefined} size={list.length > 1 ? 4.6 : 5.8} />);
  }));
  return (
    <div className="mx-auto w-full max-w-[460px] rounded-[22px] p-2 sm:p-3" style={{ background: theme.frame, boxShadow: `0 0 0 2px ${theme.accent}88, 0 25px 60px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.25)` }}>
      <div className="relative aspect-square overflow-hidden rounded-xl" style={{ transform: 'rotate(-90deg)' }} data-testid="ludo-board">
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(15,1fr)', gridTemplateRows: 'repeat(15,1fr)', background: '#f8fafc' }}>
          {BASE_ORIGIN.map(([r, c], seat) => (
            <div key={seat} className="relative p-[12%]" style={{ gridRow: `${r + 1} / span 6`, gridColumn: `${c + 1} / span 6`, background: g.seats.includes(seat) ? `linear-gradient(135deg, ${SEAT_COLORS[seat]}, ${SEAT_DARK[seat]})` : '#94a3b8' }}>
              <div className="h-full w-full rounded-2xl bg-white shadow-[inset_0_3px_8px_rgba(0,0,0,0.25)]">
                {SPOTS.map(([sr, sc], k) => <span key={k} className="absolute rounded-full" style={{ left: `${((sc - 0.55) / 6) * 100}%`, top: `${((sr - 0.55) / 6) * 100}%`, width: '18%', height: '18%', background: g.seats.includes(seat) ? `${SEAT_COLORS[seat]}55` : '#cbd5e1', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)' }} />)}
              </div>
            </div>
          ))}
          <div style={{ gridRow: '7 / span 3', gridColumn: '7 / span 3', background: `conic-gradient(from -45deg, ${SEAT_COLORS[1]} 0 90deg, ${SEAT_COLORS[2]} 90deg 180deg, ${SEAT_COLORS[3]} 180deg 270deg, ${SEAT_COLORS[0]} 270deg 360deg)` }} />
          {cells}
        </div>
        {pawns}
      </div>
    </div>
  );
}

export function LudoRoyale({ config, onComplete }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const [g, setG] = useState(() => setup(rivalsFor(config, 3), theme.lv));
  const [start] = useState(Date.now);
  const bots = useMemo(() => BOTS.slice(0, g.seats.length - 1), [g.seats.length]);
  const banter = useBanter('Ludo', bots);
  const done = useRef(false);
  const seat = g.seats[g.turn];
  const who = (s) => g.seats.indexOf(s) - 1;

  useEffect(() => {
    if (g.phase === 'over') return undefined;
    let t;
    if (g.phase === 'anim') t = setTimeout(() => setG(stepAnim), 170);
    else if (g.phase === 'next') t = setTimeout(() => setG(nextTurn), 1000);
    else if (g.phase === 'roll' && seat !== 0) t = setTimeout(() => setG(rollDice), 900);
    else if (g.phase === 'pick' && seat !== 0) t = setTimeout(() => setG((s) => choose(s, botPick(s, level))), 650);
    else if (g.phase === 'pick' && g.opts.length === 1) t = setTimeout(() => setG((s) => (s.phase === 'pick' && s.opts.length === 1 ? choose(s, s.opts[0]) : s)), 700);
    else if (g.phase === 'roll' && seat === 0) t = setTimeout(() => banter.say(Math.floor(Math.random() * bots.length), 'taunt'), 9000);
    return () => clearTimeout(t);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const e = g.ev;
    if (!e) return;
    if (e.kind === 'start') banter.say(0, 'start', { force: true });
    if (e.kind === 'roll' || e.kind === 'six') { sfx('dice'); if (e.kind === 'six') setTimeout(() => sfx('six'), 650); if (e.none && e.seat !== 0 && Math.random() < 0.4) banter.say(who(e.seat), 'bot_bad'); }
    if (e.kind === 'step') sfx('step');
    if (e.kind === 'three6') { sfx('bad'); if (e.seat === 0) banter.say(0, 'taunt', { force: true }); }
    if (e.kind === 'home') { sfx('home'); banter.say(e.seat === 0 ? Math.floor(Math.random() * bots.length) : who(e.seat), e.seat === 0 ? 'you_good' : 'bot_good'); }
    if (e.kind === 'capture') {
      sfx('capture');
      if (e.victim === 0) banter.say(who(e.seat), 'bot_hit', { big: true, event: 'you just captured the human player\'s Ludo token and sent it back to base' });
      else if (e.seat === 0) banter.say(who(e.victim), 'you_hit', { big: true, event: 'the human player just captured your Ludo token and sent it home' });
    }
    if (e.kind === 'over' && !done.current) {
      done.current = true;
      const won = e.seat === 0;
      sfx(won ? 'win' : 'lose');
      banter.say(won ? 0 : who(e.seat), won ? 'you_win' : 'bot_win', { big: true, force: true, event: won ? 'the human player beat you at Ludo' : 'you just won the Ludo game against the human' });
      const total = g.pos[0].length;
      const rivalsHome = Math.max(...g.seats.filter((s) => s !== 0).map((s) => g.pos[s].filter((x) => x === END).length));
      setTimeout(() => onComplete({ solved: won, accuracy: won ? 1 - (rivalsHome / total) * 0.5 : g.pos[0].filter((x) => x === END).length / total, duration_ms: Date.now() - start }), 2200);
    }
  }, [g.ev?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const players = g.seats.map((s, i) => ({ ...(i === 0 ? YOU : bots[i - 1]), color: SEAT_COLORS[s], info: `${g.pos[s].filter((x) => x === END).length}/${g.pos[s].length} home` }));
  const myRoll = seat === 0 && g.phase === 'roll';
  return (
    <PartyStage config={config} title="Ludo Royale" players={players} active={g.turn} banter={banter}>
      <Board g={g} theme={theme} onPick={(t) => { if (g.phase === 'pick' && seat === 0 && g.opts.includes(t)) setG((s) => choose(s, t)); }} />
      <div className="mt-3 flex items-center justify-center gap-4">
        <div className="rounded-2xl p-2.5" style={{ background: `${SEAT_COLORS[seat]}33`, boxShadow: myRoll ? `0 0 0 2px ${SEAT_COLORS[seat]}, 0 0 30px ${SEAT_COLORS[seat]}` : 'none' }}>
          <Dice3D value={g.roll} spin={g.spin} size={54} color={seat === 0 ? '#e0e7ff' : '#f1f5f9'} onClick={() => myRoll && setG(rollDice)} disabled={!myRoll} testId="ludo-roll" />
        </div>
        <div className="min-w-0 text-left">
          <div className="text-sm font-black text-white" data-testid="ludo-status">{g.phase === 'over' ? g.msg : seat === 0 ? (myRoll ? 'Your turn: tap the dice' : g.msg) : `${bots[g.turn - 1]?.name} is playing…`}</div>
          <div className="text-[10px] font-semibold text-white/60">Roll a 6 to leave base · stars are safe · 6, capture or home = extra roll</div>
        </div>
      </div>
    </PartyStage>
  );
}
