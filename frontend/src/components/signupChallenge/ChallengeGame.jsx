import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { ChromaBoard, SequenceBoard } from '../games/premium/boards';

export const SWATCHES = {
  BLUE: { hex: '#0000ff', text: '#ffffff' }, RED: { hex: '#ff0000', text: '#ffffff' }, GREEN: { hex: '#00c853', text: '#071b0d' },
  ORANGE: { hex: '#ff7900', text: '#241000' }, PINK: { hex: '#ff1493', text: '#ffffff' }, WHITE: { hex: '#ffffff', text: '#111827' },
  YELLOW: { hex: '#ffff00', text: '#111827' }, BLACK: { hex: '#000000', text: '#ffffff' }, VIOLET: { hex: '#8f00ff', text: '#ffffff' },
  'LIGHT GREEN': { hex: '#7cfc00', text: '#102000' }, 'PALE YELLOW': { hex: '#fff3a3', text: '#302600' },
};
const NAMES = Object.keys(SWATCHES);
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Practice boards are generated in the browser and never reveal a real (server) board.
export function makePracticeBoard(gameId, cfg = {}) {
  if (gameId === 'number_sequence') {
    const target = cfg.target || 20;
    return { board: { numbers: shuffle(Array.from({ length: target }, (_, i) => i + 1)), target }, expected: null };
  }
  const names = NAMES.slice(0, Math.max(2, Math.min(cfg.colours || 6, NAMES.length)));
  const expected = [];
  const questions = Array.from({ length: Math.min(cfg.rounds || 10, 10) }, () => {
    const ink = pick(names); const word = pick(names.filter((n) => n !== ink)); const options = shuffle(names);
    expected.push(options.indexOf(ink));
    return { word, ink: SWATCHES[ink].hex, options };
  });
  return { board: { questions }, expected };
}

export function practiceScore(gameId, run, expected, limitMs) {
  const bonus = Math.floor(Math.max(0, limitMs - run.duration_ms) / 10);
  if (gameId === 'number_sequence') return run.taps.length * 100 + (run.finished ? bonus : 0);
  const correct = run.taps.filter((v, i) => v === expected[i]).length;
  const wrong = run.taps.length - correct;
  return Math.max(0, correct * 100 - wrong * 25) + (run.finished && correct ? bonus : 0);
}

const fmt = (ms) => `${(Math.max(0, ms) / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;

export function ChallengeGame({ gameId, board, timeLimitS, onDone, practice = false }) {
  const limitMs = timeLimitS * 1000;
  const [count, setCount] = useState(3);
  const [left, setLeft] = useState(limitMs);
  const [next, setNext] = useState(1);
  const [idx, setIdx] = useState(0);
  const run = useRef({ taps: [], tap_ms: [], t0: 0, done: false });

  const finish = useCallback((finished) => {
    const r = run.current;
    if (r.done) return;
    r.done = true;
    const duration = Math.min(limitMs, Math.round(performance.now() - r.t0));
    onDone({ taps: r.taps, tap_ms: r.tap_ms, duration_ms: finished ? duration : limitMs, finished });
  }, [limitMs, onDone]);

  useEffect(() => {
    if (count <= 0) { run.current.t0 = performance.now(); return undefined; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  useEffect(() => {
    if (count > 0) return undefined;
    const iv = setInterval(() => {
      const l = limitMs - (performance.now() - run.current.t0);
      setLeft(l);
      if (l <= 0) finish(false);
    }, 100);
    return () => clearInterval(iv);
  }, [count, limitMs, finish]);

  const stamp = (v) => { const r = run.current; r.taps.push(v); r.tap_ms.push(Math.round(performance.now() - r.t0)); };
  const tapNumber = (n) => {
    if (run.current.done || n !== next) return;
    stamp(n); setNext(n + 1);
    if (n >= board.target) finish(true);
  };
  const pickColour = (k) => {
    if (run.current.done) return;
    stamp(k); const i = idx + 1; setIdx(i);
    if (i >= board.questions.length) finish(true);
  };

  if (count > 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center" data-testid="sc-countdown">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-200/80">{practice ? 'Practice mode' : 'Real attempt'} starts in</p>
        <span key={count} className="sc-pop mt-4 text-[7rem] font-black leading-none text-amber-300 drop-shadow-[0_8px_0_rgba(0,0,0,0.35)]">{count}</span>
      </div>
    );
  }
  const urgent = left < 5000;
  const q = board.questions?.[idx];
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3" data-testid="sc-game">
      <div className="flex items-center justify-between">
        {practice && <span className="rounded-full bg-sky-400/20 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-sky-200" data-testid="sc-practice-badge">Practice mode</span>}
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-mono text-lg font-black ${urgent ? 'animate-pulse bg-rose-500 text-white' : 'bg-white/10 text-white'}`} data-testid="sc-timer">
          <Clock3 className="h-4 w-4" />{fmt(left)}
        </span>
      </div>
      {gameId === 'number_sequence'
        ? <SequenceBoard numbers={board.numbers} next={next} target={board.target} columns={board.target > 30 ? 7 : board.target > 20 ? 6 : 5} onTap={tapNumber} />
        : q && <ChromaBoard word={q.word} inkHex={q.ink} round={idx + 1} total={board.questions.length}
          options={q.options.map((name, k) => ({ key: k, label: name, ...(SWATCHES[name] || { hex: '#64748b', text: '#fff' }) }))} onPick={pickColour} />}
    </div>
  );
}
