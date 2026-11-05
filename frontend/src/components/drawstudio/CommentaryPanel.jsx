import { useEffect, useState } from 'react';
import { Mic, Play, Save, Volume2 } from 'lucide-react';
import { drawStudioAPI } from '../../lib/api';
import { HostPicker } from './HostPicker';
import { playSegments } from './studio/commentary';

const STYLE_LABELS = { energetic: 'Energetic game-show hype', classy: 'Calm & classy', fun: 'Fun & cheeky banter' };
const field = 'mt-1 h-10 w-full rounded-lg border border-white/15 bg-[#0b0724] px-3 text-sm text-white';
const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : 'Commentary is unavailable right now'; };

// AI voice commentary: named AI hosts (solo or a male + female duo) explain and hype each stage of the draw.
export function CommentaryPanel({ value, audio, volume, onVolume, onSaved, onSample, onError }) {
  const [c, setC] = useState(value);
  const [opts, setOpts] = useState({ languages: [value.language], styles: Object.keys(STYLE_LABELS), hosts: [] });
  const [busy, setBusy] = useState('');
  const [spoken, setSpoken] = useState([]);
  useEffect(() => { drawStudioAPI.commentaryOptions().then(setOpts).catch(() => {}); }, []);
  const set = (k, v) => setC({ ...c, [k]: v });
  const save = async () => { setBusy('save'); try { const s = await drawStudioAPI.saveSettings({ commentary: c }); setC(s.commentary); onSaved(); } catch (e) { onError(errText(e)); } finally { setBusy(''); } };
  const test = async () => {
    setBusy('test');
    try { audio?.stopAll(); const line = await drawStudioAPI.commentary({ stage: 'test', mode: 'test', override: { ...c, enabled: true } }); setSpoken(line.segments); setBusy('speaking'); await playSegments(line.segments, audio); } catch (e) { onError(errText(e)); } finally { setBusy(''); }
  };
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5" data-testid="draw-commentary-panel">
      <h2 className="flex items-center gap-2 text-lg font-black text-amber-300"><Mic className="h-5 w-5" /> Voice commentary</h2>
      <p className="mt-1 text-xs text-indigo-200/70">AI hosts present every stage live (welcome, how the draw works, each round, the mix, the winners and the finale) using only this draw's real details. Their voice, subtitles and host card are included in recordings.</p>
      <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="h-4 w-4 accent-amber-400" checked={c.enabled} onChange={(e) => set('enabled', e.target.checked)} data-testid="draw-commentary-enabled" />Auto commentary during draws</label>
      {opts.hosts?.length > 0 && <div className="mt-4"><HostPicker hosts={opts.hosts} mode={c.mode} host={c.host} duo={c.duo} onMode={(m) => set('mode', m)} onHost={(h) => set('host', h)} onDuo={(d) => set('duo', d)} /></div>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block text-xs text-indigo-200/70">Language<select className={field} value={c.language} onChange={(e) => set('language', e.target.value)} data-testid="draw-commentary-language">{opts.languages.map((l) => <option key={l}>{l}</option>)}</select></label>
        <label className="block text-xs text-indigo-200/70">Show style<select className={field} value={c.style} onChange={(e) => set('style', e.target.value)} data-testid="draw-commentary-style">{opts.styles.map((s) => <option key={s} value={s}>{STYLE_LABELS[s] || s}</option>)}</select></label>
        <label className="flex items-center gap-2 self-end pb-2 text-xs text-indigo-200/70"><input type="checkbox" className="h-4 w-4 accent-amber-400" checked={c.hd} onChange={(e) => set('hd', e.target.checked)} data-testid="draw-commentary-hd" />HD voice (richer, slightly slower)</label>
      </div>
      <label className="mt-3 block text-xs text-indigo-200/70">Host notes (optional: sponsor shout-outs, next draw date…)<textarea maxLength={500} rows={3} className={`${field} h-auto py-2`} value={c.notes} onChange={(e) => set('notes', e.target.value)} data-testid="draw-commentary-notes" /></label>
      <label className="mt-3 flex items-center gap-2 text-[11px] text-indigo-200/70">Volume<input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => onVolume(Number(e.target.value))} className="w-full accent-amber-400" data-testid="draw-commentary-volume" /><span className="w-8 text-right text-white">{Math.round(volume * 100)}</span></label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={!!busy} onClick={save} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-[#1a1033] disabled:opacity-50" data-testid="draw-commentary-save"><Save className="h-4 w-4" />{busy === 'save' ? 'Saving…' : 'Save commentary'}</button>
        <button type="button" disabled={!!busy} onClick={test} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold text-white disabled:opacity-50" data-testid="draw-commentary-test"><Volume2 className="h-4 w-4" />{busy === 'test' ? 'Preparing hosts…' : busy === 'speaking' ? 'Speaking…' : 'Test voice'}</button>
        <button type="button" disabled={!!busy} onClick={() => onSample(c)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-fuchsia-600 px-4 text-sm font-black text-white disabled:opacity-50" data-testid="draw-commentary-sample"><Play className="h-4 w-4" />Play sample show</button>
      </div>
      {spoken.length > 0 && <div className="mt-3 space-y-1.5 rounded-xl bg-black/30 p-3 text-sm text-white/90" data-testid="draw-commentary-spoken">{spoken.map((s, i) => <p key={i}><b className="text-amber-300">{s.name}:</b> {s.text}</p>)}</div>}
      <p className="mt-2 text-[11px] text-indigo-200/50">The sample show runs a made-up two-round draw with your current choices (even unsaved), with voice and on-screen subtitles. Nothing is saved or credited.</p>
      {c.language !== 'English' && <p className="mt-3 text-[11px] text-indigo-200/50">Voices are tuned for English, so other languages may carry a slight accent.</p>}
    </section>
  );
}
