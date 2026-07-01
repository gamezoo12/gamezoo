import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { gbp, percent } from '../../lib/format';
import { useToast } from '../../hooks/use-toast';
import { Play } from 'lucide-react';

export default function CompetitionsAdmin() {
  const [contests, setContests] = useState([]);
  const { toast } = useToast();

  const load = () => adminAPI.contests().then(setContests).catch(() => {});
  useEffect(() => { load(); }, []);

  const draw = async (id) => {
    try {
      const r = await adminAPI.draw(id);
      toast({ title: 'Winner drawn!', description: `${r.winner.user_name} – Ticket #${r.winner.ticket_number}` });
      load();
    } catch (e) {
      toast({ title: 'Draw failed', description: e?.response?.data?.detail || 'Unknown error' });
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-extrabold">Contests ({contests.length})</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contests.map(c => {
          const pct = percent(c.tickets_sold || 0, c.tickets_total);
          return (
            <div key={c.contest_id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="flex gap-3 p-3">
                <img src={c.image} alt="" className="w-24 h-24 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500 uppercase">{c.category} • {c.status}</div>
                  <div className="font-semibold text-slate-900 line-clamp-2">{c.title}</div>
                  <div className="text-xs text-slate-500 mt-1">Prize {gbp(c.prize_amount)} • {c.tickets_sold || 0}/{c.tickets_total}</div>
                </div>
              </div>
              <div className="px-3"><Progress value={pct} className="h-1.5" /></div>
              <div className="flex justify-end gap-2 p-3">
                <Button variant="outline" size="sm" disabled={c.status !== 'live'} onClick={() => draw(c.contest_id)}>
                  <Play className="w-3.5 h-3.5 mr-1" /> Draw winner
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
