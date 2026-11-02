import { useEffect, useState } from 'react';
import { Gift, Trophy, X } from 'lucide-react';

export const WelcomeBanner = () => {
  const [show, setShow] = useState(() => localStorage.getItem('pl_welcome_pending') === '1');
  useEffect(() => { localStorage.removeItem('pl_welcome_pending'); }, []);
  if (!show) return null;
  return (
    <div className="fixed inset-x-3 top-24 z-50 mx-auto max-w-lg rounded-2xl border border-white/15 bg-[#14082e]/95 p-5 text-white shadow-2xl backdrop-blur-md" data-testid="welcome-banner">
      <button type="button" onClick={() => setShow(false)} aria-label="Close" className="absolute right-3 top-3 text-white/60 hover:text-white" data-testid="welcome-banner-close"><X className="h-5 w-5" /></button>
      <h3 className="font-display text-xl font-extrabold">Welcome to Prize League!</h3>
      <p className="mt-1 text-sm text-white/70">Pick a world to start playing:</p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex gap-3"><Gift className="h-5 w-5 shrink-0 text-emerald-300" /><span><b>Free World</b> — play map levels for free and climb the leaderboards for prizes.</span></div>
        <div className="flex gap-3"><Trophy className="h-5 w-5 shrink-0 text-[#FFD54A]" /><span><b>Paid World</b> — enter paid leagues with tickets for bigger prize pools.</span></div>
      </div>
      <button type="button" onClick={() => setShow(false)} className="mt-4 w-full rounded-xl bg-[#FFD54A] py-2.5 font-extrabold text-slate-900 hover:brightness-105" data-testid="welcome-banner-got-it">Got it</button>
    </div>
  );
};
