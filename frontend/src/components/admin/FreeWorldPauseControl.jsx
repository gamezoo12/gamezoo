import { useCallback, useEffect, useState } from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { worldGcCompetitionAdminAPI } from '../../lib/api';

const londonTime = (value) => (value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—');
const errorText = (e) => {
  const detail = e?.response?.data?.detail;
  return typeof detail === 'string' ? detail : detail?.message || 'Request failed.';
};

export const FreeWorldPauseControl = () => {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);

  const load = useCallback(() => worldGcCompetitionAdminAPI.pauseStatus().then(setStatus).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); setPending(null); await load(); } catch (e) {
      const detail = e?.response?.data?.detail;
      if (detail?.code === 'SCHEDULE_PASSED_DURING_PAUSE') setPending(detail);
      setError(errorText(e));
    } finally { setBusy(false); }
  };

  const paused = Boolean(status?.state?.paused);
  const pause = () => window.confirm('Pause Free World? New gameplay, level finalization and reward crediting stop until resumed. Scores, progress and wallets are preserved.')
    && run(() => worldGcCompetitionAdminAPI.pause('Paused from Free World Admin'));
  const resume = () => run(() => worldGcCompetitionAdminAPI.resume());
  const resumeAck = () => run(() => worldGcCompetitionAdminAPI.resume({ acknowledge_schedule_passed: true, confirmation: 'RESUME ON EXISTING SCHEDULE' }));

  return (
    <section className={`rounded-2xl border p-5 ${paused ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'}`} data-testid="free-world-pause-control">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-lg text-slate-900">Free World gameplay</h2>
          <p className="text-sm text-slate-600" data-testid="free-world-pause-state">
            {paused ? `Paused since ${londonTime(status.state.paused_at)} (UK). New attempts, finalization and reward crediting are blocked.` : 'Running normally.'}
          </p>
        </div>
        {paused
          ? <button type="button" disabled={busy} onClick={resume} className="inline-flex h-10 items-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50" data-testid="free-world-resume-btn"><PlayCircle className="h-4 w-4" /> Resume Free World</button>
          : <button type="button" disabled={busy} onClick={pause} className="inline-flex h-10 items-center gap-2 rounded-full bg-rose-600 px-5 text-sm font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50" data-testid="free-world-pause-btn"><PauseCircle className="h-4 w-4" /> Pause Free World</button>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700" data-testid="free-world-pause-error">{error}</p>}
      {pending && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="free-world-resume-resolution">
        <ul className="mb-2 list-disc pl-5">{pending.events.map((e) => <li key={e.event}>{e.event} at {londonTime(e.at)}</li>)}</ul>
        <button type="button" disabled={busy} onClick={resumeAck} className="rounded-full bg-amber-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50" data-testid="free-world-resume-ack-btn">Resume on existing schedule</button>
      </div>}
    </section>
  );
};
