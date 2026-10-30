import { useEffect, useState } from 'react';
import { Clock3, Info, Play, RotateCcw, Trophy } from 'lucide-react';
import { WorldClientGame } from '../../world/components/WorldClientGame';
import { GAME_MAP } from '../games';
import { MemoryBoard3D, MemoryTile } from '../games/premium/boards';
import GameSoundToggle from '../games/GameSoundToggle';
import { GAME_CATALOG } from '../../lib/gameCatalog';
import { gameExperienceFor, playGameSound } from '../../lib/gameExperience';

const fmt = (ms = 0) => {
  const v = Math.max(0, Math.floor(ms));
  return `${String(Math.floor(v / 60000)).padStart(2, '0')}:${String(Math.floor((v % 60000) / 1000)).padStart(2, '0')}.${String(v % 1000).padStart(3, '0')}`;
};
const gameLabel = (id) => GAME_CATALOG.find((g) => g.id === id)?.label || (id === 'colour_match' ? 'Colour Match' : id === 'number_sequence' ? 'Number Sequence' : id);

function useElapsed(startMs, running) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(t);
  }, [running]);
  return startMs ? Math.max(0, now - startMs) : 0;
}

function ServerMemory({ memory, revealed, known, onClick, level }) {
  if (!memory) return null;
  const stats = [['Pairs', `${memory.matched_positions.length / 2}/${memory.card_count / 2}`], ['Clicks', memory.click_count], ['Retries', memory.retries]];
  return (
    <MemoryBoard3D count={memory.card_count} stats={stats} level={level} testId="preview-memory-board">
      {Array.from({ length: memory.card_count }, (_, pos) => {
        const done = memory.matched_positions.includes(pos);
        return <MemoryTile key={pos} symbol={revealed[pos] ?? known[pos] ?? 0} faceUp={revealed[pos] !== undefined} matched={done} disabled={memory.status !== 'playing'} onClick={() => onClick(pos)} testId={`preview-card-${pos}`} />;
      })}
    </MemoryBoard3D>
  );
}

const Card = ({ children, testId }) => <section className="fwv3-card fwv3-play-card" style={{ maxWidth: 760, width: '100%', margin: '0 auto' }} data-testid={testId}>{children}</section>;

