/**
 * perfPolicy — device-tier detection + per-tier rendering policy.
 *
 * Called once at Canvas creation and cached. Anything that consults it later
 * reads a plain object so we can pass it into Suspense'd children safely.
 *
 * Tiers:
 *   mobile   → phones (viewport width < 640)
 *   tablet   → tablets (640..1023)
 *   desktop  → 1024+
 *
 * Fields:
 *   tier                 → 'mobile' | 'tablet' | 'desktop'
 *   dpr                  → [min, max] for Canvas dpr
 *   shadows              → boolean or 'basic'
 *   shadowMapSize        → int (per-directional light shadow map size)
 *   particleDensity      → 0..1 multiplier for particle counts
 *   vegetationDensity    → 0..1 multiplier for grass / flower instance counts
 *   maxActiveChunks      → how many world chunks may render simultaneously
 *
 * Deliberately NO React deps so it can be imported from Scene AND from
 * plain JS asset helpers.
 */
export function detectTier() {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

const POLICY = {
  mobile: {
    tier: 'mobile',
    dpr: [1, 1.5],
    shadows: true,
    shadowMapSize: 512,
    particleDensity: 0.4,
    vegetationDensity: 0.55,
    maxActiveChunks: 2,
    toneMappingExposure: 1.02,
  },
  tablet: {
    tier: 'tablet',
    dpr: [1, 1.75],
    shadows: true,
    shadowMapSize: 1024,
    particleDensity: 0.65,
    vegetationDensity: 0.75,
    maxActiveChunks: 2,
    toneMappingExposure: 1.05,
  },
  desktop: {
    tier: 'desktop',
    dpr: [1, 2],
    shadows: true,
    shadowMapSize: 1536,
    particleDensity: 1.0,
    vegetationDensity: 1.0,
    maxActiveChunks: 3,
    toneMappingExposure: 1.08,
  },
};

export function getPerfPolicy() {
  return POLICY[detectTier()];
}
