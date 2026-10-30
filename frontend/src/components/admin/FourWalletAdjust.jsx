import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../ui/sonner';

const WALLETS = [['winnings', 'Winnings Tokens'], ['bonus', 'Bonus Tokens'], ['winning_bonus', 'Winning Bonus Tokens'], ['topup', 'Top-Up Tokens']];
const fmt = (v) => Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const newOp = () => globalThis.crypto?.randomUUID?.() || `adj-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

// Super Admin / Admin: credit (+) or debit (−) exactly one of the four token wallets. Applied instantly and audited.
export function FourWalletAdjust({ userId, disabled, onDone }) {
  const [data, setData] = useState(null);
  const [wallet, setWallet] = useState('winnings');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [op, setOp] = useState(newOp);
  const load = useCallback(() => api.get(`/admin/users/${encodeURIComponent(userId)}/wallet-breakdown`).then((r) => setData(r.data)).catch(() => setData(null)), [userId]);
  useEffect(() => { load(); }, [load]);
  const current = Number(data?.wallets?.[wallet] || 0);
  const avail = wallet === 'winnings' ? current - Number(data?.wallets?.winnings_pending || 0) : current;
  const n = Number(amount);
  const valid = Number.isFinite(n) && n !== 0 && reason.trim().length >= 10 && (n > 0 || avail + n >= -1e-9);
  const label = WALLETS.find(([k]) => k === wallet)[1];
  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    if (!window.confirm(`${n > 0 ? 'Credit' : 'Debit'} ${fmt(Math.abs(n))} ${label}?\n${fmt(current)} → ${fmt(current + n)}`)) return;
    setBusy(true);
    try {
      const r = await api.post(`/admin/users/${encodeURIComponent(userId)}/wallet-adjust`, { amount: n, wallet, reason: reason.trim(), operation_id: op });
      toast.success(r.data.idempotent_replay ? 'Adjustment already applied' : `${label} ${n > 0 ? 'credited' : 'debited'}`);
      setAmount(''); setReason(''); setOp(newOp()); load(); onDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Adjustment failed; retrying uses the same operation ID.');
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4" data-testid="four-wallet-adjust">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {WALLETS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setWallet(k)} data-testid={`wallet-pick-${k}`}
            className={`rounded-xl border p-3 text-left transition-colors ${wallet === k ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200' : 'border-slate-200 hover:bg-slate-50'}`}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{l}</div>
            <div className="text-lg font-black text-slate-900" data-testid={`wallet-balance-${k}`}>{data ? fmt(data.wallets[k]) : '…'}</div>
            {k === 'winnings' && Number(data?.wallets?.winnings_pending) > 0 && <div className="text-[10px] text-amber-700">{fmt(data.wallets.winnings_pending)} pending cash-out</div>}
          </button>
        ))}
      </div>
      <form className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end" onSubmit={submit}>
        <div className="space-y-1">
          <Label htmlFor="four-wallet-amount">Amount (use − to debit)</Label>
          <Input id="four-wallet-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 25 or -10" disabled={busy || disabled} data-testid="four-wallet-amount" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="four-wallet-reason">Reason (required, 10+ characters)</Label>
          <Input id="four-wallet-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Explain the correction" disabled={busy || disabled} data-testid="four-wallet-reason" />
        </div>
        <Button type="submit" disabled={busy || disabled || !valid} data-testid="four-wallet-submit">{busy ? 'Applying…' : 'Apply'}</Button>
      </form>
      {amount && Number.isFinite(n) && n !== 0 && <p className={`text-sm font-semibold ${avail + n < -1e-9 ? 'text-rose-700' : 'text-slate-700'}`} data-testid="four-wallet-preview">
        {label}: {fmt(current)} → <b>{fmt(current + n)}</b>{avail + n < -1e-9 ? ` · cannot go below zero (available ${fmt(avail)})` : ''}</p>}
      <div className="max-h-48 overflow-y-auto text-xs" data-testid="four-wallet-history">
        <div className="mb-1 font-bold text-slate-600">Admin adjustment history</div>
        {!data?.adjustments?.length ? <div className="text-slate-400">No admin adjustments yet.</div> : data.adjustments.map((t) => (
          <div key={t.tx_id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1">
            <span className="truncate">{new Date(t.created_at).toLocaleString('en-GB')} · {t.note}</span>
            <span className={`shrink-0 font-bold ${Number(t.amount) > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{Number(t.amount) > 0 ? '+' : ''}{fmt(t.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
