import { useState, useEffect } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Radio, Users, Play } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

export default function LiveDraw() {
  const [contests, setContests] = useState([]);
  const [selected, setSelected] = useState('');
  const [winner, setWinner] = useState(null);
  const [live, setLive] = useState(false);
  const [ticket, setTicket] = useState('–');
  const [viewers, setViewers] = useState(1);
  const { toast } = useToast();

  useEffect(() => {
    adminAPI.contests().then(list => {
      setContests(list);
      if (list[0]) setSelected(list[0].contest_id);
    }).catch((err) => console.error('[live-draw] contests:', err?.message));
  }, []);

  const contest = contests.find(c => c.contest_id === selected);

  useEffect(() => {
    if (!live || !contest) return;
    const total = contest.tickets_sold || 1;
    const i = setInterval(() => {
      setTicket(String(Math.floor(Math.random() * Math.max(total, 10)) + 1));
      setViewers(v => v + Math.floor(Math.random() * 5) - 1);
    }, 700);
    return () => clearInterval(i);
  }, [live, contest]);

  const drawNow = async () => {
    if (!selected) return;
    try {
      const r = await adminAPI.draw(selected);
      setWinner(r.winner);
      setTicket(String(r.winner.ticket_number));
      setLive(false);
      toast({ title: 'Winner drawn!', description: `${r.winner.user_name} – Ticket #${r.winner.ticket_number}` });
    } catch (e) {
      toast({ title: 'Draw failed', description: e?.response?.data?.detail || 'Sell tickets first before drawing.' });
    }
  };

  if (!contest) return <div className="text-slate-400">Loading contests…</div>;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <label className="text-xs uppercase text-slate-400">Contest</label>
          <select value={selected} onChange={e => { setSelected(e.target.value); setWinner(null); setTicket('–'); setLive(false); }}
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white">
            {contests.map(c => <option key={c.contest_id} value={c.contest_id}>{c.title} ({c.tickets_sold || 0}/{c.tickets_total}) – {c.status}</option>)}
          </select>
        </div>

        <div className="aspect-video bg-black rounded-2xl overflow-hidden relative flex items-center justify-center">
          <img src={contest.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/60" />
          <div className="relative text-center px-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-bold mb-3">
              <Radio className={`w-3 h-3 ${live ? 'animate-pulse' : ''}`} /> {live ? 'LIVE' : (winner ? 'DRAWN' : 'STANDBY')}
            </div>
            <div className="font-display text-2xl md:text-4xl font-extrabold text-white">{contest.title}</div>
            <div className="mt-6 text-white">
              <div className="text-xs uppercase tracking-widest text-white/70">{winner ? 'Winning ticket' : 'Roll…'}</div>
              <div className="font-display text-6xl font-black mt-2 tracking-tight text-amber-300">{ticket}</div>
              {winner && <div className="mt-2 text-emerald-300 font-semibold">🏆 {winner.user_name}</div>}
            </div>
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-2 text-white text-sm bg-black/60 px-2.5 py-1 rounded-full"><Users className="w-3.5 h-3.5" /> {viewers}</div>
        </div>

        <div className="flex gap-3">
          <Button onClick={() => setLive(!live)} disabled={!!winner} className={`flex-1 h-12 ${live ? 'bg-slate-700 hover:bg-slate-600' : 'bg-rose-600 hover:bg-rose-700'}`}>
            {live ? 'Stop roll' : 'Start roll animation'}
          </Button>
          <Button onClick={drawNow} disabled={!!winner || contest.status !== 'live'} className="h-12 bg-emerald-600 hover:bg-emerald-700"><Play className="w-4 h-4 mr-2" /> Draw winner (final)</Button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h3 className="font-display font-bold text-white mb-3">Contest details</h3>
        <div className="text-sm text-slate-300 space-y-2">
          <div>Prize: <span className="text-teal-400 font-semibold">£{contest.prize_amount}</span></div>
          <div>Tickets sold: {contest.tickets_sold || 0} / {contest.tickets_total}</div>
          <div>Status: <span className="uppercase">{contest.status}</span></div>
          <div>Ends: {new Date(contest.end_date).toLocaleString('en-GB')}</div>
        </div>
        {winner && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm">
            <div className="font-semibold">🏆 Winner drawn</div>
            <div>{winner.user_name}</div>
            <div className="text-xs">Ticket #{winner.ticket_number} • {new Date(winner.drawn_at).toLocaleString('en-GB')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
