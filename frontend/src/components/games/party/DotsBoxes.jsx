import { useEffect, useMemo, useRef, useState } from 'react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, onlinePlayers, rivalsFor, sfx, themeFor, useBanter, useClocks, useGameState } from './kit';
import { PartyStage } from './stage';

// Dots & Boxes: take turns drawing lines; close a box to claim it and go again. Most boxes wins.
const COLORS = ['#38bdf8', '#f43f5e', '#a3e635', '#f59e0b'];
const sizeFor = (lv) => (lv <= 5 ? 3 : lv <= 15 ? 4 : 5);
export const dotsInit = (n, size = 4) => ({ n: size, h: Array((size + 1) * size).fill(-1), v: Array(size * (size + 1)).fill(-1), own: Array(size * size).fill(-1), turn: 0, players: n, last: null, ev: { kind: 'start', id: 0 } });
const sides = (s, b) => { const r = Math.floor(b / s.n); const c = b % s.n; return [['h', r * s.n + c], ['h', (r + 1) * s.n + c], ['v', r * (s.n + 1) + c], ['v', r * (s.n + 1) + c + 1]]; };
const boxesOf = (s, kind, i) => {
  const out = [];
  if (kind === 'h') { const r = Math.floor(i / s.n); const c = i % s.n; if (r > 0) out.push((r - 1) * s.n + c); if (r < s.n) out.push(r * s.n + c); }
  else { const r = Math.floor(i / (s.n + 1)); const c = i % (s.n + 1); if (c > 0) out.push(r * s.n + c - 1); if (c < s.n) out.push(r * s.n + c); }
  return out;
};
const filled = (s, b) => sides(s, b).filter(([k, i]) => s[k][i] >= 0).length;
function drawLine(s, kind, i) {
  if (s[kind][i] >= 0 || s.over) return s;
  const next = { ...s, [kind]: s[kind].map((x, j) => (j === i ? s.turn : x)), own: [...s.own], last: [kind, i] };
  const closed = boxesOf(next, kind, i).filter((b) => filled(next, b) === 4);
  closed.forEach((b) => { next.own[b] = s.turn; });
  const over = next.own.every((o) => o >= 0);
  const scores = Array.from({ length: s.players }, (_, p) => next.own.filter((o) => o === p).length);
  const best = Math.max(...scores); const winners = scores.map((x, p) => (x === best ? p : -1)).filter((p) => p >= 0);
  return { ...next, turn: closed.length ? s.turn : (s.turn + 1) % s.players, over, roomWinner: over ? (winners.length > 1 ? -1 : winners[0]) : null,
    ev: { kind: over ? 'over' : closed.length ? 'box' : 'line', who: s.turn, k: closed.length, id: s.ev.id + 1 } };
}
const allLines = (s) => [...s.h.map((x, i) => (x < 0 ? ['h', i] : null)), ...s.v.map((x, i) => (x < 0 ? ['v', i] : null))].filter(Boolean);
function botMove(s, level) {
  const lines = allLines(s);
  const closes = lines.filter(([k, i]) => boxesOf(s, k, i).some((b) => filled(s, b) === 3));
  if (closes.length && Math.random() < 0.6 + level * 0.06) return closes[0];
  const risk = ([k, i]) => boxesOf(s, k, i).filter((b) => filled(s, b) === 2).length;
  if (level >= 2 && Math.random() < 0.5 + level * 0.06) { const safe = lines.filter((l) => risk(l) === 0); if (safe.length) return safe[Math.floor(Math.random() * safe.length)]; return lines.sort((a, b) => risk(a) - risk(b))[0]; }
  return lines[Math.floor(Math.random() * lines.length)];
}

