import { useEffect, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { worldAdminAPI, worldAPI } from '../../lib/api';
import { BOARD_STYLES, DEFAULT_BY_TYPE, GAME_TYPES, boardStyleById, resolveBoardStyle, setBoardStyleConfig } from '../../lib/boardStyles';
import { Board3D } from '../games/premium/kit';

const MODES = [['classic', 'Original look'], ['single', 'One style for all games'], ['by_type', 'Different style per game type']];

function PreviewBoard({ style, type }) {
  return (
    <Board3D theme={type} title="Preview Board" level={4} stats={[['Moves', 12], ['Score', '7/9']]} styleOverride={style}>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-square rounded-xl border-b-[5px] border-sky-800 bg-gradient-to-b from-sky-200 to-sky-400" />)}
      </div>
    </Board3D>
  );
}

export default function BoardStylePicker() {
  const [cfg, setCfg] = useState(null);
  const [saved, setSaved] = useState(null);
  const [previewType, setPreviewType] = useState('memory');
  const [msg, setMsg] = useState('');
  useEffect(() => { worldAPI.boardStyle().then((r) => { setCfg(r); setSaved(r); }).catch(() => setMsg('Could not load board styles')); }, []);
  if (!cfg) return msg ? <p className="text-xs text-red-600">{msg}</p> : null;
  const pick = (id) => (cfg.mode === 'by_type'
    ? setCfg({ ...cfg, by_type: { ...DEFAULT_BY_TYPE, ...cfg.by_type, [previewType]: id } })
    : setCfg({ ...cfg, mode: 'single', style_id: id }));
  const activeId = cfg.mode === 'single' ? cfg.style_id : cfg.mode === 'by_type' ? (cfg.by_type[previewType] || DEFAULT_BY_TYPE[previewType]) : null;
  const apply = async () => {
    setMsg('');
    try {
      const body = { ...cfg, by_type: cfg.mode === 'by_type' ? { ...DEFAULT_BY_TYPE, ...cfg.by_type } : {} };
      const r = await worldAdminAPI.setBoardStyle(body);
      setSaved(r); setCfg(r); setBoardStyleConfig(r); setMsg('Applied for all players.');
    } catch (e) { setMsg(e?.response?.data?.detail || 'Apply failed'); }
  };
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="section-board-style">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold text-slate-900"><LayoutGrid className="h-5 w-5 text-[#6C2BFF]" /> Game Board Styles (50)</h2>
      <p className="mb-4 text-xs text-slate-500">Choose the look of the board games are played on. Preview, then apply for every player.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {MODES.map(([m, label]) => <button key={m} type="button" onClick={() => setCfg({ ...cfg, mode: m, style_id: m === 'single' ? (cfg.style_id || BOARD_STYLES[0].id) : cfg.style_id })} data-testid={`board-mode-${m}`}
          className={`rounded-full border px-4 py-2 text-sm font-bold ${cfg.mode === m ? 'border-[#6C2BFF] bg-[#6C2BFF] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{label}</button>)}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-slate-600">Preview game type:</span>
        {GAME_TYPES.map(([k, label]) => <button key={k} type="button" onClick={() => setPreviewType(k)} data-testid={`board-type-${k}`}
          className={`rounded-full px-3 py-1 font-bold ${previewType === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{label}{cfg.mode === 'by_type' && <span className="ml-1 opacity-70">· {boardStyleById(cfg.by_type[k] || DEFAULT_BY_TYPE[k])?.name}</span>}</button>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <div className={`grid max-h-[480px] auto-rows-[76px] grid-cols-2 content-start gap-2 overflow-y-auto pr-1 sm:grid-cols-3 ${cfg.mode === 'classic' ? 'pointer-events-none opacity-40' : ''}`} data-testid="board-style-grid">
          {BOARD_STYLES.map((s) => <button key={s.id} type="button" onClick={() => pick(s.id)} data-testid={`board-style-${s.id}`}
            className={`flex flex-col overflow-hidden rounded-xl border text-left text-xs font-bold ${activeId === s.id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}>
            <span className="block h-12 shrink-0" style={{ background: s.pattern !== 'none' ? `${s.pattern}, radial-gradient(120% 90% at 30% 0%, ${s.from}, ${s.to})` : `radial-gradient(120% 90% at 30% 0%, ${s.from}, ${s.to})`, borderBottom: `3px solid ${s.accent}` }} />
            <span className="block truncate px-2 py-1.5 text-slate-800">{s.name}</span>
          </button>)}
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-950 p-4" data-testid="board-style-preview"><PreviewBoard style={resolveBoardStyle(cfg, previewType)} type={previewType} /></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!dirty} onClick={apply} className="rounded-full bg-[#6C2BFF] px-5 py-2 text-sm font-bold text-white disabled:opacity-50" data-testid="board-style-apply">{dirty ? 'Apply to all players' : 'Currently applied'}</button>
            {msg && <span className="text-xs text-slate-600" data-testid="board-style-msg">{msg}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
