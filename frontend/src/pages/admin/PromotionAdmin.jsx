import { useEffect, useState } from 'react';
import { api, uploadsAPI } from '../../lib/api';

const getConfig = () => api.get('/admin/promotion/config').then(r => r.data);
const getAnalytics = () => api.get('/admin/promotion/analytics').then(r => r.data);
const saveConfig = d => api.put('/admin/promotion/config', d).then(r => r.data);
const getParticipants = q => api.get('/admin/promotion/participants', { params: q ? { q } : {} }).then(r => r.data);

const toLocalInput = value => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toISO = value => value ? new Date(value).toISOString() : null;

export default function PromotionAdmin() {
  const [cfg, setCfg] = useState(null);
  const [stats, setStats] = useState(null);
  const [people, setPeople] = useState([]);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [uploading, setUploading] = useState('');

  const load = async () => {
    const [c, s, p] = await Promise.all([getConfig(), getAnalytics(), getParticipants()]);
    setCfg(c);
    setStats(s);
    setPeople(p.items || []);
  };

  useEffect(() => { load().catch(() => {}); }, []);
  if (!cfg) return <div>Loading promotion…</div>;

  const change = (k, v) => setCfg(x => ({ ...x, [k]: v }));
  const upload = async (k, f) => {
    if (!f) return;
    setUploading(k);
    try {
      const r = await uploadsAPI.image(f);
      change(k, r.url || r.path || r.image_url || '');
    } finally { setUploading(''); }
  };

  const save = async () => {
    setSaving(true);
    try { await saveConfig(cfg); await load(); }
    finally { setSaving(false); }
  };

  const launch = async () => {
    if (!cfg.start_at || !cfg.end_at) {
      window.alert('Please select both a start date/time and an end date/time before launch.');
      return;
    }
    if (new Date(cfg.end_at) <= new Date(cfg.start_at)) {
      window.alert('End date/time must be after the start date/time.');
      return;
    }
    setLaunching(true);
    try {
      await saveConfig({ ...cfg, active: true });
      await load();
    } finally { setLaunching(false); }
  };

  const stop = async () => {
    setLaunching(true);
    try {
      await saveConfig({ ...cfg, active: false });
      await load();
    } finally { setLaunching(false); }
  };

  const search = async () => setPeople((await getParticipants(q)).items || []);
  const imageField = (l, k) => <div className="border rounded-2xl p-4"><div className="font-bold">{l}</div>{cfg[k] ? <img src={cfg[k]} alt="" className="mt-3 w-full h-40 object-cover rounded-xl"/> : <div className="mt-3 h-40 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">Image placeholder</div>}<input type="file" accept="image/*" className="mt-3 block w-full text-sm" onChange={e => upload(k, e.target.files?.[0])}/>{uploading === k && <div className="text-xs text-violet-600">Uploading…</div>}</div>;
  const cards = [['Impressions',stats?.events?.impression?.count||0],['Unique viewers',stats?.events?.impression?.unique_visitors||0],['Closed/skipped',stats?.events?.close?.count||0],['Join clicks',stats?.events?.join_click?.count||0],['Refer clicks',stats?.events?.refer_click?.count||0],['Signup starts',stats?.events?.signup_start?.count||0],['Signup completes',stats?.events?.signup_complete?.count||0],['Participants',stats?.participants||0],['Total tickets',stats?.total_tickets||0],['Base tickets',stats?.base_tickets||0],['Referral tickets',stats?.referral_tickets||0],['View→Join %',stats?.conversion?.impression_to_join_click_pct||0]];

  return <div className="max-w-7xl">
    <h1 className="text-2xl font-black">Free World Promotion</h1>
    <p className="text-slate-500">Complete promotion controls, funnel analytics and ticket audit.</p>
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mt-5">{cards.map(([l,v]) => <div key={l} className="bg-white border rounded-2xl p-4"><div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-black mt-1">{v}</div></div>)}</div>
    <div className="grid lg:grid-cols-3 gap-4 mt-5">{[['Devices',stats?.devices],['Top popup pages',stats?.pages],['Acquisition sources',stats?.sources]].map(([title,rows]) => <div className="bg-white border rounded-2xl p-5" key={title}><h2 className="font-black">{title}</h2><div className="mt-3 space-y-2">{(rows||[]).slice(0,10).map((x,i) => <div key={i} className="flex justify-between text-sm"><span className="truncate mr-3">{x._id||'Unknown'}</span><b>{x.count}</b></div>)}</div></div>)}</div>

    <div className="bg-white border rounded-2xl p-5 mt-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h2 className="text-lg font-black">Promotion setup</h2><p className="text-sm text-slate-500">Set the schedule, save your setup, then launch when ready.</p></div>
        <span className={`px-3 py-1.5 rounded-full text-xs font-black ${cfg.is_live ? 'bg-green-100 text-green-700' : cfg.active ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{cfg.is_live ? 'LIVE NOW' : cfg.active ? 'SCHEDULED' : 'NOT LAUNCHED'}</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">{imageField('Mobile artwork','mobile_image_url')}{imageField('Tablet artwork','tablet_image_url')}{imageField('Desktop artwork','desktop_image_url')}</div>

      <div className="grid sm:grid-cols-2 gap-4">
        <label><span className="text-sm font-bold">Promotion ID</span><input className="mt-1 w-full border rounded-xl p-3" value={cfg.promotion_id||''} onChange={e=>change('promotion_id',e.target.value)}/></label>
        <label><span className="text-sm font-bold">Name</span><input className="mt-1 w-full border rounded-xl p-3" value={cfg.name||''} onChange={e=>change('name',e.target.value)}/></label>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 rounded-2xl bg-slate-50 border p-4">
        <label><span className="text-sm font-black">Start date & time</span><input type="datetime-local" className="mt-1 w-full border rounded-xl p-3 bg-white" value={toLocalInput(cfg.start_at)} onChange={e=>change('start_at',toISO(e.target.value))}/></label>
        <label><span className="text-sm font-black">End date & time</span><input type="datetime-local" className="mt-1 w-full border rounded-xl p-3 bg-white" value={toLocalInput(cfg.end_at)} onChange={e=>change('end_at',toISO(e.target.value))}/></label>
        <p className="sm:col-span-2 text-xs text-slate-500">The promotion will only be visible and joinable between these times after you press Launch Promotion.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">{[['Total prize £','prize_total_gbp'],['Winners','winner_count'],['Prize each £','prize_per_winner_gbp']].map(([l,k]) => <label key={k}><span className="text-sm font-bold">{l}</span><input type="number" className="mt-1 w-full border rounded-xl p-3" value={cfg[k]} onChange={e=>change(k,Number(e.target.value))}/></label>)}</div>

      <div className="flex flex-wrap gap-3 pt-2 border-t">
        <button onClick={save} disabled={saving||launching||!!uploading} className="px-7 py-3 rounded-xl bg-slate-900 text-white font-black disabled:opacity-50">{saving?'Saving…':'Save Draft'}</button>
        {!cfg.active ? <button onClick={launch} disabled={saving||launching||!!uploading} className="px-8 py-3 rounded-xl bg-[#6C2BFF] text-white font-black shadow-lg disabled:opacity-50">{launching?'Launching…':'🚀 Launch Promotion'}</button> : <button onClick={stop} disabled={saving||launching} className="px-7 py-3 rounded-xl bg-red-600 text-white font-black disabled:opacity-50">{launching?'Updating…':'Stop Promotion'}</button>}
      </div>
    </div>

    <div className="bg-white border rounded-2xl p-5 mt-5"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-lg font-black">Participants & ticket audit</h2><p className="text-sm text-slate-500">Search user, email, public ID or ticket number.</p></div><div className="flex gap-2"><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()} className="border rounded-xl px-3 py-2" placeholder="Search…"/><button onClick={search} className="px-4 rounded-xl bg-slate-900 text-white font-bold">Search</button></div></div><div className="overflow-x-auto mt-4"><table className="w-full text-sm"><thead><tr className="text-left border-b"><th className="py-3">User</th><th>Joined</th><th>Tickets</th><th>Base</th><th>Referral</th><th>Ticket numbers / sources</th></tr></thead><tbody>{people.map((p,i)=><tr key={i} className="border-b align-top"><td className="py-3"><b>{p.user?.name||p.user?.username||p.user?.public_id||p.user?.user_id}</b><div className="text-xs text-slate-500">{p.user?.email}</div></td><td>{p.joined_at?new Date(p.joined_at).toLocaleString():'—'}</td><td className="font-bold">{p.ticket_count}</td><td>{p.base_tickets}</td><td>{p.referral_tickets}</td><td className="py-2">{(p.tickets||[]).map(t=><div key={t.ticket_number} className="text-xs"><b>{t.ticket_number}</b> · {t.source}{t.referred_user_id?` · from ${t.referred_user_id}`:''}</div>)}</td></tr>)}</tbody></table></div></div>
  </div>;
}
