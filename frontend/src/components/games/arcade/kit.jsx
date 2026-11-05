import { useRef, useState } from 'react';
import { playGameSound } from '../../../lib/gameExperience';
import { difficultyOf } from '../../../lib/difficulty';

export const ARCADE_THEMES = {
  fruit: { label: 'Fruit Fiesta', from: '#5b1a3a', to: '#1f0714', accent: '#fb7185', bad: '🐛',
    items: [['🍎', 'Apple'], ['🍌', 'Banana'], ['🍇', 'Grapes'], ['🍓', 'Strawberry'], ['🍍', 'Pineapple'], ['🍉', 'Watermelon'], ['🍒', 'Cherry'], ['🥝', 'Kiwi']],
    words: ['MANGO', 'LEMON', 'PEACH', 'MELON', 'GRAPE', 'APPLE'] },
  space: { label: 'Cosmic Quest', from: '#14104a', to: '#04030f', accent: '#818cf8', bad: '☄️',
    items: [['🚀', 'Rocket'], ['🪐', 'Planet'], ['⭐', 'Star'], ['🌙', 'Moon'], ['👽', 'Alien'], ['🛸', 'UFO'], ['🌍', 'Earth'], ['☀️', 'Sun']],
    words: ['ORBIT', 'COMET', 'NOVA', 'GALAXY', 'ROCKET', 'PLANET'] },
  football: { label: 'Stadium Stars', from: '#0f3d1f', to: '#03140a', accent: '#4ade80', bad: '🟥',
    items: [['⚽', 'Ball'], ['🥅', 'Goal'], ['🏆', 'Trophy'], ['👟', 'Boot'], ['🧤', 'Gloves'], ['🎽', 'Shirt'], ['📣', 'Fans'], ['🏟️', 'Stadium']],
    words: ['GOAL', 'PENALTY', 'CORNER', 'STRIKER', 'KEEPER', 'TACKLE'] },
  ocean: { label: 'Ocean Treasure', from: '#0b3550', to: '#020e18', accent: '#38bdf8', bad: '🦈',
    items: [['🐠', 'Fish'], ['🐙', 'Octopus'], ['🐚', 'Shell'], ['🦀', 'Crab'], ['🐬', 'Dolphin'], ['🐳', 'Whale'], ['🦑', 'Squid'], ['💎', 'Pearl']],
    words: ['CORAL', 'WAVES', 'PIRATE', 'ANCHOR', 'TREASURE', 'ISLAND'] },
  party: { label: 'Party Night', from: '#4a1060', to: '#12031a', accent: '#f0abfc', bad: '💣',
    items: [['🎉', 'Popper'], ['🎈', 'Balloon'], ['🎁', 'Gift'], ['🎂', 'Cake'], ['🍕', 'Pizza'], ['🎵', 'Music'], ['🪩', 'Disco'], ['🍭', 'Candy']],
    words: ['DANCE', 'MUSIC', 'CANDY', 'PARTY', 'DISCO', 'CONFETTI'] },
  christmas: { label: 'Christmas Magic', from: '#7a0f1f', to: '#0b2b16', accent: '#fca5a5', bad: '🧊',
    items: [['🎄', 'Tree'], ['🎅', 'Santa'], ['🦌', 'Reindeer'], ['⛄', 'Snowman'], ['🔔', 'Bell'], ['🍪', 'Cookie'], ['🧦', 'Stocking'], ['🎁', 'Present']],
    words: ['SANTA', 'SNOW', 'SLEIGH', 'TINSEL', 'ELVES', 'REINDEER'] },
  halloween: { label: 'Halloween Night', from: '#4a1d05', to: '#0d0414', accent: '#fb923c', bad: '🕷️',
    items: [['🎃', 'Pumpkin'], ['👻', 'Ghost'], ['🦇', 'Bat'], ['🧙', 'Witch'], ['🍬', 'Sweet'], ['💀', 'Skull'], ['🕸️', 'Web'], ['🌕', 'Moon']],
    words: ['SPOOKY', 'GHOST', 'WITCH', 'PUMPKIN', 'MAGIC', 'COSTUME'] },
  summer: { label: 'Summer Splash', from: '#0e7490', to: '#7c2d12', accent: '#fde047', bad: '🐝',
    items: [['🏖️', 'Beach'], ['🍦', 'Ice cream'], ['🕶️', 'Sunglasses'], ['🌴', 'Palm'], ['🏄', 'Surfer'], ['🍹', 'Drink'], ['⛱️', 'Umbrella'], ['🩴', 'Flip-flops']],
    words: ['BEACH', 'SUNNY', 'WAVES', 'HOLIDAY', 'SANDY', 'SPLASH'] },
};

export const levelOf = difficultyOf;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const scale = (level, at1, at10) => Math.round(at1 + ((at10 - at1) * (level - 1)) / 9);

// Tracks timing + mistakes and reports a finished run in the shared game result shape.
export function useRun(onComplete) {
  const start = useRef(Date.now());
  const misses = useRef(0);
  const ended = useRef(false);
  const [flash, setFlash] = useState(null);
  const ping = (kind) => {
    playGameSound(kind === 'good' ? 'pop' : kind === 'bad' ? 'incorrect' : 'tap');
    if (kind === 'bad') misses.current += 1;
    setFlash(kind); setTimeout(() => setFlash(null), 300);
  };
  const finish = (total = 10) => {
    if (ended.current) return;
    ended.current = true;
    playGameSound('success');
    onComplete({ solved: true, accuracy: Math.max(0.05, Math.min(1, 1 - misses.current / Math.max(total, 1))), duration_ms: Date.now() - start.current });
  };
  return { ping, finish, flash, misses };
}

export function Stage({ theme, title, stats = [], flash, children }) {
  const t = ARCADE_THEMES[theme];
  const ring = flash === 'good' ? '0 0 0 3px #34d399, 0 0 40px rgba(52,211,153,.5)' : flash === 'bad' ? '0 0 0 3px #f43f5e, 0 0 40px rgba(244,63,94,.5)' : `0 24px 60px ${t.accent}40`;
  return (
    <div className="mx-auto w-full max-w-xl select-none" data-testid={`arcade-${theme}-stage`}>
      <div className="relative overflow-hidden rounded-[26px] p-4 text-white transition-shadow duration-300 sm:p-5" style={{ background: `radial-gradient(120% 90% at 30% 0%, ${t.from}, ${t.to})`, boxShadow: ring }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,.14), transparent 45%)' }} />
        <div className="relative mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: t.accent }}>{title} · {t.label}</div>
          <div className="flex gap-2">{stats.map(([k, v]) => <span key={k} className="rounded-lg bg-black/35 px-2.5 py-1 text-xs font-black" data-testid={`arcade-stat-${k.toLowerCase()}`}>{k}: {v}</span>)}</div>
        </div>
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

export const tile = 'flex items-center justify-center rounded-2xl border-b-4 border-black/30 bg-white/10 text-3xl shadow-lg transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 sm:text-4xl';
export const btn = 'rounded-xl border-b-4 border-black/30 px-4 py-2.5 font-black shadow-lg transition-transform active:translate-y-0.5';
