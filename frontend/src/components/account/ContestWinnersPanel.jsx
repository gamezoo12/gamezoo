import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { contestWinnersAPI } from '../../lib/api';

const money = (v) => `£${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const TYPE = { winnings: 'Winnings Tokens', bonus: 'Bonus Tokens' };

export default function ContestWinnersPanel() {
  const [contests, setContests] = useState(null);
  useEffect(() => { contestWinnersAPI().then((r) => setContests(r.contests)).catch(() => setContests([])); }, []);
  return (
    <div className="space-y-4" data-testid="panel-contest-winners">
      <div className="rounded-2xl bg-gradient-to-br from-[#1b0f4d] to-[#3a1580] p-6 text-white">
        <h2 className="flex items-center gap-2 text-2xl font-black"><Trophy className="h-6 w-6 text-amber-300" />Contest winners</h2>
        <p className="mt-1 text-sm text-indigo-100/80">Winners of every Prize League contest, as announced after each draw.</p>
      </div>
      {contests === null && <p className="text-sm text-slate-500">Loading winners…</p>}
      {contests?.length === 0 && <p className="rounded-2xl border border-slate-100 bg-white py-10 text-center text-sm text-slate-500" data-testid="contest-winners-empty">No winners announced yet.</p>}
      {contests?.map((c) => (
        <section key={c.contest_id} className="rounded-2xl border border-slate-100 bg-white p-5" data-testid={`contest-winners-${c.contest_id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-bold text-slate-900">{c.contest_title}</h3>
            {c.drawn_at && <span className="text-xs text-slate-500">{new Date(c.drawn_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}</div>
          <ul className="mt-3 divide-y divide-slate-100">
            {c.winners.map((w) => (
              <li key={w.winner_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="flex items-center gap-3"><span className="rounded-lg bg-amber-100 px-2 py-1 font-black text-amber-800">#{w.ticket_number}</span><div><div className="font-semibold text-slate-900">{w.name}</div><div className="text-xs text-slate-500">{w.round_name}</div></div></div>
                <div className="text-right"><div className="font-black text-violet-700">{money(w.prize_amount)}</div><div className="text-[11px] text-slate-500">{TYPE[w.reward_type] || ''}</div></div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
