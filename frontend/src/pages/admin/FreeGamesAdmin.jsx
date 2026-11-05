import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Megaphone, Trophy } from 'lucide-react';
import { gamesAPI } from '../../lib/api';
import { uniqueGames } from '../../lib/practiceGames';
import { FreeGamesStats } from '../../components/admin/FreeGamesStats';
import { FreeGamesAds } from '../../components/admin/FreeGamesAds';
import { PracticeLeaderboard } from '../../components/games/practice/PracticeLeaderboard';

const TABS = [['stats', 'Stats', BarChart3], ['ads', 'Ads', Megaphone], ['leaderboard', 'Leaderboard', Trophy]];

export default function FreeGamesAdmin() {
  const [tab, setTab] = useState('stats');
  const [types, setTypes] = useState([]);
  const [lbGame, setLbGame] = useState('');
  useEffect(() => { gamesAPI.types().then((g) => setTypes(g?.games || [])).catch(() => {}); }, []);
  const games = useMemo(() => uniqueGames(types), [types]);
  const names = useMemo(() => Object.fromEntries(games.map((g) => [g.id, g.label])), [games]);
  return (
    <div className="space-y-5" data-testid="free-games-admin">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Free Games</h1>
        <p className="mt-1 text-sm text-slate-500">Plays, pass rates and players for the free home-page games, plus the ads shown before a level starts.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {TABS.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-black ${tab === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`} data-testid={`free-games-tab-${id}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>
      {tab === 'stats' && <FreeGamesStats names={names} />}
      {tab === 'ads' && <FreeGamesAds />}
      {tab === 'leaderboard' && (
        <div className="max-w-2xl space-y-3 rounded-2xl bg-slate-900 p-4">
          <select className="h-10 w-full rounded-lg border border-white/10 bg-slate-800 px-3 text-sm text-white" value={lbGame} onChange={(e) => setLbGame(e.target.value)} data-testid="free-games-lb-select">
            <option value="">All games (overall)</option>
            {games.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          <PracticeLeaderboard key={lbGame || 'all'} gameId={lbGame || undefined} title={lbGame ? names[lbGame] : 'Overall'} limit={50} />
        </div>
      )}
    </div>
  );
}
