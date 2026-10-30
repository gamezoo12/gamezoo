import { FileCheck2, Megaphone, PlayCircle } from 'lucide-react';

const money = (v) => `£${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} sec` : `${Math.round(s)} sec`);
export const showSeconds = (r) => Number(r.load_duration_s) + Number(r.mix_duration_s) + Number(r.reveal_duration_s) * Number(r.num_winners) + 8;

export function FlowPanel({ rounds }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5" data-testid="draw-flow">
      <h2 className="text-sm font-black uppercase tracking-widest text-amber-300">Draw flow</h2>
      <p className="mt-1 text-xs text-indigo-200/60">Every stage waits for your button press.</p>
      <ol className="mt-4 space-y-4">
        {rounds.map((r, i) => (
          <li key={i} className="rounded-xl border border-white/5 bg-[#0b0724] p-3" data-testid={`draw-flow-round-${i}`}>
            <div className="flex items-center justify-between text-sm font-bold text-white"><span>{i + 1}. {r.name}</span><span className="text-amber-300">{money(r.prize_amount)} × {r.num_winners}</span></div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] font-bold uppercase text-indigo-200/70">
              {[['Enter pool', r.load_duration_s], ['Mix', r.mix_duration_s], ['Draw', r.reveal_duration_s * r.num_winners], ['Reveal', null]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-white/5 px-1 py-1.5">{k}<div className="text-xs text-white">{v === null ? 'manual' : `${v}s`}</div></div>
              ))}
            </div>
          </li>
        ))}
        <li className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 text-sm font-bold text-amber-200">Finale · all winners on screen → Publish</li>
      </ol>
    </section>
  );
}

export function TotalsRow({ rounds, budget, published }) {
  const winners = rounds.reduce((a, r) => a + Number(r.num_winners || 0), 0);
  const secs = rounds.reduce((a, r) => a + showSeconds(r), 0);
  return (
    <div className="mt-4 grid grid-cols-3 gap-3" data-testid="draw-totals">
      {[['Total prize amount', `${money(budget)}`, budget > published ? 'text-rose-300' : 'text-amber-300', 'draw-budget'], ['Total winners', winners, 'text-white', 'draw-total-winners'], ['Approx. show time', fmt(secs), 'text-white', 'draw-total-duration']].map(([k, v, c, id]) => (
        <div key={k} className="rounded-xl border border-white/10 bg-[#0b0724] p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/60">{k}</div>
          <div className={`mt-1 text-xl font-black ${c}`} data-testid={id}>{v}</div>
        </div>
      ))}
    </div>
  );
}

export function ResultsPanel({ results, rounds, onReplay, onReport, busy }) {
  if (!results.length) return null;
  return (
    <section className="rounded-2xl border border-amber-300/30 bg-amber-300/5 p-5" data-testid="draw-results">
      <div className="flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-widest text-amber-300">Official results (final)</h2>
        <button type="button" className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs font-bold text-white hover:bg-white/10" onClick={onReport} disabled={busy} data-testid="draw-report"><FileCheck2 className="h-3.5 w-3.5" />Audit report</button></div>
      {results.map((r) => (
        <div key={r.round_index} className="mt-3 border-t border-white/10 pt-3 text-sm" data-testid={`draw-result-${r.round_index}`}>
          <div className="flex items-center justify-between gap-2"><b className="text-white">{rounds[r.round_index]?.name || r.round_name}</b>
            <button type="button" className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white hover:bg-white/20" onClick={() => onReplay(r.round_index)} data-testid={`draw-result-replay-${r.round_index}`}><PlayCircle className="h-3.5 w-3.5" />Replay</button></div>
          <div className="mt-1 text-indigo-100">{r.winners.map((w) => `#${w.ticket_number} ${w.display_name}`).join(' · ')}</div>
          <div className="mt-1 text-[11px] text-indigo-200/60">Drawn {new Date(r.drawn_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })} · {r.candidate_count} eligible · {r.revealed_at ? 'shown on stage' : 'reveal pending'}{r.announcement_id ? ' · announced' : ''}</div>
        </div>
      ))}
      <p className="mt-3 flex items-center gap-1 text-[11px] text-indigo-200/60"><Megaphone className="h-3 w-3" />Rewards wait in Winners &amp; Approvals until you approve them.</p>
    </section>
  );
}
