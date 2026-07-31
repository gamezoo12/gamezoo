import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Clock, Ticket } from 'lucide-react';
import { countdown, percent, gbp } from '../lib/format';
import { api } from '../lib/api';

export default function CompetitionCard({ c }) {
  const [t, setT] = useState(countdown(c.endDate));
  useEffect(() => {
    const i = setInterval(() => setT(countdown(c.endDate)), 1000);
    return () => clearInterval(i);
  }, [c.endDate]);

  const pct = percent(c.ticketsSold, c.ticketsTotal);

  const handleClick = () => {
    // Fire-and-forget A/B tracking: distinguishes mobile vs desktop card clicks so
    // admins can see if a contest is being clicked more from mobile and needs a
    // better mobile crop.
    try {
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
      api.post(`/contests/${c.id || c.contest_id}/track-view?is_mobile=${isMobile}`).catch(() => {});
    } catch { /* ignore */ }
  };

  return (
    <Link to={`/competition/${c.slug}`} onClick={handleClick} className="group block" data-testid={`competition-card-${c.slug}`}>
      <div className="prize-card bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm h-full flex flex-col">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-teal-50 to-emerald-50">
          <picture>
            {c.mobile_image && <source media="(max-width: 640px)" srcSet={c.mobile_image} />}
            <img src={c.image} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
          </picture>
          <Badge className="absolute top-3 left-3 bg-white text-teal-700 hover:bg-white shadow">{c.tag}</Badge>
          {c.jackpot && (
            <Badge className="absolute top-3 right-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0">BIG PRIZE</Badge>
          )}
          {c.gameType && (
            <Badge
              data-testid={`play-to-win-badge-${c.id}`}
              className={`absolute ${c.jackpot ? 'top-11' : 'top-3'} right-3 bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-500 text-white border-0 shadow-md`}
            >
              🎮 Play to win
            </Badge>
          )}
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-1 text-white text-xs font-semibold">
            <span className="bg-black/60 backdrop-blur px-2 py-1 rounded-md"><Clock className="w-3 h-3 inline mr-1" />{t.days}d {t.hours}h {t.mins}m {String(t.secs).padStart(2,'0')}s</span>
          </div>
        </div>
        <div className="p-3 md:p-4 flex-1 flex flex-col">
          <div className="text-[10px] md:text-xs uppercase tracking-wide text-slate-500 mb-1 truncate">{c.subtitle}</div>
          <h3 className="font-display font-bold text-sm md:text-base text-slate-900 line-clamp-2 min-h-[2.5rem] md:min-h-[3rem]">{c.title}</h3>

          <div className="mt-2 md:mt-3">
            <div className="flex justify-between text-[10px] md:text-xs text-slate-500 mb-1">
              <span>{c.ticketsSold.toLocaleString()} / {c.ticketsTotal.toLocaleString()}</span>
              <span className="font-semibold text-teal-600">{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5 md:h-2 bg-slate-100" />
          </div>

          <div className="mt-3 md:mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-slate-900 min-w-0">
              <Ticket className="w-4 h-4 text-orange-500 shrink-0" />
              <span className="font-bold text-sm md:text-base">{gbp(c.price)}</span>
              <span className="hidden md:inline text-xs text-slate-500">/entry</span>
            </div>
            <Button size="sm" className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-xs md:text-sm px-2.5 md:px-3">
              Enter
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}
