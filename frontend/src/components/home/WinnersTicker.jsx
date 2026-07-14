import { useEffect, useState } from 'react';
import { contestsAPI } from '../../lib/api';
import { Trophy } from 'lucide-react';

/**
 * Winners ticker — real data only.
 * Hidden when there are no real recent winners (no more fabricated "Sarah M." fallback).
 */
export default function WinnersTicker() {
  const [winners, setWinners] = useState([]);

  useEffect(() => {
    const load = () => contestsAPI.recentWinners?.()
      .then(setWinners)
      .catch(() => setWinners([]));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (!winners || winners.length === 0) return null;

  const doubled = [...winners, ...winners];
  return (
    <div className="relative w-full overflow-hidden border-y border-slate-100 py-3 bg-white" data-testid="winners-ticker">
      <div className="marquee flex gap-8 whitespace-nowrap">
        {doubled.map((w, i) => (
          <div key={`${w.user_name}-${i}`} className="inline-flex items-center gap-2 text-sm">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#FFD54A] to-[#F5B800] text-slate-900 flex items-center justify-center shrink-0">
              <Trophy className="w-3 h-3" />
            </div>
            <span className="text-slate-600">
              <span className="font-semibold text-slate-900">{w.user_name}</span> just won{' '}
              <span className="font-bold text-[#6C2BFF]">£{Number(w.prize_amount).toLocaleString()}</span>{' '}
              on <span className="italic">{w.prize_title}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
