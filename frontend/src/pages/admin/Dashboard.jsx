import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../lib/api';
import { TrendingUp, Users, Ticket, PoundSterling, Eye, UserPlus, Trophy, Wallet, Clock3, Target } from 'lucide-react';
import { gbp } from '../../lib/format';
import PeriodFilter, { periodLabel, reportPath, usePeriod } from '../../components/admin/PeriodFilter';
import DashboardDetails from './DashboardDetails';

function Stat({ label, value, sub, Icon, gradient, onClick, active, testid }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} className={`w-full rounded-2xl border p-5 text-left shadow-sm transition ${active ? 'border-violet-300 bg-violet-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
      <div className="flex items-center justify-between"><div className="text-sm text-slate-500">{label}</div><div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center`}><Icon className="w-4 h-4" /></div></div>
      <div className="font-display font-extrabold text-2xl text-slate-900 mt-2">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </button>
  );
}

const num = (value) => (value == null ? 'Unavailable' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const pct = (value) => (value == null ? 'Unavailable' : `${value}%`);

function TokenCard({ title, lines, remaining, basis, endLabel, onClick, testid }) {
  const remainingNote = basis === 'period_end' ? endLabel : basis === 'current' ? 'balance now' : 'unavailable: legacy history is unclassified';
  return (
    <button type="button" onClick={onClick} data-testid={testid} className="w-full rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition hover:border-slate-200">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <dl className="mt-3 space-y-1 text-sm">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="font-semibold tabular-nums text-slate-900">{num(value)}</dd></div>
        ))}
        <div className="flex justify-between gap-3 border-t border-slate-100 pt-1"><dt className="text-slate-500">Remaining</dt><dd className="font-bold tabular-nums text-slate-900">{num(remaining)}</dd></div>
      </dl>
      <div className="mt-2 text-[11px] text-slate-400">Issued, used and withdrawn: activity in the period. Remaining: {remainingNote}.</div>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = usePeriod();
  const [selectedMetric, setSelectedMetric] = useState('users');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewError, setReviewError] = useState('');
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setReview(null);
    setReviewError('');
    adminAPI.dashboardSummary(period).then((data) => !cancelled && setSummary(data)).catch(() => !cancelled && setSummary(null));
    adminAPI.businessReview(period).then((data) => !cancelled && setReview(data))
      .catch((err) => !cancelled && setReviewError(err?.response?.data?.detail || 'Business Review is unavailable.'));
    adminAPI.dashboardRecentActivity({ period, limit: 50 }).then((data) => !cancelled && setRecentActivity(data.items || [])).catch(() => !cancelled && setRecentActivity([]));
    return () => { cancelled = true; };
  }, [period]);

  const paidWorld = summary?.paid_world || {};
  const freeWorld = summary?.free_world || {};
  const challenge = review?.worlds?.impossible_challenges || {};
  const tokens = review?.tokens;
  const endsInFuture = review?.range?.end && new Date(review.range.end) > new Date(review.generated_at);
  const endLabel = !review?.range?.end ? 'balance at period end' : endsInFuture ? 'balance now' : `balance at ${new Date(review.range.end).toLocaleString()}`;
  const selectMetric = (metric) => {
    setSelectedMetric(metric);
    setDetailsOpen(true);
  };
  const openReport = (query) => navigate(reportPath(period, query));
  const dash = (value, format = num) => (review ? format(value) : '…');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Operations dashboard</h1>
          <p className="text-sm text-slate-500">Paid World, Free World, Impossible Challenges, acquisition, and revenue performance.</p>
        </div>
        <PeriodFilter period={period} onChange={setPeriod} />
      </div>

      <section className="space-y-3" data-testid="admin-dashboard-kpis">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-slate-900">Business Review · {periodLabel(period)}</h2>
          <span className="text-xs text-slate-500">
            Staff, Admin, Super Admin and test accounts excluded
            {review?.generated_at ? ` · Updated ${new Date(review.generated_at).toLocaleTimeString()}` : ''}
          </span>
        </div>
        {reviewError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{reviewError}</div>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Stat testid="br-registered-users" label="Total Registered Users" value={dash(review?.users?.registered_total)} sub={review ? `As of period end · ${num(review.users.signups)} new in period` : ''} Icon={UserPlus} gradient="from-cyan-500 to-blue-600" onClick={() => selectMetric('users')} />
          <Stat testid="br-active-users" label="Active Users" value={dash(review?.users?.active)} sub="Unique users active in the period" Icon={Users} gradient="from-emerald-500 to-teal-600" onClick={() => selectMetric('active_users')} />
          <Stat testid="br-topups" label="Total Top-ups" value={review ? gbp(review.topups.amount_gbp) : '…'} sub={review ? `${num(review.topups.count)} successful transactions` : ''} Icon={Wallet} gradient="from-amber-500 to-yellow-600" onClick={() => selectMetric('topups')} />
          <Stat testid="br-page-views" label="Total Page Views" value={dash(review?.traffic?.page_views)} sub="All website pages" Icon={Eye} gradient="from-blue-500 to-indigo-600" onClick={() => openReport({ tab: 'acquisition', report: 'pages' })} />
          <Stat testid="br-unique-visitors" label="Unique Visitors" value={dash(review?.traffic?.unique_visitors)} sub="Distinct browsers" Icon={Users} gradient="from-amber-500 to-orange-600" onClick={() => selectMetric('visitors')} />
          <Stat testid="br-signups" label="Total Signups" value={dash(review?.signups?.total)} sub={review ? `${num(review.signups.google)} via Google · ${num(review.signups.email)} via email` : ''} Icon={UserPlus} gradient="from-green-500 to-teal-600" onClick={() => selectMetric('signups')} />
          <Stat testid="br-conversion" label="Conversion Rate" value={dash(review?.signups?.conversion_rate, pct)} sub="Attributed signups ÷ unique visitors" Icon={Target} gradient="from-rose-500 to-pink-600" onClick={() => openReport({ tab: 'acquisition', report: 'funnel' })} />
          <Stat testid="br-sessions" label="Visits / Sessions" value={dash(review?.traffic?.sessions)} sub="Browser sessions" Icon={TrendingUp} gradient="from-teal-500 to-cyan-600" onClick={() => openReport({ tab: 'acquisition', report: 'sources' })} />
        </div>
        {review?.traffic?.page_views_before_session_tracking > 0 && (
          <p className="text-xs text-slate-500">{num(review.traffic.page_views_before_session_tracking)} earlier page views recorded before session tracking are not included in these figures.</p>
        )}
      </section>

      <section className="space-y-3" data-testid="br-token-cards">
        <h2 className="font-display text-lg font-bold text-slate-900">Tokens · {periodLabel(period)}</h2>
        {review && !tokens && <p className="text-sm text-slate-500">Token accounting is available to Admin and Super Admin only.</p>}
        {tokens && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TokenCard testid="br-token-topup" title="Top-up Tokens" endLabel={endLabel} basis={tokens.topup_tokens.remaining_basis} remaining={tokens.topup_tokens.remaining}
              lines={[['Purchased', tokens.topup_tokens.issued], ['Used', tokens.topup_tokens.used]]} onClick={() => openReport({ tab: 'tokens', category: 'topup_tokens' })} />
            <TokenCard testid="br-token-winning" title="Winning Tokens" endLabel={endLabel} basis={tokens.winning_tokens.remaining_basis} remaining={tokens.winning_tokens.remaining}
              lines={[['Earned', tokens.winning_tokens.issued], ['Used', tokens.winning_tokens.used], ['Withdrawn', tokens.winning_tokens.withdrawn]]} onClick={() => openReport({ tab: 'tokens', category: 'winning_tokens' })} />
            <TokenCard testid="br-token-winning-bonus" title="Winning Bonus Tokens" endLabel={endLabel} basis={tokens.winning_bonus_tokens.remaining_basis} remaining={tokens.winning_bonus_tokens.remaining}
              lines={[['Issued', tokens.winning_bonus_tokens.issued], ['Used', tokens.winning_bonus_tokens.used]]} onClick={() => openReport({ tab: 'tokens', category: 'winning_bonus_tokens' })} />
            <TokenCard testid="br-token-bonus" title="Bonus Tokens" endLabel={endLabel} basis={tokens.bonus_tokens.remaining_basis} remaining={tokens.bonus_tokens.remaining}
              lines={[['Issued', tokens.bonus_tokens.issued], ['Used', tokens.bonus_tokens.used], ['Expired', tokens.bonus_tokens.expired]]} onClick={() => openReport({ tab: 'tokens', category: 'bonus_tokens' })} />
          </div>
        )}
        <p className="text-xs text-slate-500">Bonus Tokens include signup, referral, influencer and admin-issued bonuses. Categories are never combined.</p>
      </section>

      <div className="grid xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display font-bold text-slate-900">Paid World</h3>
            <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700">Paid</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Stat label="Scores" value={(paidWorld.scores || 0).toLocaleString()} sub={periodLabel(period)} Icon={Trophy} gradient="from-violet-500 to-fuchsia-600" active={selectedMetric === 'paid_scores'} onClick={() => selectMetric('paid_scores')} />
            <Stat label="Orders" value={(paidWorld.orders || 0).toLocaleString()} sub={periodLabel(period)} Icon={Ticket} gradient="from-indigo-500 to-violet-600" active={selectedMetric === 'orders'} onClick={() => selectMetric('orders')} />
            <Stat label="Revenue" value={gbp(paidWorld.revenue || 0)} sub={periodLabel(period)} Icon={PoundSterling} gradient="from-violet-500 to-purple-700" active={selectedMetric === 'revenue'} onClick={() => selectMetric('revenue')} />
            <Stat label="Prize payouts" value={gbp(paidWorld.winnings_paid || 0)} sub={periodLabel(period)} Icon={Wallet} gradient="from-rose-500 to-orange-500" active={selectedMetric === 'paid_winnings'} onClick={() => selectMetric('paid_winnings')} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display font-bold text-slate-900">Free World</h3>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Free</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Stat label="Champion scores" value={(freeWorld.scores || 0).toLocaleString()} sub={periodLabel(period)} Icon={Trophy} gradient="from-emerald-500 to-teal-600" active={selectedMetric === 'free_scores'} onClick={() => selectMetric('free_scores')} />
            <Stat label="Level attempts" value={(freeWorld.level_attempts || 0).toLocaleString()} sub={periodLabel(period)} Icon={Clock3} gradient="from-cyan-500 to-sky-600" active={selectedMetric === 'free_level_attempts'} onClick={() => selectMetric('free_level_attempts')} />
            <Stat label="Token spend" value={(freeWorld.token_spend || 0).toLocaleString()} sub={periodLabel(period)} Icon={Wallet} gradient="from-amber-500 to-orange-600" active={selectedMetric === 'free_token_spend'} onClick={() => selectMetric('free_token_spend')} />
            <Stat label="Winnings paid" value={gbp(freeWorld.winnings_paid || 0)} sub={periodLabel(period)} Icon={PoundSterling} gradient="from-rose-500 to-red-600" active={selectedMetric === 'free_winnings'} onClick={() => selectMetric('free_winnings')} />
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white p-6" data-testid="br-impossible-challenges">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display font-bold text-slate-900">Impossible Challenges</h3>
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Challenges</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat testid="ic-visits" label="Visits" value={dash(challenge.visits)} sub={periodLabel(period)} Icon={TrendingUp} gradient="from-amber-500 to-orange-600" onClick={() => openReport({ tab: 'worlds', world: 'impossible_challenges' })} />
          <Stat testid="ic-page-views" label="Page views" value={dash(challenge.page_views)} sub={periodLabel(period)} Icon={Eye} gradient="from-blue-500 to-indigo-600" onClick={() => openReport({ tab: 'worlds', world: 'impossible_challenges' })} />
          <Stat testid="ic-visitors" label="Unique visitors" value={dash(challenge.unique_visitors)} sub={periodLabel(period)} Icon={Users} gradient="from-fuchsia-500 to-violet-600" onClick={() => openReport({ tab: 'worlds', world: 'impossible_challenges' })} />
          <Stat testid="ic-participants" label="Participants" value={dash(challenge.participants)} sub="Unique players who started an attempt" Icon={Trophy} gradient="from-emerald-500 to-teal-600" onClick={() => openReport({ tab: 'worlds', world: 'impossible_challenges' })} />
          <Stat testid="ic-entries" label="Contest entries" value={dash(challenge.entries)} sub="Challenge attempts entered" Icon={Ticket} gradient="from-indigo-500 to-violet-600" onClick={() => openReport({ tab: 'worlds', world: 'impossible_challenges' })} />
          <Stat testid="ic-revenue" label="Revenue (entry tokens)" value={review ? `${num(challenge.revenue_tokens)} tokens` : '…'} sub={review ? `Top-up ${num(challenge.token_spend_by_category?.topup_tokens)} · Bonus ${num(challenge.token_spend_by_category?.bonus_tokens)} · Winning ${num(challenge.token_spend_by_category?.winning_tokens)}` : ''} Icon={PoundSterling} gradient="from-violet-500 to-purple-700" onClick={() => openReport({ tab: 'worlds', world: 'impossible_challenges' })} />
          <Stat testid="ic-conversions" label="Conversions" value={dash(challenge.conversions?.visitors_to_players_pct, pct)} sub={review ? `Visitor to player · completed ${pct(challenge.conversions?.players_to_completed_pct)}` : ''} Icon={Target} gradient="from-rose-500 to-pink-600" onClick={() => openReport({ tab: 'worlds', world: 'impossible_challenges' })} />
          <Stat testid="ic-rewards" label="Rewards credited" value={gbp(summary?.impossible_challenges?.winnings_awarded_gbp ?? 0)} sub={`${num(summary?.impossible_challenges?.winnings_credits ?? 0)} rewards`} Icon={Wallet} gradient="from-rose-500 to-orange-500" onClick={() => openReport({ tab: 'worlds', world: 'impossible_challenges' })} />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="dashboard-recent-activity">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-display font-bold text-slate-900">Recent activity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Activity</th><th className="p-3">User ID</th><th className="p-3">Amount</th><th className="p-3">Time</th></tr></thead>
            <tbody>
              {recentActivity.map((item, index) => {
                const rawAmount = item.amount_tokens ?? item.amount;
                const amount = item.amount_gbp != null ? gbp(item.amount_gbp)
                  : rawAmount != null ? `${Math.abs(Number(rawAmount)).toLocaleString()} tokens` : '—';
                return <tr key={`${item.kind}-${item.reference || item.user_id}-${index}`} className="border-t border-slate-100">
                  <td className="p-3 font-medium text-slate-800">{item.title}</td>
                  <td className="p-3 font-mono text-xs text-slate-500">{item.user_id || '—'}</td>
                  <td className="p-3 tabular-nums">{amount}</td>
                  <td className="p-3 text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</td>
                </tr>;
              })}
              {!recentActivity.length && <tr><td colSpan="4" className="p-6 text-center text-slate-400">No activity recorded for this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {detailsOpen && <DashboardDetails metric={selectedMetric} period={period} onClose={() => setDetailsOpen(false)} />}
    </div>
  );
}
