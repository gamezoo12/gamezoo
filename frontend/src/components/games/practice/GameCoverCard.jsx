import { Link } from 'react-router-dom';
import { Gamepad2, Play, Star } from 'lucide-react';
import { LEVELS } from '../../../lib/practiceGames';
import { levelsCleared, totalStars } from '../../../lib/practiceProgress';

// Shared cover card for the free games (Games page + home preview).
export function GameCoverCard({ game, cover, state, dark = false, compact = false, testId }) {
  const cleared = levelsCleared(state);
  return (
    <Link to={`/games/${game.id}`} data-testid={testId}
      className={`group block overflow-hidden rounded-2xl border transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-2xl ${dark ? 'border-white/10 bg-white/5' : 'border-slate-100 bg-white shadow-sm'}`}>
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-900">
        {cover ? <img src={cover} alt={game.label} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#6C2BFF] to-fuchsia-700 text-white"><Gamepad2 className="h-12 w-12" /></div>}
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur">{game.category}</span>
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black text-slate-900 shadow"><Play className="h-3 w-3" />Play</span>
      </div>
      <div className={compact ? 'p-3' : 'p-4'}>
        <div className={`font-display font-extrabold leading-tight line-clamp-1 ${compact ? 'text-sm' : 'text-lg'} ${dark ? 'text-white' : 'text-slate-900'}`}>{game.label}</div>
        <div className={`mt-1.5 flex items-center justify-between text-[11px] font-bold ${dark ? 'text-white/60' : 'text-slate-500'}`}>
          <span className="inline-flex items-center gap-1">{cleared ? `${cleared}/${LEVELS} levels` : <><Gamepad2 className="h-3 w-3" />{LEVELS} levels</>}</span>
          <span className="inline-flex items-center gap-0.5 text-amber-500"><Star className="h-3 w-3 fill-amber-400" />{totalStars(state)}</span>
        </div>
        <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${dark ? 'bg-white/10' : 'bg-slate-100'}`}><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${(cleared / LEVELS) * 100}%` }} /></div>
      </div>
    </Link>
  );
}
