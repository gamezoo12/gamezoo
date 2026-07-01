import { HOW_IT_WORKS } from '../../mock/mockData';
import { Ticket, ShoppingBag, CreditCard, Trophy } from 'lucide-react';

const icons = [Ticket, ShoppingBag, CreditCard, Trophy];

export default function HowItWorks() {
  return (
    <section className="py-16 bg-gradient-to-b from-white to-teal-50/50">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-xs uppercase font-semibold text-teal-600 tracking-wider">Simple 4-step process</span>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-slate-900 mt-2">How it works</h2>
        </div>
        <div className="grid md:grid-cols-4 gap-6">
          {HOW_IT_WORKS.map((s, i) => {
            const Icon = icons[i];
            return (
              <div key={s.step} className="relative bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-lg transition-shadow">
                <div className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white font-display font-bold flex items-center justify-center shadow-lg shadow-orange-500/30">
                  {s.step}
                </div>
                <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-display font-bold text-lg text-slate-900">{s.title}</h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
