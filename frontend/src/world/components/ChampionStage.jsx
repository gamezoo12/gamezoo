import { useEffect, useRef, useState } from 'react';
import { Crown, Sparkles, Trophy } from 'lucide-react';
import { pickResultQuote } from '../../lib/gameExperience';

function fanfare(kind) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const notes = kind === 'finale' ? [523.3, 659.3, 784, 1046.5, 784, 1046.5] : kind === 'tick' ? [880] : [392, 523.3, 659.3, 784];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const t = ctx.currentTime + i * (kind === 'tick' ? 0 : 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'tick' ? 0.15 : 0.5));
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.6);
  });
  setTimeout(() => ctx.close(), 2500);
}

const Rays = () => <div className="pointer-events-none absolute inset-0 animate-[spin_24s_linear_infinite] opacity-40" style={{ background: 'repeating-conic-gradient(from 0deg, rgba(255,213,74,0.25) 0deg 8deg, transparent 8deg 20deg)' }} />;

function Intro({ meta, onEnter }) {
  useEffect(() => { fanfare('intro'); }, []);
  return (
    <div className="fixed inset-0 z-[2147482500] flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#3b1d00,#0a0418_70%)] p-6 text-center" data-testid="champion-intro">
      <Rays />
      <div className="relative max-w-lg animate-[fadeIn_0.6s_ease-out]">
        <Crown className="mx-auto h-20 w-20 text-amber-300 drop-shadow-[0_0_30px_rgba(255,213,74,0.8)]" />
        <p className="mt-4 text-xs font-black uppercase tracking-[0.5em] text-amber-200/80">Grand Championship</p>
        <h1 className="mt-2 bg-gradient-to-b from-amber-100 to-amber-500 bg-clip-text text-5xl font-black text-transparent sm:text-6xl">CHAMPION LEVEL</h1>
        {meta?.name && <p className="mt-3 text-lg font-bold text-white">{meta.name}</p>}
        <p className="mx-auto mt-4 max-w-sm text-sm text-amber-50/80">You qualified through Levels 1–10. One arena, the best players, one champion. Every rule, attempt and timer works exactly as on the next screen.</p>
        <button type="button" onClick={onEnter} className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-8 py-4 text-base font-black text-[#2a1600] shadow-[0_0_40px_rgba(255,213,74,0.5)] transition-transform hover:-translate-y-1" data-testid="champion-intro-enter"><Sparkles className="h-5 w-5" />Enter the Arena</button>
      </div>
    </div>
  );
}

function CountdownFrame() {
  useEffect(() => { const id = setInterval(() => fanfare('tick'), 1000); return () => clearInterval(id); }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[2147482500]" data-testid="champion-countdown-frame">
      <div className="absolute inset-0 shadow-[inset_0_0_160px_rgba(255,190,40,0.55)]" />
      <div className="absolute inset-x-0 top-6 text-center text-sm font-black uppercase tracking-[0.5em] text-amber-300 drop-shadow">Champion Run</div>
    </div>
  );
}

function Finale({ onClose }) {
  const quote = useRef(pickResultQuote(true));
  useEffect(() => { fanfare('finale'); }, []);
  return (
    <div className="fixed inset-0 z-[2147482500] flex items-center justify-center overflow-hidden bg-[#0a0418]/90 p-6 text-center backdrop-blur" data-testid="champion-finale">
      <Rays />
      <div className="relative max-w-md">
        <Trophy className="mx-auto h-20 w-20 text-amber-300 drop-shadow-[0_0_30px_rgba(255,213,74,0.8)]" />
        <h2 className="mt-4 text-4xl font-black text-amber-200">Champion Run Complete</h2>
        <p className="mt-3 text-sm text-white/80">Your score has been submitted to the Champion leaderboard. Final positions settle when the Champion Level closes.</p>
        <p className="mt-4 text-sm italic text-amber-100/90">“{quote.current}”</p>
        <button type="button" onClick={onClose} className="mt-7 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-7 py-3 text-sm font-black text-[#2a1600]" data-testid="champion-finale-continue">See my result</button>
      </div>
    </div>
  );
}

// Champion-Only presentation layer: wraps the existing game flow without changing attempts, timers, scoring or retries.
export function ChampionStage({ active, meta, stage }) {
  const [introDone, setIntroDone] = useState(false);
  const [finaleShown, setFinaleShown] = useState(false);
  useEffect(() => { if (stage !== 'result') setFinaleShown(false); }, [stage]);
  if (!active) return null;
  if (!introDone && stage === 'instructions') return <Intro meta={meta} onEnter={() => setIntroDone(true)} />;
  if (stage === 'countdown') return <CountdownFrame />;
  if (stage === 'result' && !finaleShown) return <Finale onClose={() => setFinaleShown(true)} />;
  return null;
}
