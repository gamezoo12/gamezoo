import { STORIES } from '../mock/mockData';
import { ArrowRight } from 'lucide-react';

export default function Stories() {
  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <h1 className="font-display text-4xl font-extrabold text-slate-900">Stories</h1>
      <p className="text-slate-500 mt-1">Winner testimonials, updates and blog articles.</p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
        {STORIES.concat(STORIES).map((s, i) => (
          <article key={i} className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-lg transition-shadow group">
            <div className="aspect-video overflow-hidden bg-slate-100"><img src={s.image} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" /></div>
            <div className="p-5">
              <div className="text-xs text-slate-500 mb-1">{s.date}</div>
              <h3 className="font-display font-bold text-lg text-slate-900 mb-2">{s.title}</h3>
              <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed">{s.excerpt}</p>
              <button className="mt-3 text-sm font-semibold text-teal-600 inline-flex items-center gap-1 hover:text-teal-700">Read More <ArrowRight className="w-3.5 h-3.5" /></button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
