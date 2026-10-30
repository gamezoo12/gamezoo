import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clapperboard, Download, FileCheck2, Lock, Megaphone, PlayCircle, Save, ShieldCheck, Sparkles, Ticket } from 'lucide-react';
import { drawStudioAPI } from '../../lib/api';
import { DrawAudio } from '../../components/drawstudio/drawAudio';
import { DrawStage } from '../../components/drawstudio/DrawStage';
import { RoundsEditor, newRound } from '../../components/drawstudio/RoundsEditor';
import { SoundPanel } from '../../components/drawstudio/SoundPanel';

const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : 'Request failed'; };
const money = (v) => `£${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pill = 'inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-black transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40';

function simulate(rounds, tickets) {
  const used = new Set();
  return rounds.map((r) => {
    const pool = tickets.filter((t) => r.allow_previous_winners || !used.has(t.ticket_number));
    const picks = [];
    const copy = [...pool];
    for (let i = 0; i < Math.min(r.num_winners, copy.length); i += 1) picks.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    picks.forEach((p) => used.add(p.ticket_number));
    return { ...r, winners: picks.map((p) => ({ ticket_number: p.ticket_number, display_name: p.display_name })) };
  });
}

export default function DrawStudio() {
  const [contests, setContests] = useState([]);
  const [contestId, setContestId] = useState('');
  const [pool, setPool] = useState(null);
  const [plan, setPlan] = useState(null);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [rounds, setRounds] = useState([newRound(1)]);
  const [uploaded, setUploaded] = useState([]);
  const [audio, setAudio] = useState(null);
  const [show, setShow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAudio = useCallback(async (engine) => {
    const r = await drawStudioAPI.audio().catch(() => ({ audio: [] }));
    setUploaded(r.audio);
    await engine?.load(r.audio.map((a) => a.slot));
  }, []);

  useEffect(() => {
    drawStudioAPI.contests().then((r) => setContests(r.contests)).catch((e) => setError(errText(e)));
    const engine = new DrawAudio();
    setAudio(engine);
    loadAudio(engine);
    return () => engine.close();
  }, [loadAudio]);

  const loadContest = useCallback(async (cid) => {
    setError(''); setNotice(''); setPool(null); setPlan(null); setResults([]);
    if (!cid) return;
    const [p, plans] = await Promise.all([drawStudioAPI.pool(cid), drawStudioAPI.plans(cid)]);
    setPool(p);
    setHistory(plans.plans);
    const current = plans.plans.find((x) => x.status !== 'draft') || plans.plans[0];
    if (current) {
      const full = await drawStudioAPI.plan(current.plan_id);
      setPlan(full.plan); setResults(full.results); setRounds(full.plan.rounds);
    } else setRounds([newRound(1)]);
  }, []);
  useEffect(() => { loadContest(contestId).catch((e) => setError(errText(e))); }, [contestId, loadContest]);

  const budget = useMemo(() => rounds.reduce((a, r) => a + Number(r.prize_amount || 0) * Number(r.num_winners || 0), 0), [rounds]);
  const published = Number(pool?.contest?.prize_amount || 0);
  const locked = plan && plan.status !== 'draft';
  const nextRound = results.length;
  const run = async (fn, ok) => { setBusy(true); setError(''); setNotice(''); try { const r = await fn(); if (ok) setNotice(ok(r)); return r; } catch (e) { setError(errText(e)); return null; } finally { setBusy(false); } };

  const refreshPlan = async (planId) => {
    const [full, plans] = await Promise.all([drawStudioAPI.plan(planId), drawStudioAPI.plans(contestId)]);
    setPlan(full.plan); setResults(full.results); setHistory(plans.plans);
  };
  const save = () => run(async () => {
    const body = { contest_id: contestId, rounds };
    const r = plan ? await drawStudioAPI.updatePlan(plan.plan_id, body) : await drawStudioAPI.createPlan(body);
    await refreshPlan(r.plan.plan_id); return r;
  }, () => 'Draw settings saved (draft).');
  const lock = () => window.confirm('Approve and lock these draw settings? The eligible ticket pool is snapshotted and nothing can be edited afterwards.')
    && run(async () => { const r = await drawStudioAPI.lock(plan.plan_id); await refreshPlan(plan.plan_id); return r; }, (r) => `Locked. ${r.plan.pool_size} tickets snapshotted · pool hash ${r.plan.pool_hash_sha256.slice(0, 12)}…`);

  const tickets = pool?.tickets || [];
  const baseShow = (mode, rs) => ({ mode, title: pool?.contest?.title, poolCount: pool?.count || 0, poolNumbers: tickets.map((t) => t.ticket_number), rounds: rs });
  const preview = (all) => setShow(baseShow('preview', simulate(all ? rounds : rounds.slice(0, 1), tickets)));
  const official = async () => {
    if (!window.confirm(`Start the OFFICIAL ${rounds[nextRound].name}? The server draws the winners now; results are final and cannot be changed.`)) return;
    const r = await run(() => drawStudioAPI.drawRound(plan.plan_id, nextRound));
    if (!r) return;
    await refreshPlan(plan.plan_id);
    setShow({ ...baseShow('official', [{ ...rounds[nextRound], winners: r.result.winners }]), poolCount: r.result.candidate_count });
  };
  const replayOfficial = (i) => setShow({ ...baseShow('official', [{ ...rounds[i], winners: results[i].winners }]), poolCount: results[i].candidate_count });
  const announce = (i) => run(async () => { const r = await drawStudioAPI.announce(plan.plan_id, i); await refreshPlan(plan.plan_id); return r; },
    (r) => (r.idempotent_replay ? 'Already announced.' : 'Winner announcement published.'));
  const downloadReport = () => run(async () => {
    const data = await drawStudioAPI.report(plan.plan_id);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `${plan.plan_id}-audit.json`; a.click();
    return data;
  }, (d) => (d.verification?.verified ? 'Audit report downloaded — independent verification PASSED.' : 'Audit report downloaded.'));

  return (
    <div className="-m-4 min-h-screen bg-[#060927] p-4 pb-32 text-white sm:-m-6 sm:p-8 sm:pb-32" data-testid="draw-studio">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-amber-300"><Clapperboard className="h-4 w-4" /> Production</p>
          <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">Visual Draw Studio</h1>
          <p className="mt-2 max-w-xl text-sm text-indigo-200/70">Broadcast-quality, multi-round prize draws. Winners are chosen by the server's verifiable cryptographic draw; the show only reveals them.</p>
        </div>
        <label className="w-full max-w-sm"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-indigo-200/70">Competition</span>
          <select className="h-11 w-full rounded-xl border border-white/15 bg-[#0b0f33] px-3 text-sm" value={contestId} onChange={(e) => setContestId(e.target.value)} data-testid="draw-contest-select">
            <option value="">Select a Paid World contest</option>
            {contests.map((c) => <option key={c.contest_id} value={c.contest_id}>{c.title} · {c.eligible_tickets} tickets</option>)}
          </select>
        </label>
      </header>

      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" data-testid="draw-error">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-200" data-testid="draw-notice">{notice}</div>}

      {pool && <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-4" data-testid="draw-pool-summary">
            {[[Ticket, 'Eligible tickets', pool.count.toLocaleString('en-GB'), 'draw-pool-count'], [ShieldCheck, 'Pool hash', `${pool.pool_hash.slice(0, 10)}…`, 'draw-pool-hash'],
              [Sparkles, 'Prize budget', `${money(budget)} / ${money(published)}`, 'draw-budget'], [Lock, 'Status', plan ? plan.status : 'not saved', 'draw-plan-status']].map(([Icon, k, v, id]) => (
              <div key={k} className={`rounded-2xl border p-4 ${id === 'draw-budget' && budget > published ? 'border-rose-400/60 bg-rose-500/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-indigo-200/70"><Icon className="h-4 w-4 text-amber-300" />{k}</div>
                <div className="mt-1 text-xl font-black" data-testid={id}>{v}</div>
              </div>))}
          </section>
          {budget > published && <p className="text-sm font-bold text-rose-300" data-testid="draw-budget-error">Total prizes exceed the contest's published prize of {money(published)}.</p>}
          {pool.contest?.status === 'live' && !locked && <p className="rounded-xl border border-sky-400/40 bg-sky-400/10 p-3 text-sm text-sky-100" data-testid="draw-sales-open-notice">Ticket sales are still open for this contest. Close it before locking the official draw so every ticket is included.</p>}
          {!pool.official_draws_enabled && <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100" data-testid="draw-legal-notice">Official draws are switched off until the Random Draw engine is enabled in Company Settings after UK legal review (e.g. Gambling Act 2005 free-draw / prize-competition rules). Preview and rehearsal work now.</p>}

          <RoundsEditor rounds={rounds} setRounds={setRounds} locked={locked} results={results} />

          <div className="flex flex-wrap gap-3">
            {!locked && <button type="button" className={`${pill} bg-white text-[#0b0f33]`} disabled={busy || budget > published || !rounds.length} onClick={save} data-testid="draw-save"><Save className="h-4 w-4" />Save settings</button>}
            <button type="button" className={`${pill} bg-violet-500 text-white`} disabled={!tickets.length} onClick={() => preview(false)} data-testid="draw-preview"><PlayCircle className="h-4 w-4" />Preview Draw</button>
            <button type="button" className={`${pill} bg-violet-700 text-white`} disabled={!tickets.length} onClick={() => preview(true)} data-testid="draw-rehearsal"><Clapperboard className="h-4 w-4" />Full Rehearsal</button>
            {plan?.status === 'draft' && <button type="button" className={`${pill} bg-amber-400 text-[#1a1033]`} disabled={busy} onClick={lock} data-testid="draw-lock"><Lock className="h-4 w-4" />Approve &amp; lock</button>}
            {locked && nextRound < rounds.length && <button type="button" className={`${pill} bg-gradient-to-r from-amber-300 to-amber-500 text-[#1a1033] shadow-[0_0_30px_rgba(255,213,74,0.45)]`} disabled={busy || !pool.official_draws_enabled} onClick={official} data-testid="draw-official-start"><Sparkles className="h-4 w-4" />Start official {rounds[nextRound].name}</button>}
            {locked && <button type="button" className={`${pill} border border-white/20 text-white`} onClick={downloadReport} data-testid="draw-report"><FileCheck2 className="h-4 w-4" />Audit report</button>}
          </div>

          {results.length > 0 && <section className="rounded-2xl border border-amber-300/30 bg-amber-300/5 p-5" data-testid="draw-results">
            <h2 className="text-lg font-black text-amber-300">Official results (final)</h2>
            {results.map((r) => <div key={r.round_index} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3" data-testid={`draw-result-${r.round_index}`}>
              <div><b>{r.round_name}</b> · {r.winners.map((w) => `#${w.ticket_number} ${w.display_name} (${money(w.prize_amount)})`).join(', ')}<div className="text-[11px] text-indigo-200/60">Drawn {new Date(r.drawn_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })} · {r.candidate_count} candidates · prize pending Super Admin payout approval</div></div>
              <div className="flex gap-2">
                <button type="button" className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20" onClick={() => replayOfficial(r.round_index)} data-testid={`draw-result-replay-${r.round_index}`}>Replay show</button>
                <button type="button" className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/30 disabled:opacity-50" disabled={Boolean(r.announcement_id) || busy} onClick={() => announce(r.round_index)} data-testid={`draw-result-announce-${r.round_index}`}><Megaphone className="h-3 w-3" />{r.announcement_id ? 'Announced' : 'Publish announcement'}</button>
              </div>
            </div>)}
          </section>}
        </div>

        <aside className="space-y-6">
          <SoundPanel uploaded={uploaded} audio={audio} onUploaded={() => loadAudio(audio)} onError={setError} />
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5" data-testid="draw-history">
            <h2 className="flex items-center gap-2 text-lg font-black text-amber-300"><Download className="h-5 w-5" /> Draw plans</h2>
            {history.length ? history.map((h) => <div key={h.plan_id} className="mt-2 text-xs text-indigo-100">{h.plan_id} · {h.status} · {money(h.total_budget)} · {h.rounds.length} round(s)</div>) : <p className="mt-2 text-xs text-indigo-200/60">No plans yet for this contest.</p>}
          </section>
        </aside>
      </div>}

      {show && <DrawStage show={show} audio={audio} onClose={() => setShow(null)} />}
    </div>
  );
}
