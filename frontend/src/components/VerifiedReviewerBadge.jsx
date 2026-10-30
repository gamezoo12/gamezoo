import { BadgeCheck } from 'lucide-react';

export function VerifiedReviewerBadge({ show, testid }) {
  if (!show) return null;
  return (
    <span title="Verified Reviewer" aria-label="Verified Reviewer" data-testid={testid}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-sky-700">
      <BadgeCheck className="h-3 w-3" />Verified Reviewer
    </span>
  );
}
