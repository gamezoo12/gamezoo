import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, contestsAPI } from '../../lib/api';

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
  const [managed, setManaged] = useState([]);
  const [contestNumber, setContestNumber] = useState(null);
  const [fallbacks, setFallbacks] = useState(null);
  const [tickerOverrides, setTickerOverrides] = useState({});
  const [feedLoaded, setFeedLoaded] = useState(false);

  // Super Admin-managed announcements; the server already filters by status/schedule/expiry.
  useEffect(() => {
    const load = () => api.get('/announcements')
      .then((r) => {
        setManaged(Array.isArray(r.data?.announcements) ? r.data.announcements : []);
        setFallbacks(Array.isArray(r.data?.fallbacks) ? r.data.fallbacks : null);
        setTickerOverrides(r.data?.ticker_overrides || {});
        setFeedLoaded(true);
      })
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (mode !== 'winners') return undefined;
    const load = () =>
      contestsAPI.championWinners?.()
        .then((d) => { setWinners(Array.isArray(d?.winners) ? d.winners : []); setContestNumber(d?.contest_number ?? null); })
        .catch(() => setWinners([]));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [mode]);

  const visibleWinners = winners.filter((winner) => {
    const id = winner.manual && winner.winner_id ? `manual-winner:${winner.winner_id}` : `champion-winner:${contestNumber}:${winner.rank}`;
    const override = tickerOverrides[id] || {};
    return !override.deleted && override.enabled !== false && override.published !== false;
  });
  const showWinners = feedLoaded && mode === 'winners' && visibleWinners.length > 0;

  const itemClass = 'inline-flex items-center gap-2 text-white/95 font-semibold text-sm md:text-[15px]';
  const managedSpans = managed.map((a) => {
    const body = <><span aria-hidden>{a.icon || '📢'}</span><span>{a.text}</span></>;
    const internal = a.link && a.link.startsWith('/');
    return (
      <span key={`ann-${a.id}`} className={itemClass} data-testid={`ticker-announcement-${a.id}`}>
        {!a.link ? body : internal
          ? <Link to={a.link} className="inline-flex items-center gap-2 underline-offset-2 hover:underline">{body}</Link>
          : <a href={a.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 underline-offset-2 hover:underline">{body}</a>}
        <span className="text-[#FFD54A] mx-1">•</span>
      </span>
    );
  });

  const promoSpans = (fallbacks ?? PROMO_ITEMS).map((it) => (
    <span
      key={it.text}
      className="inline-flex items-center gap-2 text-white/95 font-semibold text-sm md:text-[15px]"
    >
      <span aria-hidden>{it.icon}</span>
      <span>{it.text}</span>
      <span className="text-[#FFD54A] mx-1">•</span>
    </span>
  ));

  const winnerSpans = visibleWinners.map((w) => {
    const id = w.manual && w.winner_id ? `manual-winner:${w.winner_id}` : `champion-winner:${contestNumber}:${w.rank}`;
    const text = (tickerOverrides[id]?.text || '{winner} won {prize}').replaceAll('{winner}', w.user_name).replaceAll('{prize}', formatPrize(w.prize_amount, w.currency));
    return (
    <span
      key={id}
      className="inline-flex items-center gap-2 text-white/95 font-semibold text-sm md:text-[15px]"
      data-testid={`champ-winner-${w.rank}`}
    >
      <span aria-hidden>🏆</span>
      <span>{text}</span>
      <span className="text-[#FFD54A] mx-1">•</span>
    </span>
    );
  });

  const chunk = (
    <div className="flex items-center gap-12 shrink-0 whitespace-nowrap">
      {feedLoaded && managedSpans}
      {feedLoaded && (showWinners ? winnerSpans : (managedSpans.length ? null : promoSpans))}
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
