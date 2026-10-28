import React, { useRef, useState } from 'react';

// These games are standalone practice components. Never treat their client results
// as verified competitive scores, prize eligibility or wallet transactions.
const LEVELS = { beginner: 3, easy: 4, medium: 5, hard: 6, expert: 7 };
const colors = ['#fb7185','#38bdf8','#facc15','#a78bfa','#34d399','#fb923c','#e879f9'];
const button = 'rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-300';
const mix = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function Frame({ title, description, moves, status, reset, children }) {
  return <section className="max-w-xl mx-auto rounded-3xl bg-slate-950 text-white p-5 shadow-xl">
    <div className="flex justify-between gap-3 items-start"><div><h2 className="text-2xl font-black">{title}</h2><p className="text-slate-300 text-sm mt-1">{description}</p></div><button type="button" className={button} onClick={reset}>Restart</button></div>
    <div className="flex justify-between text-sm text-indigo-200 my-4"><span>Moves: {moves}</span><span role="status" aria-live="polite">{status}</span></div>
    {children}<p className="text-xs text-slate-400 mt-5">Practice only · No official score, leaderboard or wallet changes</p>
  </section>;
}
function makeLiquid(n) {
  // Two adjacent layers per colour, with two empty bottles.
  // This is a structured practice puzzle rather than a random unverified shuffle.
  return mix([...Array.from({length:n},(_,i)=>[i,i,(i+1)%n,(i+1)%n]),[],[]]);
}
export function LiquidSortPractice({ difficulty='easy', onComplete }) {
  const n = Math.min(7, Math.max(3, LEVELS[difficulty] || 4));
  const [bottles, setBottles] = useState(() => makeLiquid(n));
  const [from, setFrom] = useState(null), [moves, setMoves] = useState(0);
  const started = useRef(Date.now());
  const solved = bottles.every(b => !b.length || (b.length===4 && b.every(c=>c===b[0])));
  const reset = () => { setBottles(makeLiquid(n));setFrom(null);setMoves(0);started.current=Date.now(); };
  const pour = index => {
    if (solved) return;
    if (from===null) { if (bottles[index].length) setFrom(index);return; }
    if (from===index) { setFrom(null);return; }
    const source=bottles[from], target=bottles[index], colour=source[source.length-1];
    if (colour===undefined || target.length>=4 || (target.length && target[target.length-1]!==colour)) { setFrom(null);return; }
    let amount=0;
    for(let k=source.length-1;k>=0 && source[k]===colour && amount<4-target.length;k--) amount++;
    const next=bottles.map(b=>[...b]);
    for(let k=0;k<amount;k++) next[index].push(next[from].pop());
    setBottles(next);setFrom(null);setMoves(m=>m+1);
    if(next.every(b=>!b.length || (b.length===4 && b.every(c=>c===b[0])))) onComplete?.({solved:true,moves:moves+1,duration_ms:Date.now()-started.current,practice:true});
  };
  return <Frame title="Liquid Sort & Fill" description="Select a bottle, then pour matching top liquid into another bottle. Each bottle holds four layers." moves={moves} status={solved?'All colours sorted!':'Sort each colour'} reset={reset}>
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-4">{bottles.map((b,i)=><button key={i} type="button" aria-label={`Bottle ${i+1}, ${b.length} layers`} aria-pressed={from===i} onClick={()=>pour(i)} className={`h-36 rounded-b-3xl rounded-t-md border-4 flex flex-col-reverse overflow-hidden transition-transform ${from===i?'border-yellow-300 -translate-y-2':'border-white/40'}`}>{b.map((c,j)=><span key={j} className="h-1/4 w-full block" style={{background:colors[c]}}/>)}</button>)}</div>
  </Frame>;
}

