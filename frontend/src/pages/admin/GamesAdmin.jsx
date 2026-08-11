import { useEffect, useState } from 'react';
import { gamesAPI, adminAPI, uploadsAPI } from '../../lib/api';
import { Gamepad2, Users, Trophy, Zap, Sparkles, Grid3x3, Brain, Target, Type, Puzzle, Play, X, PauseCircle, PlayCircle, Crown, Compass, Bomb, Calculator, Hash, LayoutGrid, Lock, Route } from 'lucide-react';
import { GAME_MAP } from '../../components/games';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

const ICONS = {
  memory_match: Brain, number_sequence: Grid3x3, target_tap: Target, word_unscramble: Type,
  emoji_riddle: Sparkles, jigsaw_3x3: Puzzle, jigsaw_4x4: Puzzle, slider_puzzle: Grid3x3,
  math_sprint: Brain, reaction_time: Zap, trivia_quiz: Sparkles, simon_says: Brain,
  whack_a_mole: Target, odd_one_out: Puzzle, color_match: Sparkles, pattern_repeat: Grid3x3,
  // Vol.2
  sudoku_mini: Hash, sequence_predict: Sparkles, countdown_numbers: Calculator,
  word_ladder: Type, chess_mate_in_one: Crown, tower_of_hanoi: LayoutGrid,
  lights_out: Zap, minesweeper_mini: Bomb, nonogram_mini: Grid3x3,
  tf2048_mini: LayoutGrid, cryptogram: Lock, anagram_finder: Type,
  maze_solver: Route, spot_pattern: Compass,
};

const DESC = {
  memory_match: 'Find all 8 matching pairs. Fewer moves = higher score.',
  number_sequence: 'Tap numbers 1 → 20 as fast as you can, no misses.',
  target_tap: 'Hit the moving bullseye 15 times. Avoid misses.',
  word_unscramble: 'Unscramble a hidden word. Speed + first-try = max points.',
  emoji_riddle: 'Guess what the emojis mean. Higher points for first try.',
  jigsaw_3x3: '9-tile image jigsaw. Rearrange tiles to reveal the picture.',
  jigsaw_4x4: '16-tile image jigsaw. Harder — twice the pieces.',
  slider_puzzle: 'Classic 15-slider. Arrange numbers 1→15 in order.',
  math_sprint: 'Solve 10 arithmetic problems as fast as you can.',
  reaction_time: 'Tap when the screen turns green — 5 rounds.',
  trivia_quiz: '10 general-knowledge questions, multiple choice.',
  simon_says: 'Repeat the flashing colour sequence — 5 levels.',
  whack_a_mole: 'Whack 10 moles as they pop up on a 3×3 grid.',
  odd_one_out: 'Find the different-shaded circle in a 3×3 grid — 5 rounds.',
  color_match: 'Stroop test — pick the colour of the text, not the word.',
  pattern_repeat: 'Watch and repeat number patterns of increasing length.',
  // Vol.2
  sudoku_mini: '4×4 sudoku with 2×2 boxes. Fill every row, column & box with 1-4.',
  sequence_predict: 'Given 4 numbers, predict what comes next. 5 rounds.',
  countdown_numbers: 'Reach a target number using 4 given digits and + − × ( ).',
  word_ladder: 'Change one letter at a time to transform the start word into the target.',
  chess_mate_in_one: 'A real chess tactical position — find the mating move.',
  tower_of_hanoi: 'Move all 3 disks to the right peg. Bigger cannot sit on smaller (min 7 moves).',
  lights_out: 'Click a cell to toggle it and its 4 neighbours. Goal: turn every light OFF.',
  minesweeper_mini: '5×5 minesweeper with 4 mines. Reveal all safe cells without exploding.',
  nonogram_mini: 'Picross-style logic — fill cells so every row/column matches its numbers.',
  tf2048_mini: 'A compact 2048 on 3×3 board. Merge tiles to reach the 32 tile.',
  cryptogram: 'Every letter has been swapped for another. Decode the hidden phrase.',
  anagram_finder: 'Given 6 letters, find at least 4 valid English words.',
  maze_solver: 'Navigate a randomly-generated 7×7 maze. Fewer steps = higher score.',
  spot_pattern: 'Raven-style abstract reasoning — pick the shape that breaks the pattern.',
};

