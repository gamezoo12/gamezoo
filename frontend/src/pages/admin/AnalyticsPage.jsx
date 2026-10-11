import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { gbp } from '../../lib/format';
import DashboardDetails from './DashboardDetails';

const PERIODS = [
  ['1 hour', '1h'], ['6 hours', '6h'], ['24 hours', '24h'], ['7 days', '7d'],
  ['1 month', '1m'], ['6 months', '6m'], ['1 year', '1y'], ['Lifetime', 'lifetime'],
];

function Metric({ title, value, period, onClick }) {
  return <button type="button" onClick={onClick} className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50">
    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>
    <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
    <div className="mt-1 text-xs text-slate-400">{period} · click for details</div>
  </button>;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('24h');
  const [summary, setSummary] = useState(null);
  const [contests, setContests] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState('');

  useEffect(() => {
    adminAPI.dashboardSummary(period).then(setSummary).catch(() => setSummary(null));
    adminAPI.contests().then(setContests).catch(() => setContests([]));
  }, [period]);

  const data = summary?.summary || {};
  const paid = summary?.paid_world || {};
  const free = summary?.free_world || {};

  return (
    <div className="space-y-6" data-testid="admin-analytics-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Operational totals by time range. Select a metric to inspect its records.</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {PERIODS.map(([label, value]) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`rounded-md px-3 py-2 text-xs font-bold ${period === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-indigo-700">Business & acquisition</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="Revenue" value={gbp(data.revenue || 0)} period={period} onClick={() => setSelectedMetric('revenue')} />
          <Metric title="Orders" value={(data.orders || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('orders')} />
          <Metric title="Signups" value={(data.signups || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('signups')} />
          <Metric title="Tickets sold" value={(data.tickets || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('tickets')} />
          <Metric title="Page views" value={(data.page_views || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('page_views')} />
          <Metric title="Unique visitors" value={(data.unique_visitors || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('visitors')} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-5">
          <h2 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-violet-800">Paid World · {period}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric title="Game scores" value={(paid.scores || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('paid_scores')} />
            <Metric title="Sales revenue" value={gbp(paid.revenue || 0)} period={period} onClick={() => setSelectedMetric('revenue')} />
            <Metric title="Prize payouts" value={gbp(paid.winnings_paid || 0)} period={period} onClick={() => setSelectedMetric('paid_winnings')} />
            <Metric title="Entries" value={(data.tickets || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('tickets')} />
          </div>
        </section>
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
          <h2 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-800">Free World · {period}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric title="Champion scores" value={(free.scores || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('free_scores')} />
            <Metric title="Level attempts" value={(free.level_attempts || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('free_level_attempts')} />
            <Metric title="Token spend" value={(free.token_spend || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('free_token_spend')} />
            <Metric title="Winnings paid" value={gbp(free.winnings_paid || 0)} period={period} onClick={() => setSelectedMetric('free_winnings')} />
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-display font-bold text-slate-900">Contest capacity</h2>
        <div className="space-y-3">
          {contests.slice(0, 12).map((contest) => {
            const total = Number(contest.tickets_total) || 0;
            const sold = Number(contest.tickets_sold) || 0;
            const percent = total ? Math.min(100, Math.round((sold / total) * 100)) : 0;
            return <div key={contest.contest_id}>
              <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate text-slate-700">{contest.title}</span><span className="shrink-0 font-semibold text-violet-700">{sold} / {total}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500" style={{ width: `${percent}%` }} /></div>
            </div>;
          })}
          {contests.length === 0 && <p className="text-sm text-slate-500">No contests available.</p>}
        </div>
      </section>
      {selectedMetric && <DashboardDetails metric={selectedMetric} period={period} onClose={() => setSelectedMetric('')} />}
    </div>
  );
}