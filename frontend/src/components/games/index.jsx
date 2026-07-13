/*
  Compact library of skill-based mini-games.
  Each game exports a component that receives:
    - config: {image?, difficulty?, ...}
    - onComplete({solved, accuracy, duration_ms})
  Games are intentionally short (< 60-120s) and browser-only.
*/
import React, { useEffect, useMemo, useRef, useState } from 'react';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------- Memory Match ----------
export function MemoryMatch({ onComplete }) {
  const symbols = ['🎁', '🏆', '💷', '🎯', '🔥', '⭐', '🎉', '💎'];
  const [cards, setCards] = useState(() => shuffle([...symbols, ...symbols]).map((s, i) => ({ id: i, s, open: false, done: false })));
  const [flipped, setFlipped] = useState([]);
  const [start] = useState(() => Date.now());
  const [moves, setMoves] = useState(0);

  const flip = (i) => {
    if (cards[i].open || cards[i].done || flipped.length === 2) return;
    const next = [...cards];
    next[i].open = true;
    setCards(next);
    const fl = [...flipped, i];
    setFlipped(fl);
    if (fl.length === 2) {
      setMoves(m => m + 1);
      const [a, b] = fl;
      if (cards[a].s === cards[b].s) {
        setTimeout(() => {
          setCards(prev => prev.map((c, idx) => (idx === a || idx === b) ? { ...c, done: true } : c));
          setFlipped([]);
        }, 350);
      } else {
        setTimeout(() => {
          setCards(prev => prev.map((c, idx) => (idx === a || idx === b) ? { ...c, open: false } : c));
          setFlipped([]);
        }, 700);
      }
    }
  };

  useEffect(() => {
    if (cards.every(c => c.done)) {
      const duration_ms = Date.now() - start;
      // Accuracy = min moves (8) / actual moves
      const accuracy = Math.min(1, 8 / Math.max(moves, 8));
      onComplete({ solved: true, accuracy, duration_ms });
    }
  }, [cards, moves, start, onComplete]);

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center text-slate-600 text-sm mb-3">Match all 8 pairs — the fewer moves, the higher your score. Moves: <b>{moves}</b></div>
      <div className="grid grid-cols-4 gap-2">
        {cards.map((c, i) => (
          <button
            key={c.id}
            onClick={() => flip(i)}
            data-testid={`memory-card-${i}`}
            className={`aspect-square rounded-xl text-3xl flex items-center justify-center font-bold shadow-md transition-transform ${c.done ? 'bg-emerald-100 text-emerald-700' : c.open ? 'bg-white' : 'bg-gradient-to-br from-orange-500 to-fuchsia-600 text-white'}`}
          >
            {c.open || c.done ? c.s : '?'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Number Sequence (tap 1→20 as fast as possible) ----------
export function NumberSequence({ onComplete }) {
  const nums = useMemo(() => shuffle(Array.from({ length: 20 }, (_, i) => i + 1)), []);
  const [next, setNext] = useState(1);
  const [misses, setMisses] = useState(0);
  const [start] = useState(() => Date.now());

  const tap = (n) => {
    if (n === next) {
      if (n === 20) {
        const duration_ms = Date.now() - start;
        const accuracy = Math.max(0.1, 1 - misses * 0.05);
        onComplete({ solved: true, accuracy, duration_ms });
      }
      setNext(next + 1);
    } else {
      setMisses(m => m + 1);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center text-slate-600 text-sm mb-3">Tap the numbers in order <b>1 → 20</b>. Next: <b className="text-orange-600">{next}</b> • Misses: <b>{misses}</b></div>
      <div className="grid grid-cols-5 gap-2">
        {nums.map((n) => (
          <button
            key={n}
            onClick={() => tap(n)}
            data-testid={`seq-num-${n}`}
            disabled={n < next}
            className={`aspect-square rounded-xl text-xl font-bold shadow-md ${n < next ? 'bg-emerald-100 text-emerald-500 opacity-40' : 'bg-gradient-to-br from-orange-500 to-fuchsia-600 text-white hover:scale-105 transition'}`}
          >{n}</button>
        ))}
      </div>
    </div>
  );
}

// ---------- Target Tap (tap the moving bullseye) ----------
export function TargetTap({ onComplete }) {
  const TOTAL = 15;
  const [count, setCount] = useState(0);
  const [misses, setMisses] = useState(0);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [start] = useState(() => Date.now());

  useEffect(() => {
    if (count >= TOTAL) {
      const duration_ms = Date.now() - start;
      const accuracy = Math.max(0.05, TOTAL / (TOTAL + misses));
      onComplete({ solved: true, accuracy, duration_ms });
    }
  }, [count, misses, start, onComplete]);

  const hit = () => {
    setCount(c => c + 1);
    setPos({ x: 10 + Math.random() * 80, y: 10 + Math.random() * 80 });
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center text-slate-600 text-sm mb-3">Tap the bullseye <b>{TOTAL}</b> times. Hits: <b>{count}</b> • Misses: <b>{misses}</b></div>
      <div
        onClick={() => setMisses(m => m + 1)}
        className="relative w-full aspect-square bg-slate-100 rounded-2xl overflow-hidden cursor-crosshair select-none"
        data-testid="target-arena"
      >
        <button
          onClick={(e) => { e.stopPropagation(); hit(); }}
          data-testid="target-bullseye"
          className="absolute w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-red-700 shadow-lg border-4 border-white transition-all duration-200"
          style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
    </div>
  );
}

// ---------- Word Unscramble ----------
const WORDS = ['PRIZE', 'JACKPOT', 'WINNER', 'TICKET', 'LUCKY', 'FORTUNE', 'REWARD', 'BONUS'];
export function WordUnscramble({ onComplete }) {
  const target = useMemo(() => WORDS[Math.floor(Math.random() * WORDS.length)], []);
  const scrambled = useMemo(() => shuffle(target.split('')).join(''), [target]);
  const [attempt, setAttempt] = useState('');
  const [start] = useState(() => Date.now());
  const [tries, setTries] = useState(0);

  const submit = () => {
    setTries(t => t + 1);
    if (attempt.toUpperCase() === target) {
      const duration_ms = Date.now() - start;
      const accuracy = tries === 0 ? 1 : Math.max(0.2, 1 - tries * 0.15);
      onComplete({ solved: true, accuracy, duration_ms });
    }
  };

  return (
    <div className="max-w-md mx-auto text-center">
      <div className="text-slate-600 text-sm">Unscramble the word:</div>
      <div className="my-4 font-display text-4xl font-extrabold tracking-widest text-orange-600" data-testid="unscramble-target">{scrambled}</div>
      <input
        value={attempt}
        onChange={e => setAttempt(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        data-testid="unscramble-input"
        placeholder="Your answer…"
        className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-center text-xl uppercase font-bold focus:border-orange-500 outline-none"
      />
      <button
        onClick={submit}
        data-testid="unscramble-submit"
        className="mt-3 px-6 py-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold shadow-lg"
      >Submit</button>
      <div className="text-xs text-slate-400 mt-2">Attempts: {tries}</div>
    </div>
  );
}

// ---------- Emoji Riddle ----------
const RIDDLES = [
  { emojis: '🎬🐁', answer: 'MICKEY' },
  { emojis: '🕷️🕸️👨', answer: 'SPIDERMAN' },
  { emojis: '🚀🌕', answer: 'MOON' },
  { emojis: '👑🦁', answer: 'LION' },
  { emojis: '🍎📱', answer: 'IPHONE' },
];
export function EmojiRiddle({ onComplete }) {
  const q = useMemo(() => RIDDLES[Math.floor(Math.random() * RIDDLES.length)], []);
  const [ans, setAns] = useState('');
  const [start] = useState(() => Date.now());
  const [tries, setTries] = useState(0);

  const submit = () => {
    setTries(t => t + 1);
    if (ans.toUpperCase().includes(q.answer)) {
      const duration_ms = Date.now() - start;
      const accuracy = tries === 0 ? 1 : Math.max(0.3, 1 - tries * 0.2);
      onComplete({ solved: true, accuracy, duration_ms });
    }
  };

  return (
    <div className="max-w-md mx-auto text-center">
      <div className="text-slate-600 text-sm">What do these emojis mean?</div>
      <div className="my-6 text-7xl" data-testid="emoji-riddle">{q.emojis}</div>
      <input
        value={ans}
        onChange={e => setAns(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        data-testid="riddle-input"
        placeholder="Type your answer…"
        className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-center text-lg uppercase focus:border-orange-500 outline-none"
      />
      <button onClick={submit} data-testid="riddle-submit" className="mt-3 px-6 py-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold shadow-lg">Submit</button>
      <div className="text-xs text-slate-400 mt-2">Attempts: {tries}</div>
    </div>
  );
}

// ---------- Image Jigsaw (3x3 or 4x4) ----------
export function ImageJigsaw({ size = 3, config, onComplete }) {
  const image = config?.image || 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&w=600';
  const total = size * size;
  const [tiles, setTiles] = useState(() => {
    let s;
    do {
      s = shuffle(Array.from({ length: total }, (_, i) => i));
    } while (s.every((v, i) => v === i));
    return s;
  });
  const [moves, setMoves] = useState(0);
  const [start] = useState(() => Date.now());
  const dragFrom = useRef(null);

  const swap = (a, b) => {
    setTiles(prev => {
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
    setMoves(m => m + 1);
  };

  useEffect(() => {
    if (tiles.every((v, i) => v === i)) {
      const duration_ms = Date.now() - start;
      const min_moves = total; // rough baseline
      const accuracy = Math.min(1, min_moves / Math.max(moves, min_moves));
      onComplete({ solved: true, accuracy, duration_ms });
    }
  }, [tiles, moves, start, onComplete, total]);

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center text-slate-600 text-sm mb-3">Rearrange the tiles to complete the image. Drag &amp; drop or tap two tiles to swap. Moves: <b>{moves}</b></div>
      <div className="grid gap-1 bg-slate-100 p-1 rounded-xl" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {tiles.map((tileIdx, pos) => {
          const row = Math.floor(tileIdx / size);
          const col = tileIdx % size;
          return (
            <div
              key={pos}
              draggable
              onDragStart={() => { dragFrom.current = pos; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragFrom.current !== null && dragFrom.current !== pos) swap(dragFrom.current, pos); dragFrom.current = null; }}
              onClick={() => {
                if (dragFrom.current === null) { dragFrom.current = pos; }
                else if (dragFrom.current !== pos) { swap(dragFrom.current, pos); dragFrom.current = null; }
                else { dragFrom.current = null; }
              }}
              data-testid={`jigsaw-tile-${pos}`}
              className={`aspect-square rounded-lg overflow-hidden cursor-pointer border-2 ${dragFrom.current === pos ? 'border-orange-500' : 'border-white'}`}
              style={{
                backgroundImage: `url(${image})`,
                backgroundSize: `${size * 100}% ${size * 100}%`,
                backgroundPosition: `${(col / (size - 1)) * 100}% ${(row / (size - 1)) * 100}%`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------- 15-slider puzzle ----------
export function SliderPuzzle({ onComplete }) {
  // 4x4 with one blank (idx 15)
  const [tiles, setTiles] = useState(() => {
    let s;
    do {
      s = shuffle(Array.from({ length: 16 }, (_, i) => i));
    } while (s.every((v, i) => v === i));
    return s;
  });
  const [moves, setMoves] = useState(0);
  const [start] = useState(() => Date.now());
  const size = 4;

  const move = (pos) => {
    const blank = tiles.indexOf(15);
    const bRow = Math.floor(blank / size); const bCol = blank % size;
    const pRow = Math.floor(pos / size);   const pCol = pos % size;
    const adj = (Math.abs(bRow - pRow) + Math.abs(bCol - pCol)) === 1;
    if (!adj) return;
    setTiles(prev => {
      const n = [...prev];
      [n[blank], n[pos]] = [n[pos], n[blank]];
      return n;
    });
    setMoves(m => m + 1);
  };

  useEffect(() => {
    if (tiles.every((v, i) => v === i)) {
      const duration_ms = Date.now() - start;
      const accuracy = Math.min(1, 30 / Math.max(moves, 30));
      onComplete({ solved: true, accuracy, duration_ms });
    }
  }, [tiles, moves, start, onComplete]);

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center text-slate-600 text-sm mb-3">Slide numbered tiles into order 1→15. Moves: <b>{moves}</b></div>
      <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl">
        {tiles.map((v, pos) => (
          <button
            key={pos}
            onClick={() => move(pos)}
            data-testid={`slider-tile-${pos}`}
            disabled={v === 15}
            className={`aspect-square rounded-lg text-2xl font-bold shadow-sm ${v === 15 ? 'bg-transparent' : 'bg-gradient-to-br from-orange-500 to-fuchsia-600 text-white hover:scale-105 transition'}`}
          >{v === 15 ? '' : v + 1}</button>
        ))}
      </div>
    </div>
  );
}

// ---------- Registry ----------
export const GAME_MAP = {
  memory_match: (config, onComplete) => <MemoryMatch config={config} onComplete={onComplete} />,
  number_sequence: (config, onComplete) => <NumberSequence config={config} onComplete={onComplete} />,
  target_tap: (config, onComplete) => <TargetTap config={config} onComplete={onComplete} />,
  word_unscramble: (config, onComplete) => <WordUnscramble config={config} onComplete={onComplete} />,
  emoji_riddle: (config, onComplete) => <EmojiRiddle config={config} onComplete={onComplete} />,
  jigsaw_3x3: (config, onComplete) => <ImageJigsaw size={3} config={config} onComplete={onComplete} />,
  jigsaw_4x4: (config, onComplete) => <ImageJigsaw size={4} config={config} onComplete={onComplete} />,
  slider_puzzle: (config, onComplete) => <SliderPuzzle config={config} onComplete={onComplete} />,
};
