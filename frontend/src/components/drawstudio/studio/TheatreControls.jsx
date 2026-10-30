import { Circle, Maximize2, Pause, Play, Square, UploadCloud, X } from 'lucide-react';

const btn = 'inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 text-xs font-bold text-white backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-40';
const STEPS = [['ENTER POOL', ['ready']], ['MIX', ['loading', 'loaded']], ['DRAW', ['mixing', 'mixed']], ['WINNER REVEAL', ['drawing', 'drawn']]];

export function StageSteps({ stage }) {
  const active = STEPS.findIndex(([, s]) => s.includes(stage));
  return (
    <ol className="hidden items-center gap-1 lg:flex" data-testid="draw-stage-steps">
      {STEPS.map(([label], i) => {
        const done = active === -1 || i < active;
        return <li key={label} className={`rounded-full px-3 py-1 text-[10px] font-black tracking-widest ${i === active ? 'bg-amber-400 text-[#1a1033]' : done ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-white/40'}`}>{i + 1}. {label}</li>;
      })}
    </ol>
  );
}

export function RecordControls({ rec, onStart, onSave, saving }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {rec.state === 'idle' && <button type="button" className={`${btn} !bg-rose-600/80`} disabled={!rec.supported} onClick={onStart} data-testid="draw-record-start"><Circle className="h-4 w-4" />Start Recording</button>}
      {rec.state === 'recording' && <button type="button" className={btn} onClick={rec.pause} data-testid="draw-record-pause"><Pause className="h-4 w-4" />Pause</button>}
      {rec.state === 'paused' && <button type="button" className={btn} onClick={rec.resume} data-testid="draw-record-resume"><Play className="h-4 w-4" />Resume</button>}
      {rec.state !== 'idle' && <button type="button" className={`${btn} !bg-rose-600`} onClick={rec.stop} data-testid="draw-record-stop"><Square className="h-4 w-4" />Stop &amp; Download</button>}
      {rec.state !== 'idle' && <span className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1 text-[10px] font-black text-white" data-testid="draw-recording-indicator"><Circle className={`h-2.5 w-2.5 fill-white ${rec.state === 'recording' ? 'animate-pulse' : ''}`} />{rec.state === 'paused' ? 'PAUSED' : 'REC'}</span>}
      {rec.last && rec.state === 'idle' && <button type="button" className={btn} disabled={saving !== null} onClick={onSave} data-testid="draw-record-save"><UploadCloud className="h-4 w-4" />{saving === null ? 'Save copy to Draw History' : saving >= 1 ? 'Saved' : `Saving ${Math.round(saving * 100)}%`}</button>}
    </div>
  );
}

export function UtilityControls({ onFullscreen, onClose }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={onFullscreen} data-testid="draw-stage-fullscreen"><Maximize2 className="h-4 w-4" />Full screen</button>
      <button type="button" className={btn} onClick={onClose} data-testid="draw-stage-close"><X className="h-4 w-4" />Close</button>
    </div>
  );
}
