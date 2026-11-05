import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Star, Trophy } from 'lucide-react';
import { gamesAPI } from '../lib/api';
import { uniqueGames } from '../lib/practiceGames';
import { PracticeLeaderboard } from '../components/games/practice/PracticeLeaderboard';

// Global free-games leaderboard: everyone ranked by total stars collected across all games, plus per-game boards.
export default function GamesLeaderboard() {
  const [types, setTypes] = useState([]);
  const [game, setGame] = useState('');
  useEffect(() => { gamesAPI.types().then((g) => setTypes(g?.games || [])).catch(() => {}); }, []);
  const games = useMemo(() => uniqueGames(types), [types]);
  const label = games.find((g) => g.id === game)?.label;
  return (
    <div className="min-h-screen bg-slate-950" data-testid="games-leaderboard-page">
      <section className="bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-950 text-white">
        <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
          <Link to="/games" className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white" data-testid="games-leaderboard-back"><ArrowLeft className="h-4 w-4" />All games</Link>
          <div className="mt-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-[#FFD54A]"><Trophy className="h-4 w-4" />Free games leaderboard</div>
          <h1 className="mt-2 font-display text-4xl font-black sm:text-5xl">Star collectors</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-white/70"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />Every level earns up to 3 stars. Collect the most across all games to top the global board.</p>
        </div>
      </section>
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-6 sm:px-4">
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" data-testid="games-leaderboard-tabs">
          <button type="button" onClick={() => setGame('')} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${!game ? 'bg-amber-400 text-slate-900' : 'bg-white/10 text-white/80'}`} data-testid="games-leaderboard-global">Global · all games</button>
          <select value={game} onChange={(e) => setGame(e.target.value)} className="h-9 shrink-0 rounded-full border border-white/10 bg-white/10 px-3 text-xs font-bold text-white" data-testid="games-leaderboard-game-select">
            <option value="" className="text-slate-900">Pick a game…</option>
            {games.map((g) => <option key={g.id} value={g.id} className="text-slate-900">{g.label}</option>)}
          </select>
        </div>
        <PracticeLeaderboard key={game || 'global'} gameId={game || undefined} title={game ? `${label} · highest level` : 'Global · most stars'} limit={100} />
      </div>
    </div>
  );
}
