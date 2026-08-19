import { useEffect, useState } from 'react';
import { adminAPI, productionAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Package, CheckCircle2, Clock, ClipboardList, Trophy, Zap, AlertTriangle, Play } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { gbp } from '../../lib/format';

export default function Operations() {
  const [winners, setWinners] = useState([]);
  const [contests, setContests] = useState([]);
  const [upcoming, setUpcoming] = useState({ ending_soon: [], overdue: [], recently_drawn: [] });
  const [drawing, setDrawing] = useState('');
  const { toast } = useToast();

  const loadAll = () => {
    adminAPI.winners().then(setWinners).catch(() => {});
    adminAPI.contests().then(setContests).catch(() => {});
    productionAPI.upcomingDraws(48).then(setUpcoming).catch(() => {});
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(() => productionAPI.upcomingDraws(48).then(setUpcoming).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);

  const drawNow = async (contestId) => {
    setDrawing(contestId);
    try {
      const r = await productionAPI.draw(contestId);
      toast({ title: '🎉 Winner drawn', description: `${r.winner.user_name} • Ticket #${r.winner.ticket_number}` });
      loadAll();
    } catch (e) {
      toast({ title: 'Draw failed', description: e?.response?.data?.detail || 'Try again' });
    } finally { setDrawing(''); }
  };

  const live = contests.filter(c => c.status === 'live').length;
  const fmtCountdown = (endDate) => {
    const ms = new Date(endDate) - new Date();
    if (ms <= 0) return 'Overdue';
    const h = Math.floor(ms / 3.6e6);
    const m = Math.floor((ms % 3.6e6) / 6e4);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const dueList = [
    ...upcoming.overdue,
    ...upcoming.ending_soon.filter(c => !upcoming.overdue.some(o => o.contest_id === c.contest_id)),
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Overdue draws', value: upcoming.overdue.length, color: 'from-red-500 to-rose-600' },
          { label: 'Ending in 48h', value: upcoming.ending_soon.length, color: 'from-amber-500 to-orange-500' },
          { label: 'Contests live', value: live, color: 'from-emerald-500 to-teal-500' },
          { label: 'Payouts pending', value: winners.filter(w => !w.paid_out).length, color: 'from-fuchsia-500 to-pink-500' },
        ].map((s, i) => (
          <div key={i} data-testid={`ops-stat-${i}`} className={`rounded-2xl p-5 bg-gradient-to-br ${s.color} text-white shadow-lg`}>
            <div className="text-xs opacity-90 uppercase tracking-wider">{s.label}</div>
            <div className="font-display font-extrabold text-3xl mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Draw queue */}
      <div data-testid="upcoming-draws" className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> Draw queue
            <span className="text-xs font-normal text-slate-400">(auto-drawn every 60s when end-date passes)</span>
          </h3>
        </div>

        {upcoming.overdue.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span><b>{upcoming.overdue.length}</b> contest{upcoming.overdue.length > 1 ? 's' : ''} overdue — scheduler will process on next tick, or draw now.</span>
          </div>
        )}

        {dueList.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No draws in the next 48h.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {dueList.slice(0, 12).map(c => {
              const overdue = new Date(c.end_date) <= new Date();
              return (
                <div key={c.contest_id} data-testid={`draw-row-${c.contest_id}`} className={`rounded-xl border p-4 flex items-center gap-3 ${overdue ? 'bg-red-500/5 border-red-500/30' : 'bg-slate-800/60 border-slate-800'}`}>
                  <img src={c.image} alt="" className="w-14 h-14 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{c.title}</div>
                    <div className="text-xs text-slate-400">Prize {gbp(c.prize_amount)} • {c.tickets_sold || 0}/{c.tickets_total} tickets</div>
                    <div className={`text-xs mt-1 ${overdue ? 'text-red-300' : 'text-amber-300'}`}>
                      <Clock className="w-3 h-3 inline mr-1" />
                      {overdue ? 'Overdue' : `Ends in ${fmtCountdown(c.end_date)}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    data-testid={`draw-now-${c.contest_id}`}
                    disabled={drawing === c.contest_id || (c.tickets_sold || 0) === 0}
                    onClick={() => drawNow(c.contest_id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Play className="w-3.5 h-3.5 mr-1" />
                    {drawing === c.contest_id ? 'Drawing…' : 'Draw now'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Latest winners */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-white flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" /> Latest Winners</h3>
          <a href="/admin/winners" className="text-xs text-amber-400 hover:underline">View all →</a>
        </div>
        {winners.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 mx-auto flex items-center justify-center mb-3"><ClipboardList className="w-6 h-6" /></div>
            <div className="text-sm">No winners yet. Draws will appear here after contests are drawn.</div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {winners.slice(0, 6).map(w => (
              <div key={w.winner_id} className="bg-slate-800/60 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center"><Trophy className="w-5 h-5" /></div>
                  <div>
                    <div className="font-semibold text-white">{w.user_name}</div>
                    <div className="text-xs text-slate-400">Ticket #{w.ticket_number}</div>
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-300 line-clamp-2">{w.prize_title}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-teal-400 font-bold">{gbp(w.prize_amount)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${w.paid_out ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                    {w.paid_out ? <><CheckCircle2 className="w-3 h-3 inline mr-1" /> Paid</> : <><Clock className="w-3 h-3 inline mr-1" /> Awaiting payout</>}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">{new Date(w.drawn_at).toLocaleString('en-GB')}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live contests summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-white flex items-center gap-2"><Package className="w-5 h-5 text-teal-400" /> Live contests</h3>
          <a href="/admin/competitions" className="text-xs text-teal-400 hover:underline">Manage →</a>
        </div>
        {contests.filter(c => c.status === 'live').length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No live contests. Use <span className="font-semibold text-white">Contests</span> or ask Meera to launch some.</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {contests.filter(c => c.status === 'live').slice(0, 9).map(c => (
              <div key={c.contest_id} className="bg-slate-800/60 border border-slate-800 rounded-xl p-3 flex gap-3">
                <img src={c.image} alt="" className="w-14 h-14 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{c.title}</div>
                  <div className="text-xs text-slate-400">Prize {gbp(c.prize_amount)} • {c.tickets_sold || 0}/{c.tickets_total}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
