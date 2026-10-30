import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { cashoutAPI } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const MODES = [
  ['mandatory', 'Mandatory Review', 'Players leave a review before submitting a withdrawal. Support can grant a one-time bypass.'],
  ['optional', 'Optional Review', 'Players see the review form with a Skip button.'],
  ['disabled', 'Review Disabled', 'Players withdraw normally with no review request.'],
];

export function CashoutReviewSettings({ config, onSaved, toast }) {
  const [reviews, setReviews] = useState([]);
  const [bypass, setBypass] = useState({ email: '', reason: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { cashoutAPI.adminReviews().then((d) => setReviews(d.items || [])).catch(() => {}); }, []);
  const setMode = async (mode) => {
    setBusy(true);
    try { onSaved(await cashoutAPI.adminUpdateConfig({ review_mode: mode })); toast({ title: 'Review setting saved' }); }
    catch (e) { toast({ title: 'Save failed', variant: 'destructive' }); } finally { setBusy(false); }
  };
  const grant = async () => {
    setBusy(true);
    try { await cashoutAPI.adminGrantBypass(bypass); setBypass({ email: '', reason: '' }); toast({ title: 'Bypass granted for their next withdrawal' }); }
    catch (e) { const d = e?.response?.data?.detail; toast({ title: typeof d === 'string' ? d : 'Enter a valid email and a reason (5+ characters)', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4" data-testid="cashout-review-settings">
      <div><div className="font-bold text-slate-900">Withdrawal review</div><div className="text-xs text-slate-500">Changes apply instantly. Reviews are never a condition for being paid what you owe.</div></div>
      <div className="grid gap-2 md:grid-cols-3">
        {MODES.map(([k, label, desc]) => (
          <button key={k} type="button" disabled={busy} onClick={() => setMode(k)} data-testid={`cashout-review-mode-${k}`}
            className={`rounded-xl border p-3 text-left transition-colors ${config?.review_mode === k ? 'border-[#6C2BFF] bg-violet-50 ring-2 ring-[#6C2BFF]/30' : 'border-slate-200 hover:bg-slate-50'}`}>
            <div className="text-sm font-bold text-slate-900">{label}</div><div className="mt-1 text-[11px] text-slate-500">{desc}</div>
          </button>
        ))}
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
        <div className="text-xs font-semibold text-slate-700 mb-2">Latest reviews ({reviews.length})</div>
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto" data-testid="cashout-reviews-list">
          {reviews.map((r) => (
            <li key={r.review_id} className="py-2 text-sm">
              <div className="flex items-center gap-2"><span className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-3.5 w-3.5 ${n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />)}</span><span className="font-semibold">{r.name || r.email}</span><span className="text-xs text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleString('en-GB') : ''}</span></div>
              {r.feedback && <p className="mt-0.5 text-slate-600">{r.feedback}</p>}
            </li>
          ))}
          {!reviews.length && <li className="py-3 text-xs text-slate-400">No reviews yet.</li>}
        </ul>
      </div>
    </div>
  );
}
