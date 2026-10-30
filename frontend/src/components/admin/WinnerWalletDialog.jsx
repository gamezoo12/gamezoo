import { useState } from 'react';
import { adminWinnersAllAPI } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

export const WALLETS = { winnings: 'Winnings Tokens', bonus: 'Bonus Tokens', winning_bonus: 'Winning Bonus Tokens', topup: 'Top-Up Tokens' };
const field = 'mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm';
const newOp = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function WinnerWalletDialog({ row, onClose, onDone }) {
  const [form, setForm] = useState({ wallet: row.wallet_type in WALLETS ? row.wallet_type : 'winnings', action: 'credit', amount: '', reason: '' });
  const [opId] = useState(newOp);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amt = Number(form.amount);
  const valid = amt > 0 && form.reason.trim().length >= 5 && confirmed;
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await adminWinnersAllAPI.adjust({ world: row.world, record_id: row.record_id, ...form, amount: amt, operation_id: opId });
      onDone(`${form.action === 'credit' ? 'Credited' : 'Debited'} ${amt.toFixed(2)} ${r.wallet_label} ${form.action === 'credit' ? 'to' : 'from'} ${row.full_name || row.username || row.user_id}.`);
    } catch (e) { const d = e?.response?.data?.detail; setErr(typeof d === 'string' ? d : 'Adjustment failed'); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="winner-wallet-dialog">
        <DialogHeader><DialogTitle>Adjust wallet · {row.full_name || row.username || row.user_id}</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500">{row.contest}. This posts a new wallet transaction; the winner record, ranking and past transactions are not changed.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-600">Action<select className={field} value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} data-testid="winner-wallet-action"><option value="credit">Credit</option><option value="debit">Debit</option></select></label>
          <label className="text-xs font-semibold text-slate-600">Wallet<select className={field} value={form.wallet} onChange={(e) => setForm({ ...form, wallet: e.target.value })} data-testid="winner-wallet-type">{Object.entries(WALLETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <label className="text-xs font-semibold text-slate-600">Amount (tokens)<input type="number" min="0.01" step="0.01" className={field} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="winner-wallet-amount" /></label>
        <label className="text-xs font-semibold text-slate-600">Reason (required)<textarea className={`${field} h-20 py-2`} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="winner-wallet-reason" /></label>
        <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="winner-wallet-confirm" />I confirm I want to {form.action} {amt > 0 ? amt.toFixed(2) : '—'} {WALLETS[form.wallet]}.</label>
        {err && <p className="text-sm text-rose-600" role="alert" data-testid="winner-wallet-error">{err}</p>}
        <Button disabled={!valid || busy} onClick={save} className={form.action === 'debit' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#6C2BFF] hover:bg-[#4A15D9]'} data-testid="winner-wallet-submit">{busy ? 'Saving…' : `${form.action === 'credit' ? 'Credit' : 'Debit'} wallet`}</Button>
      </DialogContent>
    </Dialog>
  );
}
