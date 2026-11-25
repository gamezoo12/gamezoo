import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { worldAdminAPI } from '../../lib/api';
import FreeWorldAvatar, { FREE_WORLD_AVATARS, isUnityFreeWorldAvatar } from '../../world/components/FreeWorldAvatar';

export default function FreeWorldAvatarCatalog() {
  const [offers, setOffers] = useState(null);
  const [savedOffers, setSavedOffers] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    worldAdminAPI.avatarCatalog().then((result) => {
      if (!active) return;
      setOffers(result.offers || []);
      setSavedOffers(result.offers || []);
    }).catch(() => { if (active) setMessage('Could not load avatar offers.'); });
    return () => { active = false; };
  }, []);

  const releasedCount = useMemo(() => (offers || []).filter((offer) => offer.released).length, [offers]);
  const update = (id, patch) => setOffers((current) => current.map((offer) => offer.avatar_id === id ? { ...offer, ...patch } : offer));
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await worldAdminAPI.setAvatarCatalog({ offers });
      setOffers(result.offers); setSavedOffers(result.offers);
      setMessage(`${result.offers.filter((offer) => offer.released).length} avatars are now available to players.`);
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not save avatar offers.');
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="free-world-avatar-catalog-admin">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Free World Avatars</h2>
          <p className="mt-1 text-xs text-slate-500">Release characters and set each offer to free, Bonus Tokens, or wallet tokens.</p>
        </div>
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700" data-testid="free-world-avatar-release-count">{releasedCount} / {FREE_WORLD_AVATARS.length} available</span>
      </div>
      {!offers ? <div className="mt-4 h-20 animate-pulse rounded-lg bg-slate-100" /> : (
        <div className="mt-4 max-h-[480px] overflow-auto rounded-lg border border-slate-200">
          <div className="divide-y divide-slate-100">
            {FREE_WORLD_AVATARS.map((avatar) => {
              const offer = offers.find((row) => row.avatar_id === avatar.id);
              if (!offer) return null;
              return (
                <div key={avatar.id} className="grid grid-cols-[48px_minmax(110px,1fr)_auto] items-center gap-3 p-2 sm:grid-cols-[52px_minmax(150px,1fr)_150px_120px_auto]" data-testid={`admin-avatar-offer-${avatar.id}`}>
                  {isUnityFreeWorldAvatar(avatar.id)
                    ? <span className="grid h-14 w-10 shrink-0 place-items-center rounded bg-slate-900 text-[10px] font-black text-amber-300">3D</span>
                    : <FreeWorldAvatar avatarId={avatar.id} className="h-14 w-10" />}
                  <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-800">{avatar.name}</div><div className="text-[11px] text-slate-500">{isUnityFreeWorldAvatar(avatar.id) ? `Unity 3D · ${avatar.gender}` : avatar.gender}</div></div>
                  <label className="hidden items-center gap-2 text-xs font-medium text-slate-600 sm:flex">
                    Price<select value={offer.price_type} onChange={(event) => update(avatar.id, { price_type: event.target.value, price: event.target.value === 'free' ? 0 : offer.price || 10 })} className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs" data-testid={`admin-avatar-price-type-${avatar.id}`}>
                      <option value="free">Free</option><option value="bonus_tokens">Bonus Tokens</option><option value="wallet">Wallet tokens</option>
                    </select>
                  </label>
                  <label className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
                    {offer.price_type === 'free' ? <span className="font-bold text-emerald-700">Free</span> : <input type="number" min="0.01" step="0.01" value={offer.price} onChange={(event) => update(avatar.id, { price: Number(event.target.value) })} className="h-9 w-24 rounded-md border border-slate-200 px-2 text-sm" aria-label={`${avatar.name} price`} data-testid={`admin-avatar-price-${avatar.id}`} />}
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <input type="checkbox" checked={offer.released} onChange={(event) => update(avatar.id, { released: event.target.checked })} data-testid={`admin-avatar-release-${avatar.id}`} />Release
                  </label>
                  <div className="col-span-3 flex items-center gap-2 sm:hidden">
                    <select value={offer.price_type} onChange={(event) => update(avatar.id, { price_type: event.target.value, price: event.target.value === 'free' ? 0 : offer.price || 10 })} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs" aria-label={`${avatar.name} price type`}>
                      <option value="free">Free</option><option value="bonus_tokens">Bonus Tokens</option><option value="wallet">Wallet tokens</option>
                    </select>
                    {offer.price_type !== 'free' && <input type="number" min="0.01" step="0.01" value={offer.price} onChange={(event) => update(avatar.id, { price: Number(event.target.value) })} className="h-8 w-24 rounded-md border border-slate-200 px-2 text-xs" aria-label={`${avatar.name} price`} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!offers || busy || JSON.stringify(offers) === JSON.stringify(savedOffers)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50" data-testid="free-world-avatar-catalog-save"><Save className="h-4 w-4" />{busy ? 'Saving…' : 'Save avatar offers'}</button>
        {message && <span className="text-xs text-slate-600" role="status">{message}</span>}
      </div>
    </section>
  );
}