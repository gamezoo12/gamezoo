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

// ---------- Math Sprint ----------
export function MathSprint({ onComplete }) {
  const [q, setQ] = useState(() => genQ());
  const [ans, setAns] = useState('');
  const [correct, setCorrect] = useState(0);
  const [misses, setMisses] = useState(0);
  const [start] = useState(() => Date.now());
  const TARGET = 10;
  function genQ() {
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    const ops = ['+', '-', '×'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    const val = op === '+' ? a + b : op === '-' ? a - b : a * b;
    return { text: `${a} ${op} ${b}`, val };
  }
  const submit = () => {
    if (parseInt(ans, 10) === q.val) {
      const nc = correct + 1;
      setCorrect(nc);
      if (nc >= TARGET) {
        onComplete({ solved: true, accuracy: Math.max(0.2, TARGET / (TARGET + misses)), duration_ms: Date.now() - start });
        return;
      }
    } else setMisses(m => m + 1);
    setAns(''); setQ(genQ());
  };
  return (
    <div className="max-w-md mx-auto text-center">
      <div className="text-slate-600 text-sm">Solve <b>{TARGET}</b> problems. Correct: <b>{correct}</b> / Misses: <b>{misses}</b></div>
      <div className="my-6 font-display text-5xl font-extrabold text-orange-600" data-testid="math-q">{q.text} = ?</div>
      <input type="number" value={ans} onChange={e => setAns(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} data-testid="math-input" className="w-40 px-4 py-3 rounded-xl border-2 text-center text-2xl font-bold focus:border-orange-500 outline-none" />
      <button onClick={submit} className="ml-2 px-6 py-3 rounded-xl bg-orange-500 text-white font-bold">Enter</button>
    </div>
  );
}

// ---------- Reaction Time ----------
export function ReactionTime({ onComplete }) {
  const ROUNDS = 5;
  const [phase, setPhase] = useState('waiting'); // waiting | ready | go | done
  const [times, setTimes] = useState([]);
  const [start, setStart] = useState(0);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (phase === 'waiting' && round < ROUNDS) {
      const delay = 1000 + Math.random() * 2500;
      const t = setTimeout(() => { setStart(Date.now()); setPhase('go'); }, delay);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, round]);
  const tap = () => {
    if (phase !== 'go') {
      setTimes(t => [...t, 2000]); // penalty for early tap
    } else {
      setTimes(t => [...t, Date.now() - start]);
    }
    const nextRound = round + 1;
    setRound(nextRound);
    if (nextRound >= ROUNDS) {
      const finalTimes = [...times, phase === 'go' ? Date.now() - start : 2000];
      const avg = finalTimes.reduce((s, x) => s + x, 0) / finalTimes.length;
      const dur = finalTimes.reduce((s, x) => s + x, 0);
      const acc = Math.max(0.1, Math.min(1, 400 / avg));
      onComplete({ solved: true, accuracy: acc, duration_ms: dur });
    } else setPhase('waiting');
  };
  const bg = phase === 'go' ? 'bg-emerald-500' : 'bg-slate-800';
  return (
    <div className="max-w-md mx-auto text-center">
      <div className="text-slate-600 text-sm mb-2">Round <b>{round + 1}</b>/{ROUNDS}. Tap when the screen turns GREEN. Don't tap early!</div>
      <button onClick={tap} data-testid="reaction-pad" className={`w-full aspect-video rounded-2xl ${bg} text-white font-display text-3xl font-extrabold flex items-center justify-center transition-colors`}>
        {phase === 'go' ? 'TAP NOW!' : 'Wait…'}
      </button>
      <div className="text-xs text-slate-500 mt-2">{times.map((t, i) => <span key={i} className="mx-1">R{i+1}: {t}ms</span>)}</div>
    </div>
  );
}

// ---------- Trivia Quiz ----------
const TRIVIA = [
  { q: 'Capital of Australia?', opts: ['Sydney', 'Canberra', 'Melbourne', 'Perth'], a: 'Canberra' },
  { q: 'Which planet is largest?', opts: ['Earth', 'Saturn', 'Jupiter', 'Neptune'], a: 'Jupiter' },
  { q: 'H2O is …?', opts: ['Salt', 'Water', 'Sugar', 'Acid'], a: 'Water' },
  { q: '2^10 = ?', opts: ['512', '1000', '1024', '2048'], a: '1024' },
  { q: 'Author of Hamlet?', opts: ['Dickens', 'Shakespeare', 'Austen', 'Twain'], a: 'Shakespeare' },
  { q: 'Currency of Japan?', opts: ['Yuan', 'Won', 'Yen', 'Rupee'], a: 'Yen' },
  { q: 'Speed of light approx?', opts: ['3×10⁵ km/s', '3×10⁸ m/s', '3×10⁶ m/s', '3×10¹⁰ m/s'], a: '3×10⁸ m/s' },
  { q: 'Longest river?', opts: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], a: 'Nile' },
  { q: 'First president of USA?', opts: ['Lincoln', 'Washington', 'Jefferson', 'Adams'], a: 'Washington' },
  { q: 'Chemical symbol for Gold?', opts: ['Ag', 'Au', 'Gd', 'Go'], a: 'Au' },
];
export function TriviaQuiz({ onComplete }) {
  const qs = useMemo(() => shuffle(TRIVIA).slice(0, 10), []);
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [start] = useState(() => Date.now());
  if (i >= qs.length) return null;
  const cur = qs[i];
  const pick = (o) => {
    const isRight = o === cur.a;
    const nc = correct + (isRight ? 1 : 0);
    if (i + 1 >= qs.length) {
      onComplete({ solved: true, accuracy: nc / qs.length, duration_ms: Date.now() - start });
    } else { setCorrect(nc); setI(i + 1); }
  };
  return (
    <div className="max-w-md mx-auto">
      <div className="text-slate-600 text-sm text-center">Q {i + 1}/{qs.length} • Score: <b>{correct}</b></div>
      <div className="my-4 font-display text-xl font-bold text-center" data-testid="trivia-q">{cur.q}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cur.opts.map(o => (
          <button key={o} onClick={() => pick(o)} data-testid={`trivia-opt-${o}`} className="px-4 py-3 rounded-xl bg-white border-2 border-slate-200 hover:border-orange-500 font-semibold">{o}</button>
        ))}
      </div>
    </div>
  );
}

