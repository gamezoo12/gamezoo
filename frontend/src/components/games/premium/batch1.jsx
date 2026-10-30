import { useEffect, useMemo, useRef, useState } from 'react';
import { Anchor, Bell, Bolt, Camera, Cherry, Crown, Diamond, Feather, Flame, Gem, Gift, Heart, Key, Moon, Music, Rocket, Star, Sun, Trophy, Zap } from 'lucide-react';
import { difficultyOf, lerpLevel, seeded, seededShuffle } from '../../../lib/difficulty';
import { Board3D, useFeedback } from './kit';

const ICONS = [Crown, Star, Heart, Diamond, Rocket, Trophy, Gem, Flame, Bolt, Moon, Sun, Music, Gift, Key, Anchor, Feather, Cherry, Camera, Bell, Zap];
const COLORS = ['#f472b6', '#facc15', '#60a5fa', '#34d399', '#fb923c', '#a78bfa', '#f87171', '#2dd4bf', '#e879f9', '#a3e635'];
const done = (onComplete, start, accuracy) => onComplete({ solved: true, accuracy: Math.max(0.05, Math.min(1, accuracy)), duration_ms: Date.now() - start });

// ---------- Memory Match: more pairs and faster flip-back as difficulty rises ----------
export function PremiumMemory({ config, onComplete }) {
  const level = difficultyOf(config);
  const pairs = lerpLevel(level, 4, 18);
  const [cards, setCards] = useState(() => seededShuffle([...Array(pairs).keys(), ...Array(pairs).keys()], 100 + level).map((s, id) => ({ id, s, open: false, done: false })));
  const [open, setOpen] = useState([]);
  const [moves, setMoves] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const cols = pairs <= 6 ? 4 : pairs <= 10 ? 5 : 6;
  const flip = (i) => {
    if (cards[i].open || cards[i].done || open.length === 2) return;
    fire('tap');
    const next = cards.map((c, k) => (k === i ? { ...c, open: true } : c));
    setCards(next);
    const fl = [...open, i];
    setOpen(fl);
    if (fl.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = fl;
    const match = next[a].s === next[b].s;
    setTimeout(() => {
      fire(match ? 'good' : 'bad');
      setCards((p) => p.map((c, k) => (k === a || k === b ? (match ? { ...c, done: true } : { ...c, open: false }) : c)));
      setOpen([]);
    }, match ? 320 : lerpLevel(level, 800, 320));
  };
  useEffect(() => { if (cards.every((c) => c.done)) done(onComplete, start, pairs / Math.max(moves, pairs)); }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Board3D theme="memory" title="Memory Vault" level={level} flash={flash} stats={[['Pairs', `${cards.filter((c) => c.done).length / 2}/${pairs}`], ['Moves', moves]]}>
      <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {cards.map((c, i) => {
          const Icon = ICONS[c.s % ICONS.length];
          return (
            <button key={c.id} type="button" onClick={() => flip(i)} className="aspect-[3/4] [perspective:600px]" data-testid={`memory-card-${i}`} aria-label={c.open || c.done ? `Card ${c.s}` : 'Hidden card'}>
              <span className="relative block h-full w-full transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: c.open || c.done ? 'rotateY(180deg)' : 'none' }}>
                <span className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-gradient-to-br from-violet-500 to-indigo-800 shadow-lg [backface-visibility:hidden]"><Crown className="h-1/3 w-1/3 text-amber-200/70" /></span>
                <span className={`absolute inset-0 flex items-center justify-center rounded-xl border-2 bg-white shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)] ${c.done ? 'border-emerald-400 opacity-80' : 'border-amber-300'}`}><Icon className="h-1/2 w-1/2" style={{ color: COLORS[c.s % COLORS.length] }} strokeWidth={2.4} /></span>
              </span>
            </button>
          );
        })}
      </div>
    </Board3D>
  );
}

// ---------- Target Tap: smaller, moving targets and decoys at higher levels ----------
export function PremiumTargetTap({ config, onComplete }) {
  const level = difficultyOf(config);
  const total = lerpLevel(level, 10, 30);
  const size = lerpLevel(level, 76, 30);
  const rnd = useMemo(() => seeded(200 + level), [level]);
  const place = () => ({ x: 12 + rnd() * 76, y: 12 + rnd() * 76, dx: level >= 5 ? (rnd() - 0.5) * level * 0.12 : 0, dy: level >= 5 ? (rnd() - 0.5) * level * 0.12 : 0 });
  const [pos, setPos] = useState(place);
  const [decoy, setDecoy] = useState(place);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const raf = useRef();
  useEffect(() => {
    if (level < 5) return undefined;
    const tick = () => {
      const move = (p) => ({ ...p, x: p.x + p.dx > 90 || p.x + p.dx < 10 ? p.x : p.x + p.dx, y: p.y + p.dy > 90 || p.y + p.dy < 10 ? p.y : p.y + p.dy, dx: p.x + p.dx > 90 || p.x + p.dx < 10 ? -p.dx : p.dx, dy: p.y + p.dy > 90 || p.y + p.dy < 10 ? -p.dy : p.dy });
      setPos(move); setDecoy(move);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [level]);
  useEffect(() => { if (hits >= total) done(onComplete, start, total / (total + misses)); }, [hits]); // eslint-disable-line react-hooks/exhaustive-deps
  const miss = () => { setMisses((m) => m + 1); fire('bad'); };
  return (
    <Board3D theme="target" title="Bullseye Range" level={level} flash={flash} stats={[['Hits', `${hits}/${total}`], ['Misses', misses]]}>
      <div onClick={miss} className="relative aspect-square w-full cursor-crosshair overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_40%,#4a1010,#160303)] shadow-inner" data-testid="target-arena">
        <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#fff2 1px, transparent 1px), linear-gradient(90deg, #fff2 1px, transparent 1px)', backgroundSize: '10% 10%' }} />
        {level >= 7 && <button type="button" aria-label="Decoy" onClick={(e) => { e.stopPropagation(); miss(); }} className="absolute rounded-full border-4 border-slate-300 bg-slate-500 shadow-lg" style={{ width: size, height: size, left: `${decoy.x}%`, top: `${decoy.y}%`, transform: 'translate(-50%,-50%)' }} data-testid="target-decoy" />}
        <button type="button" aria-label="Target" onClick={(e) => { e.stopPropagation(); setHits((h) => h + 1); fire('good'); setPos(place()); }}
          className="absolute rounded-full shadow-[0_10px_30px_rgba(244,63,94,0.7)] transition-[left,top] duration-75" data-testid="target-bullseye"
          style={{ width: size, height: size, left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle, #fff 0 18%, #ef4444 19% 38%, #fff 39% 56%, #ef4444 57% 76%, #fff 77%)' }} />
      </div>
    </Board3D>
  );
}

// ---------- Word Unscramble: longer words and more rounds ----------
const WORDS = {
  4: ['GAME', 'GOLD', 'PLAY', 'WINS', 'STAR', 'CASH'], 5: ['PRIZE', 'BONUS', 'TOKEN', 'MEDAL', 'CROWN', 'SKILL'], 6: ['WINNER', 'TICKET', 'TROPHY', 'LEAGUE', 'PLAYER', 'REWARD'],
  7: ['CONTEST', 'JACKPOT', 'VICTORY', 'MASTERS', 'BALANCE', 'PREMIUM'], 8: ['CHAMPION', 'STRATEGY', 'TREASURE', 'FESTIVAL', 'MOMENTUM', 'SHOWCASE'],
  9: ['CHALLENGE', 'BRILLIANT', 'ADVENTURE', 'CELEBRATE', 'LEGENDARY', 'CHAMPIONS'], 10: ['TOURNAMENT', 'MASTERMIND', 'SPECTACLES', 'LEADERSHIP', 'TRIUMPHANT', 'EXCELLENCE'],
};
export function PremiumWordUnscramble({ config, onComplete }) {
  const level = difficultyOf(config);
  const rounds = lerpLevel(level, 3, 8);
  const len = lerpLevel(level, 4, 10);
  const list = useMemo(() => seededShuffle(WORDS[len], 300 + level).concat(seededShuffle(WORDS[Math.min(10, len + 1)] || WORDS[len], 301)).slice(0, rounds), [len, level, rounds]);
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState([]);
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const word = list[round];
  const tiles = useMemo(() => { let s = seededShuffle(word.split(''), 400 + round + level); if (s.join('') === word) s = [...s.slice(1), s[0]]; return s; }, [word, round, level]);
  const pick = (i) => {
    if (picked.includes(i)) return;
    fire('tap');
    const next = [...picked, i];
    if (next.length < word.length) { setPicked(next); return; }
    if (next.map((k) => tiles[k]).join('') === word) {
      fire('good');
      if (round + 1 >= rounds) done(onComplete, start, rounds / (rounds + wrong));
      else { setRound(round + 1); setPicked([]); }
    } else { fire('bad'); setWrong((w) => w + 1); setPicked([]); }
  };
  return (
    <Board3D theme="words" title="Word Forge" level={level} flash={flash} stats={[['Word', `${round + 1}/${rounds}`], ['Wrong', wrong]]}>
      <div className="mb-5 flex min-h-[56px] flex-wrap justify-center gap-1.5" data-testid="word-answer">
        {word.split('').map((_, k) => <span key={k} className="flex h-11 w-9 items-center justify-center rounded-lg border-b-4 border-emerald-700 bg-emerald-950/60 text-xl font-black text-white sm:h-12 sm:w-10">{picked[k] !== undefined ? tiles[picked[k]] : level < 8 && k === 0 ? <span className="text-white/25">{word[0]}</span> : ''}</span>)}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {tiles.map((ch, i) => <button key={i} type="button" disabled={picked.includes(i)} onClick={() => pick(i)} data-testid={`word-tile-${i}`}
          className="h-12 w-11 rounded-xl border-b-[6px] border-amber-700 bg-gradient-to-b from-amber-200 to-amber-400 text-2xl font-black text-amber-950 shadow-lg transition-transform hover:-translate-y-1 active:translate-y-0.5 disabled:translate-y-1 disabled:opacity-30 sm:h-14 sm:w-12">{ch}</button>)}
      </div>
      <div className="mt-4 text-center"><button type="button" onClick={() => setPicked([])} className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white hover:bg-white/20" data-testid="word-clear">Clear</button></div>
    </Board3D>
  );
}

// ---------- Math Sprint: operations get harder level by level ----------
function makeQuestion(level, rnd) {
  const r = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  if (level <= 2) { const a = r(2, 9 + level * 5); const b = r(2, 9 + level * 5); return [`${a} + ${b}`, a + b]; }
  if (level <= 4) { const a = r(20, 99); const b = r(10, a); return rnd() < 0.5 ? [`${a} + ${b}`, a + b] : [`${a} − ${b}`, a - b]; }
  if (level <= 6) { const a = r(3, 6 + level * 2); const b = r(3, 12); return [`${a} × ${b}`, a * b]; }
  if (level <= 8) { const a = r(4, 15); const b = r(3, 12); const c = r(10, 60); return [`${a} × ${b} − ${c}`, a * b - c]; }
  const b = r(3, 12); const q = r(3, 15); const c = r(2, 9); const d = r(2, 9);
  return [`${b * q} ÷ ${b} + ${c} × ${d}`, q + c * d];
}
export function PremiumMathSprint({ config, onComplete }) {
  const level = difficultyOf(config);
  const total = lerpLevel(level, 5, 15);
  const qs = useMemo(() => {
    const rnd = seeded(500 + level);
    return Array.from({ length: total }, () => {
      const [text, ans] = makeQuestion(level, rnd);
      const spread = Math.max(3, Math.round(Math.abs(ans) * 0.15));
      const opts = new Set([ans]);
      while (opts.size < 4) opts.add(ans + (Math.floor(rnd() * spread * 2) - spread || spread + 1));
      return { text, ans, opts: seededShuffle([...opts], Math.floor(rnd() * 9999)) };
    });
  }, [level, total]);
  const [i, setI] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const answer = (v) => {
    if (v !== qs[i].ans) { fire('bad'); setWrong((w) => w + 1); return; }
    fire('good');
    if (i + 1 >= total) done(onComplete, start, total / (total + wrong)); else setI(i + 1);
  };
  return (
    <Board3D theme="math" title="Number Reactor" level={level} flash={flash} stats={[['Question', `${i + 1}/${total}`], ['Wrong', wrong]]}>
      <div className="mb-5 rounded-2xl border border-sky-300/30 bg-sky-950/60 py-6 text-center font-mono text-3xl font-black text-white shadow-[inset_0_0_30px_rgba(96,165,250,0.3)] sm:text-4xl" data-testid="math-question">{qs[i].text} = ?</div>
      <div className="grid grid-cols-2 gap-3">
        {qs[i].opts.map((v) => <button key={v} type="button" onClick={() => answer(v)} data-testid={`math-option-${v}`} className="h-16 rounded-2xl border-b-[6px] border-sky-800 bg-gradient-to-b from-sky-300 to-sky-500 text-2xl font-black text-sky-950 shadow-lg transition-transform hover:-translate-y-1 active:translate-y-0.5">{v}</button>)}
      </div>
    </Board3D>
  );
}

// ---------- Reaction Time: more rounds, shorter windows and decoy signals ----------
export function PremiumReaction({ config, onComplete }) {
  const level = difficultyOf(config);
  const rounds = lerpLevel(level, 3, 8);
  const rnd = useMemo(() => seeded(600 + level), [level]);
  const [round, setRound] = useState(0);
  const [state, setState] = useState('idle');
  const [times, setTimes] = useState([]);
  const [faults, setFaults] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const shownAt = useRef(0);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const arm = () => {
    setState('wait');
    const decoy = level >= 6 && rnd() < 0.35;
    timer.current = setTimeout(() => {
      if (decoy) { setState('decoy'); timer.current = setTimeout(arm, lerpLevel(level, 900, 600)); return; }
      shownAt.current = performance.now(); setState('go');
    }, 900 + rnd() * lerpLevel(level, 1800, 3200));
  };
  const tap = () => {
    if (state === 'idle') { arm(); return; }
    if (state === 'wait' || state === 'decoy') { clearTimeout(timer.current); setFaults((f) => f + 1); fire('bad'); setState('idle'); return; }
    if (state !== 'go') return;
    const ms = performance.now() - shownAt.current;
    fire('good');
    const next = [...times, ms];
    setTimes(next);
    if (round + 1 >= rounds) {
      const avg = next.reduce((a, b) => a + b, 0) / next.length;
      done(onComplete, start, (Math.min(1, 280 / avg)) * (rounds / (rounds + faults)));
    } else { setRound(round + 1); setState('idle'); }
  };
  const look = { idle: ['bg-slate-800', 'Tap to arm'], wait: ['bg-rose-700', 'Wait for GREEN…'], decoy: ['bg-amber-500', "Don't tap — decoy!"], go: ['bg-emerald-500', 'TAP NOW!'] }[state];
  return (
    <Board3D theme="reaction" title="Reflex Arena" level={level} flash={flash} stats={[['Round', `${round + 1}/${rounds}`], ['Last', times.length ? `${Math.round(times[times.length - 1])} ms` : '—'], ['Faults', faults]]}>
      <button type="button" onPointerDown={tap} className={`flex aspect-[4/3] w-full items-center justify-center rounded-3xl text-3xl font-black text-white shadow-[inset_0_-12px_0_rgba(0,0,0,0.25)] transition-colors duration-75 ${look[0]}`} data-testid="reaction-pad" data-state={state}>{look[1]}</button>
    </Board3D>
  );
}
