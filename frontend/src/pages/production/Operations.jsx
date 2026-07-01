import { PRODUCTION_TASKS } from '../../mock/mockData';
import { Button } from '../../components/ui/button';
import { Package, Truck, CheckCircle2, Clock, AlertCircle, ClipboardList } from 'lucide-react';

const statusMap = {
  'paid-out': { label: 'Paid out', color: 'bg-emerald-500/20 text-emerald-300', Icon: CheckCircle2 },
  'shipped': { label: 'Shipped', color: 'bg-teal-500/20 text-teal-300', Icon: Truck },
  'packing': { label: 'Packing', color: 'bg-amber-500/20 text-amber-300', Icon: Package },
  'awaiting-bank-details': { label: 'Awaiting details', color: 'bg-rose-500/20 text-rose-300', Icon: AlertCircle },
  'draw-scheduled': { label: 'Draw scheduled', color: 'bg-indigo-500/20 text-indigo-300', Icon: Clock },
};

export default function Operations() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Payouts today', value: '£0', color: 'from-emerald-500 to-teal-500' },
          { label: 'Pending shipments', value: '0', color: 'from-orange-500 to-rose-500' },
          { label: 'Scheduled draws', value: '50', color: 'from-indigo-500 to-purple-500' },
          { label: 'Ops uptime', value: '100%', color: 'from-amber-400 to-orange-500' },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl p-5 bg-gradient-to-br ${s.color} text-white`}>
            <div className="text-xs opacity-90">{s.label}</div>
            <div className="font-display font-extrabold text-2xl mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-white">Fulfilment queue</h3>
          <Button className="bg-orange-500 hover:bg-orange-600">+ New task</Button>
        </div>
        {PRODUCTION_TASKS.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 mx-auto flex items-center justify-center mb-3"><ClipboardList className="w-6 h-6" /></div>
            <div className="text-sm">No fulfilment tasks yet. Tasks appear here after each draw.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {PRODUCTION_TASKS.map(t => {
              const s = statusMap[t.status] || statusMap['packing'];
              return (
                <div key={t.id} className="flex items-center gap-4 bg-slate-800/50 rounded-xl p-4 border border-slate-800">
                  <div className={`w-10 h-10 rounded-lg ${s.color} flex items-center justify-center`}><s.Icon className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0"><div className="font-medium text-white">{t.prize}</div><div className="text-xs text-slate-400">Winner: {t.winner} · {t.date}</div></div>
                  <div className={`text-xs px-3 py-1 rounded-full ${s.color}`}>{s.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
