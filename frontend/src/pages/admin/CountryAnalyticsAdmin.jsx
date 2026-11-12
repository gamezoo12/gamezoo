import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { countryAdminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import CountrySelect from '../../components/CountrySelect';
import { toast } from 'sonner';

const GROUPS = [
  ['Acquisition', [['impressions', 'Impressions'], ['unique_visitors', 'Unique visitors'], ['sessions', 'Sessions'], ['page_visits', 'Page visits'],
    ['registration_attempts', 'Reg. attempts'], ['users_new', 'Registrations'], ['signup_conversion_pct', 'Conversion %']]],
  ['Users', [['users_total', 'Total'], ['users_active', 'Active'], ['users_new', 'New'], ['users_returning', 'Returning'],
    ['email_verified', 'Email verified'], ['phone_verified', 'Phone verified']]],
  ['Games & Contests', [['free_world_plays', 'Free World plays'], ['game_completions', 'Completions'], ['contest_entries', 'FW contest entries'], ['tickets_purchased', 'Tickets']]],
  ['Wallet & Revenue', [['token_topups', 'Top-ups'], ['bonus_tokens', 'Bonus tokens'], ['ticket_spending', 'Spending'], ['winnings', 'Winnings'], ['withdrawals', 'Withdrawals']]],
  ['OTP', [['sms_otp_sent', 'SMS OTP sent']]],
];
const fmt = (v) => (v === undefined || v === null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(1)) : v);

function ExportPanel() {
  const [f, setF] = useState({ dataset: 'users', country: '', signup_method: '', verified: '', start: '', end: '', activity_days: '', permission: '' });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const download = async () => {
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      const blob = await countryAdminAPI.exportCsv(params);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `prizeleague_${f.dataset}_${f.country || 'all'}.csv`; a.click();
    } catch { toast.error('Export failed'); }
  };
  const sel = 'h-10 rounded-md border border-input bg-background px-2 text-sm';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="country-export">
      <h2 className="mb-3 text-lg font-extrabold">Country filters &amp; CSV export</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select className={sel} value={f.dataset} onChange={(e) => set('dataset', e.target.value)} data-testid="export-dataset">
          <option value="users">Users</option><option value="wallet">Wallet / transactions</option><option value="tickets">Contest tickets</option>
          <option value="promotions">Promotion entries</option><option value="withdrawals">Withdrawals</option></select>
        <div className="flex gap-1"><CountrySelect value={f.country} onChange={(c) => set('country', c)} testId="export-country" placeholder="All countries" />{f.country && <Button variant="ghost" onClick={() => set('country', '')}>×</Button>}</div>
        <select className={sel} value={f.signup_method} onChange={(e) => set('signup_method', e.target.value)} data-testid="export-method"><option value="">Any signup method</option><option value="email">Email</option><option value="google">Google</option></select>
        <select className={sel} value={f.verified} onChange={(e) => set('verified', e.target.value)} data-testid="export-verified"><option value="">Any verification</option><option value="email">Email verified</option><option value="phone">Phone verified</option><option value="unverified">Phone not verified</option></select>
        <Input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} data-testid="export-start" />
        <Input type="date" value={f.end} onChange={(e) => set('end', e.target.value)} data-testid="export-end" />
        <select className={sel} value={f.activity_days} onChange={(e) => set('activity_days', e.target.value)} data-testid="export-activity"><option value="">Any activity</option><option value="7">Active last 7 days</option><option value="30">Active last 30 days</option></select>
        <select className={sel} value={f.permission} onChange={(e) => set('permission', e.target.value)} data-testid="export-permission"><option value="">Any access</option>
          <option value="allow_paid_contests">Can enter paid contests</option><option value="allow_free_world_prizes">Can win Free World prizes</option>
          <option value="allow_promo_draws">Can enter promo draws</option><option value="allow_wallet_topups">Can top up</option><option value="allow_prize_claims">Can claim prizes</option></select>
      </div>
      <Button onClick={download} className="mt-3 bg-[#6C2BFF] text-white" data-testid="export-download"><Download className="mr-1 h-4 w-4" />Download CSV</Button>
    </section>
  );
}

export default function CountryAnalyticsAdmin() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [group, setGroup] = useState(0);
  const [q, setQ] = useState('');
  const [denied, setDenied] = useState(false);
  useEffect(() => { setData(null); countryAdminAPI.analytics(days).then(setData).catch((e) => (e?.response?.status === 403 ? setDenied(true) : toast.error('Could not load analytics'))); }, [days]);
  const rows = useMemo(() => (data?.countries || []).filter((r) => `${r.name} ${r.code}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const cols = GROUPS[group][1];
  return (
    <div className="space-y-5" data-testid="country-analytics-page">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900"><BarChart3 className="h-6 w-6 text-[#6C2BFF]" /> Analytics · Countries</h1>
      <div className="flex flex-wrap gap-2">
        {[7, 30, 90, 365].map((d) => <Button key={d} variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)} data-testid={`ca-days-${d}`}>{d} days</Button>)}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter country" className="max-w-[220px]" data-testid="ca-search" />
      </div>
      <div className="flex flex-wrap gap-2">{GROUPS.map(([g], i) => <button key={g} type="button" onClick={() => setGroup(i)} data-testid={`ca-group-${i}`}
        className={`rounded-full px-4 py-1.5 text-sm font-bold ${group === i ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{g}</button>)}</div>
      {denied ? <p className="text-sm font-semibold text-red-600" data-testid="country-access-denied">Super Admin only.</p> : !data ? <p className="text-sm text-slate-500">Loading…</p> : (
        <div className="overflow-auto rounded-xl border border-slate-200" data-testid="ca-table">
          <table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-2">Country</th>{cols.map(([k, l]) => <th key={k} className="p-2">{l}</th>)}
            {group === 0 && <><th className="p-2">Top sources</th><th className="p-2">Top landing pages</th></>}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r.code} className="border-t" data-testid={`ca-row-${r.code}`}><td className="whitespace-nowrap p-2 font-semibold">{r.name}</td>
              {cols.map(([k]) => <td key={k} className="p-2">{fmt(r[k])}</td>)}
              {group === 0 && <><td className="p-2 text-xs">{(r.top_sources || []).map(([s, n]) => `${s} (${n})`).join(', ') || '—'}</td>
                <td className="p-2 text-xs">{(r.top_landing_pages || []).map(([s, n]) => `${s} (${n})`).join(', ') || '—'}</td></>}</tr>)}</tbody></table>
        </div>
      )}
      {data && group === 4 && <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm" data-testid="ca-otp-totals">
        <p className="mb-2 font-bold">OTP results (all countries, from provider logs)</p>
        <div className="flex flex-wrap gap-3">{Object.entries(data.otp_totals).map(([k, n]) => <span key={k} className="rounded bg-slate-100 px-2 py-1 text-xs">{k}: {n}</span>)}</div></div>}
      {data && <ul className="list-disc pl-5 text-xs text-slate-500">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <ExportPanel />
    </div>
  );
}
