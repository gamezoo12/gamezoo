import { useState } from 'react';
import { Star } from 'lucide-react';
import { cashoutAPI } from '../../lib/api';
import { Button } from '../ui/button';

export function CashoutReviewStep({ mode, onDone, onSkip, onBack, onSupport }) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try { const r = await cashoutAPI.submitReview({ rating, feedback }); onDone(r.review_id); }
    catch (e) { setErr(e?.response?.data?.detail?.[0]?.msg || 'Could not save your review'); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4" data-testid="cashout-review-step">
      <div>
        <div className="font-bold text-slate-900">How has Prize League been for you?</div>
        <p className="text-xs text-slate-500">Honest feedback, good or bad, is welcome and doesn't affect your withdrawal.</p>
      </div>
      <div className="flex gap-1" role="radiogroup" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(n)} className="p-1 transition-transform hover:scale-110" data-testid={`cashout-review-star-${n}`}>
            <Star className={`h-8 w-8 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
          </button>
        ))}
      </div>
      <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={2000} rows={4} placeholder="Tell us what you liked or what we could do better (optional)"
        className="w-full rounded-xl border border-slate-200 p-3 text-sm" data-testid="cashout-review-feedback" />
      {err && <p className="text-xs text-rose-600" role="alert">{err}</p>}
      <div className="flex gap-2">
        <Button variant="outline" className="h-11 rounded-2xl" onClick={onBack}>Back</Button>
        {mode === 'optional' && <Button variant="outline" className="flex-1 h-11 rounded-2xl" onClick={onSkip} data-testid="cashout-review-skip">Skip</Button>}
        <Button className="flex-1 h-11 rounded-2xl bg-[#6C2BFF] text-white font-bold" disabled={!rating || busy} onClick={submit} data-testid="cashout-review-submit">{busy ? 'Saving…' : 'Submit'}</Button>
      </div>
      {mode === 'mandatory' && (
        <p className="text-[11px] text-slate-500" data-testid="cashout-review-support-note">Prefer not to leave a review? <button type="button" className="font-semibold text-[#6C2BFF] underline" onClick={onSupport} data-testid="cashout-review-contact-support">Contact Support</button> and we'll let you withdraw without one. Your funds are never held back for not reviewing.</p>
      )}
    </div>
  );
}
