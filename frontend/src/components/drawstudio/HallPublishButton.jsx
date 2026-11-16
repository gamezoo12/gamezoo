import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { drawStudioAPI } from '../../lib/api';

export const HallPublishButton = ({ plan, className, onDone, onError }) => {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(Boolean(plan?.announcement_id && plan?.hall_published));
  if (!plan || (!plan.announcement_id && plan.status !== 'completed')) return null;
  const promotion = plan.contest_kind === 'promotion';
  const published = done || (promotion && Boolean(plan.announcement_id));
  const publish = async () => {
    if (!window.confirm(promotion ? 'Announce the winners of this promotion?' : 'Publish this contest to the Hall of Winners? Winners, leaderboard and gallery will become public.')) return;
    setBusy(true);
    try {
      if (!plan.announcement_id) await drawStudioAPI.announceAll(plan.plan_id);
      if (!promotion) await drawStudioAPI.publishHall(plan.plan_id);
      setDone(true); onDone?.({ promotion });
    }
    catch (e) { onError?.(e?.response?.data?.detail || 'Publish failed'); }
    finally { setBusy(false); }
  };
  return (
    <button type="button" className={className} disabled={busy || published} onClick={publish} data-testid="draw-publish-hall">
      <Trophy className="h-5 w-5" />{published ? (promotion ? 'Winners announced' : 'Published to Hall of Winners') : busy ? 'Publishing…' : 'Publish winners'}
    </button>
  );
};
