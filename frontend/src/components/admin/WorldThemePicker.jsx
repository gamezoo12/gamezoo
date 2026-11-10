import { useEffect, useMemo, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { worldAdminAPI, worldAPI } from '../../lib/api';
import { WORLD_THEMES, DEFAULT_THEME_ID, themeById, themeVars, applyWorldTheme } from '../../lib/worldThemes';
import '../../world/styles/freeWorldGameV3.css';

function ThemePreview({ theme }) {
  return (
    <div style={themeVars(theme)} className="rounded-2xl bg-slate-900 p-4" data-testid="world-theme-preview">
      <div className="fwv3-card" style={{ width: '100%', padding: 16 }}>
        <div className="fwv3-game-banner" style={{ minHeight: 70 }}>
          <div className="fwv3-game-banner-copy"><span>SKILL GAME</span><h2 style={{ fontSize: 26 }}>MEMORY MATCH</h2></div>
        </div>
        <div className="fwv3-stat-grid" style={{ margin: '10px 0' }}>
          {[['TIME LIMIT', 'NO LIMIT'], ['GAME', 'Memory'], ['ATTEMPTS', '3']].map(([a, b]) => (
            <article key={a} style={{ minHeight: 80 }}><div><span>{a}</span><strong style={{ fontSize: 20 }}>{b}</strong></div></article>
          ))}
        </div>
        <div className="fwv3-info-box"><p style={{ fontSize: 14 }}>Match every pair as fast as you can.</p></div>
        <div className="fwv3-entry-actions">
          <button type="button" className="fwv3-button fwv3-button-outline" style={{ minHeight: 48, fontSize: 16 }}>Play demo</button>
          <button type="button" className="fwv3-button fwv3-button-primary" style={{ minHeight: 48, fontSize: 16 }}>Start attempt</button>
        </div>
      </div>
    </div>
  );
}

export default function WorldThemePicker() {
  const [applied, setApplied] = useState(null);
  const [selected, setSelected] = useState(DEFAULT_THEME_ID);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { worldAPI.uiTheme().then((r) => { setApplied(r.theme_id); setSelected(r.theme_id); }).catch(() => setMsg('Could not load theme')); }, []);
  const theme = useMemo(() => themeById(selected), [selected]);
  const apply = async () => {
    setBusy(true); setMsg('');
    try { await worldAdminAPI.setUiTheme(selected); setApplied(selected); applyWorldTheme(selected); setMsg(`Applied "${theme.name}" for all players.`); }
    catch { setMsg('Apply failed'); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="section-world-theme">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold text-slate-900"><Palette className="h-5 w-5 text-[#6C2BFF]" /> Free World Colour Theme</h2>
      <p className="mb-4 text-xs text-slate-500">Pick one of 100 themes, check the preview, then apply. Changes colours of level popups, game screens and leaderboards for every player.</p>
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="grid max-h-[460px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-4" data-testid="world-theme-grid">
          {WORLD_THEMES.map((t) => (
            <button key={t.id} type="button" onClick={() => setSelected(t.id)} data-testid={`world-theme-${t.id}`}
              className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs font-bold transition-colors ${selected === t.id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}>
              <span className="flex h-7 w-10 shrink-0 overflow-hidden rounded-md border border-black/10">
                <i className="flex-1" style={{ background: t.colours.accent }} /><i className="flex-1" style={{ background: t.colours.card }} /><i className="flex-1" style={{ background: t.colours.soft }} />
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-800">{t.name}</span>
              {applied === t.id && <Check className="h-3.5 w-3.5 text-emerald-600" />}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <ThemePreview theme={theme} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || selected === applied} onClick={apply} className="rounded-full bg-[#6C2BFF] px-5 py-2 text-sm font-bold text-white disabled:opacity-50" data-testid="world-theme-apply">
              {selected === applied ? 'Currently applied' : `Apply "${theme.name}"`}
            </button>
            {msg && <span className="text-xs text-slate-600" data-testid="world-theme-msg">{msg}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
