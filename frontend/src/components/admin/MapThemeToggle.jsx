import { useEffect, useState } from 'react';
import { Film, Snowflake, Trash2, Upload } from 'lucide-react';
import { uploadsAPI, worldAdminAPI, worldAPI } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/media';

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration); };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this video file.')); };
    video.src = url;
  });
}

export default function MapThemeToggle() {
  const [t, setT] = useState(null);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => { worldAPI.mapTheme().then(setT).catch(() => setMsg('Could not load map theme')); }, []);
  if (!t) return null;
  const save = async (next) => {
    const prev = t;
    setT(next); setMsg('');
    try { await worldAdminAPI.setMapTheme(next); setMsg('Saved. Players see it next time they open Free World.'); return true; } catch { setT(prev); setMsg('Save failed'); return false; }
  };
  const uploadMedia = async (file) => {
    if (!file) return;
    setUploading(true); setProgress(0); setMsg('');
    try {
      const isVideo = file.type.startsWith('video/');
      if (!isVideo && !file.type.startsWith('image/')) throw new Error('Choose an image or video file.');
      let uploaded;
      if (isVideo) {
        const duration = await readVideoDuration(file);
        if (!(duration > 0 && duration < 60)) throw new Error('Choose a video shorter than 1 minute.');
        uploaded = await uploadsAPI.video(file, duration, setProgress);
      } else {
        uploaded = await uploadsAPI.image(file);
      }
      const mediaType = isVideo ? 'video' : 'image';
      if (await save({ ...t, intro_media_url: uploaded.url, intro_media_type: mediaType })) setMsg(`${mediaType === 'video' ? 'Video' : 'Image'} saved in original quality. It will appear when players open Free World.`);
    } catch (error) {
      setMsg(error?.response?.data?.detail || error.message || 'Media upload failed.');
    } finally { setUploading(false); }
  };
  const clearMedia = () => save({ ...t, intro_media_url: null, intro_media_type: null });
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
      </div>
      <div className="mt-5 border-t border-slate-200 pt-4" data-testid="free-world-intro-video">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Film className="h-4 w-4" />Free World intro media</h3>
        <p className="mt-1 text-xs text-slate-500">Upload an image or a video under 1 minute. Files play or display full-screen in their original quality each time a player opens Free World.</p>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={t.intro_media_enabled !== false} disabled={!t.intro_media_url} onChange={(event) => save({ ...t, intro_media_enabled: event.target.checked })} data-testid="free-world-intro-media-enabled" />
          Show intro media when players open Free World
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
            <Upload className="h-4 w-4" />{uploading ? `Uploading ${progress}%` : t.intro_media_url ? 'Replace media' : 'Upload image or video'}
            <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v" className="hidden" disabled={uploading} onChange={(event) => { uploadMedia(event.target.files?.[0]); event.target.value = ''; }} data-testid="free-world-intro-media-upload" />
          </label>
          {t.intro_media_url && <>
            {t.intro_media_type === 'video'
              ? <video src={resolveMediaUrl(t.intro_media_url)} controls playsInline className="h-20 w-36 rounded-lg bg-black object-contain" data-testid="free-world-intro-media-preview" />
              : <img src={resolveMediaUrl(t.intro_media_url)} alt="Free World intro preview" className="h-20 w-36 rounded-lg bg-black object-contain" data-testid="free-world-intro-media-preview" />}
            <button type="button" onClick={clearMedia} disabled={uploading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 px-3 text-sm font-bold text-rose-700 disabled:opacity-50" data-testid="free-world-intro-media-remove"><Trash2 className="h-4 w-4" />Remove</button>
          </>}
        </div>
        {msg && <p className="mt-2 text-xs text-slate-600" data-testid="free-world-intro-video-msg">{msg}</p>}
      </div>
    </section>
  );
}
