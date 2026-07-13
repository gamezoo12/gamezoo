import { useEffect, useState } from 'react';
import { contestsAPI } from '../../lib/api';
import { Trophy } from 'lucide-react';

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

  // Always show a full row: mix real winners with dummy fallbacks if fewer than 4 real ones
  const dummies = [
    { user_name: 'Sarah M.', prize_title: 'Win £250 Cash', prize_amount: 250 },
    { user_name: 'James T.', prize_title: 'Win £500 Cash', prize_amount: 500 },
    { user_name: 'Priya K.', prize_title: 'Win £100 Cash', prize_amount: 100 },
    { user_name: 'Ade O.',   prize_title: 'Win £1000 Cash', prize_amount: 1000 },
    { user_name: 'Lucy W.',  prize_title: 'Win £50 Cash',  prize_amount: 50 },
  ];
  const items = (winners && winners.length >= 4)
    ? winners
    : [...(winners || []), ...dummies].slice(0, 6);
  const doubled = [...items, ...items];

  return (
    <div className="relative w-full overflow-hidden bg-gradient-to-r from-orange-50 via-white to-rose-50 border-y border-orange-100 py-3" data-testid="winners-ticker">
      <div className="marquee flex gap-8 whitespace-nowrap">
        {doubled.map((w, i) => (
          <div key={`${w.user_name}-${i}`} className="inline-flex items-center gap-2 text-sm">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0">
              <Trophy className="w-3 h-3" />
            </div>
            <span className="text-slate-600">
              <span className="font-semibold text-slate-900">{w.user_name}</span> just won{' '}
              <span className="font-bold text-orange-600">£{Number(w.prize_amount).toLocaleString()}</span>{' '}
              on <span className="italic">{w.prize_title}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
