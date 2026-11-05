import { useEffect, useMemo, useRef, useState } from 'react';
import { ARCADE_THEMES, Stage, btn, levelOf, pick, scale, shuffle, tile, useRun } from './kit';

const BAL = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316'];

// 1. Balloon Pop — tap the rising themed balloons before they float away.
export function BalloonPop({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 8, 20);
  const run = useRun(onComplete); const [score, setScore] = useState(0); const [items, setItems] = useState([]); const [pops, setPops] = useState([]);
  useEffect(() => {
    const id = setInterval(() => setItems((cur) => [...cur.filter((b) => Date.now() - b.at < 3200), { id: Math.random(), x: 5 + Math.random() * 78, at: Date.now(), e: pick(t.items)[0], c: Math.floor(Math.random() * BAL.length) }]), Math.max(350, 900 - level * 50));
    return () => clearInterval(id);
  }, [level, t]);
  const pop = (b) => { const y = Math.min(300, ((Date.now() - b.at) / (Math.max(1.6, 3.2 - level * 0.15) * 1000)) * 420 - 60); const id = Math.random(); setPops((p) => [...p.slice(-4), { id, x: b.x, y }]); setTimeout(() => setPops((p) => p.filter((q) => q.id !== id)), 350); setItems((cur) => cur.filter((x) => x.id !== b.id)); run.ping('good'); setScore((s) => { if (s + 1 >= goal) run.finish(goal); return s + 1; }); };
  return <Stage theme={theme} title="Balloon Pop" flash={run.flash} stats={[['Popped', `${score}/${goal}`]]}>
    <style>{'@keyframes arcRise{from{transform:translateY(0)}to{transform:translateY(-440px)}}'}</style>
    <div className="relative h-80 overflow-hidden rounded-2xl bg-black/20">
      {items.map((b) => <button key={b.id} type="button" onClick={() => pop(b)} className="absolute bottom-[-90px] flex flex-col items-center" style={{ left: `${b.x}%`, animation: `arcRise ${Math.max(1.6, 3.2 - level * 0.15)}s linear forwards` }} data-testid="arcade-balloon"><span className="flex h-20 w-16 items-center justify-center rounded-[50%_50%_46%_54%/58%_58%_42%_42%] text-3xl shadow-[inset_-8px_-10px_16px_rgba(0,0,0,0.25)]" style={{ background: `radial-gradient(circle at 30% 25%, #fff9, ${BAL[b.c]} 40%, ${BAL[b.c]})` }}>{b.e}</span><span className="h-2 w-2 rotate-45" style={{ background: BAL[b.c] }} /><span className="h-8 w-px bg-white/60" /></button>)}
      {pops.map((p) => <span key={p.id} className="pty-new pointer-events-none absolute text-4xl" style={{ left: `${p.x}%`, bottom: `${p.y}px` }}>💥</span>)}
    </div>
  </Stage>;
}

