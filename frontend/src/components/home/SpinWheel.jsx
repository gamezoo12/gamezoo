import { Button } from '../ui/button';
import { useState } from 'react';
import { useToast } from '../../hooks/use-toast';

const SEGMENTS = ['#14B8A6', '#F97316', '#FBBF24', '#A855F7', '#EF4444', '#3B82F6', '#22C55E', '#EC4899'];

export default function SpinWheel() {
  const { toast } = useToast();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    const rand = 360 * 6 + Math.floor(Math.random() * 360);
    setRotation((r) => r + rand);
    setTimeout(() => {
      setSpinning(false);
      toast({ title: 'Nice spin!', description: 'Sign up to unlock 10 free spins.' });
    }, 3800);
  };

  return (
    <section className="py-16 bg-gradient-to-r from-teal-600 to-emerald-600 text-white relative overflow-hidden">
      <div className="confetti absolute inset-0 opacity-20" />
      <div className="max-w-7xl mx-auto px-4 lg:px-8 grid lg:grid-cols-2 gap-10 items-center relative">
        <div>
          <div className="inline-block px-3 py-1 rounded-full bg-white/15 text-white text-xs font-semibold backdrop-blur mb-4">FOR NEW PLAYERS ONLY</div>
          <h2 className="font-display text-4xl md:text-5xl font-extrabold leading-tight">Sign Up & Get <span className="text-amber-300">10 Free Spins!</span></h2>
          <p className="mt-4 text-white/85 text-lg max-w-xl">Our famous colour wheel draw is now online too! Sign up for a chance to win tax free cash, site credit, prizes and more.</p>
          <div className="mt-6 flex gap-3">
            <Button size="lg" onClick={spin} disabled={spinning} className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold shadow-lg">
              {spinning ? 'Spinning…' : 'Try a Spin'}
            </Button>
            <Button size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">Sign Up Free</Button>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="relative w-72 h-72 md:w-80 md:h-80">
            <div className="absolute -inset-3 rounded-full bg-white/10 blur-2xl" />
            <svg viewBox="0 0 200 200" className="relative w-full h-full drop-shadow-2xl" style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 3.6s cubic-bezier(0.2, 0.9, 0.25, 1)' }}>
              {SEGMENTS.map((color, i) => {
                const a = (i * 360) / SEGMENTS.length;
                const b = ((i + 1) * 360) / SEGMENTS.length;
                const rad = (deg) => (deg - 90) * (Math.PI / 180);
                const x1 = 100 + 100 * Math.cos(rad(a));
                const y1 = 100 + 100 * Math.sin(rad(a));
                const x2 = 100 + 100 * Math.cos(rad(b));
                const y2 = 100 + 100 * Math.sin(rad(b));
                return <path key={i} d={`M100,100 L${x1},${y1} A100,100 0 0,1 ${x2},${y2} Z`} fill={color} stroke="#fff" strokeWidth="1" />;
              })}
              <circle cx="100" cy="100" r="18" fill="#fff" />
            </svg>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-white drop-shadow-lg" />
          </div>
        </div>
      </div>
    </section>
  );
}
