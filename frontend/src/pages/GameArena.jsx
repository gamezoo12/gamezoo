import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Gamepad2, ShieldCheck } from 'lucide-react';

import { gamesAPI, api } from '../lib/api';
import { resolveMediaUrl } from '../lib/media';
import { useAuth } from '../context/AuthContext';
import { uniqueGames } from '../lib/practiceGames';
import { levelState, loadProgress } from '../lib/practiceProgress';
import { GameCoverCard } from '../components/games/practice/GameCoverCard';
import { PracticeLeaderboard } from '../components/games/practice/PracticeLeaderboard';

export default function GameArena() {
  const { user, loading: authLoading } = useAuth() || {};
  const [settings, setSettings] = useState(null);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({});
  const [cat, setCat] = useState('All');

  useEffect(() => {
    Promise.all([api.get('/settings').then((r) => r.data), gamesAPI.types()])
      .then(([s, g]) => { setSettings(s || {}); setTypes(g?.games || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (!authLoading) loadProgress(user).then(setProgress); }, [user, authLoading]);

  const games = useMemo(() => uniqueGames(types, Array.isArray(settings?.game_preview_games) ? settings.game_preview_games : []), [types, settings]);
  const cats = useMemo(() => ['All', ...new Set(games.map((g) => g.category))], [games]);
  const shown = cat === 'All' ? games : games.filter((g) => g.category === cat);

  if (loading) return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-slate-500">Loading games…</div>;
  if (!settings?.game_preview_enabled) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-950">
      <section className="bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 md:py-16 lg:px-8">
          <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-[#FFD54A]"><Gamepad2 className="h-4 w-4" />Prize League Game Arena</div>
          <h1 className="mt-3 font-display text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">{games.length} games. Endless levels.</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-lg">Start easy, unlock level after level. New levels keep coming, so your streak never has to end.</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs sm:text-sm"><ShieldCheck className="h-4 w-4 text-emerald-400" />Free · No ticket · No official score</div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-3 py-6 sm:px-4 md:py-10 lg:px-8">
        <div className="-mx-3 mb-5 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" data-testid="arena-category-filters">
          {cats.map((c) => <button key={c} type="button" onClick={() => setCat(c)} data-testid={`arena-cat-${c.toLowerCase().replace(/[^a-z]+/g, '-')}`}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition-colors ${cat === c ? 'bg-amber-400 text-slate-900' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}>{c}</button>)}
        </div>
        {shown.length === 0 ? <div className="rounded-2xl border border-white/10 p-10 text-center text-white/70">No games are currently available.</div> : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {shown.map((g) => <GameCoverCard key={g.id} dark game={g} compact state={levelState(progress, g.id)} testId={`public-game-${g.id}`}
              cover={settings?.game_preview_images?.[g.id] ? resolveMediaUrl(settings.game_preview_images[g.id]) : g.cover} />)}
          </div>
        )}
        <div className="mt-8 max-w-2xl"><PracticeLeaderboard title="Top players · all games" limit={10} /></div>
      </section>
    </div>
  );
}
