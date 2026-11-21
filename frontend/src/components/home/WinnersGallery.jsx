import { useEffect, useMemo, useState } from 'react';
import { Trophy, UserRound } from 'lucide-react';
import { publicAPI } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/media';

export function relativeTime(value, now = Date.now()) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days}day${days === 1 ? '' : 's'} ago`;
}

function WinnerCard({ winner, now }) {
  return (
    <article className="flex h-24 w-[280px] shrink-0 overflow-hidden border border-slate-200 bg-white">
      <div className="grid h-24 w-24 shrink-0 place-items-center bg-slate-100 text-slate-400">
        {winner.image_url ? (
          <img src={resolveMediaUrl(winner.image_url)} alt={winner.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <UserRound className="h-11 w-11" aria-label="Winner photo coming soon" />
        )}
      </div>
      <div className="min-w-0 flex-1 px-3 py-2">
        <div className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-700"><Trophy className="h-3 w-3" />{winner.prize}</div>
        <div className="truncate text-sm font-extrabold text-slate-900">{winner.name}</div>
        <div className="mt-1 text-xs text-slate-500">{relativeTime(winner.created_at, now)}</div>
      </div>
    </article>
  );
}

export default function WinnersGallery() {
  const [winners, setWinners] = useState([]);
  const [totalWinners, setTotalWinners] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await publicAPI.homepageContent();
        if (!active) return;
        setWinners((data.winners || []).slice(0, 100));
        setTotalWinners(Number(data.total_winners ?? data.winners?.length ?? 0));
      } catch {
        if (active) { setWinners([]); setTotalWinners(0); }
      }
    };
    load();
    const refresh = setInterval(load, 15000);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => { active = false; clearInterval(refresh); clearInterval(clock); };
  }, []);

  const newestWinner = winners[0]?.winner_id || winners[0]?.content_id || 'none';
  const loop = useMemo(() => winners.length > 1 ? [...winners, ...winners] : winners, [winners]);

  return (
    <section className="border-y border-slate-200 bg-white py-2" data-testid="homepage-winners">
      <style>{`
        @keyframes pl-winners-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .pl-winners-track { width: max-content; animation: pl-winners-scroll ${Math.max(35, winners.length * 3)}s linear infinite; }
        .pl-winners-viewport:hover .pl-winners-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .pl-winners-track { animation: none; } }
      `}</style>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-xs font-black uppercase text-slate-900">Recent Winners</h2>
          <span className="text-[10px] font-bold uppercase text-slate-500">{totalWinners.toLocaleString()} total winners</span>
        </div>
        {winners.length > 0 ? (
          <div className="pl-winners-viewport overflow-hidden" data-testid="homepage-winner-list">
            <div key={newestWinner} className={`flex gap-2 ${winners.length > 1 ? 'pl-winners-track' : ''}`}>
              {loop.map((winner, index) => <WinnerCard key={`${winner.winner_id || winner.content_id}-${index}`} winner={winner} now={now} />)}
            </div>
          </div>
        ) : (
          <div className="py-2 text-center text-xs font-semibold text-slate-400">No verified real-prize winners yet.</div>
        )}
      </div>
    </section>
  );
}
