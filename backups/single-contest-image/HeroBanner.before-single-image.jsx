import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';

/**
 * Prize League premium hero.
 * Left  = PRIZE LEAGUE brand + Play Now.
 * Right = Live Contests auto-rotating carousel (fed from `contests` prop).
 */
export default function HeroBanner({ contests = [] }) {
  const live = useMemo(
    () => (contests || []).filter(c => c.status !== 'drawn' && c.status !== 'archived').slice(0, 6),
    [contests]
  );

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || live.length <= 1) return undefined;
    const t = setInterval(() => setI(n => (n + 1) % live.length), 5000);
    return () => clearInterval(t);
  }, [paused, live.length]);

  const prev = () => setI(n => (n - 1 + live.length) % live.length);
  const next = () => setI(n => (n + 1) % live.length);

  // Swipe support
  const [touchX, setTouchX] = useState(null);
  const onTouchStart = (e) => setTouchX(e.touches[0].clientX);
  const onTouchEnd = (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (dx > 40) prev();
    else if (dx < -40) next();
    setTouchX(null);
  };

  const current = live[i];

  const timeLeft = (endDate) => {
    if (!endDate) return '';
    const diff = new Date(endDate) - Date.now();
    if (diff <= 0) return 'Ending soon';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `Ends in ${d > 0 ? d + 'd ' : ''}${h}h ${m}m`;
  };

  return (
    <section className="relative pl-hero-bg text-white" data-testid="hero-banner">
      {/* Soft confetti dots */}
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{
        backgroundImage: 'radial-gradient(#ffffff22 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }} />

      <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-10 md:py-16 lg:py-20 grid lg:grid-cols-[1.05fr,1fr] gap-8 lg:gap-14 items-center">
        {/* LEFT — brand */}
        <div>
          <h1 className="font-display font-extrabold leading-[0.95] tracking-tight">
            <span className="block pl-gold-text text-5xl md:text-6xl lg:text-7xl">PRIZE LEAGUE</span>
          </h1>
          <p className="mt-4 text-white text-2xl md:text-3xl font-display font-bold">
            Play. Compete. Win Amazing Prizes.
          </p>
          <p className="mt-4 text-white/75 text-base md:text-lg max-w-xl">
            Join exciting skill-based contests, challenge yourself and stand a chance to win amazing prizes.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/80 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Skill-based contests for eligible players. Terms &amp; Conditions apply.
          </div>

          <div className="mt-8">
            <Link to="/competitions" data-testid="hero-play-now">
              <button className="pl-btn-gold h-14 px-8 rounded-full font-extrabold text-lg inline-flex items-center gap-3">
                <Gamepad2 className="w-6 h-6" /> PLAY NOW
              </button>
            </Link>
          </div>
        </div>

        {/* RIGHT — live contests carousel */}
        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          data-testid="hero-carousel"
        >
          {live.length === 0 ? (
            <div className="pl-glass rounded-3xl p-10 text-center">
              <div className="text-white font-display text-xl font-bold mb-2">New contests coming soon</div>
              <div className="text-white/60 text-sm">Check back in a bit — we&apos;re dropping fresh contests every week.</div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500 text-white text-[11px] font-bold uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
                </span>
                <span className="text-white/70 text-sm font-semibold uppercase tracking-widest">Live Contests</span>
              </div>

              <div className="relative pl-glass rounded-3xl overflow-hidden shadow-2xl">
                <div className="relative aspect-[16/10]">
                  <picture key={current.id || current.contest_id || i}>
                    {current.mobile_image && (
                      <source media="(max-width: 640px)" srcSet={current.mobile_image} />
                    )}
                    <img
                      src={current.image}
                      alt={current.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </picture>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D1F] via-[#0B0D1F]/40 to-transparent" />

                  <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500 text-white text-[11px] font-bold uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
                  </span>

                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <div className="text-white font-display text-2xl md:text-3xl font-extrabold mb-2 drop-shadow">{current.title}</div>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-white/85 text-sm">
                        <span className="font-bold text-[#FFD54A]">{Math.round(current.price ?? 0)} 🪙</span> Entry ·
                        {' '}<span className="text-white/70">{(current.tickets_sold || 0).toLocaleString()} entries</span>
                      </div>
                      <Link to={`/competition/${current.slug || current.contest_id}`}>
                        <button className="pl-btn-purple px-4 py-2 rounded-full text-sm font-bold" data-testid="hero-view-contest">View Contest</button>
                      </Link>
                    </div>
                    <div className="text-white/70 text-xs mt-2">{timeLeft(current.end_date)}</div>
                  </div>
                </div>

                {/* Controls */}
                {live.length > 1 && (
                  <>
                    <button
                      onClick={prev}
                      data-testid="hero-carousel-prev"
                      aria-label="Previous contest"
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur"
                    ><ChevronLeft className="w-5 h-5" /></button>
                    <button
                      onClick={next}
                      data-testid="hero-carousel-next"
                      aria-label="Next contest"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur"
                    ><ChevronRight className="w-5 h-5" /></button>
                  </>
                )}
              </div>

              {/* Dots */}
              <div className="mt-3 flex items-center justify-center gap-2">
                {live.map((slide, idx) => (
                  <button
                    key={slide.contest_id || slide.slug || `slide-${idx}`}
                    onClick={() => setI(idx)}
                    aria-label={`Slide ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-6 bg-[#FFD54A]' : 'w-2 bg-white/30 hover:bg-white/60'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
