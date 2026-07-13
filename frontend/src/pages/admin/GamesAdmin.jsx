import { useEffect, useState } from 'react';
import { gamesAPI, adminAPI } from '../../lib/api';
import { Gamepad2, Users, Trophy, Zap, Sparkles, Grid3x3, Brain, Target, Type, Puzzle } from 'lucide-react';

const ICONS = {
  memory_match: Brain,
  number_sequence: Grid3x3,
  target_tap: Target,
  word_unscramble: Type,
  emoji_riddle: Sparkles,
  jigsaw_3x3: Puzzle,
  jigsaw_4x4: Puzzle,
  slider_puzzle: Grid3x3,
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
};

export default function GamesAdmin() {
  const [games, setGames] = useState([]);
  const [contests, setContests] = useState([]);

  useEffect(() => {
    gamesAPI.types().then(r => setGames(r?.games || [])).catch(() => {});
    adminAPI.contests().then(setContests).catch(() => {});
  }, []);

  const usageCount = (gameId) => contests.filter(c => c.game_type === gameId).length;
  const totalAssigned = contests.filter(c => c.game_type).length;

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
            </div>
          );
        })}
      </div>

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
