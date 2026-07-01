import { Zap, ShieldCheck } from 'lucide-react';

export default function TrustBadges() {
  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white p-6 flex items-center gap-5 shadow-lg">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center"><Zap className="w-7 h-7" /></div>
          <div>
            <h3 className="font-display font-bold text-xl">Fast Payouts. Zero Fees.</h3>
            <p className="text-white/85 text-sm mt-1">On all withdrawals over £10.</p>
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6 flex items-center gap-5 shadow-lg">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center"><ShieldCheck className="w-7 h-7" /></div>
          <div>
            <h3 className="font-display font-bold text-xl">Stay Safe. Stay In Control.</h3>
            <p className="text-white/70 text-sm mt-1">Payment methods that keep your info secure.</p>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 lg:px-8 mt-6">
        <div className="flex flex-wrap items-center justify-center gap-6 opacity-80">
          {['VISA','MASTERCARD','APPLE PAY','GOOGLE PAY','PAYPAL'].map((p) => (
            <div key={p} className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 tracking-wider">{p}</div>
          ))}
        </div>
      </div>
    </section>
  );
}
