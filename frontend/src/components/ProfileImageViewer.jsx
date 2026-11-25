import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import useProfileImage from '../lib/useProfileImage';

export default function ProfileImageViewer({ imageUrl, name, onClose }) {
  const image = useProfileImage(imageUrl);
  if (!imageUrl) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${name || 'User'} profile picture`} className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/90 p-4" onClick={onClose} data-testid="profile-picture-viewer">
      {image && <img src={image} alt={`${name || 'User'} profile`} draggable="false" onContextMenu={(event) => event.preventDefault()} className="max-h-[86vh] max-w-[90vw] select-none rounded-lg object-contain" />}
      <span className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden text-center text-2xl font-black text-white/20 [text-shadow:0_1px_3px_#000]">{name || 'Prize League member'}</span>
      <button type="button" onClick={(event) => { event.stopPropagation(); onClose(); }} aria-label="Close profile picture" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-black/70 text-white ring-1 ring-white/40"><X size={20} /></button>
    </div>,
    document.body,
  );
}