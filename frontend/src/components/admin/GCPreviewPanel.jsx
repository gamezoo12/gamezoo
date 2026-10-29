import { useEffect, useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { worldGcCompetitionAdminAPI as gcApi } from '../../lib/api';

const levelKeys = [...Array.from({ length: 10 }, (_, i) => `L${i + 1}`), 'champion'];
const btn = 'rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40';
const errText = (e) => {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg).filter(Boolean).join('; ') || 'Invalid preview input.';
  return detail?.message || 'Preview action failed.';
};

function MemoryBoard({ memory, revealed, onClick }) {
  if (!memory) return null;
  return (
    <div className="mt-3" data-testid="preview-memory-board">
      <p className="text-xs text-slate-600">Memory Match {memory.level} · clicks {memory.click_count} · retries {memory.retries} · {memory.status === 'completed' ? `finished in ${(memory.duration_ms / 1000).toFixed(2)}s` : 'stopwatch running'}</p>
      <div className="mt-2 grid max-w-md grid-cols-6 gap-2">
        {Array.from({ length: memory.card_count }, (_, pos) => {
          const done = memory.matched_positions.includes(pos);
          const shown = done || revealed[pos] !== undefined;
          return <button key={pos} type="button" disabled={done || memory.status !== 'playing'} onClick={() => onClick(pos)}
            className={`h-12 rounded-lg text-sm font-black transition-transform hover:scale-105 ${done ? 'bg-emerald-200 text-emerald-900' : shown ? 'bg-amber-200' : 'bg-slate-800 text-white'}`}
            data-testid={`preview-card-${pos}`}>{shown ? (revealed[pos] ?? '✓') : '?'}</button>;
        })}
      </div>
    </div>
  );
}

export const GCPreviewPanel = ({ gcNumber }) => {
  const [preview, setPreview] = useState(null);
  const [level, setLevel] = useState('L1');
  const [revealed, setRevealed] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    if (Object.keys(next).length >= 2) setTimeout(() => setRevealed({}), 600);
  };
  const row = preview && (level === 'champion' ? preview.champion : preview.levels[Number(level.slice(1)) - 1]);
  const ranked = [...(preview?.scores?.[level] || [])].sort((a, b) => a.duration_ms - b.duration_ms);

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
          <label className="text-xs font-semibold">Game <select className="ml-1 rounded border px-2 py-1" value={row?.game_id || ''} onChange={(e) => call(gcApi.previewAction({ action: 'update_config', config: level === 'champion' ? { champion: { game_id: e.target.value } } : { levels: [{ level: Number(level.slice(1)), game_id: e.target.value }] } }))} data-testid="preview-game-select"><option value="memory_match">Memory Match</option><option value="number_sequence">Number Sequence</option><option value="colour_match">Colour Match</option></select></label>
          <label className="text-xs font-semibold">Simulated time <input type="datetime-local" className="ml-1 rounded border px-2 py-1" onChange={(e) => e.target.value && act('set_time', { sim_now: new Date(e.target.value).toISOString() })} data-testid="preview-sim-time" /></label>
        </div>
        {level !== 'champion' && preview.model === 'every_level' && <div className="flex flex-wrap gap-2" data-testid="preview-bonus-inputs">{[1, 2, 3, 4, 5].map((r) => <label key={r} className="text-xs">#{r} <input type="number" min="0" max="500" className="w-16 rounded border px-1" value={row.bonus_rewards?.[String(r)] ?? 0} onChange={(e) => call(gcApi.previewAction({ action: 'update_config', config: { levels: [{ level: Number(level.slice(1)), bonus_rewards: { ...row.bonus_rewards, [String(r)]: Number(e.target.value) } }] } }))} /></label>)}</div>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={busy} onClick={() => act('jump')} data-testid="preview-jump-btn">Jump here</button>
          <button type="button" className={btn} disabled={busy} onClick={() => act('open_level')} data-testid="preview-open-btn">Open</button>
          <button type="button" className={btn} disabled={busy} onClick={() => act('close_level')} data-testid="preview-close-btn">Close</button>
          <button type="button" className={btn} disabled={busy} onClick={() => act('simulate_players', { count: 6 })} data-testid="preview-simulate-btn">Simulate 6 players</button>
          <button type="button" className={btn} disabled={busy || row?.game_id !== 'memory_match'} onClick={() => { setRevealed({}); act('memory_start'); }} data-testid="preview-play-btn">Play Memory Match (retry)</button>
          <button type="button" className={btn} disabled={busy} onClick={() => act('finalize_level')} data-testid="preview-finalize-btn">{level === 'champion' ? 'Finalize Champion & payouts' : 'Finalize level'}</button>
        </div>
        <MemoryBoard memory={preview.memory?.level === level ? preview.memory : null} revealed={revealed} onClick={click} />
        <div className="grid gap-3 md:grid-cols-2 text-xs">
          <div data-testid="preview-leaderboard"><b>Simulated leaderboard</b>{ranked.slice(0, 10).map((s, i) => <div key={`${s.player_id}-${i}`}>{i + 1}. {s.name} · {(s.duration_ms / 1000).toFixed(2)}s</div>)}</div>
          <div data-testid="preview-wallets"><b>Simulated wallets</b>{Object.entries(preview.wallet || {}).map(([pid, w]) => <div key={pid}>{pid}: pending {w.bonus_pending || 0} · credited {w.bonus_credited || 0} · forfeited {w.bonus_forfeited || 0} · champion {w.champion_tokens || 0}</div>)}</div>
        </div>
        {preview.champion_result && <p className="text-xs" data-testid="preview-champion-result"><b>Champion winners:</b> {preview.champion_result.map((w) => `${w.rank}. ${w.name} +${w.champion_prize_tokens}`).join(' · ')}</p>}
        <p className="text-[11px] text-slate-500">Sim time: {preview.sim_now} · {preview.log?.slice(-1)[0]}</p>
      </div>}
    </section>
  );
};
