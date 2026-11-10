import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isSantaMuted, playJingle, setSantaMuted } from './santaJingle';

const SAYINGS = { win: 'Ho Ho Ho! Level done!', try: 'Ho ho! Try again!', ride: 'On, Dasher! On, Dancer!', dance: 'Ho Ho Ho! Next level!' };
const RIDE_MS = 2600;

function Reindeer({ x, delay }) {
  return (
    <g transform={`translate(${x} 0)`}><g className="pl-reindeer" style={{ animationDelay: delay }}>
      <path d="M6 30c0-6 5-9 12-9h8c4 0 7 3 7 7v3H6z" fill="#92400e" />
      <g className="pl-reindeer-legs"><rect x="9" y="30" width="3" height="10" fill="#78350f" /><rect x="15" y="30" width="3" height="10" fill="#78350f" /><rect x="24" y="30" width="3" height="10" fill="#78350f" /><rect x="29" y="30" width="3" height="10" fill="#78350f" /></g>
      <path d="M29 22l6-9c2-2 6-1 6 2l-1 6c-1 3-4 4-7 4z" fill="#a16207" />
      <path d="M34 13l-2-7m2 7l3-8m-3 2l-4-3m5 1l4-2" stroke="#fde68a" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="38" cy="15" r="1" fill="#111" />
      <circle className={x === 0 ? 'pl-rudolph-nose' : ''} cx="41.5" cy="19" r={x === 0 ? 2.4 : 1.6} fill={x === 0 ? '#ef4444' : '#3f1d0b'} />
      <path d="M12 24h18" stroke="#dc2626" strokeWidth="2.5" /><circle cx="20" cy="24" r="1.8" fill="#facc15" />
    </g></g>
  );
}

function Sleigh({ dir }) {
  return (
    <svg viewBox="0 0 170 60" className="pl-sleigh" style={{ transform: `translateX(-19%) scaleX(${dir})` }} aria-hidden="true" data-testid="santa-sleigh">
      <path d="M58 40h14M100 40h18" stroke="#fde68a" strokeWidth="1.5" strokeDasharray="3 2" />
      <Reindeer x={118} delay="0s" />
      <Reindeer x={72} delay=".15s" />
      <path d="M4 22c0-6 4-9 10-9h38c6 0 8 4 8 9v14H10c-4 0-6-2-6-6z" fill="#dc2626" stroke="#facc15" strokeWidth="2" />
      <path d="M12 18h40" stroke="#fde68a" strokeWidth="2" strokeLinecap="round" />
      <path d="M2 44h52c6 0 8-3 8-7M10 36v8M44 36v8" stroke="#facc15" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="40" y="6" width="12" height="10" rx="1.5" fill="#22c55e" /><rect x="45" y="6" width="2" height="10" fill="#facc15" />
    </svg>
  );
}

