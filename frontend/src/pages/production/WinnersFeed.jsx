import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { gbp } from '../../lib/format';
import { Trophy, Check, Clock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

export default function WinnersFeed() {
  const [winners, setWinners] = useState([]);
  const { toast } = useToast();
  const load = () => adminAPI.winners().then(setWinners).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);

  const markPaid = async (id) => { try { await adminAPI.markPaid(id); toast({ title: 'Marked as paid' }); load(); } catch (e) { toast({ title: 'Failed' }); } };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-extrabold text-white flex items-center gap-2"><Trophy className="w-6 h-6 text-amber-400" /> Winners feed <span className="text-sm text-slate-400 font-normal">(auto-refreshes)</span></h2>
      {winners.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl py-16 text-center text-slate-400">No winners yet.</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {winners.map(w => (
            <div key={w.winner_id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center"><Trophy className="w-6 h-6" /></div>
                <div><div className="font-semibold text-white">{w.user_name}</div><div className="text-xs text-slate-400">Ticket #{w.ticket_number}</div></div>
              </div>
              <div className="mt-3 text-sm text-slate-300 line-clamp-2">{w.prize_title}</div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-teal-400 font-bold">{gbp(w.prize_amount)}</span>
                {w.paid_out ? <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Paid</span> : <Button size="sm" onClick={() => markPaid(w.winner_id)} className="bg-teal-600 hover:bg-teal-700 text-xs">Mark paid</Button>}
              </div>
              <div className="text-[11px] text-slate-500 mt-2">{new Date(w.drawn_at).toLocaleString('en-GB')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
