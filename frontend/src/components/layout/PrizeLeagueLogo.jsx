/**
 * Prize League — logo component.
 * Uses the official uploaded PNG (crown/£/P). Central config in lib/brand.js.
 * Prop `stacked` = true renders "PRIZE / LEAGUE" wordmark beside the icon.
 */
import { BRAND } from '../../lib/brand';

export default function PrizeLeagueLogo({ stacked = true, size = 44, showText = true, invert = false }) {
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <img
        src={BRAND.logoUrl}
        alt={BRAND.logoAlt}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="object-contain shrink-0 drop-shadow-[0_0_12px_rgba(255,213,74,0.35)]"
        loading="eager"
        decoding="async"
      />
      {showText && (
        stacked ? (
          <div className="leading-[0.95]">
            <div className={`font-display font-extrabold text-lg tracking-wider ${invert ? 'text-slate-900' : 'text-white'}`}>PRIZE</div>
            <div className="font-display font-extrabold text-lg tracking-wider pl-gold-text">LEAGUE</div>
          </div>
        ) : (
          <div className={`font-display font-extrabold text-xl tracking-wide ${invert ? 'text-slate-900' : 'text-white'}`}>
            PRIZE<span className="pl-gold-text ml-1">LEAGUE</span>
          </div>
        )
      )}
    </div>
  );
}
