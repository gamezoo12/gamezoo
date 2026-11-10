import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, X } from 'lucide-react';
import { SantaFigure } from './SantaAvatar';
import { SONG_NAMES, isSantaMuted, playJingle, playSfx, santaSay, setSantaMuted } from './santaJingle';

export const DANCES = ['twist', 'spin', 'moonwalk', 'disco', 'belly', 'wave', 'kick'];
const OPENERS = ['Ho Ho Ho', 'Ho ho, hello', 'Jingle jingle', 'Well hello there', 'Ho ho ho, look who’s here', 'Merry greetings', 'Sleigh bells ring', 'Twinkle twinkle', 'Hip hip hooray', 'Ho ho, welcome back'];
const WISHES = [
  'may your Christmas sparkle brighter than Rudolph’s nose',
  'wishing you a jolly Christmas full of wins',
  'may the New Year bring you golden trophies',
  'here’s to a cracking New Year of high scores',
  'may every level open like a present today',
  'my elves say you’re on the nice list for prizes',
  'may your stocking overflow with tokens',
  'wishing you snowflakes of luck in every game',
  'may your 2027 be merry, bright and full of champions’ glory',
  'let’s make this festive season your best season yet',
  'the reindeer are cheering for your next win',
  'may your moves be quicker than my sleigh',
  'warm cocoa, cosy wins and a happy New Year to you',
  'may the countdown to midnight be a countdown to victory',
  'joy, peace and a sack full of prizes to you',
];
const CLOSERS = ['Let’s play!', 'Go get that crown!', 'Ho ho, off you go!', 'Your next level awaits!', 'Make it magical!', 'Merry Christmas!', 'Happy New Year!', 'Have a cracking time!', 'Show them your skills!', 'Jingle all the way to the top!'];

const pick = (a) => Math.floor(Math.random() * a.length);
function uniqueWish(name) {
  const seen = JSON.parse(localStorage.getItem('pl_santa_wishes') || '[]');
  let k;
  for (let i = 0; i < 30; i += 1) { k = `${pick(OPENERS)}-${pick(WISHES)}-${pick(CLOSERS)}`; if (!seen.includes(k)) break; }
  localStorage.setItem('pl_santa_wishes', JSON.stringify([k, ...seen].slice(0, 60)));
  const [o, w, c] = k.split('-').map(Number);
  return { title: `${OPENERS[o]}, ${name}!`, body: `${WISHES[w].charAt(0).toUpperCase()}${WISHES[w].slice(1)}. ${CLOSERS[c]}` };
}
const threeDances = () => [...DANCES].sort(() => Math.random() - 0.5).slice(0, 3);

const INTRO_MS = 10000;
// Full-screen Santa show when the map opens: random dances, song and a unique wish, then he flies to his spot.
export default function SantaIntro({ name, onDone }) {
  const [wish] = useState(() => uniqueWish(name || 'friend'));
  const [dances] = useState(threeDances);
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(null);
  const [muted, setMuted] = useState(isSantaMuted);
  const figure = useRef(null);
  const finished = useRef(false);
  const leave = () => {
    if (finished.current) return;
    finished.current = true;
    const target = document.querySelector('[data-testid="free-world-avatar"]')?.getBoundingClientRect();
    const me = figure.current?.getBoundingClientRect();
    playSfx('whoosh');
    if (target && me) setLeaving({ x: target.left + target.width / 2 - (me.left + me.width / 2), y: target.top + target.height / 2 - (me.top + me.height / 2), s: Math.max(0.15, target.height / me.height) });
    else setLeaving({ x: 0, y: 400, s: 0.2 });
    setTimeout(onDone, 1100);
  };
  useEffect(() => {
    playJingle(INTRO_MS / 1000, SONG_NAMES[pick(SONG_NAMES)]);
    const v = setTimeout(() => santaSay(`${wish.title} ${wish.body}`), 600);
    const a = setTimeout(() => { setStep(1); playSfx('magic'); }, INTRO_MS / 3);
    const b = setTimeout(() => { setStep(2); playSfx('pop'); }, (INTRO_MS * 2) / 3);
    const c = setTimeout(leave, INTRO_MS);
    return () => [v, a, b, c].forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMute = () => { const m = !muted; setMuted(m); setSantaMuted(m); if (!m) playJingle(4); };
  return createPortal(
    <div className={`pl-santa-intro ${leaving ? 'is-leaving' : ''}`} data-testid="santa-intro">
      <div className="pl-santa-intro-sky">{Array.from({ length: 16 }, (_, i) => <span key={i} className="pl-firework" style={{ left: `${(i * 23) % 92 + 4}%`, top: `${(i * 31) % 55 + 4}%`, animationDelay: `${(i * 0.6) % 6}s`, '--fw': ['#facc15', '#f472b6', '#38bdf8', '#a3e635', '#fb7185', '#c084fc'][i % 6] }} />)}
        {Array.from({ length: 70 }, (_, i) => <span key={`s${i}`} className="pl-snow" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 29) % 100}%`, animationDelay: `${-((i * 1.3) % 10)}s`, animationDuration: `${7 + (i % 6)}s`, width: 4 + (i % 4), height: 4 + (i % 4) }} />)}</div>
      <div className="pl-santa-intro-controls">
        <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} data-testid="santa-intro-mute">{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <button type="button" onClick={leave} aria-label="Skip" data-testid="santa-intro-skip"><X size={18} /></button>
      </div>
      <div className="pl-santa-intro-card" data-testid="santa-intro-wish">
        <strong>{wish.title}</strong>
        <p>{wish.body}</p>
      </div>
      <div ref={figure} className={`pl-santa-intro-figure pl-santa is-dance pl-dance-${dances[step]}`} data-dance={dances[step]} data-testid="santa-intro-figure"
        style={leaving ? { transform: `translate(${leaving.x}px, ${leaving.y}px) scale(${leaving.s})` } : undefined}>
        <span className="pl-santa-crackers">{Array.from({ length: 6 }, (_, i) => <span key={`${step}-${i}`} className="pl-santa-cracker" style={{ '--a': `${i * 60}deg`, '--c': ['#facc15', '#f43f5e', '#22d3ee', '#a3e635', '#f472b6', '#fb923c'][i], animationDelay: `${(i % 3) * 0.4}s` }} />)}</span>
        <SantaFigure />
      </div>
    </div>,
    document.body,
  );
}
