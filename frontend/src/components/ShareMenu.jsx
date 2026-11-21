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
        const rendered = imageRenderer
          ? await imageRenderer()
          : imageUrl && !rows?.length
            ? await fetchShareImage(imageUrl)
            : await renderShareImages({ title, subtitle, imageUrl, rows, maxRows });
        const blobs = Array.isArray(rendered) ? rendered : [rendered];
        if (!blobs.length || blobs.some((blob) => !(blob instanceof Blob))) throw new Error('Image creation is unavailable.');
        const files = blobs.map((blob, index) => new File([blob], `contest-${index + 1}.${blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`, { type: blob.type }));
        const saveImages = () => blobs.forEach((blob, index) => downloadShareImage(blob, `contest-${index + 1}.${blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`));
        if (action === 'download') {
          saveImages();
          toast.success(imageUrl && !rows?.length ? 'Contest image saved' : '4K image saved');
          return;
        }

        const url = sharedUrl(path, await referralCodeFor(user));
        if (navigator.canShare?.({ files }) && navigator.share) {
          await navigator.share({ files, title, text: `${text}\n${url}`, url });
          await recordShare(action === 'share' ? 'native' : action);
        } else {
          saveImages();
          if (action === 'whatsapp') {
            window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener,noreferrer');
            toast.message('4K image saved. Attach it to your WhatsApp message; the referral link is included in the text.');
          } else if (action === 'facebook') {
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
            toast.message('4K image saved. Add it to your Facebook post; the referral link is ready to share.');
          } else if (action === 'instagram') {
            try { await navigator.clipboard.writeText(url); } catch { /* clipboard may be unavailable */ }
            toast.message('4K image saved. Add it to Instagram and include the copied referral link.');
          } else {
            try { await navigator.clipboard.writeText(url); } catch { /* clipboard may be unavailable */ }
            toast.message('4K image saved and referral link copied.');
          }
          await recordShare(action === 'share' ? 'native' : action);
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