import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Crown, LayoutGrid, RotateCcw, Trophy } from 'lucide-react';
import { pickResultQuote } from '../../../lib/gameExperience';
import { LEVELS } from '../../../lib/practiceGames';
import { StarRow } from './LevelPath';

const btn = 'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 font-black transition-transform hover:-translate-y-0.5 active:translate-y-0';
const CONFETTI = ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa'];

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 24 }, (_, i) => <span key={i} className="pl-practice-confetti absolute top-0 h-2.5 w-1.5 rounded-sm" style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % 5], animationDelay: `${(i % 8) * 0.12}s` }} />)}
    </div>
  );
}

export function PracticeResult({ result, level, stars, guest, onNext, onRetry, onLevels }) {
  const passed = Boolean(result.solved) && !result.timeout;
  const champion = passed && level >= LEVELS;
  const [quote] = useState(() => pickResultQuote(passed));
  return (
    <div className="relative mx-auto max-w-lg py-4 text-center" data-testid={passed ? 'practice-pass' : 'practice-fail'}>
      {passed && <Confetti />}
      <div className="pl-practice-pop relative">
        {champion ? <Crown className="mx-auto h-16 w-16 text-amber-400" /> : passed ? <Trophy className="mx-auto h-14 w-14 text-amber-400" /> : <RotateCcw className="mx-auto h-12 w-12 text-rose-400" />}
        <h2 className="mt-3 font-display text-3xl font-black text-white sm:text-4xl" data-testid="practice-result-title">
          {champion ? 'Champion! All 10 levels done' : passed ? `Congratulations! Level ${level} complete` : result.timeout ? "Time's up!" : 'So close!'}
        </h2>
        {passed && <div className="mt-3 flex justify-center"><StarRow count={stars} size="h-9 w-9" testId="practice-result-stars" /></div>}
        <p className="mt-3 text-sm text-white/70">{passed ? `Time ${(result.duration_ms / 1000).toFixed(1)}s · accuracy ${Math.round((result.accuracy || 0) * 100)}%` : `Level ${level} beat you this time. Every retry makes you sharper.`}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm italic text-amber-200/90">“{quote}”</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {passed && level < LEVELS && <button type="button" onClick={onNext} className={`${btn} bg-amber-400 text-slate-900`} data-testid="practice-next-level">Play Level {level + 1}<ArrowRight className="h-4 w-4" /></button>}
          <button type="button" onClick={onRetry} className={`${btn} ${passed ? 'bg-white/10 text-white' : 'bg-amber-400 text-slate-900'}`} data-testid="practice-retry"><RotateCcw className="h-4 w-4" />{passed ? 'Replay' : 'Retry'}</button>
          <button type="button" onClick={onLevels} className={`${btn} bg-white/10 text-white`} data-testid="practice-levels"><LayoutGrid className="h-4 w-4" />Levels</button>
        </div>
        {guest && <Link to={`/login?tab=signup&next=${encodeURIComponent('/competitions')}`} className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-amber-300" data-testid="practice-signup">Create a free account to save your levels and compete for real prizes<ArrowRight className="h-4 w-4" /></Link>}
      </div>
    </div>
  );
}
