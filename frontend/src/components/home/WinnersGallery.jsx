import { WINNERS } from '../../mock/mockData';
import { Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';

export default function WinnersGallery() {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="text-center mb-10">
          <span className="text-xs uppercase font-semibold text-orange-600 tracking-wider">Real people. Real winners.</span>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-slate-900 mt-2">Our Winners</h2>
          <p className="text-slate-500 mt-2">Over 64,000 winners & counting! Could you be next?</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {WINNERS.slice(0, 8).map((w) => (
            <div key={w.id} className="relative rounded-2xl overflow-hidden group border border-slate-100 shadow-sm hover:shadow-lg transition-shadow">
              <div className="aspect-square overflow-hidden bg-slate-50">
                <img src={w.image} alt={w.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent text-white">
                <div className="flex items-center gap-1 text-amber-300 text-xs mb-1"><Trophy className="w-3 h-3" /> {w.amount}</div>
                <div className="font-semibold text-sm">{w.name}</div>
                <div className="text-[11px] text-white/70 line-clamp-1">{w.prize}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link to="/winners"><Button variant="outline" className="border-teal-500 text-teal-700 hover:bg-teal-50">View All Winners</Button></Link>
        </div>
      </div>
    </section>
  );
}
