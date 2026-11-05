import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Repeat } from 'lucide-react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, rivalsFor, sfx, useBanter, useClocks } from './kit';
import { PartyStage } from './stage';

// Colour Clash Cards (classic shedding game): match colour or symbol; Skip, Reverse, +2, Wild and Wild +4.
// Shout ONE! before playing your second-last card or get caught (+2). Turn clock (auto-draw) and match clock (fewest cards wins).
const COLS = { r: '#e11d48', b: '#2563eb', g: '#16a34a', y: '#eab308' };
const NAMES = { r: 'Red', b: 'Blue', g: 'Green', y: 'Yellow' };
const SEAT = ['#38bdf8', '#f43f5e', '#a855f7', '#f59e0b'];
const uid = () => Math.random().toString(36).slice(2);
function makeDeck() {
  const d = [];
  Object.keys(COLS).forEach((c) => { d.push({ c, v: '0' }); ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', '+2'].forEach((v) => { d.push({ c, v }, { c, v }); }); });
  for (let i = 0; i < 4; i += 1) d.push({ c: 'w', v: 'wild' }, { c: 'w', v: '+4' });
  return d.map((x) => ({ ...x, id: uid() })).sort(() => Math.random() - 0.5);
}
const fits = (card, top, color) => card.c === 'w' || card.c === color || card.v === top.v;
const isAction = (c) => ['skip', 'rev', '+2', '+4', 'wild'].includes(c.v);
function take(deck, k) { const d = deck.length < k + 4 ? [...deck, ...makeDeck()] : [...deck]; return [d.splice(0, k), d]; }
const idx = (n, i) => ((i % n) + n) % n;

function Sym({ v, big }) {
  const cls = big ? 'h-[55%] w-[55%]' : 'h-3 w-3';
  if (v === 'skip') return <Ban className={cls} strokeWidth={3} />;
  if (v === 'rev') return <Repeat className={cls} strokeWidth={3} />;
  if (v === 'wild') return <span className={big ? 'text-xl' : 'text-[9px]'}>W</span>;
  return <span>{v}</span>;
}
export function PlayCard({ card, onClick, disabled, glow, testId, rot = 0, fly }) {
  const wild = card.c === 'w';
  const bg = wild ? '#111827' : COLS[card.c];
  return (
    <button type="button" disabled={disabled} onClick={onClick} data-testid={testId}
      className={`relative h-[5.6rem] w-[3.9rem] shrink-0 rounded-[10px] border-[3px] border-white font-black text-white shadow-[0_8px_16px_rgba(0,0,0,0.45)] transition-transform duration-200 sm:h-[6.6rem] sm:w-[4.6rem] ${fly ? 'pty-fly' : ''} ${disabled && !fly ? 'brightness-75' : ''}`}
      style={{ background: `linear-gradient(150deg, ${bg}, ${bg} 55%, #00000055)`, '--rot': `${rot}deg`, transform: fly ? undefined : `rotate(${rot}deg) translateY(${glow ? -12 : 0}px)`, boxShadow: glow ? '0 0 0 2px #fde047, 0 0 22px #fde047' : undefined }}>
      <span className="absolute left-1 top-0.5 flex items-center text-[11px] leading-none"><Sym v={card.v} /></span>
      <span className="absolute bottom-0.5 right-1 flex rotate-180 items-center text-[11px] leading-none"><Sym v={card.v} /></span>
      <span className="absolute inset-x-[12%] inset-y-[18%] flex -rotate-[28deg] items-center justify-center rounded-[50%] text-2xl sm:text-3xl"
        style={{ background: wild ? `conic-gradient(${COLS.r} 0 25%, ${COLS.b} 0 50%, ${COLS.y} 0 75%, ${COLS.g} 0)` : '#fff', color: wild ? '#fff' : bg, textShadow: wild ? '0 2px 0 #000' : `1px 2px 0 ${bg}55` }}>
        <span className="flex h-full w-full rotate-[28deg] items-center justify-center"><Sym v={card.v} big /></span>
      </span>
    </button>
  );
}
export function CardBack() {
  return <div className="relative h-[5.6rem] w-[3.9rem] shrink-0 rounded-[10px] border-[3px] border-white bg-slate-950 shadow-lg sm:h-[6.6rem] sm:w-[4.6rem]"><span className="absolute inset-[15%] flex -rotate-[28deg] items-center justify-center rounded-[50%] bg-rose-600 font-display text-[10px] font-black text-amber-300">CLASH</span></div>;
}

function deal(level, bots) {
  const size = level <= 2 ? 5 : level <= 4 ? 6 : 7;
  let deck = makeDeck(); const hands = [];
  for (let i = 0; i <= bots; i += 1) { const [h, d] = take(deck, size); hands.push(h); deck = d; }
  let top = deck.shift();
  while (isAction(top)) { deck.push(top); top = deck.shift(); }
  return { deck, hands, top, color: top.c, turn: 0, dir: 1, phase: 'play', drawn: null, called: false, turnNo: 0, pending: null, ev: { kind: 'start', id: 0 } };
}
function play(s, who, card, chosen) {
  const n = s.hands.length;
  const hands = s.hands.map((h, i) => (i === who ? h.filter((x) => x.id !== card.id) : h));
  let { dir, deck } = s; let skip = false; let victim = null; let k = 0;
  if (card.v === 'rev') { if (n === 2) skip = true; else dir = -dir; }
  if (card.v === 'skip') skip = true;
  if (card.v === '+2' || card.v === '+4') { victim = idx(n, who + dir); k = card.v === '+2' ? 2 : 4; const [c, d] = take(deck, k); hands[victim] = [...hands[victim], ...c]; deck = d; skip = true; }
  let caught = false;
  if (who === 0 && hands[0].length === 1 && !s.called) { const [c, d] = take(deck, 2); hands[0] = [...hands[0], ...c]; deck = d; caught = true; }
  const ev = { kind: hands[who].length === 0 ? 'over' : caught ? 'caught' : victim != null ? 'hit' : 'play', who, victim, card, k, id: s.ev.id + 1, one: hands[who].length === 1 };
  return { ...s, deck, hands, top: card, color: card.c === 'w' ? chosen : card.c, dir, turn: idx(n, who + dir * (skip ? 2 : 1)), phase: ev.kind === 'over' ? 'over' : 'play', drawn: null, called: false, pending: null, turnNo: s.turnNo + 1, ev, winner: ev.kind === 'over' ? who : null };
}
function drawOne(s, who) {
  const [[card], deck] = take(s.deck, 1);
  const hands = s.hands.map((h, i) => (i === who ? [...h, card] : h));
  const ev = { kind: 'draw', who, id: s.ev.id + 1 };
  if (fits(card, s.top, s.color)) return { ...s, deck, hands, drawn: card.id, ev };
  return { ...s, deck, hands, drawn: null, turn: idx(hands.length, who + s.dir), turnNo: s.turnNo + 1, ev };
}
const pass = (s) => ({ ...s, drawn: null, turn: idx(s.hands.length, s.turn + s.dir), turnNo: s.turnNo + 1 });
function bestColor(hand) { const c = { r: 0, b: 0, g: 0, y: 0 }; hand.forEach((x) => { if (x.c !== 'w') c[x.c] += 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; }
function botChoice(s, level) {
  const hand = s.hands[s.turn];
  const opts = hand.filter((c) => (s.drawn ? c.id === s.drawn : fits(c, s.top, s.color)));
  if (!opts.length) return null;
  if (level <= 2) return opts[Math.floor(Math.random() * opts.length)];
  const nextLow = s.hands[idx(s.hands.length, s.turn + s.dir)].length <= 2;
  const rank = (c) => (c.c === 'w' ? (level >= 4 && hand.length > 2 ? -5 : 3) : 0) + (nextLow && ['+2', 'skip', '+4'].includes(c.v) ? 10 : 0) + (c.c === bestColor(hand) ? 2 : 0) + (isAction(c) && level >= 5 ? 1 : 0);
  return opts.sort((a, b) => rank(b) - rank(a))[0];
}

export function ColourCards({ config, onComplete }) {
  const level = difficultyOf(config);
  const [g, setG] = useState(() => deal(level, rivalsFor(config, 3)));
  const [start] = useState(Date.now);
  const bots = useMemo(() => BOTS.slice(0, g.hands.length - 1), [g.hands.length]);
  const banter = useBanter('Colour Clash Cards (a colour-matching card game like Uno)', bots);
  const done = useRef(false);
  const turnSec = Math.max(8, 22 - level);
  const matchSec = Math.max(150, 300 - level * 12);
  const finish = (won, why) => {
    if (done.current) return; done.current = true;
    sfx(won ? 'win' : 'lose');
    setG((s) => ({ ...s, phase: 'over', winner: won ? 0 : 1 }));
    const leader = g.hands.slice(1).reduce((b, h, i, a) => (h.length < a[b].length ? i : b), 0);
    banter.say(won ? 0 : leader, won ? 'you_win' : 'bot_win', { big: true, force: true, event: won ? 'the human won the card game' : 'you won the card game', detail: why || '' });
    setTimeout(() => onComplete({ solved: won, accuracy: won ? Math.max(0.5, 1 - g.hands[0].length * 0.1) : 0.3, duration_ms: Date.now() - start }), 2000);
  };
  const { turnLeft, matchLeft } = useClocks({ turnSec, matchSec, turnKey: g.turnNo, running: g.phase !== 'over',
    onTurnOut: () => { if (g.turn === 0 && g.phase !== 'over') { sfx('bad'); setG((s) => { if (s.turn !== 0) return s; if (s.drawn) return pass(s); const d = drawOne({ ...s, phase: 'play', pending: null }, 0); return d.drawn ? pass(d) : d; }); banter.say(0, 'taunt', { force: true }); } },
    onMatchOut: () => { const mine = g.hands[0].length; finish(g.hands.slice(1).every((h) => mine <= h.length), 'time ran out, fewest cards won'); } });

  useEffect(() => {
    if (g.phase === 'over' || g.turn === 0) return undefined;
    const t = setTimeout(() => setG((s) => {
      if (s.turn === 0 || s.phase === 'over') return s;
      const card = botChoice(s, level);
      if (card) return play(s, s.turn, card, bestColor(s.hands[s.turn].filter((x) => x.id !== card.id)) || 'r');
      return s.drawn ? pass(s) : drawOne(s, s.turn);
    }), Math.max(650, 1400 - level * 60));
    return () => clearTimeout(t);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const e = g.ev;
    if (e.kind === 'start') { banter.say(0, 'start', { force: true }); return; }
    if (e.kind === 'draw') sfx('card');
    if (['play', 'hit', 'caught', 'over'].includes(e.kind)) sfx(e.card?.c === 'w' ? 'combo' : 'card');
    if (e.kind === 'hit') {
      if (e.victim === 0) banter.say(e.who - 1, 'bot_hit', { big: true, event: `you just made the human draw ${e.k} cards`, detail: `you played ${e.card.v}` });
      else if (e.who === 0) banter.say(e.victim - 1, 'you_hit', { big: e.k === 4, event: `the human just made you draw ${e.k} cards` });
    }
    if (e.kind === 'caught') { sfx('bad'); banter.line(Math.floor(Math.random() * bots.length), 'Caught you! You forgot to shout ONE! Draw 2 😂'); }
    if (e.one && e.who > 0 && e.kind !== 'over') banter.line(e.who - 1, 'ONE! 🔥 Say goodbye.');
    if (e.kind === 'over') finish(e.who === 0);
  }, [g.ev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = g.turn === 0 && g.phase === 'play';
  const canPlay = (c) => mine && (g.drawn ? c.id === g.drawn : fits(c, g.top, g.color));
  const tapCard = (c) => {
    if (!canPlay(c)) { sfx('bad'); return; }
    if (c.c === 'w') { setG((s) => ({ ...s, phase: 'color', pending: c })); return; }
    setG((s) => play(s, 0, c));
  };
  const hand = g.hands[0];
  const players = [YOU, ...bots].map((p, i) => ({ ...p, color: SEAT[i], info: `${g.hands[i].length} card${g.hands[i].length === 1 ? '' : 's'}` }));
  return (
    <PartyStage config={config} title="Colour Clash Cards" players={players} active={g.phase === 'over' ? -1 : g.turn} turnLeft={turnLeft} turnSec={turnSec} matchLeft={matchLeft} banter={banter}>
      <div className="flex flex-col items-center gap-3" data-testid="colour-cards-board">
        <div className="relative flex items-center gap-5 rounded-[26px] px-6 py-4" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25), rgba(0,0,0,0.55))', boxShadow: `inset 0 0 0 3px ${COLS[g.color]}aa, 0 0 40px ${COLS[g.color]}55` }}>
          <button type="button" disabled={!mine || !!g.drawn} onClick={() => setG((s) => drawOne(s, 0))} className="relative disabled:opacity-60" data-testid="colour-cards-draw">
            <span className="absolute left-1 top-1"><CardBack /></span><span className="absolute left-0.5 top-0.5"><CardBack /></span><CardBack />
            {mine && !g.drawn && !hand.some((c) => fits(c, g.top, g.color)) && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 animate-pulse rounded-full bg-amber-400 px-2 text-[10px] font-black text-slate-900">DRAW</span>}
          </button>
          <div className="relative"><PlayCard key={g.top.id} card={g.top} disabled fly rot={-6} testId="colour-cards-top" /></div>
          <div className="flex flex-col items-center gap-1 text-[10px] font-black text-white"><span className="h-5 w-5 rounded-full border-2 border-white" style={{ background: COLS[g.color] }} data-testid="colour-cards-color" />{NAMES[g.color]}<span className={`text-lg ${g.dir < 0 ? '-scale-x-100' : ''}`}>⟳</span></div>
        </div>
        <div className="flex min-h-[28px] flex-wrap items-center justify-center gap-2">
          <span className="text-xs font-bold text-white/85" data-testid="colour-cards-log">{g.phase === 'over' ? (g.winner === 0 ? 'You emptied your hand! 🎉' : 'A rival won this round') : mine ? (g.drawn ? 'You drew a playable card: play it or pass' : 'Your turn: tap a glowing card') : `${bots[g.turn - 1]?.name} is thinking…`}</span>
          {mine && g.drawn && <button type="button" onClick={() => setG(pass)} className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-black text-white" data-testid="colour-cards-pass">Pass</button>}
          {mine && hand.length === 2 && <button type="button" onClick={() => { setG((s) => ({ ...s, called: true })); sfx('six'); banter.line(-1, 'ONE! 😎'); }} disabled={g.called} className="animate-pulse rounded-full bg-gradient-to-r from-rose-500 to-amber-400 px-4 py-1.5 font-display text-sm font-black text-white shadow-lg disabled:animate-none disabled:opacity-60" data-testid="colour-cards-one">{g.called ? 'ONE! ✓' : 'Shout ONE!'}</button>}
        </div>
        <div className="flex max-w-full justify-center overflow-x-auto px-6 pb-2 pt-4">
          {hand.map((c, i) => <div key={c.id} className="-mx-2.5 sm:-mx-2"><PlayCard card={c} glow={canPlay(c)} disabled={!mine} onClick={() => tapCard(c)} rot={(i - (hand.length - 1) / 2) * 3} testId={`colour-card-${c.c}-${c.v}`} /></div>)}
        </div>
      </div>
      {g.phase === 'color' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-3xl bg-black/60 backdrop-blur-sm" data-testid="colour-picker">
          <div className="rounded-3xl bg-slate-900/90 p-4 text-center"><div className="mb-3 text-sm font-black text-white">Pick the new colour</div>
            <div className="grid grid-cols-2 gap-3">{Object.keys(COLS).map((c) => <button key={c} type="button" onClick={() => setG((s) => play(s, 0, s.pending, c))} className="h-16 w-16 rounded-2xl border-4 border-white text-xs font-black text-white transition-transform hover:scale-110" style={{ background: COLS[c] }} data-testid={`colour-pick-${c}`}>{NAMES[c]}</button>)}</div>
          </div>
        </div>
      )}
    </PartyStage>
  );
}
