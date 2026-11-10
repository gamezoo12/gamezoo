import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { Switch } from '../ui/switch';
import { worldAdminAPI, worldAPI } from '../../lib/api';

export default function UnlimitedGamesToggle() {
  const [enabled, setEnabled] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { worldAPI.unlimitedGames().then((r) => setEnabled(r.enabled)).catch(() => setMsg('Could not load setting')); }, []);
  const save = async (next) => {
    setEnabled(next); setMsg('');
    try { await worldAdminAPI.setUnlimitedGames(next); setMsg(next ? 'On — players see the Unlimited Games button.' : 'Off — the Unlimited Games button is hidden.'); }
    catch { setEnabled(!next); setMsg('Save failed'); }
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="section-unlimited-games">
      <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2 mb-1"><Gift className="w-5 h-5 text-[#6C2BFF]" /> Unlimited Games button</h2>
      <p className="text-xs text-slate-500 mb-4">Show or hide the Unlimited Games button on the Free World map.</p>
      {enabled !== null && (
        <div className="flex flex-wrap items-center gap-3">
          <Switch checked={enabled} onCheckedChange={save} data-testid="unlimited-games-switch" />
          <span className="text-sm font-bold text-slate-800" data-testid="unlimited-games-state">{enabled ? 'ON' : 'OFF'}</span>
          {msg && <span className="text-xs text-slate-600" data-testid="unlimited-games-msg">{msg}</span>}
        </div>
      )}
      {enabled === null && msg && <span className="text-xs text-red-600">{msg}</span>}
    </section>
  );
}
