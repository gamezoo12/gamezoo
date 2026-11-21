import { useState } from 'react';
import { Copy, Download, Facebook, Instagram, MessageCircle, MoreHorizontal, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { referralAPI } from '../lib/api';
import { downloadShareImage, fetchShareImage, referralCodeFor, renderShareImages, sharedUrl } from '../lib/shareContent';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

export default function ShareMenu({ path, title, subtitle, imageUrl, imageRenderer, rows, maxRows, className = '', label = 'Share options' }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const recordShare = async (channel) => {
    if (user?.user_id) {
      try { await referralAPI.trackShare(channel); } catch { /* Sharing still works if analytics is unavailable. */ }
    }
  };

  const perform = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      const text = `${title || 'Prize League'}${subtitle ? ` - ${subtitle}` : ''}`;
      if (action === 'copy') {
        const url = sharedUrl(path, await referralCodeFor(user));
        await navigator.clipboard.writeText(url);
        await recordShare('copy');
        toast.success('Link copied');
      } else {
        const url = sharedUrl(path, await referralCodeFor(user));
        let blobs = [];
        try {
          const rendered = imageRenderer
            ? await imageRenderer()
            : imageUrl && !rows?.length
              ? await fetchShareImage(imageUrl)
              : await renderShareImages({ title, subtitle, imageUrl, rows, maxRows });
          blobs = (Array.isArray(rendered) ? rendered : [rendered]).filter(blob => blob instanceof Blob);
        } catch {
          blobs = [];
        }
        const files = blobs.map((blob, index) => new File([blob], `contest-${index + 1}.${blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`, { type: blob.type }));
        const saveImages = () => blobs.forEach((blob, index) => downloadShareImage(blob, `contest-${index + 1}.${blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`));

        if (action === 'download') {
          if (!blobs.length) {
            try { await navigator.clipboard.writeText(url); } catch { /* clipboard may be unavailable */ }
            toast.message('The image host blocked downloads. Contest link copied instead.');
            return;
          }
          saveImages();
          toast.success(imageUrl && !rows?.length ? 'Contest image saved' : '4K image saved');
          return;
        }

        if (action === 'share' && navigator.share) {
          const filePayload = files.length && navigator.canShare?.({ files }) ? { files } : {};
          await navigator.share({ ...filePayload, title, text: `${text}\n${url}`, url });
          await recordShare('native');
        } else if (action === 'whatsapp') {
          window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener,noreferrer');
          toast.success('Contest link ready to share on WhatsApp');
          await recordShare('whatsapp');
        } else if (action === 'facebook') {
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
          toast.success('Contest link ready to share on Facebook');
          await recordShare('facebook');
        } else if (action === 'instagram') {
          try { await navigator.clipboard.writeText(url); } catch { /* clipboard may be unavailable */ }
          toast.success('Contest link copied for Instagram');
          await recordShare('instagram');
        } else {
          try { await navigator.clipboard.writeText(url); } catch { /* clipboard may be unavailable */ }
          toast.success('Contest link copied');
          await recordShare('native');
        }
      }
    } catch (error) {
      if (error?.name !== 'AbortError') toast.error(error?.message || 'Sharing is unavailable. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`inline-flex h-9 w-9 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black ${className}`} aria-label={label} title={label} disabled={busy} onClick={(event) => event.stopPropagation()}>
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => perform('share')}><Share2 /> Share</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => perform('copy')}><Copy /> Copy link</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => perform('download')}><Download /> Save contest image</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => perform('whatsapp')}><MessageCircle /> WhatsApp</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => perform('facebook')}><Facebook /> Facebook</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => perform('instagram')}><Instagram /> Instagram</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}