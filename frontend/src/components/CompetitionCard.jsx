import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Progress } from './ui/progress';
import { Clock, CheckCircle2, Coins, ArrowRight } from 'lucide-react';
import { countdown, percent, tokenCount } from '../lib/format';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useJoinedContestIds } from '../lib/joinedContests';

/**
 * CompetitionCard — 2026-08 redesign.
 * - 1:1 image (uses contest.image, the square upload from admin).
 * - Countdown pill in top-LEFT corner.
 * - "Joined" or "Join" pill in top-RIGHT corner (auth-aware).
 * - Progress bar shows PERCENT ONLY (no raw ticket counts, per spec).
 * - Bottom row: token price + Enter/Play arrow.
 */
export default function CompetitionCard({ c }) {
  const [t, setT] = useState(countdown(c.endDate));
  const { user } = useAuth();
  const joined = useJoinedContestIds(user);

  useEffect(() => {
    const i = setInterval(() => setT(countdown(c.endDate)), 1000);
    return () => clearInterval(i);
  }, [c.endDate]);

  const pct = percent(c.ticketsSold, c.ticketsTotal);
  const contestId = c.id || c.contest_id;
  const isJoined = user && contestId && joined.has(contestId);
  const ended = t.days <= 0 && t.hours <= 0 && t.mins <= 0 && t.secs <= 0;

  const handleClick = () => {
    try {
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
      api.post(`/contests/${contestId}/track-view?is_mobile=${isMobile}`).catch(() => {});
    } catch { /* ignore */ }
  };

  return (
    <Link
      to={`/competition/${c.slug}`}
      onClick={handleClick}
      className="group block"
      data-testid={`competition-card-${c.slug}`}
    >
      <div className="relative bg-[#161433] rounded-2xl overflow-hidden border border-white/5 hover:border-[#FFD54A]/40 transition shadow-sm hover:shadow-[0_10px_40px_-10px_rgba(255,213,74,0.25)] h-full flex flex-col">
        {/* 2:1 preview image (falls back to 1:1 if no preview banner uploaded) */}
        <div className="relative aspect-[2/1] overflow-hidden bg-slate-900">
          <img
            src={c.previewImage || c.preview_image || c.image}
            alt={c.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
          {/* Dark bottom gradient for legibility of title on hover */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* TOP-LEFT: countdown pill */}
          <div
            data-testid={`card-timer-${c.slug}`}
            className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] md:text-[11px] font-extrabold tracking-wide shadow ${
              ended
                ? 'bg-rose-500 text-white'
                : t.days <= 0 && t.hours < 24
                  ? 'bg-rose-500/95 text-white'
                  : 'bg-black/70 text-white backdrop-blur'
            }`}
          >
            <Clock className="w-3 h-3" />
            {ended
              ? 'Ended'
              : t.days > 0
                ? `${t.days}d ${t.hours}h`
                : `${String(t.hours).padStart(2, '0')}:${String(t.mins).padStart(2, '0')}:${String(t.secs).padStart(2, '0')}`}
          </div>

          {/* TOP-RIGHT: joined-state pill */}
          <div
            data-testid={`card-join-state-${c.slug}`}
            className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] md:text-[11px] font-extrabold tracking-wide shadow ${
              isJoined
                ? 'bg-emerald-500 text-white'
                : 'bg-[#FFD54A] text-slate-900'
            }`}
          >
            {isJoined ? (
              <><CheckCircle2 className="w-3 h-3" /> Joined</>
            ) : (
              <>Join <ArrowRight className="w-3 h-3" /></>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-3 md:p-4 flex-1 flex flex-col text-white">
          <div className="text-[10px] md:text-[11px] uppercase tracking-widest text-[#FFD54A]/80 mb-1 truncate">
            {c.subtitle || c.tag || 'Prize contest'}
          </div>
          <h3 className="font-display font-extrabold text-sm md:text-base line-clamp-2 min-h-[2.5rem] md:min-h-[3rem]">{c.title}</h3>

          {/* Progress — percent only, per spec */}
          <div className="mt-2.5">
            <div className="flex justify-between text-[10px] md:text-[11px] mb-1">
              <span className="text-white/60 uppercase tracking-wider">Sold</span>
              <span className="font-extrabold text-[#FFD54A]" data-testid={`card-pct-${c.slug}`}>{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5 bg-white/10 [&>*]:bg-gradient-to-r [&>*]:from-[#FFD54A] [&>*]:to-[#FFB020]" />
          </div>

          {/* Price + arrow CTA */}
          <div className="mt-3 flex items-center justify-between">
            <div className="inline-flex items-center gap-1 font-extrabold text-white">
              <Coins className="w-4 h-4 text-[#FFD54A]" />
              <span className="text-base md:text-lg">{tokenCount(c.price)}</span>
              <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">/ entry</span>
            </div>
            <div className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-extrabold transition ${
              isJoined
                ? 'bg-white/10 text-white/80 group-hover:bg-white/15'
                : 'bg-[#FFD54A] text-slate-900 group-hover:brightness-110'
            }`}>
              {isJoined ? 'Open' : 'Enter'} <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
