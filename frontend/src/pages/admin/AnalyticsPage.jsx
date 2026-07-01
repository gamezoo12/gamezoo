import { REVENUE_SERIES, COMPETITIONS } from '../../mock/mockData';
import { gbp } from '../../lib/format';

export default function AnalyticsPage() {
  const revMax = Math.max(...REVENUE_SERIES.map(x => x.revenue));
  const ticketMax = Math.max(...REVENUE_SERIES.map(x => x.tickets));

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-extrabold">Analytics</h2>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="font-semibold text-slate-900 mb-4">Revenue trend</div>
          <svg viewBox="0 0 300 120" className="w-full h-40">
            <polyline fill="none" stroke="#14b8a6" strokeWidth="2.5"
              points={REVENUE_SERIES.map((d, i) => `${(i * 300) / (REVENUE_SERIES.length - 1)},${120 - (d.revenue / revMax) * 110}`).join(' ')} />
            {REVENUE_SERIES.map((d, i) => {
              const x = (i * 300) / (REVENUE_SERIES.length - 1);
              const y = 120 - (d.revenue / revMax) * 110;
              return <circle key={i} cx={x} cy={y} r="3" fill="#14b8a6" />;
            })}
          </svg>
          <div className="flex justify-between text-xs text-slate-500 mt-2">{REVENUE_SERIES.map(d => <span key={d.m}>{d.m}</span>)}</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="font-semibold text-slate-900 mb-4">Tickets sold</div>
          <div className="flex items-end gap-2 h-40">
            {REVENUE_SERIES.map((d, i) => (
              <div key={i} className="flex-1 h-full flex flex-col items-center gap-1 justify-end">
                <div className="w-full rounded-t bg-gradient-to-t from-orange-500 to-amber-400" style={{ height: `${(d.tickets / ticketMax) * 100}%`, minHeight: '4px' }} />
                <div className="text-[10px] text-slate-500">{d.m}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="font-semibold text-slate-900 mb-4">Top revenue competitions</div>
        <div className="space-y-3">
          {COMPETITIONS.slice(0, 6).map(c => {
            const rev = c.price * c.ticketsSold;
            const max = Math.max(...COMPETITIONS.map(x => x.price * x.ticketsSold));
            return (
              <div key={c.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700 truncate pr-4">{c.title}</span>
                  <span className="font-semibold text-teal-600">{gbp(rev)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${(rev / max) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
