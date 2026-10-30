import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Megaphone, RotateCcw, Sparkles } from 'lucide-react';
import { drawStudioAPI } from '../../../lib/api';
import { Studio3D } from './Studio3D';
import { RecordControls, StageSteps, UtilityControls } from './TheatreControls';
import { useRecorder } from './useRecorder';
import { useRoundCapture } from './useRoundCapture';
import { drawPhase, eligibleFor, elapsed, now, sampleNumbers, simulateWinners } from './timeline';
import { loadCanvasFonts } from './textures';

const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : 'Request failed'; };
const primary = 'inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-7 text-sm font-black tracking-wider text-[#1a1033] shadow-[0_0_28px_rgba(255,213,74,0.45)] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40';

function startState(mode, rounds, results) {
  if (mode !== 'official') return { round: 0, outcomes: [] };
  const round = rounds.findIndex((_, i) => !results[i]?.revealed_at);
  return { round: round === -1 ? rounds.length - 1 : round, outcomes: rounds.map((_, i) => results[i]?.winners || null), allDone: round === -1 };
}

/* Manually staged broadcast: Enter Pool → Mix → Draw → Winner Reveal per round, then a finale. The winner is never decided here in official mode. */
export function DrawTheatre({ mode, contest, rounds, tickets, plan, results = [], replayWinners, audio, onClose, onChanged }) {
  const init = useMemo(() => startState(mode, rounds, results), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [round, setRound] = useState(init.round);
  const [outcomes, setOutcomes] = useState(init.outcomes);
  const [stage, setStage] = useState(init.allDone ? 'complete' : 'ready');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(null);
  const [published, setPublished] = useState(Boolean(plan?.announcement_id));
  const S = useRef({ stage, t0: now(), cfg: rounds[init.round], winners: null });
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const rec = useRecorder();
  const capture = useRoundCapture();
  const preview = mode === 'preview';
  const replay = mode === 'replay';

  const pool = useMemo(() => eligibleFor(round, rounds, outcomes, tickets), [round, rounds, outcomes, tickets]);
  const numbers = useMemo(() => sampleNumbers(pool), [pool]);
  const go = useCallback((next) => { Object.assign(S.current, { stage: next, t0: now() }); setStage(next); }, []);
  useEffect(() => { loadCanvasFonts(); }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const s = S.current;
      const t = elapsed(s);
      if (s.stage === 'loading') {
        if (now() - (s.lastTick || 0) > 85) { audio?.play('entry', { overlap: true, volume: 0.7 }); s.lastTick = now(); }
        if (t >= s.cfg.load_duration_s + 0.9) go('loaded');
      }
      if (s.stage === 'mixing') {
        audio?.setHeartbeatBpm(72 + Math.min(1, t / s.cfg.mix_duration_s) * 38);
        const left = Math.ceil(s.cfg.mix_duration_s - t);
        if (left <= 3 && left > 0 && s.beeped !== left) { s.beeped = left; audio?.play('countdown'); }
        if (t >= s.cfg.mix_duration_s) go('mixed');
      }
      if (s.stage === 'drawing') {
        const ph = drawPhase(s);
        const total = Math.max(1, s.winners?.length || 1);
        audio?.setHeartbeatBpm(115 + Math.min(1, ((ph.w || 0) + Math.max(0, ph.local || 0)) / total) * 45);
        if (!ph.waiting && ph.local >= 0.72 && s.revealSound !== ph.w) { s.revealSound = ph.w; audio?.play('reveal', { overlap: true }); }
        if (ph.done) { audio?.stop('drumroll'); go('drawn'); }
      }
    }, 60);
    return () => clearInterval(id);
  }, [audio, go]);
  useEffect(() => () => audio?.stopAll(), [audio]);

  const enterPool = () => {
    setError(''); setNotice('');
    Object.assign(S.current, { cfg: rounds[round], allNumbers: pool.map((t) => t.ticket_number), winners: null, drawT0: null, revealSound: -1, beeped: null });
    audio?.play('music', { loop: true });
    go('loading');
  };
  const mix = () => { audio?.startHeartbeat(72); go('mixing'); };
  const draw = async () => {
    setBusy(true); setError('');
    audio?.play('drumroll', { loop: true });
    audio?.setHeartbeatBpm(115);
    if (mode === 'official' && canvasRef.current) capture.start(canvasRef.current, audio);
    go('drawing');
    try {
      let winners;
      if (replay) winners = replayWinners;
      else if (preview) winners = simulateWinners(pool, rounds[round].num_winners).map((t) => ({ ticket_number: t.ticket_number, display_name: t.display_name }));
      else {
        const r = await drawStudioAPI.drawRound(plan.plan_id, round);
        winners = r.result.winners;
        if (r.resumed) setNotice(`Recovered: this round's official result was already fixed on ${new Date(r.result.drawn_at).toLocaleString('en-GB')}. Showing the same winners.`);
        onChanged?.();
      }
      S.current.winners = winners;
      S.current.drawT0 = now();
      setOutcomes((o) => { const c = [...o]; c[round] = winners; return c; });
    } catch (e) {
      audio?.stop('drumroll');
      capture.cancel();
      setError(errText(e));
      go('mixed');
    } finally { setBusy(false); }
  };
  const reveal = () => {
    audio?.stopHeartbeat(); audio?.stop('music');
    audio?.play('announcement');
    setTimeout(() => audio?.play('celebration'), 900);
    S.current.confettiAt = now();
    go('revealed');
    if (mode === 'official') {
      drawStudioAPI.markRevealed(plan.plan_id, round).then(() => onChanged?.()).catch(() => {});
      capture.finish(canvasRef.current, { contest_id: contest.contest_id, plan_id: plan.plan_id, round_index: round, label: `${contest.title || 'Draw'} · ${rounds[round]?.name || `Round ${round + 1}`}`.slice(0, 120) });
    }
  };
  const next = () => { const r = round + 1; S.current.cfg = rounds[r]; setRound(r); go('ready'); };
  const finale = () => { audio?.play('celebration'); S.current.confettiAt = now(); go('complete'); };
  const again = () => { audio?.stopAll(); setOutcomes([]); setRound(0); S.current.cfg = rounds[0]; go('ready'); };
  const publishAll = async () => {
    setBusy(true); setError('');
    try { await drawStudioAPI.announceAll(plan.plan_id); setPublished(true); setNotice('All winners announced on the site and added to the public winners page.'); onChanged?.(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  const saveCopy = async () => {
    setSaving(0);
    try { await drawStudioAPI.saveRecording(rec.last.blob, { mode: mode === 'official' ? 'official' : 'preview', contest_id: contest.contest_id, plan_id: plan?.plan_id, label: contest.title?.slice(0, 120), onProgress: setSaving }); setSaving(1); } catch (e) { setError(errText(e)); setSaving(null); }
  };
  const close = () => { rec.stop(); audio?.stopAll(); if (document.fullscreenElement) document.exitFullscreen(); onClose(); };

  const last = round === rounds.length - 1;
  const action = {
    ready: [enterPool, 'Enter Pool'], loading: [null, 'Entering tickets…'], loaded: [mix, 'Mix'], mixing: [null, 'Mixing…'],
    mixed: [draw, 'Draw'], drawing: [null, 'Drawing…'], drawn: [reveal, 'Reveal Winner'],
    revealed: last ? [finale, 'Show Finale'] : [next, `Next: ${rounds[round + 1]?.name}`],
  }[stage];
  const view = useMemo(() => ({ stage, round, rounds, outcomes, preview, replay, title: contest.title, eligible: pool.length,
    totalPrize: rounds.reduce((a, r) => a + r.prize_amount * r.num_winners, 0), totalWinners: rounds.reduce((a, r) => a + Number(r.num_winners), 0) }),
  [stage, round, rounds, outcomes, preview, replay, contest.title, pool.length]);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[2147483000] flex flex-col bg-[#050211]" data-testid="draw-stage" data-stage={stage} data-mode={mode}>
      <div className="relative min-h-0 flex-1">
        <Studio3D S={S} view={view} numbers={stage === 'ready' ? [] : numbers} onCanvas={(c) => { canvasRef.current = c; }} />
        {(preview || replay) && <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-rose-600/90 px-3 py-1 text-[10px] font-black tracking-widest text-white" data-testid="draw-preview-badge">{replay ? 'REPLAY · OFFICIAL RESULT' : 'PREVIEW · SIMULATED'}</span>}
        {(error || notice) && <div className={`absolute inset-x-4 top-12 mx-auto max-w-2xl rounded-xl border p-3 text-sm ${error ? 'border-rose-400/50 bg-rose-950/90 text-rose-100' : 'border-emerald-400/50 bg-emerald-950/90 text-emerald-100'}`} role={error ? 'alert' : 'status'} data-testid={error ? 'draw-stage-error' : 'draw-stage-notice'}>{error || notice}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#0b0724]/95 px-4 py-3">
        <div className="flex items-center gap-3"><StageSteps stage={stage} /><span className="text-xs font-bold text-white/60" data-testid="draw-stage-status">Round {round + 1}/{rounds.length} · {stage}</span>{capture.status && <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${capture.status === 'error' ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-500/15 text-emerald-200'}`} data-testid="draw-capture-status">{{ recording: '● Capturing winner clip', saving: 'Saving clip + screenshot…', saved: 'Clip + screenshot saved', error: 'Clip save failed' }[capture.status]}</span>}</div>
        <div className="flex flex-wrap items-center gap-2">
          {action && <button type="button" className={primary} disabled={!action[0] || busy} onClick={action[0] || undefined} data-testid="draw-stage-action">{stage === 'revealed' ? <ChevronRight className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}{action[1]}</button>}
          {stage === 'complete' && !mode.startsWith('off') && <button type="button" className={primary} onClick={again} data-testid="draw-stage-again"><RotateCcw className="h-5 w-5" />Play Again (Preview)</button>}
          {stage === 'complete' && mode === 'official' && <button type="button" className={primary} disabled={busy || published} onClick={publishAll} data-testid="draw-publish-all"><Megaphone className="h-5 w-5" />{published ? 'Winners announced' : 'Publish all winners'}</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RecordControls rec={rec} saving={saving} onSave={saveCopy} onStart={() => canvasRef.current && rec.start(canvasRef.current, audio)} />
          <UtilityControls onClose={close} onFullscreen={() => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen?.())} />
        </div>
      </div>
    </div>
  );
}
