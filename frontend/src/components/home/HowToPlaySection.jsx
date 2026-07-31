import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';

/**
 * Four-step "How to Play" section with real lifestyle photography of adults
 * — not coloured boxes. Each photo is a hosted Pexels URL (free-to-use,
 * no attribution required) so nothing needs to ship with the frontend
 * bundle and the images can be swapped later by editing the `img` field.
 *
 * Design brief the user gave us: "AI adults images in how to play section
 * instead of just coloured boxes". Real photography reads more premium
 * than AI art on a prize competition site and loads instantly.
 */
const STEPS = [
  {
    n: 1,
    title: 'Create your account',
    text: 'Sign up in under a minute — email, a mobile number for OTP and you\'re in.',
    img: 'https://images.pexels.com/photos/3760263/pexels-photo-3760263.jpeg?auto=compress&cs=tinysrgb&h=600&w=600',
    alt: 'Smiling adult holding a phone celebrating an app sign-up',
  },
  {
    n: 2,
    title: 'Pick a contest',
    text: 'Browse live prize contests and pick the one you fancy — cash, cars, tech.',
    img: 'https://images.pexels.com/photos/5077055/pexels-photo-5077055.jpeg?auto=compress&cs=tinysrgb&h=600&w=600',
    alt: 'Woman browsing a phone with credit card ready to enter a contest',
  },
  {
    n: 3,
    title: 'Answer the skill question',
    text: 'A quick maths problem — get it right and your ticket is valid for the draw.',
    img: 'https://images.pexels.com/photos/5905902/pexels-photo-5905902.jpeg?auto=compress&cs=tinysrgb&h=600&w=600',
    alt: 'Focused adult solving a maths problem on a phone',
  },
  {
    n: 4,
    title: 'Winner announced live',
    text: 'Live draws on our Production channel. Cash paid in 24 hours, prizes shipped free.',
    img: 'https://images.pexels.com/photos/7414284/pexels-photo-7414284.jpeg?auto=compress&cs=tinysrgb&h=600&w=600',
    alt: 'Happy adult celebrating a win on their phone with confetti',
  },
];

const FALLBACK_IMG = 'https://images.pexels.com/photos/3760263/pexels-photo-3760263.jpeg?auto=compress&cs=tinysrgb&h=600&w=600';

export default function HowToPlaySection({ compact = false }) {
  return (
    <section className="py-12 md:py-20 bg-white" data-testid="how-to-play-section" id="how-to-play">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <div className="text-xs uppercase font-bold tracking-widest text-[#6C2BFF]">Getting started</div>
          <h2 className="mt-2 font-display text-3xl md:text-5xl font-extrabold text-[#0B0D1F]">
            How to Play — <span className="pl-gold-text">It&apos;s Easy!</span>
          </h2>
          <p className="mt-3 text-slate-600">Four simple steps to your next prize. No experience needed — just skill and fun.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {STEPS.map(({ n, title, text, img, alt }) => (
            <div
              key={n}
              className="group relative bg-white rounded-2xl border border-slate-100 hover:shadow-xl hover:border-[#6C2BFF]/25 transition-all hover:-translate-y-1 overflow-hidden"
              data-testid={`step-${n}`}
            >
              <div className="relative w-full aspect-[4/3] overflow-hidden bg-slate-100">
                <img
                  src={img}
                  alt={alt}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => { if (e.currentTarget.src !== FALLBACK_IMG) e.currentTarget.src = FALLBACK_IMG; }}
                />
                {/* Gold number badge — sits on top of the photo */}
                <div className="absolute top-3 left-3 w-9 h-9 rounded-full bg-[#0B0D1F] text-[#FFD54A] font-black text-sm flex items-center justify-center ring-2 ring-[#FFD54A]/80 shadow-lg">
                  {n}
                </div>
                {/* Soft gradient overlay to keep body text legible if photos load */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent pointer-events-none" />
              </div>

              <div className="p-4 md:p-5">
                <h3 className="font-display font-extrabold text-slate-900 text-base md:text-lg leading-tight">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>

        {!compact && (
          <div className="mt-10 md:mt-14 text-center">
            <Link to="/competitions" data-testid="how-to-play-cta">
              <button className="pl-btn-gold h-13 px-8 py-3 rounded-full font-extrabold inline-flex items-center gap-3">
                <Gamepad2 className="w-5 h-5" /> PLAY NOW
              </button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
