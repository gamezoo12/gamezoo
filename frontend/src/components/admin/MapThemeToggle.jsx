import { useEffect, useState } from 'react';
import { Snowflake } from 'lucide-react';
import { worldAdminAPI, worldAPI } from '../../lib/api';

export default function MapThemeToggle() {
  const [t, setT] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { worldAPI.mapTheme().then(setT).catch(() => setMsg('Could not load map theme')); }, []);
  if (!t) return null;
  const save = async (next) => {
    setT(next); setMsg('');
    try { await worldAdminAPI.setMapTheme(next); setMsg('Saved. Players see it next time they open Free World.'); } catch { setMsg('Save failed'); }
  };
  const pill = (active) => `rounded-full px-4 py-2 text-sm font-bold border ${active ? 'bg-[#6C2BFF] text-white border-[#6C2BFF]' : 'bg-white text-slate-700 border-slate-300'}`;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="section-map-theme">
      <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2 mb-1"><Snowflake className="w-5 h-5 text-[#6C2BFF]" /> Map Theme (Championships 1–10)</h2>
      <p className="text-xs text-slate-500 mb-4">Switch between the festive Christmas & New Year maps and the original maps.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={pill(t.theme === 'festive')} onClick={() => save({ ...t, theme: 'festive' })} data-testid="map-theme-festive">Festive</button>
        <button type="button" className={pill(t.theme === 'classic')} onClick={() => save({ ...t, theme: 'classic' })} data-testid="map-theme-classic">Original</button>
        <label className="ml-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={t.effects} disabled={t.theme !== 'festive'} onChange={(e) => save({ ...t, effects: e.target.checked })} data-testid="map-theme-effects" />
          Snow &amp; fireworks
        </label>
        {msg && <span className="text-xs text-slate-600" data-testid="map-theme-msg">{msg}</span>}
      </div>
    </section>
  );
}
