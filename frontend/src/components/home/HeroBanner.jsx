import { useEffect, useRef, useState } from 'react';
import { HERO_SLIDES } from '../../mock/mockData';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { ChevronLeft, ChevronRight, Sparkles, Trophy, Zap, Play } from 'lucide-react';

const BG_VIDEO = 'https://videos.pexels.com/video-files/2795750/2795750-hd_1920_1080_25fps.mp4';

export default function HeroBanner() {
  const [i, setI] = useState(0);
  const videoRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % HERO_SLIDES.length), 5500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Attempt autoplay (muted so browsers allow it)
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const s = HERO_SLIDES[i];

  return (
    <section
      data-testid="hero-banner"
      className="relative overflow-hidden text-white"
      style={{ minHeight: '620px' }}
    >
      {/* Layer 1 – colorful animated gradient */}
      <div className="absolute inset-0 gz-hero-gradient" />

      {/* Layer 2 – background video (muted, looping) */}
      <video
        ref={videoRef}
        data-testid="hero-video"
        className="absolute inset-0 w-full h-full object-cover opacity-45 mix-blend-screen"
        src={BG_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />

      {/* Layer 3 – dark tint + colored blobs */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-black/60" />
      <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-fuchsia-500/40 blur-3xl float" />
      <div className="absolute top-1/3 -right-32 w-[32rem] h-[32rem] rounded-full bg-amber-400/40 blur-3xl float" style={{ animationDelay: '1.4s' }} />
      <div className="absolute -bottom-32 left-1/3 w-[26rem] h-[26rem] rounded-full bg-teal-400/30 blur-3xl float" style={{ animationDelay: '2.8s' }} />

      {/* Layer 4 – confetti css overlay */}
      <div className="confetti absolute inset-0 opacity-60 pointer-events-none" />

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-14 lg:py-24 grid lg:grid-cols-2 gap-10 items-center">
        <div className="fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" /> UK Skill-Based Contests • 100% Legal
          </div>
          <h1 className="mt-5 font-display text-4xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight">
            <span className="block bg-gradient-to-r from-amber-200 via-white to-fuchsia-200 bg-clip-text text-transparent">
              {s.title}
            </span>
          </h1>
          <p className="mt-5 text-lg md:text-xl text-white/85 max-w-xl">{s.subtitle}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={s.href}>
              <Button
                size="lg"
                data-testid="hero-cta-primary"
                className="h-12 px-7 bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-500 hover:from-orange-600 hover:via-rose-600 hover:to-fuchsia-600 text-white font-bold shadow-2xl shadow-fuchsia-500/40 border-0"
              >
                <Play className="w-4 h-4 mr-1 fill-white" /> {s.cta}
              </Button>
            </Link>
            <Link to="/faq">
              <Button
                size="lg"
                variant="outline"
                data-testid="hero-cta-secondary"
                className="h-12 px-6 border-white/40 text-white bg-white/10 backdrop-blur-md hover:bg-white/20 hover:text-white font-semibold"
              >
                How it works
              </Button>
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-white/80">
            <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-300" /><span><span className="font-extrabold text-white">50</span> Live Contests</span></div>
            <div className="h-4 w-px bg-white/30" />
            <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-fuchsia-300" /><span><span className="font-extrabold text-white">£7,500</span> Prize Pool</span></div>
            <div className="h-4 w-px bg-white/30" />
            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-teal-300" /><span>From <span className="font-extrabold text-white">£1</span></span></div>
          </div>
        </div>

        {/* Right side – floating prize card */}
        <div className="relative hidden lg:block">
          <div className="relative aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl shadow-black/60 border border-white/20 bg-black/30 backdrop-blur-sm">
            <img src={s.image} alt={s.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

            {/* Live pill */}
            <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold uppercase tracking-wider shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live now
            </div>
            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur text-[11px] font-extrabold text-slate-900 shadow-lg">
              SKILL-BASED
            </div>

            <div className="absolute bottom-5 left-5 right-5">
              <div className="text-white/80 text-xs uppercase tracking-widest">Top prize</div>
              <div className="font-display text-4xl font-extrabold text-white drop-shadow-lg">£500 Cash</div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-white/80">Tickets from £1</div>
                <div className="flex gap-1">
                  {HERO_SLIDES.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setI(idx)}
                      aria-label={`Slide ${idx + 1}`}
                      className={`h-2 rounded-full transition-all ${idx === i ? 'w-8 bg-white' : 'w-2 bg-white/50'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setI((i - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)}
              aria-label="Previous"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg"
            >
              <ChevronLeft className="w-4 h-4 text-slate-900" />
            </button>
            <button
              onClick={() => setI((i + 1) % HERO_SLIDES.length)}
              aria-label="Next"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg"
            >
              <ChevronRight className="w-4 h-4 text-slate-900" />
            </button>
          </div>

          {/* Floating badges */}
          <div className="absolute -top-5 -left-5 rotate-[-6deg] px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-300 to-orange-400 text-slate-900 font-extrabold text-sm shadow-2xl shadow-amber-500/40 float">
            🎉 Instant Win
          </div>
          <div className="absolute -bottom-5 -right-4 rotate-[5deg] px-4 py-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white font-extrabold text-sm shadow-2xl shadow-fuchsia-500/40 float" style={{ animationDelay: '1s' }}>
            💷 Same-day payout
          </div>
        </div>
      </div>

      {/* Bottom wave into next section */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-white pointer-events-none" />
    </section>
  );
}
