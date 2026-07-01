import { useEffect, useState } from 'react';
import { ordersAPI, publicAPI } from '../lib/api';
import { gbp } from '../lib/format';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Wallet, Ticket, Award, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function MyAccount() {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();
  const [orders, setOrders] = useState([]);
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    if (loading) return;
    if (!user) { nav('/login', { replace: true }); return; }
    ordersAPI.mine().then(setOrders).catch(() => {});
    ordersAPI.myTickets().then(setTickets).catch(() => {});
  }, [user, loading, nav]);

  if (loading || !user) return <div className="max-w-6xl mx-auto p-10 text-slate-500">Loading…</div>;

  const totalSpent = orders.reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Hi, {user.name} 👋</h1>
          <p className="text-slate-500">{user.email}</p>
        </div>
        <button onClick={async () => { await logout(); nav('/'); }} className="text-sm text-slate-500 hover:text-rose-600">Sign out</button>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total spent', value: gbp(totalSpent), Icon: Wallet, color: 'from-teal-500 to-emerald-500' },
          { label: 'Active tickets', value: tickets.length, Icon: Ticket, color: 'from-orange-500 to-rose-500' },
          { label: 'Orders', value: orders.length, Icon: Award, color: 'from-amber-400 to-orange-500' },
          { label: 'Sign-in method', value: user.method, Icon: User, color: 'from-slate-700 to-slate-900' },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl p-5 text-white bg-gradient-to-br ${s.color} shadow-lg`}>
            <s.Icon className="w-6 h-6 opacity-80" />
            <div className="mt-3 text-2xl font-extrabold font-display">{s.value}</div>
            <div className="text-sm opacity-90">{s.label}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">My Tickets</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets">
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            {tickets.length === 0 ? (
              <div className="text-slate-500 text-sm">You have no tickets yet. <a href="/competitions" className="text-teal-600 font-semibold">Browse contests →</a></div>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {tickets.map(t => (
                  <div key={t.ticket_id} className="border border-slate-100 rounded-xl p-3"><div className="text-xs text-slate-500">Ticket #{t.ticket_number}</div><div className="text-sm font-medium truncate">{t.contest_id}</div></div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="orders">
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            {orders.length === 0 ? (
              <div className="text-slate-500 text-sm">No orders yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-slate-500"><tr><th className="text-left py-2">Order</th><th className="text-left">Items</th><th className="text-left">Total</th><th className="text-left">Date</th></tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.order_id} className="border-t border-slate-100"><td className="py-2 text-teal-600">#{o.order_id.slice(0, 8)}</td><td>{o.items.length}</td><td>{gbp(o.total)}</td><td className="text-slate-500">{new Date(o.created_at).toLocaleDateString('en-GB')}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