// 2. Catch the Prizes — move the basket, catch good items, avoid the bad one.
export function CatchFall({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 8, 18);
  const run = useRun(onComplete); const [lane, setLane] = useState(1); const [drop, setDrop] = useState(null); const [score, setScore] = useState(0);
  const laneRef = useRef(1); laneRef.current = lane;
  useEffect(() => {
    const ms = Math.max(700, 1500 - level * 80);
    const spawn = () => setDrop({ id: Math.random(), lane: Math.floor(Math.random() * 3), bad: Math.random() < 0.25, e: pick(t.items)[0] });
    spawn();
    const id = setInterval(() => {
      setDrop((d) => {
        if (d) {
          const caught = d.lane === laneRef.current;
          if (caught && !d.bad) { run.ping('good'); setScore((s) => { if (s + 1 >= goal) run.finish(goal); return s + 1; }); } else if (caught && d.bad) run.ping('bad');
        }
        return { id: Math.random(), lane: Math.floor(Math.random() * 3), bad: Math.random() < 0.25, e: pick(t.items)[0] };
      });
    }, ms);
    return () => clearInterval(id);
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps
  const ms = Math.max(700, 1500 - level * 80);
  return <Stage theme={theme} title="Catch the Prizes" flash={run.flash} stats={[['Caught', `${score}/${goal}`]]}>
    <style>{'@keyframes arcFall{from{top:0}to{top:78%}}'}</style>
    <div className="relative grid h-72 grid-cols-3 overflow-hidden rounded-2xl bg-black/20">
      {drop && <div key={drop.id} className="absolute text-4xl" style={{ left: `${drop.lane * 33.3 + 11}%`, animation: `arcFall ${ms}ms linear forwards` }}>{drop.bad ? t.bad : drop.e}</div>}
      {[0, 1, 2].map((l) => <button key={l} type="button" onClick={() => setLane(l)} className="relative h-full" data-testid={`arcade-lane-${l}`}>{lane === l && <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-4xl">🧺</span>}</button>)}
    </div>
    <p className="mt-2 text-center text-xs text-white/60">Tap a lane to move the basket. Avoid {t.bad}</p>
  </Stage>;
}

// 3. Higher or Lower — build a streak guessing the next number.
export function HigherLower({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 5, 12);
  const run = useRun(onComplete); const [cur, setCur] = useState(() => 1 + Math.floor(Math.random() * 99)); const [streak, setStreak] = useState(0); const [icon] = useState(() => pick(t.items)[0]);
  const guess = (up) => {
    let next = 1 + Math.floor(Math.random() * 99); while (next === cur) next = 1 + Math.floor(Math.random() * 99);
    if ((next > cur) === up) { run.ping('good'); setStreak((s) => { if (s + 1 >= goal) run.finish(goal); return s + 1; }); } else { run.ping('bad'); setStreak(0); }
    setCur(next);
  };
  return <Stage theme={theme} title="Higher or Lower" flash={run.flash} stats={[['Streak', `${streak}/${goal}`]]}>
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="flex h-40 w-32 flex-col items-center justify-center rounded-3xl bg-white text-slate-900 shadow-2xl"><span className="text-3xl">{icon}</span><span className="text-5xl font-black" data-testid="arcade-hl-value">{cur}</span></div>
      <div className="flex gap-3"><button type="button" className={`${btn} bg-emerald-400 text-slate-900`} onClick={() => guess(true)} data-testid="arcade-higher">Higher ▲</button><button type="button" className={`${btn} bg-rose-400 text-slate-900`} onClick={() => guess(false)} data-testid="arcade-lower">Lower ▼</button></div>
    </div>
  </Stage>;
}

// 4. Scratch & Reveal — scratch tiles to uncover three matching symbols.
export function ScratchReveal({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const size = level <= 5 ? 9 : 12;
  const run = useRun(onComplete);
  const cells = useMemo(() => { const win = pick(t.items)[0]; const rest = shuffle(t.items.map((i) => i[0]).filter((e) => e !== win)); return shuffle([win, win, win, ...Array.from({ length: size - 3 }, (_, i) => rest[i % rest.length])]).map((e) => ({ e, win: e === win })); }, [t, size]);
  const [open, setOpen] = useState([]);
  const scratch = (i) => { if (open.includes(i)) return; const next = [...open, i]; setOpen(next); run.ping(cells[i].win ? 'good' : 'tap'); if (next.filter((k) => cells[k].win).length === 3) setTimeout(() => run.finish(size), 400); };
  return <Stage theme={theme} title="Scratch & Reveal" flash={run.flash} stats={[['Found', `${open.filter((k) => cells[k].win).length}/3`]]}>
    <div className={`grid gap-2 ${size === 9 ? 'grid-cols-3' : 'grid-cols-4'}`}>
      {cells.map((c, i) => <button key={i} type="button" onClick={() => scratch(i)} className={`${tile} aspect-square ${open.includes(i) ? 'bg-white/90' : 'bg-gradient-to-br from-slate-300 to-slate-500'}`} data-testid={`arcade-scratch-${i}`}>{open.includes(i) ? c.e : '✨'}</button>)}
    </div>
  </Stage>;
}

// 5. Stack the Tower — stop the sliding block over the stack.
export function StackTower({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 6, 14);
  const run = useRun(onComplete); const [pos, setPos] = useState(0); const [stack, setStack] = useState(0); const dir = useRef(1);
  useEffect(() => { const id = setInterval(() => setPos((p) => { let n = p + dir.current * (2 + level * 0.4); if (n > 100 || n < 0) { dir.current *= -1; n = Math.max(0, Math.min(100, n)); } return n; }), 16); return () => clearInterval(id); }, [level]);
  const drop = () => { if (Math.abs(pos - 50) < Math.max(8, 20 - level)) { run.ping('good'); setStack((s) => { if (s + 1 >= goal) run.finish(goal); return s + 1; }); } else run.ping('bad'); };
  return <Stage theme={theme} title="Stack the Tower" flash={run.flash} stats={[['Height', `${stack}/${goal}`]]}>
    <button type="button" onClick={drop} className="relative block h-72 w-full overflow-hidden rounded-2xl bg-black/20" data-testid="arcade-stack-drop">
      <div className="absolute top-6 h-8 w-1/4 -translate-x-1/2 rounded-lg" style={{ left: `${12.5 + pos * 0.75}%`, background: t.accent }} />
      <div className="absolute inset-x-0 top-14 mx-auto h-[calc(100%-3.5rem)] w-px border-l-2 border-dashed border-white/20" />
      <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col-reverse">{Array.from({ length: stack }, (_, i) => <div key={i} className="mb-0.5 h-3 w-24 rounded" style={{ background: t.accent, opacity: 0.5 + (i % 2) * 0.4 }} />)}</div>
      <span className="absolute bottom-2 right-3 text-xs text-white/60">Tap when the block is centred</span>
    </button>
  </Stage>;
}

// 6. Dodge Runner — switch lanes to dodge incoming hazards until the finish.
export function DodgeRunner({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 10, 25);
  const run = useRun(onComplete); const [lane, setLane] = useState(1); const [obs, setObs] = useState([]); const [dodged, setDodged] = useState(0); const [runner] = useState(() => pick(t.items)[0]);
  const laneRef = useRef(1); laneRef.current = lane;
  useEffect(() => {
    const id = setInterval(() => setObs((cur) => {
      const moved = cur.map((o) => ({ ...o, y: o.y + 1 }));
      moved.filter((o) => o.y === 5).forEach((o) => { if (o.lane === laneRef.current) run.ping('bad'); else setDodged((d) => { if (d + 1 >= goal) run.finish(goal); return d + 1; }); });
      const keep = moved.filter((o) => o.y < 6);
      return Math.random() < 0.55 ? [...keep, { id: Math.random(), lane: Math.floor(Math.random() * 3), y: 0 }] : keep;
    }), Math.max(220, 520 - level * 28));
    return () => clearInterval(id);
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Stage theme={theme} title="Dodge Runner" flash={run.flash} stats={[['Dodged', `${dodged}/${goal}`]]}>
    <div className="relative grid h-72 grid-cols-3 overflow-hidden rounded-2xl bg-black/25">
      {obs.map((o) => <span key={o.id} className="absolute text-3xl transition-[top] duration-200" style={{ left: `${o.lane * 33.3 + 12}%`, top: `${o.y * 15}%` }}>{t.bad}</span>)}
      {[0, 1, 2].map((l) => <button key={l} type="button" onClick={() => setLane(l)} className="relative h-full border-x border-white/5" data-testid={`arcade-runner-lane-${l}`}>{lane === l && <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-4xl">{runner}</span>}</button>)}
    </div>
  </Stage>;
}

// 7. Spin Match — stop each reel on the target symbol.
export function SpinMatch({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const reels = level <= 4 ? 3 : 4; const syms = t.items.map((i) => i[0]);
  const run = useRun(onComplete); const [target] = useState(() => pick(syms)); const [idx, setIdx] = useState(() => Array(reels).fill(0)); const [stopped, setStopped] = useState(0);
  useEffect(() => { const id = setInterval(() => setIdx((cur) => cur.map((v, i) => (i < stopped ? v : (v + 1) % syms.length))), Math.max(90, 260 - level * 16)); return () => clearInterval(id); }, [stopped, level, syms.length]);
  const stop = () => { if (syms[idx[stopped]] === target) { run.ping('good'); if (stopped + 1 >= reels) run.finish(reels * 2); setStopped((s) => s + 1); } else run.ping('bad'); };
  return <Stage theme={theme} title="Spin Match" flash={run.flash} stats={[['Target', target], ['Reels', `${stopped}/${reels}`]]}>
    <div className="flex justify-center gap-2 py-4">{idx.map((v, i) => <div key={i} className={`${tile} h-24 w-20 ${i < stopped ? 'bg-emerald-400/30' : ''}`}>{syms[v]}</div>)}</div>
    <div className="text-center"><button type="button" onClick={stop} className={`${btn} bg-amber-300 text-slate-900`} data-testid="arcade-spin-stop">STOP</button></div>
  </Stage>;
}

// 8. Bubble Burst — tap clusters of 2+ matching bubbles to clear the board.
export function BubbleBurst({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const n = 6; const kinds = Math.min(5, 3 + Math.floor(level / 4)); const goal = scale(level, 20, 30);
  const run = useRun(onComplete); const syms = t.items.slice(0, kinds).map((i) => i[0]);
  const [grid, setGrid] = useState(() => Array.from({ length: n * n }, () => pick(syms))); const [cleared, setCleared] = useState(0);
  const tap = (k) => {
    const seen = new Set([k]); const queue = [k];
    while (queue.length) { const c = queue.pop(); const r = Math.floor(c / n); [[r, c % n - 1], [r, c % n + 1], [r - 1, c % n], [r + 1, c % n]].forEach(([y, x]) => { const j = y * n + x; if (y >= 0 && y < n && x >= 0 && x < n && !seen.has(j) && grid[j] === grid[k]) { seen.add(j); queue.push(j); } }); }
    if (seen.size < 2) { run.ping('bad'); return; }
    run.ping('good'); setGrid((g) => { const out = [...g]; for (let c = 0; c < n; c += 1) { const col = []; for (let r = n - 1; r >= 0; r -= 1) if (!seen.has(r * n + c)) col.push(g[r * n + c]); while (col.length < n) col.push(pick(syms)); col.forEach((v, k) => { out[(n - 1 - k) * n + c] = v; }); } return out; });
    setCleared((c) => { if (c + seen.size >= goal) run.finish(goal / 2); return c + seen.size; });
  };
  return <Stage theme={theme} title="Bubble Burst" flash={run.flash} stats={[['Burst', `${Math.min(cleared, goal)}/${goal}`]]}>
    <div className="grid grid-cols-6 gap-1.5">{grid.map((e, k) => <button key={k} type="button" onClick={() => tap(k)} className="aspect-square rounded-full bg-white/15 text-2xl shadow-inner transition-transform active:scale-90" data-testid={`arcade-bubble-${k}`}>{e}</button>)}</div>
  </Stage>;
}

// 9. Quick Quiz — name the picture, fast.
export function QuickQuiz({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 6, 12);
  const run = useRun(onComplete); const [q, setQ] = useState(0);
  const round = useMemo(() => { const opts = shuffle(t.items).slice(0, level <= 5 ? 3 : 4); return { ans: pick(opts), opts }; }, [q, t, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const answer = (o) => { if (o[0] === round.ans[0]) { run.ping('good'); if (q + 1 >= goal) run.finish(goal); setQ(q + 1); } else run.ping('bad'); };
  return <Stage theme={theme} title="Quick Quiz" flash={run.flash} stats={[['Question', `${Math.min(q + 1, goal)}/${goal}`]]}>
    <p className="mb-3 text-center text-lg font-black">Which one is <span style={{ color: t.accent }} data-testid="arcade-quiz-name">{round.ans[1]}</span>?</p>
    <div className="grid grid-cols-2 gap-3">{round.opts.map((o) => <button key={o[0]} type="button" onClick={() => answer(o)} className={`${tile} h-24`} data-testid={`arcade-quiz-opt-${o[1]}`}>{o[0]}</button>)}</div>
  </Stage>;
}

// 10. Find the Odd One — spot the single different symbol in the grid.
export function FindOdd({ theme, config, onComplete }) {
  const t = ARCADE_THEMES[theme]; const level = levelOf(config); const goal = scale(level, 5, 10); const n = level <= 4 ? 4 : 5;
  const run = useRun(onComplete); const [r, setR] = useState(0);
  const board = useMemo(() => { const [a, b] = shuffle(t.items); return { odd: Math.floor(Math.random() * n * n), a: a[0], b: b[0] }; }, [r, t, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = (k) => { if (k === board.odd) { run.ping('good'); if (r + 1 >= goal) run.finish(goal); setR(r + 1); } else run.ping('bad'); };
  return <Stage theme={theme} title="Find the Odd One" flash={run.flash} stats={[['Round', `${Math.min(r + 1, goal)}/${goal}`]]}>
    <div className={`grid gap-1.5 ${n === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>{Array.from({ length: n * n }, (_, k) => <button key={k} type="button" onClick={() => tap(k)} className={`${tile} aspect-square text-2xl`} data-testid={`arcade-odd-${k}`}>{k === board.odd ? board.b : board.a}</button>)}</div>
  </Stage>;
}
