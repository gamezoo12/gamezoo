import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Clock, Ticket } from 'lucide-react';
import { countdown, percent, gbp } from '../lib/format';

export default function CompetitionCard({ c }) {
  const [t, setT] = useState(countdown(c.endDate));
  useEffect(() => {
    const i = setInterval(() => setT(countdown(c.endDate)), 1000);
    return () => clearInterval(i);
  }, [c.endDate]);

  const pct = percent(c.ticketsSold, c.ticketsTotal);

  return (
    <Link to={`/competition/${c.slug}`} className="group block">
      <div className="prize-card bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm h-full flex flex-col">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-teal-50 to-emerald-50">
          <img src={c.image} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
          <Badge className="absolute top-3 left-3 bg-white text-teal-700 hover:bg-white shadow">{c.tag}</Badge>
          {c.jackpot && (
            <Badge className="absolute top-3 right-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0">JACKPOT</Badge>
          )}
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-1 text-white text-xs font-semibold">
            <span className="bg-black/60 backdrop-blur px-2 py-1 rounded-md"><Clock className="w-3 h-3 inline mr-1" />{t.days}d {t.hours}h {t.mins}m {String(t.secs).padStart(2,'0')}s</span>
          </div>
        </div>
        <div className="p-4 flex-1 flex flex-col">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{c.subtitle}</div>
          <h3 className="font-display font-bold text-slate-900 line-clamp-2 min-h-[3rem]">{c.title}</h3>

          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{c.ticketsSold.toLocaleString()} / {c.ticketsTotal.toLocaleString()}</span>
              <span className="font-semibold text-teal-600">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2 bg-slate-100" />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-1 text-slate-900">
              <Ticket className="w-4 h-4 text-orange-500" />
              <span className="font-bold">{gbp(c.price)}</span>
              <span className="text-xs text-slate-500">/entry</span>
            </div>
            <Button size="sm" className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white">
              Enter Now
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}
