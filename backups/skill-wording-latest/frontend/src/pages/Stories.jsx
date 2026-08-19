import { STORIES } from '../mock/mockData';
import { ArrowRight, BookOpen } from 'lucide-react';

export default function Stories() {
  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <h1 className="font-display text-4xl font-extrabold text-slate-900">Stories</h1>
      <p className="text-slate-500 mt-1">Winner interviews and updates from the Prize League team.</p>

      {STORIES.length === 0 ? (
        <div className="mt-10 rounded-3xl border-2 border-dashed border-slate-200 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-4"><BookOpen className="w-8 h-8 text-slate-400" /></div>
          <h2 className="font-display text-2xl font-bold text-slate-900">Stories coming soon</h2>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">We’ll publish winner interviews and behind-the-scenes updates here right after our first draws.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {STORIES.map((s, i) => (
            <article key={i} className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-lg transition-shadow">
              <div className="aspect-video overflow-hidden bg-slate-100"><img src={s.image} alt={s.title} className="w-full h-full object-cover" /></div>
              <div className="p-5">
                <div className="text-xs text-slate-500 mb-1">{s.date}</div>
                <h3 className="font-display font-bold text-lg text-slate-900 mb-2">{s.title}</h3>
                <p className="text-sm text-slate-600 line-clamp-3">{s.excerpt}</p>
                <button className="mt-3 text-sm font-semibold text-teal-600 inline-flex items-center gap-1 hover:text-teal-700">Read More <ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
