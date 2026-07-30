/**
 * Prize League — logo component.
 * Renders the official PNG (trophy + "PRIZE LEAGUE" wordmark baked-in).
 * The `size` prop controls the RENDERED HEIGHT in pixels; width is computed
 * from the shipped asset's aspect ratio so nothing squashes or stretches.
 */
import { BRAND } from '../../lib/brand';

export default function PrizeLeagueLogo({ size = 48, className = '' }) {
  // The logo asset already contains the "PRIZE LEAGUE" wordmark, so we render
  // it as one horizontal image at the exact aspect ratio of the source PNG.
  const height = size;
  const width = Math.round(size * (BRAND.logoAspect || 2.1));
  return (
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
}
