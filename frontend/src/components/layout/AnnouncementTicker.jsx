import { useEffect, useState } from 'react';
import { contestsAPI } from '../../lib/api';

/**
 * Announcement ticker — smooth right-to-left marquee under the nav.
 * Pauses on hover (desktop). Fully responsive.
 *
 * ONE component, ONE set of styles — reused everywhere so every ticker is
 * visually identical. Only the CONTENT differs, controlled by `mode`:
 *   - mode="promo"   (default): the existing promo announcements (Paid World).
 *   - mode="winners" (Free World): the latest FINALIZED Championship winners
 *     from the existing paid-winners endpoint. Uses the winner's CURRENT public
 *     display name (never internal/admin names) and the stored prize amount as
 *     the source of truth. Falls back to the same promo messages when no
 *     Championship is finalized yet.
 */
const PROMO_ITEMS = [
  { icon: '🎉', text: 'Play Skill-Based Games' },
  { icon: '⚡', text: 'Enter Exciting Contests' },
  { icon: '🏆', text: 'Win Amazing Prizes with Prize League' },
  { icon: '✨', text: 'New contests every week — brand-new skill games each drop' },
];

function formatPrize(amount, currency) {
  const symbol = currency === 'GBP' ? '£' : '';
  const value = Number(amount);
  return `${symbol}${value.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export default function AnnouncementTicker({ mode = 'promo' }) {
  const [winners, setWinners] = useState([]);

  useEffect(() => {
    if (mode !== 'winners') return undefined;
    const load = () =>
      contestsAPI.championWinners?.()
        .then((d) => setWinners(Array.isArray(d?.winners) ? d.winners : []))
        .catch(() => setWinners([]));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [mode]);

  const showWinners = mode === 'winners' && winners.length > 0;

  const promoSpans = PROMO_ITEMS.map((it) => (
    <span
      key={it.text}
      className="inline-flex items-center gap-2 text-white/95 font-semibold text-sm md:text-[15px]"
    >
      <span aria-hidden>{it.icon}</span>
      <span>{it.text}</span>
      <span className="text-[#FFD54A] mx-1">•</span>
    </span>
  ));

  const winnerSpans = winners.map((w) => (
    <span
      key={`champ-winner-${w.rank}`}
      className="inline-flex items-center gap-2 text-white/95 font-semibold text-sm md:text-[15px]"
      data-testid={`champ-winner-${w.rank}`}
    >
      <span aria-hidden>🏆</span>
      <span>{w.user_name} won {formatPrize(w.prize_amount, w.currency)}</span>
      <span className="text-[#FFD54A] mx-1">•</span>
    </span>
  ));

  const chunk = (
    <div className="flex items-center gap-12 shrink-0 whitespace-nowrap">
      {showWinners ? winnerSpans : promoSpans}
    </div>
  );

  return (
    <div
      className="pl-marquee relative z-30 block w-full shrink-0 overflow-hidden border-y border-white/10"
      style={{ background: 'linear-gradient(90deg, #6C2BFF 0%, #8B5CFF 50%, #6C2BFF 100%)' }}
      data-testid="announcement-ticker"
      aria-label={showWinners ? 'Championship winners' : 'Announcements'}
    >
      <div className="pl-marquee-track py-2.5">
        {chunk}
        {chunk}
      </div>
    </div>
  );
}
