import React from 'react';

// Symbol index (0-15) from the server board maps to one illustration; same index always shows the same picture.
export const MEMORY_SYMBOLS = [
  { icon: '🏆', name: 'Trophy', bg: 'linear-gradient(135deg,#FFE27A,#FFB300)' },
  { icon: '🎁', name: 'Gift', bg: 'linear-gradient(135deg,#FF9AC1,#FF4D8D)' },
  { icon: '💎', name: 'Diamond', bg: 'linear-gradient(135deg,#A5F3FC,#22A6F2)' },
  { icon: '🚀', name: 'Rocket', bg: 'linear-gradient(135deg,#C4B5FD,#6C2BFF)' },
  { icon: '🎯', name: 'Target', bg: 'linear-gradient(135deg,#FCA5A5,#EF4444)' },
  { icon: '⭐', name: 'Star', bg: 'linear-gradient(135deg,#FEF08A,#F59E0B)' },
  { icon: '🍀', name: 'Clover', bg: 'linear-gradient(135deg,#BBF7D0,#16A34A)' },
  { icon: '🔥', name: 'Flame', bg: 'linear-gradient(135deg,#FED7AA,#F97316)' },
  { icon: '🎈', name: 'Balloon', bg: 'linear-gradient(135deg,#FBCFE8,#EC4899)' },
  { icon: '🦄', name: 'Unicorn', bg: 'linear-gradient(135deg,#E9D5FF,#A855F7)' },
  { icon: '🍉', name: 'Melon', bg: 'linear-gradient(135deg,#FECACA,#22C55E)' },
  { icon: '⚡', name: 'Lightning', bg: 'linear-gradient(135deg,#FDE68A,#EAB308)' },
  { icon: '🎸', name: 'Guitar', bg: 'linear-gradient(135deg,#FDBA74,#DC2626)' },
  { icon: '🌈', name: 'Rainbow', bg: 'linear-gradient(135deg,#BAE6FD,#F472B6)' },
  { icon: '🐳', name: 'Whale', bg: 'linear-gradient(135deg,#BFDBFE,#2563EB)' },
  { icon: '🍩', name: 'Donut', bg: 'linear-gradient(135deg,#FBCFE8,#B45309)' },
];

const face = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' };

export function MemoryCard({ position, symbol, flipped, matched, disabled, onClick, testId }) {
  const info = MEMORY_SYMBOLS[Number(symbol) % MEMORY_SYMBOLS.length] || MEMORY_SYMBOLS[0];
  const shown = Boolean(flipped || matched);
  return (
    <button
      type="button"
      disabled={disabled || matched}
      onClick={() => onClick?.(position)}
      aria-label={shown ? `Card ${position + 1}: ${info.name}` : `Reveal card ${position + 1}`}
      data-testid={testId ?? `memory-card-${position}`}
      data-flipped={shown ? 'true' : 'false'}
      className="relative aspect-square w-full min-h-[56px] select-none touch-manipulation focus:outline-none focus-visible:ring-4 focus-visible:ring-[#6C2BFF]/40 rounded-[14px]"
      style={{ perspective: 600 }}
    >
      <span style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transition: 'transform 450ms cubic-bezier(.4,.2,.2,1)', transform: shown ? 'rotateY(180deg)' : 'none' }}>
        <span style={{ ...face, background: 'linear-gradient(135deg,#6C2BFF,#8B5CFF 55%,#FF7A18)', boxShadow: '0 4px 10px rgba(108,43,255,.35), inset 0 0 0 3px rgba(255,255,255,.25)' }}>
          <span style={{ fontSize: 'clamp(18px,5vw,28px)', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.25))' }} aria-hidden>🏆</span>
        </span>
        <span style={{ ...face, transform: 'rotateY(180deg)', background: info.bg, boxShadow: matched ? '0 0 0 3px #10B981, 0 4px 10px rgba(16,185,129,.4)' : '0 4px 10px rgba(15,23,42,.25)', opacity: matched ? 0.85 : 1 }}>
          <span style={{ fontSize: 'clamp(26px,8vw,44px)', lineHeight: 1 }} aria-hidden>{info.icon}</span>
        </span>
      </span>
    </button>
  );
}
