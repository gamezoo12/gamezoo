import ReferAndEarnCard from '../components/home/ReferAndEarnCard';
import { Gift, Users, Coins } from 'lucide-react';

const HOW = [
  { Icon: Gift, title: 'Get your code', text: 'Sign in to get your unique referral code and invite link.' },
  { Icon: Users, title: 'Invite friends', text: 'Your friend enters your code during signup, tops up £10 or more in one verified payment, and enters at least one contest.' },
  { Icon: Coins, title: 'Earn 5 tokens', text: 'Once both requirements are completed, 5 referral reward tokens are automatically credited to your wallet.' },
];

export default function ReferPage() {
  return (
    <div className="bg-white">
      <section className="pl-hero-bg text-white py-16 md:py-20">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h1 className="font-display font-extrabold text-4xl md:text-6xl">
            Refer &amp; <span className="pl-gold-text">Earn</span>
          </h1>
          <p className="mt-4 text-white/75 max-w-xl mx-auto">
            Invite friends to Prize League and earn 5 tokens when an eligible referral completes the qualifying requirements.
          </p>
        </div>
      </section>

      <ReferAndEarnCard />

      <section className="pb-16 md:pb-20">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 grid md:grid-cols-3 gap-4">
          {HOW.map(({ Icon, title, text }, i) => (
            <div key={title} className="rounded-2xl border border-slate-100 p-6 bg-slate-50">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#8B5CFF] to-[#6C2BFF] flex items-center justify-center text-white mb-3">
                <Icon className="w-6 h-6" />
              </div>
              <div className="text-[10px] uppercase tracking-widest text-[#6C2BFF] font-bold">Step {i + 1}</div>
              <h3 className="mt-1 font-display font-bold text-lg text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
