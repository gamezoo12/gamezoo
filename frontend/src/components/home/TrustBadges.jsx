import { ShieldCheck, Award, Brain, HeartHandshake } from 'lucide-react';

const BADGES = [
  { Icon: ShieldCheck,    title: 'Safe & Secure',      text: 'Secure payments & fair play',   tint: 'from-emerald-400 to-emerald-600' },
  { Icon: Award,          title: 'Trusted Platform',   text: 'Transparent system & fair contests', tint: 'from-[#FFD54A] to-[#F5B800]' },
  { Icon: Brain,          title: 'Skill-Based Play',   text: 'Win based on your knowledge & skills', tint: 'from-[#8B5CFF] to-[#6C2BFF]' },
  { Icon: HeartHandshake, title: 'Responsible Play',   text: 'Play responsibly. 18+ only',    tint: 'from-rose-400 to-rose-600' },
];

export default function TrustBadges() {
  return (
    <section className="py-10 md:py-12" style={{ background: '#0B0D1F' }} data-testid="trust-badges">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {BADGES.map(({ Icon, title, text, tint }) => (
          <div key={title} className="flex items-start gap-3">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tint} flex items-center justify-center shrink-0`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-white text-sm md:text-base">{title}</div>
              <div className="text-white/60 text-xs md:text-sm mt-0.5">{text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="max-w-7xl mx-auto px-4 lg:px-8 mt-6 text-center text-white/50 text-xs">
        Prize fulfilment is subject to winner verification and the applicable terms and conditions.
      </div>
    </section>
  );
}
