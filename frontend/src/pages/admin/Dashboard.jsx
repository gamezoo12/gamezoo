import { useEffect, useState } from 'react';
import { adminAPI, paymentsAPI } from '../../lib/api';
import { TrendingUp, Users, Ticket, PoundSterling, Sparkles, Timer, CheckCircle2 } from 'lucide-react';
import { gbp } from '../../lib/format';

function Stat({ label, value, sub, Icon, gradient }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between"><div className="text-sm text-slate-500">{label}</div><div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center`}><Icon className="w-4 h-4" /></div></div>
      <div className="font-display font-extrabold text-2xl text-slate-900 mt-2">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

const BONUS_TONES = {
  gold:    { chip: 'bg-[#FFD54A] text-slate-900',   value: 'text-slate-900' },
  rose:    { chip: 'bg-rose-500 text-white',        value: 'text-slate-900' },
  emerald: { chip: 'bg-emerald-500 text-white',     value: 'text-slate-900' },
  purple:  { chip: 'bg-[#6C2BFF] text-white',       value: 'text-slate-900' },
};

function BonusStat({ label, value, sub, Icon, tone = 'gold', testid }) {
  const t = BONUS_TONES[tone] || BONUS_TONES.gold;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.chip}`}><Icon className="w-3.5 h-3.5" /></div>
      </div>
      <div className={`font-display text-2xl font-extrabold mt-2 ${t.value}`}>{Number(value).toLocaleString()}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [contests, setContests] = useState([]);
  const [bonus, setBonus] = useState(null);

  useEffect(() => {
    adminAPI.stats().then(setStats).catch((err) => { if (process.env.NODE_ENV !== 'production') console.error('[dashboard] stats:', err?.message); });
    adminAPI.orders().then(setOrders).catch((err) => { if (process.env.NODE_ENV !== 'production') console.error('[dashboard] orders:', err?.message); });
    adminAPI.contests().then(setContests).catch((err) => { if (process.env.NODE_ENV !== 'production') console.error('[dashboard] contests:', err?.message); });
    paymentsAPI.bonusStats().then(setBonus).catch((err) => { if (process.env.NODE_ENV !== 'production') console.error('[dashboard] bonus:', err?.message); });
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Revenue" value={gbp(stats?.revenue || 0)} sub="All-time" Icon={PoundSterling} gradient="from-[#8B5CFF] to-[#6C2BFF]" />
        <Stat label="Tickets sold" value={(stats?.tickets_sold || 0).toLocaleString()} sub="Total entries" Icon={Ticket} gradient="from-orange-500 to-rose-500" />
        <Stat label="Users" value={stats?.users || 0} sub="Registered" Icon={Users} gradient="from-amber-400 to-orange-500" />
        <Stat label="Live contests" value={stats?.contests || 0} sub={`£${(stats?.prize_pool || 0).toLocaleString()} prize pool`} Icon={TrendingUp} gradient="from-purple-500 to-indigo-500" />
      </div>

      {/* Bonus Tokens promo — visibility of the "10-token top-up → +5 bonus" campaign */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6" data-testid="admin-bonus-stats">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 className="font-display font-bold text-slate-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#FFD54A]" /> Bonus tokens promo</h3>
            <p className="text-xs text-slate-500 mt-1">
              Buy {bonus?.config?.min_topup_tokens ?? 10}+ tokens, get {bonus?.config?.bonus_amount_tokens ?? 5} free · expires in {bonus?.config?.expiry_days ?? 30} days.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Live</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <BonusStat label="Active tokens" value={bonus?.active_tokens ?? 0} sub={`${bonus?.active_grants ?? 0} grants`} Icon={Sparkles} tone="gold" testid="bonus-stat-active" />
          <BonusStat label="Expired tokens" value={bonus?.expired_tokens ?? 0} sub={`${bonus?.expired_grants ?? 0} grants`} Icon={Timer} tone="rose" testid="bonus-stat-expired" />
          <BonusStat label="Redeemed" value={bonus?.redeemed_tokens ?? 0} sub={`${bonus?.redeemed_grants ?? 0} grants`} Icon={CheckCircle2} tone="emerald" testid="bonus-stat-redeemed" />
          <BonusStat label="Users granted" value={bonus?.total_users_granted ?? 0} sub="Unique recipients" Icon={Users} tone="purple" testid="bonus-stat-users" />
        </div>
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
    </div>
  );
}
