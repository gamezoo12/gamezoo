import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { cashoutAPI } from '../../lib/api';
import { useBlobUrl } from '../production/useBlobUrl';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const MODES = [
  ['mandatory', 'Mandatory Review', 'Players upload a Google/Trustpilot review screenshot before withdrawing. Once you approve one, they get Skip next time. Support can grant a one-time bypass.'],
  ['optional', 'Optional Review', 'Players are asked for a review screenshot but can Skip.'],
  ['disabled', 'Review Disabled', 'Players withdraw normally with no review request.'],
];
const BADGE = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700' };

function Proof({ r, onDecide, onOpen }) {
  const url = useBlobUrl(() => cashoutAPI.adminReviewImage(r.review_id), r.review_id);
  return (
    <li className="flex items-center gap-3 py-2 text-sm" data-testid={`cashout-proof-${r.review_id}`}>
      <button type="button" onClick={() => url && onOpen(url)} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100" aria-label="View screenshot" data-testid={`cashout-proof-open-${r.review_id}`}>{url && <img src={url} alt="" className="h-full w-full object-cover" />}</button>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{r.name || r.email} <span className="text-xs font-normal capitalize text-slate-500">· {r.platform}</span></div>
        <div className="text-xs text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleString('en-GB') : ''}{r.withdrawal_id ? ` · ${r.withdrawal_id}` : ''}{r.bonus_tokens ? ` · ${r.bonus_tokens} Bonus Tokens sent` : ''}</div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${BADGE[r.status] || 'bg-slate-100'}`} data-testid={`cashout-proof-status-${r.review_id}`}>{r.status}</span>
      {r.status !== 'approved' && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onDecide(r, 'approved')} data-testid={`cashout-proof-approve-${r.review_id}`}><Check className="h-3.5 w-3.5" /></Button>}
      {r.status !== 'rejected' && <Button size="sm" variant="outline" className="text-rose-600" onClick={() => onDecide(r, 'rejected')} data-testid={`cashout-proof-reject-${r.review_id}`}><X className="h-3.5 w-3.5" /></Button>}
    </li>
  );
}

export function CashoutReviewSettings({ config, onSaved, toast }) {
  const [reviews, setReviews] = useState([]);
  const [bypass, setBypass] = useState({ email: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState('');
  const load = useCallback(() => cashoutAPI.adminReviews().then((d) => setReviews(d.items || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const setMode = async (mode) => {
    setBusy(true);
    try { onSaved(await cashoutAPI.adminUpdateConfig({ review_mode: mode })); toast({ title: 'Review setting saved' }); }
    catch (e) { toast({ title: 'Save failed', variant: 'destructive' }); } finally { setBusy(false); }
  };
  const decide = async (r, decision) => {
    try { const res = await cashoutAPI.adminReviewDecision(r.review_id, decision); toast({ title: decision === 'approved' ? `Review approved${res.bonus_tokens ? ` · ${res.bonus_tokens} Bonus Tokens sent` : ''}` : 'Review rejected' }); load(); }
    catch (e) { toast({ title: 'Update failed', variant: 'destructive' }); }
  };
  const [bonusAmt, setBonusAmt] = useState(String(config?.review_bonus_tokens ?? 5));
  const saveBonus = async (patch) => {
    setBusy(true);
    try { onSaved(await cashoutAPI.adminUpdateConfig(patch)); toast({ title: 'Thank-you bonus saved' }); }
    catch (e) { toast({ title: 'Enter an amount between 0.01 and 1000', variant: 'destructive' }); } finally { setBusy(false); }
  };
  const grant = async () => {
    setBusy(true);
    try { await cashoutAPI.adminGrantBypass(bypass); setBypass({ email: '', reason: '' }); toast({ title: 'Bypass granted for their next withdrawal' }); }
    catch (e) { const d = e?.response?.data?.detail; toast({ title: typeof d === 'string' ? d : 'Enter a valid email and a reason (5+ characters)', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4" data-testid="cashout-review-settings">
      <div><div className="font-bold text-slate-900">Withdrawal review</div><div className="text-xs text-slate-500">Uses the Google and Trustpilot links above. Changes apply instantly. Reviews are never a condition for being paid what you owe.</div></div>
      <div className="grid gap-2 md:grid-cols-3">
        {MODES.map(([k, label, desc]) => (
          <button key={k} type="button" disabled={busy} onClick={() => setMode(k)} data-testid={`cashout-review-mode-${k}`}
            className={`rounded-xl border p-3 text-left transition-colors ${config?.review_mode === k ? 'border-[#6C2BFF] bg-violet-50 ring-2 ring-[#6C2BFF]/30' : 'border-slate-200 hover:bg-slate-50'}`}>
            <div className="text-sm font-bold text-slate-900">{label}</div><div className="mt-1 text-[11px] text-slate-500">{desc}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3" data-testid="review-bonus-settings">
        <div className="min-w-[220px] flex-1"><div className="text-xs font-semibold text-slate-800">Review thank-you bonus</div><div className="text-[11px] text-slate-500">Bonus Tokens sent automatically when you approve a player's first review screenshot. Once per player.</div></div>
        <Input type="number" min="0.01" max="1000" step="0.01" className="w-24" value={bonusAmt} onChange={(e) => setBonusAmt(e.target.value)} data-testid="review-bonus-amount" />
        <Button variant="outline" disabled={busy} onClick={() => saveBonus({ review_bonus_tokens: Number(bonusAmt) })} data-testid="review-bonus-save">Save amount</Button>
        <Button disabled={busy} onClick={() => saveBonus({ review_bonus_enabled: !config?.review_bonus_enabled })} className={config?.review_bonus_enabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-400 hover:bg-slate-500'} data-testid="review-bonus-toggle">{config?.review_bonus_enabled ? 'On' : 'Off'}</Button>
      </div>
      <div className="rounded-xl bg-slate-50 p-3 space-y-2">
        <div className="text-xs font-semibold text-slate-700">Support bypass (one-time, for Mandatory mode)</div>
        <div className="flex flex-wrap gap-2">
          <Input className="w-64" placeholder="Player email" value={bypass.email} onChange={(e) => setBypass({ ...bypass, email: e.target.value })} data-testid="cashout-bypass-email" />
          <Input className="flex-1 min-w-[200px]" placeholder="Reason (e.g. support ticket number)" value={bypass.reason} onChange={(e) => setBypass({ ...bypass, reason: e.target.value })} data-testid="cashout-bypass-reason" />
          <Button variant="outline" disabled={busy || !bypass.email} onClick={grant} data-testid="cashout-bypass-grant">Grant bypass</Button>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-700 mb-1">Review screenshots ({reviews.length})</div>
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto" data-testid="cashout-reviews-list">
          {reviews.map((r) => <Proof key={r.review_id} r={r} onDecide={decide} onOpen={setBig} />)}
          {!reviews.length && <li className="py-3 text-xs text-slate-400">No review screenshots yet.</li>}
        </ul>
      </div>
      {big && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setBig('')} data-testid="cashout-proof-viewer"><img src={big} alt="Review screenshot" className="max-h-[90vh] max-w-full rounded-xl" /></div>}
    </div>
  );
}
