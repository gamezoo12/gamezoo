import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function ProfilePictureCrop({ file, onCancel, onConfirm, busy }) {
  const [url, setUrl] = useState('');
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const imageRef = useRef(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const save = () => {
    const image = imageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return;
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const x = (image.naturalWidth - side) * horizontal / 100;
    const y = (image.naturalHeight - side) * vertical / 100;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext('2d');
    if (!context) { setError('Image editing is unavailable in this browser.'); return; }
    context.drawImage(image, x, y, side, side, 0, 0, 1024, 1024);
    canvas.toBlob((blob) => {
      if (!blob) { setError('Could not prepare this image.'); return; }
      onConfirm(new File([blob], 'profile-picture.png', { type: 'image/png' }));
    }, 'image/png');
  };

  const image = imageRef.current;
  const width = image?.naturalWidth || 1;
  const height = image?.naturalHeight || 1;
  const side = Math.min(width, height) / zoom;
  const displayWidth = width / side * 100;
  const displayHeight = height / side * 100;
  const left = -(displayWidth - 100) * horizontal / 100;
  const top = -(displayHeight - 100) * vertical / 100;

  return createPortal(
    <div className="fixed inset-0 z-[2147483001] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="profile-crop-title" data-testid="profile-picture-crop">
      <section className="w-full max-w-md rounded-lg bg-white p-5 text-slate-900 shadow-xl">
        <div className="flex items-center justify-between"><h2 id="profile-crop-title" className="text-lg font-bold">Adjust profile picture</h2><button type="button" onClick={onCancel} disabled={busy} aria-label="Cancel" className="rounded p-2"><X size={20} /></button></div>
        <div className="relative mx-auto mt-4 aspect-square w-full max-w-[280px] overflow-hidden rounded-full bg-slate-100">
          {url && <img ref={imageRef} src={url} alt="Profile picture preview" onLoad={() => setReady(true)} onError={() => setError('Could not read this image.')} className="absolute max-w-none" style={{ width: `${displayWidth}%`, height: `${displayHeight}%`, left: `${left}%`, top: `${top}%` }} />}
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-3">Zoom<input className="flex-1" type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          <label className="flex items-center gap-3">Left / right<input className="flex-1" type="range" min="0" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))} /></label>
          <label className="flex items-center gap-3">Up / down<input className="flex-1" type="range" min="0" max="100" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} /></label>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={busy} className="rounded border border-slate-300 px-4 py-2 text-sm font-bold">Cancel</button><button type="button" onClick={save} disabled={!ready || busy} className="rounded bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" data-testid="profile-picture-confirm">{busy ? 'Saving...' : 'Save picture'}</button></div>
      </section>
    </div>, document.body,
  );
}