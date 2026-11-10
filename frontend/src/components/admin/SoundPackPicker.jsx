import { useEffect, useState } from 'react';
import { Music, Play } from 'lucide-react';
import { worldAdminAPI, worldAPI } from '../../lib/api';
import { SOUND_EVENTS, SOUND_PACKS, playPack, setActiveSoundPack } from '../../lib/soundPacks';

const nameOf = (id) => SOUND_PACKS.find((p) => p.id === id)?.name || 'Original sounds';

export default function SoundPackPicker() {
  const [applied, setApplied] = useState(undefined);
  const [selected, setSelected] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { worldAPI.soundPack().then((r) => { setApplied(r.pack_id || null); setSelected(r.pack_id || null); }).catch(() => setMsg('Could not load sound pack')); }, []);
  if (applied === undefined) return msg ? <p className="text-xs text-red-600">{msg}</p> : null;
  const selectedPack = SOUND_PACKS.find((p) => p.id === selected);
  const choose = (p) => { setSelected(p.id); playPack(p, 'success'); };
  const apply = async () => {
    setMsg('');
    try { await worldAdminAPI.setSoundPack(selected); setApplied(selected); setActiveSoundPack(selected); setMsg(`Applied "${nameOf(selected)}" for all players.`); }
    catch { setMsg('Apply failed'); }
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="section-sound-pack">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold text-slate-900"><Music className="h-5 w-5 text-[#6C2BFF]" /> Game Sound Packs (100)</h2>
      <p className="mb-4 text-xs text-slate-500">Tap a pack to hear it, try each sound, then apply for every player. Changes tap, correct, wrong, countdown, start, win and lose sounds.</p>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid max-h-[420px] auto-rows-[44px] grid-cols-2 content-start gap-2 overflow-y-auto pr-1 sm:grid-cols-4" data-testid="sound-pack-grid">
          <button type="button" onClick={() => setSelected(null)} data-testid="sound-pack-original"
            className={`rounded-xl border px-2 text-left text-xs font-bold ${selected === null ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200'}`}>Original sounds{applied === null && ' ✓'}</button>
          {SOUND_PACKS.map((p) => <button key={p.id} type="button" onClick={() => choose(p)} data-testid={`sound-pack-${p.id}`}
            className={`flex items-center gap-1.5 rounded-xl border px-2 text-left text-xs font-bold text-slate-800 ${selected === p.id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}>
            <Play className="h-3 w-3 shrink-0 text-[#6C2BFF]" /><span className="truncate">{p.name}</span>{applied === p.id && <span className="ml-auto text-emerald-600">✓</span>}
          </button>)}
        </div>
        <div className="space-y-3 rounded-2xl bg-slate-50 p-4" data-testid="sound-pack-preview">
          <p className="text-sm font-black text-slate-900">{nameOf(selected)}</p>
          {selectedPack ? <div className="grid grid-cols-2 gap-2">
            {SOUND_EVENTS.map(([k, label]) => <button key={k} type="button" onClick={() => playPack(selectedPack, k)} data-testid={`sound-try-${k}`}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"><Play className="h-3 w-3" />{label}</button>)}
          </div> : <p className="text-xs text-slate-500">The recorded sounds players hear today.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={selected === applied} onClick={apply} className="rounded-full bg-[#6C2BFF] px-5 py-2 text-sm font-bold text-white disabled:opacity-50" data-testid="sound-pack-apply">{selected === applied ? 'Currently applied' : 'Apply to all players'}</button>
            {msg && <span className="text-xs text-slate-600" data-testid="sound-pack-msg">{msg}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
