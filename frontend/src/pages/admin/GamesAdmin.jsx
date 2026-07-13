import { useEffect, useState } from 'react';
import { gamesAPI, adminAPI } from '../../lib/api';
import { Gamepad2, Users, Trophy, Zap, Sparkles, Grid3x3, Brain, Target, Type, Puzzle, Play, X, PauseCircle, PlayCircle } from 'lucide-react';
import { GAME_MAP } from '../../components/games';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

const ICONS = {
  memory_match: Brain, number_sequence: Grid3x3, target_tap: Target, word_unscramble: Type,
  emoji_riddle: Sparkles, jigsaw_3x3: Puzzle, jigsaw_4x4: Puzzle, slider_puzzle: Grid3x3,
  math_sprint: Brain, reaction_time: Zap, trivia_quiz: Sparkles, simon_says: Brain,
  whack_a_mole: Target, odd_one_out: Puzzle, color_match: Sparkles, pattern_repeat: Grid3x3,
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
};

export default function GamesAdmin() {
  const [games, setGames] = useState([]);
  const [contests, setContests] = useState([]);
  const [testing, setTesting] = useState(null);
  const [testKey, setTestKey] = useState(0);
  const [testResult, setTestResult] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { toast } = useToast();

  const loadContests = () => adminAPI.contests().then(setContests).catch(() => {});
  useEffect(() => {
    gamesAPI.types().then(r => setGames(r?.games || [])).catch(() => {});
    loadContests();
  }, []);

  const usageCount = (gameId) => contests.filter(c => c.game_type === gameId).length;
  const totalAssigned = contests.filter(c => c.game_type).length;
  const liveGames = contests.filter(c => c.game_type && c.status === 'live').length;
  const heldGames = contests.filter(c => c.game_type && c.status === 'draft').length;

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

      {/* Bulk actions bar */}
      <div className="bg-gradient-to-r from-slate-900 via-fuchsia-900 to-orange-800 text-white rounded-2xl p-5 flex flex-wrap gap-4 items-center justify-between" data-testid="bulk-actions-bar">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/70">Bulk actions — all game-enabled contests</div>
          <div className="font-display text-xl font-extrabold mt-1">
            {liveGames} live · {heldGames} on hold · {totalAssigned} total
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => doBulk('launch')}
            disabled={bulkBusy || heldGames === 0}
            data-testid="bulk-launch-btn"
            className="bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40"
          >
            <PlayCircle className="w-4 h-4 mr-2" /> Launch all games {heldGames > 0 && `(${heldGames})`}
          </Button>
          <Button
            onClick={() => doBulk('pause')}
            disabled={bulkBusy || liveGames === 0}
            data-testid="bulk-pause-btn"
            variant="outline"
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white disabled:opacity-40"
          >
            <PauseCircle className="w-4 h-4 mr-2" /> Hold all games {liveGames > 0 && `(${liveGames})`}
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
