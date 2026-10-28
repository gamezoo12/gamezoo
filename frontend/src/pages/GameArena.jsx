import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Gamepad2, Play, ShieldCheck, X } from 'lucide-react';
import { MazeEscapePractice, BallSortPractice, HanoiPractice } from '../components/games/universal/PracticePuzzles';
import { LiquidSortPractice, SpotDifferencePractice, PathConnectPractice } from '../components/games/universal/MorePracticePuzzles';

import { gamesAPI, api } from '../lib/api';
import { GAME_MAP } from '../components/games';
import { resolveMediaUrl } from '../lib/media';

const UNIVERSAL_PRACTICE_GAMES = [
  { id: 'maze_escape_practice', name: 'Maze Escape', description: 'Navigate a new maze and reach the exit.', icon: '🧭', component: MazeEscapePractice },
  { id: 'ball_sort_practice', name: 'Ball Sort', description: 'Sort the coloured balls into matching tubes.', icon: '🔴', component: BallSortPractice },
  { id: 'hanoi_practice', name: 'Tower of Hanoi', description: 'Move all discs to the final pole.', icon: '🏛️', component: HanoiPractice },
  { id: 'liquid_sort_practice', name: 'Liquid Sort & Fill', description: 'Pour coloured liquid into matching bottles.', icon: '🧪', component: LiquidSortPractice },
  { id: 'spot_difference_practice', name: 'Spot the Difference', description: 'Compare illustrated scenes and find the changes.', icon: '🔎', component: SpotDifferencePractice },
  { id: 'path_connect_practice', name: 'Path Connect', description: 'Connect coloured endpoints without crossing paths.', icon: '🌈', component: PathConnectPractice },
];
const PRACTICE_LEVELS = ['beginner', 'easy', 'medium', 'hard', 'expert'];

export default function GameArena() {
  const [settings, setSettings] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [practiceGame, setPracticeGame] = useState(null);
  const [practiceDifficulty, setPracticeDifficulty] = useState('easy');
  const [practiceKey, setPracticeKey] = useState(0);
  const [practiceResult, setPracticeResult] = useState(null);

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

      {/* New games are explicitly labelled local-only practice. No competition APIs are called. */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 pb-16" aria-labelledby="universal-practice-heading">
        <div className="mb-6">
          <span className="inline-block text-xs font-bold tracking-widest uppercase text-indigo-600">New · Practice prototypes</span>
          <h2 id="universal-practice-heading" className="text-3xl font-black text-slate-950 mt-1">Explore six new skill games</h2>
          <p className="text-slate-600 mt-2">Try the gameplay before these games are approved for official competitions. Practice results are not recorded.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {UNIVERSAL_PRACTICE_GAMES.map(game => (
            <button key={game.id} type="button" onClick={() => { setPracticeGame(game.id); setPracticeDifficulty('easy'); setPracticeResult(null); setPracticeKey(k => k + 1); }}
              className="text-left rounded-3xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              data-testid={`practice-card-${game.id}`}>
              <div className="h-36 flex items-center justify-center text-6xl bg-gradient-to-br from-indigo-900 via-violet-700 to-fuchsia-600" aria-hidden="true">{game.icon}</div>
              <div className="p-5"><h3 className="font-black text-xl text-slate-950">{game.name}</h3><p className="text-slate-600 text-sm mt-2">{game.description}</p>
                <div className="flex items-center justify-between mt-4 text-indigo-700 font-bold text-sm"><span>Play practice</span><ArrowRight className="w-5 h-5" /></div>
              </div>
            </button>
          ))}
        </div>
        {practiceGame && (() => {
          const game = UNIVERSAL_PRACTICE_GAMES.find(g => g.id === practiceGame);
          if (!game) return null;
          const Component = game.component;
          return <div className="fixed inset-0 z-50 bg-slate-950/85 p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label={`Practice ${game.name}`}>
            <div className="max-w-2xl mx-auto bg-white rounded-3xl p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-5"><div><h3 className="text-xl font-black text-slate-900">{game.name}</h3><p className="text-xs text-slate-500">Isolated practice · Not a prize competition</p></div>
                <button type="button" className="rounded-xl bg-slate-100 p-3 text-slate-900" aria-label="Close practice" onClick={() => setPracticeGame(null)}><X className="w-5 h-5"/></button></div>
              <div className="flex flex-wrap gap-3 items-center mb-5">
                <label className="text-sm font-semibold text-slate-800" htmlFor="practice-difficulty">Difficulty</label>
                <select id="practice-difficulty" className="border rounded-xl px-3 py-2 text-slate-900" value={practiceDifficulty}
                  onChange={e => { setPracticeDifficulty(e.target.value); setPracticeResult(null); setPracticeKey(k => k + 1); }}>
                  {PRACTICE_LEVELS.map(level => <option value={level} key={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>)}
                </select>
                <button type="button" className="rounded-xl bg-indigo-100 px-4 py-2 text-indigo-800 font-bold" onClick={() => {setPracticeResult(null);setPracticeKey(k => k+1);}}>New puzzle</button>
              </div>
              <Component key={`${practiceGame}-${practiceDifficulty}-${practiceKey}`} difficulty={practiceDifficulty} onComplete={setPracticeResult}/>
              {practiceResult && <div className="mt-4 rounded-xl bg-emerald-50 text-emerald-900 p-4 font-semibold" role="status">Puzzle completed! {practiceResult.moves != null ? `${practiceResult.moves} moves · ` : ''}{(practiceResult.duration_ms / 1000).toFixed(1)} seconds. Practice only.</div>}
            </div>
          </div>;
        })()}
      </section>
    </div>
  );
}
