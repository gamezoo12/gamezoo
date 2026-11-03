import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { drawStudioAPI } from '../../lib/api';

const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : 'Upload failed'; };

// One full-screen image shown behind the draw machine in every studio broadcast.
export function BackdropPanel({ backdrop, onChange, onError }) {
  const input = useRef(null);
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!backdrop) { setUrl(null); return undefined; }
    let u = null;
    drawStudioAPI.backdropBlob().then((b) => { u = URL.createObjectURL(b); setUrl(u); }).catch(() => setUrl(null));
    return () => u && URL.revokeObjectURL(u);
  }, [backdrop]);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const r = await drawStudioAPI.uploadBackdrop(file); onChange(r.backdrop); } catch (e) { onError(errText(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const remove = async () => { setBusy(true); try { await drawStudioAPI.deleteBackdrop(); onChange(null); } catch (e) { onError(errText(e)); } finally { setBusy(false); } };
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5" data-testid="draw-backdrop-panel">
      <h2 className="flex items-center gap-2 text-lg font-black text-amber-300"><ImagePlus className="h-5 w-5" /> Studio backdrop</h2>
      <p className="mt-1 text-xs text-indigo-200/70">A full-screen picture behind the draw machine (JPG, PNG or WEBP, under 12 MB, landscape 1920×1080 works best). Leave empty for the plain studio.</p>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="group relative mt-4 block aspect-video w-full overflow-hidden rounded-xl border-2 border-dashed border-white/20 bg-[#0b0724] transition-colors hover:border-amber-300/60" data-testid="draw-backdrop-holder">
        {url ? <img src={url} alt="Studio backdrop" className="h-full w-full object-cover" data-testid="draw-backdrop-preview" />
          : <span className="flex h-full flex-col items-center justify-center gap-2 text-sm font-bold text-indigo-200/70"><ImagePlus className="h-8 w-8" />{busy ? 'Uploading…' : 'Tap to add a full-screen image'}</span>}
        {url && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1.5 text-center text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">{busy ? 'Uploading…' : 'Replace image'}</span>}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="draw-backdrop-input" />
      {backdrop && <div className="mt-2 flex items-center justify-between text-[11px] text-indigo-200/60"><span className="truncate">{backdrop.original_filename}</span>
        <button type="button" disabled={busy} onClick={remove} className="inline-flex items-center gap-1 font-bold text-rose-300 hover:text-rose-200" data-testid="draw-backdrop-remove"><Trash2 className="h-3.5 w-3.5" />Remove</button></div>}
    </section>
  );
}
