import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Gamepad2, Play, ShieldCheck } from 'lucide-react';

import { gamesAPI, api } from '../lib/api';
import { GAME_MAP } from '../components/games';
import { resolveMediaUrl } from '../lib/media';

export default function GameArena() {
  const [settings, setSettings] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/settings').then(r => r.data),
      gamesAPI.types(),
    ])
      .then(([publicSettings, gameResponse]) => {
        setSettings(publicSettings || {});
        setGames(gameResponse?.games || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedGames = useMemo(() => {
    const selected = Array.isArray(settings?.game_preview_games)
      ? settings.game_preview_games
      : [];

    return games.filter(
      game => selected.includes(game.id) && GAME_MAP[game.id]
    );
  }, [games, settings]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-500">
        Loading games…
      </div>
    );
  }

  if (!settings?.game_preview_enabled) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <section className="bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-950 text-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#FFD54A] font-extrabold">
              <Gamepad2 className="w-4 h-4" />
              Prize League Game Arena
            </div>

            <h1 className="font-display text-4xl md:text-6xl font-black mt-3 leading-tight">
              Try the game. Then compete for real.
            </h1>

            <p className="text-white/70 mt-4 text-base md:text-lg max-w-2xl">
              Play selected skill games free before creating an account.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-4 py-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              No login · No ticket · No official score
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10 md:py-14">
        {selectedGames.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
            No preview games are currently available.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {selectedGames.map(game => {
              const image = settings?.game_preview_images?.[game.id];

              return (
                <Link
                  key={game.id}
                  to={`/games/${game.id}`}
                  className="group bg-white border border-slate-100 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition"
                  data-testid={`public-game-${game.id}`}
                >
                  <div className="aspect-[16/9] bg-slate-100 overflow-hidden">
                    {image ? (
                      <img
                        src={resolveMediaUrl(image)}
                        alt={game.label}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#6C2BFF] to-fuchsia-700 text-white">
                        <Gamepad2 className="w-14 h-14" />
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <h2 className="font-display font-extrabold text-xl text-slate-900">
                      {game.label}
                    </h2>

                    <div className="mt-2 text-sm text-slate-500 capitalize">
                      {game.category} · Target {game.target_time_s}s
                    </div>

                    <div className="mt-5 inline-flex items-center gap-1 text-[#6C2BFF] font-bold text-sm">
                      <Play className="w-4 h-4" />
                      Play Free
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
