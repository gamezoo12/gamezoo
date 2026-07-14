import { Link } from 'react-router-dom';
import CompetitionCard from '../CompetitionCard';
import { ArrowRight, Radio } from 'lucide-react';

/**
 * "Live Now" section — always shown at the top of Home if there are any live contests.
 * Shows at least 2, up to 4. Uses a pulsing red badge to signal live status.
 * On mobile: horizontal scroll snap; on desktop: 4-col grid.
 */
export default function LiveNowSection({ items }) {
  if (!items || items.length === 0) return null;
  const display = items.slice(0, 4);
  return (
    <section className="pt-6 pb-8 md:py-10 bg-gradient-to-b from-rose-50/60 to-transparent" data-testid="live-now-section">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="flex items-end justify-between mb-4 md:mb-6 gap-3">
          <div>
            <div className="inline-flex items-center gap-2 mb-1">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-80" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600" />
              </span>
              <span className="text-xs uppercase font-bold text-rose-600 tracking-widest">Live Now</span>
              <Radio className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <h2 className="font-display text-2xl md:text-4xl font-extrabold text-slate-900 leading-tight">
              Playing right now — <span className="text-rose-600">jump in</span>
            </h2>
          </div>
          <Link
            to="/competitions"
            className="text-sm text-rose-600 hover:text-rose-800 font-semibold inline-flex items-center gap-1 whitespace-nowrap"
            data-testid="live-view-all"
          >
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Mobile: horizontal snap-scroll  |  Desktop: 4-col grid */}
        <div className="md:hidden -mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 no-scrollbar" data-testid="live-mobile-scroller">
          {display.map(c => (
            <div key={c.id} className="min-w-[75%] max-w-[75%] snap-start">
              <CompetitionCard c={c} />
            </div>
          ))}
        </div>
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-6">
          {display.map(c => <CompetitionCard key={c.id} c={c} />)}
        </div>
      </div>
    </section>
  );
}
