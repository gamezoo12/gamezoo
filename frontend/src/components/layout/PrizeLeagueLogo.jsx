/**
 * Prize League — logo component.
 * Renders the crown emblem PNG and, by default, the "PRIZE LEAGUE" wordmark
 * next to it. Pass `emblemOnly` when you need just the icon (e.g. tight
 * corners, favicons, admin sidebar collapsed state).
 *
 * `size` = rendered height of the emblem in pixels; wordmark scales with it.
 */
import { BRAND } from '../../lib/brand';

export default function PrizeLeagueLogo({ size = 48, className = '', emblemOnly = false, wordmarkClassName = '' }) {
  const height = size;
  const width = Math.round(size * (BRAND.logoAspect || 1));

  const img = (
    <img
      src={BRAND.logoUrl}
      alt={BRAND.logoAlt}
      width={width}
      height={height}
      style={{ width, height }}
      className={`object-contain shrink-0 select-none ${className}`}
      loading="eager"
      decoding="async"
      data-testid="prizeleague-logo"
    />
  );

  if (emblemOnly) return img;

  // Wordmark font-size ~ 42% of emblem height keeps text visually balanced with
  // the crown while still legible on small headers. Letter-spacing widens the
  // wordmark so it reads as a premium sports/prize brand rather than default.
  const wordSize = Math.max(12, Math.round(size * 0.42));
  return (
    <span className="inline-flex items-center gap-2" data-testid="prizeleague-logo-wrap">
      {img}
      <span
        className={`font-display font-black uppercase tracking-[0.14em] leading-none whitespace-nowrap ${wordmarkClassName}`}
        style={{ fontSize: `${wordSize}px` }}
        data-testid="prizeleague-wordmark"
      >
        <span style={{ color: BRAND.gold }}>PRIZE</span>
        <span className="text-white/95 ml-1">LEAGUE</span>
      </span>
    </span>
  );
}
