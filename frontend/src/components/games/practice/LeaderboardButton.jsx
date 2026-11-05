import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';

export function LeaderboardButton({ testId = 'games-leaderboard-link', light = false }) {
  return (
    <Link to="/games/leaderboard" data-testid={testId}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-black transition-transform hover:-translate-y-0.5 ${light ? 'bg-slate-900 text-amber-300' : 'bg-amber-400 text-slate-900 shadow-[0_0_18px_rgba(251,191,36,0.35)]'}`}>
      <Trophy className="h-4 w-4" />Leaderboard
    </Link>
  );
}
