import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Trophy } from 'lucide-react';

import { api, gamesAPI } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/media';
import { useAuth } from '../../context/AuthContext';
import { uniqueGames, uniqueIdFor } from '../../lib/practiceGames';
import { levelState, loadProgress } from '../../lib/practiceProgress';
import { GameCoverCard } from '../games/practice/GameCoverCard';
import { LeaderboardButton } from '../games/practice/LeaderboardButton';

export default function GamePreviewSection({ mobile = false }) {
  const [settings, setSettings] = useState(null);
  const [games, setGames] = useState([]);
  const [progress, setProgress] = useState({});
  const { user, loading: authLoading } = useAuth() || {};
  useEffect(() => { if (!authLoading) loadProgress(user).then(setProgress); }, [user, authLoading]);

  useEffect(() => {
    let active = true;

    Promise.all([
      api.get('/settings').then(r => r.data),
      gamesAPI.types(),
    ])
      .then(([publicSettings, gameResponse]) => {
        if (!active) return;

        setSettings(publicSettings || {});
        setGames(gameResponse?.games || []);
      })
      .catch(() => {
        if (!active) return;
        setSettings(null);
        setGames([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const visibleGames = useMemo(() => {
    if (
      !settings?.game_preview_enabled ||
      !settings?.game_preview_home_enabled
    ) {
      return [];
    }

    const selected = Array.isArray(settings?.game_preview_games)
      ? settings.game_preview_games
      : [];

    const count = Math.max(
      1,
      Math.min(12, Number(settings?.game_preview_home_count) || 4)
    );

    const ids = [...new Set(selected.map(uniqueIdFor))];
    const all = uniqueGames(games);
    return ids.map(id => all.find(g => g.id === id)).filter(Boolean).slice(0, count);
  }, [games, settings]);

  // Critical feature-flag behaviour:
  // OFF means the current homepage remains unchanged.
  if (visibleGames.length === 0) {
    return null;
  }

  const coverOf = game => (settings?.game_preview_images?.[game.id] ? resolveMediaUrl(settings.game_preview_images[game.id]) : game.cover);

  if (mobile) {
    return (
      <section
        className="px-4 pt-7"
        data-testid="mobile-public-game-preview-section"
      >
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#FFD54A] font-extrabold">
              Play Free
            </div>

            <h2 className="font-display text-xl font-extrabold text-white mt-1">
              Try Skill Games
            </h2>
          </div>

          <div className="flex items-center gap-3">
          <Link to="/games/leaderboard" className="text-xs font-bold text-white/80 inline-flex items-center gap-1" data-testid="mobile-preview-leaderboard-link"><Trophy className="w-3.5 h-3.5 text-[#FFD54A]" />Leaderboard</Link>
          <Link
            to="/games"
            className="text-xs font-bold text-[#FFD54A] inline-flex items-center gap-1"
          >
            All Games
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          </div>
        </div>

        <p className="text-xs text-white/60 mb-4">
          Endless levels in every game. Beat one to unlock the next, free.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {visibleGames.map(game => <GameCoverCard key={game.id} dark compact game={game} state={levelState(progress, game.id)} testId={`mobile-preview-game-${game.id}`} cover={coverOf(game)} />)}
        </div>
      </section>
    );
  }

  return (
    <section
      className="py-12 bg-slate-50"
      data-testid="desktop-public-game-preview-section"
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-7">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#6C2BFF] font-extrabold">
              Free Game Preview
            </div>

            <h2 className="font-display text-3xl md:text-4xl font-black text-slate-900 mt-1">
              Try the games before you compete
            </h2>

            <p className="text-sm md:text-base text-slate-500 mt-2 max-w-2xl">
              Endless levels in every game, from easy to brutal. Beat one to unlock
              the next, free, with no tickets and no official score.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
          <LeaderboardButton testId="home-preview-leaderboard-link" light />
          <Link
            to="/games"
            className="inline-flex items-center gap-2 text-[#6C2BFF] font-extrabold"
            data-testid="home-all-preview-games"
          >
            Explore all games
            <ArrowRight className="w-4 h-4" />
          </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibleGames.map(game => <GameCoverCard key={game.id} game={game} state={levelState(progress, game.id)} testId={`home-preview-game-${game.id}`} cover={coverOf(game)} />)}
        </div>
      </div>
    </section>
  );
}
