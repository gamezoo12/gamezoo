import { REVIEWS } from '../../mock/mockData';
import { Star } from 'lucide-react';

export default function Reviews() {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-2">
            {[0,1,2,3,4].map((i) => <Star key={i} className="w-5 h-5 fill-amber-500 stroke-amber-500" />)}
            <span className="text-sm font-semibold text-slate-700">4.9 / 5 from 3,017 reviews</span>
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-slate-900">What our winners say</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {REVIEWS.slice(0, 8).map((r) => (
            <div key={r.id} className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
              <div className="flex gap-1 mb-2">
                {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-500 stroke-amber-500" />)}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed line-clamp-4">“{r.text}”</p>
              <div className="mt-3 text-xs text-slate-500"><span className="font-semibold text-slate-900">{r.name}</span> • {r.date}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
