import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, Upload } from 'lucide-react';
import { freeGamesAdminAPI, uploadsAPI } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/media';

const input = 'mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm';
const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : 'Something went wrong'; };
const BLANK = { title: '', media_type: 'image', media_url: '', click_url: '', cta: 'Learn more', active: true, weight: 1, starts_at: '', ends_at: '' };
const toLocal = (iso) => {
  if (!iso) return '';
  if (!/Z|[+-]\d\d:\d\d$/.test(iso)) return iso.slice(0, 16);
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function AdSettings({ value, onSaved, onError }) {
  const [s, setS] = useState(value);
  const set = (k, v) => setS({ ...s, [k]: v });
  const save = async () => { try { const r = await freeGamesAdminAPI.saveAdSettings({ ...s, every_n_levels: Number(s.every_n_levels), skip_after_s: Number(s.skip_after_s) }); setS(r.settings); onSaved('Ad settings saved.'); } catch (e) { onError(errText(e)); } };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="free-ads-settings">
      <h3 className="text-lg font-black text-slate-900">Ad settings</h3>
      <p className="mt-1 text-xs text-slate-500">A full-screen ad appears before a level starts. Players can skip it after the countdown.</p>
      <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={s.enabled} onChange={(e) => set('enabled', e.target.checked)} className="h-4 w-4" data-testid="free-ads-enabled" />Show ads in free games</label>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-500">Ads to show<select className={input} value={s.source} onChange={(e) => set('source', e.target.value)} data-testid="free-ads-source"><option value="own">My own ads</option><option value="adsense">Google AdSense</option><option value="mix">Both (take turns)</option></select></label>
        <label className="text-xs text-slate-500">Show an ad every … level starts<input type="number" min="1" max="50" className={input} value={s.every_n_levels} onChange={(e) => set('every_n_levels', e.target.value)} data-testid="free-ads-every" /></label>
        <label className="text-xs text-slate-500">Skip allowed after (seconds)<input type="number" min="0" max="30" className={input} value={s.skip_after_s} onChange={(e) => set('skip_after_s', e.target.value)} data-testid="free-ads-skip" /></label>
      </div>
      {s.source !== 'own' && <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">AdSense publisher ID<input className={input} placeholder="ca-pub-1234567890123456" value={s.adsense_client} onChange={(e) => set('adsense_client', e.target.value.trim())} data-testid="free-ads-adsense-client" /></label>
        <label className="text-xs text-slate-500">AdSense ad slot ID<input className={input} placeholder="1234567890" value={s.adsense_slot} onChange={(e) => set('adsense_slot', e.target.value.trim())} data-testid="free-ads-adsense-slot" /></label>
        <p className="text-[11px] text-slate-500 sm:col-span-2">Google only serves AdSense ads once your site is approved in your AdSense account. Until then the ad space stays empty and players can skip.</p>
      </div>}
      <button type="button" onClick={save} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white" data-testid="free-ads-settings-save"><Save className="h-4 w-4" />Save settings</button>
    </section>
  );
}

