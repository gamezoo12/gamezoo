import { useEffect, useState } from 'react';
import { HERO_SLIDES } from '../../mock/mockData';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';

export default function HeroBanner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % HERO_SLIDES.length), 5500);
    return () => clearInterval(t);
  }, []);
  const s = HERO_SLIDES[i];

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-teal-50 via-white to-white">
      <div className="confetti absolute inset-0 opacity-40 pointer-events-none" />
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12 lg:py-20 grid lg:grid-cols-2 gap-10 items-center relative">
        <div className="fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
            <Star className="w-3.5 h-3.5 fill-amber-500 stroke-amber-500" /> Rated 5-Star on Trustpilot • 3,017 reviews
          </div>
          <h1 className="mt-4 font-display text-4xl md:text-6xl font-extrabold leading-tight text-slate-900">
            {s.title}
          </h1>
          <p className="mt-4 text-lg text-slate-600 max-w-xl">{s.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={s.href}>
              <Button size="lg" className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25">
                {s.cta}
              </Button>
            </Link>
            <Link to="/competitions">
              <Button size="lg" variant="outline" className="border-teal-500 text-teal-700 hover:bg-teal-50">Browse Competitions</Button>
            </Link>
          </div>
          <div className="mt-8 flex items-center gap-6 text-sm text-slate-500">
            <div><span className="font-bold text-slate-900">85,000+</span> Winners</div>
            <div className="h-4 w-px bg-slate-200" />
            <div><span className="font-bold text-slate-900">£22m+</span> Prizes Given</div>
            <div className="h-4 w-px bg-slate-200" />
            <div><span className="font-bold text-slate-900">165k+</span> Followers</div>
          </div>
        </div>

        <div className="relative">
          <div className={`relative aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl shadow-teal-500/20 bg-gradient-to-br ${s.accent}`}>
            <img src={s.image} alt={s.title} className="w-full h-full object-cover mix-blend-luminosity opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
              <span className="px-3 py-1 rounded-full bg-white/95 backdrop-blur text-xs font-bold text-teal-700">LIVE DRAW SOON</span>
              <div className="flex gap-1">
                {HERO_SLIDES.map((_, idx) => (
                  <button key={idx} onClick={() => setI(idx)} className={`h-2 rounded-full transition-all ${idx === i ? 'w-8 bg-white' : 'w-2 bg-white/50'}`} />
                ))}
              </div>
            </div>
            <button onClick={() => setI((i - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)} className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setI((i + 1) % HERO_SLIDES.length)} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-amber-400 opacity-20 blur-2xl" />
          <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-teal-400 opacity-20 blur-2xl" />
        </div>
      </div>
    </section>
  );
}
