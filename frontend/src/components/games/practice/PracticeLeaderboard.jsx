import { useEffect, useState } from 'react';
import { Crown, Medal, Star, Trophy } from 'lucide-react';
import { practiceAPI } from '../../../lib/api';

const MEDAL = ['text-amber-300', 'text-slate-200', 'text-orange-400'];

// All-time free-play leaderboard: highest level reached, then stars (overall = levels summed across games).
export function PracticeLeaderboard({ gameId, title, limit = 10, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  useEffect(() => { practiceAPI.leaderboard(gameId, limit).then(setData).catch(() => setData({ top: [], players: 0 })); }, [gameId, limit, refreshKey]);
  const id = gameId || 'overall';
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5" data-testid={`practice-leaderboard-${id}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-black text-white"><Trophy className="h-5 w-5 text-amber-300" />{title}</h3>
        {data && <span className="whitespace-nowrap text-[11px] font-bold text-white/50">{data.players} player{data.players === 1 ? '' : 's'}</span>}
      </div>
      {!data ? <div className="mt-3 h-24 animate-pulse rounded-xl bg-white/5" /> : data.top.length === 0 ? (
        <p className="mt-3 text-sm text-white/60" data-testid={`practice-leaderboard-${id}-empty`}>No one on the board yet. Clear a level while signed in to take the top spot.</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {data.top.map((r) => (
            <li key={r.rank} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${r.rank <= 3 ? 'bg-white/[0.07]' : ''}`} data-testid={`practice-lb-row-${r.rank}`}>
              <span className={`w-6 text-center font-black ${MEDAL[r.rank - 1] || 'text-white/50'}`}>{r.rank === 1 ? <Crown className="mx-auto h-4 w-4" /> : r.rank <= 3 ? <Medal className="mx-auto h-4 w-4" /> : r.rank}</span>
              <span className="min-w-0 flex-1 truncate font-bold text-white">{r.name}</span>
              {gameId ? <>
                <span className="whitespace-nowrap font-black text-amber-300">Lv {r.level}</span>
                <span className="inline-flex w-14 items-center justify-end gap-0.5 text-xs font-bold text-white/70"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{r.stars}</span>
              </> : <>
                <span className="whitespace-nowrap text-xs font-bold text-white/60">{r.level} levels</span>
                <span className="inline-flex min-w-16 items-center justify-end gap-1 font-black text-amber-300"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{r.stars}</span>
              </>}
            </li>
          ))}
        </ol>
      )}
      {data?.me && <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm font-bold text-amber-100" data-testid={`practice-leaderboard-${id}-me`}>You are #{data.me.rank} · {gameId ? `Level ${data.me.level} · ${data.me.stars} stars` : `${data.me.stars} stars · ${data.me.level} levels`}</div>}
    </section>
  );
}