const SPOTS = [
  {x:20,y:24,kind:'sun',label:'Sun'},
  {x:73,y:22,kind:'cloud',label:'Cloud'},
  {x:32,y:68,kind:'tree',label:'Tree'},
  {x:72,y:72,kind:'house',label:'House'},
  {x:52,y:48,kind:'flower',label:'Flower'},
  {x:15,y:82,kind:'rock',label:'Rock'},
  {x:88,y:48,kind:'bird',label:'Bird'}
];
function Scene({ changed, onPick, interactive }) {
  return <svg viewBox="0 0 100 100" role="img" aria-label={interactive?'Find the changed objects in the right scene':'Reference scene'} className="w-full rounded-2xl border-2 border-white/20 bg-sky-200">
    <rect y="66" width="100" height="34" fill="#6ee7b7"/>
    {SPOTS.map((s,i)=>{
      const different=changed.includes(i) && interactive;
      const fill=different?'#f43f5e':'#f59e0b';
      return <g key={i} onClick={()=>interactive && onPick(i)} style={{cursor:interactive?'pointer':'default'}}>
        <circle cx={s.x} cy={s.y} r="10" fill="transparent"/>
        {s.kind==='sun' && <circle cx={s.x} cy={s.y} r={different?5:8} fill="#fde047"/>}
        {s.kind==='cloud' && <ellipse cx={s.x} cy={s.y} rx={different?5:10} ry="5" fill="#fff"/>}
        {s.kind==='tree' && <><rect x={s.x-2} y={s.y} width="4" height="12" fill="#92400e"/><circle cx={s.x} cy={s.y-3} r="9" fill={different?'#a855f7':'#16a34a'}/></>}
        {s.kind==='house' && <><rect x={s.x-8} y={s.y-2} width="16" height="14" fill={different?'#a855f7':'#f97316'}/><path d={`M${s.x-10} ${s.y-2} L${s.x} ${s.y-12} L${s.x+10} ${s.y-2}Z`} fill="#7c2d12"/></>}
        {s.kind==='flower' && <><circle cx={s.x} cy={s.y} r="6" fill={different?'#38bdf8':'#f472b6'}/><circle cx={s.x} cy={s.y} r="2" fill="#fde047"/></>}
        {s.kind==='rock' && <ellipse cx={s.x} cy={s.y} rx={different?4:9} ry="4" fill="#64748b"/>}
        {s.kind==='bird' && <path d={`M${s.x-8} ${s.y} Q${s.x-4} ${s.y-7} ${s.x} ${s.y} Q${s.x+4} ${s.y-7} ${s.x+8} ${s.y}`} fill="none" stroke={different?'#e11d48':'#334155'} strokeWidth={different?3:1.8}/>}
        {interactive && <circle cx={s.x} cy={s.y} r="10" fill="transparent"><title>{s.label}</title></circle>}
      </g>;
    })}
  </svg>;
}
export function SpotDifferencePractice({difficulty='easy',onComplete}) {
  const count=Math.min(7,Math.max(3,LEVELS[difficulty]||4));
  const [target,setTarget]=useState(()=>mix(SPOTS.map((_,i)=>i)).slice(0,count));
  const [found,setFound]=useState([]),[misses,setMisses]=useState(0);
  const started=useRef(Date.now());
  const done=found.length===target.length;
  const reset=()=>{setTarget(mix(SPOTS.map((_,i)=>i)).slice(0,count));setFound([]);setMisses(0);started.current=Date.now();};
  const pick=i=>{
    if(done || found.includes(i))return;
    if(!target.includes(i)){setMisses(m=>m+1);return;}
    const next=[...found,i];setFound(next);
    if(next.length===target.length)onComplete?.({solved:true,accuracy:target.length/(target.length+misses),duration_ms:Date.now()-started.current,practice:true});
  };
  return <Frame title="Spot the Difference" description="Compare the scenes. Tap the objects that look different on the right." moves={found.length+misses} status={`${found.length}/${target.length} found · ${misses} misses`} reset={reset}>
    <div className="grid grid-cols-2 gap-3"><div><p className="text-center text-xs mb-2">Reference</p><Scene changed={[]} interactive={false}/></div><div><p className="text-center text-xs mb-2">Find differences</p><Scene changed={target} interactive onPick={pick}/></div></div>
    <div className="flex flex-wrap gap-2 mt-4">{SPOTS.map((s,i)=><button key={i} type="button" disabled={done||found.includes(i)} onClick={()=>pick(i)} className="text-xs px-3 py-2 rounded-full bg-white/10 disabled:bg-emerald-700" aria-label={`Check ${s.label}`}>{s.label}{found.includes(i)?' ✓':''}</button>)}</div>
    <p className="text-xs text-slate-400 mt-3">Accessible object buttons are provided below the illustrations.</p>
  </Frame>;
}

