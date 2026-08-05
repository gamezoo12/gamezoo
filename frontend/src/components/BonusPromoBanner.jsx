/**
 * BonusPromoBanner — small marketing strip advertising the top-up bonus.
 * Config comes from GET /api/promo/topup-bonus so admins can rotate the
 * offer WITHOUT a redeploy (adjust bonus.py constants → hot restart).
 * Renders nothing while the promo is inactive OR the fetch fails silently
 * (banner is optional UX, never blocking).
 */
import { useEffect, useState } from 'react';
import { Sparkles, Coins, Timer } from 'lucide-react';
import axios from 'axios';

const BASE = process.env.REACT_APP_BACKEND_URL;

export default function BonusPromoBanner({ variant = 'default', className = '' }) {
  const [promo, setPromo] = useState(null);
  useEffect(() => {
    axios.get(`${BASE}/api/promo/topup-bonus`, { timeout: 6000 })
      .then(r => setPromo(r.data?.active ? r.data : null))
      .catch(() => setPromo(null));
  }, []);
  if (!promo) return null;

  const isCompact = variant === 'compact';
  return (
    <div
      data-testid="bonus-promo-banner"
      className={`relative overflow-hidden rounded-2xl ${isCompact ? 'p-3' : 'p-4 md:p-5'} bg-gradient-to-r from-[#FFD54A] via-[#FFC947] to-[#FF9A3C] text-slate-900 shadow-lg ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-900 text-[#FFD54A] flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-display font-extrabold ${isCompact ? 'text-sm' : 'text-base md:text-lg'}`}>{promo.headline}</div>
          <div className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-semibold opacity-80 flex items-center gap-1 mt-0.5`}>
            <Timer className="w-3 h-3" /> {promo.sub}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 bg-slate-900 text-[#FFD54A] font-extrabold rounded-full px-3 py-1 shrink-0">
          +{promo.bonus_amount_tokens}<Coins className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
