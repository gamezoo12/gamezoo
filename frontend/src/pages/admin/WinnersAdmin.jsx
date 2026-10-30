import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Check } from 'lucide-react';
import { gbp } from '../../lib/format';
import { useToast } from '../../hooks/use-toast';
import { WinnersAllWorlds } from '../../components/admin/WinnersAllWorlds';

export default function WinnersAdmin() {
  const [winners, setWinners] = useState([]);
  const [ticker, setTicker] = useState([]);
  const [form, setForm] = useState({ user_name: '', prize_amount: '' });
  const { toast } = useToast();

  const load = () => adminAPI.winners().then(setWinners).catch(() => {});
  const loadTicker = () => adminAPI.tickerWinners().then((d) => setTicker(d.winners || [])).catch(() => {});
  useEffect(() => { load(); loadTicker(); }, []);

  const addTicker = async (e) => {
    e.preventDefault();
    try {
      await adminAPI.addTickerWinner({ user_name: form.user_name, prize_amount: Number(form.prize_amount), currency: 'GBP' });
      setForm({ user_name: '', prize_amount: '' });
      toast({ title: 'Winner added to ticker' });
      loadTicker();
    } catch (err) {
      toast({ title: 'Failed', description: JSON.stringify(err?.response?.data?.detail || '') });
    }
  };

  const removeTicker = async (id) => {
    try { await adminAPI.deleteTickerWinner(id); loadTicker(); }
    catch (err) { toast({ title: 'Failed', description: err?.response?.data?.detail }); }
  };

  const markPaid = async (id) => {
    try { await adminAPI.markPaid(id); toast({ title: 'Marked as paid' }); load(); }
    catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="ticker-winners-admin">
        <h3 className="font-display font-bold mb-3">Announcement ticker winners ({ticker.length})</h3>
        <form onSubmit={addTicker} className="flex flex-wrap gap-2 mb-3">
          <input required maxLength={60} placeholder="Winner name" value={form.user_name}
            onChange={(e) => setForm({ ...form, user_name: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="ticker-winner-name" />
          <input required type="number" min="0.01" step="0.01" placeholder="Prize £" value={form.prize_amount}
            onChange={(e) => setForm({ ...form, prize_amount: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-32" data-testid="ticker-winner-amount" />
          <Button type="submit" className="bg-[#6C2BFF] hover:bg-[#4A15D9]" data-testid="ticker-winner-add">Add winner</Button>
        </form>
        <ul className="divide-y divide-slate-100">
          {ticker.map((t) => (
            <li key={t.winner_id} className="flex items-center justify-between py-2 text-sm">
              <span>{t.user_name} won {gbp(t.prize_amount)}</span>
              <button type="button" onClick={() => removeTicker(t.winner_id)} className="text-red-600 text-xs hover:underline">Remove</button>
            </li>
          ))}
        </ul>
      </div>
      <WinnersAllWorlds />
      {winners.some((w) => !w.paid_out && w.source !== 'draw_studio') && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="legacy-unpaid-winners">
          <h3 className="font-display font-bold mb-2">Unpaid legacy contest winners</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {winners.filter((w) => !w.paid_out && w.source !== 'draw_studio').map(w => (
              <div key={w.winner_id} className="rounded-xl border border-slate-100 p-3 text-sm">
                <div className="font-bold">{w.prize_title}</div>
                <div className="text-slate-500">{w.user_name} · Ticket #{w.ticket_number} · {gbp(w.prize_cash_amount ?? w.prize_amount)}</div>
                <Button size="sm" onClick={() => markPaid(w.winner_id)} className="mt-2 bg-[#6C2BFF] hover:bg-[#4A15D9]"><Check className="w-3.5 h-3.5 mr-1" />Mark PAID + credit wallet</Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
