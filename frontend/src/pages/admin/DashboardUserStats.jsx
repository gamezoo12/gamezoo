import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';

function Tile({ label, value, sub, testid }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4" data-testid={testid}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-display text-2xl font-extrabold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

const n = (v) => (v ?? 0).toLocaleString();

export default function DashboardUserStats() {
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = () => adminAPI.userStats().then((d) => { setStats(d); setFailed(false); }).catch(() => setFailed(true));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (failed && !stats) return <div className="text-sm text-rose-600">User statistics are unavailable.</div>;
  if (!stats) return <div className="text-sm text-slate-400">Loading user statistics…</div>;
  const { registrations: r, activity: a, active_players_today: p, entering_today: e } = stats;
  return (
    <section className="space-y-3" data-testid="dashboard-user-stats">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold text-slate-900">Users and activity</h2>
        <span className="text-[11px] text-slate-400" title={stats.definitions.excluded}>Players only · staff excluded · {stats.timezone}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Tile testid="stat-total-users" label="Registered users" value={n(r.total)} />
        <Tile testid="stat-new-today" label="New today" value={n(r.new_today)} />
        <Tile testid="stat-new-week" label="New (7 days)" value={n(r.new_last_7_days)} />
        <Tile testid="stat-verified" label="Verified" value={n(r.verified)} />
        <Tile testid="stat-unverified" label="Unverified" value={n(r.unverified)} />
        <Tile testid="stat-active-now" label="Active now" value={n(a.currently_active)} sub="last 5 minutes" />
        <Tile testid="stat-dau" label="DAU" value={n(a.dau)} sub="today" />
        <Tile testid="stat-wau" label="WAU" value={n(a.wau)} sub="7 days" />
        <Tile testid="stat-mau" label="MAU" value={n(a.mau)} sub="30 days" />
        <Tile testid="stat-free-world" label="Free World players" value={n(p.free_world)} sub="today" />
        <Tile testid="stat-paid-world" label="Paid World players" value={n(p.paid_world)} sub="today" />
        <Tile testid="stat-challenges" label="Challenge players" value={n(p.impossible_challenges)} sub="today" />
        <Tile testid="stat-paid-entries" label="Entering paid contests" value={n(e.paid_competitions)} sub="today" />
        <Tile testid="stat-free-entries" label="Entering free contests" value={n(e.free_competitions)} sub="today" />
      </div>
      <ul className="list-disc pl-5 text-[11px] text-slate-400">
        {stats.data_notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </section>
  );
}
