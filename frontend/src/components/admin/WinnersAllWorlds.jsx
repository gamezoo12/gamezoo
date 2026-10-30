import { useCallback, useEffect, useState } from 'react';
import { History, Pencil, Wallet } from 'lucide-react';
import { adminWinnersAllAPI } from '../../lib/api';
import { EditDialog } from '../../pages/production/WinnersApprovals';
import { WALLETS, WinnerWalletDialog } from './WinnerWalletDialog';

const TABS = [['free', 'Free World'], ['paid', 'Paid World'], ['promotions', 'Promotions'], ['challenges', 'Impossible Challenges']];
const BADGE = { credited: 'bg-emerald-100 text-emerald-700', pending: 'bg-amber-100 text-amber-700', approved: 'bg-sky-100 text-sky-700' };

function Row({ r, onAdjust, onEdit, onHistory }) {
  return (
    <tr className="border-t border-slate-100 text-sm" data-testid={`wa-row-${r.record_id}`}>
      <td className="p-3"><div className="font-semibold text-slate-900">{r.username ? `@${r.username}` : '—'}</div><div className="text-xs text-slate-500">{r.full_name || r.email || r.user_id}</div></td>
      <td className="p-3 text-slate-700">{r.contest}</td>
      <td className="p-3 text-slate-700">{r.rank ? `#${r.rank} place` : ''}{r.rank && r.ticket_number ? ' · ' : ''}{r.ticket_number ? `Ticket ${r.ticket_number}` : ''}{!r.rank && !r.ticket_number && '—'}</td>
      <td className="p-3 font-bold" data-testid={`wa-prize-${r.record_id}`}>{r.prize_amount.toFixed(2)}</td>
      <td className="p-3 text-xs">{WALLETS[r.wallet_type] || r.wallet_type}</td>
      <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${BADGE[r.credit_status] || 'bg-slate-100 text-slate-600'}`} data-testid={`wa-status-${r.record_id}`}>{r.credit_status.replace('_', ' ')}</span></td>
      <td className="p-3"><div className="flex justify-end gap-1">
        {r.pending_editable && <button type="button" onClick={() => onEdit(r)} className="rounded-full bg-slate-100 p-2 hover:bg-slate-200" aria-label="Edit pending reward" data-testid={`wa-edit-${r.record_id}`}><Pencil className="h-3.5 w-3.5" /></button>}
        {r.adjustments.length > 0 && <button type="button" onClick={() => onHistory(r)} className="rounded-full bg-slate-100 p-2 hover:bg-slate-200" aria-label="Adjustment history" data-testid={`wa-history-${r.record_id}`}><History className="h-3.5 w-3.5" /></button>}
        <button type="button" onClick={() => onAdjust(r)} className="inline-flex items-center gap-1 rounded-full bg-[#6C2BFF] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4A15D9]" data-testid={`wa-adjust-${r.record_id}`}><Wallet className="h-3.5 w-3.5" />Credit / Debit</button>
      </div></td>
    </tr>
  );
}

function HistoryList({ r, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} data-testid="wa-history-panel">
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">Wallet adjustments · {r.full_name || r.username}</h3>
        {r.adjustments.map((a) => <div key={a.tx_id} className="mt-2 rounded-lg bg-slate-50 p-2 text-xs"><b className={a.action === 'debit' ? 'text-rose-600' : 'text-emerald-700'}>{a.action} {a.amount.toFixed(2)} {WALLETS[a.wallet]}</b> · {new Date(a.at).toLocaleString('en-GB')} · {a.admin_email}<br /><i>“{a.reason}”</i></div>)}
        <button type="button" onClick={onClose} className="mt-4 text-sm font-semibold text-slate-600">Close</button>
      </div>
    </div>
  );
}

export function WinnersAllWorlds() {
  const [world, setWorld] = useState('paid');
  const [rows, setRows] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [msg, setMsg] = useState(['', '']);
  const load = useCallback(() => { setRows(null); adminWinnersAllAPI.list(world).then((d) => setRows(d.winners)).catch((e) => { setRows([]); setMsg([e?.response?.data?.detail || 'Could not load winners', '']); }); }, [world]);
  useEffect(() => { load(); }, [load]);
  const done = (text) => { setDlg(null); setMsg(['', text]); load(); };
  return (
    <section className="rounded-2xl border border-slate-100 bg-white" data-testid="winners-all-worlds">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <h2 className="font-display text-2xl font-extrabold">Winners Management</h2>
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-50 p-1">{TABS.map(([k, l]) => <button key={k} type="button" onClick={() => setWorld(k)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${world === k ? 'bg-[#6C2BFF] text-white' : 'text-slate-600 hover:bg-white'}`} data-testid={`wa-tab-${k}`}>{l}</button>)}</div>
      </div>
      {msg[0] && <p className="m-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert" data-testid="wa-error">{msg[0]}</p>}
      {msg[1] && <p className="m-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700" role="status" data-testid="wa-notice">{msg[1]}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{['Winner', 'Contest', 'Rank / Ticket', 'Prize', 'Wallet', 'Status', ''].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>{rows?.map((r) => <Row key={r.record_id} r={r} onAdjust={(x) => setDlg({ kind: 'adjust', r: x })} onEdit={(x) => setDlg({ kind: 'edit', r: x })} onHistory={(x) => setDlg({ kind: 'history', r: x })} />)}</tbody>
        </table>
        {rows && !rows.length && <p className="py-12 text-center text-sm text-slate-500" data-testid="wa-empty">No winners in this world yet.</p>}
        {!rows && <p className="py-12 text-center text-sm text-slate-400">Loading…</p>}
      </div>
      {dlg?.kind === 'adjust' && <WinnerWalletDialog row={dlg.r} onClose={() => setDlg(null)} onDone={done} />}
      {dlg?.kind === 'edit' && <EditDialog winner={{ winner_id: dlg.r.winner_id, ticket_number: dlg.r.ticket_number, prize_amount: dlg.r.prize_amount, reward_type: dlg.r.wallet_type }} onClose={() => setDlg(null)} onSaved={() => done('Pending reward updated and recorded in the audit trail.')} />}
      {dlg?.kind === 'history' && <HistoryList r={dlg.r} onClose={() => setDlg(null)} />}
    </section>
  );
}
