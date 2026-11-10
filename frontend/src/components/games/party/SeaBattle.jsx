import { useEffect, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { difficultyOf } from '../../../lib/difficulty';
import { BOTS, YOU, sfx, themeFor, useBanter, useClocks } from './kit';
import { PartyStage } from './stage';

// Sea Battle: sink the rival fleet before it sinks yours. A hit lets you fire again.
const N = 8;
const FLEET = [4, 3, 3, 2, 2];
function placeFleet() {
  const ships = []; const taken = new Set();
  FLEET.forEach((len) => {
    for (;;) {
      const hz = Math.random() < 0.5; const r = Math.floor(Math.random() * (hz ? N : N - len + 1)); const c = Math.floor(Math.random() * (hz ? N - len + 1 : N));
      const cells = Array.from({ length: len }, (_, k) => (hz ? r * N + c + k : (r + k) * N + c));
      if (cells.every((x) => !taken.has(x))) { cells.forEach((x) => taken.add(x)); ships.push(cells); break; }
    }
  });
  return ships;
}
const shipAt = (ships, i) => ships.findIndex((s) => s.includes(i));
const sunk = (ships, shots, k) => ships[k].every((x) => shots[x]);
const BOT = { ...BOTS[0], name: 'Admiral Rex' };

function botShot(shots, ships, level) {
  const open = [...Array(N * N).keys()].filter((i) => !shots[i]);
  const hits = [...Array(N * N).keys()].filter((i) => shots[i] && shipAt(ships, i) >= 0 && !sunk(ships, shots, shipAt(ships, i)));
  if (hits.length && Math.random() < 0.55 + level * 0.05) {
    const near = hits.flatMap((h) => [h - N, h + N, h % N ? h - 1 : -1, h % N < N - 1 ? h + 1 : -1]).filter((x) => x >= 0 && x < N * N && !shots[x]);
    if (near.length) return near[Math.floor(Math.random() * near.length)];
  }
  const pool = level >= 5 ? open.filter((i) => (Math.floor(i / N) + (i % N)) % 2 === 0) : open;
  const list = pool.length ? pool : open;
  return list[Math.floor(Math.random() * list.length)];
}

function Grid({ ships, shots, reveal, onShot, testId, small }) {
  return (
    <div className={`grid grid-cols-8 gap-[2px] rounded-xl bg-sky-950/70 p-1 ${small ? 'w-full max-w-[170px]' : 'w-full'}`} data-testid={testId}>
      {Array.from({ length: N * N }, (_, i) => { const k = shipAt(ships, i); const shot = shots[i]; const isSunk = k >= 0 && sunk(ships, shots, k); const showShip = k >= 0 && (reveal || isSunk); return (
        <button key={i} type="button" disabled={!onShot || shot} onClick={() => onShot?.(i)} data-testid={onShot ? `sea-cell-${i}` : undefined}
          className={`relative aspect-square rounded-[4px] ${onShot && !shot ? 'hover:bg-sky-300/40' : ''}`} style={{ background: showShip ? (isSunk ? 'linear-gradient(145deg,#7f1d1d,#450a0a)' : 'linear-gradient(145deg,#94a3b8,#475569)') : 'rgba(56,189,248,0.18)' }}>
          {shot && k >= 0 && <span className="pty-new absolute inset-[12%] rounded-full" style={{ background: 'radial-gradient(circle, #fde047, #f97316 45%, #dc2626 70%, transparent 72%)', boxShadow: '0 0 10px #f97316' }} />}
          {shot && k < 0 && <span className="pty-new absolute inset-[30%] rounded-full border-2 border-white/70" />}
        </button>); })}
    </div>
  );
}

export function SeaBattle({ config, onComplete }) {
  const level = difficultyOf(config);
  const theme = themeFor(config);
  const [mine, setMine] = useState(placeFleet);
  const [theirs] = useState(placeFleet);
  const [myShots, setMyShots] = useState({});
  const [botShots, setBotShots] = useState({});
  const [turn, setTurn] = useState(0);
  const [start] = useState(Date.now);
  const banter = useBanter('Sea Battle (battleship)', [BOT]);
  const done = useRef(false);
  const turnSec = Math.max(6, 15 - level);
  const matchSec = Math.max(120, 300 - level * 12);
  const hitsOn = (ships, shots) => ships.flat().filter((x) => shots[x]).length;
  const sunkCount = (ships, shots) => ships.filter((_, k) => sunk(ships, shots, k)).length;
  const end = (won, why) => {
    if (done.current) return; done.current = true;
    sfx(won ? 'win' : 'lose');
    banter.say(0, won ? 'you_win' : 'bot_win', { big: true, force: true, event: won ? 'the human sank your whole fleet' : 'you sank the human\'s whole fleet', detail: why });
    { const end = Date.now(); setTimeout(() => onComplete({ solved: won, accuracy: won ? Math.min(1, hitsOn(theirs, myShots) / Math.max(1, Object.keys(myShots).length) + 0.3) : 0.3, duration_ms: end - start, delay_ms: Date.now() - end }), 1800); }
  };
  const fire = (i) => {
    if (turn !== 0 || done.current || myShots[i]) return;
    const shots = { ...myShots, [i]: true }; setMyShots(shots);
    const k = shipAt(theirs, i);
    if (k < 0) { sfx('drop'); setTurn(1); return; }
    sfx('capture');
    if (sunk(theirs, shots, k)) banter.say(0, 'you_hit', { big: true, event: `the human just sank your ship of length ${theirs[k].length}` });
    if (sunkCount(theirs, shots) === FLEET.length) end(true, 'fleet sunk');
  };
  const { turnLeft, matchLeft } = useClocks({ turnSec, matchSec, turnKey: `${turn}-${Object.keys(myShots).length}`, running: !done.current,
    onTurnOut: () => { if (turn === 0) { const open = [...Array(N * N).keys()].filter((x) => !myShots[x]); fire(open[Math.floor(Math.random() * open.length)]); } },
    onMatchOut: () => end(hitsOn(theirs, myShots) > hitsOn(mine, botShots), 'time ran out, most hits won') });
  useEffect(() => { banter.say(0, 'start', { force: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (turn !== 1 || done.current) return undefined;
    const t = setTimeout(() => {
      const i = botShot(botShots, mine, level); const shots = { ...botShots, [i]: true }; setBotShots(shots);
      const k = shipAt(mine, i);
      if (k < 0) { sfx('drop'); if (Math.random() < 0.25) banter.say(0, 'bot_bad'); setTurn(0); return; }
      sfx('capture');
      if (sunk(mine, shots, k)) banter.say(0, 'bot_hit', { big: true, event: 'you just sank one of the human\'s ships' });
      if (sunkCount(mine, shots) === FLEET.length) end(false, 'your fleet was sunk');
      else setTurn(1.5);
    }, 900);
    return () => clearTimeout(t);
  }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (turn === 1.5) setTurn(1); }, [turn]);

  const players = [{ ...YOU, color: '#38bdf8', info: `${FLEET.length - sunkCount(mine, botShots)} ships left` }, { ...BOT, color: '#f97316', info: `${FLEET.length - sunkCount(theirs, myShots)} ships left` }];
  const fresh = !Object.keys(myShots).length && !Object.keys(botShots).length;
  return (
    <PartyStage config={config} title="Sea Battle" players={players} active={done.current ? -1 : turn === 0 ? 0 : 1} turnLeft={turnLeft} turnSec={turnSec} matchLeft={matchLeft} banter={banter}>
      <div className="mx-auto max-w-[440px] rounded-[22px] p-2" style={{ background: 'linear-gradient(145deg,#0c4a6e,#082f49)', boxShadow: `0 0 0 2px ${theme.accent}99, 0 25px 60px rgba(0,0,0,0.55)` }}>
        <div className="mb-1 text-center text-[10px] font-black uppercase tracking-widest text-sky-200">Enemy waters: tap to fire</div>
        <Grid ships={theirs} shots={myShots} onShot={turn === 0 ? fire : null} testId="sea-enemy-board" />
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <div className="w-[170px]"><div className="mb-1 text-center text-[10px] font-black uppercase tracking-widest text-white/70">Your fleet</div><Grid ships={mine} shots={botShots} reveal small testId="sea-my-board" /></div>
        <div className="space-y-2 text-[11px] font-bold text-white">
          <div className="rounded-full bg-black/50 px-3 py-1" data-testid="sea-status">{done.current ? 'Battle over' : turn === 0 ? 'Your shot! A hit fires again' : `${BOT.name} is aiming…`}</div>
          {fresh && <button type="button" onClick={() => setMine(placeFleet())} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-white" data-testid="sea-shuffle"><Shuffle className="h-3.5 w-3.5" />Move my ships</button>}
        </div>
      </div>
    </PartyStage>
  );
}
