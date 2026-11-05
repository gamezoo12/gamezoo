import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { playGameSound } from '../../../lib/gameExperience';
import { renderLevel, timeLimit } from '../../../lib/practiceGames';

function Countdown({ onDone }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    playGameSound('tap');
    const t = setTimeout(() => (n === 0 ? onDone() : setN(n - 1)), n === 0 ? 450 : 750);
    return () => clearTimeout(t);
  }, [n, onDone]);
  return <div className="flex h-64 items-center justify-center"><span key={n} className="pl-practice-pop font-display text-8xl font-black text-amber-400" data-testid="practice-countdown">{n || 'GO!'}</span></div>;
}

// Runs one level against the clock; time-out or an unsolved finish counts as a fail.
export function PracticeRun({ game, level, onFinish, onQuit }) {
  const limit = timeLimit(game, level);
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(limit ? limit * 1000 : 0);
  const startAt = useRef(0);
  const done = useRef(false);
  const end = (r) => { if (done.current) return; done.current = true; onFinish(r); };
  useEffect(() => {
    if (!started) return undefined;
    startAt.current = Date.now();
    const id = setInterval(() => {
      if (!limit) { setLeft(Date.now() - startAt.current); return; }
      const rem = limit * 1000 - (Date.now() - startAt.current);
      setLeft(rem);
      if (rem <= 0) end({ solved: false, timeout: true, duration_ms: limit * 1000, accuracy: 0 });
    }, 200);
    return () => clearInterval(id);
  }, [started, limit]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!started) return <Countdown onDone={() => setStarted(true)} />;
  const pct = limit ? Math.max(0, left / (limit * 1000)) : 1;
  const sec = limit ? Math.max(0, Math.ceil(left / 1000)) : Math.floor(left / 1000);
  return (
    <div data-testid="practice-run">
      <div className="mb-3 rounded-2xl bg-white/5 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-black uppercase tracking-widest text-white/60">Level {level}</span>
          {game.category !== 'Party' && <span className={`font-display text-2xl font-black tabular-nums ${pct < 0.25 ? 'animate-pulse text-rose-400' : 'text-white'}`} data-testid="practice-timer">{sec}s</span>}
          <button type="button" onClick={onQuit} className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-bold text-white/80" data-testid="practice-quit"><X className="h-3.5 w-3.5" />Quit</button>
        </div>
        {game.category !== 'Party' && <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full transition-[width] duration-200 ${pct < 0.25 ? 'bg-rose-500' : pct < 0.5 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct * 100}%` }} /></div>}
      </div>
      {renderLevel(game, level, (r) => end({ ...r, duration_ms: Math.min(r?.duration_ms ?? Date.now() - startAt.current, Date.now() - startAt.current) }))}
    </div>
  );
}