const SIZE_FOR={beginner:4,easy:5,medium:6,hard:7,expert:8};
function pairEndpoints(size) {
  // Disjoint straight horizontal paths, each with a different colour.
  const rows=Array.from({length:Math.min(4,Math.floor(size/2))},(_,i)=>i*2);
  return rows.map((row,i)=>({id:i,colour:colors[i],start:row*size,end:row*size+size-1}));
}
export function PathConnectPractice({difficulty='easy',onComplete}) {
  const size=SIZE_FOR[difficulty]||5, pairs=pairEndpoints(size);
  const [paths,setPaths]=useState({}),[active,setActive]=useState(null),[moves,setMoves]=useState(0);
  const started=useRef(Date.now());
  const done=pairs.every(p=>paths[p.id]?.at(-1)===p.end);
  const reset=()=>{setPaths({});setActive(null);setMoves(0);started.current=Date.now();};
  const click=cell=>{
    if(done)return;
    const starting=pairs.find(p=>p.start===cell);
    if(starting){setActive(starting.id);setPaths(prev=>({...prev,[starting.id]:[cell]}));return;}
    if(active===null)return;
    const pair=pairs.find(p=>p.id===active), path=paths[active]||[];
    if(!path.length || path.includes(cell))return;
    const prev=path[path.length-1], row=Math.floor(cell/size), oldRow=Math.floor(prev/size);
    if(!(Math.abs(prev-cell)===size || (row===oldRow && Math.abs(prev-cell)===1)))return;
    if(pairs.some(p=>(p.start===cell||p.end===cell)&&p.id!==active))return;
    if(Object.entries(paths).some(([id,cells])=>Number(id)!==active && cells.includes(cell)))return;
    const next={...paths,[active]:[...path,cell]};
    setPaths(next);setMoves(m=>m+1);
    if(cell===pair.end){setActive(null);if(pairs.every(p=>next[p.id]?.at(-1)===p.end))onComplete?.({solved:true,moves:moves+1,duration_ms:Date.now()-started.current,practice:true});}
  };
  return <Frame title="Path Connect" description="Tap a coloured start dot, then adjacent squares to connect it to the matching end dot. Paths cannot cross." moves={moves} status={done?'All paths connected!':`${pairs.filter(p=>paths[p.id]?.at(-1)===p.end).length}/${pairs.length} connected`} reset={reset}>
    <div className="grid gap-1 bg-indigo-950 rounded-xl p-2" style={{gridTemplateColumns:`repeat(${size}, minmax(0,1fr))`}}>{Array.from({length:size*size},(_,cell)=>{
      const endpoint=pairs.find(p=>p.start===cell||p.end===cell);
      const occupied=pairs.find(p=>paths[p.id]?.includes(cell));
      const colour=endpoint?.colour||occupied?.colour;
      return <button type="button" key={cell} onClick={()=>click(cell)} aria-label={endpoint?`Colour ${endpoint.id+1} ${endpoint.start===cell?'start':'finish'}`:`Square ${cell+1}`} className="aspect-square rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-300"><span className={endpoint?'w-3/4 h-3/4 rounded-full':'w-2/3 h-2/3 rounded-md'} style={{background:colour||'transparent',boxShadow:colour?'0 0 8px '+colour:'none'}}/></button>;
    })}</div>
    <p className="text-xs text-slate-300 mt-3">Tap any start dot to begin or restart that colour's path.</p>
  </Frame>;
}
