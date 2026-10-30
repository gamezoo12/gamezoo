import { useEffect, useState } from 'react';
import { Download, FileCheck2, Film, History } from 'lucide-react';
import { drawStudioAPI } from '../../lib/api';
import { downloadBlob } from '../../components/drawstudio/studio/useRecorder';

const money = (v) => `£${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—');

function PlanCard({ plan }) {
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const toggle = async () => setResults(results ? null : (await drawStudioAPI.plan(plan.plan_id)).results);
  const report = async () => { setBusy(true); try { const d = await drawStudioAPI.report(plan.plan_id); downloadBlob(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), `${plan.plan_id}-audit.json`); } finally { setBusy(false); } };
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5" data-testid={`history-plan-${plan.plan_id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-black text-white">{plan.contest_title}</h3>
          <p className="mt-1 text-xs text-indigo-200/60">{plan.rounds.length} round(s) · {money(plan.total_budget)} · {plan.pool_size ? `${plan.pool_size} tickets frozen` : 'pool not frozen'} · locked {when(plan.locked_at)} · completed {when(plan.completed_at)}</p>
          {plan.pool_hash_sha256 && <p className="mt-1 break-all font-mono text-[10px] text-indigo-200/50">pool {plan.pool_hash_sha256} · seed commitment {plan.seed_commitment_sha256}</p>}</div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase text-amber-200">{plan.status.replace('_', ' ')}{plan.announcement_id ? ' · announced' : ''}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={toggle} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20" data-testid={`history-results-${plan.plan_id}`}>{results ? 'Hide results' : 'Show results'}</button>
        {plan.status !== 'draft' && <button type="button" disabled={busy} onClick={report} className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/10" data-testid={`history-report-${plan.plan_id}`}><FileCheck2 className="h-3.5 w-3.5" />Audit report</button>}
      </div>
      {results && <ul className="mt-3 space-y-1 text-sm">{results.length ? results.map((r) => <li key={r.round_index} className="text-indigo-100"><b>{r.round_name}</b> — {r.winners.map((w) => `#${w.ticket_number} ${w.display_name} (${money(w.prize_amount)})`).join(', ')} <span className="text-[11px] text-indigo-200/50">· {when(r.drawn_at)} · {r.candidate_count} eligible</span></li>) : <li className="text-xs text-indigo-200/60">No rounds drawn yet.</li>}</ul>}
    </article>
  );
}

export default function DrawHistory() {
  const [plans, setPlans] = useState([]);
  const [recs, setRecs] = useState([]);
  useEffect(() => {
    drawStudioAPI.allPlans().then((r) => setPlans(r.plans)).catch(() => {});
    drawStudioAPI.recordings().then((r) => setRecs(r.recordings)).catch(() => {});
  }, []);
  const download = async (r) => downloadBlob(await drawStudioAPI.recordingBlob(r.recording_id), `prize-league-draw-${r.recording_id}.${r.ext}`);
  return (
    <div className="-m-4 min-h-screen bg-[#07041a] p-4 pb-32 text-white sm:-m-6 sm:p-8 sm:pb-32" data-testid="draw-history-page">
      <h1 className="flex items-center gap-3 text-4xl font-black tracking-tight"><History className="h-9 w-9 text-amber-300" />Draw History &amp; Recordings</h1>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">{plans.length ? plans.map((p) => <PlanCard key={p.plan_id} plan={p} />) : <p className="text-sm text-indigo-200/60">No draws yet.</p>}</div>
        <section className="h-fit rounded-2xl border border-white/10 bg-white/[0.04] p-5" data-testid="history-recordings">
          <h2 className="flex items-center gap-2 text-lg font-black text-amber-300"><Film className="h-5 w-5" />Saved recordings</h2>
          <p className="mt-1 text-xs text-indigo-200/60">Recordings download to your computer when you stop. Copies you save from the studio appear here.</p>
          {recs.map((r) => <div key={r.recording_id} className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[#0b0724] p-3 text-xs" data-testid={`recording-${r.recording_id}`}>
            <div className="min-w-0"><div className="truncate font-bold text-white">{r.label || r.contest_id}</div><div className="text-indigo-200/60">{r.mode} · {(r.size / 1048576).toFixed(1)} MB · {when(r.created_at)}</div></div>
            <button type="button" onClick={() => download(r)} className="rounded-full bg-amber-400/20 p-2 text-amber-200 hover:bg-amber-400/30" aria-label="Download recording" data-testid={`recording-download-${r.recording_id}`}><Download className="h-4 w-4" /></button>
          </div>)}
          {!recs.length && <p className="mt-3 text-xs text-indigo-200/60">No saved recordings yet.</p>}
        </section>
      </div>
    </div>
  );
}
