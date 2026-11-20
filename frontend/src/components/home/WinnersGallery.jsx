import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { publicAPI } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/media';

export function relativeTime(value, now = Date.now()) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days}day${days === 1 ? '' : 's'} ago`;
}

export default function WinnersGallery({ title = 'Recent Winners' }) {
  const [winners, setWinners] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    publicAPI.homepageContent().then((data) => setWinners(data.winners || [])).catch(() => setWinners([]));
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  if (!winners.length) return null;

  return (
    <section className="bg-white py-14" data-testid="homepage-winners">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-8 text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-orange-600">Real people. Real winners.</span>
          <h2 className="mt-2 font-display text-3xl font-extrabold text-slate-900 md:text-4xl">{title}</h2>
        </div>
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 md:grid md:grid-cols-4 md:overflow-visible" data-testid="homepage-winner-list">
          {winners.map((winner) => (
            <article key={winner.content_id} className="group relative min-w-[calc(50%-0.375rem)] snap-start overflow-hidden rounded-lg border border-slate-100 shadow-sm md:min-w-0">
              <div className="aspect-square overflow-hidden bg-slate-100">
                <img src={resolveMediaUrl(winner.image_url)} alt={winner.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 text-white">
                <div className="mb-1 flex items-center gap-1 text-xs text-amber-300"><Trophy className="h-3 w-3" />{winner.prize}</div>
                <div className="text-sm font-semibold">{winner.name}</div>
                <div className="mt-0.5 text-[11px] text-white/75">{relativeTime(winner.created_at, now)}</div>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-5 text-center"><Link to="/winners"><Button variant="outline" className="border-orange-500 text-orange-700 hover:bg-orange-50">View All Winners</Button></Link></div>
      </div>
    </section>
  );
}
