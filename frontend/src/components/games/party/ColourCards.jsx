import { useEffect, useMemo, useState } from 'react';
import { Board3D, useFeedback } from '../premium/kit';
import { difficultyOf } from '../../../lib/difficulty';
import { playGameSound } from '../../../lib/gameExperience';

// Colour Clash Cards: shed all your cards before the bots. Match colour or symbol; +2, skip and reverse shake things up.
const COLS = { r: '#ef4444', b: '#3b82f6', g: '#22c55e', y: '#eab308' };
const VALUES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+2', '⦸', '⇄'];
const BOT_NAMES = ['Rex', 'Nova', 'Pip'];
const rnd = (n) => Math.floor(Math.random() * n);
const makeDeck = () => Object.keys(COLS).flatMap((c) => VALUES.flatMap((v) => [{ c, v }, { c, v }])).map((x) => ({ ...x, id: Math.random() })).sort(() => Math.random() - 0.5);
const fits = (card, top) => card.c === top.c || card.v === top.v;

function Card({ card, onClick, small, disabled, testId }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} data-testid={testId}
      className={`relative shrink-0 rounded-xl border-4 border-white font-black text-white shadow-[0_6px_0_rgba(0,0,0,0.35)] transition-transform ${small ? 'h-14 w-10 text-sm' : 'h-24 w-16 text-2xl sm:h-28 sm:w-[4.5rem]'} ${disabled ? 'opacity-50' : 'hover:-translate-y-2'}`}
      style={{ background: `radial-gradient(circle at 30% 20%, ${COLS[card.c]}dd, ${COLS[card.c]})` }}>
      <span className="absolute inset-2 flex items-center justify-center rounded-[50%] bg-white/90" style={{ color: COLS[card.c] }}>{card.v}</span>
    </button>
  );
}

export function ColourCards({ config, onComplete }) {
  const level = difficultyOf(config);
  const bots = level <= 3 ? 1 : level <= 7 ? 2 : 3;
  const handSize = 5 + Math.min(3, Math.floor(level / 3));
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const init = useMemo(() => {
    const deck = makeDeck();
    const hands = Array.from({ length: bots + 1 }, () => deck.splice(0, handSize));
    let top = deck.shift();
    while (Number.isNaN(Number(top.v))) { deck.push(top); top = deck.shift(); }
    return { deck, hands, top, turn: 0, dir: 1, log: 'Your turn: match colour or symbol' };
  }, [bots, handSize]);
  const [g, setG] = useState(init);
  const [done, setDone] = useState(false);

  const apply = (state, who, card) => {
    const n = state.hands.length;
    const hands = state.hands.map((h, i) => (i === who ? h.filter((x) => x.id !== card.id) : h));
    let dir = state.dir;
    let step = 1;
    const deck = [...state.deck];
    if (card.v === '⇄') dir = -dir;
    if (card.v === '⦸') step = 2;
    if (card.v === '+2') { const victim = (who + dir + n) % n; hands[victim] = [...hands[victim], ...deck.splice(0, 2)]; step = 2; }
    if (deck.length < 4) deck.push(...makeDeck());
    return { ...state, deck, hands, top: card, dir, turn: (who + dir * step + n * 4) % n, log: `${who === 0 ? 'You' : BOT_NAMES[who - 1]} played ${card.v}` };
  };
  const draw = (state, who) => {
    const deck = [...state.deck];
    const card = deck.shift();
    const hands = state.hands.map((h, i) => (i === who ? [...h, card] : h));
    const n = hands.length;
    return { ...state, deck, hands, turn: (who + state.dir + n) % n, log: `${who === 0 ? 'You' : BOT_NAMES[who - 1]} drew a card` };
  };

  useEffect(() => {
    if (done) return;
    const winner = g.hands.findIndex((h) => h.length === 0);
    if (winner >= 0) {
      setDone(true);
      playGameSound(winner === 0 ? 'success' : 'failure');
      onComplete({ solved: winner === 0, accuracy: winner === 0 ? 1 : 0.3, duration_ms: Date.now() - start });
      return;
    }
    if (g.turn === 0) return;
    const t = setTimeout(() => {
      const hand = g.hands[g.turn];
      const options = hand.filter((c) => fits(c, g.top));
      if (!options.length) { setG((s) => draw(s, g.turn)); return; }
      const smart = level >= 5 ? options.sort((a, b) => (Number.isNaN(Number(b.v)) ? 1 : 0) - (Number.isNaN(Number(a.v)) ? 1 : 0))[0] : options[rnd(options.length)];
      playGameSound('tap');
      setG((s) => apply(s, g.turn, smart));
    }, Math.max(450, 1100 - level * 60));
    return () => clearTimeout(t);
  }, [g, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = (card) => {
    if (g.turn !== 0 || done) return;
    if (!fits(card, g.top)) { fire('bad'); return; }
    fire('good');
    setG((s) => apply(s, 0, card));
  };
  const canPlay = g.hands[0].some((c) => fits(c, g.top));
  return (
    <Board3D theme="party" title="Colour Clash Cards" level={level} flash={flash} stats={[['Your cards', g.hands[0].length], ...g.hands.slice(1).map((h, i) => [BOT_NAMES[i], h.length])]}>
      <div className="flex flex-col items-center gap-4" data-testid="colour-cards-board">
        <div className="flex gap-3">{g.hands.slice(1).map((h, i) => <div key={i} className={`rounded-xl px-3 py-1.5 text-xs font-black ${g.turn === i + 1 ? 'animate-pulse bg-amber-400 text-slate-900' : 'bg-black/30 text-white/80'}`}>{BOT_NAMES[i]} · {h.length}</div>)}</div>
        <div className="flex items-center gap-4">
          <button type="button" disabled={g.turn !== 0 || canPlay} onClick={() => setG((s) => draw(s, 0))} className="h-24 w-16 rounded-xl border-4 border-white bg-gradient-to-br from-slate-800 to-black text-xs font-black text-amber-300 shadow-[0_6px_0_rgba(0,0,0,0.35)] disabled:opacity-40 sm:h-28 sm:w-[4.5rem]" data-testid="colour-cards-draw">DRAW</button>
          <Card card={g.top} disabled testId="colour-cards-top" />
        </div>
        <div className="text-center text-xs font-bold text-white/80" data-testid="colour-cards-log">{g.turn === 0 ? (canPlay ? 'Your turn: tap a matching card' : 'No match: tap DRAW') : `${BOT_NAMES[g.turn - 1]} is thinking…`} · {g.log}</div>
        <div className="flex max-w-full flex-wrap justify-center gap-1.5">{g.hands[0].map((c) => <Card key={c.id} card={c} disabled={g.turn !== 0} onClick={() => play(c)} testId={`colour-card-${c.c}-${c.v}`} />)}</div>
      </div>
    </Board3D>
  );
}
