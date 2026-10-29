import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { periodLabel } from '../../components/admin/PeriodFilter';

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

export default function DashboardUserStats({ period }) {
  const [review, setReview] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReview(null);
    adminAPI.businessReview(period).then((d) => { if (!cancelled) { setReview(d); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [period]);

  if (failed) return <div className="text-sm text-rose-600">User statistics are unavailable.</div>;
  if (!review) return <div className="text-sm text-slate-400">Loading user statistics…</div>;
  const { users, worlds } = review;
  const sub = periodLabel(period);
  return (
    <section className="space-y-3" data-testid="dashboard-user-stats">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold text-slate-900">Users and activity · {sub}</h2>
        <span className="text-[11px] text-slate-400" title={review.definitions.excluded}>Players only · staff excluded · {review.timezone}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Tile testid="stat-total-users" label="Registered users" value={n(users.registered_total)} sub="as of period end" />
        <Tile testid="stat-signups" label="New signups" value={n(users.signups)} sub="in period" />
        <Tile testid="stat-active" label="Active users" value={n(users.active)} sub="unique, in period" />
        <Tile testid="stat-free-world" label="Free World players" value={n(worlds.free_world?.participants)} sub="in period" />
        <Tile testid="stat-paid-world" label="Paid World players" value={n(worlds.paid_world?.participants)} sub="in period" />
        <Tile testid="stat-challenges" label="Challenge players" value={n(worlds.impossible_challenges?.participants)} sub="in period" />
        <Tile testid="stat-paid-entries" label="Paid contest entries" value={n(worlds.paid_world?.entries)} sub="in period" />
        <Tile testid="stat-free-entries" label="Free contest entries" value={n(worlds.free_world?.entries)} sub="in period" />
      </div>
      <ul className="list-disc pl-5 text-[11px] text-slate-400">
        <li>{review.definitions.active_users}</li>
        <li>Interaction pings began with the activity tracking release; earlier activity is derived only from gameplay and entry records and is never estimated.</li>
      </ul>
    </section>
  );
}
