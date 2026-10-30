import { useRef, useState } from 'react';
import { Music, Upload, Volume2 } from 'lucide-react';
import { drawStudioAPI } from '../../lib/api';
import { SOUND_SLOTS } from './drawAudio';

const labels = { countdown: 'Countdown beep', heartbeat: 'Heartbeat (loops)', music: 'Background music (loops)', drumroll: 'Drum roll (loops)', reveal: 'Winner reveal sting', celebration: 'Celebration' };

export function SoundPanel({ uploaded, onUploaded, audio, onError }) {
  const inputs = useRef({});
  const [busy, setBusy] = useState('');
  const upload = async (slot, file) => {
    if (!file) return;
    setBusy(slot);
    try { await drawStudioAPI.uploadAudio(slot, file); await onUploaded(); } catch (e) { onError(e?.response?.data?.detail || 'Upload failed'); } finally { setBusy(''); }
  };
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5" data-testid="draw-sound-panel">
      <h2 className="flex items-center gap-2 text-lg font-black text-amber-300"><Music className="h-5 w-5" /> Sounds</h2>
      <p className="mt-1 text-xs text-indigo-200/70">Upload audio you hold the rights to. Slots without a file use a built-in tone.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {SOUND_SLOTS.map((slot) => {
          const file = uploaded.find((a) => a.slot === slot);
          return (
            <div key={slot} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#0b0f33] px-3 py-2" data-testid={`draw-sound-${slot}`}>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white">{labels[slot]}</div>
                <div className="truncate text-[11px] text-indigo-200/60">{file ? file.original_filename : 'Built-in tone'}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20" onClick={() => audio?.play(slot, { volume: 0.9 })} data-testid={`draw-sound-test-${slot}`} aria-label={`Test ${slot}`}><Volume2 className="h-4 w-4" /></button>
                <button type="button" className="rounded-full bg-amber-400/20 p-2 text-amber-200 transition-colors hover:bg-amber-400/30 disabled:opacity-40" disabled={busy === slot} onClick={() => inputs.current[slot]?.click()} data-testid={`draw-sound-upload-${slot}`} aria-label={`Upload ${slot}`}><Upload className="h-4 w-4" /></button>
                <input ref={(el) => { inputs.current[slot] = el; }} type="file" accept="audio/*" className="hidden" onChange={(e) => upload(slot, e.target.files?.[0])} />
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="mt-3 text-xs font-bold text-indigo-200 underline" onClick={() => audio?.stopAll()} data-testid="draw-sound-stop-all">Stop all sounds</button>
    </section>
  );
}
