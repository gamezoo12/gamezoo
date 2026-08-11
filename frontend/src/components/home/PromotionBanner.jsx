import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/media';

const ROTATE_MS = 5000;

export default function PromotionBanner() {
  const [settings, setSettings] = useState(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let active = true;

    api.get('/settings')
      .then(r => {
        if (active) setSettings(r.data || {});
      })
      .catch(() => {
        if (active) setSettings({});
      });

    return () => {
      active = false;
    };
  }, []);

  const slides = useMemo(() => {
    const count = Math.max(
      1,
      Math.min(5, Number(settings?.promotion_slide_count) || 1)
    );

    const rows = Array.isArray(settings?.promotion_slides)
      ? settings.promotion_slides
      : [];

    return rows
      .slice(0, count)
      .map((slide, position) => ({
        id: `promotion-${position}`,
        url: String(slide?.url || '').trim(),
      }))
      .filter(slide => slide.url);
  }, [settings]);

  useEffect(() => {
    if (index >= slides.length) {
      setIndex(0);
    }
  }, [slides.length, index]);

  useEffect(() => {
    if (paused || slides.length <= 1) return undefined;

    const timer = setInterval(() => {
      setIndex(current => (current + 1) % slides.length);
    }, ROTATE_MS);

    return () => clearInterval(timer);
  }, [paused, slides.length]);

  const previous = () => {
    if (slides.length <= 1) return;

    setIndex(current =>
      (current - 1 + slides.length) % slides.length
    );
  };

  const next = () => {
    if (slides.length <= 1) return;

    setIndex(current =>
      (current + 1) % slides.length
    );
  };

  return (
    <section
      className="w-full bg-white"
      data-testid="homepage-promotion-banner"
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-8 pt-4 md:pt-6">
        <div
          className="relative w-full aspect-[2/1] overflow-hidden rounded-2xl md:rounded-3xl bg-[#0B0D1F] shadow-lg border border-slate-100"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {slides.length === 0 ? (
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#111329] via-[#171936] to-[#21164f]"
              data-testid="promotion-empty-state"
            />
          ) : (
            slides.map((slide, slideIndex) => (
              <img
                key={slide.id}
                src={resolveMediaUrl(slide.url)}
                alt={`Prize League promotion ${slideIndex + 1}`}
                className={`absolute inset-0 block w-full h-full object-cover object-center transition-opacity duration-500 ${
                  slideIndex === index
                    ? 'opacity-100'
                    : 'opacity-0 pointer-events-none'
                }`}
                loading={slideIndex === 0 ? 'eager' : 'lazy'}
                data-testid={`promotion-slide-${slideIndex}`}
              />
            ))
          )}

          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={previous}
                aria-label="Previous promotion"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 hover:bg-black/55 text-white backdrop-blur flex items-center justify-center transition"
                data-testid="promotion-prev"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={next}
                aria-label="Next promotion"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 hover:bg-black/55 text-white backdrop-blur flex items-center justify-center transition"
                data-testid="promotion-next"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <div className="absolute left-0 right-0 bottom-3 flex justify-center gap-2">
                {slides.map((slide, slideIndex) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setIndex(slideIndex)}
                    aria-label={`Promotion ${slideIndex + 1}`}
                    className={`h-2 rounded-full shadow transition-all ${
                      slideIndex === index
                        ? 'w-7 bg-white'
                        : 'w-2 bg-white/50 hover:bg-white/80'
                    }`}
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
