import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  Trophy,
} from 'lucide-react';

import { api, gamesAPI } from '../lib/api';
import { GAME_MAP } from '../components/games';
import { Button } from '../components/ui/button';
import { resolveMediaUrl } from '../lib/media';

export default function GamePreview() {
  const { gameId } = useParams();

  const [settings, setSettings] = useState(null);
  const [games, setGames] = useState([]);
  const [result, setResult] = useState(null);
  const [gameKey, setGameKey] = useState(0);
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

  const game = useMemo(
    () => games.find(item => item.id === gameId),
    [games, gameId]
  );

  const selected = Array.isArray(settings?.game_preview_games)
    ? settings.game_preview_games.includes(gameId)
    : false;

  const renderGame = GAME_MAP[gameId];

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-slate-500">
        Loading game…
      </div>
    );
  }

  if (!settings?.game_preview_enabled) {
    return <Navigate to="/" replace />;
  }

  if (!selected || !game || !renderGame) {
    return <Navigate to="/games" replace />;
  }

  const promotionImage = settings?.game_preview_images?.[gameId];

  // Preview marketing flow:
  // play free -> signup -> browse real competitions.
  const signupUrl =
    '/login?tab=signup&next=' + encodeURIComponent('/competitions');

  const playAgain = () => {
    setResult(null);
    setGameKey(value => value + 1);
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 md:py-12">
        <Link
          to="/games"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          All games
        </Link>

        <div className="mt-5 overflow-hidden rounded-3xl bg-slate-950 text-white">
          {promotionImage && (
            <div className="aspect-[16/6] overflow-hidden">
              <img
                src={resolveMediaUrl(promotionImage)}
                alt={game.label}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-6 md:p-8">
            <div className="text-xs uppercase tracking-[0.2em] text-[#FFD54A] font-bold">
              Free Skill Game
            </div>

            <h1 className="font-display text-3xl md:text-4xl font-black mt-2">
              {game.label}
            </h1>

            <p className="text-white/65 mt-2 text-sm">
              Test your skill before joining Prize League.
            </p>

            <div className="mt-4 inline-flex items-center gap-2 text-xs bg-white/10 border border-white/10 rounded-full px-3 py-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Free play · No ticket · No official leaderboard score
            </div>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-2xl border border-slate-100 p-5 md:p-7">
          {!result ? (
            <div key={gameKey}>
              {renderGame(
                {
                  practice_mode: true,
                  public_preview: true,
                },
                setResult
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <Trophy className="w-14 h-14 text-amber-500 mx-auto" />

              <div className="font-display text-3xl font-black text-slate-900 mt-4">
                Great attempt
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-6 max-w-2xl mx-auto">
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-400">
                    Time
                  </div>
                  <div className="font-bold mt-1">
                    {(Number(result.duration_ms || 0) / 1000).toFixed(2)}s
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-400">
                    Accuracy
                  </div>
                  <div className="font-bold mt-1">
                    {(Number(result.accuracy || 0) * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-400">
                    Result
                  </div>
                  <div className="font-bold mt-1">
                    {result.solved ? 'Completed' : 'Finished'}
                  </div>
                </div>
              </div>

              <div className="mt-7 rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-950 text-white p-6 max-w-2xl mx-auto">
                <div className="text-xs uppercase tracking-widest text-[#FFD54A] font-bold">
                  Ready for the real challenge?
                </div>

                <h2 className="font-display text-2xl md:text-3xl font-black mt-2">
                  Create your account and compete for real prizes
                </h2>

                <p className="text-white/65 text-sm mt-2">
                  Join Prize League to enter live skill competitions and put
                  your skills to the test.
                </p>

                <Link to={signupUrl}>
                  <Button
                    className="mt-5 w-full h-12 pl-btn-gold text-slate-900 font-extrabold"
                    data-testid="preview-signup-compete"
                  >
                    Create Account & Compete
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={playAgain}
                className="mt-4"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Play Again
              </Button>

              <p className="text-xs text-slate-400 mt-4">
                This free result is not submitted to an official Prize League
                leaderboard.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
