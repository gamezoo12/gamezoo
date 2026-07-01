import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Package, Truck, CheckCircle2, Clock, ClipboardList, Trophy } from 'lucide-react';
import { gbp } from '../../lib/format';

export default function Operations() {
  const [stats, setStats] = useState(null);
  const [winners, setWinners] = useState([]);
  const [contests, setContests] = useState([]);

  useEffect(() => {
    adminAPI.stats().then(setStats).catch(() => {});
    adminAPI.winners().then(setWinners).catch(() => {});
    adminAPI.contests().then(setContests).catch(() => {});
  }, []);

  const live = contests.filter(c => c.status === 'live').length;
  const drafts = contests.filter(c => c.status === 'draft').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Payouts pending', value: winners.filter(w => !w.paid_out).length, color: 'from-emerald-500 to-teal-500' },
          { label: 'Contests on hold', value: drafts, color: 'from-slate-500 to-slate-700' },
          { label: 'Contests live', value: live, color: 'from-rose-500 to-orange-500' },
          { label: 'Total winners', value: winners.length, color: 'from-amber-400 to-orange-500' },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl p-5 bg-gradient-to-br ${s.color} text-white`}>
            <div className="text-xs opacity-90">{s.label}</div>
            <div className="font-display font-extrabold text-2xl mt-1">{s.value}</div>
          </div>
        ))}
      </div>

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
