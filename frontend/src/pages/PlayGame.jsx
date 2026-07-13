import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { GAME_MAP } from '../components/games';
import { gamesAPI, contestsAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { Trophy, ArrowLeft, RotateCcw, ArrowRight } from 'lucide-react';

export default function PlayGame() {
  const { contestId, ticketId } = useParams();
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [contest, setContest] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lastScore, setLastScore] = useState(null);
  const [key, setKey] = useState(0); // remount game

  useEffect(() => {
    if (loading) return undefined;
    if (!user) { nav('/login', { replace: true }); return undefined; }
    // Look up contest (we have contest_id, fetch via public list then filter)
    contestsAPI.list().then(list => {
      const c = list.find(x => x.contest_id === contestId);
      setContest(c || null);
    }).catch(() => {});
    gamesAPI.myAttempts(ticketId).then(r => setAttempts(r?.attempts || [])).catch(() => {});
    return undefined;
  }, [user, loading, contestId, ticketId, nav]);

  const submit = async (result) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await gamesAPI.submit({
        ticket_id: ticketId,
        duration_ms: Math.round(result.duration_ms),
        accuracy: result.accuracy,
        solved: result.solved,
      });
      setLastScore(r);
      const fresh = await gamesAPI.myAttempts(ticketId);
      setAttempts(fresh?.attempts || []);
      toast({
        title: `Score: ${r.points} points 🎯`,
        description: r.attempts_left > 0 ? `${r.attempts_left} attempts remaining` : 'No more attempts on this ticket.',
      });
    } catch (err) {
      toast({ title: 'Submit failed', description: err?.response?.data?.detail });
    } finally { setBusy(false); }
  };

  if (loading || !user) return <div className="p-10 text-center text-slate-500">Loading…</div>;
  if (!contest) return <div className="p-10 text-center text-slate-500">Contest not found. <Link to="/competitions" className="text-orange-600">Browse competitions →</Link></div>;

  const gameType = contest.game_type;
  const renderGame = gameType && GAME_MAP[gameType];
  const attemptsLeft = 3 - attempts.length;
  const bestScore = attempts.reduce((max, a) => Math.max(max, a.points), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8" data-testid="play-game-page">
      <div className="flex items-center justify-between mb-6">
        <Link to="/my-account?tab=tickets" className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back to my tickets</Link>
        <Link to={`/leaderboard/${contestId}`} className="text-sm text-orange-600 font-semibold inline-flex items-center gap-1">View leaderboard <ArrowRight className="w-4 h-4" /></Link>
      </div>

      <div className="bg-gradient-to-br from-slate-900 via-indigo-900 to-fuchsia-900 text-white rounded-3xl p-6 mb-6 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative">
          <div className="text-white/80 text-xs uppercase tracking-widest">Now playing</div>
          <h1 className="font-display text-3xl font-extrabold">{contest.title}</h1>
          <div className="mt-2 text-white/80 text-sm">
            Ticket #{ticketId.slice(-6)} · Attempts left: <b>{attemptsLeft}/3</b> · Your best: <b>{bestScore}</b> pts
          </div>
        </div>
      </div>

      {!gameType ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
          <Trophy className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <div className="font-display font-bold text-xl">No game for this contest</div>
          <p className="text-slate-500 mt-2">The winner will be picked by the Prize League team using our audited random-draw process.</p>
          <Link to="/my-account?tab=tickets"><Button className="mt-4">Back to my tickets</Button></Link>
        </div>
      ) : attemptsLeft <= 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center" data-testid="game-no-attempts">
          <Trophy className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <div className="font-display font-bold text-xl">Attempts used up</div>
          <p className="text-slate-500 mt-2">You&apos;ve used all 3 attempts. Your best score of <b className="text-orange-600">{bestScore}</b> pts is on the leaderboard.</p>
          <Link to={`/leaderboard/${contestId}`}><Button className="mt-4 bg-orange-500 hover:bg-orange-600">View leaderboard</Button></Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-6" data-testid="game-arena">
          {lastScore ? (
            <div className="text-center py-4">
              <div className="font-display text-3xl font-extrabold text-orange-600">{lastScore.points} pts!</div>
              <div className="text-sm text-slate-500 mt-1">Attempts left: {lastScore.attempts_left}</div>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  onClick={() => { setLastScore(null); setKey(k => k + 1); }}
                  data-testid="play-again"
                  className="bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white"
                >
                  <RotateCcw className="w-4 h-4 mr-1" /> Try again
                </Button>
                <Link to={`/leaderboard/${contestId}`}><Button variant="outline">View leaderboard</Button></Link>
              </div>
            </div>
          ) : (
            <div key={key}>{renderGame(contest.game_config || {}, submit)}</div>
          )}
        </div>
      )}

      {attempts.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-slate-100 p-6">
          <div className="font-display font-bold mb-3">Your attempts</div>
          <ul className="divide-y divide-slate-100 text-sm">
            {attempts.map((a, i) => (
              <li key={a.score_id} className="py-2 flex items-center justify-between">
                <span>Attempt #{i + 1}</span>
                <span className="text-slate-500">{(a.duration_ms / 1000).toFixed(1)}s · {Math.round(a.accuracy * 100)}% accuracy</span>
                <span className="font-bold text-orange-600">{a.points} pts</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
