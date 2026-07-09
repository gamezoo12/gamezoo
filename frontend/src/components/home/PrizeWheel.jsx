import { useState } from 'react';
import { Sparkles } from 'lucide-react';

const PRIZES = [
  { label: '£100',  color: '#f97316', text: '#fff' },
  { label: '£250',  color: '#8b5cf6', text: '#fff' },
  { label: '£500',  color: '#22d3ee', text: '#0f172a' },
  { label: '£50',   color: '#ec4899', text: '#fff' },
  { label: 'Cash!', color: '#f59e0b', text: '#0f172a' },
  { label: '£1000', color: '#10b981', text: '#fff' },
  { label: 'FREE',  color: '#ef4444', text: '#fff' },
  { label: '£25',   color: '#3b82f6', text: '#fff' },
];

// Utility: polar → cartesian for SVG arcs
const polar = (cx, cy, r, deg) => {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const slicePath = (cx, cy, r, startDeg, endDeg) => {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} Z`;
};

export default function PrizeWheel() {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);

  const N = PRIZES.length;
  const sliceAngle = 360 / N;
  const size = 288;
  const r = 140;
  const cx = size / 2;
  const cy = size / 2;

  const spin = () => {
    if (spinning) return;
    setResult(null);
    setSpinning(true);
    const pick = Math.floor(Math.random() * N);
    // Rotate so slice `pick` ends under the pointer (at 12 o'clock)
    const target = 360 * (5 + Math.floor(Math.random() * 4)) - (pick * sliceAngle) - sliceAngle / 2;
    setRotation((prev) => prev + target);
    setTimeout(() => {
      setSpinning(false);
      setResult(PRIZES[pick]);
    }, 4200);
  };

  return (
    <div className="relative flex flex-col items-center" data-testid="prize-wheel">
      <div className="relative">
        {/* Pointer */}
        <div className="absolute top-[-12px] left-1/2 -translate-x-1/2 z-20">
          <div className="w-0 h-0 border-l-[14px] border-r-[14px] border-t-[26px] border-l-transparent border-r-transparent border-t-rose-500 drop-shadow-lg" />
        </div>

        {/* Wheel (SVG) */}
        <div
          className="rounded-full shadow-2xl shadow-fuchsia-500/40 overflow-hidden bg-white p-2"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.16, 0.99)' : 'none',
          }}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
            {PRIZES.map((p, i) => {
              const startDeg = i * sliceAngle;
              const endDeg = (i + 1) * sliceAngle;
              const midDeg = startDeg + sliceAngle / 2;
              const textPos = polar(cx, cy, r * 0.65, midDeg);
              return (
                <g key={p.label + i}>
                  <path d={slicePath(cx, cy, r, startDeg, endDeg)} fill={p.color} stroke="#fff" strokeWidth="2" />
                  <text
                    x={textPos.x}
                    y={textPos.y}
                    fill={p.text}
                    fontSize="20"
                    fontWeight="900"
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${midDeg} ${textPos.x} ${textPos.y})`}
                    style={{ fontFamily: 'inherit' }}
                  >
                    {p.label}
                  </text>
                </g>
              );
            })}
            {/* Outer ring */}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fff" strokeWidth="4" />
          </svg>
        </div>

        {/* Centre knob */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white to-slate-200 shadow-inner border-4 border-white flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-orange-500" />
          </div>
        </div>
      </div>

      <button
        onClick={spin}
        disabled={spinning}
        data-testid="wheel-spin-btn"
        className="mt-5 px-6 py-2.5 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-500 hover:from-orange-600 hover:via-rose-600 hover:to-fuchsia-600 text-white font-bold shadow-xl shadow-fuchsia-500/40 disabled:opacity-70"
      >
        {spinning ? 'Spinning…' : (result ? 'Spin again' : 'Spin to reveal a prize')}
      </button>

      {result && !spinning && (
        <div className="mt-3 px-4 py-2 rounded-xl bg-white/95 backdrop-blur border border-white/60 text-slate-900 font-semibold shadow-lg">
          🎉 You landed on <span className="text-orange-600">{result.label}</span> — check out live contests!
        </div>
      )}
    </div>
  );
}
