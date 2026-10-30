import { useCallback, useEffect, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { paidWinnersAPI } from '../../lib/api';
import { Switch } from '../ui/switch';
import { CoverPicker, GalleryMedia } from './PublishMedia';

const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : 'Request failed'; };
const FLAGS = [['show_winners', 'Winners tab'], ['show_leaderboard', 'Past Leaderboards tab'], ['show_gallery', 'Draw Gallery tab']];

function ContestPublish({ c, run }) {
  const pub = c.publication;
  const save = (patch) => run(() => paidWinnersAPI.setPublication(c.contest_id, { show_winners: pub.show_winners, show_leaderboard: pub.show_leaderboard, show_gallery: pub.show_gallery, display_order: pub.display_order, ...patch }), 'Publication settings saved.');
  const flags = FLAGS.filter(([k]) => k === 'show_winners' || (k === 'show_leaderboard' ? c.kind === 'leaderboard' : c.kind === 'draw'));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid={`publish-card-${c.contest_id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${c.kind === 'draw' ? 'bg-fuchsia-400/15 text-fuchsia-200' : 'bg-sky-400/15 text-sky-200'}`}>{c.kind === 'draw' ? 'Draw contest' : 'Skill leaderboard'}</span>
          <h3 className="mt-1 text-lg font-black">{c.title}</h3>
          <p className="text-xs text-white/50">{c.winner_counts.official} of {c.winner_counts.total} winners official and visible · ended {c.end_date ? new Date(c.end_date).toLocaleDateString('en-GB') : '—'}</p>
        </div>
        <label className="text-[11px] text-white/60">Order<input type="number" min="0" defaultValue={pub.display_order} onBlur={(e) => Number(e.target.value) !== pub.display_order && save({ display_order: Number(e.target.value) || 0 })} className="ml-2 h-8 w-16 rounded-lg border border-white/15 bg-[#0b0724] px-2 text-xs text-white" data-testid={`publish-order-${c.contest_id}`} /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {flags.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm font-bold"><Switch checked={pub[k]} onCheckedChange={(v) => save({ [k]: v })} data-testid={`publish-${k}-${c.contest_id}`} />{label}</label>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[auto_1fr]">
        <CoverPicker c={c} run={run} />
        {c.kind === 'draw' && <GalleryMedia c={c} run={run} />}
      </div>
    </div>
  );
}

export default function PaidWinnersPublishing() {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(['', '']);
  const [progress, setProgress] = useState(0);
  const load = useCallback(() => paidWinnersAPI.contests().then((r) => setRows(r.contests)).catch((e) => setMsg([errText(e), ''])), []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn, ok) => {
    setMsg(['', '']); setProgress(0);
    try { await fn(setProgress); setMsg(['', ok]); await load(); } catch (e) { setMsg([errText(e), '']); } finally { setProgress(0); }
  };
  return (
    <div className="mt-6 space-y-4" data-testid="paid-winners-publishing">
      <p className="flex items-center gap-2 text-sm text-indigo-200/70"><Globe2 className="h-4 w-4 text-amber-300" />Completed Paid World contests stay hidden on the public Winners page until you switch a tab on. Only approved winners are ever shown, with first name and last initial only.</p>
      {progress > 0 && <div className="h-1.5 overflow-hidden rounded-full bg-white/10" data-testid="publish-upload-progress"><div className="h-full bg-amber-400 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      {msg[0] && <div role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" data-testid="publish-error">{msg[0]}</div>}
      {msg[1] && <div role="status" className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-200" data-testid="publish-notice">{msg[1]}</div>}
      {rows?.map((c) => <ContestPublish key={c.contest_id} c={c} run={run} />)}
      {rows && !rows.length && <p className="py-14 text-center text-sm text-indigo-200/60" data-testid="publish-empty">No completed Paid World contests yet.</p>}
    </div>
  );
}
