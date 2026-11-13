import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { signupChallengeAPI } from '../../lib/api';
import { ChallengeGame, makePracticeBoard, practiceScore } from './ChallengeGame';
import { AttemptResult, Intro, LeaveDialog, ScoresList, tm } from './parts';
import { AttemptShare, FinalScorecard } from './FinalScorecard';
import './signupChallenge.css';

const errMsg = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : d?.message || 'Something went wrong, please try again.'; };
const newId = () => (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/-/g, '');

export default function SignupChallengeScreen({ initial, preview = false, onClose }) {
  const [state, setState] = useState(initial);
  const [stage, setStage] = useState(initial.participation.status === 'completed' ? 'final' : 'intro');
  const [demo, setDemo] = useState(null);
  const [demoResult, setDemoResult] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [leave, setLeave] = useState(false);
  const [partial, setPartial] = useState(false);
  const [demoRuns, setDemoRuns] = useState(initial.participation.demo_runs || 0);
  const pendingStart = useRef(null);
  const ch = state.challenge;
  const track = useCallback((t, m) => { if (!preview) signupChallengeAPI.event(t, m); }, [preview]);

  useEffect(() => { track('impression'); }, [track]);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  const startDemo = () => {
    setDemo(makePracticeBoard(ch.game_id, ch.game_config)); setDemoResult(null); setDemoRuns((n) => n + 1);
    setStage('demo'); track('demo_start');
  };
  const demoDone = useCallback((run) => {
    setDemoResult({ score: practiceScore(ch.game_id, run, demo?.expected), finished: run.finished });
    setStage('demo_result'); track('demo_complete');
  }, [ch, demo, track]);

  const startReal = async () => {
    if (busy) return;
    setBusy(true);
    pendingStart.current = pendingStart.current || newId();
    try {
      const r = await signupChallengeAPI.start(pendingStart.current);
      pendingStart.current = null;
      setAttempt(r.attempt); setStage('real');
    } catch (e) {
      if (e?.response) pendingStart.current = null;
      toast.error(errMsg(e));
    } finally { setBusy(false); }
  };

  const realDone = useCallback(async (run) => {
    setStage('submitting');
    for (let i = 0; i < 3; i += 1) {
      try {
        const r = await signupChallengeAPI.submit(attempt.attempt_id, run);
        const { attempt: a, ...next } = r;
        setState(next); setResult(a); setStage('result');
        return;
      } catch (e) {
        if (e?.response) { toast.error(errMsg(e)); break; }
        await new Promise((ok) => setTimeout(ok, 800));
      }
    }
    try { const me = await signupChallengeAPI.me(); if (me.show) setState(me); } catch { /* keep state */ }
    setStage('intro');
  }, [attempt]);

  const closeClick = () => {
    if (preview || partial || state.participation.status === 'forfeited') return onClose();
    if (state.participation.status === 'completed' && stage !== 'real') return finish();
    track('close_click', { stage });
    setLeave(true);
  };
  const confirmLeave = async () => {
    setBusy(true);
    try {
      const r = await signupChallengeAPI.forfeit();
      setLeave(false); setState(r);
      if (r.attempts.some((a) => a.status === 'completed')) { setPartial(true); setStage('final'); } else onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const finish = async () => {
    if (!preview && !partial && state.participation.status === 'completed') await signupChallengeAPI.finalSeen().catch(() => null);
    onClose();
  };

  const demoLeft = Math.max(0, (ch.demo_max_runs || 3) - demoRuns);
  return (
    <div className="sc-root" role="dialog" aria-modal="true" aria-label="Welcome Challenge" data-testid="signup-challenge-screen">
      {ch.background_url && <div className="sc-bg" style={{ backgroundImage: `url(${ch.background_url})` }} />}
      {preview && <p className="relative mx-auto mb-2 rounded-full bg-sky-500/20 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-sky-200" data-testid="sc-preview-badge">Admin preview - nothing is saved</p>}
      <button type="button" className="sc-close" onClick={closeClick} aria-label="Close challenge" data-testid="sc-close-x"><X className="h-5 w-5" /></button>
      <main className="relative flex flex-1 flex-col justify-center py-10">
        {stage === 'intro' && <Intro state={state} demoLeft={demoLeft} busy={busy} preview={preview} onDemo={startDemo} onStart={startReal} onScores={() => setStage('scores')} />}
        {stage === 'demo' && demo && <ChallengeGame key={`demo-${demoRuns}`} practice gameId={ch.game_id} board={demo.board} timeLimitS={ch.demo_time_limit_s} onDone={demoDone} />}
        {stage === 'demo_result' && demoResult && (
          <div className="sc-card sc-rise mx-auto w-full max-w-md p-6 text-center" data-testid="sc-demo-result">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-sky-200">Practice mode</p>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-white/55">Practice time</p>
            <p className="text-6xl font-black" data-testid="sc-practice-score">{tm(demoResult.score)}</p>
            <p className="mt-2 text-sm text-white/65">{demoResult.finished ? 'Your time is your score: faster is better.' : 'Time ran out before you finished.'} Practice times never count for the giveaway.</p>
            <div className="mt-6 grid gap-2">
              <button type="button" className="sc-btn sc-btn-gold" disabled={busy || preview || !state.can_play_real} onClick={startReal} data-testid="sc-demo-start-real">START REAL CHALLENGE</button>
              <button type="button" className="sc-btn sc-btn-ghost" disabled={demoLeft <= 0} onClick={startDemo} data-testid="sc-demo-again">PRACTICE AGAIN</button>
              <button type="button" className="sc-btn sc-btn-ghost" onClick={() => setStage('intro')} data-testid="sc-demo-back">BACK</button>
            </div>
          </div>
        )}
        {stage === 'real' && attempt && <ChallengeGame key={attempt.attempt_id} gameId={attempt.game_id} board={attempt.board} timeLimitS={attempt.time_limit_s} onDone={realDone} />}
        {stage === 'submitting' && <p className="text-center text-lg font-black text-amber-200" data-testid="sc-submitting">Verifying your score…</p>}
        {stage === 'result' && result && (
          <div>
            <AttemptResult attempt={result} state={state} onRetry={startReal} onScores={() => setStage('scores')} onClose={closeClick} onFinal={() => setStage('final')} />
            {result.status === 'completed' && <AttemptShare state={state} attempt={result} preview={preview} />}
          </div>
        )}
        {stage === 'scores' && <ScoresList state={state} onBack={() => setStage(state.participation.status === 'completed' ? 'final' : 'intro')} />}
        {stage === 'final' && <FinalScorecard state={state} partial={partial} preview={preview} onFinish={finish} />}
      </main>
      <LeaveDialog open={leave} busy={busy} onStay={() => setLeave(false)} onLeave={confirmLeave} />
    </div>
  );
}
