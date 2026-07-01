import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { gbp } from '../../lib/format';
import { Receipt } from 'lucide-react';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  useEffect(() => { adminAPI.orders().then(setOrders).catch(() => setOrders([])); }, []);
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-extrabold">Orders ({orders.length})</h2>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {orders.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3"><Receipt className="w-6 h-6 text-slate-400" /></div>
            <div className="text-slate-500 text-sm">No orders yet.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="text-left p-3">Order ID</th><th className="text-left p-3">User</th><th className="text-left p-3">Items</th><th className="text-left p-3">Total</th><th className="text-left p-3">Date</th><th className="text-left p-3">Method</th></tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.order_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 text-teal-600 font-medium">#{o.order_id.slice(0, 10)}</td>
                  <td className="p-3">{o.user_name} <span className="text-xs text-slate-400">({o.user_email})</span></td>
                  <td className="p-3 text-slate-500">{o.items.length} contest(s)</td>
                  <td className="p-3 font-semibold">{gbp(o.total)}</td>
                  <td className="p-3 text-slate-500">{new Date(o.created_at).toLocaleString('en-GB')}</td>
                  <td className="p-3"><span className="text-xs px-2 py-1 rounded-full bg-slate-100">{o.method}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