// ---------- Simon Says ----------
export function SimonSays({ onComplete }) {
  const COLORS = ['red', 'green', 'blue', 'yellow'];
  const CLS = { red: 'bg-red-500', green: 'bg-emerald-500', blue: 'bg-blue-500', yellow: 'bg-amber-400' };
  const [seq, setSeq] = useState([]);
  const [userSeq, setUserSeq] = useState([]);
  const [showing, setShowing] = useState(false);
  const [flash, setFlash] = useState(null);
  const [level, setLevel] = useState(1);
  const [start] = useState(() => Date.now());
  const TARGET_LEVEL = 5;

  const startLevel = () => {
    const s = Array.from({ length: level + 2 }, () => COLORS[Math.floor(Math.random() * 4)]);
    setSeq(s); setUserSeq([]); setShowing(true);
    s.forEach((c, i) => {
      setTimeout(() => setFlash(c), 700 * i + 200);
      setTimeout(() => setFlash(null), 700 * i + 600);
    });
    setTimeout(() => setShowing(false), 700 * s.length + 400);
  };
  useEffect(() => { startLevel(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const click = (c) => {
    if (showing) return;
    const next = [...userSeq, c];
    setUserSeq(next);
    if (seq[next.length - 1] !== c) {
      onComplete({ solved: level >= TARGET_LEVEL, accuracy: level / TARGET_LEVEL, duration_ms: Date.now() - start });
      return;
    }
    if (next.length === seq.length) {
      if (level + 1 > TARGET_LEVEL) {
        onComplete({ solved: true, accuracy: 1, duration_ms: Date.now() - start });
      } else { setLevel(level + 1); setTimeout(startLevel, 800); }
    }
  };
  return (
    <div className="max-w-xs mx-auto text-center">
      <div className="text-slate-600 text-sm mb-3">Repeat the sequence. Level: <b>{level}</b> / {TARGET_LEVEL}</div>
      <div className="grid grid-cols-2 gap-2">
        {COLORS.map(c => (
          <button key={c} onClick={() => click(c)} disabled={showing} data-testid={`simon-${c}`} className={`aspect-square rounded-2xl ${CLS[c]} transition-opacity ${flash === c ? 'opacity-100 scale-105' : 'opacity-70 hover:opacity-90'}`} />
        ))}
      </div>
      {showing && <div className="mt-2 text-xs text-slate-500">Watch…</div>}
    </div>
  );
}

// ---------- Whack-a-Mole ----------
export function WhackMole({ onComplete }) {
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [pos, setPos] = useState(0);
  const [start] = useState(() => Date.now());
  const TARGET_HITS = 10;
  useEffect(() => {
    const t = setInterval(() => setPos(Math.floor(Math.random() * 9)), 900);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (hits >= TARGET_HITS) {
      onComplete({ solved: true, accuracy: Math.max(0.1, TARGET_HITS / (TARGET_HITS + misses)), duration_ms: Date.now() - start });
    }
  }, [hits, misses, start, onComplete]);
  return (
    <div className="max-w-md mx-auto">
      <div className="text-slate-600 text-sm text-center mb-3">Whack <b>{TARGET_HITS}</b> moles. Hits: <b>{hits}</b> · Misses: <b>{misses}</b></div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <button
            key={i}
            onClick={() => (i === pos ? setHits(h => h + 1) : setMisses(m => m + 1))}
            data-testid={`mole-${i}`}
            className={`aspect-square rounded-xl ${i === pos ? 'bg-gradient-to-br from-orange-500 to-fuchsia-600' : 'bg-slate-200'} text-white text-4xl font-bold flex items-center justify-center transition`}
          >{i === pos ? '🐹' : ''}</button>
        ))}
      </div>
    </div>
  );
}

