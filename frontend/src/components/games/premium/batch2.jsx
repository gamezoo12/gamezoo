import { useEffect, useMemo, useRef, useState } from 'react';
import { Bomb } from 'lucide-react';
import { difficultyOf, lerpLevel, seeded, seededShuffle } from '../../../lib/difficulty';
import { Board3D, useFeedback } from './kit';
import { ChromaBoard } from './boards';

const done = (onComplete, start, accuracy) => onComplete({ solved: true, accuracy: Math.max(0.05, Math.min(1, accuracy)), duration_ms: Date.now() - start });

// ---------- Simon Says: longer sequences, faster playback, more pads ----------
const PADS = ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#f97316'];
export function PremiumSimon({ config, onComplete }) {
  const level = difficultyOf(config);
  const target = lerpLevel(level, 4, 14);
  const pads = level >= 6 ? 6 : 4;
  const speed = lerpLevel(level, 700, 260);
  const seq = useMemo(() => { const r = seeded(700 + level); return Array.from({ length: target }, () => Math.floor(r() * pads)); }, [level, target, pads]);
  const [len, setLen] = useState(1);
  const [input, setInput] = useState(0);
  const [lit, setLit] = useState(-1);
  const [playing, setPlaying] = useState(true);
  const [errors, setErrors] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  useEffect(() => {
    let k = 0;
    setPlaying(true);
    const id = setInterval(() => {
      if (k >= len * 2) { clearInterval(id); setLit(-1); setPlaying(false); return; }
      setLit(k % 2 === 0 ? seq[k / 2] : -1);
      k += 1;
    }, speed / 2 + 80);
    return () => clearInterval(id);
  }, [len, seq, speed, errors]);
  const press = (p) => {
    if (playing) return;
    if (p !== seq[input]) { fire('bad'); setErrors((e) => e + 1); setInput(0); return; }
    fire('tap');
    if (input + 1 < len) { setInput(input + 1); return; }
    fire('good');
    if (len >= target) done(onComplete, start, target / (target + errors));
    else { setLen(len + 1); setInput(0); }
  };
  return (
    <Board3D theme="memory" title="Echo Chamber" level={level} flash={flash} stats={[['Sequence', `${len}/${target}`], ['Errors', errors], ['Status', playing ? 'Watch' : 'Repeat']]}>
      <div className={`mx-auto grid max-w-sm gap-3 ${pads === 6 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {Array.from({ length: pads }, (_, p) => <button key={p} type="button" onClick={() => press(p)} data-testid={`simon-pad-${p}`} aria-label={`Pad ${p + 1}`}
          className="aspect-square rounded-3xl border-b-8 border-black/30 transition-[transform,filter] duration-100 active:translate-y-1"
          style={{ background: PADS[p], filter: lit === p ? 'brightness(1.8) drop-shadow(0 0 24px white)' : 'brightness(0.65)', transform: lit === p ? 'translateY(-4px) scale(1.04)' : 'none' }} />)}
      </div>
    </Board3D>
  );
}

// ---------- Whack-a-Mole: more holes, shorter pop-ups, bombs to avoid ----------
export function PremiumWhack({ config, onComplete }) {
  const level = difficultyOf(config);
  const holes = level >= 6 ? 16 : 9;
  const goal = lerpLevel(level, 10, 30);
  const upMs = lerpLevel(level, 1150, 430);
  const rnd = useMemo(() => seeded(800 + level), [level]);
  const [mole, setMole] = useState({ i: -1, bomb: false });
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const hitRef = useRef(hits);
  hitRef.current = hits;
  useEffect(() => {
    const id = setInterval(() => setMole({ i: Math.floor(rnd() * holes), bomb: level >= 6 && rnd() < 0.25 }), upMs);
    return () => clearInterval(id);
  }, [holes, upMs, rnd, level]);
  const whack = (i) => {
    if (i !== mole.i || mole.bomb) { fire('bad'); setMisses((m) => m + 1); if (i === mole.i) setMole({ i: -1 }); return; }
    fire('good'); setMole({ i: -1 });
    if (hits + 1 >= goal) done(onComplete, start, goal / (goal + misses)); else setHits(hits + 1);
  };
  return (
    <Board3D theme="words" title="Mole Meadow" level={level} flash={flash} stats={[['Hits', `${hits}/${goal}`], ['Misses', misses]]}>
      <div className={`grid gap-3 ${holes === 16 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {Array.from({ length: holes }, (_, i) => (
          <button key={i} type="button" onPointerDown={() => whack(i)} data-testid={`mole-hole-${i}`} className="relative aspect-square overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_70%,#1a0f05,#3b2410)] shadow-[inset_0_10px_20px_rgba(0,0,0,0.7)]" aria-label={`Hole ${i + 1}`}>
            <span className={`absolute inset-x-[15%] bottom-0 flex h-[78%] items-start justify-center rounded-t-full pt-[18%] transition-transform duration-150 ${mole.i === i ? 'translate-y-0' : 'translate-y-full'} ${mole.bomb ? 'bg-slate-700' : 'bg-gradient-to-b from-amber-600 to-amber-800'}`} data-testid={mole.i === i ? (mole.bomb ? 'mole-bomb' : 'mole-up') : undefined}>
              {mole.bomb ? <Bomb className="h-1/2 w-1/2 text-rose-300" /> : <span className="flex gap-[18%]"><i className="block h-2 w-2 rounded-full bg-black" /><i className="block h-2 w-2 rounded-full bg-black" /></span>}
            </span>
          </button>
        ))}
      </div>
    </Board3D>
  );
}

// ---------- Trivia: question tiers rise with difficulty ----------
const BANK = [
  ['What is the capital of the United Kingdom?', 'London', ['Paris', 'Dublin', 'Madrid'], 1], ['How many days are in a leap year?', '366', ['365', '364', '360'], 1],
  ['Which planet is known as the Red Planet?', 'Mars', ['Venus', 'Jupiter', 'Saturn'], 1], ['How many sides does a hexagon have?', '6', ['5', '7', '8'], 1],
  ['What colour do you get mixing blue and yellow?', 'Green', ['Purple', 'Orange', 'Brown'], 1], ['How many minutes are in two hours?', '120', ['100', '90', '150'], 1],
  ['Which is the largest ocean on Earth?', 'Pacific', ['Atlantic', 'Indian', 'Arctic'], 2], ['Who wrote "Romeo and Juliet"?', 'William Shakespeare', ['Charles Dickens', 'Jane Austen', 'Oscar Wilde'], 2],
  ['What is the chemical symbol for gold?', 'Au', ['Ag', 'Gd', 'Go'], 2], ['In which year did World War II end?', '1945', ['1939', '1918', '1950'], 2],
  ['What is the square root of 144?', '12', ['14', '11', '16'], 2], ['Which UK river flows through London?', 'Thames', ['Severn', 'Trent', 'Mersey'], 2],
  ['What is the hardest natural substance?', 'Diamond', ['Quartz', 'Granite', 'Titanium'], 2], ['How many players in a football team on the pitch?', '11', ['10', '12', '9'], 2],
  ['What is the smallest prime number?', '2', ['1', '3', '0'], 3], ['Which element has atomic number 26?', 'Iron', ['Copper', 'Zinc', 'Nickel'], 3],
  ['Who painted "The Starry Night"?', 'Vincent van Gogh', ['Claude Monet', 'Pablo Picasso', 'Salvador Dalí'], 3], ['What is 17 × 23?', '391', ['381', '401', '371'], 3],
  ['Which country has the most time zones?', 'France', ['Russia', 'USA', 'China'], 3], ['What year did the Magna Carta get sealed?', '1215', ['1066', '1415', '1314'], 3],
  ['Speed of light is roughly how many km per second?', '300,000', ['150,000', '30,000', '3,000,000'], 3], ['What is the longest bone in the human body?', 'Femur', ['Tibia', 'Humerus', 'Spine'], 3],
  ['Binary 101101 equals which decimal?', '45', ['43', '47', '53'], 3], ['Which gas makes up most of Earth\'s air?', 'Nitrogen', ['Oxygen', 'Carbon dioxide', 'Argon'], 3],
];
export function PremiumTrivia({ config, onComplete }) {
  const level = difficultyOf(config);
  const total = lerpLevel(level, 5, 12);
  const tier = level <= 3 ? [1, 2] : level <= 7 ? [2, 3] : [3];
  const qs = useMemo(() => seededShuffle(BANK.filter((q) => tier.includes(q[3])), 900 + level).concat(seededShuffle(BANK, 901)).slice(0, total)
    .map(([q, a, w], k) => ({ q, a, opts: seededShuffle([a, ...w], 950 + k + level) })), [level, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState(null);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const choose = (o) => {
    if (picked) return;
    const ok = o === qs[i].a;
    fire(ok ? 'good' : 'bad');
    setPicked(o);
    const nextCorrect = correct + (ok ? 1 : 0);
    setCorrect(nextCorrect);
    setTimeout(() => { setPicked(null); if (i + 1 >= total) done(onComplete, start, nextCorrect / total); else setI(i + 1); }, 650);
  };
  return (
    <Board3D theme="math" title="Quiz Dome" level={level} flash={flash} stats={[['Question', `${i + 1}/${total}`], ['Correct', correct]]}>
      <p className="mb-5 min-h-[64px] rounded-2xl bg-black/30 p-4 text-center text-lg font-bold text-white" data-testid="trivia-question">{qs[i].q}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {qs[i].opts.map((o) => <button key={o} type="button" onClick={() => choose(o)} data-testid="trivia-option"
          className={`rounded-2xl border-b-[5px] px-4 py-3 text-left font-bold transition-transform hover:-translate-y-0.5 ${picked ? (o === qs[i].a ? 'border-emerald-800 bg-emerald-400 text-emerald-950' : o === picked ? 'border-rose-800 bg-rose-400 text-rose-950' : 'border-slate-700 bg-slate-500/40 text-white/60') : 'border-indigo-800 bg-indigo-300 text-indigo-950'}`}>{o}</button>)}
      </div>
    </Board3D>
  );
}

// ---------- Colour Match (Stroop): more colours, rules flip at high levels ----------
const INKS = [['RED', '#ef4444'], ['BLUE', '#3b82f6'], ['GREEN', '#22c55e'], ['YELLOW', '#eab308'], ['PURPLE', '#a855f7'], ['ORANGE', '#f97316']];
export function PremiumColorMatch({ config, onComplete }) {
  const level = difficultyOf(config);
  const total = lerpLevel(level, 8, 25);
  const n = lerpLevel(level, 3, 6);
  const rounds = useMemo(() => { const r = seeded(1000 + level); return Array.from({ length: total }, () => { const w = Math.floor(r() * n); let ink = Math.floor(r() * n); if (level >= 4 && ink === w) ink = (ink + 1) % n; return { w, ink, rule: level >= 8 && r() < 0.4 ? 'word' : 'ink' }; }); }, [level, total, n]);
  const [i, setI] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const cur = rounds[i];
  const pick = (k) => {
    if (k !== (cur.rule === 'ink' ? cur.ink : cur.w)) { fire('bad'); setWrong((w) => w + 1); return; }
    fire('good');
    if (i + 1 >= total) done(onComplete, start, total / (total + wrong)); else setI(i + 1);
  };
  return <ChromaBoard word={INKS[cur.w][0]} inkHex={INKS[cur.ink][1]} rule={cur.rule} options={INKS.slice(0, n).map(([label, hex], k) => ({ key: k, label, hex }))}
    onPick={pick} round={i + 1} total={total} extra={['Wrong', wrong]} flash={flash} level={level} />;
}

// ---------- Odd One Out: bigger grids, subtler differences ----------
export function PremiumOddOne({ config, onComplete }) {
  const level = difficultyOf(config);
  const total = lerpLevel(level, 5, 12);
  const size = lerpLevel(level, 3, 7);
  const delta = lerpLevel(level, 38, 6);
  const rounds = useMemo(() => { const r = seeded(1100 + level); return Array.from({ length: total }, () => ({ hue: Math.floor(r() * 360), odd: Math.floor(r() * size * size) })); }, [level, total, size]);
  const [i, setI] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [start] = useState(Date.now);
  const [flash, fire] = useFeedback();
  const cur = rounds[i];
  const pick = (k) => {
    if (k !== cur.odd) { fire('bad'); setWrong((w) => w + 1); return; }
    fire('good');
    if (i + 1 >= total) done(onComplete, start, total / (total + wrong)); else setI(i + 1);
  };
  return (
    <Board3D theme="target" title="Spectrum Hunt" level={level} flash={flash} stats={[['Round', `${i + 1}/${total}`], ['Wrong', wrong]]}>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {Array.from({ length: size * size }, (_, k) => <button key={k} type="button" onClick={() => pick(k)} data-testid={k === cur.odd ? 'odd-target' : `odd-tile-${k}`} aria-label={`Tile ${k + 1}`}
          className="aspect-square rounded-xl shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] transition-transform hover:scale-105" style={{ background: `hsl(${cur.hue} 70% ${k === cur.odd ? 50 + delta / 2 : 50}%)` }} />)}
      </div>
    </Board3D>
  );
}
