import { REVENUE_SERIES, COMPETITIONS } from '../../mock/mockData';
import { gbp } from '../../lib/format';

export default function AnalyticsPage() {
  const revMax = Math.max(1, ...REVENUE_SERIES.map(x => x.revenue));
  const ticketMax = Math.max(1, ...REVENUE_SERIES.map(x => x.tickets));
  const totalPrize = COMPETITIONS.reduce((s, c) => s + c.prizeAmount, 0);

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-extrabold">Analytics</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Total contests</div><div className="font-display font-extrabold text-2xl">{COMPETITIONS.length}</div></div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Prize pool</div><div className="font-display font-extrabold text-2xl text-teal-600">{gbp(totalPrize)}</div></div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Tickets sold</div><div className="font-display font-extrabold text-2xl">0</div></div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4"><div className="text-xs text-slate-500">Revenue</div><div className="font-display font-extrabold text-2xl">{gbp(0)}</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="font-semibold text-slate-900 mb-4">Revenue trend</div>
          <svg viewBox="0 0 300 120" className="w-full h-40">
            <line x1="0" y1="110" x2="300" y2="110" stroke="#e2e8f0" strokeWidth="1" />
            <text x="150" y="60" textAnchor="middle" fill="#94a3b8" fontSize="12">Data will appear after first sales</text>
          </svg>
          <div className="flex justify-between text-xs text-slate-500 mt-2">{REVENUE_SERIES.map(d => <span key={d.m}>{d.m}</span>)}</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="font-semibold text-slate-900 mb-4">Contest capacity</div>
          <div className="space-y-3">
            {COMPETITIONS.slice(0, 8).map(c => (
              <div key={c.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700 truncate pr-4">{c.title}</span>
                  <span className="font-semibold text-teal-600">{c.ticketsTotal}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${(c.ticketsTotal / 600) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