function AdForm({ initial, onDone, onError }) {
  const [a, setA] = useState(initial);
  const [busy, setBusy] = useState('');
  const set = (k, v) => setA({ ...a, [k]: v });
  const upload = async (file) => {
    if (!file) return;
    const video = file.type.startsWith('video/');
    setBusy('upload');
    try {
      const r = video ? await uploadsAPI.video(file, await new Promise((res) => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res(v.duration || 0); v.onerror = () => res(0); v.src = URL.createObjectURL(file); }), () => {}) : await uploadsAPI.image(file);
      setA({ ...a, media_url: r.url, media_type: video ? 'video' : 'image' });
    } catch (e) { onError(errText(e)); } finally { setBusy(''); }
  };
  const save = async () => {
    setBusy('save');
    const body = { ...a, weight: Number(a.weight), starts_at: a.starts_at ? new Date(a.starts_at).toISOString() : null, ends_at: a.ends_at ? new Date(a.ends_at).toISOString() : null };
    try { if (a.ad_id) await freeGamesAdminAPI.updateAd(a.ad_id, body); else await freeGamesAdminAPI.createAd(body); onDone(a.ad_id ? 'Ad updated.' : 'Ad created.'); } catch (e) { onError(errText(e)); } finally { setBusy(''); }
  };
  return (
    <section className="rounded-2xl border-2 border-indigo-200 bg-white p-5" data-testid="free-ad-form">
      <h3 className="text-lg font-black text-slate-900">{a.ad_id ? 'Edit ad' : 'New ad'}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">Title<input className={input} maxLength={80} value={a.title} onChange={(e) => set('title', e.target.value)} data-testid="free-ad-title" /></label>
        <label className="text-xs text-slate-500">Button text<input className={input} maxLength={30} value={a.cta} onChange={(e) => set('cta', e.target.value)} data-testid="free-ad-cta" /></label>
        <label className="text-xs text-slate-500 sm:col-span-2">Link when tapped (https://… or /competitions)<input className={input} value={a.click_url} onChange={(e) => set('click_url', e.target.value.trim())} data-testid="free-ad-link" /></label>
        <label className="text-xs text-slate-500">Starts (optional)<input type="datetime-local" className={input} value={toLocal(a.starts_at)} onChange={(e) => set('starts_at', e.target.value)} data-testid="free-ad-starts" /></label>
        <label className="text-xs text-slate-500">Ends (optional)<input type="datetime-local" className={input} value={toLocal(a.ends_at)} onChange={(e) => set('ends_at', e.target.value)} data-testid="free-ad-ends" /></label>
        <label className="text-xs text-slate-500">How often vs other ads (1-10)<input type="number" min="1" max="10" className={input} value={a.weight} onChange={(e) => set('weight', e.target.value)} data-testid="free-ad-weight" /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-bold"><input type="checkbox" checked={a.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4" data-testid="free-ad-active" />Active</label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-indigo-50 px-4 text-sm font-bold text-indigo-700"><Upload className="h-4 w-4" />{busy === 'upload' ? 'Uploading…' : 'Upload image or video (max 1 min)'}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="free-ad-file" /></label>
        {a.media_url && (a.media_type === 'video' ? <video src={resolveMediaUrl(a.media_url)} muted className="h-20 rounded-lg" data-testid="free-ad-preview" /> : <img src={resolveMediaUrl(a.media_url)} alt="" className="h-20 rounded-lg object-cover" data-testid="free-ad-preview" />)}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={!!busy || !a.title || !a.media_url} onClick={save} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:opacity-40" data-testid="free-ad-save"><Save className="h-4 w-4" />Save ad</button>
        <button type="button" onClick={() => onDone('')} className="h-10 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700" data-testid="free-ad-cancel">Cancel</button>
      </div>
    </section>
  );
}

export function FreeGamesAds() {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(['', '']);
  const load = () => freeGamesAdminAPI.ads().then(setData).catch((e) => setMsg([errText(e), '']));
  useEffect(() => { load(); }, []);
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />;
  const remove = async (id) => { if (!window.confirm('Delete this ad?')) return; try { await freeGamesAdminAPI.deleteAd(id); setMsg(['', 'Ad deleted.']); load(); } catch (e) { setMsg([errText(e), '']); } };
  return (
    <div className="space-y-5" data-testid="free-games-ads">
      {msg[0] && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700" data-testid="free-ads-error">{msg[0]}</div>}
      {msg[1] && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" data-testid="free-ads-notice">{msg[1]}</div>}
      <AdSettings value={data.settings} onSaved={(m) => setMsg(['', m])} onError={(m) => setMsg([m, ''])} />
      {edit ? <AdForm initial={edit} onDone={(m) => { setEdit(null); if (m) { setMsg(['', m]); load(); } }} onError={(m) => setMsg([m, ''])} />
        : <button type="button" onClick={() => setEdit(BLANK)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white" data-testid="free-ad-new"><Plus className="h-4 w-4" />New ad</button>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.ads.length === 0 && <p className="text-sm text-slate-500">No ads yet. Add sponsor banners, contest promos or offers.</p>}
        {data.ads.map((a) => (
          <div key={a.ad_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white" data-testid={`free-ad-${a.ad_id}`}>
            <div className="aspect-video bg-slate-900">{a.media_type === 'video' ? <video src={resolveMediaUrl(a.media_url)} muted className="h-full w-full object-cover" /> : <img src={resolveMediaUrl(a.media_url)} alt={a.title} className="h-full w-full object-cover" />}</div>
            <div className="p-3">
              <div className="flex items-center justify-between gap-2"><span className="truncate font-black text-slate-900">{a.title}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${a.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{a.active ? 'ACTIVE' : 'PAUSED'}</span></div>
              <div className="mt-1 text-xs text-slate-500">{a.impressions} views · {a.clicks} clicks{a.impressions ? ` · ${((a.clicks / a.impressions) * 100).toFixed(1)}% CTR` : ''}</div>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setEdit(a)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-100 px-3 text-xs font-bold" data-testid={`free-ad-edit-${a.ad_id}`}><Pencil className="h-3.5 w-3.5" />Edit</button>
                <button type="button" onClick={() => remove(a.ad_id)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-rose-50 px-3 text-xs font-bold text-rose-700" data-testid={`free-ad-delete-${a.ad_id}`}><Trash2 className="h-3.5 w-3.5" />Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
