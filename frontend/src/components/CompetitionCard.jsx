import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Coins } from 'lucide-react';
import { countdown, percent, tokenCount } from '../lib/format';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useJoinedContestIds } from '../lib/joinedContests';
import { resolveMediaUrl, useFallbackImage } from '../lib/media';

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
  const contestId = c.id || c.contest_id;
  const isJoined = Boolean(user && contestId && joined.has(contestId));
  const ended =
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
        className="group block overflow-hidden rounded-md bg-[#161433] shadow-sm"
        data-testid={`competition-coming-soon-${contestId}`}
      >
        <div className="relative aspect-[2/1] overflow-hidden bg-gradient-to-br from-[#161433] via-[#32116b] to-[#6C2BFF]">

          {c.image ? (
            <img
              src={resolveMediaUrl(c.image)}
              alt={c.title}
              loading="lazy"
              onError={useFallbackImage}
              className="block h-full w-full object-cover object-center"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white/75">
                <div className="text-4xl">🏆</div>

                <div className="mt-2 text-[9px] font-black uppercase tracking-[0.18em]">
                  Image coming soon
                </div>
              </div>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

          <div className="absolute left-3 top-3">
            <span className="inline-flex rounded-full border border-[#FFD54A]/70 bg-black/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#FFD54A]">
              Coming Soon
            </span>
          </div>

          <div className="absolute bottom-3 left-3 right-3">

            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-[#FFD54A]">
              Prize Competition
            </div>

            <h3 className="mt-1 truncate font-display text-sm font-extrabold text-white">
              {c.title}
            </h3>

          </div>
        </div>

        <div className="bg-white px-3 py-3">

          <p className="min-h-[40px] text-xs leading-5 text-slate-500">
            {c.subtitle ||
              'Competition details, prize information and entry information will be announced soon.'}
          </p>

          <div
            className="mt-3 flex h-9 items-center justify-center rounded-md border border-[#FFD54A]/60 bg-[#FFD54A]/10 text-[11px] font-black uppercase tracking-[0.14em] text-slate-800"
            data-testid={`coming-soon-label-${contestId}`}
          >
            Coming Soon
          </div>

        </div>
      </article>
    );
  }

  return (
    <Link
      to={`/competition/${c.slug}`}
      onClick={handleClick}
      className="group block"
      data-testid={`competition-card-${c.slug}`}
    >
      <div className="overflow-hidden rounded-md bg-[#161433]">
        <div className="relative aspect-[2/1] overflow-hidden bg-transparent">
          <img
            src={resolveMediaUrl(c.image)}
            alt={c.title}
            loading="lazy"
            onError={useFallbackImage}
            className="block h-full w-full object-cover object-center"
          />
        </div>

        <div className="px-2 py-1 text-white">
          <h3 className="truncate font-display text-sm font-extrabold">
            {c.title}
          </h3>

          <div className="mt-0.5 flex items-center justify-between gap-2">
            <div className="inline-flex shrink-0 items-center gap-1 font-extrabold">
              <Coins className="h-4 w-4 text-[#FFD54A]" />
              <span className="text-sm">{tokenCount(c.price)}</span>
            </div>

            <div
              className={`inline-flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-extrabold ${
                ended
                  ? 'bg-rose-500 text-white'
                  : 'bg-black/45 text-white'
              }`}
              data-testid={`card-timer-${c.slug}`}
            >
              <Clock className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {ended
                  ? 'Ended'
                  : `${t.days}d ${String(t.hours).padStart(2, '0')}h ${String(
                      t.mins
                    ).padStart(2, '0')}m`}
              </span>
            </div>

            <div
              data-testid={`card-join-state-${c.slug}`}
              className={`shrink-0 rounded-sm px-2 py-0.5 text-[9px] font-extrabold ${
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
              <span className="uppercase tracking-wider text-white/45">
                Progress
              </span>

              <span
                className="font-extrabold text-[#FFD54A]"
                data-testid={`card-pct-${c.slug}`}
              >
                {pct}%
              </span>
            </div>

            <div
              className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-label={`${c.title} contest progress`}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={pct}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FFD54A] to-[#FFB020] transition-[width] duration-500"
                style={{
                  width: `${Math.max(0, Math.min(100, pct))}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
