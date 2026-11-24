import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShieldCheck, UserRound, ExternalLink, Activity, Clock3 } from 'lucide-react';
import { adminAPI } from '../../lib/api';

const pretty = (value) => value ? String(value).replaceAll('_', ' ') : 'Unknown';

export default function GameplayInvestigationAdmin() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminAPI.users().then(setUsers).catch(() => setUsers([]));
  }, []);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];
    return users.filter(user => [user.name, user.email, user.username, user.public_id, user.user_id].some(value => String(value || '').toLowerCase().includes(term))).slice(0, 30);
  }, [query, users]);

  const inspect = async (user) => {
    setSelected(user);
    setLoading(true);
    setReport(null);
    try { setReport(await adminAPI.user360(user.user_id)); }
    finally { setLoading(false); }
  };

  const integrity = report?.gameplay_integrity || {};

  return (
    <main className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><ShieldCheck className="h-6 w-6 text-rose-600" /> Gameplay Investigation</h1>
        <p className="mt-1 text-sm text-slate-500">Review server timing, input cadence, browser evidence, game attempts and fair-play signals for Paid World and Free World.</p>
      </div>

      <section className="border border-slate-200 bg-white p-4">
        <label className="relative block">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name, username, email, public ID or user ID" className="h-10 w-full border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-[#6C2BFF]" />
        </label>
        {!!matches.length && <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map(user => <button key={user.user_id} type="button" onClick={() => inspect(user)} className="flex items-center gap-3 border border-slate-200 p-3 text-left hover:border-[#6C2BFF]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100"><UserRound className="h-4 w-4 text-slate-600" /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{user.name || user.username || 'Player'}</span><span className="block truncate text-xs text-slate-500">{user.email || user.public_id || user.user_id}</span></span>
          </button>)}
        </div>}
      </section>

      {loading && <div className="border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Collecting all gameplay evidence...</div>}

      {selected && report && <>
        <section className="border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><div className="text-lg font-black text-slate-900">{report.identity?.name || selected.name || selected.email}</div><div className="text-xs text-slate-500">{report.identity?.email || selected.email} · {report.identity?.public_id || selected.user_id}</div></div>
            <Link to={`/admin/users/${selected.user_id}?section=fair-play`} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700"><ExternalLink className="h-4 w-4" /> Open full account and quarantine controls</Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric icon={ShieldCheck} label="Overall" value={pretty(integrity.overall_status)} tone={integrity.overall_status === 'high_risk' ? 'rose' : 'emerald'} />
            <Metric icon={Activity} label="Trust score" value={`${integrity.average_trust_score ?? 100}%`} />
            <Metric icon={Clock3} label="Attempts inspected" value={integrity.attempts_inspected ?? 0} />
            <Metric icon={ShieldCheck} label="High risk attempts" value={integrity.high_risk_count ?? 0} tone="rose" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">{Object.entries(integrity.source_counts || {}).map(([source, count]) => <span key={source} className="bg-slate-100 px-2 py-1 font-bold text-slate-600">{pretty(source)}: {count}</span>)}</div>
        </section>

        <section className="space-y-3">
          {(integrity.recent || []).map((row, index) => <Attempt key={`${row.source}-${row.reference}-${index}`} row={row} />)}
          {!(integrity.recent || []).length && <div className="border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No recorded gameplay evidence for this user.</div>}
        </section>
      </>}
    </main>
  );
}

function Metric({ icon: Icon, label, value, tone = 'slate' }) {
  const colors = tone === 'rose' ? 'border-rose-200 bg-rose-50 text-rose-800' : tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-900';
  return <div className={`border p-3 ${colors}`}><div className="flex items-center gap-1 text-[10px] font-black uppercase"><Icon className="h-3.5 w-3.5" />{label}</div><div className="mt-2 text-xl font-black">{value}</div></div>;
}

function Attempt({ row }) {
  const integrity = row.integrity || {};
  const evidence = integrity.evidence || {};
  return <article className="border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold text-slate-900">{row.game_type || 'Unknown game'}</div><div className="text-xs text-slate-500">{pretty(row.source)} · {row.reference} · {row.created_at ? new Date(row.created_at).toLocaleString('en-GB') : 'Date unavailable'}</div></div><span className={`px-2 py-1 text-xs font-black ${integrity.status === 'high_risk' ? 'bg-rose-100 text-rose-800' : integrity.status === 'review' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{integrity.trust_score ?? 100}% trust</span></div>
    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4"><div><b>Server duration:</b> {Number(row.duration_ms || 0).toLocaleString()}ms</div><div><b>Client duration:</b> {integrity.claimed_duration_ms != null ? `${Number(integrity.claimed_duration_ms).toLocaleString()}ms` : 'Unavailable'}</div><div><b>Actions:</b> {integrity.action_count ?? 0}</div><div><b>Median input gap:</b> {integrity.input_interval_median_ms != null ? `${integrity.input_interval_median_ms}ms` : 'Unavailable'}</div></div>
    <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-bold">Full browser and automation evidence</summary><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><div>Browser: {evidence.browser || 'Unavailable'}</div><div>IP address: {evidence.ip_address || 'Unavailable'}</div><div>Platform: {evidence.platform || 'Unavailable'}</div><div>Timezone: {evidence.timezone || 'Unavailable'}</div><div>Viewport: {evidence.viewport || 'Unavailable'}</div><div>Tab changes: {evidence.visibility_changes ?? 0}</div><div>WebDriver: {evidence.webdriver ? 'Reported' : 'Not reported'}</div><div>Inputs: {(evidence.input_sources || []).join(', ') || 'Unavailable'}</div><div>Tool indicators: {(evidence.automation_labels || []).join(', ') || 'None'}</div><div className="break-all sm:col-span-2 lg:col-span-3">User agent: {evidence.user_agent || 'Unavailable'}</div></div></details>
    {(integrity.signals || []).map(signal => <div key={signal.code} className={`mt-2 px-3 py-2 text-xs font-medium ${signal.severity === 'high' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}>{signal.message}</div>)}
  </article>;
}