// ---------- Odd One Out ----------
export function OddOneOut({ onComplete }) {
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [items, setItems] = useState([]);
  const [oddIdx, setOddIdx] = useState(0);
  const [start] = useState(() => Date.now());
  const TOTAL = 5;
  const gen = () => {
    const base = Math.floor(Math.random() * 8) + 1;
    const grid = Array.from({ length: 9 }, () => base);
    const idx = Math.floor(Math.random() * 9);
    grid[idx] = base + 1;
    setItems(grid); setOddIdx(idx);
  };
  useEffect(() => { gen(); }, []);
  const pick = (i) => {
    const nc = correct + (i === oddIdx ? 1 : 0);
    if (round + 1 >= TOTAL) {
      onComplete({ solved: true, accuracy: nc / TOTAL, duration_ms: Date.now() - start });
    } else { setCorrect(nc); setRound(round + 1); gen(); }
  };
  return (
    <div className="max-w-md mx-auto text-center">
      <div className="text-slate-600 text-sm mb-3">Round {round + 1}/{TOTAL} — Find the different circle</div>
      <div className="grid grid-cols-3 gap-3">
        {items.map((v, i) => (
          <button key={i} onClick={() => pick(i)} data-testid={`odd-${i}`} className="aspect-square rounded-full bg-orange-500 hover:scale-105 transition" style={{ opacity: v * 0.1 + 0.2 }} />
        ))}
      </div>
    </div>
  );
}

