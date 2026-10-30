import { Plus, Trash2 } from 'lucide-react';

const field = 'h-10 w-full rounded-lg border border-white/15 bg-[#0b0f33] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-300 focus:outline-none disabled:opacity-50';
const label = 'mb-1 block text-[11px] font-bold uppercase tracking-wider text-indigo-200/70';
export const newRound = (n) => ({ name: `Draw ${n}`, prize_amount: 50, num_winners: 1, duration_s: 30, reveals: 3, announcement_text: '', allow_previous_winners: false });

export function RoundsEditor({ rounds, setRounds, locked, results }) {
  const update = (i, patch) => setRounds(rounds.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3" data-testid="draw-rounds-editor">
      {rounds.map((r, i) => (
        <article key={i} className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#16124a] to-[#0b0f33] p-4" data-testid={`draw-round-${i}`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-black text-amber-300">Round {i + 1}{results?.[i] ? ' · drawn' : ''}</h3>
            {!locked && rounds.length > 1 && <button type="button" onClick={() => setRounds(rounds.filter((_, k) => k !== i))} className="text-rose-300 hover:text-rose-200" data-testid={`draw-round-remove-${i}`} aria-label="Remove round"><Trash2 className="h-4 w-4" /></button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className={label}>Draw name</span><input className={field} disabled={locked} value={r.name} onChange={(e) => update(i, { name: e.target.value })} data-testid={`draw-round-name-${i}`} /></label>
            <label><span className={label}>Prize per winner (£)</span><input className={field} disabled={locked} type="number" min="1" step="0.01" value={r.prize_amount} onChange={(e) => update(i, { prize_amount: Number(e.target.value) })} data-testid={`draw-round-prize-${i}`} /></label>
            <label><span className={label}>Winners</span><input className={field} disabled={locked} type="number" min="1" max="100" value={r.num_winners} onChange={(e) => update(i, { num_winners: Number(e.target.value) })} data-testid={`draw-round-winners-${i}`} /></label>
            <label><span className={label}>Duration (s)</span>
              <div className="flex gap-1">
                <select className={field} disabled={locked} value={[10, 20, 30, 45, 60, 90, 120].includes(r.duration_s) ? r.duration_s : 'custom'} onChange={(e) => e.target.value !== 'custom' && update(i, { duration_s: Number(e.target.value) })} data-testid={`draw-round-duration-${i}`}>
                  {[10, 20, 30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d}s</option>)}<option value="custom">Custom</option>
                </select>
                <input className={`${field} w-20`} disabled={locked} type="number" min="10" max="600" value={r.duration_s} onChange={(e) => update(i, { duration_s: Number(e.target.value) })} data-testid={`draw-round-duration-custom-${i}`} />
              </div>
            </label>
            <label><span className={label}>Ticket reveals</span><input className={field} disabled={locked} type="number" min="0" max="20" value={r.reveals} onChange={(e) => update(i, { reveals: Number(e.target.value) })} data-testid={`draw-round-reveals-${i}`} /></label>
            <label className="sm:col-span-2"><span className={label}>Winner announcement ({'{winners}'} = names)</span><input className={field} disabled={locked} maxLength={300} value={r.announcement_text} placeholder="Congratulations {winners}!" onChange={(e) => update(i, { announcement_text: e.target.value })} data-testid={`draw-round-announcement-${i}`} /></label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-indigo-100"><input type="checkbox" disabled={locked} checked={r.allow_previous_winners} onChange={(e) => update(i, { allow_previous_winners: e.target.checked })} data-testid={`draw-round-repeat-${i}`} /> Earlier winners stay eligible</label>
          </div>
        </article>
      ))}
      {!locked && <button type="button" onClick={() => setRounds([...rounds, newRound(rounds.length + 1)])} className="inline-flex items-center gap-2 rounded-full border border-dashed border-amber-300/60 px-4 py-2 text-sm font-bold text-amber-200 transition-colors hover:bg-amber-300/10" data-testid="draw-round-add"><Plus className="h-4 w-4" /> Add round</button>}
    </div>
  );
}
