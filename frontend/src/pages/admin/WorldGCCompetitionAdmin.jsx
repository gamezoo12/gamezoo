import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDot, FlaskConical, Lock, Save } from 'lucide-react';
import { worldGcCompetitionAdminAPI } from '../../lib/api';
import { GCPreviewPanel } from '../../components/admin/GCPreviewPanel';
import { GAME_CATALOG } from '../../lib/gameCatalog';
import { DIFFICULTY_LEVELS } from '../../lib/difficulty';
import { GAME_MAP } from '../../components/games';
import { GamePreviewDialog } from '../../components/games/GamePreviewDialog';

const gcOptions = Array.from({ length: 50 }, (_, index) => index + 4);
const gameNames = { ...Object.fromEntries(GAME_CATALOG.map((g) => [g.id, g.label])), colour_match: 'Colour Match (Free World, server-checked)' };
const allGameIds = GAME_CATALOG.map((g) => g.id);
const defaultRewards = { '1': 5, '2': 4, '3': 3, '4': 2, '5': 1 };
const fieldClass = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-400';
const labelClass = 'mb-1 block text-xs font-semibold text-slate-600';
const londonTime = (value) => (value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }) : '—');
const errText = (e, fallback) => {
  const detail = e?.response?.data?.detail;
  return typeof detail === 'string' ? detail : detail?.message || e?.message || fallback;
};

