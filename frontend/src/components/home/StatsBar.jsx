import { SITE_STATS } from '../../mock/mockData';
import { Trophy, BadgePoundSterling, Users, Sparkles, Coins } from 'lucide-react';

const iconMap = { Trophy, BadgePoundSterling, Users, Sparkles, Coins };

export default function StatsBar() {
  return (
    <section className="py-10 border-y border-slate-100 bg-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-6">
        {SITE_STATS.map((s, idx) => {
          const Icon = iconMap[s.icon] || Sparkles;
          return (
            <div key={idx} className="text-center group">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-50 to-rose-50 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Icon className="w-5 h-5 text-orange-600" />
              </div>
              <div className="font-display font-extrabold text-2xl text-slate-900">{s.value}</div>
              <div className="text-xs text-slate-500 mt-1">{s.label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
