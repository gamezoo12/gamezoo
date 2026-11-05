import { useEffect, useRef, useState } from 'react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, sfx, themeFor, useBanter, useClocks } from './kit';
import { PartyStage } from './stage';

// Block Blast (solo): place the 3 blocks on the 8x8 board; fill a row or column to blast it. Hit the level target.
const N = 8;
const SHAPES = [[[0, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0]], [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [1, 1]], [[0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [2, 0], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]];
const JEWELS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
const HOST = { ...BOTS[3], persona: 'over-the-top cheerful game show host who hypes the player up' };
const piece = (level) => { const pool = SHAPES.slice(0, Math.min(SHAPES.length, 9 + level)); return { cells: pool[Math.floor(Math.random() * pool.length)], color: JEWELS[Math.floor(Math.random() * JEWELS.length)], id: Math.random() }; };
const fits = (b, p, r, c) => p.cells.every(([dr, dc]) => r + dr < N && c + dc < N && !b[(r + dr) * N + c + dc]);
const anyFit = (b, ps) => ps.some((p) => p && Array.from({ length: N * N }, (_, i) => i).some((i) => fits(b, p, Math.floor(i / N), i % N)));

function Jewel({ color, ghost }) {
  return <span className="absolute inset-[4%] rounded-[22%]" style={{ background: `linear-gradient(145deg, #ffffffaa, ${color} 35%, ${color} 70%, #00000066)`, boxShadow: `inset 0 -3px 0 rgba(0,0,0,0.3), 0 0 ${ghost ? 0 : 6}px ${color}88`, opacity: ghost ? 0.45 : 1 }} />;
}
function Tray({ p, active, onPick, i }) {
  if (!p) return <div className="h-20 w-20" />;
  const w = Math.max(...p.cells.map(([, c]) => c)) + 1; const h = Math.max(...p.cells.map(([r]) => r)) + 1;
  return (
    <button type="button" onClick={onPick} className={`flex h-20 w-20 items-center justify-center rounded-2xl transition-transform ${active ? 'scale-110 bg-white/25 ring-2 ring-amber-300' : 'bg-white/10 hover:scale-105'}`} data-testid={`blast-piece-${i}`}>
      <div className="relative" style={{ width: w * 14, height: h * 14 }}>{p.cells.map(([r, c], k) => <span key={k} className="absolute h-[14px] w-[14px]" style={{ top: r * 14, left: c * 14 }}><Jewel color={p.color} /></span>)}</div>
    </button>
  );
}

export function BlockBlast({ config, onComplete }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const goal = 250 + level * 220 + theme.step * 40;
  const matchSec = Math.max(90, 200 - level * 8);
  const [b, setB] = useState(Array(N * N).fill(null));
  const [tray, setTray] = useState(() => [piece(level), piece(level), piece(level)]);
  const [sel, setSel] = useState(0);
  const [hover, setHover] = useState(null);
  const [score, setScore] = useState(0);
  const [blast, setBlast] = useState([]);
  const [pop, setPop] = useState(null);
  const [start] = useState(Date.now);
  const banter = useBanter('Block Blast (a solo block puzzle; you are the cheering host)', [HOST]);
  const done = useRef(false);
  const end = (won, why) => {
    if (done.current) return; done.current = true;
    sfx(won ? 'win' : 'lose');
    banter.say(0, won ? 'cheer' : 'cheer_sad', { big: true, force: true, event: won ? 'the player cleared the block puzzle level, celebrate' : 'the player ran out of space in the block puzzle, comfort them', detail: why });
    setTimeout(() => onComplete({ solved: won, accuracy: won ? 1 : Math.min(0.9, score / goal), duration_ms: Date.now() - start }), 1700);
  };
  const { matchLeft } = useClocks({ matchSec, running: !done.current, onMatchOut: () => end(score >= goal, 'level clock ran out') });
  useEffect(() => { banter.say(0, 'cheer_start', { force: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const place = (i) => {
    const p = tray[sel]; if (!p || done.current) return;
    const r = Math.floor(i / N); const c = i % N;
    if (!fits(b, p, r, c)) { sfx('bad'); return; }
    const nb = [...b]; p.cells.forEach(([dr, dc]) => { nb[(r + dr) * N + c + dc] = p.color; });
    const rows = [...Array(N).keys()].filter((y) => [...Array(N).keys()].every((x) => nb[y * N + x]));
    const cols = [...Array(N).keys()].filter((x) => [...Array(N).keys()].every((y) => nb[y * N + x]));
    const clear = new Set([...rows.flatMap((y) => [...Array(N).keys()].map((x) => y * N + x)), ...cols.flatMap((x) => [...Array(N).keys()].map((y) => y * N + x))]);
    clear.forEach((k) => { nb[k] = null; });
    const lines = rows.length + cols.length;
    const gained = p.cells.length * 2 + lines * 40 * lines;
    const total = score + gained;
    let nt = tray.map((x, k) => (k === sel ? null : x));
    if (nt.every((x) => !x)) nt = [piece(level), piece(level), piece(level)];
    setB(nb); setTray(nt); setScore(total); setBlast([...clear]); setTimeout(() => setBlast([]), 450);
    setSel(nt.findIndex(Boolean)); setHover(null);
    sfx(lines > 1 ? 'combo' : lines ? 'pop' : 'drop');
    if (lines) { setPop({ id: Date.now(), text: lines > 1 ? `BLAST x${lines}! +${gained}` : `+${gained}` }); banter.say(0, 'cheer', { big: lines >= 2, event: `the player just cleared ${lines} lines at once` }); }
    if (total >= goal) end(true, 'hit the target');
    else if (!anyFit(nb, nt)) end(false, 'no space left for the blocks');
  };
  const p = tray[sel];
  const ghost = new Set(p && hover != null && fits(b, p, Math.floor(hover / N), hover % N) ? p.cells.map(([dr, dc]) => (Math.floor(hover / N) + dr) * N + (hover % N) + dc) : []);
  const players = [{ ...YOU, color: '#38bdf8', info: `${score}/${goal}` }, { ...HOST, name: `Host ${HOST.name}`, color: '#ec4899', info: 'cheering' }];
  return (
    <PartyStage config={config} title="Block Blast" players={players} active={0} matchLeft={matchLeft} banter={banter}>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-black text-white"><span>Target</span><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-pink-500 transition-[width] duration-500" style={{ width: `${Math.min(100, (score / goal) * 100)}%` }} data-testid="blast-progress" /></div><span data-testid="blast-score">{score}/{goal}</span></div>
      <div className="relative mx-auto max-w-[420px] rounded-[22px] p-2" style={{ background: theme.frame, boxShadow: `0 0 0 2px ${theme.accent}99, 0 25px 60px rgba(0,0,0,0.55)` }}>
        <div className="grid grid-cols-8 gap-[3px] rounded-xl bg-black/40 p-1" data-testid="blast-board" onMouseLeave={() => setHover(null)}>
          {b.map((cell, i) => (
            <button key={i} type="button" onClick={() => place(i)} onMouseEnter={() => setHover(i)} className="relative aspect-square rounded-md bg-white/[0.07]" data-testid={`blast-cell-${i}`}>
              {cell && <Jewel color={cell} />}{!cell && ghost.has(i) && <Jewel color={p.color} ghost />}
              {blast.includes(i) && <span className="pty-burst absolute inset-0 rounded-md bg-white" />}
            </button>
          ))}
        </div>
        {pop && <div key={pop.id} className="pty-banner pointer-events-none absolute inset-x-0 top-1/3 text-center font-display text-3xl font-black text-amber-300 drop-shadow-[0_4px_0_#7a1d4a]">{pop.text}</div>}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">{tray.map((t, i) => <Tray key={t?.id || i} p={t} i={i} active={sel === i} onPick={() => { setSel(i); sfx('step'); }} />)}</div>
      <p className="mt-2 text-center text-[11px] text-white/70">Tap a block, then tap where its top-left square should go.</p>
    </PartyStage>
  );
}