function StatusPipeline({ status, hasDraft }) {
  const steps = [
    ['Saved as Draft', hasDraft || status !== 'draft'],
    ['Apply Settings', status === 'active' || status === 'completed'],
    [status === 'completed' ? 'Completed' : 'Active for Eligible Levels', status === 'active' || status === 'completed'],
  ];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-bold" data-testid="gc-status-pipeline">
      {steps.map(([label, done], index) => <li key={label} className={`flex items-center gap-1 rounded-full px-3 py-1 ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}{label}{index < 2 && <span className="ml-1 text-slate-400">→</span>}
      </li>)}
      <li className="ml-2 rounded bg-slate-900 px-2 py-1 uppercase tracking-wide text-white" data-testid="gc-config-status">{status}{hasDraft && status !== 'draft' ? ' · unapplied draft' : ''}</li>
    </ol>
  );
}

function GameFields({ row, onChange, disabled, options, onPreview }) {
  const cfg = row.game_config || {};
  const setCfg = (patch) => onChange({ game_config: { ...cfg, ...patch } });
  return <>
    <label><span className={labelClass}>Game</span><select className={fieldClass} disabled={disabled} value={row.game_id || ''} onChange={(e) => onChange({ game_id: e.target.value || null, game_config: {} })} data-testid={`gc-game-${row.level ?? 'champion'}`}>
      <option value="">Choose game</option>{(row.game_id && !options.includes(row.game_id) ? [row.game_id, ...options] : options).map((g) => <option key={g} value={g}>{gameNames[g] || g}</option>)}
    </select></label>
    {row.game_id === 'memory_match' && <label><span className={labelClass}>Card pairs</span><input className={fieldClass} disabled={disabled} type="number" min="2" max="16" value={cfg.pair_count ?? 6} onChange={(e) => setCfg({ pair_count: Number(e.target.value) })} /></label>}
    {row.game_id === 'colour_match' && <>
      <label><span className={labelClass}>Colours</span><input className={fieldClass} disabled={disabled} type="number" min="2" max="11" value={cfg.colours ?? 6} onChange={(e) => setCfg({ colours: Number(e.target.value) })} /></label>
      <label><span className={labelClass}>Rounds</span><input className={fieldClass} disabled={disabled} type="number" min="1" max="100" value={cfg.rounds ?? 10} onChange={(e) => setCfg({ rounds: Number(e.target.value) })} /></label>
    </>}
    {row.game_id && row.game_id !== 'memory_match' && row.game_id !== 'colour_match' && <label><span className={labelClass}>Difficulty</span><select className={fieldClass} disabled={disabled} value={cfg.difficulty ?? 3} onChange={(e) => setCfg({ difficulty: Number(e.target.value) })} data-testid={`gc-difficulty-${row.level ?? 'champion'}`}>
      {DIFFICULTY_LEVELS.map((d) => <option key={d.level} value={d.level}>Level {d.level} · {d.name}</option>)}
    </select></label>}
    {row.game_id && GAME_MAP[row.game_id] && <button type="button" className="self-end rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white" onClick={() => onPreview(row)} data-testid={`gc-preview-game-${row.level ?? 'champion'}`}>Preview game</button>}
  </>;
}

export default function WorldGCCompetitionAdmin() {
  const [gcNumber, setGcNumber] = useState(4);
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [reportLevel, setReportLevel] = useState('L1');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [gamePreview, setGamePreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => worldGcCompetitionAdminAPI.get(gcNumber).then((result) => {
    setData(result);
    setDraft({ model: result.draft?.model || 'champion_only', levels: result.draft?.levels || [], champion: result.draft?.champion || {} });
  }), [gcNumber]);

  useEffect(() => {
    setLoading(true); setError(''); setNotice('');
    load().catch((e) => setError(errText(e, 'Could not load this GC configuration.'))).finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    let active = true;
    setReportLoading(true);
    worldGcCompetitionAdminAPI.report(gcNumber, reportLevel).then((result) => { if (active) setReport(result); })
      .catch(() => { if (active) setReport(null); }).finally(() => { if (active) setReportLoading(false); });
    return () => { active = false; };
  }, [gcNumber, reportLevel]);

  const states = data?.level_states;
  const status = data?.config?.activation_status || 'draft';
  const isActiveGc = Boolean(states?.is_active_gc);
  const notStarted = states && !states.has_started && !isActiveGc;
  const engineLocked = data?.config?.engine === 'every_level_engine' || (status !== 'draft' && !data?.config?.engine && data?.config?.model === 'every_level');
  // Apply to Future GC re-derives the engine, so a GC that has not started is never limited to Memory Match.
  const fullEngine = engineLocked && Boolean(states?.has_started || isActiveGc);
  const gameOptions = fullEngine ? ['memory_match'] : allGameIds;

  const rowFor = (n) => draft.levels.find((r) => Number(r.level) === n) || { level: n, bonus_rewards: defaultRewards };
  const updateLevel = (n, patch) => setDraft((cur) => ({ ...cur, levels: [...cur.levels.filter((r) => Number(r.level) !== n), { ...rowFor(n), ...patch, level: n }].sort((a, b) => a.level - b.level) }));

  const runAction = async (fn, success) => {
    setSaving(true); setError(''); setNotice('');
    try { const result = await fn(); setNotice(success(result)); await load(); } catch (e) { setError(errText(e, 'Request failed.')); } finally { setSaving(false); }
  };
  const saveDraft = (event) => {
    event.preventDefault();
    const body = { model: draft.model, levels: draft.levels.map(({ level, game_id: gameId, game_config: gameConfig, bonus_rewards: rewards }) => ({ level, game_id: gameId, game_config: gameConfig || {}, bonus_rewards: { ...defaultRewards, ...rewards } })),
      champion: { game_id: draft.champion?.game_id || null, game_config: draft.champion?.game_config || {} } };
    runAction(() => worldGcCompetitionAdminAPI.saveDraft(gcNumber, body), () => 'Draft saved. Gameplay is unchanged until you apply it.');
  };
  const applyCurrent = () => window.confirm(`Apply the saved draft to GC${gcNumber} from Level ${states?.next_unopened_level || 'Champion'} onward? Already-opened levels, scores, attempts and rewards stay unchanged.`)
    && runAction(() => worldGcCompetitionAdminAPI.applyCurrent(gcNumber), (r) => r.idempotent_replay ? (r.message || 'Already applied — nothing changed.')
      : `Applied to Level${r.affected_levels.length === 1 ? '' : 's'} ${r.affected_levels.join(', ') || '—'}${r.champion_affected ? ' + Champion game' : ''}: ${(r.config?.levels || []).filter((l) => r.affected_levels.includes(l.level)).map((l) => `L${l.level} ${l.game_id}`).join(', ')}${r.champion_affected ? `, Champion ${r.config?.champion?.game_id}` : ''}. Levels ${r.locked_levels.join(', ') || '—'} kept their existing settings.`);
  const applyFuture = () => window.confirm(`Apply the saved draft to GC${gcNumber}? It takes effect when GC${gcNumber} starts on the existing schedule.`)
    && runAction(() => worldGcCompetitionAdminAPI.applyFuture(gcNumber), (r) => r.idempotent_replay ? 'Already applied — nothing changed.' : `GC${gcNumber} settings applied; they start with its existing schedule.`);

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-testid="world-gc-settings">
      {gamePreview && <GamePreviewDialog gameId={gamePreview.row.game_id} difficulty={gamePreview.row.game_config?.difficulty || 3} context={gamePreview.label} onClose={() => setGamePreview(null)} />}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950">GC Competition Settings</h1>
          <p className="mt-1 text-sm text-slate-500">Model, game and Bonus Tokens per GC. Dates and times always come from the Free World scheduler.</p>
        </div>
        <label className="w-44"><span className={labelClass}>GC selection</span>
          <select className={fieldClass} value={gcNumber} onChange={(event) => setGcNumber(Number(event.target.value))} data-testid="gc-select">
            {gcOptions.map((gc) => <option key={gc} value={gc}>GC{gc}{states?.active_gc === gc ? ' · live' : ''}</option>)}
          </select>
        </label>
      </header>

      {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" data-testid="gc-error">{error}</div>}
      {notice && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" data-testid="gc-notice">{notice}</div>}
      {loading || !draft ? <div role="status" className="p-8 text-center text-sm text-slate-500">Loading configuration…</div> : <>
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" data-testid="legacy-gc-context">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-slate-900">GC{gcNumber} · {isActiveGc ? 'Live now' : states?.has_started ? 'Finished' : 'Not started'} <span className="font-normal text-slate-500">({data.legacy_contest?.status || 'scheduler-managed'})</span></h2>
            <StatusPipeline status={status} hasDraft={data.has_unapplied_draft} />
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6" data-testid="gc-existing-schedule-preview">
            {(states?.levels || []).map((row) => <div key={row.level} className={`rounded-md border p-2 ${row.opened ? 'border-slate-200 bg-slate-50' : 'border-emerald-200 bg-emerald-50'}`} data-testid={`gc-level-state-${row.level}`}>
              <div className="flex items-center justify-between font-bold">Level {row.level}{row.opened && <Lock className="h-3 w-3 text-slate-400" />}</div>
              <div className="text-slate-500">{londonTime(row.opens_at)}</div>
              <div className="font-semibold">{row.game_id ? `${gameNames[row.game_id]} · ${row.applied_model === 'every_level' ? 'Every-Level' : 'Champion-Only'}` : 'Existing settings'}</div>
            </div>)}
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2" data-testid="gc-level-state-champion"><div className="font-bold">Champion</div><div className="text-slate-500">{londonTime(states?.champion?.opens_at)} → {londonTime(states?.champion?.closes_at)}</div><div className="font-semibold">{states?.champion?.game_id ? gameNames[states.champion.game_id] : 'Existing settings'}</div></div>
          </div>
          <p className="text-xs text-slate-500">Read-only schedule (Europe/London). Use the existing +24h Champion extension in Free World Admin for any time change.</p>
        </section>

        {isActiveGc && <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" data-testid="gc-live-rules">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{states.next_unopened_level ? `Changes apply from Level ${states.next_unopened_level} onward` : states.champion_unopened ? 'All numbered levels are open; only the Champion game can still change' : 'Every level has opened; nothing can be applied to this GC'}. Opened levels are locked. Any of the registered skill games can be chosen for the remaining levels.</p>
        </div>}

        <form onSubmit={saveDraft} className="space-y-5">
          <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4" data-testid="gc-effective-config">
            <h2 className="font-bold text-slate-900">Effective configuration (what players receive)</h2>
            <table className="mt-2 w-full text-left text-xs"><thead><tr className="text-slate-500"><th className="p-1">Level</th><th>Effective game</th><th>Pending selection</th><th>Status</th><th>Changes</th></tr></thead><tbody>
              {(states?.levels || []).map((r) => <tr key={r.level} className="border-t" data-testid={`gc-effective-row-${r.level}`}>
                <td className="p-1 font-semibold">{r.level}</td><td data-testid={`gc-effective-game-${r.level}`}>{gameNames[r.effective_game_id] || r.effective_game_id || '—'}</td>
                <td>{r.pending_game_id ? (gameNames[r.pending_game_id] || r.pending_game_id) : '—'}</td><td>{r.status}</td>
                <td>{r.eligible ? 'Eligible' : 'Locked'}</td></tr>)}
              <tr className="border-t"><td className="p-1 font-semibold">Champion</td><td data-testid="gc-effective-game-champion">{gameNames[states?.champion?.effective_game_id] || states?.champion?.effective_game_id || '—'}</td>
                <td>{states?.champion?.pending_game_id ? (gameNames[states.champion.pending_game_id] || states.champion.pending_game_id) : '—'}</td><td>{states?.champion?.opened ? 'Open' : 'Upcoming'}</td><td>{states?.champion_unopened ? 'Eligible' : 'Locked'}</td></tr>
            </tbody></table>
            <p className="mt-2 text-xs text-slate-500" data-testid="gc-last-apply">{states?.last_apply ? `Last applied ${londonTime(states.last_apply.at)} (${states.last_apply.scope}): ${states.last_apply.levels.map((l) => `L${l.level} ${l.game_id}`).join(', ') || 'no level changes'}` : 'No settings applied yet.'}</p>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-bold text-slate-900">Competition model</h2>
            <div className="mt-3 max-w-md">
              <select className={fieldClass} value={draft.model} disabled={fullEngine || status === 'completed'} onChange={(event) => setDraft((cur) => ({ ...cur, model: event.target.value }))} data-testid="gc-model-select">
                <option value="champion_only">Champion-Only</option>
                <option value="every_level">Every-Level + Champion</option>
              </select>
            </div>
          </section>

          <section className="space-y-3" data-testid="gc-level-settings">
            <h2 className="font-bold text-slate-900">Levels 1–10</h2>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const row = rowFor(n);
              const locked = (isActiveGc && n < (states.next_unopened_level || 11)) || status === 'completed';
              return <article key={n} className={`rounded-lg border p-4 ${locked ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`} data-testid={`gc-level-card-${n}`}>
                <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-800">Level {n}</h3>{locked && <span className="flex items-center gap-1 text-xs font-semibold text-slate-500"><Lock className="h-3 w-3" /> Opened — existing settings kept</span>}</div>
                {locked ? <div className="space-y-2 text-sm text-slate-600" data-testid={`gc-level-locked-${n}`}><p>Running: <b>{gameNames[states?.levels?.[n - 1]?.effective_game_id] || states?.levels?.[n - 1]?.effective_game_id || 'Number Sequence'}</b>{states?.levels?.[n - 1]?.applied_model === 'every_level' ? ' · Every-Level Bonus Tokens' : ''}</p>{(row.game_id && row.game_id !== states?.levels?.[n - 1]?.effective_game_id) && <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-2 font-semibold text-amber-900" data-testid={`gc-level-locked-notice-${n}`}>Level {n} is already open. Its game is locked to protect existing player progress. Your new selection ({gameNames[row.game_id] || row.game_id}) has not been applied to this level.</p>}</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <GameFields row={row} disabled={locked} options={gameOptions} onPreview={(r) => setGamePreview({ row: r, label: `${draft.model === 'every_level' ? 'Free World Every-Level' : 'Free World Champion-Only'} · GC ${gcNumber} · Level ${n}` })} onChange={(patch) => updateLevel(n, patch)} />
                  {draft.model === 'every_level' && [1, 2, 3, 4, 5].map((rank) => <label key={rank}><span className={labelClass}>{rank}{['st', 'nd', 'rd', 'th', 'th'][rank - 1]} place · Bonus Tokens</span><input className={fieldClass} disabled={locked} type="number" min="0" max="500" step="1" value={row.bonus_rewards?.[String(rank)] ?? defaultRewards[String(rank)]} onChange={(e) => updateLevel(n, { bonus_rewards: { ...defaultRewards, ...row.bonus_rewards, [String(rank)]: Number(e.target.value) } })} data-testid={`gc-bonus-${n}-${rank}`} /></label>)}
                </div>}
              </article>;
            })}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4" data-testid="gc-champion-settings">
            <h2 className="font-bold text-slate-900">Champion Level game</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <GameFields row={draft.champion || {}} onPreview={(r) => setGamePreview({ row: r, label: `${draft.model === 'every_level' ? 'Free World Every-Level' : 'Free World Champion-Only'} · GC ${gcNumber} · Champion Level` })} disabled={(isActiveGc && !states.champion_unopened) || status === 'completed'} options={gameOptions} onChange={(patch) => setDraft((cur) => ({ ...cur, champion: { ...cur.champion, ...patch } }))} />
            </div>
            <p className="mt-2 text-xs text-slate-500">Champion prizes stay in the existing World Champion prize settings.</p>
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setShowPreview((v) => !v)} className="inline-flex h-10 items-center gap-2 rounded-full border border-indigo-300 bg-white px-4 text-sm font-bold text-indigo-800 transition-colors hover:bg-indigo-50" data-testid="gc-open-preview"><FlaskConical className="h-4 w-4" /> {showPreview ? 'Close Preview' : 'Open Preview'}</button>
            <button type="submit" disabled={saving || status === 'completed'} className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-50" data-testid="gc-save-draft"><Save className="h-4 w-4" /> {saving ? 'Working…' : 'Save Draft'}</button>
            {isActiveGc && <button type="button" onClick={applyCurrent} disabled={saving || !data.has_unapplied_draft || (!states.next_unopened_level && !states.champion_unopened)} className="h-10 rounded-full bg-emerald-700 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-800 disabled:opacity-40" data-testid="gc-apply-current">Apply to Current GC</button>}
            {notStarted && <button type="button" onClick={applyFuture} disabled={saving || !data.has_unapplied_draft} className="h-10 rounded-full bg-indigo-700 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-800 disabled:opacity-40" data-testid="gc-apply-future">Apply to Future GC</button>}
          </div>
          {!data.has_unapplied_draft && status !== 'draft' && <p className="text-right text-xs text-slate-500">Applied settings are live. Save a new draft to change remaining unopened levels.</p>}
        </form>

        {showPreview && <GCPreviewPanel gcNumber={gcNumber} />}

        {data.audit?.length > 0 && <section className="rounded-lg border border-slate-200 bg-white p-4 text-xs" data-testid="gc-audit-log">
          <h2 className="mb-2 text-sm font-bold text-slate-900">Apply history</h2>
          {data.audit.map((a) => <div key={a.audit_id} className="border-t py-1">{londonTime(a.created_at)} · {a.action} by {a.actor_email} · levels {(a.affected_levels || []).join(', ') || '—'}{a.champion_affected ? ' + Champion' : ''}</div>)}
        </section>}

        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" data-testid="gc-admin-report">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-bold text-slate-900">Leaderboard and attempt report</h2><p className="text-xs text-slate-500">Completion times use server measurements. Provisional awards are not wallet credits.</p></div>
            <label className="w-48"><span className={labelClass}>Level report</span><select className={fieldClass} value={reportLevel} onChange={(event) => setReportLevel(event.target.value)}>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={`L${index + 1}`}>Level {index + 1}</option>)}<option value="champion">Champion Level</option></select></label>
          </header>
          {reportLoading ? <p role="status" className="text-sm text-slate-500">Loading report…</p> : <>
            <div className="grid gap-3 lg:grid-cols-2">
              <div><h3 className="mb-1 text-sm font-semibold text-slate-700">Best times</h3><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="text-slate-500"><th className="p-2">Rank</th><th>User</th><th>Time</th><th>Clicks</th><th>Reward</th></tr></thead><tbody>
                {(report?.leaderboard || []).map((row) => <tr key={row.user_id} className="border-t"><td className="p-2">{row.rank}</td><td>{row.user_name || row.user_id}</td><td>{(Number(row.duration_ms) / 1000).toFixed(2)}s</td><td>{row.click_count}</td><td>{reportLevel === 'champion' ? 'Champion prize rules' : report?.rewards?.[String(row.rank)] != null ? `${report.rewards[String(row.rank)]} Bonus Tokens${report.finalization ? '' : ' · provisional'}` : '—'}</td></tr>)}
                {!report?.leaderboard?.length && <tr><td className="p-3 text-slate-500" colSpan="5">No completed attempts.</td></tr>}
              </tbody></table></div></div>
              <div><h3 className="mb-1 text-sm font-semibold text-slate-700">Attempts</h3><div className="max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="text-slate-500"><th className="p-2">Started</th><th>User</th><th>Status</th><th>Time</th><th>Clicks</th></tr></thead><tbody>
                {(report?.attempts || []).map((row) => <tr key={row.attempt_id} className="border-t"><td className="p-2">{row.started_at ? new Date(row.started_at).toLocaleString() : '—'}</td><td>{row.user_id}</td><td>{row.status}</td><td>{row.duration_ms == null ? '—' : `${(Number(row.duration_ms) / 1000).toFixed(2)}s`}</td><td>{row.click_count || 0}</td></tr>)}
                {!report?.attempts?.length && <tr><td className="p-3 text-slate-500" colSpan="5">No attempts recorded.</td></tr>}
              </tbody></table></div></div>
            </div>
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700">
              <b>Level reward records:</b> {report?.bonus_awards?.length ? report.bonus_awards.map((award) => `${award.user_id}: ${award.bonus_tokens} tokens · ${award.status}`).join(' | ') : 'None'}
              {report?.finalization && <span> · Finalized {new Date(report.finalization.finalized_at).toLocaleString()}</span>}
              {reportLevel === 'champion' && report?.champion_awards?.length > 0 && <div className="mt-1"><b>Champion awards:</b> {report.champion_awards.map((award) => `${award.user_id}: ${award.champion_prize_tokens} Champion tokens + ${award.accumulated_bonus_tokens} bonus · ${award.status}`).join(' | ')}</div>}
            </div>
          </>}
        </section>
      </>}
    </div>
  );
}
