import { useState } from 'react';
import { Anchor, Bell, Bolt, Camera, Cherry, Crown, Diamond, Feather, Flame, Gem, Gift, Heart, Key, Moon, Music, Rocket, Star, Sun, Trophy, Zap } from 'lucide-react';
import { Board3D } from './kit';

// Presentational premium boards shared by Free World (server-validated) and the client games.
const tile3d = 'rounded-xl border-b-[6px] shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0.5';
const ICONS = [Crown, Star, Heart, Diamond, Rocket, Trophy, Gem, Flame, Bolt, Moon, Sun, Music, Gift, Key, Anchor, Feather, Cherry, Camera, Bell, Zap];
const COLORS = ['#f472b6', '#facc15', '#60a5fa', '#34d399', '#fb923c', '#a78bfa', '#f87171', '#2dd4bf', '#e879f9', '#a3e635'];

const useFlash = () => {
  const [flash, setFlash] = useState(null);
  return [flash, (kind) => { setFlash(kind); setTimeout(() => setFlash(null), 380); }];
};

export function SequenceBoard({ numbers, next, target, columns = 5, onTap, disabled, level, misses }) {
  const [flash, fire] = useFlash();
  const tap = (n) => { fire(n === next ? (n >= target ? 'good' : null) : 'bad'); onTap(n); };
  const stats = [['Next', next > target ? '✓' : next], ['Progress', `${Math.min(next - 1, target)}/${target}`]];
  if (misses != null) stats.push(['Misses', misses]);
  return (
    <Board3D theme="math" title="Sequence Grid" level={level} flash={flash} stats={stats}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} data-testid="sequence-board">
        {numbers.map((n) => <button key={n} type="button" disabled={disabled || n < next} onClick={() => tap(n)} data-testid={`seq-num-${n}`}
          className={`${tile3d} aspect-square text-[clamp(0.95rem,2.4vw,1.35rem)] font-black ${n < next ? 'border-emerald-800 bg-emerald-500/40 text-white/40' : 'border-sky-800 bg-gradient-to-b from-sky-200 to-sky-400 text-sky-950'}`}>{n}</button>)}
      </div>
    </Board3D>
  );
}

// options: [{ key, label, hex, text }]
export function ChromaBoard({ word, inkHex, rule = 'ink', options, onPick, disabled, round, total, extra, flash, level }) {
  const stats = [['Round', `${round}/${total}`]];
  if (extra) stats.push(extra);
  return (
    <Board3D theme="reaction" title="Chroma Clash" level={level} flash={flash} stats={stats}>
      <p className="text-center text-xs font-black uppercase tracking-widest text-amber-200" data-testid="color-rule">Tap the {rule === 'ink' ? 'INK COLOUR' : 'WORD MEANING'}</p>
      <div className="my-5 text-center text-6xl font-black drop-shadow-[0_6px_0_rgba(0,0,0,0.4)]" style={{ color: inkHex }} data-testid="color-word">{word}</div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length <= 4 ? 2 : 3}, minmax(0, 1fr))` }}>
        {options.map((o) => <button key={o.key} type="button" disabled={disabled} onClick={() => onPick(o.key)} data-testid={`color-option-${String(o.label).toLowerCase()}`}
          className="h-14 rounded-2xl border-b-[6px] border-black/30 text-xs font-black shadow-lg transition-transform hover:-translate-y-1 disabled:opacity-60" style={{ background: o.hex, color: o.text || '#fff' }}>{o.label}</button>)}
      </div>
    </Board3D>
  );
}

export function MemoryTile({ symbol, faceUp, matched, onClick, disabled, testId }) {
  const Icon = ICONS[Number(symbol || 0) % ICONS.length];
  return (
    <button type="button" onClick={onClick} disabled={disabled || matched} className="aspect-[3/4] [perspective:600px]" data-testid={testId} data-flipped={faceUp || matched ? 'true' : 'false'} aria-label={faceUp || matched ? `Card ${symbol}` : 'Hidden card'}>
      <span className="relative block h-full w-full transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: faceUp || matched ? 'rotateY(180deg)' : 'none' }}>
        <span className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/20 bg-gradient-to-br from-violet-500 to-indigo-800 shadow-lg [backface-visibility:hidden]"><Crown className="h-1/3 w-1/3 text-amber-200/70" /></span>
        <span className={`absolute inset-0 flex items-center justify-center rounded-xl border-2 bg-white shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)] ${matched ? 'border-emerald-400 opacity-80' : 'border-amber-300'}`}><Icon className="h-1/2 w-1/2" style={{ color: COLORS[Number(symbol || 0) % COLORS.length] }} strokeWidth={2.4} /></span>
      </span>
    </button>
  );
}

export function MemoryBoard3D({ count, cols, stats, level, children, testId = 'memory-board' }) {
  const c = cols || (count <= 12 ? 4 : count <= 20 ? 5 : 6);
  return (
    <Board3D theme="memory" title="Memory Vault" level={level} stats={stats}>
      <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${c}, minmax(0, 1fr))` }} data-testid={testId}>{children}</div>
    </Board3D>
  );
}
