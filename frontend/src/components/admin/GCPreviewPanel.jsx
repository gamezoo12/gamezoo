import { useEffect, useRef, useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { worldGcCompetitionAdminAPI as gcApi } from '../../lib/api';
import { GAME_CATALOG } from '../../lib/gameCatalog';
import { GAME_MAP } from '../games';
import { MemoryCard } from '../games/MemoryCard';
import GameSoundToggle from '../games/GameSoundToggle';
import { gameExperienceFor, pickResultQuote, playGameSound } from '../../lib/gameExperience';
import Header from '../layout/Header';

const levelKeys = [...Array.from({ length: 10 }, (_, i) => `L${i + 1}`), 'champion'];
const btn = 'rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40';
const errText = (e) => {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg).filter(Boolean).join('; ') || 'Invalid preview input.';
  return detail?.message || 'Preview action failed.';
};

function MemoryBoard({ memory, revealed, known, onClick }) {
  if (!memory) return null;
  return (
    <div className="mt-3" data-testid="preview-memory-board">
      <p className="text-xs text-slate-600">Memory Match {memory.level} · clicks {memory.click_count} · retries {memory.retries} · {memory.status === 'completed' ? `finished in ${(memory.duration_ms / 1000).toFixed(2)}s` : 'stopwatch running'}</p>
      <div className="mt-2 grid max-w-md grid-cols-6 gap-2">
        {Array.from({ length: memory.card_count }, (_, pos) => {
          const done = memory.matched_positions.includes(pos);
          const shown = done || revealed[pos] !== undefined;
          return <MemoryCard key={pos} position={pos} symbol={revealed[pos] ?? known[pos] ?? 0} flipped={shown && !done} matched={done} disabled={memory.status !== 'playing'} onClick={onClick} testId={`preview-card-${pos}`} />;
        })}
      </div>
    </div>
  );
}

function Stopwatch({ startedAt, running }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [running]);
  const secs = startedAt ? Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000) : 0;
  return <span data-testid="preview-stopwatch">{secs.toFixed(1)}s</span>;
}

function ClientGame({ play, gameId, config, onFinish }) {
  const done = useRef(false);
  useEffect(() => { done.current = false; }, [play.started_at]);
  const render = GAME_MAP[gameId];
  if (!render) return <p className="text-sm text-rose-700" data-testid="preview-game-missing">No component registered for {gameId}.</p>;
  return (
    <div className="mt-3 rounded-xl bg-white p-3 text-slate-900" key={play.started_at} data-testid={`preview-game-${gameId}`}>
      {render(config || {}, (result) => { if (done.current) return; done.current = true; onFinish(Boolean(result?.solved)); })}
    </div>
  );
}

