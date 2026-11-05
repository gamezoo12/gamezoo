import { useEffect, useState } from 'react';
import { ChevronDown, Lock, Star } from 'lucide-react';
import { difficultyName } from '../../../lib/difficulty';
import { LEVELS, TIER_SIZE, tierOf } from '../../../lib/practiceGames';

export function StarRow({ count, size = 'h-3.5 w-3.5', testId }) {
  return (
    <span className="inline-flex gap-0.5" data-testid={testId}>
      {[1, 2, 3].map((i) => <Star key={i} className={`${size} ${i <= count ? 'fill-amber-400 text-amber-400' : 'text-white/25'}`} />)}
    </span>
  );
}

function LevelTile({ lv, state, onPick }) {
  const locked = lv > state.unlocked;
  const stars = state.stars[lv] || 0;
  return (
    <button type="button" disabled={locked} onClick={() => onPick(lv)} data-testid={`practice-level-${lv}`}
      className={`flex aspect-square flex-col items-center justify-center rounded-xl border-b-4 transition-transform duration-150 ${locked ? 'cursor-not-allowed border-black/40 bg-white/5 text-white/30' : stars ? 'border-emerald-900 bg-gradient-to-b from-emerald-400 to-emerald-600 text-white hover:-translate-y-0.5' : 'animate-pulse border-amber-800 bg-gradient-to-b from-amber-300 to-amber-500 text-slate-900 hover:-translate-y-0.5'}`}>
      {locked ? <Lock className="h-4 w-4" /> : <span className="font-display text-lg font-black leading-none">{lv}</span>}
      {!locked && <span className="mt-1"><StarRow count={stars} size="h-2 w-2 sm:h-2.5 sm:w-2.5" /></span>}
    </button>
  );
}

// 100 levels grouped into 10 tiers; the tier holding the player's next level opens by default.
export function LevelPath({ state, onPick }) {
  const current = tierOf(Math.min(state.unlocked, LEVELS));
  const [open, setOpen] = useState(current);
  useEffect(() => setOpen(current), [current]);
  return (
    <div className="space-y-2" data-testid="practice-level-path">
      {Array.from({ length: LEVELS / TIER_SIZE }, (_, i) => i + 1).map((t) => {
        const first = (t - 1) * TIER_SIZE + 1;
        const levels = Array.from({ length: TIER_SIZE }, (_, i) => first + i);
        const cleared = levels.filter((lv) => state.stars[lv]).length;
        const stars = levels.reduce((a, lv) => a + (state.stars[lv] || 0), 0);
        const locked = first > state.unlocked;
        const isOpen = open === t && !locked;
        return (
          <div key={t} className={`overflow-hidden rounded-2xl border ${isOpen ? 'border-amber-300/40 bg-white/[0.04]' : 'border-white/10'}`}>
            <button type="button" disabled={locked} onClick={() => setOpen(isOpen ? 0 : t)} data-testid={`practice-tier-${t}`}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${locked ? 'cursor-not-allowed text-white/35' : 'text-white'}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${locked ? 'bg-white/5' : cleared === TIER_SIZE ? 'bg-emerald-500' : 'bg-amber-400 text-slate-900'}`}>{locked ? <Lock className="h-3.5 w-3.5" /> : t}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">Levels {first}–{first + TIER_SIZE - 1}</span>
                <span className="block text-[11px] font-bold uppercase tracking-wide opacity-60">{difficultyName(t)}</span>
              </span>
              {!locked && <span className="text-right text-[11px] font-bold text-white/70">{cleared}/{TIER_SIZE}<span className="ml-2 inline-flex items-center gap-0.5 text-amber-300"><Star className="h-3 w-3 fill-amber-400" />{stars}</span></span>}
              {!locked && <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
            </button>
            {isOpen && <div className="grid grid-cols-5 gap-2 px-3 pb-3 sm:grid-cols-10" data-testid={`practice-tier-${t}-levels`}>{levels.map((lv) => <LevelTile key={lv} lv={lv} state={state} onPick={onPick} />)}</div>}
          </div>
        );
      })}
    </div>
  );
}