// ---------- Color Match (Stroop) ----------
export function ColorMatch({ onComplete }) {
  const COLORS = [{ name: 'RED', c: 'text-red-500' }, { name: 'GREEN', c: 'text-emerald-500' }, { name: 'BLUE', c: 'text-blue-500' }, { name: 'YELLOW', c: 'text-amber-400' }];
  const gen = () => {
    const wordIdx = Math.floor(Math.random() * 4);
    const colorIdx = Math.floor(Math.random() * 4);
    return { word: COLORS[wordIdx].name, colorClass: COLORS[colorIdx].c, colorName: COLORS[colorIdx].name };
  };
  const [q, setQ] = useState(gen);
  const [correct, setCorrect] = useState(0);
  const [misses, setMisses] = useState(0);
  const [round, setRound] = useState(0);
  const [start] = useState(() => Date.now());
  const TOTAL = 10;
  const pick = (name) => {
    if (name === q.colorName) setCorrect(c => c + 1); else setMisses(m => m + 1);
    if (round + 1 >= TOTAL) {
      onComplete({ solved: true, accuracy: (correct + (name === q.colorName ? 1 : 0)) / TOTAL, duration_ms: Date.now() - start });
    } else { setRound(round + 1); setQ(gen()); }
  };
  return (
    <div className="max-w-md mx-auto text-center">
      <div className="text-slate-600 text-sm mb-2">Pick the <b>colour</b> of the text, not the word. Round {round + 1}/{TOTAL}</div>
      <div data-testid="stroop-word" className={`my-6 font-display font-extrabold text-6xl ${q.colorClass}`}>{q.word}</div>
      <div className="grid grid-cols-2 gap-2">
        {COLORS.map(c => <button key={c.name} onClick={() => pick(c.name)} data-testid={`stroop-${c.name}`} className="px-4 py-3 rounded-xl bg-white border-2 border-slate-200 hover:border-orange-500 font-bold">{c.name}</button>)}
      </div>
    </div>
  );
}

// ---------- Pattern Repeat (rhythm) ----------
export function PatternRepeat({ onComplete }) {
  // Like Simon Says but with numbers 1-9 and target 7 correct
  const [target, setTarget] = useState([]);
  const [userSeq, setUserSeq] = useState([]);
  const [level, setLevel] = useState(3);
  const [showing, setShowing] = useState(false);
  const [start] = useState(() => Date.now());
  const [flash, setFlash] = useState(null);
  const gen = () => {
    const t = Array.from({ length: level }, () => Math.floor(Math.random() * 9) + 1);
    setTarget(t); setUserSeq([]); setShowing(true);
    t.forEach((n, i) => {
      setTimeout(() => setFlash(n), 600 * i + 100);
      setTimeout(() => setFlash(null), 600 * i + 500);
    });
    setTimeout(() => setShowing(false), 600 * t.length + 200);
  };
  useEffect(() => { gen(); }, [level]); // eslint-disable-line react-hooks/exhaustive-deps
  const click = (n) => {
    if (showing) return;
    const next = [...userSeq, n];
    setUserSeq(next);
    if (target[next.length - 1] !== n) {
      onComplete({ solved: level >= 6, accuracy: Math.min(1, (level - 3) / 4), duration_ms: Date.now() - start });
      return;
    }
    if (next.length === target.length) {
      if (level >= 6) onComplete({ solved: true, accuracy: 1, duration_ms: Date.now() - start });
      else setLevel(level + 1);
    }
  };
  return (
    <div className="max-w-xs mx-auto text-center">
      <div className="text-slate-600 text-sm mb-2">Repeat the pattern. Length: <b>{level}</b> / 6</div>
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => click(n)} disabled={showing} data-testid={`pattern-${n}`} className={`aspect-square rounded-2xl font-display font-bold text-2xl transition ${flash === n ? 'bg-orange-500 text-white scale-105' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{n}</button>
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
  math_sprint: (config, onComplete) => <MathSprint config={config} onComplete={onComplete} />,
  reaction_time: (config, onComplete) => <ReactionTime config={config} onComplete={onComplete} />,
  trivia_quiz: (config, onComplete) => <TriviaQuiz config={config} onComplete={onComplete} />,
  simon_says: (config, onComplete) => <SimonSays config={config} onComplete={onComplete} />,
  whack_a_mole: (config, onComplete) => <WhackMole config={config} onComplete={onComplete} />,
  odd_one_out: (config, onComplete) => <OddOneOut config={config} onComplete={onComplete} />,
  color_match: (config, onComplete) => <ColorMatch config={config} onComplete={onComplete} />,
  pattern_repeat: (config, onComplete) => <PatternRepeat config={config} onComplete={onComplete} />,
};
