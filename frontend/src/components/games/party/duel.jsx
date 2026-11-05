import { useEffect, useRef, useState } from 'react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, onlinePlayers, sfx, themeFor, useBanter, useClocks, useGameState } from './kit';
import { PartyStage } from './stage';

// Shared engine for 2-player turn games (side 1 = you / seat 0, side 2 = bot / seat 1) with minimax bots and live-room support.
// def: { id, title, bot, colors, init(lv), legal(s), candidates?(s), play(s,m) -> {b, turn, ev?}, result(s) -> 1|2|0|null, score(b) (bot view), depth(level), Board }
export function duelStep(def, s, m) {
  const { b, turn, ev: kind = 'move', snd } = def.play(s, m);
  let n = { ...s, b, turn, last: m };
  if (!def.noPass && !def.legal(n).length) { const other = { ...n, turn: n.turn === 1 ? 2 : 1 }; if (def.legal(other).length) n = other; }
  const r = def.result(n);
  return { ...n, over: r != null, win: r, roomWinner: r == null ? null : r === 0 ? -1 : r - 1, ev: { kind: r != null ? 'over' : kind, side: s.turn, id: s.ev.id + 1, snd } };
}
export function search(def, s, depth, a, bta) {
  if (s.over) return s.win === 2 ? 1e6 + depth : s.win === 1 ? -1e6 - depth : 0;
  if (depth <= 0) return def.score(s.b, s);
  const max = s.turn === 2; let best = max ? -Infinity : Infinity;
  for (const m of (def.candidates || def.legal)(s)) {
    const v = search(def, duelStep(def, s, m), depth - 1, a, bta);
    if (max) { best = Math.max(best, v); a = Math.max(a, v); } else { best = Math.min(best, v); bta = Math.min(bta, v); }
    if (bta <= a) break;
  }
  return best;
}
export const duelInit = (def, lv = 11) => ({ b: def.init(lv), turn: 1, last: null, over: false, win: null, ev: { kind: 'start', id: 0 } });

export function DuelGame({ def, config, onComplete, online }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const [g, setG] = useGameState(() => duelInit(def, theme.lv), online);
  const mySide = online ? online.seat + 1 : 1;
  const bot = BOTS[def.bot];
  const botChat = useBanter(def.title, online ? [] : [bot]);
  const banter = online ? online.chat : botChat;
  const [start] = useState(Date.now);
  const done = useRef(false);
  const turnSec = Math.max(8, 22 - level);
  const matchSec = online ? null : Math.max(150, 330 - level * 12);
  const legal = g.turn === mySide && !g.over ? def.legal(g) : [];
  const nameOf = (side) => (side === mySide ? 'You' : online ? online.names[side - 1] : bot.name);
  const move = (m) => { if (legal.includes(m)) setG((s) => duelStep(def, s, m)); else sfx('bad'); };
  const finish = (won, why) => {
    if (done.current) return; done.current = true;
    sfx(won ? 'win' : 'lose');
    banter.say(0, won ? 'you_win' : 'bot_win', { big: true, force: true, event: won ? `the human beat you at ${def.title}` : `you beat the human at ${def.title}`, detail: why || '' });
    setTimeout(() => onComplete({ solved: won, accuracy: won ? 0.95 : 0.3, duration_ms: Date.now() - start }), 1800);
  };
  const { turnLeft, matchLeft } = useClocks({ turnSec, matchSec, turnKey: g.ev.id, running: !g.over,
    onTurnOut: () => { if (g.turn === mySide && legal.length) { move(legal[Math.floor(Math.random() * legal.length)]); banter.say(0, 'taunt', { force: true }); } },
    onMatchOut: () => finish(def.score(g.b, g) < 0, 'match clock ran out, better position won') });
  useEffect(() => {
    if (online || g.over || g.turn !== 2) return undefined;
    const t = setTimeout(() => setG((s) => {
      if (s.turn !== 2 || s.over) return s;
      const ms = (def.candidates || def.legal)(s);
      if (Math.random() < 0.35 - level * 0.035) return duelStep(def, s, ms[Math.floor(Math.random() * ms.length)]);
      let best = ms[0]; let bv = -Infinity;
      ms.forEach((m) => { const v = search(def, duelStep(def, s, m), def.depth(level) - 1, -Infinity, Infinity) + Math.random() * 0.5; if (v > bv) { bv = v; best = m; } });
      return duelStep(def, s, best);
    }), 700);
    return () => clearTimeout(t);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const e = g.ev;
    if (e.kind === 'start') { banter.say(0, 'start', { force: true }); return; }
    sfx(e.kind === 'big' ? 'combo' : e.kind === 'extra' ? 'six' : e.snd || def.sound || 'drop');
    if (e.kind === 'big') banter.say(0, e.side === mySide ? 'you_hit' : 'bot_hit', { big: Math.random() < 0.4, event: e.side === mySide ? `the human just made a huge move against you in ${def.title}` : `you just made a huge move against the human in ${def.title}` });
    if (e.kind === 'over') finish(g.win === mySide, g.win === 0 ? 'it was a draw' : '');
  }, [g.ev.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = (i) => def.info?.(g.b, i + 1) ?? def.colors[i].name;
  const players = online ? onlinePlayers(online, def.colors.map((c) => c.hex), info) : [{ ...YOU, color: def.colors[0].hex, info: info(0) }, { ...bot, color: def.colors[1].hex, info: info(1) }];
  const { Board } = def;
  return (
    <PartyStage config={config} title={def.title} players={players} active={g.over ? -1 : g.turn - 1} turnLeft={turnLeft} turnSec={turnSec} matchLeft={matchLeft} banter={banter} meIdx={mySide - 1}>
      <div className="mx-auto max-w-[440px] rounded-[22px] p-2.5" style={{ background: def.frame || theme.frame, boxShadow: `0 0 0 2px ${theme.accent}99, 0 25px 60px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.25)` }} data-testid={`${def.id}-board`}>
        <Board g={g} legal={legal} onMove={move} mySide={mySide} />
      </div>
      <p className="mx-auto mt-2 w-fit rounded-full bg-black/50 px-3 py-0.5 text-center text-[11px] font-bold text-white" data-testid={`${def.id}-status`}>{g.over ? (g.win === 0 ? 'Draw!' : g.win === mySide ? 'You win! 🎉' : `${nameOf(g.win)} wins`) : g.turn === mySide ? def.hint : `${nameOf(g.turn)} is thinking…`}</p>
    </PartyStage>
  );
}
