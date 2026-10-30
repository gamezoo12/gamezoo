import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, PlayCircle, Save, ShieldCheck, Sparkles, Ticket, Trophy, Volume2 } from 'lucide-react';
import { drawStudioAPI } from '../../lib/api';
import { DrawAudio, SOUND_SLOTS } from '../../components/drawstudio/drawAudio';
import { DrawTheatre } from '../../components/drawstudio/studio/DrawTheatre';
import { RoundsEditor, newRound, normaliseRounds } from '../../components/drawstudio/RoundsEditor';
import { FlowPanel, ResultsPanel, TotalsRow } from '../../components/drawstudio/StudioPanels';
import { downloadBlob } from '../../components/drawstudio/studio/useRecorder';

const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : 'Request failed'; };
const money = (v) => `£${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pill = 'inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-black transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40';
const card = 'rounded-2xl border border-white/10 bg-gradient-to-b from-[#15103f] to-[#0b0724] p-5';

function Stat({ icon: Icon, label, value, id }) {
  return <div className="rounded-xl border border-white/10 bg-[#0b0724] p-3"><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-200/60"><Icon className="h-3.5 w-3.5 text-amber-300" />{label}</div><div className="mt-1 text-lg font-black text-white" data-testid={id}>{value}</div></div>;
}

export default function DrawStudio() {
  const [contests, setContests] = useState([]);
  const [contestId, setContestId] = useState('');
  const [pool, setPool] = useState(null);
  const [plan, setPlan] = useState(null);
  const [results, setResults] = useState([]);
  const [rounds, setRounds] = useState([newRound(1)]);
  const [audio, setAudio] = useState(null);
  const [show, setShow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    drawStudioAPI.contests().then((r) => setContests(r.contests)).catch((e) => setError(errText(e)));
    const engine = new DrawAudio();
    setAudio(engine);
    drawStudioAPI.audio().then((r) => { engine.setVolumes(r.volumes); return engine.load(r.audio.map((a) => a.slot)); }).catch(() => engine.load([]));
    return () => engine.close();
  }, []);

  const refreshPlan = useCallback(async (planId) => {
    const full = await drawStudioAPI.plan(planId);
    setPlan(full.plan); setResults(full.results); setRounds(normaliseRounds(full.plan.rounds));
  }, []);
  useEffect(() => {
    setError(''); setNotice(''); setPool(null); setPlan(null); setResults([]);
    if (!contestId) return;
    Promise.all([drawStudioAPI.pool(contestId), drawStudioAPI.plans(contestId)]).then(async ([p, plans]) => {
      setPool(p);
      const current = plans.plans.find((x) => x.status !== 'draft') || plans.plans[0];
      if (current) await refreshPlan(current.plan_id); else setRounds([newRound(1)]);
    }).catch((e) => setError(errText(e)));
  }, [contestId, refreshPlan]);

  const budget = useMemo(() => rounds.reduce((a, r) => a + Number(r.prize_amount || 0) * Number(r.num_winners || 0), 0), [rounds]);
  const published = Number(pool?.contest?.prize_amount || 0);
  const locked = Boolean(plan && plan.status !== 'draft');
  const finished = locked && results.length === rounds.length && results.every((r) => r.revealed_at);
  const run = async (fn, ok) => { setBusy(true); setError(''); setNotice(''); try { const r = await fn(); if (ok) setNotice(ok(r)); return r; } catch (e) { setError(errText(e)); return null; } finally { setBusy(false); } };

  const save = () => run(async () => {
    const body = { contest_id: contestId, rounds };
    const r = plan ? await drawStudioAPI.updatePlan(plan.plan_id, body) : await drawStudioAPI.createPlan(body);
    await refreshPlan(r.plan.plan_id); return r;
  }, () => 'Draw settings saved as a draft.');
  const lock = () => window.confirm('Approve and lock these draw settings? The eligible ticket pool is frozen and the settings cannot be edited afterwards.')
    && run(async () => { const r = await drawStudioAPI.lock(plan.plan_id); await refreshPlan(plan.plan_id); return r; }, (r) => `Locked. ${r.plan.pool_size} tickets frozen · pool hash ${r.plan.pool_hash_sha256.slice(0, 12)}…`);
  const report = () => run(async () => { const d = await drawStudioAPI.report(plan.plan_id); downloadBlob(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), `${plan.plan_id}-audit.json`); return d; },
    (d) => (d.verification?.verified ? 'Audit report downloaded · independent verification PASSED.' : 'Audit report downloaded.'));
  const testSounds = () => SOUND_SLOTS.forEach((s, i) => setTimeout(() => { audio?.stopAll(); audio?.play(s); }, i * 900));
  const tickets = pool?.tickets || [];
  const contest = { contest_id: contestId, title: pool?.contest?.title };
  const official = () => window.confirm(`Open the OFFICIAL studio for ${contest.title}? When you press Draw, the server picks the winner from the frozen ticket pool. Results are final.`) && setShow({ mode: 'official' });

  return (
    <div className="-m-4 min-h-screen bg-[#07041a] p-4 pb-32 text-white sm:-m-6 sm:p-8 sm:pb-32" data-testid="draw-studio">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Draw Studio</h1>
          <p className="mt-2 max-w-xl text-sm text-indigo-200/70">Create, preview and run broadcast-quality ticket draws for Paid World contests. The server picks every official winner; the show only reveals it.</p>
        </div>
        <span className={`rounded-full border px-4 py-1.5 text-xs font-black tracking-widest ${pool?.official_draws_enabled ? 'border-emerald-400/50 text-emerald-300' : 'border-sky-400/50 text-sky-300'}`} data-testid="draw-mode-badge">{pool?.official_draws_enabled ? 'OFFICIAL DRAWS ENABLED' : 'PREVIEW MODE'}</span>
      </header>
      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" data-testid="draw-error">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-200" data-testid="draw-notice">{notice}</div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className={card}>
            <h2 className="text-lg font-black">1. Select Contest</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <select className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-[#0b0724] px-3 text-sm" value={contestId} onChange={(e) => setContestId(e.target.value)} data-testid="draw-contest-select">
                <option value="">Select a Paid World contest</option>
                {contests.map((c) => <option key={c.contest_id} value={c.contest_id}>{c.title} · {c.eligible_tickets} tickets</option>)}
              </select>
              {pool && <span className="rounded-lg border border-emerald-400/40 px-3 py-1 text-xs font-bold capitalize text-emerald-300" data-testid="draw-contest-status">{pool.contest.status}</span>}
            </div>
            {pool && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="draw-pool-summary">
              <Stat icon={Ticket} label="Eligible tickets" value={pool.count.toLocaleString('en-GB')} id="draw-pool-count" />
              <Stat icon={Trophy} label="Published prize" value={money(published)} id="draw-published-prize" />
              <Stat icon={ShieldCheck} label="Pool hash" value={`${(plan?.pool_hash_sha256 || pool.pool_hash).slice(0, 10)}…`} id="draw-pool-hash" />
              <Stat icon={Lock} label="Draw status" value={plan ? plan.status.replace('_', ' ') : 'not saved'} id="draw-plan-status" />
            </div>}
          </section>

          {pool && <section className={card}>
            <h2 className="text-lg font-black">2. Configure Draw Rounds</h2>
            <p className="mb-3 mt-1 text-xs text-indigo-200/60">Every round uses this contest's ticket pool. Durations are in seconds. Tick "Repeat" to let earlier winners win again.</p>
            <RoundsEditor rounds={rounds} setRounds={setRounds} locked={locked} results={results} />
            <TotalsRow rounds={rounds} budget={budget} published={published} />
            {budget > published && <p className="mt-2 text-sm font-bold text-rose-300" data-testid="draw-budget-error">Total prizes exceed the contest's published prize of {money(published)}.</p>}
            {pool.contest?.status === 'live' && !locked && <p className="mt-3 rounded-xl border border-sky-400/40 bg-sky-400/10 p-3 text-sm text-sky-100" data-testid="draw-sales-open-notice">Ticket sales are still open. Close the contest before locking the official draw so every ticket is included.</p>}
            {!pool.official_draws_enabled && <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100" data-testid="draw-legal-notice">Official draws are switched off until the Random Draw engine is enabled in Company Settings after UK legal review. Preview works now.</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              {!locked && <button type="button" className={`${pill} bg-white text-[#0b0724]`} disabled={busy || budget > published} onClick={save} data-testid="draw-save"><Save className="h-4 w-4" />Save settings</button>}
              {plan?.status === 'draft' && <button type="button" className={`${pill} border border-amber-300/60 text-amber-200`} disabled={busy} onClick={lock} data-testid="draw-lock"><Lock className="h-4 w-4" />Approve &amp; lock</button>}
              <button type="button" className={`${pill} bg-[#3b6bff] text-white`} disabled={!tickets.length || budget > published} onClick={() => setShow({ mode: 'preview' })} data-testid="draw-preview"><PlayCircle className="h-4 w-4" />Preview Full Draw</button>
              <button type="button" className={`${pill} border border-white/20 text-white`} onClick={testSounds} data-testid="draw-test-sounds"><Volume2 className="h-4 w-4" />Test Sounds</button>
              {locked && <button type="button" className={`${pill} bg-gradient-to-r from-amber-300 to-amber-500 text-[#1a1033] shadow-[0_0_30px_rgba(255,213,74,0.35)]`} disabled={busy || !pool.official_draws_enabled} onClick={official} data-testid="draw-official-start"><Sparkles className="h-4 w-4" />{finished ? 'Open finale' : results.length ? 'Continue Official Draw' : 'Start Official Draw'}</button>}
            </div>
          </section>}
          <ResultsPanel results={results} rounds={rounds} busy={busy} onReport={report} onReplay={(i) => setShow({ mode: 'replay', round: i })} />
        </div>
        {pool && <aside className="space-y-6"><FlowPanel rounds={rounds} /></aside>}
      </div>

      {show && <DrawTheatre key={JSON.stringify(show)} mode={show.mode} contest={contest} audio={audio} plan={plan} tickets={tickets}
        rounds={show.mode === 'replay' ? [rounds[show.round]] : rounds} results={show.mode === 'replay' ? [] : results}
        replayWinners={show.mode === 'replay' ? results[show.round]?.winners : null}
        onChanged={() => plan && refreshPlan(plan.plan_id)} onClose={() => setShow(null)} />}
    </div>
  );
}
