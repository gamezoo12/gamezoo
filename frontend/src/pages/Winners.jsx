import { WINNERS } from '../mock/mockData';
import { Trophy, Calendar } from 'lucide-react';

export default function Winners() {
  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <h1 className="font-display text-4xl font-extrabold text-slate-900">Our Winners</h1>
      <p className="text-slate-500 mt-1">Over 85,000 lucky winners have collected £22m+ in prizes.</p>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-8">
        {WINNERS.concat(WINNERS).map((w, idx) => (
          <div key={idx} className="rounded-2xl overflow-hidden bg-white border border-slate-100 shadow-sm hover:shadow-lg transition-shadow">
            <div className="aspect-square overflow-hidden bg-slate-50">
              <img src={w.image} alt={w.name} className="w-full h-full object-cover" loading="lazy" />
            </div>
            <div className="p-4">
              <div className="flex items-center gap-1 text-orange-600 text-xs font-semibold mb-1"><Trophy className="w-3 h-3" /> {w.amount}</div>
              <div className="font-display font-bold text-slate-900 line-clamp-1">{w.prize}</div>
              <div className="text-sm text-slate-500 mt-1">Won by {w.name}</div>
              <div className="flex items-center gap-1 text-xs text-slate-400 mt-2"><Calendar className="w-3 h-3" /> {new Date(w.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
