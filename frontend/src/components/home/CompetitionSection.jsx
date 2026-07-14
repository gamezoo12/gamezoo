import { Link } from 'react-router-dom';
import CompetitionCard from '../CompetitionCard';
import { Button } from '../ui/button';
import { ArrowRight } from 'lucide-react';

export default function CompetitionSection({ title, subtitle, items, viewAllHref = '/competitions', accent = "orange" }) {
  const accentDot = accent === 'orange' ? 'bg-orange-500' : accent === 'amber' ? 'bg-amber-500' : 'bg-orange-500';
  return (
    <section className="py-8 md:py-12">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="flex items-end justify-between mb-4 md:mb-6 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block w-2 h-2 rounded-full ${accentDot}`} />
              <span className="text-[10px] md:text-xs uppercase font-semibold text-slate-500 tracking-wider">{subtitle}</span>
            </div>
            <h2 className="font-display text-2xl md:text-4xl font-extrabold text-slate-900 leading-tight">{title}</h2>
          </div>
          <Link to={viewAllHref} className="inline-flex shrink-0">
            <Button variant="ghost" size="sm" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 text-xs md:text-sm">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          {items.slice(0, 4).map((c) => (
            <CompetitionCard key={c.id} c={c} />
          ))}
        </div>
      </div>
    </section>
  );
}
