import { useCallback, useState } from 'react';
import { playGameSound } from '../../../lib/gameExperience';
import { difficultyName } from '../../../lib/difficulty';

export const THEMES = {
  memory: { from: '#2b0f5e', to: '#0d0630', accent: '#c084fc', glow: 'rgba(192,132,252,0.45)' },
  target: { from: '#3a0b0b', to: '#120404', accent: '#fb7185', glow: 'rgba(251,113,133,0.45)' },
  words: { from: '#0b3a2c', to: '#04140f', accent: '#34d399', glow: 'rgba(52,211,153,0.45)' },
  math: { from: '#0b2350', to: '#040b1f', accent: '#60a5fa', glow: 'rgba(96,165,250,0.45)' },
  reaction: { from: '#3d2a05', to: '#130c01', accent: '#fbbf24', glow: 'rgba(251,191,36,0.5)' },
};

// Shared premium stage: tilted 3D board with lighting, reflections and a floor shadow.
export function Board3D({ theme, title, level, stats = [], children, flash }) {
  const t = THEMES[theme];
  const ring = flash === 'good' ? '0 0 0 3px #34d399, 0 0 50px rgba(52,211,153,0.6)' : flash === 'bad' ? '0 0 0 3px #f43f5e, 0 0 50px rgba(244,63,94,0.6)' : `0 30px 80px ${t.glow}`;
  return (
    <div className="mx-auto w-full max-w-xl select-none" style={{ perspective: '1400px' }} data-testid={`premium-${theme}-board`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: t.accent }}>{title}</div>
        {level != null && <span className="rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest" style={{ borderColor: t.accent, color: t.accent }} data-testid="game-difficulty-badge">Level {level} · {difficultyName(level)}</span>}
      </div>
      <div className="relative rounded-[28px] p-4 transition-[transform,box-shadow] duration-300 sm:p-6"
        style={{ background: `radial-gradient(120% 90% at 30% 0%, ${t.from}, ${t.to})`, transform: `rotateX(10deg) ${flash === 'bad' ? 'translateX(-4px)' : ''}`, transformStyle: 'preserve-3d', boxShadow: ring }}>
        <div className="pointer-events-none absolute inset-0 rounded-[28px]" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.16), transparent 40%)' }} />
        {stats.length > 0 && <div className="relative mb-4 flex flex-wrap justify-center gap-2">
          {stats.map(([k, v]) => <div key={k} className="rounded-xl bg-black/30 px-3 py-1.5 text-center backdrop-blur"><div className="text-[9px] font-bold uppercase tracking-widest text-white/50">{k}</div><div className="text-base font-black text-white" data-testid={`game-stat-${k.toLowerCase().replace(/\s+/g, '-')}`}>{v}</div></div>)}
        </div>}
        <div className="relative" style={{ transform: 'translateZ(30px)' }}>{children}</div>
      </div>
      <div className="mx-auto mt-2 h-6 w-4/5 rounded-[50%] blur-xl" style={{ background: t.glow }} />
    </div>
  );
}

// Correct / wrong feedback: sound + board flash.
export function useFeedback() {
  const [flash, setFlash] = useState(null);
  const fire = useCallback((kind) => {
    playGameSound(kind === 'good' ? 'success' : kind === 'bad' ? 'failure' : 'tap');
    setFlash(kind);
    setTimeout(() => setFlash(null), 380);
  }, []);
  return [flash, fire];
}
