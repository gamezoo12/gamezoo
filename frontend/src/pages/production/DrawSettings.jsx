import { useCallback, useEffect, useRef, useState } from 'react';
import { Save, ShieldAlert, Timer } from 'lucide-react';
import { drawStudioAPI } from '../../lib/api';
import { DrawAudio } from '../../components/drawstudio/drawAudio';
import { SoundPanel } from '../../components/drawstudio/SoundPanel';

const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : 'Request failed'; };

export default function DrawSettings() {
  const [settings, setSettings] = useState(null);
  const [uploaded, setUploaded] = useState([]);
  const [volumes, setVolumes] = useState({});
  const [msg, setMsg] = useState(['', '']);
  const [audio, setAudio] = useState(null);
  const saveTimer = useRef(null);

  const loadAudio = useCallback(async (engine) => {
    const r = await drawStudioAPI.audio();
    setUploaded(r.audio);
    setVolumes(r.volumes);
    engine.setVolumes(r.volumes);
    await engine.load(r.audio.map((a) => a.slot));
  }, []);
  useEffect(() => {
    const engine = new DrawAudio();
    setAudio(engine);
    drawStudioAPI.settings().then(setSettings).catch((e) => setMsg([errText(e), '']));
    loadAudio(engine).catch(() => engine.load([]));
    return () => engine.close();
  }, [loadAudio]);

  const persistVolumes = (v) => {
    setVolumes(v);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => drawStudioAPI.saveSettings({ volumes: v }).catch((e) => setMsg([errText(e), ''])), 600);
  };
  const saveBonus = async () => {
    try {
      setSettings(await drawStudioAPI.saveSettings({ bonus_expiry_enabled: settings.bonus_expiry_enabled, bonus_expiry_days: Number(settings.bonus_expiry_days) }));
      setMsg(['', 'Bonus Token rules saved. They apply to rewards approved from now on.']);
    } catch (e) { setMsg([errText(e), '']); }
  };

  return (
    <div className="-m-4 min-h-screen bg-[#07041a] p-4 pb-32 text-white sm:-m-6 sm:p-8 sm:pb-32" data-testid="draw-settings-page">
      <h1 className="text-4xl font-black tracking-tight">Draw Settings &amp; Audio</h1>
      <p className="mt-2 text-sm text-indigo-200/70">Studio sounds, volumes and the reward rules used when you approve draw winners.</p>
      {msg[0] && <div role="alert" className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-200" data-testid="draw-settings-error">{msg[0]}</div>}
      {msg[1] && <div role="status" className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-200" data-testid="draw-settings-notice">{msg[1]}</div>}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <SoundPanel uploaded={uploaded} audio={audio} volumes={volumes} onVolumes={persistVolumes} onUploaded={() => loadAudio(audio)} onError={(e) => setMsg([e, ''])} />
        {settings && <aside className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5" data-testid="draw-bonus-rules">
            <h2 className="flex items-center gap-2 text-lg font-black text-amber-300"><Timer className="h-5 w-5" /> Bonus Token rewards</h2>
            <p className="mt-1 text-xs text-indigo-200/70">When a draw reward is credited as Bonus Tokens, it follows this expiry rule. Winnings Tokens never expire.</p>
            <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-amber-400" checked={settings.bonus_expiry_enabled} onChange={(e) => setSettings({ ...settings, bonus_expiry_enabled: e.target.checked })} data-testid="draw-bonus-expiry-enabled" />Bonus Tokens expire</label>
            <label className="mt-3 block text-xs text-indigo-200/70">Expire after (days)<input type="number" min="1" max="3650" disabled={!settings.bonus_expiry_enabled} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-[#0b0724] px-3 text-sm text-white disabled:opacity-50" value={settings.bonus_expiry_days} onChange={(e) => setSettings({ ...settings, bonus_expiry_days: e.target.value })} data-testid="draw-bonus-expiry-days" /></label>
            <button type="button" onClick={saveBonus} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-[#1a1033]" data-testid="draw-bonus-save"><Save className="h-4 w-4" />Save rules</button>
          </section>
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5" data-testid="draw-gate-status">
            <h2 className="flex items-center gap-2 text-lg font-black text-amber-300"><ShieldAlert className="h-5 w-5" /> Official draws</h2>
            <p className="mt-2 text-sm">{settings.official_draws_enabled ? <span className="font-bold text-emerald-300">Enabled</span> : <span className="font-bold text-amber-200">Disabled</span>} · controlled by the Random Draw engine switch in Admin Panel → Company Settings (after UK legal review).</p>
          </section>
        </aside>}
      </div>
    </div>
  );
}
