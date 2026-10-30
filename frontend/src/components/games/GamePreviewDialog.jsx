import { useEffect, useState } from 'react';
import { Monitor, RotateCcw, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { GAME_MAP } from './index';
import { GAME_CATALOG } from '../../lib/gameCatalog';
import { DIFFICULTY_LEVELS, difficultyName } from '../../lib/difficulty';
import { gameExperienceFor, pickResultQuote, playGameSound } from '../../lib/gameExperience';

const btn = 'inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-black transition-transform hover:-translate-y-0.5';

function Countdown({ onDone }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    playGameSound('tap');
    if (n === 0) { const t = setTimeout(onDone, 500); return () => clearTimeout(t); }
    const t = setTimeout(() => setN(n - 1), 800);
    return () => clearTimeout(t);
  }, [n, onDone]);
  return <div className="flex h-64 items-center justify-center"><span key={n} className="animate-ping text-8xl font-black text-amber-400" style={{ animationIterationCount: 1, animationDuration: '0.8s' }} data-testid="preview-countdown">{n || 'GO!'}</span></div>;
}

function Timer({ start }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(t); }, []);
  return <span className="font-mono text-lg font-black text-white" data-testid="preview-timer">{((now - start) / 1000).toFixed(1)}s</span>;
}

// Super Admin preview: Instructions → Demo → Countdown → Gameplay → Result. Never calls official endpoints.
export function GamePreviewDialog({ gameId, difficulty, onClose, context = 'Paid World' }) {
  const [game, setGame] = useState(gameId || GAME_CATALOG[0].id);
  const [level, setLevel] = useState(Number(difficulty) || 3);
  const [device, setDevice] = useState('desktop');
  const [stage, setStage] = useState('intro');
  const [result, setResult] = useState(null);
  const [runKey, setRunKey] = useState(0);
  const [startAt, setStartAt] = useState(0);
  const guide = gameExperienceFor(game);
  const render = GAME_MAP[game];
  const finish = (r) => { setResult({ ...r, quote: pickResultQuote(r?.solved) }); playGameSound(r?.solved ? 'success' : 'failure'); setStage(stage === 'demo' ? 'demo-done' : 'result'); };
  const restart = (s) => { setResult(null); setRunKey((k) => k + 1); setStage(s); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-white/10 bg-[#0b0724] text-white" data-testid="game-preview-dialog">
        <DialogHeader><DialogTitle>Preview game · {context} <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-black text-rose-200">PREVIEW · NO OFFICIAL ATTEMPTS, SCORES OR REWARDS</span></DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-10 rounded-lg border border-white/15 bg-[#140d3a] px-2 text-sm" value={game} onChange={(e) => { setGame(e.target.value); restart('intro'); }} data-testid="preview-game-select">{GAME_CATALOG.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          <select className="h-10 rounded-lg border border-white/15 bg-[#140d3a] px-2 text-sm" value={level} onChange={(e) => { setLevel(Number(e.target.value)); restart('intro'); }} data-testid="preview-difficulty-select">{DIFFICULTY_LEVELS.map((d) => <option key={d.level} value={d.level}>Level {d.level} · {d.name}</option>)}</select>
          {[['desktop', Monitor], ['mobile', Smartphone]].map(([d, Icon]) => <button key={d} type="button" onClick={() => setDevice(d)} className={`${btn} ${device === d ? 'bg-amber-400 text-[#1a1033]' : 'bg-white/10 text-white'}`} data-testid={`preview-device-${d}`}><Icon className="h-4 w-4" />{d}</button>)}
          <button type="button" onClick={() => playGameSound('success')} className={`${btn} bg-white/10 text-white`} data-testid="preview-sound-test">Test sound</button>
        </div>
        <div className={`mx-auto mt-3 w-full rounded-3xl border border-white/10 bg-gradient-to-b from-[#17104a] to-[#07041a] p-4 ${device === 'mobile' ? 'max-w-[390px]' : ''}`} data-testid="preview-frame">
          <div className="mb-3 flex items-center justify-between text-xs font-bold text-white/60"><span>{GAME_CATALOG.find((g) => g.id === game)?.label} · Level {level} {difficultyName(level)}</span>{stage === 'play' && <Timer start={startAt} />}</div>
          {stage === 'intro' && <div className="space-y-3 py-4" data-testid="preview-instructions">
            <h3 className="text-2xl font-black">How to play</h3>
            {guide && ['objective', 'controls', 'win', 'mistakes'].map((k) => <p key={k} className="text-sm text-indigo-100"><b className="capitalize text-amber-300">{k}:</b> {guide[k]}</p>)}
            <div className="flex gap-2 pt-2"><button type="button" className={`${btn} bg-sky-500 text-white`} onClick={() => restart('demo')} data-testid="preview-start-demo">Try practice</button><button type="button" className={`${btn} bg-amber-400 text-[#1a1033]`} onClick={() => restart('countdown')} data-testid="preview-skip-demo">Skip to game</button></div>
          </div>}
          {(stage === 'demo' || stage === 'play') && <div key={runKey} className="rounded-2xl bg-white/[0.03] p-2">{stage === 'demo' && <p className="mb-2 text-center text-xs font-bold text-sky-300">Practice round</p>}{render?.({ difficulty: level }, finish)}</div>}
          {stage === 'countdown' && <Countdown onDone={() => { setStartAt(Date.now()); setStage('play'); }} />}
          {(stage === 'demo-done' || stage === 'result') && result && <div className="space-y-3 py-8 text-center" data-testid="preview-result">
            <div className={`text-5xl font-black ${result.solved ? 'text-emerald-300' : 'text-rose-300'}`}>{result.solved ? 'Completed!' : 'Not this time'}</div>
            <p className="text-sm text-white/70">Time {(result.duration_ms / 1000).toFixed(2)}s · accuracy {Math.round((result.accuracy || 0) * 100)}%</p>
            {result.quote && <p className="mx-auto max-w-md text-sm italic text-amber-200">“{result.quote}”</p>}
            <div className="flex justify-center gap-2">{stage === 'demo-done' ? <button type="button" className={`${btn} bg-amber-400 text-[#1a1033]`} onClick={() => restart('countdown')} data-testid="preview-continue">Continue to game</button> : <button type="button" className={`${btn} bg-amber-400 text-[#1a1033]`} onClick={() => restart('countdown')} data-testid="preview-retry"><RotateCcw className="h-4 w-4" />Retry</button>}<button type="button" className={`${btn} bg-white/10 text-white`} onClick={() => restart('intro')} data-testid="preview-reset">Reset</button></div>
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
