import { Clock3, Gamepad2, Repeat, Trophy, Info } from 'lucide-react';
import PrizeLeagueLogo from '../layout/PrizeLeagueLogo';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';

export const num = (n) => Number(n || 0).toLocaleString('en-GB');
export const secs = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(2)}s`);

export function Brand({ ch }) {
  return (
    <header className="sc-rise flex flex-col items-center text-center" data-testid="sc-brand">
      <PrizeLeagueLogo size={40} wordmarkClassName="text-white" />
      <p className="mt-4 text-xs font-black uppercase tracking-[0.35em] text-amber-200/90" data-testid="sc-title">{ch.title}</p>
      <h1 className="sc-gold mt-1 text-4xl font-black leading-tight sm:text-5xl lg:text-6xl" data-testid="sc-prize">{ch.prize_label}</h1>
      {ch.prize_description && <p className="mt-1 text-sm text-violet-100/80">{ch.prize_description}</p>}
    </header>
  );
}

function Stat({ icon: Icon, label, value, testId }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] p-3 text-center" data-testid={testId}>
      <Icon className="mx-auto h-4 w-4 text-amber-300" />
      <p className="mt-1 text-lg font-black">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">{label}</p>
    </div>
  );
}

export function Intro({ state, demoLeft, busy, preview, onDemo, onStart, onScores }) {
  const ch = state.challenge;
  const used = state.participation.attempts_used || 0;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5" data-testid="sc-intro">
      <Brand ch={ch} />
      {ch.description && <p className="sc-rise text-center text-sm text-violet-100/85 md:text-base">{ch.description}</p>}
      <section className="sc-card sc-rise p-5" style={{ animationDelay: '80ms' }}>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-300/15"><Gamepad2 className="h-6 w-6 text-amber-300" /></span>
          <div><p className="text-[11px] font-bold uppercase tracking-widest text-white/55">Your game</p><p className="text-xl font-black" data-testid="sc-game-name">{ch.game_label}</p></div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat icon={Trophy} label="Total attempts" value={ch.attempts_allowed} testId="sc-total-attempts" />
          <Stat icon={Repeat} label="Remaining" value={state.remaining} testId="sc-remaining-attempts" />
          <Stat icon={Clock3} label="Time limit" value={`${ch.time_limit_s}s`} testId="sc-time-limit" />
        </div>
        <h2 className="mt-5 text-base font-black md:text-lg">How to play</h2>
        <ol className="mt-2 space-y-2" data-testid="sc-how-to-play">
          {(ch.how_to_play || []).map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-white/85"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/40 text-xs font-black">{i + 1}</span>{s}</li>
          ))}
        </ol>
      </section>
      {state.real_block_reason && (
        <p className="sc-rise flex gap-2 rounded-2xl border border-sky-300/30 bg-sky-400/10 p-3 text-sm text-sky-100" data-testid="sc-real-block-reason"><Info className="mt-0.5 h-4 w-4 shrink-0" />{state.real_block_reason}</p>
      )}
      <div className="sc-rise grid gap-3" style={{ animationDelay: '160ms' }}>
        {ch.demo_enabled && (
          <button type="button" className="sc-btn sc-btn-sky" disabled={busy || demoLeft <= 0} onClick={onDemo} data-testid="sc-demo-button">
            {demoLeft > 0 ? `TRY DEMO / PRACTICE (${demoLeft} left)` : 'PRACTICE RUNS USED'}
          </button>
        )}
        <button type="button" className="sc-btn sc-btn-gold text-lg" disabled={busy || preview || !state.can_play_real} onClick={onStart} data-testid="sc-start-real-button">
          {preview ? 'REAL ATTEMPTS DISABLED IN PREVIEW' : busy ? 'STARTING…' : used ? `START ATTEMPT ${used + 1}` : 'START REAL CHALLENGE'}
        </button>
        {state.attempts.length > 0 && <button type="button" className="sc-btn sc-btn-ghost" onClick={onScores} data-testid="sc-view-scores-intro">VIEW MY SCORES</button>}
        <p className="text-center text-[11px] text-white/45">Practice never uses a real attempt. Real attempts are one-time and cannot be restarted.</p>
      </div>
    </div>
  );
}

export function AttemptResult({ attempt, state, onRetry, onScores, onClose, onFinal }) {
  const ch = state.challenge;
  const ok = attempt.status === 'completed';
  const last = state.remaining <= 0;
  return (
    <div className="sc-card sc-rise mx-auto w-full max-w-md p-6 text-center" data-testid="sc-attempt-result">
      <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-200">Attempt {attempt.attempt_no} of {ch.attempts_allowed}</p>
      <h2 className="sc-gold mt-2 text-3xl font-black">{ok ? 'ATTEMPT COMPLETED!' : attempt.status === 'expired' ? 'TIME EXPIRED' : 'ATTEMPT NOT VALID'}</h2>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-widest text-white/55">Your score</p>
      <p className="text-6xl font-black" data-testid="sc-result-score">{num(attempt.score)}</p>
      <div className="mt-5 grid grid-cols-2 gap-2 text-left text-sm">
        {[['Time taken', ok ? secs(attempt.duration_ms) : '-', 'sc-result-time'], ['Best score', num(state.participation.best_score), 'sc-result-best'],
          ['Total attempts', ch.attempts_allowed, 'sc-result-total'], ['Remaining', state.remaining, 'sc-result-remaining']].map(([k, v, id]) => (
          <div key={k} className="rounded-xl bg-white/[0.06] p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-white/50">{k}</p><p className="text-lg font-black" data-testid={id}>{v}</p></div>
        ))}
      </div>
      {ok && attempt.total ? <p className="mt-3 text-xs text-white/60">{attempt.correct} / {attempt.total} correct, verified by Prize League</p> : null}
      <div className="mt-6 grid gap-2">
        {last
          ? <button type="button" className="sc-btn sc-btn-gold" onClick={onFinal} data-testid="sc-open-final">SEE FINAL SCORECARD</button>
          : <button type="button" className="sc-btn sc-btn-gold" onClick={onRetry} data-testid="sc-retry-button">TRY AGAIN ({state.remaining} LEFT)</button>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="sc-btn sc-btn-ghost" onClick={onScores} data-testid="sc-view-scores">VIEW SCORES</button>
          <button type="button" className="sc-btn sc-btn-ghost" onClick={onClose} data-testid="sc-close-challenge">CLOSE</button>
        </div>
      </div>
    </div>
  );
}

export function ScoresList({ state, onBack }) {
  const best = state.participation.best_attempt_id;
  return (
    <div className="sc-card sc-rise mx-auto w-full max-w-md p-6" data-testid="sc-scores-list">
      <h2 className="text-center text-xl font-black">My attempts</h2>
      <ul className="mt-4 space-y-2">
        {state.attempts.map((a) => (
          <li key={a.attempt_id} className={`flex items-center justify-between rounded-xl px-4 py-3 ${a.attempt_id === best ? 'bg-amber-300/15 ring-1 ring-amber-300/60' : 'bg-white/[0.06]'}`} data-testid={`sc-score-row-${a.attempt_no}`}>
            <span className="font-bold">Attempt {a.attempt_no}</span>
            <span className="text-right"><span className="block text-lg font-black">{num(a.score)}</span><span className="text-[11px] uppercase text-white/50">{a.status === 'completed' ? secs(a.duration_ms) : a.status}</span></span>
          </li>
        ))}
      </ul>
      <button type="button" className="sc-btn sc-btn-ghost mt-5 w-full" onClick={onBack} data-testid="sc-scores-back">BACK</button>
    </div>
  );
}

export function LeaveDialog({ open, onStay, onLeave, busy }) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onStay()}>
      <AlertDialogContent className="z-[10400]" data-testid="sc-leave-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Leave Signup Challenge?</AlertDialogTitle>
          <AlertDialogDescription>This Signup Challenge is available only once. If you close it now, you will lose your remaining attempts and the challenge will not appear again. Are you sure you want to leave?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStay} data-testid="sc-leave-continue">Continue Playing</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); onLeave(); }} disabled={busy} className="bg-rose-600 hover:bg-rose-700" data-testid="sc-leave-confirm">Leave Challenge</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
