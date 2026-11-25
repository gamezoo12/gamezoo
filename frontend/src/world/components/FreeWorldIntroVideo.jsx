import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { resolveMediaUrl } from '../../lib/media';

export default function FreeWorldIntroVideo({ url, type, onClose }) {
  const videoRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onCloseRef.current(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    videoRef.current?.play().catch(() => {});
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label="Free World introduction media" data-testid="free-world-intro-overlay">
      {type === 'video'
        ? <video ref={videoRef} src={resolveMediaUrl(url)} autoPlay muted playsInline controls preload="none" onEnded={onClose} className="h-full w-full object-contain" data-testid="free-world-intro-player" />
        : <img src={resolveMediaUrl(url)} alt="Free World introduction" className="h-full w-full object-contain" data-testid="free-world-intro-image" />}
      <button type="button" onClick={onClose} aria-label="Close introduction media" title="Close" className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/40 hover:bg-black" data-testid="free-world-intro-close"><X className="h-6 w-6" /></button>
    </div>,
    document.body,
  );
}