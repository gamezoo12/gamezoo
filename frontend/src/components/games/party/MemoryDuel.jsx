import { useEffect, useMemo, useRef, useState } from 'react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, onlinePlayers, rivalsFor, sfx, themeFor, useBanter, useClocks, useGameState } from './kit';
import { PartyStage } from './stage';

// Memory Duel: take turns flipping two cards; a pair scores and you go again. Bots remember more on harder levels.
const FACES = ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🐯', '🐨', '🐵', '🦉', '🐳', '🦋', '🐢', '🦜', '🐝', '🦖', '🐧', '🦩'];
const COLORS = ['#38bdf8', '#f43f5e', '#a3e635', '#f59e0b'];
export const memoryInit = (n, pairs = 10) => ({ cards: [...FACES.slice(0, pairs), ...FACES.slice(0, pairs)].sort(() => Math.random() - 0.5).map((k) => ({ k, owner: -1 })), flipped: [], turn: 0, players: n, ev: { kind: 'start', id: 0 } });
const pairsFor = (lv) => (lv <= 5 ? 8 : lv <= 15 ? 10 : lv <= 30 ? 12 : 15);
function flip(s, i) {
  if (s.flipped.length >= 2 || s.flipped.includes(i) || s.cards[i].owner >= 0) return s;
  return { ...s, flipped: [...s.flipped, i], ev: { kind: 'flip', i, id: s.ev.id + 1 } };
}
function resolve(s) {
  const [a, b] = s.flipped; const match = s.cards[a].k === s.cards[b].k;
  const cards = match ? s.cards.map((c, i) => (i === a || i === b ? { ...c, owner: s.turn } : c)) : s.cards;
  const over = cards.every((c) => c.owner >= 0);
  const scores = Array.from({ length: s.players }, (_, p) => cards.filter((c) => c.owner === p).length);
  const best = Math.max(...scores); const tops = scores.map((x, p) => (x === best ? p : -1)).filter((p) => p >= 0);
  return { ...s, cards, flipped: [], turn: match ? s.turn : (s.turn + 1) % s.players, over, roomWinner: over ? (tops.length > 1 ? -1 : tops[0]) : null, ev: { kind: over ? 'over' : match ? 'pair' : 'miss', who: s.turn, id: s.ev.id + 1 } };
}

