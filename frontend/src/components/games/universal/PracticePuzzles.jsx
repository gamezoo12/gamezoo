import React, { useMemo, useRef, useState } from 'react';

/**
 * Isolated practice games. These components NEVER submit competitive scores or wallet changes.
 * For prize play, implement server-issued puzzles and authoritative move validation first.
 */
const LEVELS = { beginner: 3, easy: 4, medium: 5, hard: 6, expert: 7 };
export const PRACTICE_DIFFICULTIES = Object.keys(LEVELS);
const choose = n => Math.floor(Math.random() * n);
const shuffle = a => {
  const result = [...a];
  for (let i = result.length - 1; i > 0; i--) {
    const j = choose(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const btn = 'rounded-xl px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 transition disabled:opacity-40';
const panel = 'mx-auto max-w-xl rounded-3xl bg-slate-950 text-white p-5 shadow-xl';
function PracticeShell({ title, subtitle, children, onReset, moves, status }) {
  return <section className={panel}>
    <header className="flex items-start justify-between gap-3 mb-5">
      <div><h2 className="text-2xl font-black">{title}</h2><p className="text-slate-300 text-sm mt-1">{subtitle}</p></div>
      <button className={btn + ' bg-white/15'} onClick={onReset} type="button">Restart</button>
    </header>
    <div className="flex justify-between text-sm text-slate-300 mb-4"><span>Moves: {moves}</span><span role="status" aria-live="polite">{status}</span></div>
    {children}
    <p className="text-xs text-slate-400 mt-5">Practice only · No official score or wallet changes</p>
  </section>;
}

function makeBallPuzzle(colors) {
  // Construct paired, mixed stacks with two spare tubes.
  // Each colour has four balls distributed in two paired stacks; two empty tubes
  // allow the pairs to be consolidated using the normal same-colour move rule.
  const tubes = Array.from({ length: colors }, (_, i) => [i, i, (i + 1) % colors, (i + 1) % colors]);
  tubes.push([], []);
  return shuffle(tubes);
}
export function BallSortPractice({ difficulty = 'easy', onComplete }) {
  const colors = Math.min(7, Math.max(3, LEVELS[difficulty] || 4));
  const [board, setBoard] = useState(() => makeBallPuzzle(colors));
  const [selected, setSelected] = useState(null);
  const [moves, setMoves] = useState(0);
  const start = useRef(Date.now());
  const palette = ['#f97316', '#38bdf8', '#e879f9', '#34d399', '#facc15', '#fb7185', '#a78bfa'];
  const solved = board.every(t => !t.length || (t.length === 4 && t.every(v => v === t[0])));
  const reset = () => { setBoard(makeBallPuzzle(colors)); setSelected(null); setMoves(0); start.current = Date.now(); };
  const tap = index => {
    if (solved) return;
    if (selected === null) { if (board[index].length) setSelected(index); return; }
    if (selected === index) { setSelected(null); return; }
    const src = board[selected], dst = board[index];
    if (!src.length || dst.length >= 4 || (dst.length && dst[dst.length - 1] !== src[src.length - 1])) { setSelected(null); return; }
    const next = board.map(t => [...t]);
    next[index].push(next[selected].pop());
    setBoard(next); setMoves(m => m + 1); setSelected(null);
    if (next.every(t => !t.length || (t.length === 4 && t.every(v => v === t[0])))) onComplete?.({ solved: true, moves: moves + 1, duration_ms: Date.now() - start.current, practice: true });
  };
  return <PracticeShell title="Ball Sort" subtitle="Tap a tube, then a matching or empty tube. Each tube holds four balls." onReset={reset} moves={moves} status={solved ? 'Complete!' : 'Sort every colour'}>
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">{board.map((tube, i) => <button type="button" key={i} onClick={() => tap(i)} aria-label={`Tube ${i + 1}: ${tube.length} balls`} aria-pressed={selected === i} className={`rounded-b-3xl rounded-t-lg border-4 min-h-36 flex flex-col-reverse justify-start items-center gap-1 p-2 bg-white/5 ${selected === i ? 'border-yellow-300' : 'border-white/30'}`}>{tube.map((ball, j) => <span key={j} className="block rounded-full w-9 h-9 shadow-md" style={{ background: palette[ball] }}/>)}</button>)}</div>
  </PracticeShell>;
}
const neighbours = (index, size) => {
  const r = Math.floor(index / size), c = index % size;
  return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([y,x]) => y>=0 && x>=0 && y<size && x<size).map(([y,x]) => y*size+x);
};
function generateMaze(size) {
  const walls = Array.from({ length: size*size }, () => [0,1,2,3]);
  const visited = new Set([0]), stack = [0];
  while (stack.length) {
    const cell = stack[stack.length - 1];
    const available = neighbours(cell,size).filter(n => !visited.has(n));
    if (!available.length) { stack.pop(); continue; }
    const next = available[choose(available.length)], d = next-cell;
    const side = d === -size ? 0 : d === 1 ? 1 : d === size ? 2 : 3;
    walls[cell] = walls[cell].filter(x => x !== side);
    walls[next] = walls[next].filter(x => x !== (side+2)%4);
    visited.add(next); stack.push(next);
  }
  return walls;
}
export function MazeEscapePractice({ difficulty = 'easy', onComplete }) {
  const size = Math.min(11, (LEVELS[difficulty] || 4) + 2);
  const [walls, setWalls] = useState(() => generateMaze(size));
  const [pos, setPos] = useState(0), [moves, setMoves] = useState(0);
  const start = useRef(Date.now()), done = pos === size*size-1;
  const reset = () => { setWalls(generateMaze(size)); setPos(0); setMoves(0); start.current = Date.now(); };
  const move = direction => {
    if (done || walls[pos].includes(direction)) return;
    const next = pos + [-size,1,size,-1][direction];
    setPos(next); setMoves(m => m+1);
    if (next === size*size-1) onComplete?.({ solved: true, moves: moves+1, duration_ms: Date.now()-start.current, practice: true });
  };
  const wallStyle = w => ({ borderTop: w.includes(0) ? '3px solid #a5b4fc' : '3px solid transparent', borderRight: w.includes(1) ? '3px solid #a5b4fc' : '3px solid transparent', borderBottom: w.includes(2) ? '3px solid #a5b4fc' : '3px solid transparent', borderLeft: w.includes(3) ? '3px solid #a5b4fc' : '3px solid transparent' });
  return <PracticeShell title="Maze Escape" subtitle="Navigate from START to the glowing finish. Every maze has a valid path." onReset={reset} moves={moves} status={done ? 'Escaped!' : 'Find the exit'}>
    <div className="grid aspect-square w-full bg-indigo-950 rounded-lg overflow-hidden" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>{walls.map((w,i) => <div key={i} style={wallStyle(w)} className={`flex items-center justify-center text-xs sm:text-base ${i === pos ? 'bg-amber-400 text-slate-950' : i === size*size-1 ? 'bg-emerald-500 text-white' : ''}`}>{i === pos ? '●' : i === size*size-1 ? '★' : ''}</div>)}</div>
    <div className="grid grid-cols-3 gap-2 max-w-44 mx-auto mt-5">{[[null,'↑',null],['←','↓','→']].flat().map((d,i) => d ? <button type="button" key={i} className={btn+' bg-indigo-600 text-xl'} onClick={() => move(({ '↑':0,'→':1,'↓':2,'←':3 })[d])} aria-label={`Move ${d}`}>{d}</button> : <span key={i}/>)}</div>
  </PracticeShell>;
}
const discsFor = d => Math.max(3, Math.min(8, (LEVELS[d] || 4) + 1));
export function HanoiPractice({ difficulty = 'easy', onComplete }) {
  const count = discsFor(difficulty);
  const [pegs, setPegs] = useState(() => [Array.from({length:count},(_,i)=>count-i),[],[]]);
  const [selected,setSelected] = useState(null), [moves,setMoves] = useState(0);
  const start = useRef(Date.now());
  const reset = () => { setPegs([Array.from({length:count},(_,i)=>count-i),[],[]]);setSelected(null);setMoves(0);start.current=Date.now(); };
  const done = pegs[2].length === count;
  const tap = index => {
    if (done) return;
    if (selected === null) { if (pegs[index].length) setSelected(index); return; }
    if (selected === index) { setSelected(null); return; }
    const from = pegs[selected], to = pegs[index], disk = from[from.length-1];
    if (!disk || (to.length && to[to.length-1] < disk)) { setSelected(null); return; }
    const next = pegs.map(p => [...p]);next[selected].pop();next[index].push(disk);
    setPegs(next);setSelected(null);setMoves(m=>m+1);
    if (next[2].length === count) onComplete?.({solved:true,moves:moves+1,duration_ms:Date.now()-start.current,practice:true});
  };
  return <PracticeShell title="Tower of Hanoi" subtitle="Move all discs to the right pole. Never place a larger disc on a smaller disc." onReset={reset} moves={moves} status={done ? 'Solved!' : `Minimum moves: ${2**count-1}`}>
    <div className="grid grid-cols-3 gap-2">{pegs.map((peg,i)=><button type="button" key={i} onClick={()=>tap(i)} aria-label={`Pole ${i+1}, ${peg.length} discs`} aria-pressed={selected===i} className={`relative h-56 rounded-xl border-2 ${selected===i?'border-yellow-300':'border-white/20'} bg-indigo-950 flex flex-col-reverse items-center pb-2 gap-1 overflow-hidden`}><span className="absolute h-44 w-2 bg-white/20 bottom-2 left-1/2 -translate-x-1/2 rounded-full"/>{peg.map((disc,j)=><span key={j} className="relative h-5 rounded-full shadow-md" style={{width:`${24+disc*(64/count)}%`,background:`hsl(${disc*42}, 85%, 63%)`}}/>)}</button>)}</div>
  </PracticeShell>;
}
