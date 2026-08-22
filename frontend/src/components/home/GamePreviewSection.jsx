import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Brain,
  Gamepad2,
  Play,
  Puzzle,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';

import { api, gamesAPI } from '../../lib/api';
import { GAME_MAP } from '../games';
import { resolveMediaUrl } from '../../lib/media';

const ICONS = {
  memory_match: Brain,
  number_sequence: Target,
  target_tap: Target,
  word_unscramble: Sparkles,
  emoji_riddle: Sparkles,
  jigsaw_3x3: Puzzle,
  jigsaw_4x4: Puzzle,
  slider_puzzle: Puzzle,
  math_sprint: Brain,
  reaction_time: Zap,
  trivia_quiz: Sparkles,
  simon_says: Brain,
  whack_a_mole: Target,
  odd_one_out: Puzzle,
  color_match: Sparkles,
  pattern_repeat: Brain,
  sudoku_mini: Puzzle,
  sequence_predict: Brain,
  countdown_numbers: Brain,
  word_ladder: Sparkles,
  chess_mate_in_one: Brain,
  tower_of_hanoi: Puzzle,
  lights_out: Puzzle,
  minesweeper_mini: Puzzle,
  nonogram_mini: Puzzle,
  tf2048_mini: Puzzle,
  cryptogram: Brain,
  anagram_finder: Sparkles,
  maze_solver: Puzzle,
  spot_pattern: Brain,
};

export default function GamePreviewSection({ mobile = false }) {
  const [settings, setSettings] = useState(null);
  const [games, setGames] = useState([]);

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

    return games
      .filter(game => selected.includes(game.id) && GAME_MAP[game.id])
      .slice(0, count);
  }, [games, settings]);

  // Critical feature-flag behaviour:
  // OFF means the current homepage remains unchanged.
  if (visibleGames.length === 0) {
    return null;
  }

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

          <Link
            to="/games"
            className="text-xs font-bold text-[#FFD54A] inline-flex items-center gap-1"
          >
            All Games
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <p className="text-xs text-white/60 mb-4">
          Practice selected games without using tickets or submitting an
          official score.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {visibleGames.map(game => {
            const Icon = ICONS[game.id] || Gamepad2;

            const image = settings?.game_preview_images?.[game.id];

            return (
              <Link
                key={game.id}
                to={`/games/${game.id}`}
                className="rounded-2xl bg-white/5 border border-white/10 p-4 hover:border-[#FFD54A]/40 transition"
                data-testid={`mobile-preview-game-${game.id}`}
              >
                {image ? (
                  <img
                    src={resolveMediaUrl(image)}
                    alt=""
                    className="w-full aspect-[16/9] rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#FFD54A] text-slate-950 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                )}

                <div className="font-display font-bold text-sm text-white mt-3 line-clamp-2">
                  {game.label}
                </div>

                <div className="text-[10px] text-white/50 mt-1 capitalize">
                  {game.category} · {game.target_time_s}s target
                </div>

                <div className="mt-3 text-xs font-extrabold text-[#FFD54A] inline-flex items-center gap-1">
                  <Play className="w-3 h-3" />
                  Play Free
                </div>
              </Link>
            );
          })}
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
              Practice selected Prize League skill games without logging in,
              using tickets or submitting an official leaderboard score.
            </p>
          </div>

          <Link
            to="/games"
            className="inline-flex items-center gap-2 text-[#6C2BFF] font-extrabold"
            data-testid="home-all-preview-games"
          >
            Explore all games
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibleGames.map(game => {
            const Icon = ICONS[game.id] || Gamepad2;

            const image = settings?.game_preview_images?.[game.id];

            return (
              <Link
                key={game.id}
                to={`/games/${game.id}`}
                className="group bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition"
                data-testid={`home-preview-game-${game.id}`}
              >
                {image ? (
                  <img
                    src={resolveMediaUrl(image)}
                    alt=""
                    className="w-full aspect-[16/9] rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6C2BFF] to-fuchsia-600 text-white flex items-center justify-center shadow-md">
                    <Icon className="w-6 h-6" />
                  </div>
                )}

                <div className="font-display font-extrabold text-lg text-slate-900 mt-4 line-clamp-2">
                  {game.label}
                </div>

                <div className="text-xs text-slate-500 mt-2 capitalize">
                  {game.category} · Target {game.target_time_s}s
                </div>

                <div className="mt-5 inline-flex items-center gap-1.5 text-[#6C2BFF] font-extrabold text-sm">
                  <Play className="w-4 h-4" />
                  Play Free
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
