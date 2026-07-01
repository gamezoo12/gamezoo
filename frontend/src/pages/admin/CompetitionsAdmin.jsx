import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { gbp, percent } from '../../lib/format';
import { useToast } from '../../hooks/use-toast';
import { Play, Pause, Trash2, Trophy } from 'lucide-react';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'On hold' },
  { key: 'live', label: 'Live' },
  { key: 'drawn', label: 'Drawn' },
];

export default function CompetitionsAdmin() {
  const [contests, setContests] = useState([]);
  const [tab, setTab] = useState('all');
  const { toast } = useToast();

  const load = () => adminAPI.contests().then(setContests).catch(() => {});
  useEffect(() => { load(); }, []);

  const launch = async (id) => { try { await adminAPI.launchContest(id); toast({ title: 'Contest launched 🚀' }); load(); } catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); } };
  const pause = async (id) => { try { await adminAPI.pauseContest(id); toast({ title: 'Contest paused' }); load(); } catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); } };
  const remove = async (id) => { if (!window.confirm('Delete contest? This also deletes its tickets.')) return; try { await adminAPI.deleteContest(id); toast({ title: 'Deleted' }); load(); } catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); } };
  const draw = async (id) => { try { const r = await adminAPI.draw(id); toast({ title: 'Winner drawn!', description: `${r.winner.user_name} – Ticket #${r.winner.ticket_number}` }); load(); } catch (e) { toast({ title: 'Draw failed', description: e?.response?.data?.detail }); } };

  const filtered = contests.filter(c => tab === 'all' || c.status === tab);
  const statusColors = { live: 'bg-emerald-100 text-emerald-700', draft: 'bg-slate-200 text-slate-700', drawn: 'bg-amber-100 text-amber-700', archived: 'bg-slate-100 text-slate-500' };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="font-display text-2xl font-extrabold">Contests ({contests.length})</h2>
        <div className="flex gap-1 bg-white border border-slate-100 p-1 rounded-xl">
          {STATUS_TABS.map(t => {
            const count = t.key === 'all' ? contests.length : contests.filter(c => c.status === t.key).length;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {t.label} <span className={`ml-1 text-xs ${tab === t.key ? 'text-white/80' : 'text-slate-400'}`}>({count})</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-sm text-slate-500">All contests default to <span className="font-semibold text-slate-700">On hold</span>. Click <span className="font-semibold text-emerald-700">Launch</span> to make one live on the public site.</p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(c => {
          const pct = percent(c.tickets_sold || 0, c.tickets_total);
          return (
            <div key={c.contest_id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="flex gap-3 p-3">
                <img src={c.image} alt="" className="w-20 h-20 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${statusColors[c.status] || statusColors.draft}`}>{c.status}</span><span className="text-xs text-slate-500">{c.category}</span></div>
                  <div className="font-semibold text-slate-900 line-clamp-2 mt-1">{c.title}</div>
                  <div className="text-xs text-slate-500 mt-1">Prize {gbp(c.prize_amount)} • {c.tickets_sold || 0}/{c.tickets_total}</div>
                </div>
              </div>
              <div className="px-3"><Progress value={pct} className="h-1.5" /></div>
              <div className="flex flex-wrap justify-end gap-2 p-3">
                {c.status === 'draft' && <Button size="sm" onClick={() => launch(c.contest_id)} className="bg-emerald-600 hover:bg-emerald-700"><Play className="w-3.5 h-3.5 mr-1" /> Launch</Button>}
                {c.status === 'live' && <Button size="sm" variant="outline" onClick={() => pause(c.contest_id)}><Pause className="w-3.5 h-3.5 mr-1" /> Pause</Button>}
                {c.status === 'live' && <Button size="sm" onClick={() => draw(c.contest_id)} className="bg-teal-600 hover:bg-teal-700"><Trophy className="w-3.5 h-3.5 mr-1" /> Draw</Button>}
                <Button size="sm" variant="outline" onClick={() => remove(c.contest_id)} className="text-rose-600 hover:text-rose-700 border-rose-200"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <p className="text-center text-slate-500 py-16">No contests in this status. Ask Meera to create some!</p>}
    </div>
  );
}
