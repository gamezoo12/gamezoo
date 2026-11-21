import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import TokenIcon from './TokenIcon';
import { countdown, percent, tokenPrice } from '../lib/format';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useJoinedContestIds } from '../lib/joinedContests';
import { resolveMediaUrl, useFallbackImage } from '../lib/media';
import ShareMenu from './ShareMenu';

export default function CompetitionCard({ c }) {
  const [t, setT] = useState(countdown(c.endDate));
  const { user } = useAuth();
  const joined = useJoinedContestIds(user);

  const isComingSoon =
    c?.public_coming_soon === true ||
    c?.comingSoon === true ||
    String(c?.tag || '').trim().toLowerCase() === 'coming soon';

  useEffect(() => {
    if (isComingSoon) {
      return undefined;
    }

    const timer = setInterval(
      () => setT(countdown(c.endDate)),
      1000
    );

    return () => clearInterval(timer);
  }, [c.endDate, isComingSoon]);

  const pct = percent(c.ticketsSold, c.ticketsTotal);
  const ticketsLeft = Math.max(0, Number(c.ticketsTotal || 0) - Number(c.ticketsSold || 0));
  const contestId = c.id || c.contest_id;
  const isJoined = Boolean(user && contestId && joined.has(contestId));
  const ended = c.hasTimeLimit !== false &&
    t.days <= 0 &&
    t.hours <= 0 &&
    t.mins <= 0 &&
    t.secs <= 0;

  const handleClick = () => {
    try {
      const isMobile =
        typeof window !== 'undefined' && window.innerWidth <= 640;

      api
        .post(`/contests/${contestId}/track-view?is_mobile=${isMobile}`)
        .catch(() => {});
    } catch {
      // Non-critical analytics call.
    }
  };
  if (isComingSoon) {
    return (
      <article
        className="relative block rounded-md bg-white shadow-sm"
        data-testid={`competition-coming-soon-${contestId}`}
        aria-disabled="true"
      >
        <div className="relative aspect-[2/1] overflow-hidden rounded-t-md bg-slate-100">
          {c.image ? (
            <img
              src={resolveMediaUrl(c.image)}
              alt={c.title}
              loading="lazy"
              onError={useFallbackImage}
              className="block h-full w-full object-contain object-center"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Image unavailable
              </span>
            </div>
          )}

          <div
            className="absolute right-0 top-0 bg-black px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-white sm:text-xs"
            data-testid={`coming-soon-label-${contestId}`}
          >
            Coming Soon
          </div>
        </div>

        {c.slug && <div className="absolute left-2 top-2"><ShareMenu path={`/competition/${encodeURIComponent(c.slug)}`} title={c.title} imageUrl={resolveMediaUrl(c.image)} label={`Share ${c.title}`} /></div>}

        <div className="px-2 py-2">
          <h3
            className="truncate font-display text-sm font-black text-slate-900"
            data-testid={`coming-soon-title-${contestId}`}
          >
            {c.title}
          </h3>
          <div className="mt-1 text-right text-[10px] font-bold text-slate-500">{Math.max(0, Number(c.ticketsTotal || 0) - Number(c.ticketsSold || 0)).toLocaleString()} tickets left</div>
        </div>
      </article>
    );
  }

  return (
    <article className="relative w-full min-w-0 max-w-full overflow-hidden">
    <Link
      to={`/competition/${c.slug}`}
      onClick={handleClick}
      className="group block w-full min-w-0"
      data-testid={`competition-card-${c.slug}`}
    >
      <div className="overflow-hidden rounded-md bg-[#161433]">
        <div className="relative aspect-[2/1] overflow-hidden bg-transparent">
          <img
            src={resolveMediaUrl(c.image)}
            alt={c.title}
            loading="lazy"
            onError={useFallbackImage}
            className="block h-full w-full object-contain object-center"
          />
        </div>

        <div className="px-2 py-1 text-white">
          <h3 className="truncate font-display text-sm font-extrabold">
            {c.title}
          </h3>

          <div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-nowrap sm:justify-between">
            <div className="inline-flex min-w-0 items-center gap-1 font-extrabold">
              <TokenIcon className="h-5 w-5" />
              <span className="text-base">{tokenPrice(c.price)}</span>
              <span className="min-w-0 text-[8px] font-bold leading-tight text-white/65">1 token = £1.00</span>
            </div>

            <div
              className="col-span-2 grid w-full min-w-0 grid-cols-4 gap-1 sm:col-span-1 sm:w-auto"
              data-testid={`card-timer-${c.slug}`}
            >
              {c.hasTimeLimit === false ? (
                <span className="col-span-4 rounded-md bg-emerald-600 px-2 py-2 text-center text-[10px] font-black text-white">No timer</span>
              ) : (ended || c.status === 'closed') ? (
                <span className="col-span-4 rounded-md bg-rose-500 px-2 py-2 text-center text-xs font-black text-white">Draw coming soon</span>
              ) : [
                ['Days', t.days], ['Hrs', t.hours], ['Mins', t.mins], ['Secs', t.secs],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-md bg-black/80 px-1.5 py-1.5 text-center text-[#FFD54A] sm:min-w-11">
                  <div className="font-display text-xl font-black leading-none">{String(value).padStart(2, '0')}</div>
                  <div className="mt-1 text-[8px] font-bold uppercase leading-none text-white/65">{label}</div>
                </div>
              ))}
            </div>

            <div
              data-testid={`card-join-state-${c.slug}`}
              className={`ml-auto shrink-0 rounded-sm px-2 py-0.5 text-[9px] font-extrabold sm:ml-0 ${
                isJoined
                  ? 'bg-emerald-500 text-white'
                  : 'bg-[#FFD54A] text-slate-900'
              }`}
            >
              {isJoined ? 'Joined' : 'Join'}
            </div>
          </div>

          <div className="mt-0.5">
            <div className="flex items-center justify-between text-[9px] leading-none">
              <span className="font-bold text-white/80">
                {ticketsLeft.toLocaleString()} tickets left
              </span>

              <span
                className="font-extrabold text-[#FFD54A]"
                data-testid={`card-pct-${c.slug}`}
              >
                {pct}%
              </span>
            </div>

            <div
              className="mt-1.5 block h-8 w-full min-w-0 overflow-hidden rounded-none bg-white"
              role="progressbar"
              aria-label={`${c.title} contest progress`}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={pct}
            >
              <div
                className="h-full bg-emerald-500 transition-[width] duration-500"
                style={{
                  width: `${Math.max(0, Math.min(100, pct))}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
    {c.slug && <div className="absolute right-2 top-2"><ShareMenu path={`/competition/${encodeURIComponent(c.slug)}`} title={c.title} imageUrl={resolveMediaUrl(c.image)} label={`Share ${c.title}`} /></div>}
    </article>
  );
}
