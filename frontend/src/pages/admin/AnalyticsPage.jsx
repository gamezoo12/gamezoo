import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminAPI } from '../../lib/api';
import { gbp } from '../../lib/format';
import DashboardDetails from './DashboardDetails';
import AcquisitionAdmin from './AcquisitionAdmin';
import DashboardUserStats from './DashboardUserStats';
import TokenAccountingPanel from './TokenAccountingPanel';
import PeriodFilter, { periodLabel, usePeriod } from '../../components/admin/PeriodFilter';

function Metric({ title, value, period, onClick }) {
  return <button type="button" onClick={onClick} className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50">
    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</div>
    <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
    <div className="mt-1 text-xs text-slate-400">{periodLabel(period)} · click for details</div>
  </button>;
}

function MetricRow({ label, value }) {
  return <><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold text-slate-900">{value ?? 0}</dd></>;
}

export default function AnalyticsPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'overview');
  const [period, setPeriod] = usePeriod();
  const [summary, setSummary] = useState(null);
  const [worldReport, setWorldReport] = useState(null);
  const [worldFilter, setWorldFilter] = useState(() => searchParams.get('world') || 'all');
  const [contestFilter, setContestFilter] = useState('');
  const [gameFilter, setGameFilter] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('');

  useEffect(() => {
    adminAPI.dashboardSummary(period).then(setSummary).catch(() => setSummary(null));
    adminAPI.worldActivity({ period, world: worldFilter, contest_id: contestFilter || undefined,
      game_id: gameFilter || undefined }).then(setWorldReport).catch(() => setWorldReport(null));
  }, [period, worldFilter, contestFilter, gameFilter]);

  const data = summary?.summary || {};
  const tabs = [
    ['overview', 'Overview'],
    ['acquisition', 'Acquisition & Promotions'],
    ['worlds', 'World Activity'],
    ['tokens', 'Tokens & Revenue'],
    ['users', 'User Activity'],
  ];

  return (
    <div className="space-y-6" data-testid="admin-analytics-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Operational totals by time range. Select a metric to inspect its records.</p>
        </div>
        <PeriodFilter period={period} onChange={setPeriod} />
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Analytics sections" role="tablist">
        {tabs.map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value}
            onClick={() => setTab(value)} data-testid={`analytics-tab-${value}`}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${tab === value ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <>
      <section>
        <h2 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-800">Overview · {periodLabel(period)}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="Revenue" value={gbp(data.revenue || 0)} period={period} onClick={() => setSelectedMetric('revenue')} />
          <Metric title="Orders" value={(data.orders || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('orders')} />
          <Metric title="Signups" value={(data.signups || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('signups')} />
          <Metric title="Tickets sold" value={(data.tickets || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('tickets')} />
          <Metric title="Page views" value={(data.page_views || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('page_views')} />
          <Metric title="Unique visitors" value={(data.unique_visitors || 0).toLocaleString()} period={period} onClick={() => setSelectedMetric('visitors')} />
        </div>
      </section>
      <DashboardUserStats period={period} />
      </>}

      {tab === 'acquisition' && <AcquisitionAdmin period={period} />}

      {tab === 'worlds' && <>
        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <select aria-label="World" value={worldFilter} onChange={(event) => setWorldFilter(event.target.value)} className="h-9 rounded-md border border-slate-200 px-3 text-sm">
            <option value="all">All worlds</option><option value="free_world">Free World</option>
            <option value="paid_world">Paid World</option><option value="impossible_challenges">Impossible Challenges</option>
          </select>
          <input aria-label="Contest filter" value={contestFilter} onChange={(event) => setContestFilter(event.target.value)} placeholder="Contest ID" className="h-9 rounded-md border border-slate-200 px-3 text-sm" />
          <input aria-label="Game filter" value={gameFilter} onChange={(event) => setGameFilter(event.target.value)} placeholder="Game ID" className="h-9 rounded-md border border-slate-200 px-3 text-sm" />
        </div>
        {!worldReport && <div className="text-sm text-slate-500">Loading world activity…</div>}
        <div className="grid gap-4 xl:grid-cols-2">
          {Object.values(worldReport?.worlds || {}).map((item) => (
            <section key={item.world} className="rounded-xl border border-slate-200 bg-white p-5" data-testid={`world-analytics-${item.world}`}>
              <h2 className="mb-3 font-display font-bold text-slate-900">{item.world.replaceAll('_', ' ')} · {periodLabel(period)}</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <MetricRow label="Visits (sessions)" value={item.visits} />
                <MetricRow label="Page views" value={item.page_views} />
                <MetricRow label="Unique visitors" value={item.unique_visitors} />
                <MetricRow label="Unique registered visitors" value={item.unique_registered_visitors} />
                <MetricRow label="Game starts" value={item.game_starts} />
                <MetricRow label="Completed plays" value={item.completed_plays} />
                <MetricRow label="Unique players" value={item.unique_players} />
                <MetricRow label="Repeat plays" value={item.repeat_plays} />
                <MetricRow label="Participants" value={item.participants} />
                <MetricRow label="Contest entries" value={item.entries} />
                <MetricRow label="Revenue (entry tokens)" value={item.revenue_tokens} />
                <MetricRow label="Completed / started" value={item.conversions?.players_to_completed_pct == null ? 'Unavailable' : `${item.conversions.players_to_completed_pct}%`} />
                <MetricRow label="Visit-to-play" value={item.visit_to_play_rate == null ? 'Unavailable' : `${item.visit_to_play_rate}%`} />
                <MetricRow label="Last activity" value={item.last_activity ? new Date(item.last_activity).toLocaleString() : '—'} />
              </dl>
              <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
                Token spend: Top-up {item.token_spend_by_category?.topup_tokens ?? 0} · Winning {item.token_spend_by_category?.winning_tokens ?? 0} · Winning bonus {item.token_spend_by_category?.winning_bonus_tokens ?? 0} · Bonus {item.token_spend_by_category?.bonus_tokens ?? 0}
                {item.token_spend_by_category?.unclassified_transactions > 0 && <span className="text-amber-700"> · {item.token_spend_by_category.unclassified_transactions} legacy transactions unclassified</span>}
              </div>
              <div className="mt-2 text-xs text-slate-600">Winnings recorded: {JSON.stringify(item.winnings || {})}</div>
            </section>
          ))}
        </div>
      </>}

      {tab === 'tokens' && <TokenAccountingPanel period={period} initialCategory={searchParams.get('category') || 'all'} />}
      {tab === 'users' && <DashboardUserStats period={period} />}
      {selectedMetric && <DashboardDetails metric={selectedMetric} period={period} onClose={() => setSelectedMetric('')} />}
    </div>
  );
}