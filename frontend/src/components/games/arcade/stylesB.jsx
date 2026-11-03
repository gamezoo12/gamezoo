import { useEffect, useMemo, useRef, useState } from 'react';
import { ARCADE_THEMES, Stage, btn, levelOf, pick, scale, shuffle, tile, useRun } from './kit';

// 11. Memory Flip — find all the matching pairs.
export function MemoryFlip({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const pairs = level <= 3 ? 4 : level <= 7 ? 6 : 8;
  const run = useRun(onComplete);
  const deck = useMemo(() => shuffle(t.items.slice(0, pairs).flatMap((i) => [i[0], i[0]])), [t, pairs]);
  const [open, setOpen] = useState([]); const [done, setDone] = useState([]);
  const flip = (k) => {
    if (open.length === 2 || open.includes(k) || done.includes(k)) return;
    const next = [...open, k]; setOpen(next); run.ping('tap');
    if (next.length === 2) setTimeout(() => {
      if (deck[next[0]] === deck[next[1]]) { run.ping('good'); setDone((d) => { const nd = [...d, ...next]; if (nd.length === deck.length) run.finish(pairs * 2); return nd; }); } else run.ping('bad');
      setOpen([]);
    }, 550);
  };
  return <Stage theme={theme} title="Memory Flip" flash={run.flash} stats={[['Pairs', `${done.length / 2}/${pairs}`]]}>
    <div className="grid grid-cols-4 gap-2">{deck.map((e, k) => <button key={k} type="button" onClick={() => flip(k)} className={`${tile} aspect-square ${open.includes(k) || done.includes(k) ? 'bg-white/90' : 'bg-gradient-to-br from-white/20 to-white/5'}`} data-testid={`arcade-card-${k}`}>{open.includes(k) || done.includes(k) ? e : '❔'}</button>)}</div>
  </Stage>;
}

// 12. Tap in Order — tap the numbered tiles from 1 upwards.
export function TapOrder({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const n = scale(level, 9, 16);
  const run = useRun(onComplete); const [next, setNext] = useState(1);
  const tiles = useMemo(() => shuffle(Array.from({ length: n }, (_, i) => ({ v: i + 1, e: pick(t.items)[0] }))), [n, t]);
  const tap = (v) => { if (v === next) { run.ping('good'); if (v === n) run.finish(n); setNext(v + 1); } else if (v > next) run.ping('bad'); };
  return <Stage theme={theme} title="Tap in Order" flash={run.flash} stats={[['Next', Math.min(next, n)]]}>
    <div className="grid grid-cols-4 gap-2">{tiles.map((x) => <button key={x.v} type="button" onClick={() => tap(x.v)} className={`${tile} h-16 flex-col text-base ${x.v < next ? 'opacity-30' : ''}`} data-testid={`arcade-order-${x.v}`}><span className="text-xl">{x.e}</span><span className="font-black">{x.v}</span></button>)}</div>
  </Stage>;
}

// 13. Shell Game — follow the prize while the cups shuffle.
export function ShellGame({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 3, 6); const swaps = scale(level, 4, 12);
  const run = useRun(onComplete); const [order, setOrder] = useState([0, 1, 2]); const [ball, setBall] = useState(0); const [phase, setPhase] = useState('show'); const [wins, setWins] = useState(0); const [prize] = useState(() => pick(t.items)[0]);
  useEffect(() => {
    if (phase !== 'show') return undefined;
    const b = Math.floor(Math.random() * 3); setBall(b);
    let i = 0; let id;
    const timer = setTimeout(() => { setPhase('shuffle'); id = setInterval(() => { setOrder((o) => { const a = Math.floor(Math.random() * 3); const c = (a + 1 + Math.floor(Math.random() * 2)) % 3; const n = [...o]; [n[a], n[c]] = [n[c], n[a]]; return n; }); i += 1; if (i >= swaps) { clearInterval(id); setPhase('pick'); } }, Math.max(220, 600 - level * 35)); }, 1100);
    return () => { clearTimeout(timer); clearInterval(id); };
  }, [phase, swaps, level]);
  const choose = (cup) => { if (phase !== 'pick') return; if (cup === ball) { run.ping('good'); setWins((w) => { if (w + 1 >= goal) run.finish(goal); return w + 1; }); } else run.ping('bad'); setPhase('reveal'); setTimeout(() => setPhase('show'), 900); };
  return <Stage theme={theme} title="Shell Game" flash={run.flash} stats={[['Wins', `${wins}/${goal}`]]}>
    <div className="relative mx-auto h-44 w-full max-w-sm">
      {[0, 1, 2].map((cup) => <button key={cup} type="button" onClick={() => choose(cup)} className="absolute top-8 flex h-28 w-24 flex-col items-center justify-end transition-[left] duration-200" style={{ left: `${order.indexOf(cup) * 34 + 2}%` }} data-testid={`arcade-cup-${cup}`}>
        <span className="text-6xl transition-transform" style={{ transform: (phase === 'show' || phase === 'reveal') && cup === ball ? 'translateY(-40px)' : 'none' }}>🥤</span>
        {(phase === 'show' || phase === 'reveal') && cup === ball && <span className="absolute bottom-0 text-3xl">{prize}</span>}
      </button>)}
    </div>
    <p className="text-center text-xs text-white/60">{phase === 'pick' ? 'Where is it? Tap a cup' : 'Watch closely…'}</p>
  </Stage>;
}

// 14. Light Chase — tap the glowing tile before it jumps away.
export function LightChase({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 10, 20);
  const run = useRun(onComplete); const [lit, setLit] = useState(0); const [hits, setHits] = useState(0); const [e] = useState(() => pick(t.items)[0]);
  useEffect(() => { const id = setInterval(() => setLit(Math.floor(Math.random() * 16)), Math.max(420, 1100 - level * 65)); return () => clearInterval(id); }, [level, hits]);
  const tap = (k) => { if (k === lit) { run.ping('good'); setLit(-1); setHits((h) => { if (h + 1 >= goal) run.finish(goal); return h + 1; }); } else run.ping('bad'); };
  return <Stage theme={theme} title="Light Chase" flash={run.flash} stats={[['Hits', `${hits}/${goal}`]]}>
    <div className="grid grid-cols-4 gap-2">{Array.from({ length: 16 }, (_, k) => <button key={k} type="button" onClick={() => tap(k)} className={`${tile} aspect-square`} style={k === lit ? { background: t.accent, boxShadow: `0 0 24px ${t.accent}` } : undefined} data-testid={`arcade-light-${k}`}>{k === lit ? e : ''}</button>)}</div>
  </Stage>;
}

// 15. Count Flash — count how many of the target appear in a quick flash.
export function CountFlash({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 4, 8);
  const run = useRun(onComplete); const [r, setR] = useState(0); const [show, setShow] = useState(true);
  const round = useMemo(() => { const [a, ...rest] = shuffle(t.items); const count = 2 + Math.floor(Math.random() * (3 + level)); const cells = shuffle([...Array(count).fill(a[0]), ...Array.from({ length: 16 - count }, () => pick(rest)[0])]); return { a, count, cells, opts: shuffle([count, count + 1, Math.max(1, count - 1), count + 2]) }; }, [r, t, level]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setShow(true); const id = setTimeout(() => setShow(false), Math.max(1200, 3200 - level * 200)); return () => clearTimeout(id); }, [r, level]);
  const answer = (n) => { if (n === round.count) { run.ping('good'); if (r + 1 >= goal) run.finish(goal); setR(r + 1); } else { run.ping('bad'); setR(r + 1); } };
  return <Stage theme={theme} title="Count Flash" flash={run.flash} stats={[['Round', `${Math.min(r + 1, goal)}/${goal}`]]}>
    <p className="mb-2 text-center font-black">How many {round.a[0]} {round.a[1]}?</p>
    {show ? <div className="grid grid-cols-4 gap-1.5">{round.cells.map((c, k) => <div key={k} className={`${tile} aspect-square text-2xl`}>{c}</div>)}</div>
      : <div className="grid grid-cols-2 gap-3 py-6">{round.opts.map((n) => <button key={n} type="button" onClick={() => answer(n)} className={`${btn} bg-white text-2xl text-slate-900`} data-testid={`arcade-count-${n}`}>{n}</button>)}</div>}
  </Stage>;
}

// 16. Pair Link — match each picture to its name.
export function PairLink({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const n = level <= 5 ? 4 : 6;
  const run = useRun(onComplete); const set = useMemo(() => shuffle(t.items).slice(0, n), [t, n]); const names = useMemo(() => shuffle(set), [set]);
  const [sel, setSel] = useState(null); const [done, setDone] = useState([]);
  const pickName = (name) => { if (!sel) return; if (sel[1] === name) { run.ping('good'); setDone((d) => { const nd = [...d, name]; if (nd.length === n) run.finish(n); return nd; }); } else run.ping('bad'); setSel(null); };
  return <Stage theme={theme} title="Pair Link" flash={run.flash} stats={[['Linked', `${done.length}/${n}`]]}>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">{set.map((i) => <button key={i[0]} type="button" disabled={done.includes(i[1])} onClick={() => setSel(i)} className={`${tile} h-12 w-full ${sel?.[0] === i[0] ? 'ring-4 ring-amber-300' : ''} ${done.includes(i[1]) ? 'opacity-30' : ''}`} data-testid={`arcade-link-pic-${i[1]}`}>{i[0]}</button>)}</div>
      <div className="space-y-2">{names.map((i) => <button key={i[1]} type="button" disabled={done.includes(i[1])} onClick={() => pickName(i[1])} className={`${btn} h-12 w-full bg-white/90 text-sm text-slate-900 ${done.includes(i[1]) ? 'opacity-30' : ''}`} data-testid={`arcade-link-name-${i[1]}`}>{i[1]}</button>)}</div>
    </div>
  </Stage>;
}

// 17. Rhythm Tap — tap as the marker crosses the glowing zone.
export function RhythmTap({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 6, 12);
  const run = useRun(onComplete); const [pos, setPos] = useState(0); const [hits, setHits] = useState(0); const dir = useRef(1); const zone = Math.max(10, 22 - level);
  useEffect(() => { const id = setInterval(() => setPos((p) => { let n = p + dir.current * (1.5 + level * 0.35); if (n >= 100 || n <= 0) { dir.current *= -1; n = Math.max(0, Math.min(100, n)); } return n; }), 16); return () => clearInterval(id); }, [level]);
  const tap = () => { if (Math.abs(pos - 50) <= zone / 2) { run.ping('good'); setHits((h) => { if (h + 1 >= goal) run.finish(goal); return h + 1; }); } else run.ping('bad'); };
  return <Stage theme={theme} title="Rhythm Tap" flash={run.flash} stats={[['Beats', `${hits}/${goal}`]]}>
    <div className="relative my-8 h-6 rounded-full bg-black/40"><div className="absolute inset-y-0 rounded-full" style={{ left: `${50 - zone / 2}%`, width: `${zone}%`, background: t.accent, opacity: 0.6 }} /><div className="absolute -top-3 h-12 w-3 -translate-x-1/2 rounded bg-white shadow-lg" style={{ left: `${pos}%` }} /></div>
    <div className="text-center"><button type="button" onClick={tap} className={`${btn} bg-white px-10 text-3xl text-slate-900`} data-testid="arcade-rhythm-tap">{pick(t.items)[0]} TAP</button></div>
  </Stage>;
}

// 18. Word Guess — reveal the hidden themed word letter by letter.
export function WordGuess({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = level <= 5 ? 1 : 2;
  const run = useRun(onComplete); const [w, setW] = useState(0); const words = useMemo(() => shuffle(t.words), [t]); const word = words[w % words.length];
  const [guessed, setGuessed] = useState([]);
  const letters = useMemo(() => shuffle([...new Set([...word, ...shuffle('ABCDEFGHIJKLMNOPRSTUVWY'.split('')).slice(0, 6)])]), [word]);
  const guess = (l) => {
    if (guessed.includes(l)) return; const g = [...guessed, l]; setGuessed(g); run.ping(word.includes(l) ? 'good' : 'bad');
    if ([...word].every((c) => g.includes(c))) setTimeout(() => { if (w + 1 >= goal) run.finish(word.length * goal); else { setW(w + 1); setGuessed([]); } }, 500);
  };
  return <Stage theme={theme} title="Word Guess" flash={run.flash} stats={[['Word', `${Math.min(w + 1, goal)}/${goal}`]]}>
    <div className="mb-4 flex justify-center gap-1.5">{[...word].map((c, i) => <span key={i} className="flex h-11 w-9 items-center justify-center rounded-lg bg-white text-xl font-black text-slate-900" data-testid={`arcade-word-slot-${i}`}>{guessed.includes(c) ? c : ''}</span>)}</div>
    <div className="flex flex-wrap justify-center gap-1.5">{letters.map((l) => <button key={l} type="button" disabled={guessed.includes(l)} onClick={() => guess(l)} className={`${btn} h-11 w-11 bg-white/90 p-0 text-slate-900 disabled:opacity-30`} data-testid={`arcade-letter-${l}`}>{l}</button>)}</div>
  </Stage>;
}

// 19. Treasure Dig — hot/cold hints lead you to the buried prize.
export function TreasureDig({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const n = level <= 5 ? 5 : 6;
  const run = useRun(onComplete); const [spot] = useState(() => Math.floor(Math.random() * n * n)); const [dug, setDug] = useState({}); const [prize] = useState(() => pick(t.items)[0]);
  const dig = (k) => {
    if (dug[k]) return;
    const d = Math.abs(Math.floor(k / n) - Math.floor(spot / n)) + Math.abs((k % n) - (spot % n));
    setDug((cur) => ({ ...cur, [k]: d === 0 ? prize : d <= 1 ? '🔥' : d <= 2 ? '♨️' : d <= 3 ? '🌤️' : '❄️' }));
    if (d === 0) { run.ping('good'); setTimeout(() => run.finish(6), 500); } else run.ping(d <= 1 ? 'tap' : 'bad');
  };
  return <Stage theme={theme} title="Treasure Dig" flash={run.flash} stats={[['Digs', Object.keys(dug).length]]}>
    <div className={`grid gap-1.5 ${n === 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>{Array.from({ length: n * n }, (_, k) => <button key={k} type="button" onClick={() => dig(k)} className={`${tile} aspect-square text-xl ${dug[k] ? 'bg-amber-200/80' : 'bg-gradient-to-br from-amber-700/60 to-amber-900/60'}`} data-testid={`arcade-dig-${k}`}>{dug[k] || ''}</button>)}</div>
    <p className="mt-2 text-center text-xs text-white/60">🔥 very close · ♨️ warm · 🌤️ mild · ❄️ cold</p>
  </Stage>;
}

// 20. Safe Cracker — crack the code using higher/lower hints for each digit.
export function SafeCracker({ theme, config, onComplete }) {
  const level = levelOf(config); const len = level <= 4 ? 3 : 4;
  const run = useRun(onComplete); const [code] = useState(() => Array.from({ length: len }, () => Math.floor(Math.random() * 10))); const [cur, setCur] = useState(() => Array(len).fill(5)); const [hints, setHints] = useState(null); const [tries, setTries] = useState(0);
  const bump = (i, d) => setCur((c) => c.map((v, j) => (j === i ? (v + d + 10) % 10 : v)));
  const test = () => {
    setTries((x) => x + 1);
    if (cur.every((v, i) => v === code[i])) { run.ping('good'); setTimeout(() => run.finish(len * 3), 400); return; }
    run.ping('bad'); setHints(cur.map((v, i) => (v === code[i] ? '✅' : v < code[i] ? '⬆️' : '⬇️')));
  };
  return <Stage theme={theme} title="Safe Cracker" flash={run.flash} stats={[['Tries', tries]]}>
    <div className="flex justify-center gap-2 py-3">{cur.map((v, i) => <div key={i} className="flex flex-col items-center gap-1">
      <button type="button" onClick={() => bump(i, 1)} className={`${btn} bg-white/80 px-3 py-1 text-slate-900`} data-testid={`arcade-safe-up-${i}`}>▲</button>
      <div className="flex h-16 w-14 items-center justify-center rounded-xl bg-black/50 text-3xl font-black">{v}</div>
      <button type="button" onClick={() => bump(i, -1)} className={`${btn} bg-white/80 px-3 py-1 text-slate-900`} data-testid={`arcade-safe-down-${i}`}>▼</button>
      <span className="h-6 text-lg">{hints?.[i]}</span>
    </div>)}</div>
    <div className="text-center"><button type="button" onClick={test} className={`${btn} bg-amber-300 text-slate-900`} data-testid="arcade-safe-try">🔓 Try code</button></div>
  </Stage>;
}
