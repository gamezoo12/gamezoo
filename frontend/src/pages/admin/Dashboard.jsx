import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, acquisitionAdminAPI } from '../../lib/api';
import { TrendingUp, Users, Ticket, PoundSterling, Eye, UserPlus, Trophy, Wallet, Clock3, BarChart3 } from 'lucide-react';
import { gbp } from '../../lib/format';
import DashboardDetails from './DashboardDetails';
import DashboardUserStats from './DashboardUserStats';
import DashboardWalletReport from './DashboardWalletReport';

function Stat({ label, value, sub, Icon, gradient, onClick, active }) {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-2xl border p-5 text-left shadow-sm transition ${active ? 'border-violet-300 bg-violet-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
      <div className="flex items-center justify-between"><div className="text-sm text-slate-500">{label}</div><div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center`}><Icon className="w-4 h-4" /></div></div>
      <div className="font-display font-extrabold text-2xl text-slate-900 mt-2">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </button>
  );
}

const RANGE_OPTIONS = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'This month', value: 'month' },
  { label: 'All time', value: 'all_time' },
  { label: 'Custom range', value: 'custom' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('revenue');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [visits, setVisits] = useState([]);
  const [contests, setContests] = useState([]);
  const [userStats, setUserStats] = useState(null);

  useEffect(() => {
    if (period === 'custom' && (!startDate || !endDate)) {
      setSummary(null);
      return;
    }
    const range = period === 'custom' ? { start_date: startDate, end_date: endDate } : {};
    adminAPI.dashboardSummary(period, range).then(setSummary).catch(() => setSummary(null));
    adminAPI.userStats({ refresh: true }).then(setUserStats).catch(() => setUserStats(null));
    adminAPI.orders().then(setOrders).catch((err) => { if (process.env.NODE_ENV !== 'production') console.error('[dashboard] orders:', err?.message); });
    adminAPI.users().then(setUsers).catch(() => setUsers([]));
    adminAPI.contests().then(setContests).catch((err) => { if (process.env.NODE_ENV !== 'production') console.error('[dashboard] contests:', err?.message); });
    acquisitionAdminAPI.visits({ period, limit: 30 }).then((data) => setVisits(data.visits || [])).catch(() => setVisits([]));
  }, [period, startDate, endDate]);

  const paidWorld = summary?.paid_world || {};
  const freeWorld = summary?.free_world || {};
  const overview = summary?.summary || {};
  const periodDuration = { today: 86400000, yesterday: 86400000, '7d': 604800000, '30d': 2592000000, month: 2678400000 }[period];
  const cutoff = periodDuration ? Date.now() - periodDuration : 0;
  const filteredUsers = users.filter(user => new Date(user.created_at || 0).getTime() >= cutoff).slice(0, 10);
  const filteredOrders = orders.filter(order => new Date(order.created_at || 0).getTime() >= cutoff).slice(0, 10);
  const filteredVisits = visits.filter(visit => new Date(visit.created_at || 0).getTime() >= cutoff).slice(0, 10);

  const selectMetric = (metric) => {
    setSelectedMetric(metric);
    setDetailsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Operations dashboard</h1>
          <p className="text-sm text-slate-500">Paid World, Free World, acquisition, and revenue performance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${period === option.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {option.label}
            </button>
          ))}
          </div>
          {period === 'custom' && <>
            <input aria-label="Start date" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" />
            <input aria-label="End date" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" />
          </>}
        </div>
      </div>

      <section className="space-y-3" data-testid="admin-dashboard-kpis">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-slate-900">Business overview</h2>
          <span className="text-xs text-slate-500" title={userStats?.definitions?.currently_active}>
            Active now means login, interaction, or game activity in the last 5 minutes
            {userStats?.generated_at ? ` · Updated ${new Date(userStats.generated_at).toLocaleTimeString()}` : ''}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="Active users" value={(userStats?.activity?.currently_active ?? 0).toLocaleString()} sub="Last 5 minutes" Icon={Users} gradient="from-emerald-500 to-teal-600" onClick={() => selectMetric('active_users')} />
          <Stat label="Total registered users" value={(userStats?.registrations?.total ?? 0).toLocaleString()} sub="Staff and test accounts excluded" Icon={UserPlus} gradient="from-cyan-500 to-blue-600" onClick={() => selectMetric('users')} />
          <Stat label="Total sales" value={(overview.orders ?? 0).toLocaleString()} sub="Paid contest orders" Icon={TrendingUp} gradient="from-indigo-500 to-violet-600" onClick={() => selectMetric('orders')} />
          <Stat label="Total top-ups" value={(overview.topups?.count ?? 0).toLocaleString()} sub={`${gbp(overview.topups?.amount_gbp ?? 0)} paid deposits · not revenue`} Icon={Wallet} gradient="from-amber-500 to-orange-600" onClick={() => selectMetric('topups')} />
          <Stat label="Net sales revenue" value={gbp(overview.revenue ?? 0)} sub={`Gross ${gbp(overview.revenue_gross ?? 0)} · refunds ${gbp(overview.refunds ?? 0)}`} Icon={PoundSterling} gradient="from-rose-500 to-pink-600" onClick={() => selectMetric('revenue')} />
          <Stat label="Live contests" value={(overview.live_contests ?? 0).toLocaleString()} sub="Currently marked live" Icon={Ticket} gradient="from-violet-500 to-purple-700" onClick={() => selectMetric('live_contests')} />
          <Stat label="Free World attempts" value={(freeWorld.level_attempts ?? 0).toLocaleString()} sub={period} Icon={Clock3} gradient="from-emerald-500 to-lime-600" onClick={() => selectMetric('free_level_attempts')} />
          <Stat label="Paid World participants" value={(paidWorld.unique_participants ?? 0).toLocaleString()} sub="Distinct scored users" Icon={Trophy} gradient="from-fuchsia-500 to-violet-600" onClick={() => selectMetric('paid_scores')} />
          <Stat label="Tickets sold" value={(overview.tickets ?? 0).toLocaleString()} sub={period} Icon={Ticket} gradient="from-orange-500 to-rose-500" onClick={() => selectMetric('tickets')} />
          <Stat label="Influencer performance" value={`${overview.influencers?.active ?? 0} active`} sub={`${overview.influencers?.registrations ?? 0} signups · ${gbp(overview.influencers?.commission_gbp ?? 0)} payable/earned`} Icon={BarChart3} gradient="from-teal-500 to-cyan-600" onClick={() => navigate('/admin/influencers')} />
        </div>
      </section>

      <DashboardWalletReport />

      <DashboardUserStats />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Revenue" value={gbp(overview.revenue || 0)} sub={`${period} paid orders`} Icon={PoundSterling} gradient="from-[#8B5CFF] to-[#6C2BFF]" active={selectedMetric === 'revenue'} onClick={() => selectMetric('revenue')} />
        <Stat label="New users" value={(overview.users || 0).toLocaleString()} sub={`Registered in ${period}`} Icon={UserPlus} gradient="from-emerald-500 to-teal-500" active={selectedMetric === 'signups'} onClick={() => selectMetric('signups')} />
        <Stat label="Page views" value={(overview.page_views || 0).toLocaleString()} sub={`Route views · ${period}`} Icon={Eye} gradient="from-blue-500 to-indigo-500" active={selectedMetric === 'page_views'} onClick={() => selectMetric('page_views')} />
        <Stat label="Unique visitors" value={(overview.unique_visitors || 0).toLocaleString()} sub={`Tracked visits · ${period}`} Icon={Users} gradient="from-amber-400 to-orange-500" active={selectedMetric === 'visitors'} onClick={() => selectMetric('visitors')} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Orders" value={(overview.orders || 0).toLocaleString()} sub={period} Icon={TrendingUp} gradient="from-violet-500 to-fuchsia-500" active={selectedMetric === 'orders'} onClick={() => selectMetric('orders')} />
        <Stat label="Tickets sold" value={(overview.tickets || 0).toLocaleString()} sub={period} Icon={Ticket} gradient="from-orange-500 to-rose-500" active={selectedMetric === 'tickets'} onClick={() => selectMetric('tickets')} />
        <Stat label="Paid scores" value={(paidWorld.scores || 0).toLocaleString()} sub={period} Icon={Trophy} gradient="from-fuchsia-500 to-violet-600" active={selectedMetric === 'paid_scores'} onClick={() => selectMetric('paid_scores')} />
        <Stat label="Free World scores" value={(freeWorld.scores || 0).toLocaleString()} sub={period} Icon={Trophy} gradient="from-emerald-500 to-teal-600" active={selectedMetric === 'free_scores'} onClick={() => selectMetric('free_scores')} />
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display font-bold text-slate-900">Paid World</h3>
            <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700">Paid</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Stat label="Scores" value={(paidWorld.scores || 0).toLocaleString()} sub={period} Icon={Trophy} gradient="from-violet-500 to-fuchsia-600" active={selectedMetric === 'paid_scores'} onClick={() => selectMetric('paid_scores')} />
            <Stat label="Orders" value={(paidWorld.orders || 0).toLocaleString()} sub={period} Icon={Ticket} gradient="from-indigo-500 to-violet-600" active={selectedMetric === 'orders'} onClick={() => selectMetric('orders')} />
            <Stat label="Revenue" value={gbp(paidWorld.revenue || 0)} sub={period} Icon={PoundSterling} gradient="from-violet-500 to-purple-700" active={selectedMetric === 'revenue'} onClick={() => selectMetric('revenue')} />
            <Stat label="Prize payouts" value={gbp(paidWorld.winnings_paid || 0)} sub={period} Icon={Wallet} gradient="from-rose-500 to-orange-500" active={selectedMetric === 'paid_winnings'} onClick={() => selectMetric('paid_winnings')} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display font-bold text-slate-900">Free World</h3>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Free</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Stat label="Champion scores" value={(freeWorld.scores || 0).toLocaleString()} sub={period} Icon={Trophy} gradient="from-emerald-500 to-teal-600" active={selectedMetric === 'free_scores'} onClick={() => selectMetric('free_scores')} />
            <Stat label="Level attempts" value={(freeWorld.level_attempts || 0).toLocaleString()} sub={period} Icon={Clock3} gradient="from-cyan-500 to-sky-600" active={selectedMetric === 'free_level_attempts'} onClick={() => selectMetric('free_level_attempts')} />
            <Stat label="Token spend" value={(freeWorld.token_spend || 0).toLocaleString()} sub={period} Icon={Wallet} gradient="from-amber-500 to-orange-600" active={selectedMetric === 'free_token_spend'} onClick={() => selectMetric('free_token_spend')} />
            <Stat label="Winnings paid" value={gbp(freeWorld.winnings_paid || 0)} sub={period} Icon={PoundSterling} gradient="from-rose-500 to-red-600" active={selectedMetric === 'free_winnings'} onClick={() => selectMetric('free_winnings')} />
          </div>
        </div>
      </div>

      <div className="hidden">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display font-bold text-slate-900">Drilldown details</h3>
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{selectedMetric}</span>
        </div>
        {selectedMetric === 'page_views' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500"><tr><th className="py-2 text-left">Source</th><th className="py-2 text-left">Path</th><th className="py-2 text-left">Channel</th><th className="py-2 text-left">Time</th></tr></thead>
              <tbody>
                {filteredVisits.length === 0 ? <tr><td colSpan="4" className="py-6 text-center text-slate-500">No visits in this range.</td></tr> : filteredVisits.map((v) => (
                  <tr key={v.visit_id || v._id || `${v.created_at}-${Math.random()}`} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{v.source || 'direct'}</td>
                    <td className="py-2 text-slate-600">{v.landing_path || '/'}</td>
                    <td className="py-2 text-slate-600">{v.channel || '—'}</td>
                    <td className="py-2 text-slate-500">{v.created_at ? new Date(v.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selectedMetric === 'signups' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500"><tr><th className="py-2 text-left">User</th><th className="py-2 text-left">Email</th><th className="py-2 text-left">Role</th><th className="py-2 text-left">Joined</th></tr></thead>
              <tbody>
                {filteredUsers.length === 0 ? <tr><td colSpan="4" className="py-6 text-center text-slate-500">No new signups in this range.</td></tr> : filteredUsers.map((u) => (
                  <tr key={u.user_id} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{u.name || u.username || '—'}</td>
                    <td className="py-2 text-slate-600">{u.email || '—'}</td>
                    <td className="py-2 text-slate-600">{u.role || 'user'}</td>
                    <td className="py-2 text-slate-500">{u.created_at ? new Date(u.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selectedMetric === 'orders' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500"><tr><th className="py-2 text-left">Order</th><th className="text-left">User</th><th className="text-left">Total</th><th className="text-left">Status</th><th className="text-left">Date</th></tr></thead>
              <tbody>
                {filteredOrders.length === 0 ? <tr><td colSpan="5" className="py-6 text-center text-slate-500">No orders in this range.</td></tr> : filteredOrders.map((o) => (
                  <tr key={o.order_id} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-violet-700">#{(o.order_id || '').slice(0, 8)}</td>
                    <td className="py-2 text-slate-600">{o.user_name || '—'}</td>
                    <td className="py-2 text-slate-600">{gbp(o.total || 0)}</td>
                    <td className="py-2 text-slate-600">{o.status || '—'}</td>
                    <td className="py-2 text-slate-500">{o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selectedMetric === 'revenue' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500"><tr><th className="py-2 text-left">Order</th><th className="py-2 text-left">User</th><th className="py-2 text-left">Value</th><th className="py-2 text-left">Date</th></tr></thead>
              <tbody>
                {filteredOrders.length === 0 ? <tr><td colSpan="4" className="py-6 text-center text-slate-500">No revenue in this range.</td></tr> : filteredOrders.map((o) => (
                  <tr key={o.order_id} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-violet-700">#{(o.order_id || '').slice(0, 8)}</td>
                    <td className="py-2 text-slate-600">{o.user_name || '—'}</td>
                    <td className="py-2 text-slate-600">{gbp(o.total || 0)}</td>
                    <td className="py-2 text-slate-500">{o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-display font-bold text-slate-900 mb-4">Recent orders</h3>
          {orders.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">No orders yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-slate-500"><tr><th className="text-left py-2">Order</th><th className="text-left">User</th><th className="text-left">Total</th><th className="text-left">Status</th></tr></thead>
              <tbody>
                {orders.slice(0, 10).map(o => (
                  <tr key={o.order_id} className="border-t border-slate-100"><td className="py-2 text-[#6C2BFF] font-medium">#{o.order_id.slice(0, 8)}</td><td>{o.user_name}</td><td>{gbp(o.total)}</td><td><span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">{o.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-display font-bold text-slate-900 mb-4">Top-selling contests</h3>
          <div className="space-y-3">
            {[...contests].sort((a,b) => (b.tickets_sold||0) - (a.tickets_sold||0)).slice(0, 6).map(c => (
              <div key={c.contest_id} className="flex items-center gap-3">
                <img src={c.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-slate-500">{c.tickets_sold || 0} / {c.tickets_total} tickets</div>
                </div>
                <div className="text-sm font-bold text-[#6C2BFF]">£{c.prize_amount}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {detailsOpen && <DashboardDetails metric={selectedMetric} period={period} startDate={period === 'custom' ? startDate : ''} endDate={period === 'custom' ? endDate : ''} onClose={() => setDetailsOpen(false)} />}
    </div>
  );
}