export const GCPreviewPanel = ({ gcNumber }) => {
  const [preview, setPreview] = useState(null);
  const [level, setLevel] = useState('L1');
  const [revealed, setRevealed] = useState({});
  const [known, setKnown] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gameStage, setGameStage] = useState('idle');
  const [demoKey, setDemoKey] = useState(0);
  const [demoResult, setDemoResult] = useState(null);
  const [gameCountdown, setGameCountdown] = useState(3);
  const [gameQuote, setGameQuote] = useState('');
  const [previewViewport, setPreviewViewport] = useState('desktop');
  const row = preview && (level === 'champion' ? preview.champion : preview.levels[Number(level.slice(1)) - 1]);
  const play = preview?.play;
  const gameGuide = gameExperienceFor(row?.game_id);
  const ranked = [...(preview?.scores?.[level] || [])].sort((a, b) => a.duration_ms - b.duration_ms);

  useEffect(() => { gcApi.previewGet().then((r) => setPreview(r.preview)).catch(() => {}); }, []);

  const call = async (promise) => {
    setBusy(true); setError('');
    try { const r = await promise; setPreview(r.preview); return r; } catch (e) { setError(errText(e)); return null; } finally { setBusy(false); }
  };
  const act = (action, extra = {}) => call(gcApi.previewAction({ action, level, ...extra }));
  const click = async (position) => {
    const r = await act('memory_click', { position });
    if (!r?.reveal) return;
    const next = { ...revealed, [position]: r.reveal.symbol };
    setRevealed(next);
    setKnown((k) => ({ ...k, [position]: r.reveal.symbol }));
    if (Object.keys(next).length >= 2) setTimeout(() => setRevealed({}), 600);
    if (r.preview?.memory?.status === 'completed') {
      setGameQuote(pickResultQuote(true));
      setGameStage('result');
    }
  };

  const startOfficialPreview = () => {
    setGameCountdown(3);
    setGameStage('countdown');
  };

  useEffect(() => {
    if (gameStage !== 'countdown') return undefined;
    if (gameCountdown > 0) {
      playGameSound('countdown');
      const timer = setTimeout(() => setGameCountdown((value) => value - 1), 900);
      return () => clearTimeout(timer);
    }
    let active = true;
    const timer = setTimeout(async () => {
      const action = row?.game_id === 'memory_match' ? 'memory_start' : 'game_start';
      const result = await act(action);
      if (active && result) {
        setGameStage('playing');
        playGameSound('start');
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [gameStage, gameCountdown, row?.game_id, level]);

  const completeOfficialPreview = async (solved) => {
    const result = await act('game_complete', { solved });
    if (result) {
      setGameQuote(pickResultQuote(solved));
      setGameStage('result');
    }
  };
  return (
    <section className="rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/40 p-4" data-testid="gc-preview-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold text-indigo-950"><FlaskConical className="h-4 w-4" /> Preview Mode · sandbox only</h2>
        <button type="button" className={btn} disabled={busy} onClick={() => { setRevealed({}); call(gcApi.previewReset(gcNumber)); }} data-testid="preview-reset-btn"><RotateCcw className="mr-1 inline h-3 w-3" />Reset preview from GC{gcNumber}</button>
      </div>
      <p className="mt-1 text-xs text-indigo-900">Nothing here touches real competitions, schedules, leaderboards, wallets or prizes.</p>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700" data-testid="preview-error">{error}</p>}
      {!preview ? <p className="mt-3 text-sm text-slate-600">Reset preview to start a simulation.</p> : <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold">Model <select className="ml-1 rounded border px-2 py-1" value={preview.model} onChange={(e) => call(gcApi.previewAction({ action: 'update_config', config: { model: e.target.value } }))} data-testid="preview-model-select"><option value="champion_only">Champion-Only</option><option value="every_level">Every-Level + Champion</option></select></label>
          <label className="text-xs font-semibold">Level <select className="ml-1 rounded border px-2 py-1" value={level} onChange={(e) => setLevel(e.target.value)} data-testid="preview-level-select">{levelKeys.map((k) => <option key={k} value={k}>{k === 'champion' ? 'Champion' : `Level ${k.slice(1)}`} · {(k === 'champion' ? preview.champion : preview.levels[Number(k.slice(1)) - 1]).state}</option>)}</select></label>
          <label className="text-xs font-semibold">Game <select className="ml-1 rounded border px-2 py-1" value={row?.game_id || ''} onChange={(e) => call(gcApi.previewAction({ action: 'update_config', config: level === 'champion' ? { champion: { game_id: e.target.value } } : { levels: [{ level: Number(level.slice(1)), game_id: e.target.value }] } }))} data-testid="preview-game-select">{GAME_CATALOG.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
          <label className="text-xs font-semibold">Simulated time <input type="datetime-local" className="ml-1 rounded border px-2 py-1" onChange={(e) => e.target.value && act('set_time', { sim_now: new Date(e.target.value).toISOString() })} data-testid="preview-sim-time" /></label>
        </div>
        {level !== 'champion' && preview.model === 'every_level' && <div className="flex flex-wrap gap-2" data-testid="preview-bonus-inputs">{[1, 2, 3, 4, 5].map((r) => <label key={r} className="text-xs">#{r} <input type="number" min="0" max="500" className="w-16 rounded border px-1" value={row.bonus_rewards?.[String(r)] ?? 0} onChange={(e) => call(gcApi.previewAction({ action: 'update_config', config: { levels: [{ level: Number(level.slice(1)), bonus_rewards: { ...row.bonus_rewards, [String(r)]: Number(e.target.value) } }] } }))} /></label>)}</div>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={busy} onClick={() => act('jump')} data-testid="preview-jump-btn">Jump here</button>
          <button type="button" className={btn} disabled={busy} onClick={() => act('open_level')} data-testid="preview-open-btn">Open</button>
          <button type="button" className={btn} disabled={busy} onClick={() => act('close_level')} data-testid="preview-close-btn">Close</button>
          <button type="button" className={btn} disabled={busy} onClick={() => act('simulate_players', { count: 6 })} data-testid="preview-simulate-btn">Simulate 6 players</button>
          <button type="button" className={btn} disabled={busy || !row?.game_id} onClick={() => { setDemoResult(null); setRevealed({}); setKnown({}); setGameStage('instructions'); }} data-testid="preview-play-btn">{play?.level === level && play.status !== 'playing' ? 'Replay full preview' : 'Start Full Gameplay Preview'}</button>
          <button type="button" className={btn} disabled={busy} onClick={() => act('finalize_level')} data-testid="preview-finalize-btn">{level === 'champion' ? 'Finalize Champion & payouts' : 'Finalize level'}</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 text-xs">
          <div data-testid="preview-leaderboard"><b>Simulated leaderboard</b>{ranked.slice(0, 10).map((s, i) => <div key={`${s.player_id}-${i}`}>{i + 1}. {s.name} · {(s.duration_ms / 1000).toFixed(2)}s</div>)}</div>
          <div data-testid="preview-wallets"><b>Simulated wallets</b>{Object.entries(preview.wallet || {}).map(([pid, w]) => <div key={pid}>{pid}: pending {w.bonus_pending || 0} · credited {w.bonus_credited || 0} · forfeited {w.bonus_forfeited || 0} · champion {w.champion_tokens || 0}</div>)}</div>
        </div>
        {preview.champion_result && <p className="text-xs" data-testid="preview-champion-result"><b>Champion winners:</b> {preview.champion_result.map((w) => `${w.rank}. ${w.name} +${w.champion_prize_tokens}`).join(' · ')}</p>}
        <p className="text-[11px] text-slate-500">Sim time: {preview.sim_now} · {preview.log?.slice(-1)[0]}</p>
      </div>}
      {gameStage !== 'idle' && row && <div className="fixed inset-0 z-[10050] overflow-y-auto bg-slate-950/85" data-testid="full-gameplay-preview">
        <Header />
        <main className="min-h-[calc(100vh-112px)] px-3 py-4 sm:px-6 sm:py-6" data-testid="preview-player-surface">
          <section className={`mx-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl sm:p-6 ${previewViewport === 'mobile' ? 'w-full max-w-[390px]' : 'w-full max-w-4xl'}`}>
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">GC{gcNumber} · {level === 'champion' ? 'Champion' : `Level ${level.slice(1)}`} · Sandbox</p><h2 className="text-xl font-black">{GAME_CATALOG.find(g => g.id === row.game_id)?.label || row.game_id}</h2></div>
              <div className="flex items-center gap-2"><div className="inline-flex rounded-md border p-1"><button type="button" aria-pressed={previewViewport === 'desktop'} onClick={() => setPreviewViewport('desktop')} className={`rounded px-2 py-1 text-xs font-bold ${previewViewport === 'desktop' ? 'bg-slate-900 text-white' : ''}`}>Desktop</button><button type="button" aria-pressed={previewViewport === 'mobile'} onClick={() => setPreviewViewport('mobile')} className={`rounded px-2 py-1 text-xs font-bold ${previewViewport === 'mobile' ? 'bg-slate-900 text-white' : ''}`}>Mobile</button></div><GameSoundToggle /><button type="button" onClick={() => setGameStage('idle')} className="rounded border px-3 py-2 text-sm font-bold">Exit preview</button></div>
            </header>
            <div className="mt-4" data-testid="preview-phase">{gameStage}</div>
            {gameStage === 'instructions' && <div className="mt-4 space-y-3" data-testid="preview-instructions">
              <p>{gameGuide?.objective}</p><p><b>How to play:</b> {gameGuide?.controls}</p><p><b>Win:</b> {gameGuide?.win}</p><p><b>Mistakes:</b> {gameGuide?.mistakes}</p><p><b>Timer:</b> {gameGuide?.timer}</p>
              <div className="flex flex-wrap gap-2"><button type="button" className={btn} onClick={() => { setDemoKey(k => k + 1); setDemoResult(null); setGameStage('demo'); }}>Interactive Demo</button><button type="button" className={btn} onClick={() => setGameStage('ready')}>Skip Demo</button></div>
            </div>}
            {gameStage === 'demo' && <div className="mt-4" data-testid="preview-demo"><p className="mb-2 rounded bg-sky-50 p-2 text-sm font-bold text-sky-900">Practice only · no official attempts, scores or rewards</p><div key={`preview-demo-${demoKey}`} onPointerDownCapture={() => playGameSound('tap')}>{GAME_MAP[row.game_id]?.(row.game_config || {}, (result) => { setDemoResult(result); playGameSound(result?.solved ? 'success' : 'failure'); setGameStage('demo-result'); })}</div><button type="button" className={`${btn} mt-3`} onClick={() => setGameStage('demo-result')}>Skip practice</button></div>}
            {gameStage === 'demo-result' && <div className="mt-4 rounded-lg bg-sky-50 p-4" data-testid="preview-demo-result"><b>Practice complete</b><p>This practice was not submitted. Try again or continue to the preview attempt.</p><div className="mt-3 flex gap-2"><button type="button" className={btn} onClick={() => { setDemoKey(k => k + 1); setGameStage('demo'); }}>Practice again</button><button type="button" className={btn} onClick={() => setGameStage('ready')}>Continue</button></div></div>}
            {gameStage === 'ready' && <div className="mt-6 rounded-xl bg-slate-50 p-5 text-center" data-testid="preview-ready"><h3 className="text-xl font-black">Ready for a preview attempt?</h3><p className="mt-2 text-sm text-slate-600">This isolated run creates only sandbox scores and never charges or awards Tokens.</p><button type="button" className="mt-4 rounded-md bg-emerald-700 px-5 py-3 font-bold text-white" onClick={() => { setGameCountdown(3); setGameStage('countdown'); }}>Start Preview Attempt</button></div>}
            {gameStage === 'countdown' && <div className="mt-8 text-center" data-testid="preview-countdown"><GameSoundToggle /><div className="mt-4 text-6xl font-black">{gameCountdown || 'GO'}</div></div>}
            {gameStage === 'playing' && <div className="mt-4" data-testid="preview-official-game"><div className="mb-3 flex items-center justify-between rounded bg-slate-950 p-3 text-white"><div><div className="text-xs uppercase text-white/60">Server preview timer</div><div className="font-mono text-2xl">{play?.duration_ms != null ? `${(play.duration_ms / 1000).toFixed(2)}s` : <Stopwatch startedAt={play?.started_at} running />}</div></div><GameSoundToggle /></div>{row.game_id === 'memory_match' ? <MemoryBoard memory={preview.memory?.level === level ? preview.memory : null} revealed={revealed} known={known} onClick={click} /> : play && <ClientGame key={play.started_at} play={play} gameId={row.game_id} config={row.game_config} onFinish={completeOfficialPreview} />}</div>}
            {gameStage === 'result' && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5" data-testid="preview-result"><h3 className="text-xl font-black">{play?.status === 'completed' || preview.memory?.status === 'completed' ? 'Preview complete' : 'Preview attempt failed'}</h3><p className="mt-2">{gameQuote}</p><p className="mt-2 font-mono">Time: {play?.duration_ms != null ? `${(play.duration_ms / 1000).toFixed(2)}s` : `${((preview.memory?.duration_ms || 0) / 1000).toFixed(2)}s`}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={btn} onClick={() => setGameStage('ready')}>Retry</button><button type="button" className={btn} onClick={() => setGameStage('idle')}>Continue to preview controls</button></div></div>}
          </section>
        </main>
      </div>}
    </section>
  );
};