// Super Admin Preview gameplay surface: the same Free World play cards and premium boards players see.
export function PreviewPlaySurface({ gcNumber, levelKey, row, stage, setStage, play, memory, revealed, known, onMemoryClick, onComplete, countdown, quote, demoKey, setDemoKey }) {
  const guide = gameExperienceFor(row.game_id);
  const name = gameLabel(row.game_id);
  const isMemory = row.game_id === 'memory_match';
  const where = `GC${gcNumber} · ${levelKey === 'champion' ? 'Champion' : `Level ${levelKey.slice(1)}`} · Sandbox`;
  const [demoStart, setDemoStart] = useState(0);
  useEffect(() => { if (stage === 'demo') setDemoStart(Date.now()); }, [stage, demoKey]);
  const demoMs = useElapsed(demoStart, stage === 'demo');
  const startedMs = isMemory ? (memory?.started_at ? new Date(memory.started_at).getTime() : 0) : (play?.started_at ? new Date(play.started_at).getTime() : 0);
  const finishedMs = isMemory ? (memory?.status === 'completed' ? memory.duration_ms : null) : play?.duration_ms;
  const liveMs = useElapsed(startedMs, stage === 'playing' && finishedMs == null);
  const officialMs = finishedMs != null ? finishedMs : liveMs;
  const champion = levelKey === 'champion';
  const resultMs = finishedMs || 0;
  const passed = isMemory ? memory?.status === 'completed' : play?.status === 'completed';

  if (stage === 'instructions') return (
    <Card testId="preview-instructions">
      <div className="fwv3-mode-label">{where}</div>
      <h2 style={{ fontWeight: 900, fontSize: 24, margin: '8px 0' }}>{name.toUpperCase()}</h2>
      {guide && <section className="fwv3-info-box" data-testid="preview-game-guide"><Info /><div><b>{guide.objective}</b><p>{guide.controls} {guide.win} {guide.mistakes}</p><small>{guide.timer}</small></div></section>}
      <GameSoundToggle className="mt-3" />
      <section className="fwv3-entry-actions">
        <button type="button" className="fwv3-button fwv3-button-outline" onClick={() => setStage('ready')} data-testid="preview-skip-demo-btn">SKIP DEMO</button>
        <button type="button" className="fwv3-button fwv3-button-primary" onClick={() => { setDemoKey((k) => k + 1); setStage('demo'); }} data-testid="preview-demo-btn"><Play size={18} /> PLAY DEMO</button>
      </section>
    </Card>
  );
  if (stage === 'demo') return (
    <div key={`demo-${demoKey}`} data-testid="preview-demo">
      <WorldClientGame inline practice gameId={row.game_id} config={row.game_config || {}} label="DEMO MODE · no attempt used" timerText={fmt(demoMs)} timerCaption="PRACTICE MODE - NO ATTEMPT USED"
        onComplete={() => setStage('demo-result')} onSkip={() => setStage('ready')} />
    </div>
  );
  if (stage === 'demo-result' || stage === 'ready') return (
    <Card testId={stage === 'ready' ? 'preview-ready' : 'preview-demo-result'}>
      <div className="fwv3-mode-label">{stage === 'ready' ? 'OFFICIAL ATTEMPT' : 'DEMO COMPLETE'}</div>
      <h2 style={{ fontWeight: 900, fontSize: 24, margin: '8px 0' }}>Ready to play?</h2>
      <p className="text-sm text-slate-600">This isolated run creates only sandbox scores and never charges or awards Tokens.</p>
      <section className="fwv3-entry-actions">
        <button type="button" className="fwv3-button fwv3-button-outline" onClick={() => { setDemoKey((k) => k + 1); setStage('demo'); }} data-testid="preview-replay-demo">REPLAY DEMO</button>
        <button type="button" className="fwv3-button fwv3-button-primary" onClick={() => setStage('countdown')} data-testid="preview-start-attempt">START ATTEMPT</button>
      </section>
    </Card>
  );
  if (stage === 'countdown') return (
    <Card testId="preview-countdown">
      <div className="fwv3-mode-label">{champion ? 'CHAMPION RUN' : 'OFFICIAL ATTEMPT'}</div>
      <GameSoundToggle className="mb-3" />
      <strong className="fwv3-countdown-number" data-testid="preview-countdown-number">{countdown > 0 ? countdown : 'GO!'}</strong>
    </Card>
  );
  if (stage === 'playing') return (
    <div data-testid="preview-official-game">
      <WorldClientGame inline gameId={row.game_id} config={row.game_config || {}} label={champion ? 'CHAMPION RUN · SANDBOX' : 'OFFICIAL ATTEMPT · SANDBOX'} timerText={fmt(officialMs)}
        timerCaption={champion ? 'CHAMPION STOPWATCH - FASTEST VERIFIED TIME WINS' : 'PREVIEW ATTEMPT - SANDBOX SCORE ONLY'} onComplete={(r) => onComplete(Boolean(r?.solved))}>
        {row.game_id === 'memory_match' ? <ServerMemory memory={memory} revealed={revealed} known={known} onClick={onMemoryClick} level={row.game_config?.difficulty ? Number(row.game_config.difficulty) : null} />
          : play ? <PlayKeyed key={play.started_at} row={row} onComplete={onComplete} /> : null}
      </WorldClientGame>
    </div>
  );
  if (stage === 'result') return (
    <Card testId="preview-result">
      <div className="fwv3-mode-label">ATTEMPT RESULT</div>
      <div className="mt-2 flex items-center gap-2"><Trophy className={passed ? 'text-emerald-600' : 'text-rose-500'} /><h2 style={{ fontWeight: 900, fontSize: 28 }}>{passed ? 'SUCCESS' : 'NOT COMPLETED'}</h2></div>
      <p className="mt-2 text-slate-600">{passed ? (guide?.win || `You completed ${name}.`) : (guide?.mistakes || `${name} was not completed.`)}</p>
      {quote && <p className="my-3 text-center text-sm font-semibold text-slate-600" data-testid="preview-result-quote">{quote}</p>}
      <div className="fwv3-timer"><Clock3 /><strong data-testid="preview-result-time">{fmt(resultMs)}</strong></div>
      <section className="fwv3-entry-actions">
        <button type="button" className="fwv3-button fwv3-button-outline" onClick={() => setStage('idle')} data-testid="preview-back-controls">BACK TO CONTROLS</button>
        <button type="button" className="fwv3-button fwv3-button-primary" onClick={() => { playGameSound('tap'); setStage('ready'); }} data-testid="preview-retry"><RotateCcw size={16} /> RETRY</button>
      </section>
    </Card>
  );
  return null;
}

// Re-mount the board for every new sandbox attempt; report the first completion only.
function PlayKeyed({ row, onComplete }) {
  const [done, setDone] = useState(false);
  return GAME_MAP[row.game_id]?.(row.game_config || {}, (r) => { if (done) return; setDone(true); onComplete(Boolean(r?.solved)); }) || <p data-testid="preview-game-missing">No component registered for {row.game_id}.</p>;
}
