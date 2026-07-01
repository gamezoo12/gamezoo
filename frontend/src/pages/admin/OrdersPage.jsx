import { ADMIN_ORDERS } from '../../mock/mockData';
import { gbp } from '../../lib/format';

export default function OrdersPage() {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-extrabold">Orders</h2>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr><th className="text-left p-3">Order ID</th><th className="text-left p-3">User</th><th className="text-left p-3">Competition</th><th className="text-left p-3">Tickets</th><th className="text-left p-3">Total</th><th className="text-left p-3">Date</th><th className="text-left p-3">Status</th></tr>
          </thead>
          <tbody>
            {ADMIN_ORDERS.map(o => (
              <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 text-teal-600 font-medium">#{o.id}</td>
                <td className="p-3">{o.user}</td>
                <td className="p-3 text-slate-500">{o.competition}</td>
                <td className="p-3">{o.tickets}</td>
                <td className="p-3 font-semibold">{gbp(o.total)}</td>
                <td className="p-3 text-slate-500">{new Date(o.date).toLocaleString('en-GB')}</td>
                <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${o.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : o.status === 'refunded' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
