import { Link } from 'react-router-dom';
import { UserPlus, ListChecks, Ticket, HelpCircle, Timer, Trophy, Gamepad2 } from 'lucide-react';

const STEPS = [
  { n: 1, title: 'Create Account',     text: 'Sign up and complete your account details in under a minute.',       Icon: UserPlus,    hue: 'from-[#8B5CFF] to-[#6C2BFF]' },
  { n: 2, title: 'Choose a Contest',   text: 'Browse contests and pick the prize you would like to compete for.',   Icon: ListChecks,  hue: 'from-[#6C2BFF] to-[#4A15D9]' },
  { n: 3, title: 'Select Your Entries',text: 'Choose entry options and review the contest details before continuing.', Icon: Ticket,   hue: 'from-[#FFB84A] to-[#F5B800]' },
  { n: 4, title: 'Answer Skill Question', text: 'Complete the skill-based question to submit a valid entry.',       Icon: HelpCircle,  hue: 'from-[#8B5CFF] to-[#6C2BFF]' },
  { n: 5, title: 'Follow the Contest', text: 'Track entry, progress and closing info from your account.',           Icon: Timer,       hue: 'from-[#6C2BFF] to-[#4A15D9]' },
  { n: 6, title: 'Winner Verification',text: 'Winners are contacted and verified per contest rules and terms.',     Icon: Trophy,      hue: 'from-[#FFD54A] to-[#F5B800]' },
];

/**
 * Cute illustrated 6-step "How to Play" section.
 * Illustrations = premium coloured gradient tiles + oversized lucide icon (consistent, on-brand).
 */
export default function HowToPlaySection({ compact = false }) {
  return (
    <section className="py-12 md:py-20 bg-white" data-testid="how-to-play-section" id="how-to-play">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <div className="text-xs uppercase font-bold tracking-widest text-[#6C2BFF]">Getting started</div>
          <h2 className="mt-2 font-display text-3xl md:text-5xl font-extrabold text-[#0B0D1F]">
            How to Play — <span className="pl-gold-text">It&apos;s Easy!</span>
          </h2>
          <p className="mt-3 text-slate-600">Six simple steps to your next prize. No experience needed — just skill and fun.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
          {STEPS.map(({ n, title, text, Icon, hue }) => (
            <div
              key={n}
              className="group relative bg-white rounded-2xl border border-slate-100 p-4 md:p-5 hover:shadow-xl hover:border-[#6C2BFF]/20 transition-all hover:-translate-y-1"
              data-testid={`step-${n}`}
            >
              {/* Illustration tile */}
              <div className={`relative w-full aspect-square rounded-2xl bg-gradient-to-br ${hue} flex items-center justify-center overflow-hidden mb-4`}>
                <div className="absolute inset-0 opacity-30" style={{
                  backgroundImage: 'radial-gradient(#ffffff55 1px, transparent 1px)',
                  backgroundSize: '16px 16px',
                }} />
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/25 blur-xl" />
                <Icon className="relative w-12 h-12 md:w-14 md:h-14 text-white drop-shadow-lg" strokeWidth={1.75} />
              </div>

              <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[#0B0D1F] text-white text-xs font-bold flex items-center justify-center">
                {n}
              </div>

              <h3 className="font-display font-extrabold text-slate-900 text-sm md:text-base leading-tight">{title}</h3>
              <p className="mt-1 text-xs md:text-sm text-slate-500 leading-relaxed">{text}</p>
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
