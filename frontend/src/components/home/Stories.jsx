import { STORIES } from '../../mock/mockData';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { ArrowRight } from 'lucide-react';

export default function Stories() {
  return (
    <section className="py-16 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <span className="text-xs uppercase font-semibold text-teal-600 tracking-wider">The blog</span>
            <h2 className="font-display text-3xl md:text-4xl font-extrabold text-slate-900 mt-1">Prize Paradise Stories</h2>
          </div>
          <Link to="/stories" className="hidden md:inline-flex">
            <Button variant="ghost" className="text-teal-600 hover:text-teal-700 hover:bg-teal-100">View all <ArrowRight className="w-4 h-4 ml-1" /></Button>
          </Link>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {STORIES.slice(0, 6).map((s) => (
            <article key={s.id} className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-lg transition-shadow group">
              <div className="aspect-video overflow-hidden bg-slate-100">
                <img src={s.image} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
              </div>
              <div className="p-5">
                <div className="text-xs text-slate-500 mb-1">{s.date}</div>
                <h3 className="font-display font-bold text-lg text-slate-900 mb-2">{s.title}</h3>
                <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed">{s.excerpt}</p>
                <button className="mt-3 text-sm font-semibold text-teal-600 hover:text-teal-700 inline-flex items-center gap-1">Read More <ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
