import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { gbp } from '../../lib/format';
import { CreditCard, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const { toast } = useToast();
  const load = () => adminAPI.payments().then(setPayments).catch(() => setPayments([]));
  useEffect(() => { load(); }, []);

  const refund = async (id) => {
    if (!window.confirm('Refund this order? Tickets will be voided.')) return;
    try { await adminAPI.refundOrder(id); toast({ title: 'Refunded' }); load(); }
    catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); }
  };

  const total = payments.reduce((s, p) => s + (p.status === 'paid' ? p.total : 0), 0);
  const refunded = payments.filter(p => p.status === 'refunded').reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-extrabold flex items-center gap-2"><CreditCard className="w-6 h-6 text-[#6C2BFF]" /> Payments</h2>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Total collected</div><div className="font-display font-bold text-xl text-[#4A15D9]">{gbp(total)}</div></div>
        <div className="bg-white rounded-xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Refunded</div><div className="font-display font-bold text-xl text-rose-600">{gbp(refunded)}</div></div>
        <div className="bg-white rounded-xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Transactions</div><div className="font-display font-bold text-xl">{payments.length}</div></div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {payments.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">No payments yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="text-left p-3">Order</th><th className="text-left p-3">User</th><th className="text-left p-3">Items</th><th className="text-left p-3">Total</th><th className="text-left p-3">Method</th><th className="text-left p-3">Date</th><th className="text-left p-3">Status</th><th className="text-left p-3"></th></tr></thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.order_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 text-[#6C2BFF] font-medium">#{p.order_id.slice(0, 10)}</td>
                  <td className="p-3">{p.user_name} <span className="text-xs text-slate-400">({p.user_email})</span></td>
                  <td className="p-3 text-slate-500">{p.items.length}</td>
                  <td className="p-3 font-semibold">{gbp(p.total)}</td>
                  <td className="p-3 text-slate-500">{p.method}</td>
                  <td className="p-3 text-slate-500">{new Date(p.created_at).toLocaleString('en-GB')}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : p.status === 'refunded' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{p.status}</span></td>
                  <td className="p-3">{p.status === 'paid' && <Button size="sm" variant="ghost" onClick={() => refund(p.order_id)}><RefreshCw className="w-3 h-3 mr-1" /> Refund</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
