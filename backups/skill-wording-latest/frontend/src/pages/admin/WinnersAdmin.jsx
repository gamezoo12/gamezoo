import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Trophy, Check } from 'lucide-react';
import { gbp } from '../../lib/format';
import { useToast } from '../../hooks/use-toast';

export default function WinnersAdmin() {
  const [winners, setWinners] = useState([]);
  const { toast } = useToast();

  const load = () => adminAPI.winners().then(setWinners).catch(() => {});
  useEffect(() => { load(); }, []);

  const markPaid = async (id) => {
    try { await adminAPI.markPaid(id); toast({ title: 'Marked as paid' }); load(); }
    catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); }
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-extrabold">Winners ({winners.length})</h2>
      {winners.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3"><Trophy className="w-6 h-6 text-slate-400" /></div>
          <div className="text-slate-500 text-sm">No winners yet. Head to <span className="font-semibold">Contests</span> and press “Draw winner” after a contest closes.</div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {winners.map(w => (
            <div key={w.winner_id} className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-orange-600 text-sm font-semibold"><Trophy className="w-4 h-4" /> {gbp(w.prize_amount)}</div>
              <div className="font-display font-bold text-slate-900 mt-1">{w.prize_title}</div>
              <div className="text-sm text-slate-500 mt-1">{w.user_name} · Ticket #{w.ticket_number}</div>
              <div className="text-xs text-slate-400 mt-1">{new Date(w.drawn_at).toLocaleString('en-GB')}</div>
              <div className="mt-3">
                {w.paid_out ? <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Paid out</span>
                  : <Button size="sm" onClick={() => markPaid(w.winner_id)} className="bg-[#6C2BFF] hover:bg-[#4A15D9]">Mark paid</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
