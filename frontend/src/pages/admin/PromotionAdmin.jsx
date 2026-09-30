import { useEffect, useState } from 'react';
import { api, uploadsAPI } from '../../lib/api';

const getConfig = () => api.get('/admin/promotion/config').then(r => r.data);
const getAnalytics = () => api.get('/admin/promotion/analytics').then(r => r.data);
const saveConfig = data => api.put('/admin/promotion/config', data).then(r => r.data);

export default function PromotionAdmin() {
  const [cfg, setCfg] = useState(null);
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');

  const load = async () => {
    const [c, s] = await Promise.all([getConfig(), getAnalytics()]);
    setCfg(c); setStats(s);
  };
  useEffect(() => { load().catch(() => {}); }, []);
  if (!cfg) return <div>Loading promotion…</div>;

  const change = (key, value) => setCfg(prev => ({ ...prev, [key]: value }));
  const upload = async (key, file) => {
    if (!file) return;
    setUploading(key);
    try {
      const result = await uploadsAPI.image(file);
      change(key, result.url || result.path || result.image_url || '');
    } finally { setUploading(''); }
  };
  const save = async () => {
    setSaving(true);
    try { await saveConfig(cfg); await load(); } finally { setSaving(false); }
  };

  const imageField = (label, key) => (
    <div className="border rounded-2xl p-4">
      <div className="font-bold text-slate-800">{label}</div>
      {cfg[key] ? <img src={cfg[key]} alt="" className="mt-3 w-full h-40 object-cover rounded-xl bg-slate-100" /> : <div className="mt-3 h-40 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">Image placeholder</div>}
      <input type="file" accept="image/*" className="mt-3 block w-full text-sm" onChange={e => upload(key, e.target.files?.[0])} />
      {uploading === key && <div className="text-xs mt-2 text-violet-600">Uploading…</div>}
    </div>
  );

  return <div className="max-w-6xl">
    <h1 className="text-2xl font-black">Free World Promotion</h1>
    <p className="text-slate-500 mt-1">Manage popup artwork, dates and prize settings.</p>
    <div className="grid sm:grid-cols-3 gap-3 mt-5">
      {[['Participants', stats?.participants || 0], ['Total tickets', stats?.total_tickets || 0], ['Referral tickets', stats?.referral_tickets || 0]].map(([label,value]) => <div key={label} className="bg-white border rounded-2xl p-5"><div className="text-sm text-slate-500">{label}</div><div className="text-3xl font-black mt-1">{value}</div></div>)}
    </div>
    <div className="bg-white border rounded-2xl p-5 mt-5 space-y-5">
      <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={!!cfg.active} onChange={e => change('active', e.target.checked)} /> Promotion active</label>
      <div className="grid lg:grid-cols-3 gap-4">{imageField('Mobile artwork','mobile_image_url')}{imageField('Tablet artwork','tablet_image_url')}{imageField('Desktop artwork','desktop_image_url')}</div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label><span className="text-sm font-bold">Promotion ID</span><input className="mt-1 w-full border rounded-xl p-3" value={cfg.promotion_id || ''} onChange={e=>change('promotion_id',e.target.value)} /></label>
        <label><span className="text-sm font-bold">Name</span><input className="mt-1 w-full border rounded-xl p-3" value={cfg.name || ''} onChange={e=>change('name',e.target.value)} /></label>
        <label><span className="text-sm font-bold">Start date/time (ISO)</span><input className="mt-1 w-full border rounded-xl p-3" value={cfg.start_at || ''} onChange={e=>change('start_at',e.target.value || null)} /></label>
        <label><span className="text-sm font-bold">End date/time (ISO)</span><input className="mt-1 w-full border rounded-xl p-3" value={cfg.end_at || ''} onChange={e=>change('end_at',e.target.value || null)} /></label>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {[['Total prize £','prize_total_gbp'],['Winners','winner_count'],['Prize each £','prize_per_winner_gbp']].map(([label,key]) => <label key={key}><span className="text-sm font-bold">{label}</span><input type="number" className="mt-1 w-full border rounded-xl p-3" value={cfg[key]} onChange={e=>change(key,Number(e.target.value))} /></label>)}
      </div>
      <button onClick={save} disabled={saving || !!uploading} className="px-7 py-3 rounded-xl bg-[#6C2BFF] text-white font-black disabled:opacity-50">{saving ? 'Saving…' : 'Save Promotion'}</button>
    </div>
  </div>;
}
