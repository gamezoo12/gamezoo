import { useRef, useState } from 'react';
import { Music, Upload, Volume2 } from 'lucide-react';
import { drawStudioAPI } from '../../lib/api';
import { DEFAULT_VOLUMES, SOUND_SLOTS } from './drawAudio';

const labels = { entry: 'Ticket entry', music: 'Mixing music (loops)', heartbeat: 'Heartbeat (loops)', countdown: 'Countdown beep', drumroll: 'Draw drum roll (loops)', reveal: 'Dramatic ticket reveal', announcement: 'Winner announcement', celebration: 'Celebration' };

function SoundRow({ slot, file, volume, setVolume, audio, busy, onUpload }) {
  const input = useRef(null);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-[#0b0724] px-3 py-2.5 sm:grid-cols-[1fr_180px_auto]" data-testid={`draw-sound-${slot}`}>
      <div className="min-w-0"><div className="text-sm font-bold text-white">{labels[slot]}</div><div className="truncate text-[11px] text-indigo-200/60">{file ? file.original_filename : 'Built-in sound'}</div></div>
      <label className="col-span-2 flex items-center gap-2 text-[11px] text-indigo-200/70 sm:col-span-1 sm:row-auto">Vol<input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(slot, Number(e.target.value))} className="w-full accent-amber-400" data-testid={`draw-sound-volume-${slot}`} /><span className="w-8 text-right text-white">{Math.round(volume * 100)}</span></label>
      <div className="col-start-2 row-start-1 flex gap-1 sm:col-start-auto">
        <button type="button" className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20" onClick={() => { audio?.stopAll(); audio?.play(slot); }} data-testid={`draw-sound-test-${slot}`} aria-label={`Preview ${labels[slot]}`}><Volume2 className="h-4 w-4" /></button>
        <button type="button" className="rounded-full bg-amber-400/20 p-2 text-amber-200 transition-colors hover:bg-amber-400/30 disabled:opacity-40" disabled={busy} onClick={() => input.current?.click()} data-testid={`draw-sound-upload-${slot}`} aria-label={`Upload or replace ${labels[slot]}`}><Upload className="h-4 w-4" /></button>
        <input ref={input} type="file" accept="audio/*" className="hidden" onChange={(e) => onUpload(slot, e.target.files?.[0])} />
      </div>
    </div>
  );
}

export function SoundPanel({ uploaded, onUploaded, audio, onError, volumes, onVolumes }) {
  const [busy, setBusy] = useState('');
  const vols = { ...DEFAULT_VOLUMES, ...(volumes || {}) };
  const upload = async (slot, file) => {
    if (!file) return;
    setBusy(slot);
    try { await drawStudioAPI.uploadAudio(slot, file); await onUploaded(); } catch (e) { onError(e?.response?.data?.detail || 'Upload failed'); } finally { setBusy(''); }
  };
  const setVolume = (slot, v) => { const next = { ...vols, [slot]: v }; audio?.setVolumes(next); onVolumes(next); };
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5" data-testid="draw-sound-panel">
      <h2 className="flex items-center gap-2 text-lg font-black text-amber-300"><Music className="h-5 w-5" /> Studio sounds</h2>
      <p className="mt-1 text-xs text-indigo-200/70">Upload audio you hold the rights to (MP3, WAV, OGG, AAC, M4A, under 15 MB). Slots without a file use a built-in sound.</p>
      <div className="mt-4 grid gap-2">
        {SOUND_SLOTS.map((slot) => <SoundRow key={slot} slot={slot} file={uploaded.find((a) => a.slot === slot)} volume={vols[slot]} setVolume={setVolume} audio={audio} busy={busy === slot} onUpload={upload} />)}
      </div>
      <button type="button" className="mt-3 text-xs font-bold text-indigo-200 underline" onClick={() => audio?.stopAll()} data-testid="draw-sound-stop-all">Stop all sounds</button>
    </section>
  );
}
