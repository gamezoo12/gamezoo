import { useEffect, useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { worldGcCompetitionAdminAPI as gcApi } from '../../lib/api';
import { GAME_CATALOG } from '../../lib/gameCatalog';
import { PreviewPlaySurface } from './PreviewPlaySurface';
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
          <label className="text-xs font-semibold">Game <select className="ml-1 rounded border px-2 py-1" value={row?.game_id || ''} onChange={(e) => call(gcApi.previewAction({ action: 'update_config', config: level === 'champion' ? { champion: { game_id: e.target.value } } : { levels: [{ level: Number(level.slice(1)), game_id: e.target.value }] } }))} data-testid="preview-game-select">{row && !GAME_CATALOG.some((g) => g.id === row.game_id) && <option value={row.game_id || ''}>{row.game_id === 'colour_match' ? 'Colour Match (Free World)' : row.game_id || '—'}</option>}{GAME_CATALOG.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
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
          <div className={`mx-auto ${previewViewport === 'mobile' ? 'w-full max-w-[390px]' : 'w-full max-w-4xl'}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-white">
              <span className="rounded-full bg-rose-500/20 px-3 py-1 text-[11px] font-black text-rose-100" data-testid="preview-phase">PREVIEW · {gameStage}</span>
              <div className="flex items-center gap-2"><div className="inline-flex rounded-md border border-white/20 p-1"><button type="button" aria-pressed={previewViewport === 'desktop'} onClick={() => setPreviewViewport('desktop')} className={`rounded px-2 py-1 text-xs font-bold ${previewViewport === 'desktop' ? 'bg-white text-slate-900' : ''}`} data-testid="preview-viewport-desktop">Desktop</button><button type="button" aria-pressed={previewViewport === 'mobile'} onClick={() => setPreviewViewport('mobile')} className={`rounded px-2 py-1 text-xs font-bold ${previewViewport === 'mobile' ? 'bg-white text-slate-900' : ''}`} data-testid="preview-viewport-mobile">Mobile</button></div><button type="button" onClick={() => setGameStage('idle')} className="rounded border border-white/30 px-3 py-2 text-sm font-bold" data-testid="preview-exit-btn">Exit preview</button></div>
            </div>
            <PreviewPlaySurface gcNumber={gcNumber} levelKey={level} row={row} stage={gameStage} setStage={(s) => { if (s === 'countdown') setGameCountdown(3); setGameStage(s); }}
              play={play} memory={preview.memory?.level === level ? preview.memory : null} revealed={revealed} known={known} onMemoryClick={click}
              onComplete={completeOfficialPreview} countdown={gameCountdown} quote={gameQuote} demoKey={demoKey} setDemoKey={setDemoKey} />
          </div>
        </main>
      </div>}
    </section>
  );
};
