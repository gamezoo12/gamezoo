import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { drawStudioAPI } from '../../lib/api';

export const HallPublishButton = ({ plan, className, onDone, onError }) => {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(Boolean(plan?.hall_published));
  if (!plan?.announcement_id || plan.contest_kind === 'promotion') return null;
  const publish = async () => {
    if (!window.confirm('Publish this contest to the Hall of Winners? Winners, leaderboard and gallery will become public.')) return;
    setBusy(true);
    try { await drawStudioAPI.publishHall(plan.plan_id); setDone(true); onDone?.(); }
    catch (e) { onError?.(e?.response?.data?.detail || 'Publish failed'); }
    finally { setBusy(false); }
  };
  return (
    <button type="button" className={className} disabled={busy || done} onClick={publish} data-testid="draw-publish-hall">
      <Trophy className="h-5 w-5" />{done ? 'Published to Hall of Winners' : busy ? 'Publishing…' : 'Publish to Hall of Winners'}
    </button>
  );
};