export function MemoryDuel({ config, onComplete, online }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const n = online ? online.names.length : rivalsFor(config, 3) + 1;
  const [g, setG] = useGameState(() => memoryInit(n, pairsFor(theme.lv)), online);
  const me = online ? online.seat : 0;
  const bots = useMemo(() => (online ? [] : BOTS.slice(0, n - 1)), [n, online]);
  const botChat = useBanter('Memory Duel (matching pairs)', bots);
  const banter = online ? online.chat : botChat;
  const seen = useRef({});
  const [start] = useState(Date.now);
  const done = useRef(false);
  const turnSec = Math.max(6, 14 - Math.floor(level / 2));
  const scores = Array.from({ length: g.players }, (_, p) => g.cards.filter((c) => c.owner === p).length / 2);
  const nameOf = (p) => (p === me ? 'You' : online ? online.names[p] : bots[p - 1]?.name);
  const tap = (i) => { if (g.turn === me && !g.over && g.flipped.length < 2) setG((s) => flip(s, i)); };
  const { turnLeft } = useClocks({ turnSec, turnKey: `${g.turn}-${g.ev.kind === 'flip' ? 0 : g.ev.id}`, running: !g.over,
    onTurnOut: () => { if (g.turn === me) { const open = g.cards.map((c, i) => (c.owner < 0 && !g.flipped.includes(i) ? i : -1)).filter((i) => i >= 0); tap(open[Math.floor(Math.random() * open.length)]); } } });

  useEffect(() => {
    if (g.ev.kind === 'flip') g.flipped.forEach((i) => { seen.current[i] = g.cards[i].k; });
    if (g.over) return undefined;
    const driver = !online || g.turn === me;
    if (g.flipped.length === 2 && driver) { const t = setTimeout(() => setG(resolve), 950); return () => clearTimeout(t); }
    if (online || g.turn === 0 || g.flipped.length === 2) return undefined;
    const t = setTimeout(() => setG((s) => {
      if (s.turn === 0 || s.over || s.flipped.length >= 2) return s;
      const open = s.cards.map((c, i) => (c.owner < 0 && !s.flipped.includes(i) ? i : -1)).filter((i) => i >= 0);
      const recall = (i) => seen.current[i] && Math.random() < 0.35 + level * 0.065;
      let pick;
      if (s.flipped.length === 1) { const k = s.cards[s.flipped[0]].k; pick = open.find((i) => seen.current[i] === k && recall(i)); }
      else { const known = open.filter((i) => recall(i)); for (const i of known) { const j = known.find((x) => x !== i && seen.current[x] === seen.current[i]); if (j != null) { pick = i; break; } } pick ??= open.filter((i) => !seen.current[i])[0]; }
      pick ??= open[Math.floor(Math.random() * open.length)];
      return flip(s, pick);
    }), 750);
    return () => clearTimeout(t);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const e = g.ev;
    if (e.kind === 'start') { banter.say(0, 'start', { force: true }); return; }
    sfx(e.kind === 'flip' ? 'card' : e.kind === 'pair' ? 'pop' : e.kind === 'miss' ? 'bad' : 'card');
    if (e.kind === 'pair' && e.who !== me && Math.random() < 0.5) banter.say(e.who - 1, 'bot_good');
    if (e.kind === 'miss' && e.who !== me && Math.random() < 0.3) banter.say(e.who - 1, 'bot_bad');
    if (e.kind === 'pair' && e.who === me && Math.random() < 0.4) banter.say(Math.floor(Math.random() * bots.length), 'you_good');
    if (e.kind === 'over' && !done.current) {
      done.current = true; const won = g.roomWinner === me;
      sfx(won ? 'win' : 'lose');
      banter.say(0, won ? 'you_win' : 'bot_win', { big: true, force: true, event: won ? 'the human beat you at memory pairs' : 'you beat the human at memory pairs' });
      { const end = Date.now(); setTimeout(() => onComplete({ solved: won, accuracy: Math.min(1, scores[me] / (g.cards.length / 2) + 0.4), duration_ms: end - start, delay_ms: Date.now() - end }), 1800); }
    }
  }, [g.ev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = g.cards.length <= 16 ? 4 : g.cards.length <= 20 ? 5 : 6;
  const info = (p) => `${scores[p]} pairs`;
  const players = online ? onlinePlayers(online, COLORS, info) : [YOU, ...bots].map((p, i) => ({ ...p, color: COLORS[i], info: info(i) }));
  return (
    <PartyStage config={config} title="Memory Duel" players={players} active={g.over ? -1 : g.turn} turnLeft={turnLeft} turnSec={turnSec} banter={banter} meIdx={me}>
      <div className="mx-auto grid max-w-[440px] gap-1.5 rounded-[22px] p-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, background: theme.frame, boxShadow: `0 0 0 2px ${theme.accent}99, 0 25px 60px rgba(0,0,0,0.55)` }} data-testid="memory-board">
        {g.cards.map((c, i) => { const up = c.owner >= 0 || g.flipped.includes(i); return (
          <button key={i} type="button" onClick={() => tap(i)} className="relative aspect-[3/4]" style={{ perspective: 600 }} data-testid={`memory-card-${i}`}>
            <span className="absolute inset-0 transition-transform duration-500" style={{ transformStyle: 'preserve-3d', transform: up ? 'rotateY(180deg)' : 'none' }}>
              <span className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-white/70 text-lg font-black text-white/80" style={{ backfaceVisibility: 'hidden', background: `linear-gradient(145deg, ${theme.accent}, ${theme.felt})` }}>★</span>
              <span className="absolute inset-0 flex items-center justify-center rounded-xl border-2 bg-white text-3xl" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderColor: c.owner >= 0 ? COLORS[c.owner] : '#fff', boxShadow: c.owner >= 0 ? `0 0 12px ${COLORS[c.owner]}` : 'none' }}>{c.k}</span>
            </span>
          </button>); })}
      </div>
      <p className="mx-auto mt-2 w-fit rounded-full bg-black/50 px-3 py-0.5 text-[11px] font-bold text-white" data-testid="memory-status">{g.over ? (g.roomWinner === me ? 'You win! 🎉' : g.roomWinner === -1 ? 'Draw!' : `${nameOf(g.roomWinner)} wins`) : g.turn === me ? 'Your turn: flip two cards' : `${nameOf(g.turn)} is flipping…`}</p>
    </PartyStage>
  );
}