export function DotsBoxes({ config, onComplete, online }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const n = online ? online.names.length : rivalsFor(config, 3) + 1;
  const [g, setG] = useGameState(() => dotsInit(n, sizeFor(theme.lv)), online);
  const me = online ? online.seat : 0;
  const bots = useMemo(() => (online ? [] : BOTS.slice(0, n - 1)), [n, online]);
  const botChat = useBanter('Dots and Boxes', bots);
  const banter = online ? online.chat : botChat;
  const [start] = useState(Date.now);
  const done = useRef(false);
  const turnSec = Math.max(7, 18 - level);
  const scores = Array.from({ length: g.players }, (_, p) => g.own.filter((o) => o === p).length);
  const nameOf = (p) => (p === me ? 'You' : online ? online.names[p] : bots[p - 1]?.name);
  const play = (k, i) => { if (g.turn === me && !g.over && g[k][i] < 0) setG((s) => drawLine(s, k, i)); };
  const { turnLeft } = useClocks({ turnSec, turnKey: `${g.turn}-${g.ev.id}`, running: !g.over,
    onTurnOut: () => { if (g.turn === me) { const l = allLines(g); const [k, i] = l[Math.floor(Math.random() * l.length)]; play(k, i); banter.say(0, 'taunt', { force: true }); } } });

  useEffect(() => {
    if (online || g.over || g.turn === 0) return undefined;
    const t = setTimeout(() => setG((s) => (s.turn === 0 || s.over ? s : drawLine(s, ...botMove(s, level)))), Math.max(500, 1100 - level * 50));
    return () => clearTimeout(t);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const e = g.ev;
    if (e.kind === 'start') { banter.say(0, 'start', { force: true }); return; }
    sfx(e.kind === 'box' ? (e.k > 1 ? 'combo' : 'pop') : 'step');
    if (e.kind === 'box' && e.who !== me && Math.random() < 0.5) banter.say(e.who - 1, 'bot_good', { big: e.k > 1, event: `you just claimed ${e.k} boxes in dots and boxes` });
    if (e.kind === 'box' && e.who === me && e.k > 1) banter.say(Math.floor(Math.random() * bots.length), 'you_hit', { big: true, event: 'the human just stole two boxes from you in dots and boxes' });
    if (e.kind === 'over' && !done.current) {
      done.current = true; const won = g.roomWinner === me;
      sfx(won ? 'win' : 'lose');
      const bestBot = scores.reduce((b, x, p) => (p !== me && x > scores[b] ? p : b), me === 0 ? 1 : 0);
      banter.say(won ? 0 : bestBot - 1, won ? 'you_win' : 'bot_win', { big: true, force: true, event: won ? 'the human won dots and boxes' : 'you won dots and boxes' });
      setTimeout(() => onComplete({ solved: won, accuracy: Math.min(1, scores[me] / (g.n * g.n) + 0.4), duration_ms: Date.now() - start }), 1800);
    }
  }, [g.ev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const S = 100 / g.n; const pad = 6; const sc = (100 - pad * 2) / 100; const P = (x) => pad + x * sc;
  const info = (p) => `${scores[p]} box${scores[p] === 1 ? '' : 'es'}`;
  const players = online ? onlinePlayers(online, COLORS, info) : [YOU, ...bots].map((p, i) => ({ ...p, color: COLORS[i], info: info(i) }));
  const isLast = (k, i) => g.last && g.last[0] === k && g.last[1] === i;
  const line = (k, i, x1, y1, x2, y2) => {
    const o = g[k][i];
    return (
      <g key={`${k}${i}`} onClick={() => play(k, i)} className={o < 0 && g.turn === me ? 'cursor-pointer' : ''} data-testid={`dots-line-${k}-${i}`}>
        <line x1={P(x1)} y1={P(y1)} x2={P(x2)} y2={P(y2)} stroke="transparent" strokeWidth="7" />
        <line x1={P(x1)} y1={P(y1)} x2={P(x2)} y2={P(y2)} stroke={o >= 0 ? COLORS[o] : 'rgba(255,255,255,0.14)'} strokeWidth={o >= 0 ? 2.4 : 1.2} strokeLinecap="round" strokeDasharray={o >= 0 ? '' : '1.5 2'} style={{ filter: isLast(k, i) ? `drop-shadow(0 0 2px ${COLORS[o]})` : '' }} />
      </g>
    );
  };
  return (
    <PartyStage config={config} title="Dots & Boxes" players={players} active={g.over ? -1 : g.turn} turnLeft={turnLeft} turnSec={turnSec} banter={banter} meIdx={me}>
      <div className="mx-auto max-w-[440px] rounded-[22px] p-2" style={{ background: theme.frame, boxShadow: `0 0 0 2px ${theme.accent}99, 0 25px 60px rgba(0,0,0,0.55)` }}>
        <svg viewBox="0 0 100 100" className="block aspect-square w-full rounded-xl" style={{ background: `${theme.felt}ee` }} data-testid="dots-board">
          {g.own.map((o, b) => o >= 0 && <g key={b} className="pty-new"><rect x={P((b % g.n) * S) + 1} y={P(Math.floor(b / g.n) * S) + 1} width={S * sc - 2} height={S * sc - 2} rx="2" fill={`${COLORS[o]}66`} /><text x={P((b % g.n) * S + S / 2)} y={P(Math.floor(b / g.n) * S + S / 2) + 2.2} textAnchor="middle" fontSize="6" fontWeight="900" fill="#fff">{(players[o]?.name || '?')[0]}</text></g>)}
          {g.h.map((_, i) => { const r = Math.floor(i / g.n); const c = i % g.n; return line('h', i, c * S, r * S, (c + 1) * S, r * S); })}
          {g.v.map((_, i) => { const r = Math.floor(i / (g.n + 1)); const c = i % (g.n + 1); return line('v', i, c * S, r * S, c * S, (r + 1) * S); })}
          {Array.from({ length: (g.n + 1) ** 2 }, (_, d) => <circle key={d} cx={P((d % (g.n + 1)) * S)} cy={P(Math.floor(d / (g.n + 1)) * S)} r="1.6" fill="#fff" />)}
        </svg>
      </div>
      <p className="mx-auto mt-2 w-fit rounded-full bg-black/50 px-3 py-0.5 text-[11px] font-bold text-white" data-testid="dots-status">{g.over ? (g.roomWinner === me ? 'You win! 🎉' : g.roomWinner === -1 ? 'Draw!' : `${nameOf(g.roomWinner)} wins`) : g.turn === me ? 'Your turn: tap a dotted line' : `${nameOf(g.turn)} is thinking…`}</p>
    </PartyStage>
  );
}