// Festive avatar: Santa rides his reindeer sleigh between levels, dances to Jingle Bells and pops magic crackers.
export default function SantaAvatar({ left, bottom }) {
  const [mode, setMode] = useState('idle');
  const [dir, setDir] = useState(1);
  const [muted, setMuted] = useState(isSantaMuted);
  const timers = useRef([]);
  const prev = useRef(null);
  const mountedAt = useRef(Date.now());
  const schedule = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clear(), []);
  useEffect(() => {
    const onCelebrate = (e) => {
      if (e.detail?.kind === 'ride') { ride(e.detail.dir || 1); return; }
      const win = e.detail?.kind === 'win';
      clear(); setMode(win ? 'win' : 'try');
      if (win) playJingle(5);
      schedule(() => setMode('idle'), win ? 5200 : 3600);
    };
    window.addEventListener('pl-santa-celebrate', onCelebrate);
    return () => window.removeEventListener('pl-santa-celebrate', onCelebrate);
  }, []);
  useEffect(() => {
    const p = prev.current;
    prev.current = { left, bottom };
    if (!p || (p.left === left && p.bottom === bottom) || Date.now() - mountedAt.current < 2000) return;
    ride(left >= p.left ? 1 : -1);
  }, [left, bottom]); // eslint-disable-line react-hooks/exhaustive-deps
  function ride(d) {
    clear(); setDir(d); setMode('ride'); playJingle(7);
    schedule(() => setMode('dance'), RIDE_MS);
    schedule(() => setMode('idle'), RIDE_MS + 4200);
  }
  const toggleMute = (e) => { e.stopPropagation(); const m = !muted; setMuted(m); setSantaMuted(m); if (!m) playJingle(3); };
  return (
    <span className={`pl-santa is-${mode}`} data-testid="santa-avatar" data-santa-mode={mode}>
      <button type="button" className="pl-santa-mute" onClick={toggleMute} aria-label={muted ? 'Unmute Santa music' : 'Mute Santa music'} data-testid="santa-mute-toggle">{muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>
      {mode === 'ride' && <Sleigh dir={dir} />}
      {mode !== 'idle' && <span className="pl-santa-say" data-testid="santa-say">{SAYINGS[mode]}</span>}
      {(mode === 'win' || mode === 'dance') && <span className="pl-santa-crackers">{Array.from({ length: 6 }, (_, i) => <span key={i} className="pl-santa-cracker" style={{ '--a': `${i * 60}deg`, '--c': ['#facc15', '#f43f5e', '#22d3ee', '#a3e635', '#f472b6', '#fb923c'][i], animationDelay: `${(i % 3) * 0.45}s` }} />)}</span>}
      {mode !== 'idle' && <span className="pl-santa-sparkles">{Array.from({ length: 14 }, (_, i) => <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.18}s`, background: ['#fde047', '#fff', '#f9a8d4', '#67e8f9'][i % 4] }} />)}</span>}
      <svg viewBox="0 0 64 92" className="pl-santa-svg" aria-hidden="true">
        <ellipse cx="32" cy="89" rx="17" ry="3" fill="rgba(0,0,0,.35)" />
        <g className="pl-santa-leg-l"><rect x="20" y="70" width="9" height="13" fill="#b91c1c" /><path d="M17 82h13v6H15c0-3 1-6 2-6z" fill="#111827" /></g>
        <g className="pl-santa-leg-r"><rect x="35" y="70" width="9" height="13" fill="#b91c1c" /><path d="M34 82h13c1 0 2 3 2 6H34z" fill="#111827" /></g>
        <g className="pl-santa-body">
          <path d="M14 48c0-10 8-16 18-16s18 6 18 16v20c0 4-4 6-8 6H22c-4 0-8-2-8-6z" fill="#dc2626" />
          <rect x="30" y="34" width="4" height="38" fill="#fff" />
          <rect x="13" y="58" width="38" height="6" rx="2" fill="#111827" />
          <rect x="27.5" y="57" width="9" height="8" rx="1.5" fill="none" stroke="#facc15" strokeWidth="2" />
          <path d="M14 68h36v4c0 3-3 4-6 4H20c-3 0-6-1-6-4z" fill="#fff" />
          <g className="pl-santa-arm-l"><path d="M16 40c-6 4-9 12-9 18" stroke="#dc2626" strokeWidth="8" strokeLinecap="round" fill="none" /><circle cx="7" cy="60" r="4.5" fill="#fff" /></g>
          <g className="pl-santa-arm-r"><path d="M48 40c6 4 9 12 9 18" stroke="#dc2626" strokeWidth="8" strokeLinecap="round" fill="none" /><circle cx="57" cy="60" r="4.5" fill="#fff" /><path className="pl-santa-wand" d="M57 60l5-14" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" /><circle className="pl-santa-wand" cx="62.5" cy="44.5" r="2.6" fill="#fde047" /></g>
          <g className="pl-santa-head">
            <circle cx="32" cy="24" r="11" fill="#fcd9b8" />
            <path d="M20 25c0 12 5 19 12 19s12-7 12-19c-3 4-7 5-12 5s-9-1-12-5z" fill="#fff" />
            <ellipse cx="27.5" cy="27" rx="4" ry="2.4" fill="#fff" /><ellipse cx="36.5" cy="27" rx="4" ry="2.4" fill="#fff" />
            <circle cx="32" cy="24.5" r="2.4" fill="#f87171" />
            <circle className="pl-santa-eye" cx="27.8" cy="21" r="1.4" fill="#1f2937" /><circle className="pl-santa-eye" cx="36.2" cy="21" r="1.4" fill="#1f2937" />
            <circle cx="24" cy="25" r="2" fill="#fca5a5" opacity=".7" /><circle cx="40" cy="25" r="2" fill="#fca5a5" opacity=".7" />
            <g className="pl-santa-hat"><path d="M20 17c1-9 7-13 13-13 7 0 11 5 15 11l-5 2c-2-3-5-6-10-6-6 0-10 3-11 7z" fill="#dc2626" /><path d="M46 13c3 2 6 6 6 10" stroke="#dc2626" strokeWidth="5" strokeLinecap="round" fill="none" /><circle cx="52" cy="24" r="3.6" fill="#fff" /><rect x="18" y="14" width="28" height="6" rx="3" fill="#fff" /></g>
          </g>
        </g>
      </svg>
    </span>
  );
}
