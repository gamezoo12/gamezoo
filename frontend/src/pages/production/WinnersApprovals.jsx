import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, History, Pencil, Trophy } from 'lucide-react';
import { adminAPI, drawStudioAPI } from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : 'Request failed'; };
const money = (v) => `£${Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TYPE = { winnings: 'Winnings Tokens', bonus: 'Bonus Tokens' };
const BADGE = { pending: 'bg-amber-400/15 text-amber-200', approved: 'bg-sky-400/15 text-sky-200', credited: 'bg-emerald-400/15 text-emerald-200' };
const field = 'mt-1 h-10 w-full rounded-lg border border-white/15 bg-[#0b0724] px-3 text-sm text-white';

function EditDialog({ winner, onClose, onSaved }) {
  const [form, setForm] = useState({ prize_amount: winner.prize_amount, reward_type: winner.reward_type, reason: '' });
  const [err, setErr] = useState('');
  const save = async () => {
    try { await drawStudioAPI.editWinner(winner.winner_id, { ...form, prize_amount: Number(form.prize_amount) }); onSaved(); } catch (e) { setErr(errText(e)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-white/10 bg-[#120c33] text-white" data-testid="winner-edit-dialog">
        <DialogHeader><DialogTitle>Edit proposed reward · ticket #{winner.ticket_number}</DialogTitle></DialogHeader>
        <p className="text-xs text-indigo-200/70">The winning ticket and winner are fixed by the draw and can't be changed. Changes are checked against the approved prize budget.</p>
        <label className="text-xs text-indigo-200/80">Reward amount (£ / tokens)<input type="number" min="0.01" step="0.01" className={field} value={form.prize_amount} onChange={(e) => setForm({ ...form, prize_amount: e.target.value })} data-testid="winner-edit-amount" /></label>
        <label className="text-xs text-indigo-200/80">Reward type<select className={field} value={form.reward_type} onChange={(e) => setForm({ ...form, reward_type: e.target.value })} data-testid="winner-edit-type"><option value="winnings">Winnings Tokens</option><option value="bonus">Bonus Tokens</option></select></label>
        <label className="text-xs text-indigo-200/80">Reason (required)<textarea className={`${field} h-20 py-2`} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="winner-edit-reason" /></label>
        {err && <p className="text-sm text-rose-300" role="alert" data-testid="winner-edit-error">{err}</p>}
        <button type="button" disabled={form.reason.trim().length < 5} onClick={save} className="h-10 rounded-xl bg-amber-400 text-sm font-black text-[#1a1033] disabled:opacity-40" data-testid="winner-edit-save">Save change</button>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ winner, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { drawStudioAPI.winnerAudit(winner.winner_id).then((r) => setRows(r.audit)).catch(() => setRows([])); }, [winner.winner_id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto border-white/10 bg-[#120c33] text-white" data-testid="winner-history-dialog">
        <DialogHeader><DialogTitle>Audit trail · ticket #{winner.ticket_number}</DialogTitle></DialogHeader>
        {(winner.edit_history || []).map((h, i) => <div key={i} className="rounded-lg bg-white/5 p-2 text-xs"><b>{new Date(h.at).toLocaleString('en-GB')}</b> · {h.by}<br />{money(h.from.prize_amount)} {TYPE[h.from.reward_type]} → {money(h.to.prize_amount)} {TYPE[h.to.reward_type]}<br /><i>“{h.reason}”</i></div>)}
        {rows?.map((r) => <div key={r.audit_id} className="text-xs text-indigo-100">{new Date(r.at).toLocaleString('en-GB')} · <b>{r.action.replace('_', ' ')}</b> · {r.actor_email}</div>)}
        {rows && !rows.length && !(winner.edit_history || []).length && <p className="text-xs text-indigo-200/60">No changes recorded yet.</p>}
      </DialogContent>
    </Dialog>
  );
}

function WinnerRow({ w, onEdit, onHistory, onApprove, busy }) {
  const studio = w.source === 'draw_studio';
  return (
    <tr className="border-t border-white/5 text-sm" data-testid={`winner-row-${w.winner_id}`}>
      <td className="px-3 py-3"><div className="font-bold text-white">{w.contest_title || w.contest_id}</div><div className="text-[11px] text-indigo-200/60">{studio ? `Round ${Number(w.draw_round_index) + 1} · ${w.draw_round_name}` : w.prize_title}</div></td>
      <td className="px-3 py-3 font-black text-amber-300">#{w.ticket_number}</td>
      <td className="px-3 py-3"><div className="text-white">{w.user_full_name || w.user_name}</div><div className="text-[11px] text-indigo-200/60">@{w.username || '—'} · {w.user_id}</div></td>
      <td className="px-3 py-3 font-bold text-white" data-testid={`winner-amount-${w.winner_id}`}>{money(w.prize_amount)}</td>
      <td className="px-3 py-3 text-indigo-100" data-testid={`winner-type-${w.winner_id}`}>{TYPE[w.reward_type] || w.reward_type}</td>
      <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black capitalize ${BADGE[w.status]}`} data-testid={`winner-status-${w.winner_id}`}>{w.status}</span></td>
      <td className="px-3 py-3"><div className="flex justify-end gap-1">
        {studio && w.status === 'pending' && <button type="button" onClick={() => onEdit(w)} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Edit reward" data-testid={`winner-edit-${w.winner_id}`}><Pencil className="h-4 w-4" /></button>}
        {studio && <button type="button" onClick={() => onHistory(w)} className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Audit trail" data-testid={`winner-history-${w.winner_id}`}><History className="h-4 w-4" /></button>}
        {w.status !== 'credited' && <button type="button" disabled={busy} onClick={() => onApprove(w)} className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-[#04210f] disabled:opacity-40" data-testid={`winner-approve-${w.winner_id}`}><CheckCircle2 className="h-3.5 w-3.5" />{w.status === 'approved' ? 'Finish credit' : 'Approve & credit'}</button>}
      </div></td>
    </tr>
  );
}

export default function WinnersApprovals() {
  const [tab, setTab] = useState('pending');
  const [data, setData] = useState({ winners: [], counts: {} });
  const [edit, setEdit] = useState(null);
  const [hist, setHist] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(['', '']);
  const load = useCallback(() => drawStudioAPI.winners({ status: tab }).then(setData).catch((e) => setMsg([errText(e), ''])), [tab]);
  useEffect(() => { load(); }, [load]);

  const approve = async (w) => {
    if (!window.confirm(`Approve and credit ${money(w.prize_amount)} as ${TYPE[w.reward_type]} to ${w.user_full_name || w.user_name}? This is credited once and cannot be undone here.`)) return;
    setBusy(true); setMsg(['', '']);
    try {
      if (w.source === 'draw_studio') await drawStudioAPI.approveWinner(w.winner_id); else await adminAPI.markPaid(w.winner_id);
      setMsg(['', `Credited ${money(w.prize_amount)} ${TYPE[w.reward_type]} to ${w.user_full_name || w.user_name}.`]);
      await load();
    } catch (e) { setMsg([errText(e), '']); } finally { setBusy(false); }
  };

  return (
    <div className="-m-4 min-h-screen bg-[#07041a] p-4 pb-32 text-white sm:-m-6 sm:p-8 sm:pb-32" data-testid="winners-approvals-page">
      <h1 className="flex items-center gap-3 text-4xl font-black tracking-tight"><Trophy className="h-9 w-9 text-amber-300" />Winners &amp; Approvals</h1>
      <p className="mt-2 max-w-2xl text-sm text-indigo-200/70">Official draw winners wait here as pending rewards. Check them, adjust the amount or type with a reason if needed, then approve to credit the wallet exactly once.</p>
      <div className="mt-6 flex flex-wrap gap-2" role="tablist">
        {['pending', 'approved', 'credited', 'all'].map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-black capitalize transition-colors ${tab === k ? 'bg-amber-400 text-[#1a1033]' : 'bg-white/5 text-white/70 hover:bg-white/10'}`} data-testid={`winners-tab-${k}`}>{k}{k !== 'all' && ` (${data.counts[k] || 0})`}</button>)}
      </div>
      {msg[0] && <div role="alert" className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" data-testid="winners-error">{msg[0]}</div>}
      {msg[1] && <div role="status" className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-200" data-testid="winners-notice">{msg[1]}</div>}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full min-w-[960px] text-left">
          <thead className="text-[10px] font-black uppercase tracking-wider text-indigo-200/60"><tr>{['Contest & round', 'Ticket', 'Winner', 'Amount', 'Reward type', 'Status', ''].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
          <tbody>{data.winners.map((w) => <WinnerRow key={w.winner_id} w={w} busy={busy} onEdit={setEdit} onHistory={setHist} onApprove={approve} />)}</tbody>
        </table>
        {!data.winners.length && <p className="py-14 text-center text-sm text-indigo-200/60" data-testid="winners-empty">No {tab === 'all' ? '' : tab} rewards.</p>}
      </div>
      {edit && <EditDialog winner={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setMsg(['', 'Reward updated. The change and reason were added to the audit trail.']); load(); }} />}
      {hist && <HistoryDialog winner={hist} onClose={() => setHist(null)} />}
    </div>
  );
}
