import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ImagePlus } from 'lucide-react';
import { cashoutAPI } from '../../lib/api';
import { Button } from '../ui/button';

function ReviewLinks({ config, platform, setPlatform }) {
  const links = [['google', 'Google Review', config.google_review_url], ['trustpilot', 'Trustpilot', config.trustpilot_review_url]].filter(([, , u]) => u);
  return (
    <div className="grid grid-cols-2 gap-2">
      {links.map(([k, label, url]) => (
        <a key={k} href={url} target="_blank" rel="noreferrer" onClick={() => setPlatform(k)} data-testid={`cashout-review-link-${k}`}
          className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold ${platform === k ? 'border-[#6C2BFF] bg-violet-50 text-[#6C2BFF]' : 'border-slate-200 hover:bg-slate-50'}`}>
          {label}<ExternalLink className="h-3.5 w-3.5" />
        </a>
      ))}
    </div>
  );
}

export function CashoutReviewStep({ config, onDone, onSkip, onBack, onSupport }) {
  const [platform, setPlatform] = useState('google');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const canSkip = config.review_mode === 'optional' || config.has_approved_review;
  const submit = async () => {
    setBusy(true); setErr('');
    try { const r = await cashoutAPI.uploadReviewProof(platform, file); onDone(r.review_id); }
    catch (e) { const d = e?.response?.data?.detail; setErr(typeof d === 'string' ? d : 'Could not upload your screenshot'); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4" data-testid="cashout-review-step">
      <div>
        <div className="font-bold text-slate-900">{config.has_approved_review ? 'Thanks for your review!' : 'Leave us a review'}</div>
        <p className="text-xs text-slate-500">{config.has_approved_review ? 'Your review is verified, so you can skip this step. You can still share another one.' : '1. Post an honest review, good or bad. 2. Take a screenshot. 3. Upload it here.'}</p>
      </div>
      <ReviewLinks config={config} platform={platform} setPlatform={setPlatform} />
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 hover:bg-slate-50" data-testid="cashout-review-upload">
        {preview ? <img src={preview} alt="Review screenshot" className="max-h-48 rounded-lg" data-testid="cashout-review-preview" /> : <ImagePlus className="h-8 w-8 text-slate-400" />}
        {file ? 'Tap to change screenshot' : 'Upload your review screenshot'}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="cashout-review-file" />
      </label>
      {err && <p className="text-xs text-rose-600" role="alert" data-testid="cashout-review-error">{err}</p>}
      <div className="flex gap-2">
        <Button variant="outline" className="h-11 rounded-2xl" onClick={onBack}>Back</Button>
        {canSkip && <Button variant="outline" className="flex-1 h-11 rounded-2xl" onClick={onSkip} data-testid="cashout-review-skip">Skip review</Button>}
        <Button className="flex-1 h-11 rounded-2xl bg-[#6C2BFF] text-white font-bold" disabled={!file || busy} onClick={submit} data-testid="cashout-review-submit">{busy ? 'Uploading…' : 'Submit & withdraw'}</Button>
      </div>
      {config.latest_review_status === 'pending' && !config.has_approved_review && <p className="text-[11px] text-amber-700" data-testid="cashout-review-pending-note">Your earlier screenshot is waiting for approval. Once approved, you'll be able to skip this step.</p>}
      {config.review_mode === 'mandatory' && !canSkip && (
        <p className="text-[11px] text-slate-500" data-testid="cashout-review-support-note">Prefer not to leave a review? <button type="button" className="font-semibold text-[#6C2BFF] underline" onClick={onSupport} data-testid="cashout-review-contact-support">Contact Support</button> and we'll let you withdraw without one. Your funds are never held back for not reviewing.</p>
      )}
    </div>
  );
}
