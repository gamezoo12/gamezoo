import { ADMIN_ORDERS } from '../../mock/mockData';
import { gbp } from '../../lib/format';
import { Receipt } from 'lucide-react';

export default function OrdersPage() {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-extrabold">Orders</h2>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {ADMIN_ORDERS.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3"><Receipt className="w-6 h-6 text-slate-400" /></div>
            <div className="text-slate-500 text-sm">No orders yet. Orders will appear here once Stripe checkout is enabled.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="text-left p-3">Order ID</th><th className="text-left p-3">User</th><th className="text-left p-3">Contest</th><th className="text-left p-3">Tickets</th><th className="text-left p-3">Total</th><th className="text-left p-3">Date</th><th className="text-left p-3">Status</th></tr>
            </thead>
            <tbody>
              {ADMIN_ORDERS.map(o => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="p-3 text-teal-600 font-medium">#{o.id}</td><td className="p-3">{o.user}</td><td className="p-3 text-slate-500">{o.competition}</td><td className="p-3">{o.tickets}</td><td className="p-3 font-semibold">{gbp(o.total)}</td><td className="p-3 text-slate-500">{new Date(o.date).toLocaleString('en-GB')}</td><td className="p-3">{o.status}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
