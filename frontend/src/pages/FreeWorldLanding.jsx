import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import {
  Trophy, Gamepad2, CalendarDays, Crown, Sparkles, ArrowRight, CheckCircle2,
} from 'lucide-react';
import useSeo from '../hooks/useSeo';
import WorldAlertPopup from '../world/components/WorldAlertPopup';

const SITE = 'https://www.prizeleague.co.uk';
const URL = `${SITE}/free-world`;
const OG_IMAGE = `${SITE}/og-free-world.png`;

const FAQS = [
  {
    q: 'What is Prize League Free World?',
    a: 'Free World is Prize League\u2019s free-to-play skill-game experience. You progress through a map of Championships, each made up of ten skill-based levels plus a Champion challenge, competing for prizes through skill \u2014 no purchase needed to play.',
  },
  {
    q: 'Is Free World free to play?',
    a: 'Yes. Free World is free to play and you can progress through the levels for free. Optional token retries are available if you want extra attempts, but they are never required to advance.',
  },
  {
    q: 'How do Free World levels work?',
    a: 'Each Championship has ten skill levels built around the Number Sequence game \u2014 tap the numbers in order as quickly and accurately as you can. Level 1 is open immediately and the remaining levels unlock one per day at midnight (UK time) as you progress.',
  },
  {
    q: 'What are Champion competitions?',
    a: 'After you clear all ten levels of a Championship you reach the Champion challenge. Champion results are ranked together on one global leaderboard, ordered by score and then speed, and completing it advances you to the next Championship.',
  },
  {
    q: 'How can I win a prize?',
    a: 'Prizes in Free World are earned through skill. The top-ranked finishers on the Champion leaderboard win prizes according to Prize League\u2019s published competition rules. Your placement depends only on your score and speed, not on spending.',
  },
  {
    q: 'Who can participate?',
    a: 'Free World is open to eligible Prize League players. Full eligibility, prize and participation details follow Prize League\u2019s published Terms & Conditions \u2014 please review them before playing.',
  },
];

const STEPS = [
  { icon: Gamepad2, title: 'Start at Championship 1, Level 1', text: 'Jump straight in \u2014 Level 1 is always open, with no payment and no waiting.' },
  { icon: CalendarDays, title: 'Play a new skill level each day', text: 'A fresh level unlocks daily at midnight UK time as you climb the map.' },
  { icon: Crown, title: 'Reach the Champion challenge', text: 'Clear all ten levels to unlock the Championship\u2019s Champion challenge.' },
  { icon: Trophy, title: 'Compete for prizes', text: 'Top the global Champion leaderboard to win prizes through pure skill.' },
];

