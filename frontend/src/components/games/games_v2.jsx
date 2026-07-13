/* eslint-disable react-hooks/exhaustive-deps */
/*
  Prize League — Skill Games Vol.2 (14 new games)
  Every game rewards genuine skill (logic, math, memory, deduction, spatial reasoning).
  Contract identical to games/index.jsx:
    props: { config, onComplete }
    onComplete({ solved: bool, accuracy: 0..1, duration_ms: int })
*/
import React, { useEffect, useMemo, useRef, useState } from 'react';

const now = () => Date.now();
const shuffle = (arr) => { const a = [...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const rndInt = (min, max) => Math.floor(Math.random()*(max-min+1))+min;

/* ============================================================
   1) SUDOKU MINI — 4×4 grid, digits 1-4, unique per row/col/2×2 box
   Skill: deductive logic
   ============================================================ */
function generateSudoku4() {
  // Random valid 4x4 sudoku by permuting a base solution
  const base = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];
  const perm = shuffle([1,2,3,4]);
  const solution = base.map(row => row.map(v => perm[v-1]));
  // Hide 8 random cells for the player to fill
  const puzzle = solution.map(row => row.slice());
  const cells = shuffle(Array.from({length:16},(_,i)=>i)).slice(0,8);
  cells.forEach(idx => { puzzle[Math.floor(idx/4)][idx%4] = 0; });
  return { puzzle, solution };
}
export function SudokuMini({ onComplete }) {
  const [{ puzzle, solution }] = useState(generateSudoku4);
  const [grid, setGrid] = useState(() => puzzle.map(r=>r.slice()));
  const [start] = useState(now);
  const [wrong, setWrong] = useState(0);
  const complete = grid.every((r,i)=>r.every((v,j)=>v===solution[i][j]));
  useEffect(() => { if (complete) onComplete({ solved: true, accuracy: Math.max(0, 1 - wrong*0.15), duration_ms: now()-start }); }, [complete]);
  const set = (i,j,v) => {
    if (puzzle[i][j] !== 0) return;
    if (v !== 0 && v !== solution[i][j]) setWrong(w=>w+1);
    setGrid(g => g.map((r,ri)=>ri===i ? r.map((c,ci)=>ci===j?v:c) : r));
  };
  return (
    <div className="max-w-xs mx-auto text-center" data-testid="sudoku-mini">
      <div className="text-slate-600 text-sm mb-3">Fill each row, column & 2×2 box with 1–4.</div>
      <div className="grid grid-cols-4 gap-0.5 bg-slate-800 p-0.5 rounded-lg">
        {grid.map((row,i)=>row.map((v,j)=>{
          const fixed = puzzle[i][j]!==0;
          const correct = v!==0 && v===solution[i][j];
          const bad = v!==0 && v!==solution[i][j];
          const border = (i===1?'border-b-2 border-slate-800 ':'') + (j===1?'border-r-2 border-slate-800 ':'');
          return (
            <select key={`${i}-${j}`} value={v||''} onChange={e=>set(i,j,parseInt(e.target.value)||0)} disabled={fixed}
              data-testid={`sudoku-${i}-${j}`}
              className={`aspect-square text-lg font-bold rounded ${border} ${fixed?'bg-slate-100 text-slate-800':bad?'bg-rose-100 text-rose-700':correct?'bg-emerald-50 text-emerald-700':'bg-white text-slate-700'}`}>
              <option value="">·</option>
              <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option>
            </select>
          );
        }))}
      </div>
      <div className="text-xs text-slate-500 mt-2">Wrong entries: {wrong}</div>
    </div>
  );
}

/* ============================================================
   2) SEQUENCE PREDICT — What comes next?
   Skill: pattern recognition (arithmetic / geometric / squares / fib)
   ============================================================ */
function makeSequence() {
  const patterns = [
    () => { const a=rndInt(2,8), d=rndInt(2,7); return { seq:[a,a+d,a+2*d,a+3*d], next:a+4*d, label:'arithmetic' }; },
    () => { const a=rndInt(2,4), r=rndInt(2,3); return { seq:[a,a*r,a*r*r,a*r*r*r], next:a*Math.pow(r,4), label:'geometric' }; },
    () => { const a=rndInt(2,5); return { seq:[a*a,(a+1)**2,(a+2)**2,(a+3)**2], next:(a+4)**2, label:'squares' }; },
    () => { let x=rndInt(1,3), y=rndInt(2,4); const s=[x,y]; for(let k=0;k<3;k++){s.push(s[s.length-1]+s[s.length-2]);} return { seq:s.slice(0,4), next:s[2]+s[3], label:'Fibonacci-like' }; },
  ];
  return patterns[rndInt(0,patterns.length-1)]();
}
export function SequencePredict({ onComplete }) {
  const [q] = useState(() => Array.from({length:5}, makeSequence));
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [start] = useState(now);
  const current = q[i];
  const options = useMemo(() => shuffle([current.next, current.next+rndInt(1,5), current.next-rndInt(1,5), current.next+rndInt(6,12)]), [i]);
  const pick = (v) => {
    const ok = v === current.next;
    if (ok) setRight(r=>r+1);
    if (i+1 >= q.length) onComplete({ solved:true, accuracy:(right + (ok?1:0))/q.length, duration_ms: now()-start });
    else setI(i+1);
  };
  return (
    <div className="max-w-md mx-auto text-center" data-testid="sequence-predict">
      <div className="text-slate-600 text-sm mb-3">Question {i+1} / {q.length}</div>
      <div className="text-2xl font-display font-extrabold text-slate-900 mb-4 tracking-wider">
        {current.seq.join(' , ')} , <span className="text-orange-600">?</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map(o => (
          <button key={o} onClick={()=>pick(o)} data-testid={`seq-opt-${o}`}
            className="py-3 rounded-xl bg-slate-100 hover:bg-orange-100 font-bold text-lg text-slate-800 transition">
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   3) COUNTDOWN NUMBERS — Reach the target using 4 numbers + operators
   Skill: mental arithmetic
   ============================================================ */
function makeCountdown() {
  const nums = Array.from({length:4},()=>rndInt(1,9));
  const ops = ['+','-','*'];
  // compute target as a random sequence of 3 ops applied left to right, with a shuffle
  const sh = shuffle(nums);
  let t = sh[0];
  for (let k=1;k<sh.length;k++){ const op=ops[rndInt(0,2)]; t = op==='+'?t+sh[k]:op==='-'?t-sh[k]:t*sh[k]; }
  return { nums, target: t };
}
export function CountdownNumbers({ onComplete }) {
  const [{ nums, target }] = useState(makeCountdown);
  const [expr, setExpr] = useState('');
  const [start] = useState(now);
  const [msg, setMsg] = useState('');
  const push = (v) => setExpr(e => e + v);
  const backspace = () => setExpr(e => e.slice(0, -1));
  const evalExpr = () => {
    try {
      // Only allow digits and + - * ( ) space
      if (!/^[\d+\-*() ]+$/.test(expr)) { setMsg('Invalid chars'); return; }
      // eslint-disable-next-line no-new-func
      const r = Function(`"use strict"; return (${expr})`)();
      const solved = r === target;
      setMsg(solved ? '✅ Correct!' : `Got ${r}, need ${target}`);
      if (solved) onComplete({ solved:true, accuracy:1, duration_ms: now()-start });
    } catch { setMsg('Bad expression'); }
  };
  const giveUp = () => onComplete({ solved:false, accuracy:0, duration_ms: now()-start });
  return (
    <div className="max-w-md mx-auto text-center" data-testid="countdown-numbers">
      <div className="text-slate-600 text-sm">Reach the target using each number (any operator, any order).</div>
      <div className="mt-3 mb-3">
        <div className="text-xs uppercase text-slate-500">Target</div>
        <div className="font-display font-extrabold text-4xl text-orange-600">{target}</div>
      </div>
      <div className="flex justify-center gap-2 mb-3 flex-wrap">
        {nums.map((n,i) => <button key={i} onClick={()=>push(String(n))} className="w-12 h-12 rounded-xl bg-slate-100 font-bold text-lg hover:bg-orange-100">{n}</button>)}
      </div>
      <div className="flex justify-center gap-2 mb-3 flex-wrap">
        {['+','-','*','(',')'].map(o => <button key={o} onClick={()=>push(o)} className="w-10 h-10 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700">{o}</button>)}
        <button onClick={backspace} className="px-3 h-10 rounded-lg bg-slate-200 text-slate-700 text-sm">⌫</button>
      </div>
      <div className="p-3 rounded-xl bg-slate-900 text-white font-mono min-h-[3rem] mb-2" data-testid="countdown-expr">{expr || '…'}</div>
      <div className="flex gap-2 justify-center">
        <button onClick={evalExpr} className="px-4 py-2 rounded-lg bg-orange-500 text-white font-bold" data-testid="countdown-check">Check</button>
        <button onClick={giveUp} className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm">Give up</button>
      </div>
      {msg && <div className="text-sm mt-2 text-slate-600">{msg}</div>}
    </div>
  );
}

/* ============================================================
   4) WORD LADDER — change 1 letter each step to reach target
   Skill: vocabulary + planning
   ============================================================ */
const LADDERS = [
  ['COLD','CORD','CORE','CARE','WARE','WARM'],
  ['HEAD','HEAL','HEAT','BEAT','BEST','BEST'],
  ['STAR','STIR','SLIP','FLIP'], // will use fewer if lengths differ
  ['CAT','COT','DOT','DOG'],
  ['LOAD','LOAN','LEAN','MEAN'],
];
export function WordLadder({ onComplete }) {
  const chain = useMemo(() => LADDERS[rndInt(0, LADDERS.length-1)], []);
  const start = chain[0], end = chain[chain.length-1];
  const [step, setStep] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [t0] = useState(now);
  const current = chain[step];
  const next = chain[step+1];
  // 4 options: correct next word + 3 distractors (change 1 letter in wrong position or wrong letter)
  const options = useMemo(() => {
    if (!next) return [];
    const set = new Set([next]);
    while (set.size < 4) {
      const arr = current.split('');
      const idx = rndInt(0, arr.length-1);
      arr[idx] = String.fromCharCode(65 + rndInt(0,25));
      const w = arr.join('');
      if (w !== current && w !== next) set.add(w);
    }
    return shuffle([...set]);
  }, [step]);
  const pick = (w) => {
    if (w === next) {
      const ns = step+1;
      if (ns >= chain.length-1) onComplete({ solved:true, accuracy: Math.max(0,1-wrong*0.15), duration_ms: now()-t0 });
      else setStep(ns);
    } else {
      setWrong(x=>x+1);
    }
  };
  return (
    <div className="max-w-md mx-auto text-center" data-testid="word-ladder">
      <div className="text-slate-600 text-sm mb-2">Change one letter to reach <b className="text-orange-600">{end}</b>.</div>
      <div className="font-display font-extrabold text-3xl tracking-widest text-slate-900 mb-1">{current}</div>
      <div className="text-slate-400 text-xs mb-3">Step {step+1} / {chain.length-1}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map(o => (
          <button key={o} onClick={()=>pick(o)} data-testid={`ladder-opt-${o}`}
            className="py-3 rounded-xl bg-slate-100 hover:bg-orange-100 font-bold text-lg tracking-widest">{o}</button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   5) CHESS MATE-IN-ONE — pick the move that mates
   Skill: chess tactics
   ============================================================ */
const CHESS_PUZZLES = [
  { fen:'Back-rank mate', board:['r','.','.','.','.','r','k','.','.','.','.','.','.','p','p','p','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','R','.','.','.','K'], answer:'Rook to 8th rank', options:['Rook to 8th rank','King forward','Push a pawn','Knight to c3'] },
  { fen:'Queen delivers', board:['.','.','.','.','.','r','k','.','.','.','.','.','.','p','p','p','.','.','.','.','.','.','.','.','.','.','.','.','Q','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','P','P','P','.','.','.','.','.','.','.','.','.','.','.','K','.'], answer:'Qxg7#',options:['Qxg7#','Qh4','Qb4','Kh2'] },
  { fen:'Smothered mate setup', board:['.','.','.','.','r','.','k','r','.','.','.','.','.','p','p','.','.','.','.','.','.','.','N','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','K','.'], answer:'Nf7#', options:['Nf7#','Nc6','Nb5','Ka1'] },
];
export function ChessMate({ onComplete }) {
  const puz = useMemo(() => CHESS_PUZZLES[rndInt(0, CHESS_PUZZLES.length-1)], []);
  const [t0] = useState(now);
  const [picked, setPicked] = useState(null);
  const pick = (o) => {
    setPicked(o);
    const solved = o === puz.answer;
    setTimeout(() => onComplete({ solved, accuracy: solved?1:0, duration_ms: now()-t0 }), 500);
  };
  const glyph = { r:'♜', n:'♞', b:'♝', q:'♛', k:'♚', p:'♟', R:'♖', N:'♘', B:'♗', Q:'♕', K:'♔', P:'♙' };
  return (
    <div className="max-w-md mx-auto text-center" data-testid="chess-mate">
      <div className="text-slate-600 text-sm mb-1">White to move. Find <b>mate in one</b>.</div>
      <div className="text-xs uppercase text-slate-400 mb-3">{puz.fen}</div>
      <div className="inline-grid grid-cols-8 border-2 border-slate-800 mb-3">
        {puz.board.map((sq,i) => {
          const row=Math.floor(i/8), col=i%8;
          const dark=(row+col)%2===1;
          return <div key={i} className={`w-8 h-8 flex items-center justify-center text-2xl ${dark?'bg-amber-700':'bg-amber-100'} ${sq===sq.toUpperCase()?'text-white':'text-slate-900'}`}>{glyph[sq]||''}</div>;
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {puz.options.map(o => (
          <button key={o} onClick={()=>pick(o)} disabled={picked} data-testid={`chess-opt-${o}`}
            className={`py-2.5 rounded-xl font-bold text-sm ${picked===o ? (o===puz.answer?'bg-emerald-500 text-white':'bg-rose-500 text-white') : 'bg-slate-100 hover:bg-orange-100'}`}>{o}</button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   6) TOWER OF HANOI — 3 disks, move to right peg in min 7 moves
   Skill: recursive planning
   ============================================================ */
export function TowerOfHanoi({ onComplete }) {
  const [pegs, setPegs] = useState([[3,2,1],[],[]]);
  const [sel, setSel] = useState(null);
  const [moves, setMoves] = useState(0);
  const [t0] = useState(now);
  const click = (p) => {
    if (sel === null) {
      if (pegs[p].length === 0) return;
      setSel(p);
    } else {
      if (sel === p) { setSel(null); return; }
      const from = pegs[sel];
      const to = pegs[p];
      const top = from[from.length-1];
      if (to.length === 0 || to[to.length-1] > top) {
        const np = pegs.map(x=>x.slice());
        np[sel].pop();
        np[p].push(top);
        setPegs(np);
        setMoves(m=>m+1);
      }
      setSel(null);
    }
  };
  useEffect(() => {
    if (pegs[2].length === 3) {
      const acc = Math.min(1, 7/Math.max(moves,7));
      onComplete({ solved:true, accuracy:acc, duration_ms: now()-t0 });
    }
  }, [pegs]);
  return (
    <div className="max-w-md mx-auto text-center" data-testid="tower-hanoi">
      <div className="text-slate-600 text-sm mb-3">Move all 3 disks to the right peg. Bigger cannot sit on smaller. Moves: <b>{moves}</b> (min 7)</div>
      <div className="grid grid-cols-3 gap-3">
        {pegs.map((peg,i) => (
          <button key={i} onClick={()=>click(i)} data-testid={`hanoi-peg-${i}`}
            className={`h-48 rounded-xl border-2 border-b-8 flex flex-col-reverse items-center justify-start gap-1 pb-2 ${sel===i?'border-orange-500 bg-orange-50':'border-slate-300 bg-slate-50'}`}>
            {peg.map((d,idx) => (
              <div key={idx} style={{width:`${30+d*20}%`}} className={`h-6 rounded ${d===1?'bg-orange-400':d===2?'bg-rose-500':'bg-fuchsia-600'}`} />
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   7) LIGHTS OUT — 4×4 grid, click toggles cell + 4 neighbors; goal: all off
   Skill: parity / logic
   ============================================================ */
export function LightsOut({ onComplete }) {
  const [grid, setGrid] = useState(() => {
    // Start from all-off and apply 5-8 random clicks so it's guaranteed solvable
    const g = Array.from({length:4},()=>Array(4).fill(false));
    const clicks = rndInt(5,8);
    for (let k=0;k<clicks;k++) toggle(g, rndInt(0,3), rndInt(0,3));
    return g;
    function toggle(m,i,j){ [[0,0],[1,0],[-1,0],[0,1],[0,-1]].forEach(([di,dj])=>{ const ni=i+di,nj=j+dj; if(ni>=0&&ni<4&&nj>=0&&nj<4) m[ni][nj]=!m[ni][nj]; }); }
  });
  const [moves, setMoves] = useState(0);
  const [t0] = useState(now);
  const click = (i,j) => {
    const g = grid.map(r=>r.slice());
    [[0,0],[1,0],[-1,0],[0,1],[0,-1]].forEach(([di,dj])=>{ const ni=i+di,nj=j+dj; if(ni>=0&&ni<4&&nj>=0&&nj<4) g[ni][nj]=!g[ni][nj]; });
    setGrid(g); setMoves(m=>m+1);
  };
  useEffect(() => {
    if (grid.every(r=>r.every(c=>!c))) {
      const acc = Math.min(1, 6/Math.max(moves,6));
      onComplete({ solved:true, accuracy:acc, duration_ms: now()-t0 });
    }
  }, [grid]);
  return (
    <div className="max-w-xs mx-auto text-center" data-testid="lights-out">
      <div className="text-slate-600 text-sm mb-3">Turn every light OFF. Click toggles cell + 4 neighbors. Moves: <b>{moves}</b></div>
      <div className="inline-grid grid-cols-4 gap-1 p-2 bg-slate-800 rounded-lg">
        {grid.map((r,i)=>r.map((v,j)=>(
          <button key={`${i}-${j}`} onClick={()=>click(i,j)} data-testid={`light-${i}-${j}`}
            className={`w-12 h-12 rounded ${v?'bg-yellow-300 shadow-inner shadow-yellow-500':'bg-slate-900'} transition`} />
        )))}
      </div>
    </div>
  );
}

/* ============================================================
   8) MINESWEEPER MINI — 5×5 with 4 mines
   Skill: deduction / probability
   ============================================================ */
function makeMines(n=5, mines=4) {
  const total = n*n;
  const mineSet = new Set();
  while (mineSet.size < mines) mineSet.add(rndInt(0,total-1));
  const board = Array.from({length:n},(_,i) => Array.from({length:n}, (_,j) => {
    const idx = i*n+j;
    if (mineSet.has(idx)) return -1;
    let c = 0;
    for (let di=-1;di<=1;di++) for (let dj=-1;dj<=1;dj++){ const ni=i+di,nj=j+dj; if(ni>=0&&ni<n&&nj>=0&&nj<n&&mineSet.has(ni*n+nj)) c++; }
    return c;
  }));
  return board;
}
export function MinesweeperMini({ onComplete }) {
  const [board] = useState(() => makeMines(5,4));
  const [rev, setRev] = useState(() => Array.from({length:5},()=>Array(5).fill(false)));
  const [flags, setFlags] = useState(() => Array.from({length:5},()=>Array(5).fill(false)));
  const [dead, setDead] = useState(false);
  const [t0] = useState(now);
  useEffect(() => {
    const safeRevealed = board.every((r,i)=>r.every((v,j)=> v===-1 || rev[i][j]));
    if (safeRevealed && !dead) onComplete({ solved:true, accuracy:1, duration_ms: now()-t0 });
  }, [rev, dead]);
  const click = (i,j) => {
    if (dead || rev[i][j] || flags[i][j]) return;
    if (board[i][j] === -1) { setDead(true); onComplete({ solved:false, accuracy:0, duration_ms: now()-t0 }); return; }
    // BFS flood-fill on zeros
    const next = rev.map(r=>r.slice());
    const stack = [[i,j]];
    while (stack.length) {
      const [x,y] = stack.pop();
      if (x<0||x>=5||y<0||y>=5||next[x][y]||board[x][y]===-1) continue;
      next[x][y] = true;
      if (board[x][y] === 0) for(let di=-1;di<=1;di++)for(let dj=-1;dj<=1;dj++) stack.push([x+di,y+dj]);
    }
    setRev(next);
  };
  const flag = (i,j,e) => { e.preventDefault(); if (rev[i][j]) return; setFlags(f => f.map((r,ri)=>ri===i?r.map((v,ci)=>ci===j?!v:v):r)); };
  return (
    <div className="max-w-xs mx-auto text-center" data-testid="minesweeper-mini">
      <div className="text-slate-600 text-sm mb-2">Reveal all safe cells. 4 mines hidden. Right-click to flag.</div>
      <div className="inline-grid grid-cols-5 gap-0.5 p-1 bg-slate-800 rounded">
        {board.map((row,i)=>row.map((v,j)=>{
          const r = rev[i][j], f = flags[i][j];
          return (
            <button key={`${i}-${j}`} onClick={()=>click(i,j)} onContextMenu={(e)=>flag(i,j,e)} data-testid={`mine-${i}-${j}`}
              className={`w-9 h-9 rounded text-sm font-bold ${r ? (v===-1?'bg-rose-500 text-white':'bg-slate-200 text-slate-800') : f?'bg-amber-400':'bg-slate-500 hover:bg-slate-400 text-transparent'}`}>
              {r ? (v===-1?'💣':(v||'')) : f?'🚩':'?'}
            </button>
          );
        }))}
      </div>
      {dead && <div className="text-rose-600 text-sm mt-2 font-semibold">💥 You hit a mine.</div>}
    </div>
  );
}

/* ============================================================
   9) NONOGRAM MINI — 5×5 picross with row/col hints
   Skill: logic
   ============================================================ */
function makeNonogram() {
  const sol = Array.from({length:5},()=>Array.from({length:5},()=>Math.random()<0.5?1:0));
  // Ensure not all-zero and not all-one
  if (sol.flat().every(v=>v===0)) sol[0][0]=1;
  if (sol.flat().every(v=>v===1)) sol[0][0]=0;
  const runs = (arr) => { const r=[]; let c=0; arr.forEach(v=>{ if(v){c++;} else{ if(c){r.push(c);c=0;}} }); if(c) r.push(c); return r.length?r:[0]; };
  const rowHints = sol.map(r => runs(r));
  const colHints = [0,1,2,3,4].map(c => runs(sol.map(r=>r[c])));
  return { sol, rowHints, colHints };
}
export function NonogramMini({ onComplete }) {
  const [{ sol, rowHints, colHints }] = useState(makeNonogram);
  const [grid, setGrid] = useState(() => Array.from({length:5},()=>Array(5).fill(0)));
  const [t0] = useState(now);
  const [wrong, setWrong] = useState(0);
  const complete = grid.every((r,i)=>r.every((v,j)=>v===sol[i][j]));
  useEffect(() => { if (complete) onComplete({ solved:true, accuracy: Math.max(0,1-wrong*0.1), duration_ms: now()-t0 }); }, [complete]);
  const toggle = (i,j) => {
    const v = grid[i][j];
    const next = (v+1) % 3; // 0 empty, 1 filled, 2 X-marked
    if (next===1 && sol[i][j]!==1) setWrong(w=>w+1);
    setGrid(g => g.map((r,ri)=>ri===i?r.map((c,ci)=>ci===j?next:c):r));
  };
  return (
    <div className="max-w-md mx-auto text-center" data-testid="nonogram-mini">
      <div className="text-slate-600 text-sm mb-2">Fill cells that make the row/col numbers work. Click cycles empty → fill → X.</div>
      <div className="inline-block">
        <div className="grid" style={{gridTemplateColumns:'auto repeat(5, 2.25rem)', gap:'2px'}}>
          <div />
          {colHints.map((h,i)=>(<div key={i} className="text-[10px] font-mono text-slate-600 flex flex-col justify-end h-16 pb-1">{h.map((n,k)=><span key={k}>{n}</span>)}</div>))}
          {grid.map((row,i)=>(
            <React.Fragment key={i}>
              <div className="text-[10px] font-mono text-slate-600 flex justify-end items-center pr-1 gap-1 w-14">{rowHints[i].map((n,k)=><span key={k}>{n}</span>)}</div>
              {row.map((v,j)=>(
                <button key={j} onClick={()=>toggle(i,j)} data-testid={`nono-${i}-${j}`}
                  className={`w-9 h-9 border rounded ${v===1?'bg-slate-900':v===2?'bg-slate-100 text-rose-500 font-bold':'bg-white hover:bg-slate-50'}`}>
                  {v===2?'✕':''}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   10) 2048 MINI — 3×3 grid, reach 32 tile via arrow buttons
   Skill: planning
   ============================================================ */
function slideRow(row) {
  const arr = row.filter(v=>v!==0);
  for (let i=0;i<arr.length-1;i++) if (arr[i]===arr[i+1]) { arr[i]*=2; arr[i+1]=0; }
  const merged = arr.filter(v=>v!==0);
  while (merged.length < 3) merged.push(0);
  return merged;
}
export function TwentyFortyEightMini({ onComplete }) {
  const [board, setBoard] = useState(() => {
    const g = Array.from({length:3},()=>Array(3).fill(0));
    for (let k=0;k<2;k++){ const i=rndInt(0,2), j=rndInt(0,2); if(g[i][j]) k--; else g[i][j]=2; }
    return g;
  });
  const [t0] = useState(now);
  const [done, setDone] = useState(false);
  const addRandom = (g) => {
    const empty = [];
    g.forEach((r,i)=>r.forEach((v,j)=>{ if(v===0) empty.push([i,j]); }));
    if (empty.length) { const [i,j] = empty[rndInt(0,empty.length-1)]; g[i][j] = Math.random()<0.9?2:4; }
  };
  const move = (dir) => {
    if (done) return;
    let g = board.map(r=>r.slice());
    const rotate = (m) => m[0].map((_,i)=>m.map(r=>r[i]).reverse());
    let rots = { L:0, R:2, U:1, D:3 }[dir];
    for (let k=0;k<rots;k++) g = rotate(g);
    g = g.map(r => slideRow(r));
    for (let k=0;k<(4-rots)%4;k++) g = rotate(g);
    if (JSON.stringify(g) === JSON.stringify(board)) return;
    addRandom(g);
    setBoard(g);
    const max = Math.max(...g.flat());
    if (max >= 32) { setDone(true); onComplete({ solved:true, accuracy: Math.min(1, max/64), duration_ms: now()-t0 }); }
  };
  return (
    <div className="max-w-xs mx-auto text-center" data-testid="tf2048-mini">
      <div className="text-slate-600 text-sm mb-2">Merge tiles to reach <b>32</b>. Use direction buttons.</div>
      <div className="inline-grid grid-cols-3 gap-1 bg-slate-300 p-1 rounded-lg">
        {board.map((r,i)=>r.map((v,j)=>{
          const colors = { 0:'bg-slate-200 text-transparent', 2:'bg-orange-100', 4:'bg-orange-200', 8:'bg-orange-300', 16:'bg-orange-400 text-white', 32:'bg-rose-500 text-white', 64:'bg-fuchsia-600 text-white' };
          return <div key={`${i}-${j}`} data-testid={`tf-${i}-${j}`} className={`w-16 h-16 rounded flex items-center justify-center font-display font-bold text-xl ${colors[v]||'bg-slate-800 text-white'}`}>{v||''}</div>;
        }))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 max-w-[9rem] mx-auto">
        <div /><button onClick={()=>move('U')} data-testid="tf-up" className="p-2 rounded bg-slate-800 text-white">↑</button><div />
        <button onClick={()=>move('L')} data-testid="tf-left" className="p-2 rounded bg-slate-800 text-white">←</button>
        <div className="p-2 text-xs text-slate-500 flex items-center justify-center">move</div>
        <button onClick={()=>move('R')} data-testid="tf-right" className="p-2 rounded bg-slate-800 text-white">→</button>
        <div /><button onClick={()=>move('D')} data-testid="tf-down" className="p-2 rounded bg-slate-800 text-white">↓</button><div />
      </div>
    </div>
  );
}

/* ============================================================
   11) CRYPTOGRAM — decode a short substitution cipher
   Skill: pattern recognition
   ============================================================ */
const QUOTES = [
  'SKILL WINS','PLAY AND WIN','GOOD LUCK','MIND OVER LUCK','THINK FAST','PRIZE LEAGUE','SMART WINS'
];
function makeCipher() {
  const q = QUOTES[rndInt(0,QUOTES.length-1)];
  const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const shifted = shuffle(alph.split('')).join('');
  const map = {}; alph.split('').forEach((c,i)=>{ map[c] = shifted[i]; });
  const encoded = q.split('').map(c => /[A-Z]/.test(c) ? map[c] : c).join('');
  return { plain:q, encoded, map };
}
export function Cryptogram({ onComplete }) {
  const [{ plain, encoded }] = useState(makeCipher);
  const [input, setInput] = useState('');
  const [t0] = useState(now);
  const [msg, setMsg] = useState('');
  const check = () => {
    if (input.toUpperCase().trim() === plain) {
      onComplete({ solved:true, accuracy:1, duration_ms: now()-t0 });
    } else { setMsg('Not quite — try again.'); }
  };
  return (
    <div className="max-w-md mx-auto text-center" data-testid="cryptogram">
      <div className="text-slate-600 text-sm mb-2">Each letter has been swapped for another. Decode the phrase.</div>
      <div className="p-4 bg-slate-900 text-orange-300 font-mono text-lg tracking-widest rounded-xl mb-3" data-testid="cipher-text">{encoded}</div>
      <input value={input} onChange={e=>setInput(e.target.value.toUpperCase())} data-testid="crypt-input"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-center font-mono tracking-widest uppercase" placeholder="Type decoded phrase" />
      <button onClick={check} data-testid="crypt-check" className="mt-3 px-4 py-2 rounded-lg bg-orange-500 text-white font-bold">Check</button>
      {msg && <div className="text-xs mt-2 text-rose-600">{msg}</div>}
    </div>
  );
}

/* ============================================================
   12) ANAGRAM FINDER — find 4+ valid words from 6 letters
   Skill: vocabulary
   ============================================================ */
const ANAGRAM_SETS = [
  { letters:'AERSTL', words:['TALES','LATER','SLATE','STARE','STEAL','LEAST','TEARS'] },
  { letters:'RAINED', words:['RAIN','RIDE','DARE','READ','DEAR','DINER','DRAIN'] },
  { letters:'PLANET', words:['PLAN','LEAP','TALE','LATE','PLANE','PANEL','PLATE'] },
  { letters:'STONES', words:['SET','NOTE','TONE','TENS','NEST','NOSE','STONE','NOTES','ONSET'] },
];
export function AnagramFinder({ onComplete }) {
  const set = useMemo(() => ANAGRAM_SETS[rndInt(0, ANAGRAM_SETS.length-1)], []);
  const [entry, setEntry] = useState('');
  const [found, setFound] = useState([]);
  const [t0] = useState(now);
  const target = 4;
  const submit = () => {
    const w = entry.toUpperCase().trim();
    setEntry('');
    if (!w || found.includes(w)) return;
    // Must be in valid list & only use letters from set
    if (!set.words.includes(w)) return;
    const letters = set.letters.split('');
    for (const ch of w) { const idx = letters.indexOf(ch); if (idx===-1) return; letters.splice(idx,1); }
    const nf = [...found, w];
    setFound(nf);
    if (nf.length >= target) {
      onComplete({ solved:true, accuracy: Math.min(1, nf.length/target), duration_ms: now()-t0 });
    }
  };
  return (
    <div className="max-w-md mx-auto text-center" data-testid="anagram-finder">
      <div className="text-slate-600 text-sm mb-2">Find at least <b>{target}</b> valid words using these letters.</div>
      <div className="text-3xl font-display font-extrabold tracking-widest text-slate-900 mb-3">{set.letters}</div>
      <div className="flex gap-2 justify-center mb-2">
        <input value={entry} onChange={e=>setEntry(e.target.value.toUpperCase())} onKeyDown={e=>{ if(e.key==='Enter') submit(); }} data-testid="anagram-input"
          className="px-3 py-2 border border-slate-300 rounded-lg text-center font-mono uppercase" placeholder="word…" />
        <button onClick={submit} data-testid="anagram-submit" className="px-3 py-2 bg-orange-500 text-white rounded-lg font-bold">Add</button>
      </div>
      <div className="text-xs text-slate-500">Found: {found.length}/{target} → {found.join(', ')}</div>
    </div>
  );
}

/* ============================================================
   13) MAZE SOLVER — navigate 7×7 maze to the goal
   Skill: spatial reasoning
   ============================================================ */
function makeMaze(n=7) {
  // Simple randomized DFS
  const m = Array.from({length:n},()=>Array(n).fill(1));
  const dirs = [[0,2],[2,0],[0,-2],[-2,0]];
  const walk = (x,y) => {
    m[x][y] = 0;
    shuffle(dirs).forEach(([dx,dy]) => {
      const nx=x+dx, ny=y+dy;
      if (nx>0 && ny>0 && nx<n-1 && ny<n-1 && m[nx][ny]===1) {
        m[x+dx/2][y+dy/2] = 0;
        walk(nx,ny);
      }
    });
  };
  walk(1,1);
  m[1][1] = 0; m[n-2][n-2] = 0;
  return m;
}
export function MazeSolver({ onComplete }) {
  const [maze] = useState(() => makeMaze(7));
  const [pos, setPos] = useState([1,1]);
  const [t0] = useState(now);
  const [steps, setSteps] = useState(0);
  const goal = [maze.length-2, maze.length-2];
  const move = (dx,dy) => {
    const nx = pos[0]+dx, ny = pos[1]+dy;
    if (nx<0||ny<0||nx>=maze.length||ny>=maze.length||maze[nx][ny]===1) return;
    setPos([nx,ny]); setSteps(s=>s+1);
  };
  useEffect(() => {
    if (pos[0]===goal[0] && pos[1]===goal[1]) {
      const optimal = (maze.length-2)*2; // rough diagonal-ish
      onComplete({ solved:true, accuracy: Math.min(1, optimal/Math.max(steps, optimal)), duration_ms: now()-t0 });
    }
  }, [pos]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key==='ArrowUp') move(-1,0);
      if (e.key==='ArrowDown') move(1,0);
      if (e.key==='ArrowLeft') move(0,-1);
      if (e.key==='ArrowRight') move(0,1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="max-w-md mx-auto text-center" data-testid="maze-solver">
      <div className="text-slate-600 text-sm mb-2">Navigate from 🟢 to 🏁 using arrows (buttons or keyboard). Steps: <b>{steps}</b></div>
      <div className="inline-grid gap-0" style={{gridTemplateColumns:`repeat(${maze.length}, 1.5rem)`}}>
        {maze.map((r,i)=>r.map((v,j)=>{
          const here = pos[0]===i && pos[1]===j;
          const isGoal = goal[0]===i && goal[1]===j;
          return <div key={`${i}-${j}`} className={`w-6 h-6 flex items-center justify-center text-xs ${v?'bg-slate-800':'bg-white'}`}>{here?'🟢':isGoal?'🏁':''}</div>;
        }))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 max-w-[9rem] mx-auto">
        <div /><button onClick={()=>move(-1,0)} data-testid="maze-up" className="p-2 rounded bg-slate-800 text-white">↑</button><div />
        <button onClick={()=>move(0,-1)} data-testid="maze-left" className="p-2 rounded bg-slate-800 text-white">←</button>
        <div className="p-2 text-xs text-slate-500 flex items-center justify-center">move</div>
        <button onClick={()=>move(0,1)} data-testid="maze-right" className="p-2 rounded bg-slate-800 text-white">→</button>
        <div /><button onClick={()=>move(1,0)} data-testid="maze-down" className="p-2 rounded bg-slate-800 text-white">↓</button><div />
      </div>
    </div>
  );
}

/* ============================================================
   14) SPOT PATTERN — 6 shapes shown, 5 follow a rule, tap the odd one
   Skill: abstract reasoning (Raven-style)
   ============================================================ */
function makeSpotPattern() {
  // rule types: rotation increment, size increment, count increment
  const shapes = ['●','■','▲','◆','★','◇','○','□','△'];
  const base = shapes[rndInt(0,shapes.length-1)];
  const series = Array(6).fill(base);
  const oddIndex = rndInt(0,5);
  let odd = base;
  while (odd === base) odd = shapes[rndInt(0,shapes.length-1)];
  series[oddIndex] = odd;
  return { series, oddIndex };
}
export function SpotPattern({ onComplete }) {
  const [rounds] = useState(() => Array.from({length:5}, makeSpotPattern));
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [t0] = useState(now);
  const pick = (idx) => {
    const ok = idx === rounds[i].oddIndex;
    if (ok) setRight(r=>r+1);
    if (i+1 >= rounds.length) onComplete({ solved:true, accuracy: (right+(ok?1:0))/rounds.length, duration_ms: now()-t0 });
    else setI(i+1);
  };
  return (
    <div className="max-w-md mx-auto text-center" data-testid="spot-pattern">
      <div className="text-slate-600 text-sm mb-2">Round {i+1} / {rounds.length} — tap the odd shape out.</div>
      <div className="grid grid-cols-3 gap-2">
        {rounds[i].series.map((s,idx) => (
          <button key={idx} onClick={()=>pick(idx)} data-testid={`spot-${idx}`}
            className="aspect-square rounded-2xl bg-slate-100 hover:bg-orange-100 flex items-center justify-center text-5xl">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------- Registry --------------
export const GAMES_V2 = {
  sudoku_mini: (config, onComplete) => <SudokuMini config={config} onComplete={onComplete} />,
  sequence_predict: (config, onComplete) => <SequencePredict config={config} onComplete={onComplete} />,
  countdown_numbers: (config, onComplete) => <CountdownNumbers config={config} onComplete={onComplete} />,
  word_ladder: (config, onComplete) => <WordLadder config={config} onComplete={onComplete} />,
  chess_mate_in_one: (config, onComplete) => <ChessMate config={config} onComplete={onComplete} />,
  tower_of_hanoi: (config, onComplete) => <TowerOfHanoi config={config} onComplete={onComplete} />,
  lights_out: (config, onComplete) => <LightsOut config={config} onComplete={onComplete} />,
  minesweeper_mini: (config, onComplete) => <MinesweeperMini config={config} onComplete={onComplete} />,
  nonogram_mini: (config, onComplete) => <NonogramMini config={config} onComplete={onComplete} />,
  tf2048_mini: (config, onComplete) => <TwentyFortyEightMini config={config} onComplete={onComplete} />,
  cryptogram: (config, onComplete) => <Cryptogram config={config} onComplete={onComplete} />,
  anagram_finder: (config, onComplete) => <AnagramFinder config={config} onComplete={onComplete} />,
  maze_solver: (config, onComplete) => <MazeSolver config={config} onComplete={onComplete} />,
  spot_pattern: (config, onComplete) => <SpotPattern config={config} onComplete={onComplete} />,
};