export default function GamesAdmin() {
  const [games, setGames] = useState([]);
  const [contests, setContests] = useState([]);
  const [testing, setTesting] = useState(null);
  const [testKey, setTestKey] = useState(0);
  const [testResult, setTestResult] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Public game-preview marketing controls.
  // These settings do not affect official contest games.
  const [previewSettings, setPreviewSettings] = useState({
    game_preview_enabled: false,
    game_preview_home_enabled: false,
    game_preview_home_count: 4,
    game_preview_games: [],
    game_preview_images: {},
  });
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewSaving, setPreviewSaving] = useState(false);

  const { toast } = useToast();

  const loadContests = () => adminAPI.contests().then(setContests).catch(() => {});
  useEffect(() => {
    gamesAPI.types().then(r => setGames(r?.games || [])).catch(() => {});
    loadContests();

    adminAPI.getSettings()
      .then((settings) => {
        setPreviewSettings({
          game_preview_enabled: Boolean(settings?.game_preview_enabled),
          game_preview_home_enabled: Boolean(settings?.game_preview_home_enabled),
          game_preview_home_count: Math.max(
            1,
            Math.min(12, Number(settings?.game_preview_home_count) || 4)
          ),
          game_preview_games: Array.isArray(settings?.game_preview_games)
            ? settings.game_preview_games
            : [],
          game_preview_images:
            settings?.game_preview_images &&
            typeof settings.game_preview_images === 'object'
              ? settings.game_preview_images
              : {},
        });
      })
      .catch(() => {
        toast({
          title: 'Could not load game preview settings',
          description: 'Existing contest games are unaffected.',
        });
      })
      .finally(() => setPreviewLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const usageCount = (gameId) => contests.filter(c => c.game_type === gameId).length;
  const totalAssigned = contests.filter(c => c.game_type).length;
  const liveGames = contests.filter(c => c.game_type && c.status === 'live').length;
  const heldGames = contests.filter(c => c.game_type && c.status === 'draft').length;

  const togglePreviewGame = (gameId) => {
    setPreviewSettings((current) => {
      const selected = Array.isArray(current.game_preview_games)
        ? current.game_preview_games
        : [];

      const exists = selected.includes(gameId);

      return {
        ...current,
        game_preview_games: exists
          ? selected.filter((id) => id !== gameId)
          : [...selected, gameId],
      };
    });
  };

  const uploadPreviewImage = async (gameId, file) => {
    if (!file) return;

    try {
      const uploaded = await uploadsAPI.image(file);

      setPreviewSettings((current) => ({
        ...current,
        game_preview_images: {
          ...(current.game_preview_images || {}),
          [gameId]: uploaded?.url || '',
        },
      }));

      toast({
        title: 'Promotion image uploaded',
        description: 'Click Save Preview Settings to publish this image.',
      });
    } catch (e) {
      toast({
        title: 'Image upload failed',
        description:
          e?.response?.data?.detail ||
          'Could not upload the game promotion image.',
      });
    }
  };

  const savePreviewSettings = async () => {
    setPreviewSaving(true);

    try {
      const saved = await adminAPI.updateSettings({
        game_preview_enabled: Boolean(
          previewSettings.game_preview_enabled
        ),
        game_preview_home_enabled: Boolean(
          previewSettings.game_preview_home_enabled
        ),
        game_preview_home_count: Math.max(
          1,
          Math.min(
            12,
            Number(previewSettings.game_preview_home_count) || 4
          )
        ),
        game_preview_games: previewSettings.game_preview_games || [],
        game_preview_images: previewSettings.game_preview_images || {},
      });

      setPreviewSettings((current) => ({
        ...current,
        game_preview_enabled: Boolean(saved?.game_preview_enabled),
        game_preview_home_enabled: Boolean(
          saved?.game_preview_home_enabled
        ),
        game_preview_home_count:
          Number(saved?.game_preview_home_count) || 4,
        game_preview_games: Array.isArray(saved?.game_preview_games)
          ? saved.game_preview_games
          : [],
        game_preview_images:
          saved?.game_preview_images &&
          typeof saved.game_preview_images === 'object'
            ? saved.game_preview_images
            : {},
      }));

      toast({
        title: 'Game preview settings saved',
        description: saved?.game_preview_enabled
          ? 'Public previews are enabled in configuration.'
          : 'Public previews are switched off.',
      });
    } catch (e) {
      toast({
        title: 'Could not save game preview settings',
        description:
          e?.response?.data?.detail ||
          'No existing contest or game settings were changed.',
      });
    } finally {
      setPreviewSaving(false);
    }
  };

  const doBulk = async (action) => {
    setBulkBusy(true);
    try {
      const r = action === 'launch'
        ? await adminAPI.bulkLaunch({ only_games: true, status_from: 'draft' })
        : await adminAPI.bulkPause({ only_games: true, status_from: 'live' });
      toast({ title: action === 'launch' ? 'All game contests launched' : 'All game contests held', description: `${r.updated} contest${r.updated !== 1 ? 's' : ''} updated` });
      loadContests();
    } catch (e) {
      toast({ title: 'Bulk action failed', description: e?.response?.data?.detail || 'Try again' });
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-games-page">
      <div>
        <h2 className="font-display text-2xl font-extrabold flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-orange-600" /> Skill games library
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Each contest can optionally be tied to one of these games. Players who buy a ticket play the assigned
          game (3 attempts) and the highest score wins. To assign a game, edit a contest and pick from the
          &ldquo;Skill game&rdquo; dropdown.
        </p>
      </div>

      {/* Public game-preview marketing controls.
          Completely separate from official contest game execution. */}
      <div
        className="bg-white border-2 border-[#6C2BFF]/15 rounded-2xl p-5 md:p-6 shadow-sm"
        data-testid="game-preview-admin-panel"
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest font-bold text-[#6C2BFF]">
              Public Game Preview
            </div>

            <h3 className="font-display text-xl md:text-2xl font-extrabold text-slate-900 mt-1">
              Marketing Game Arena
            </h3>

            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              Choose which existing skill games can be shown as free public
              previews. Preview plays never consume tickets, deduct wallet
              tokens, submit official scores or affect leaderboards.
            </p>
          </div>

          <div
            className={`px-3 py-1.5 rounded-full text-xs font-extrabold ${
              previewSettings.game_preview_enabled
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {previewSettings.game_preview_enabled ? 'PUBLIC ON' : 'PUBLIC OFF'}
          </div>
        </div>

        {previewLoading ? (
          <div className="py-8 text-sm text-slate-500">
            Loading preview settings…
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-4 mt-6">
              <label className="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-900">
                    Public Game Preview
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Master ON/OFF switch
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={previewSettings.game_preview_enabled}
                  onChange={(e) =>
                    setPreviewSettings((current) => ({
                      ...current,
                      game_preview_enabled: e.target.checked,
                    }))
                  }
                  className="w-5 h-5 accent-[#6C2BFF]"
                  data-testid="game-preview-master-toggle"
                />
              </label>

              <label className="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-900">
                    Homepage Section
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Show selected previews on Home
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={previewSettings.game_preview_home_enabled}
                  onChange={(e) =>
                    setPreviewSettings((current) => ({
                      ...current,
                      game_preview_home_enabled: e.target.checked,
                    }))
                  }
                  disabled={!previewSettings.game_preview_enabled}
                  className="w-5 h-5 accent-[#6C2BFF] disabled:opacity-40"
                  data-testid="game-preview-home-toggle"
                />
              </label>

              <label className="rounded-xl border border-slate-200 p-4">
                <div className="font-bold text-slate-900">
                  Homepage Games
                </div>
                <div className="text-xs text-slate-500 mt-1 mb-2">
                  Number displayed
                </div>

                <select
                  value={previewSettings.game_preview_home_count}
                  onChange={(e) =>
                    setPreviewSettings((current) => ({
                      ...current,
                      game_preview_home_count: Number(e.target.value),
                    }))
                  }
                  disabled={!previewSettings.game_preview_enabled}
                  className="w-full h-10 border border-slate-200 rounded-lg px-3 bg-white text-sm disabled:opacity-40"
                  data-testid="game-preview-home-count"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="font-bold text-slate-900">
                    Games available for public preview
                  </div>
                  <div className="text-xs text-slate-500">
                    Select as many games as you want. Homepage count only controls how many appear on Home; the full Game Arena can show all selected games.
                  </div>
                </div>

                <div className="text-xs font-semibold text-slate-500">
                  {(previewSettings.game_preview_games || []).length} selected
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {games.map((game) => {
                  const selected = (
                    previewSettings.game_preview_games || []
                  ).includes(game.id);

                  const available = Boolean(GAME_MAP[game.id]);

                  return (
                    <div
                      key={game.id}
                      data-testid={`preview-select-${game.id}`}
                      className={`rounded-xl border p-3 transition ${
                        selected
                          ? 'border-[#6C2BFF] bg-[#6C2BFF]/5'
                          : 'border-slate-200 bg-white'
                      } ${
                        !available ? 'opacity-40' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-900">
                            {game.label}
                          </div>

                          <div className="text-[11px] text-slate-500 mt-1 capitalize">
                            {game.category} · Target {game.target_time_s}s
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!available}
                          onClick={() => togglePreviewGame(game.id)}
                          className={`shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center text-sm font-black transition ${
                            selected
                              ? 'bg-[#6C2BFF] border-[#6C2BFF] text-white'
                              : 'border-slate-300 bg-white text-transparent hover:border-[#6C2BFF]'
                          }`}
                          aria-label={
                            selected
                              ? `Remove ${game.label} from public preview`
                              : `Add ${game.label} to public preview`
                          }
                        >
                          ✓
                        </button>
                      </div>

                      {selected && (
                        <div className="mt-3">
                          {(previewSettings.game_preview_images || {})[game.id] ? (
                            <img
                              src={(previewSettings.game_preview_images || {})[game.id]}
                              alt={`${game.label} promotion`}
                              className="w-full aspect-[16/9] rounded-lg object-cover border border-slate-200 mb-2"
                            />
                          ) : (
                            <div className="mb-2 aspect-[16/9] rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-center px-3">
                              <span className="text-xs font-bold text-slate-500">
                                Promotion Image
                              </span>
                              <span className="text-[10px] text-slate-400 mt-1">
                                JPG, PNG or WEBP
                              </span>
                            </div>
                          )}

                          <label className="inline-flex items-center justify-center w-full h-10 rounded-lg border border-[#6C2BFF]/30 bg-[#6C2BFF]/5 text-xs font-extrabold text-[#6C2BFF] cursor-pointer hover:bg-[#6C2BFF]/10">
                            {(previewSettings.game_preview_images || {})[game.id]
                              ? 'Replace Promotion Image'
                              : 'Upload Promotion Image'}

                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];

                                if (file) {
                                  uploadPreviewImage(game.id, file);
                                }

                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      )}

                      {!available && (
                        <div className="text-[10px] text-rose-500 mt-2">
                          Frontend game component unavailable
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <p className="text-xs text-slate-500 max-w-2xl">
                Turning the master switch OFF hides the public preview feature.
                Official contest games and existing player tickets continue
                normally.
              </p>

              <Button
                type="button"
                onClick={savePreviewSettings}
                disabled={previewSaving}
                className="pl-btn-purple text-white font-extrabold min-w-[160px]"
                data-testid="save-game-preview-settings"
              >
                {previewSaving ? 'Saving…' : 'Save Preview Settings'}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Bulk actions bar */}
      <div className="bg-gradient-to-r from-slate-900 via-fuchsia-900 to-orange-800 text-white rounded-2xl p-4 md:p-5 flex flex-col md:flex-row gap-3 md:gap-4 md:items-center md:justify-between" data-testid="bulk-actions-bar">
        <div>
          <div className="text-[10px] md:text-xs uppercase tracking-widest text-white/70">Bulk actions — all game-enabled contests</div>
          <div className="font-display text-lg md:text-xl font-extrabold mt-1">
            {liveGames} live · {heldGames} on hold · {totalAssigned} total
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => doBulk('launch')}
            disabled={bulkBusy || heldGames === 0}
            data-testid="bulk-launch-btn"
            className="bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40 flex-1 md:flex-none"
          >
            <PlayCircle className="w-4 h-4 mr-2" /> Launch all {heldGames > 0 && `(${heldGames})`}
          </Button>
          <Button
            onClick={() => doBulk('pause')}
            disabled={bulkBusy || liveGames === 0}
            data-testid="bulk-pause-btn"
            variant="outline"
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white disabled:opacity-40 flex-1 md:flex-none"
          >
            <PauseCircle className="w-4 h-4 mr-2" /> Hold all {liveGames > 0 && `(${liveGames})`}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Games available', value: games.length, color: 'from-orange-500 to-rose-500', Icon: Gamepad2 },
          { label: 'Contests with a game', value: totalAssigned, color: 'from-fuchsia-500 to-pink-500', Icon: Zap },
          { label: 'Manual-draw contests', value: contests.length - totalAssigned, color: 'from-indigo-500 to-purple-600', Icon: Trophy },
          { label: 'Max attempts / ticket', value: 3, color: 'from-amber-500 to-orange-500', Icon: Users },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-5 text-white bg-gradient-to-br ${s.color} shadow-lg`}>
            <s.Icon className="w-6 h-6 opacity-80" />
            <div className="mt-3 text-2xl font-extrabold font-display">{s.value}</div>
            <div className="text-xs opacity-90">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map(g => {
          const Icon = ICONS[g.id] || Gamepad2;
          const count = usageCount(g.id);
          return (
            <div key={g.id} data-testid={`game-card-${g.id}`} className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-lg transition">
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 flex items-center justify-center text-white shadow-md">
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${count > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {count > 0 ? `${count} contest${count > 1 ? 's' : ''}` : 'Not in use'}
                </span>
              </div>
              <div className="font-display font-bold text-slate-900">{g.label}</div>
              <div className="text-sm text-slate-500 mt-1">{DESC[g.id] || 'Skill-based mini-game.'}</div>
              <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                <span>⏱ Target: <b>{g.target_time_s}s</b></span>
                <span>·</span>
                <span>🔁 Attempts: <b>{g.max_attempts}</b></span>
                <span>·</span>
                <span className="capitalize">🎯 {g.category}</span>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <Button
                  onClick={() => { setTesting(g); setTestResult(null); setTestKey(k => k + 1); }}
                  data-testid={`test-game-${g.id}`}
                  size="sm"
                  className="w-full bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white"
                >
                  <Play className="w-3.5 h-3.5 mr-1" /> Test game
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Test-play modal */}
      {testing && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="test-game-modal">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-orange-600 font-bold">Test mode — no score saved</div>
                <h3 className="font-display font-bold text-xl">{testing.label}</h3>
              </div>
              <button onClick={() => setTesting(null)} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">
                <X className="w-6 h-6" />
              </button>
            </div>
            {testResult ? (
              <div className="text-center py-8">
                <div className="text-slate-500 text-sm">Test complete!</div>
                <div className="font-display text-4xl font-extrabold text-orange-600 mt-2">
                  {(testResult.duration_ms / 1000).toFixed(1)}s
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  {Math.round(testResult.accuracy * 100)}% accuracy · {testResult.solved ? '✅ solved' : '⚠️ not fully solved'}
                </div>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button onClick={() => { setTestResult(null); setTestKey(k => k + 1); }} className="bg-orange-500 hover:bg-orange-600 text-white">Play again</Button>
                  <Button onClick={() => setTesting(null)} variant="outline">Close</Button>
                </div>
              </div>
            ) : (
              <div key={testKey}>
                {GAME_MAP[testing.id]
                  ? GAME_MAP[testing.id]({}, setTestResult)
                  : <div className="text-center text-slate-500 py-8">This game type is registered on the server but has no frontend component yet.</div>
                }
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-200 text-sm">
        <div className="font-display font-bold text-white mb-2">How to assign a game to a contest</div>
        <ol className="list-decimal ml-5 space-y-1">
          <li>Go to <a href="/admin/competitions" className="text-orange-400 hover:underline">Contests</a> and click a contest&apos;s <b>Edit</b> button (or <b>+ New contest</b>).</li>
          <li>Scroll to <b>&ldquo;Skill game (played after ticket purchase)&rdquo;</b> and pick from the dropdown.</li>
          <li>Leave it as <em>&ldquo;None (winner picked manually)&rdquo;</em> if you want to draw the winner yourself.</li>
          <li>Save. Players who buy a ticket will play the game at <code className="bg-slate-800 px-1 rounded">/play/&lt;contest_id&gt;/&lt;ticket_id&gt;</code>.</li>
        </ol>
      </div>
    </div>
  );
}
