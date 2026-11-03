import { Lock, Star } from 'lucide-react';
import { difficultyName } from '../../../lib/difficulty';
import { LEVELS } from '../../../lib/practiceGames';

export function StarRow({ count, size = 'h-3.5 w-3.5', testId }) {
  return (
    <span className="inline-flex gap-0.5" data-testid={testId}>
      {[1, 2, 3].map((i) => <Star key={i} className={`${size} ${i <= count ? 'fill-amber-400 text-amber-400' : 'text-white/25'}`} />)}
    </span>
  );
}

export function LevelPath({ state, onPick }) {
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-3" data-testid="practice-level-path">
      {Array.from({ length: LEVELS }, (_, i) => i + 1).map((lv) => {
        const locked = lv > state.unlocked;
        const stars = state.stars[lv] || 0;
        return (
          <button key={lv} type="button" disabled={locked} onClick={() => onPick(lv)} data-testid={`practice-level-${lv}`}
            className={`group flex aspect-square flex-col items-center justify-center rounded-2xl border-b-4 text-center transition-transform duration-150 ${locked ? 'cursor-not-allowed border-black/40 bg-white/5 text-white/30' : stars ? 'border-emerald-900 bg-gradient-to-b from-emerald-400 to-emerald-600 text-white hover:-translate-y-0.5' : 'animate-pulse border-amber-800 bg-gradient-to-b from-amber-300 to-amber-500 text-slate-900 hover:-translate-y-0.5'}`}>
            {locked ? <Lock className="h-5 w-5" /> : <span className="font-display text-xl font-black leading-none sm:text-2xl">{lv}</span>}
            <span className="mt-1 hidden text-[9px] font-bold uppercase tracking-wide opacity-80 sm:block">{difficultyName(lv)}</span>
            {!locked && <span className="mt-1"><StarRow count={stars} size="h-2.5 w-2.5 sm:h-3 sm:w-3" /></span>}
          </button>
        );
      })}
    </div>
  );
}
