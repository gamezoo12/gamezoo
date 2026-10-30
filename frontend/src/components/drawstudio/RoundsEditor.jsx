import { Plus, Trash2 } from 'lucide-react';

const cell = 'h-9 w-full rounded-lg border border-white/10 bg-[#0b0724] px-2 text-sm text-white focus:border-amber-300 focus:outline-none disabled:opacity-60';
export const newRound = (n) => ({ name: n === 1 ? 'Grand Prize' : `Prize ${n}`, prize_amount: 50, num_winners: 1, reward_type: 'winnings', load_duration_s: 12,
  mix_duration_s: 15, reveal_duration_s: 10, announcement_text: '', allow_previous_winners: false });
export const normaliseRounds = (rounds) => rounds.map((r, i) => ({ ...newRound(i + 1), ...r }));

const num = (min, max) => (v) => Math.max(min, Math.min(max, Number(v) || min));
const COLS = [
  ['name', 'Draw name', 'text', 'min-w-[140px]'], ['prize_amount', 'Prize £', num(1, 1000000), 'w-24'], ['num_winners', 'Winners', num(1, 100), 'w-20'],
  ['reward_type', 'Reward', null, 'w-32'], ['load_duration_s', 'Load s', num(3, 300), 'w-20'], ['mix_duration_s', 'Mix s', num(3, 300), 'w-20'],
  ['reveal_duration_s', 'Draw s', num(3, 120), 'w-20'],
];

function RoundRow({ r, i, update, remove, locked, drawn }) {
  return (
    <tr className="border-t border-white/5" data-testid={`draw-round-${i}`}>
      <td className="px-2 py-2 text-sm font-black text-amber-300">{i + 1}{drawn && <span className="ml-1 text-[9px] text-emerald-300">DRAWN</span>}</td>
      {COLS.map(([key, , parse, width]) => (
        <td key={key} className={`px-1 py-2 ${width}`}>
          {key === 'reward_type'
            ? <select className={cell} disabled={locked} value={r.reward_type} onChange={(e) => update(i, { reward_type: e.target.value })} data-testid={`draw-round-reward-${i}`}><option value="winnings">Winnings Tokens</option><option value="bonus">Bonus Tokens</option></select>
            : <input className={cell} disabled={locked} type={parse === 'text' ? 'text' : 'number'} maxLength={80} value={r[key]}
              onChange={(e) => update(i, { [key]: parse === 'text' ? e.target.value : e.target.value === '' ? '' : Number(e.target.value) })}
              onBlur={(e) => parse !== 'text' && update(i, { [key]: parse(e.target.value) })} data-testid={`draw-round-${key}-${i}`} />}
        </td>
      ))}
      <td className="px-2 py-2 text-center"><input type="checkbox" className="h-4 w-4 accent-amber-400" disabled={locked} checked={r.allow_previous_winners} onChange={(e) => update(i, { allow_previous_winners: e.target.checked })} data-testid={`draw-round-repeat-${i}`} aria-label="Earlier winners stay eligible" /></td>
      <td className="px-2 py-2">{!locked && <button type="button" onClick={() => remove(i)} className="rounded-full p-1.5 text-rose-300 transition-colors hover:bg-rose-500/10" data-testid={`draw-round-remove-${i}`} aria-label="Remove round"><Trash2 className="h-4 w-4" /></button>}</td>
    </tr>
  );
}

export function RoundsEditor({ rounds, setRounds, locked, results }) {
  const update = (i, patch) => setRounds(rounds.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const remove = (i) => rounds.length > 1 && setRounds(rounds.filter((_, k) => k !== i));
  return (
    <div data-testid="draw-rounds-editor">
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[880px] text-left">
          <thead className="bg-white/5 text-[10px] font-black uppercase tracking-wider text-indigo-200/70">
            <tr><th className="px-2 py-2">#</th>{COLS.map(([k, label]) => <th key={k} className="px-1 py-2">{label}</th>)}<th className="px-2 py-2" title="Earlier winners stay eligible">Repeat</th><th /></tr>
          </thead>
          <tbody>{rounds.map((r, i) => <RoundRow key={i} r={r} i={i} update={update} remove={remove} locked={locked} drawn={Boolean(results?.[i])} />)}</tbody>
        </table>
      </div>
      {!locked && <button type="button" onClick={() => setRounds([...rounds, newRound(rounds.length + 1)])} className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-xs font-black text-[#1a1033] transition-transform hover:-translate-y-0.5" data-testid="draw-round-add"><Plus className="h-4 w-4" /> Add Round</button>}
    </div>
  );
}
