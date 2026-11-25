import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coins, LockKeyhole, ShoppingCart, UserRound, X } from 'lucide-react';
import FreeWorldAvatar, { DEFAULT_FREE_WORLD_AVATAR, FREE_WORLD_AVATARS, getRenderableFreeWorldAvatarId, isUnityFreeWorldAvatar, UNITY_3D_AVATARS_ENABLED } from './FreeWorldAvatar';
import RiggedFreeWorldAvatar from './RiggedFreeWorldAvatar';

export default function FreeWorldAvatarPicker({ avatarId, offers = [], ownedAvatarIds = [], previousAvatarIds = [], isAuthenticated = false, onSelect, onPurchase, openRequest = 0 }) {
  const [open, setOpen] = useState(false);
  const [buyingId, setBuyingId] = useState('');
  const [previewId, setPreviewId] = useState(() => getRenderableFreeWorldAvatarId(avatarId));
  const offerById = new Map(offers.map((offer) => [offer.avatar_id, offer]));
  const owned = new Set([...ownedAvatarIds, ...previousAvatarIds, avatarId]);
  const visibleAvatars = FREE_WORLD_AVATARS.filter((avatar) => (
    (UNITY_3D_AVATARS_ENABLED || !isUnityFreeWorldAvatar(avatar.id))
    && (owned.has(avatar.id) || offerById.has(avatar.id))
  ));
  const previewAvatar = useMemo(() => FREE_WORLD_AVATARS.find((avatar) => avatar.id === previewId && (UNITY_3D_AVATARS_ENABLED || !isUnityFreeWorldAvatar(avatar.id))) || FREE_WORLD_AVATARS[0], [previewId]);
  const previewOffer = offerById.get(previewAvatar.id);
  const canUsePreview = owned.has(previewAvatar.id) || (previewOffer?.released && previewOffer.price_type === 'free');

  useEffect(() => { if (openRequest) setOpen(true); }, [openRequest]);
  useEffect(() => { if (open) setPreviewId(getRenderableFreeWorldAvatarId(avatarId)); }, [open, avatarId]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed right-3 top-[116px] z-[10001] flex h-12 items-center gap-1.5 rounded-full border border-amber-300/70 bg-slate-950/90 px-2 text-[10px] font-black uppercase text-white shadow-lg" aria-label="Choose your Free World avatar" title="Choose avatar" data-testid="free-world-avatar-picker-open">
        {UNITY_3D_AVATARS_ENABLED && isUnityFreeWorldAvatar(avatarId)
          ? <RiggedFreeWorldAvatar avatarId={avatarId} className="h-10 w-8 shrink-0" testId="avatar-picker-button-3d" />
          : <FreeWorldAvatar avatarId={getRenderableFreeWorldAvatarId(avatarId)} className="h-10 w-8 shrink-0" />}
        <span className="pr-1">Avatar</span>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[2147483001] flex items-center justify-center bg-black/75 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="free-world-avatar-title" className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-amber-300/50 bg-slate-950 text-white shadow-2xl" data-testid="free-world-avatar-picker">
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
              <div><h2 id="free-world-avatar-title" className="text-lg font-black">Choose your avatar</h2><p className="text-xs text-white/60">{previewAvatar.name} · {previewAvatar.gender}</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close avatar picker" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" data-testid="free-world-avatar-picker-close"><X size={18} /></button>
            </header>
            <div className="grid gap-3 border-b border-white/10 p-3 sm:grid-cols-[minmax(150px,220px)_1fr] sm:gap-5 sm:p-5">
              <div className="relative mx-auto h-44 w-36 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(180deg,#17263b_0%,#101722_65%,#0b1119_100%)] sm:h-52 sm:w-full" data-testid="avatar-picker-stage">
                <div className="absolute inset-x-0 bottom-5 h-px bg-white/15" />
                {UNITY_3D_AVATARS_ENABLED && isUnityFreeWorldAvatar(previewAvatar.id)
                  ? <RiggedFreeWorldAvatar key={previewAvatar.id} avatarId={previewAvatar.id} className="absolute inset-0 h-full w-full" testId="avatar-picker-3d-preview" />
                  : <FreeWorldAvatar key={previewAvatar.id} avatarId={previewAvatar.id} action={1} className="absolute inset-0 h-full w-full" title={`${previewAvatar.gender} avatar: ${previewAvatar.name}`} />}
              </div>
              <div className="grid max-h-[30vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 sm:content-start">
              {visibleAvatars.map((avatar) => {
                const offer = offerById.get(avatar.id);
                const free = offer?.released && offer.price_type === 'free';
                const canUse = owned.has(avatar.id) || free;
                const priceLabel = offer?.price_type === 'bonus_tokens'
                  ? `${offer.price} Bonus Tokens`
                  : offer?.price_type === 'wallet' ? `${offer.price} wallet tokens` : 'Free';
                return (
                  <article key={avatar.id} className={`flex min-h-24 flex-col justify-between gap-2 rounded-lg border p-2 ${avatar.id === previewId ? 'border-amber-300 bg-amber-300/15' : 'border-white/10 bg-white/[0.04]'}`} data-testid={`free-world-avatar-option-${avatar.id}`}>
                    <button type="button" onClick={() => setPreviewId(avatar.id)} aria-pressed={avatar.id === previewId} className="flex w-full items-center gap-2 rounded-md p-1 text-left" data-testid={`free-world-avatar-select-${avatar.id}`}>
                      {UNITY_3D_AVATARS_ENABLED && isUnityFreeWorldAvatar(avatar.id)
                        ? <span className="grid h-11 w-9 shrink-0 place-items-center rounded bg-slate-800 text-[9px] font-black text-amber-200">3D</span>
                        : <FreeWorldAvatar avatarId={avatar.id} className="h-11 w-8 shrink-0" />}
                      <span className="min-w-0"><span className="block truncate text-xs font-bold">{avatar.name}</span><span className="block text-[10px] text-white/50">{avatar.gender}</span><span className="block text-[10px] font-semibold text-amber-200">{avatar.id === avatarId ? 'Current' : canUse ? 'Owned' : priceLabel}</span></span>
                    </button>
                    {!canUse && (!isAuthenticated ? (
                      <a href="/login" className="inline-flex h-7 items-center gap-1 rounded-md bg-amber-300 px-2 text-[10px] font-black text-slate-950">Sign in to unlock</a>
                    ) : (
                      <button type="button" disabled={buyingId === avatar.id} onClick={async () => { setBuyingId(avatar.id); try { await onPurchase(avatar.id); setPreviewId(avatar.id); } catch { /* The parent reports purchase errors. */ } finally { setBuyingId(''); } }} className="inline-flex h-7 items-center gap-1 rounded-md bg-amber-300 px-2 text-[10px] font-black text-slate-950 disabled:opacity-50" data-testid={`free-world-avatar-buy-${avatar.id}`}>
                        {buyingId === avatar.id ? <Coins size={12} /> : <ShoppingCart size={12} />}{buyingId === avatar.id ? 'Buying…' : `Unlock ${priceLabel}`}
                      </button>
                    ))}
                    {!offer?.released && <span className="inline-flex items-center gap-1 text-[10px] text-white/40"><LockKeyhole size={10} />Not currently offered</span>}
                  </article>
                );
              })}
              </div>
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs text-white/50 sm:px-6">
              <span className="inline-flex items-center gap-2"><UserRound size={14} />{visibleAvatars.length} available offers</span>
              <button type="button" disabled={!canUsePreview} onClick={() => { onSelect(previewAvatar.id); setOpen(false); }} className="h-9 rounded-md bg-amber-300 px-4 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50" data-testid="free-world-avatar-confirm">Use {previewAvatar.name}</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}