export default function FreeWorldLanding() {
  // Warm the heavy Free World map chunk while the user reads the landing page
  // so tapping "Play" opens the map instantly.
  useEffect(() => {
    import('../world/PrizeLeagueWorld');
  }, []);

  useSeo({
    title: 'Free Skill Games & Prize Competitions UK | Free World \u2013 Prize League',
    description:
      'Join Free World on Prize League \u2014 free skill games in the UK. Progress through skill-based levels, reach Champion challenges and compete for prizes. Free to play, no purchase to progress.',
    keywords:
      'free skill games UK, free skill competitions UK, online skill games with prizes, skill-based prize competitions, free online competitions UK, play games to win prizes UK',
    canonical: URL,
    robots: 'index, follow, max-image-preview:large, max-snippet:-1',
    ogTitle: 'Free World \u2013 Play Skill Games & Compete for Prizes | Prize League',
    ogUrl: URL,
    ogImage: OG_IMAGE,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Free World', item: URL },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQS.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  });

  return (
    <div className="bg-white text-slate-900" data-testid="free-world-landing">
      <WorldAlertPopup />
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="max-w-6xl mx-auto px-5 pt-5 text-sm text-slate-500">
        <ol className="flex items-center gap-2">
          <li><Link to="/" className="hover:text-[#6C2BFF]">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li className="text-slate-800 font-semibold" aria-current="page">Free World</li>
        </ol>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 py-10 md:py-16 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#6C2BFF] bg-[#6C2BFF]/10 rounded-full px-3 py-1">
              <Sparkles className="w-3.5 h-3.5" /> Free to play
            </span>
            <h1 className="mt-4 font-display font-black text-4xl sm:text-5xl lg:text-6xl leading-tight">
              Free World <span className="text-[#6C2BFF]">–</span> Play Skill Games &amp; Compete for Prizes
            </h1>
            <p className="mt-4 text-base md:text-lg text-slate-600 max-w-xl">
              Free World is Prize League’s free skill-gaming world for UK players. Progress through
              skill-based levels, reach Champion challenges and compete for prizes — all through skill,
              with no purchase needed to play.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/world"
                data-testid="free-world-landing-play"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8B5CFF] to-[#6C2BFF] text-white font-bold px-7 py-3.5 shadow-lg hover:translate-y-[-1px] transition-transform"
              >
                Play Free World <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 font-bold px-7 py-3.5 hover:bg-slate-50 transition-colors"
              >
                How it works
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Free online competitions UK</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Skill-based, not chance</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> New level every day</li>
            </ul>
          </div>
          <div>
            <img
              src="/og-free-world.png"
              alt="Free World skill-game map with numbered levels leading to a Champion trophy – Prize League"
              width="1200"
              height="630"
              loading="eager"
              className="w-full rounded-2xl shadow-xl border border-slate-100"
            />
          </div>
        </div>
      </header>

      {/* What is Free World */}
      <section className="max-w-6xl mx-auto px-5 py-10 md:py-14">
        <h2 className="font-display font-bold text-2xl md:text-3xl">What is Free World?</h2>
        <p className="mt-4 text-slate-600 max-w-3xl">
          Free World is the free, skill-based side of Prize League. Instead of paying to enter, you play
          free skill games in the UK and climb a map of 100 Championships. Every Championship is built from
          ten skill levels and finishes with a Champion challenge, so there is always a clear next goal and a
          genuine way to compete for prizes with online skill games.
        </p>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 py-10 md:py-14">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="font-display font-bold text-2xl md:text-3xl">How Free World works</h2>
          <p className="mt-3 text-slate-600 max-w-3xl">
            A simple, repeatable loop makes these skill-based prize competitions easy to pick up and hard to
            put down.
          </p>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="w-11 h-11 rounded-xl bg-[#6C2BFF]/10 text-[#6C2BFF] grid place-items-center">
                  <s.icon className="w-5 h-5" />
                </div>
                <h3 className="mt-4 font-bold text-base">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Skill levels + Champion + Prizes */}
      <section className="max-w-6xl mx-auto px-5 py-10 md:py-14 grid md:grid-cols-3 gap-6">
        <div>
          <h2 className="font-display font-bold text-xl">Skill-based levels</h2>
          <p className="mt-3 text-sm text-slate-600">
            Each level uses the Number Sequence game — tap the numbers in order as fast and accurately as
            you can. Your score is pure skill, so better play means a better result. Level 1 is open straight
            away and the next levels unlock daily.
          </p>
        </div>
        <div>
          <h2 className="font-display font-bold text-xl">Champion progression</h2>
          <p className="mt-3 text-sm text-slate-600">
            Clear all ten levels of a Championship to unlock its Champion challenge. Finishing it advances you
            to the next Championship on the map, with past Championships kept as a completed history.
          </p>
        </div>
        <div>
          <h2 className="font-display font-bold text-xl">Prizes</h2>
          <p className="mt-3 text-sm text-slate-600">
            Champion results are ranked together on one global leaderboard by score and speed. The top
            finishers win prizes according to Prize League’s published competition rules — a real way to
            play games to win prizes in the UK through skill.
          </p>
        </div>
      </section>

      {/* How to start + eligibility */}
      <section className="bg-slate-50 py-10 md:py-14">
        <div className="max-w-6xl mx-auto px-5 grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="font-display font-bold text-2xl">How to start</h2>
            <ol className="mt-4 space-y-3 text-sm text-slate-600 list-decimal list-inside">
              <li>Open Free World — no payment required to play.</li>
              <li>Play Championship 1, Level 1 right away.</li>
              <li>Return each day as a new skill level unlocks.</li>
              <li>Reach the Champion challenge and compete for prizes.</li>
            </ol>
            <Link
              to="/world"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FFD54A] text-[#1b1440] font-bold px-7 py-3.5 hover:translate-y-[-1px] transition-transform"
            >
              Start playing Free World <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div>
            <h2 className="font-display font-bold text-2xl">Eligibility</h2>
            <p className="mt-4 text-sm text-slate-600">
              Free World is free to play and open to eligible Prize League players. Full eligibility, prize
              and participation details follow Prize League’s published rules. Please read the{' '}
              <Link to="/terms" className="text-[#6C2BFF] font-semibold hover:underline">Terms &amp; Conditions</Link>{' '}
              and <Link to="/how-it-works" className="text-[#6C2BFF] font-semibold hover:underline">How It Works</Link>{' '}
              before you play.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-5 py-12 md:py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl text-center">Free World FAQs</h2>
        <div className="mt-8 divide-y divide-slate-200">
          {FAQS.map((f, i) => (
            <div key={i} className="py-5" data-testid={`free-world-faq-${i}`}>
              <h3 className="font-bold text-base">{f.q}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.a}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/world"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8B5CFF] to-[#6C2BFF] text-white font-bold px-8 py-4 shadow-lg hover:translate-y-[-1px] transition-transform"
          >
            Enter Free World <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-4 text-sm text-slate-500">
            Explore more: <Link to="/competitions" className="text-[#6C2BFF] hover:underline">Contests</Link>{' '}
            · <Link to="/leaderboard" className="text-[#6C2BFF] hover:underline">Leaderboard</Link>{' '}
            · <Link to="/winners" className="text-[#6C2BFF] hover:underline">Winners</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
