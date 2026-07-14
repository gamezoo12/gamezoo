/**
 * Prize League — premium logo (Trophy + stylised P).
 * Pure inline SVG, no external assets. Gold metallic + dark-purple outline.
 * Prop `stacked` = true renders vertical "PRIZE / LEAGUE" text next to icon.
 */
export default function PrizeLeagueLogo({ stacked = true, size = 44, showText = true, invert = false }) {
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      {/* Icon */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Prize League"
        role="img"
      >
        <defs>
          <linearGradient id="pl_gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFE68A" />
            <stop offset="50%" stopColor="#FFD54A" />
            <stop offset="100%" stopColor="#E9A700" />
          </linearGradient>
          <linearGradient id="pl_gold_shine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {/* dark rounded plate */}
        <rect x="1.5" y="1.5" width="61" height="61" rx="14" fill="#161433" stroke="#2a1f6b" strokeWidth="1.5" />
        {/* trophy that forms the P */}
        {/* Left column (the P stem) */}
        <rect x="18" y="14" width="8" height="34" rx="3" fill="url(#pl_gold)" />
        {/* Top bowl of the P / trophy cup */}
        <path
          d="M26 14 h14 a10 10 0 0 1 10 10 v0 a10 10 0 0 1 -10 10 h-14 z"
          fill="url(#pl_gold)"
        />
        {/* Handles */}
        <path d="M14 20 a4 4 0 0 0 0 8" stroke="url(#pl_gold)" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M50 20 a4 4 0 0 1 0 8" stroke="url(#pl_gold)" strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* Base */}
        <rect x="21" y="48" width="18" height="4" rx="1" fill="url(#pl_gold)" />
        <rect x="18" y="52" width="24" height="5" rx="2" fill="url(#pl_gold)" />
        {/* Shine overlay */}
        <path d="M20 16 h4 v20 h-4 z" fill="url(#pl_gold_shine)" opacity="0.5" />
      </svg>

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
