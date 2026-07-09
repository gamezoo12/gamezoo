import { useEffect, useState } from 'react';
import { ordersAPI, userAPI } from '../lib/api';
import { gbp } from '../lib/format';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Wallet, Ticket, Award, User, ShieldCheck, Clock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';
import BackButton from '../components/BackButton';

export default function MyAccount() {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [orders, setOrders] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [kyc, setKyc] = useState({ status: 'none' });
  const [kycBusy, setKycBusy] = useState(false);

  useEffect(() => {
    if (loading) return undefined;
    if (!user) { nav('/login', { replace: true }); return undefined; }
    ordersAPI.mine().then(setOrders).catch((err) => console.error('[account] orders:', err?.message));
    ordersAPI.myTickets().then(setTickets).catch((err) => console.error('[account] tickets:', err?.message));
    userAPI.kycStatus().then(setKyc).catch((err) => console.error('[account] kyc:', err?.message));
    return undefined;
  }, [user, loading, nav]);

  const submitKyc = async (e) => {
    e.preventDefault();
    setKycBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const data = Object.fromEntries(fd.entries());
      await userAPI.kycSubmit(data);
      toast({ title: 'Verification submitted', description: 'We’ll email you when it’s reviewed.' });
      const s = await userAPI.kycStatus(); setKyc(s);
    } catch (err) {
      toast({ title: 'Failed', description: err?.response?.data?.detail });
    } finally { setKycBusy(false); }
  };

  if (loading || !user) return <div className="max-w-6xl mx-auto p-10 text-slate-500">Loading…</div>;
  const totalSpent = orders.reduce((s, o) => s + (o.total || 0), 0);
  const KycBadge = ({ status }) => {
    const map = { approved: ['bg-emerald-100 text-emerald-700', ShieldCheck, 'Verified'], pending: ['bg-amber-100 text-amber-700', Clock, 'Under review'], rejected: ['bg-rose-100 text-rose-700', AlertCircle, 'Rejected'], none: ['bg-slate-100 text-slate-600', User, 'Not submitted'] };
    const [cls, Icon, label] = map[status] || map.none;
    return <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${cls}`}><Icon className="w-3 h-3" /> {label}</span>;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
      <BackButton to="/" label="Back to home" className="mb-4" />
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="font-display text-3xl font-extrabold">Hi, {user.name} 👋</h1><p className="text-slate-500">{user.email} • <KycBadge status={kyc.status} /></p></div>
        <button onClick={async () => { await logout(); window.location.href = '/'; }} className="text-sm text-slate-500 hover:text-rose-600">Sign out</button>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total spent', value: gbp(totalSpent), Icon: Wallet, color: 'from-teal-500 to-emerald-500' },
          { label: 'Active tickets', value: tickets.length, Icon: Ticket, color: 'from-orange-500 to-rose-500' },
          { label: 'Orders', value: orders.length, Icon: Award, color: 'from-amber-400 to-orange-500' },
          { label: 'KYC status', value: kyc.status || 'none', Icon: ShieldCheck, color: 'from-slate-700 to-slate-900' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-5 text-white bg-gradient-to-br ${s.color} shadow-lg`}><s.Icon className="w-6 h-6 opacity-80" /><div className="mt-3 text-2xl font-extrabold font-display capitalize">{s.value}</div><div className="text-sm opacity-90">{s.label}</div></div>
        ))}
      </div>

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">My Tickets</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="verify">Identity Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets">
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            {tickets.length === 0 ? <div className="text-slate-500 text-sm">You have no tickets yet. <a href="/competitions" className="text-teal-600 font-semibold">Browse contests →</a></div> : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {tickets.map(t => <div key={t.ticket_id} className="border border-slate-100 rounded-xl p-3"><div className="text-xs text-slate-500">Ticket #{t.ticket_number}</div><div className="text-sm font-medium truncate">{t.contest_id}</div></div>)}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            {orders.length === 0 ? <div className="text-slate-500 text-sm">No orders yet.</div> : (
              <table className="w-full text-sm"><thead className="text-slate-500"><tr><th className="text-left py-2">Order</th><th className="text-left">Items</th><th className="text-left">Total</th><th className="text-left">Date</th></tr></thead>
                <tbody>{orders.map(o => <tr key={o.order_id} className="border-t border-slate-100"><td className="py-2 text-teal-600">#{o.order_id.slice(0, 8)}</td><td>{o.items.length}</td><td>{gbp(o.total)}</td><td className="text-slate-500">{new Date(o.created_at).toLocaleDateString('en-GB')}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="verify">
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <div className="flex items-center gap-2 mb-4"><ShieldCheck className="w-5 h-5 text-teal-600" /><h3 className="font-display font-bold text-lg">Identity verification (KYC)</h3><KycBadge status={kyc.status} /></div>
            {kyc.status === 'approved' ? <p className="text-slate-600">Your identity has been verified. You&apos;re eligible for prize payouts.</p> : (
              <>
                <p className="text-sm text-slate-500 mb-4">Required before we can pay out cash prizes. Your info is kept private and only used for verification. All fields required.</p>
                <form onSubmit={submitKyc} className="grid md:grid-cols-2 gap-3">
                  <div><Label>Full legal name</Label><Input name="full_name" required defaultValue={kyc.full_name || ''} /></div>
                  <div><Label>Date of birth</Label><Input name="dob" type="date" required /></div>
                  <div className="md:col-span-2"><Label>Address</Label><Input name="address" required placeholder="Street, City, Postcode" /></div>
                  <div><Label>Country</Label><Input name="country" defaultValue={kyc.country || 'United Kingdom'} required /></div>
                  <div><Label>Phone (optional)</Label><Input name="phone" type="tel" /></div>
                  <div>
                    <Label>ID type</Label>
                    <select name="id_type" defaultValue="passport" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="passport">Passport</option>
                      <option value="driving-licence">Driving licence</option>
                      <option value="national-id">National ID</option>
                    </select>
                  </div>
                  <div><Label>ID number</Label><Input name="id_number" required /></div>
                  <div className="md:col-span-2"><Button type="submit" disabled={kycBusy} className="bg-teal-600 hover:bg-teal-700">{kycBusy ? 'Submitting…' : (kyc.status === 'pending' || kyc.status === 'rejected' ? 'Re-submit verification' : 'Submit verification')}</Button></div>
                </form>
                {kyc.status === 'rejected' && <p className="mt-3 text-sm text-rose-600">Rejected: {kyc.reject_reason}. Please correct and resubmit.</p>}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
