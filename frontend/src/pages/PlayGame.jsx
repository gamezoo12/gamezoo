import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { GAME_MAP } from '../components/games';
import { gamesAPI, contestsAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import {
  Trophy,
  ArrowLeft,
  RotateCcw,
  ArrowRight,
  Play,
  Eye,
  Clock3,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import TurnstileGate from '../components/games/TurnstileGate';

const formatDuration = (milliseconds = 0) => {
  const safe = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const ms = safe % 1000;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};

export default function PlayGame() {
  const { contestId, ticketId } = useParams();
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  const [contest, setContest] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lastScore, setLastScore] = useState(null);
  const [gameKey, setGameKey] = useState(0);
  const [challengeToken, setChallengeToken] = useState(null);

  // intro | demo | ready | countdown | playing | result
  const [phase, setPhase] = useState('intro');
  const [demoCompleted, setDemoCompleted] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  const officialStartRef = useRef(null);
  const timerFrameRef = useRef(null);

  useEffect(() => {
    if (loading) return undefined;

    if (!user) {
      nav('/login', { replace: true });
      return undefined;
    }

    contestsAPI
      .list()
      .then((list) => {
        const current = list.find((item) => item.contest_id === contestId);
        setContest(current || null);
      })
      .catch(() => {});

    gamesAPI
      .myAttempts(ticketId)
      .then((response) => setAttempts(response?.attempts || []))
      .catch(() => {});

    return undefined;
  }, [user, loading, contestId, ticketId, nav]);

  useEffect(() => {
    if (phase !== 'playing') {
      if (timerFrameRef.current) {
        cancelAnimationFrame(timerFrameRef.current);
        timerFrameRef.current = null;
      }
      return undefined;
    }

    officialStartRef.current = performance.now();
    setElapsedMs(0);

    const tick = (now) => {
      setElapsedMs(now - officialStartRef.current);
      timerFrameRef.current = requestAnimationFrame(tick);
    };

    timerFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (timerFrameRef.current) {
        cancelAnimationFrame(timerFrameRef.current);
        timerFrameRef.current = null;
      }
    };
  }, [phase, gameKey]);

  const loadAttempts = async () => {
    const fresh = await gamesAPI.myAttempts(ticketId);
    setAttempts(fresh?.attempts || []);
  };

  const submitOfficialResult = async (result) => {
    if (busy) return;

    setBusy(true);

    try {
      const measuredDuration = officialStartRef.current
        ? Math.round(performance.now() - officialStartRef.current)
        : Math.round(result.duration_ms);

      const durationMs = Math.max(
        100,
        Number.isFinite(measuredDuration)
          ? measuredDuration
          : Math.round(result.duration_ms)
      );

      const response = await gamesAPI.submit({
        ticket_id: ticketId,
        duration_ms: durationMs,
        accuracy: Number(result.accuracy || 0),
        solved: Boolean(result.solved),
        challenge_token: challengeToken,
      });

      setLastScore(response);
      setElapsedMs(durationMs);
      setChallengeToken(null);
      setPhase('result');

      await loadAttempts();

      toast({
        title: `Score: ${Number(response.points || 0).toFixed(2)} points 🎯`,
        description:
          response.attempts_left > 0
            ? `${response.attempts_left} attempts remaining`
            : 'No more official attempts remaining.',
      });
    } catch (error) {
      const rawDetail = error?.response?.data?.detail;
      const detail =
        typeof rawDetail === 'string'
          ? rawDetail
          : rawDetail?.message ||
            rawDetail?.msg ||
            'The official result could not be submitted.';

      toast({
        title: 'Submit failed',
        description: detail,
      });

      setPhase('ready');
      setChallengeToken(null);
    } finally {
      setBusy(false);
    }
  };

  const completeDemo = () => {
    setDemoCompleted(true);
  };

  const startCountdown = () => {
    if (!challengeToken) {
      toast({
        title: 'Verification required',
        description: 'Complete the verification before starting an official attempt.',
      });
      return;
    }

    setCountdown(3);
    setPhase('countdown');

    let current = 3;

    const interval = window.setInterval(() => {
      current -= 1;

      if (current <= 0) {
        window.clearInterval(interval);
        setCountdown(0);

        window.setTimeout(() => {
          setGameKey((value) => value + 1);
          setPhase('playing');
        }, 500);
      } else {
        setCountdown(current);
      }
    }, 1000);
  };

  const playAgain = () => {
    setLastScore(null);
    setChallengeToken(null);
    setElapsedMs(0);
    setPhase('ready');
  };

  const finishOfficialAttempt = async () => {
    setShowFinishConfirm(false);

    await submitOfficialResult({
      solved: false,
      accuracy: 0,
      duration_ms: Math.max(100, Math.round(elapsedMs)),
    });
  };

  if (loading || !user) {
    return <div className="p-10 text-center text-slate-500">Loading…</div>;
  }

  if (!contest) {
    return (
      <div className="p-10 text-center text-slate-500">
        Contest not found.{' '}
        <Link to="/competitions" className="text-orange-600">
          Browse competitions →
        </Link>
      </div>
    );
  }

  const gameType = contest.game_type;
  const renderGame = gameType && GAME_MAP[gameType];

  const attemptsPerTicket =
    contest?.attempts_per_ticket ?? contest?.max_attempts ?? 3;

  const totalAllowed = lastScore?.total_allowed ?? attemptsPerTicket;
  const attemptsLeft =
    lastScore?.attempts_left ??
    Math.max(0, attemptsPerTicket - attempts.length);

  const bestScore = attempts.reduce(
    (maximum, attempt) =>
      Math.max(maximum, Number(attempt.points || 0)),
    0
  );

  if (!gameType || !renderGame) {
    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
          <Trophy className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <div className="font-display font-bold text-xl">
            No game is configured for this contest
          </div>
          <p className="text-slate-500 mt-2">
            This ticket remains available in My Tickets.
          </p>
          <Link to="/my-account/tickets">
            <Button className="mt-4">Back to My Tickets</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="max-w-4xl mx-auto px-4 lg:px-8 py-8"
      data-testid="play-game-page"
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <Link
          to="/my-account/tickets"
          data-testid="play-later-btn"
          className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-400 bg-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Play later
        </Link>

        <Link
          to={`/leaderboard/${contestId}`}
          className="text-sm text-orange-600 font-semibold inline-flex items-center gap-1"
        >
          View leaderboard
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="bg-gradient-to-br from-slate-900 via-indigo-900 to-fuchsia-900 text-white rounded-3xl p-6 mb-6 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-orange-500/20 blur-3xl" />

        <div className="relative">
          <div className="text-white/80 text-xs uppercase tracking-widest">
            Prize League official competition
          </div>

          <h1 className="font-display text-3xl font-extrabold">
            {contest.title}
          </h1>

          {/* Prominent attempts + best-score pills — used and left at a glance */}
          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="playgame-attempts-block">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-extrabold border border-white/10">
              Ticket #{ticketId.slice(-6)}
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 text-white text-xs font-extrabold border border-white/10"
              data-testid="playgame-attempts-used"
              title="Attempts used"
            >
              Used <b className="text-[#FFD54A] tabular-nums">{attempts.length}</b>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold ${
                attemptsLeft > 0
                  ? 'bg-emerald-500 text-white shadow-[0_0_18px_-4px_#10b98188]'
                  : 'bg-rose-500 text-white'
              }`}
              data-testid="playgame-attempts-left"
              title="Attempts remaining"
            >
              Left <b className="tabular-nums">{attemptsLeft}</b> / {totalAllowed}
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFD54A] text-slate-900 text-xs font-extrabold"
              data-testid="playgame-best-score"
              title="Your best score"
            >
              Best <b className="tabular-nums">{bestScore.toFixed(2)}</b> / 100
            </span>
          </div>
        </div>
      </div>

      {phase === 'intro' && (
        <div
          className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8"
          data-testid="game-introduction"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#6C2BFF]/10 text-[#6C2BFF] flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div>
              <div className="font-display text-2xl font-extrabold text-slate-900">
                Before you begin
              </div>
              <p className="text-sm text-slate-500">
                Learn the game before using an official attempt.
              </p>
            </div>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
              <div className="text-xs uppercase tracking-wider text-slate-400">
                Maximum score
              </div>
              <div className="font-display text-xl font-extrabold text-slate-900">
                100.00 points
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
              <div className="text-xs uppercase tracking-wider text-slate-400">
                Official attempts
              </div>
              <div className="font-display text-xl font-extrabold text-slate-900">
                {attemptsLeft} remaining
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-[#6C2BFF]/20 bg-[#6C2BFF]/5 p-4">
            <div className="font-bold text-slate-900">Practice mode</div>
            <p className="text-sm text-slate-600 mt-1">
              Practice does not consume an attempt, submit a score, or affect
              the leaderboard.
            </p>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12 font-bold"
              onClick={() => setPhase('ready')}
              data-testid="skip-demo"
            >
              Skip Demo
            </Button>

            <Button
              className="h-12 pl-btn-purple text-white font-extrabold"
              onClick={() => {
                setDemoCompleted(false);
                setGameKey((value) => value + 1);
                setPhase('demo');
              }}
              data-testid="start-demo"
            >
              <Eye className="w-4 h-4 mr-2" />
              Start Demo
            </Button>
          </div>
        </div>
      )}

      {phase === 'demo' && (
        <div
          className="bg-white rounded-2xl border-2 border-sky-200 p-6"
          data-testid="practice-mode"
        >
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <div className="text-xs uppercase tracking-widest text-sky-600 font-bold">
                Practice Mode
              </div>
              <div className="font-display text-xl font-extrabold text-slate-900">
                Learn the controls
              </div>
            </div>

            <div className="text-xs bg-sky-50 text-sky-700 px-3 py-1.5 rounded-full font-bold">
              No attempt used
            </div>
          </div>

          {demoCompleted ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />

              <div className="font-display text-2xl font-extrabold text-slate-900 mt-4">
                Demo complete
              </div>

              <p className="text-sm text-slate-500 mt-1">
                This practice result was not submitted.
              </p>

              <div className="mt-5 flex flex-col sm:flex-row justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDemoCompleted(false);
                    setGameKey((value) => value + 1);
                  }}
                >
                  Practice Again
                </Button>

                <Button
                  className="pl-btn-purple text-white font-bold"
                  onClick={() => setPhase('ready')}
                >
                  Continue to Official Attempt
                </Button>
              </div>
            </div>
          ) : (
            <div key={`demo-${gameKey}`}>
              {renderGame(
                {
                  ...(contest.game_config || {}),
                  practice_mode: true,
                },
                completeDemo
              )}
            </div>
          )}
        </div>
      )}

      {phase === 'ready' && attemptsLeft > 0 && (
        <div
          className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8"
          data-testid="official-attempt-ready"
        >
          <div className="text-center">
            <Play className="w-14 h-14 text-[#6C2BFF] mx-auto" />

            <h2 className="font-display text-2xl font-extrabold text-slate-900 mt-4">
              Ready for an official attempt?
            </h2>

            <p className="text-sm text-slate-500 mt-2 max-w-lg mx-auto">
              Your millisecond timer begins after the 3-2-1 countdown. The
              completed result will be submitted to the leaderboard.
            </p>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-100 p-4">
            {!challengeToken ? (
              <TurnstileGate
                contestId={contestId}
                onVerified={setChallengeToken}
              />
            ) : (
              <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold">
                <CheckCircle2 className="w-5 h-5" />
                Verification complete
              </div>
            )}
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12 font-bold"
              onClick={() => nav('/my-account/tickets')}
            >
              Play Later
            </Button>

            <Button
              className="h-12 pl-btn-gold text-slate-900 font-extrabold"
              disabled={!challengeToken}
              onClick={startCountdown}
              data-testid="start-official-attempt"
            >
              Start Official Attempt
            </Button>
          </div>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="bg-slate-950 text-white rounded-3xl p-12 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60">
            Official attempt starts in
          </div>

          <div className="font-display text-8xl font-black mt-6">
            {countdown === 0 ? 'GO' : countdown}
          </div>
        </div>
      )}

      {phase === 'playing' && (
        <div
          className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
          data-testid="official-game"
        >
          <div className="bg-slate-950 text-white px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">
                Official timer
              </div>

              <div className="font-mono text-xl md:text-2xl font-bold tabular-nums">
                {formatDuration(elapsedMs)}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-white/50">
                  Maximum
                </div>

                <div className="font-display text-lg font-extrabold">
                  100.00
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="border-rose-400 text-rose-600 hover:bg-rose-50"
                onClick={() => setShowFinishConfirm(true)}
                data-testid="finish-game-button"
              >
                Finish Game
              </Button>
            </div>
          </div>

          <div className="p-6" key={`official-${gameKey}`}>
            {renderGame(contest.game_config || {}, submitOfficialResult)}
          </div>
        </div>
      )}

      {showFinishConfirm && (
        <div className="fixed inset-0 z-[120] bg-slate-950/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="font-display text-2xl font-extrabold text-slate-900">
              Finish this attempt?
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Your timer will stop and this official attempt will be submitted
              as unfinished. You will receive no completion bonus.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFinishConfirm(false)}
              >
                Continue Playing
              </Button>

              <Button
                type="button"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={finishOfficialAttempt}
                disabled={busy}
              >
                Finish Now
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === 'result' && lastScore && (
        <div
          className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8"
          data-testid="official-result"
        >
          <div className="text-center">
            <Trophy className="w-16 h-16 text-amber-500 mx-auto" />

            <div className="text-xs uppercase tracking-widest text-slate-400 mt-4">
              Official score
            </div>

            <div className="font-display text-5xl font-black text-orange-600 mt-1">
              {Number(lastScore.points || 0).toFixed(2)}
            </div>

            <div className="text-sm text-slate-500">out of 100.00</div>
          </div>

          <div className="mt-6 grid sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <div className="text-xs text-slate-400 uppercase">Time</div>
              <div className="font-mono font-bold text-slate-900 mt-1">
                {formatDuration(
                  lastScore?.score?.duration_ms || elapsedMs
                )}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <div className="text-xs text-slate-400 uppercase">Accuracy</div>
              <div className="font-bold text-slate-900 mt-1">
                {(
                  Number(lastScore?.score?.accuracy || 0) * 100
                ).toFixed(2)}
                %
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <div className="text-xs text-slate-400 uppercase">
                Attempts left
              </div>
              <div className="font-bold text-slate-900 mt-1">
                {lastScore.attempts_left}
              </div>
            </div>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            <Link to={`/leaderboard/${contestId}`}>
              <Button variant="outline" className="w-full h-12 font-bold">
                View Leaderboard
              </Button>
            </Link>

            {lastScore.attempts_left > 0 ? (
              <Button
                onClick={playAgain}
                className="h-12 pl-btn-purple text-white font-extrabold"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            ) : (
              <Button
                onClick={() => nav('/my-account/tickets')}
                className="h-12 pl-btn-purple text-white font-extrabold"
              >
                Back to My Tickets
              </Button>
            )}
          </div>
        </div>
      )}

      {attemptsLeft <= 0 && phase !== 'result' && (
        <div
          className="bg-white rounded-2xl border border-slate-100 p-10 text-center"
          data-testid="game-no-attempts"
        >
          <Trophy className="w-12 h-12 text-amber-500 mx-auto mb-3" />

          <div className="font-display font-bold text-xl">
            Attempts used up
          </div>

          <p className="text-slate-500 mt-2">
            Your best score of{' '}
            <b className="text-orange-600">{bestScore.toFixed(2)}</b> points
            is on the leaderboard.
          </p>

          <Link to={`/leaderboard/${contestId}`}>
            <Button className="mt-4 bg-orange-500 hover:bg-orange-600">
              View Leaderboard
            </Button>
          </Link>
        </div>
      )}

      {attempts.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-slate-100 p-6">
          <div className="font-display font-bold mb-3">
            Your official attempts
          </div>

          <ul className="divide-y divide-slate-100 text-sm">
            {attempts.map((attempt, index) => (
              <li
                key={attempt.score_id}
                className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
              >
                <span>Attempt #{index + 1}</span>

                <span className="text-slate-500">
                  {formatDuration(attempt.duration_ms)} ·{' '}
                  {(Number(attempt.accuracy || 0) * 100).toFixed(2)}%
                  accuracy
                </span>

                <span className="font-bold text-orange-600">
                  {Number(attempt.points || 0).toFixed(2)} pts
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
