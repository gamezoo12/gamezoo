import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Lightbox({ item, onClose }) {
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 p-3 backdrop-blur-md" onClick={onClose} data-testid="winners-lightbox">
      <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close" data-testid="winners-lightbox-close"><X className="h-6 w-6" /></button>
      <div className="max-h-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
        {item.type === 'video'
          ? <video src={item.src} controls autoPlay playsInline className="max-h-[86vh] w-full rounded-xl" data-testid="winners-lightbox-video" />
          : <img src={item.src} alt={item.caption || 'Draw media'} className="max-h-[86vh] w-auto rounded-xl object-contain" data-testid="winners-lightbox-image" />}
        {item.caption && <p className="mt-3 text-center text-sm text-white/80">{item.caption}</p>}
      </div>
    </div>
  );
}
