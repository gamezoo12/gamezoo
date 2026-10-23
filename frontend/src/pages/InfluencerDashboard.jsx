import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { influencerAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';

const Metric = ({ label, value }) => (
  <div className="border-b border-slate-200 py-3">
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-xl font-black text-slate-900">{value ?? '—'}</div>
  </div>
);

export default function InfluencerDashboard() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rangeKey, setRangeKey] = useState('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      if (rangeKey === 'custom' && (!startDate || !endDate)) {
        setError('Choose both dates for a custom range.');
        return;
      }
      setReport(await influencerAPI.dashboard({
        range: rangeKey,
        ...(rangeKey === 'custom' ? { start_date: startDate, end_date: endDate } : {}),
      }));
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to load your campaign dashboard.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) navigate('/admin/login', { replace: true });
    else if (!loading && user?.role !== 'influencer') navigate('/', { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user?.role === 'influencer') refresh();
  }, [user?.role, rangeKey, startDate, endDate]);

  const copy = value => navigator.clipboard?.writeText(value);
  const download = async () => {
    try {
      const blob = await influencerAPI.commissionsCsv();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'influencer-commissions.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Could not export commissions.');
    }
  };

  if (loading || !user || user.role !== 'influencer') return <div className="min-h-screen bg-white" />;
  const overview = report?.overview || {};
  const metrics = [
    ['Affiliate visits', overview.visits], ['Unique visitors', overview.unique_visitors],
    ['Registrations', overview.registrations], ['Eligible registrations', overview.eligible_registrations],
    ['Pending registrations', overview.pending_registrations], ['Email verified', overview.email_verified_registrations],
    ['Mobile verified', overview.mobile_verified_registrations], ['Top-up users', overview.topup_users],
    ['Qualifying top-ups', overview.qualifying_topups], ['Qualifying top-up value', overview.qualifying_topup_value],
    ['Registration commission', overview.registration_commission], ['Top-up commission', overview.topup_commission],
    ['Pending', overview.pending_commission], ['Dispute hold', overview.held_commission], ['Approved', overview.approved_commission],
    ['Payment processing', overview.processing_commission],
    ['Paid', overview.paid_commission], ['Reversed', overview.reversed_commission],
    ['Outstanding payable', overview.outstanding_payable],
  ];

  return (
    <main className="min-h-screen bg-[#f4f7f5] text-slate-900" data-testid="influencer-dashboard">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Prize League partner</p><h1 className="text-xl font-black">{report?.influencer?.display_name || user.name || 'Your dashboard'}</h1></div>
          <div className="flex gap-2"><Button variant="outline" onClick={refresh} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button><Button variant="outline" onClick={async () => { await logout(); navigate('/admin/login', { replace: true }); }}>Sign out</Button></div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Campaign performance</h2><span className="text-xs text-slate-500">Live data from confirmed backend events{report?.range?.label ? ` · ${report.range.label} (${report.range.timezone})` : ''}</span></div><div className="flex flex-wrap gap-2"><select aria-label="Reporting period" value={rangeKey} onChange={event => setRangeKey(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="month">This month</option><option value="last_month">Last month</option><option value="custom">Custom range</option></select>{rangeKey === 'custom' && <><input aria-label="Start date" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm" /><input aria-label="End date" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm" /></>}</div></div>
          <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {metrics.map(([label, value]) => <Metric key={label} label={label} value={value ?? (label.includes('commission') || label.includes('payable') ? '£0.00' : 0)} />)}
          </div>
          <div className="mt-5 overflow-x-auto border-y border-slate-200 bg-white"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Funnel stage</th><th className="p-3">Count</th><th className="p-3">Conversion from prior stage</th></tr></thead><tbody className="divide-y divide-slate-100">{(report?.funnel || []).map(stage => <tr key={stage.stage}><td className="p-3">{stage.stage.replaceAll('_', ' ')}</td><td className="p-3">{stage.count}</td><td className="p-3">{stage.conversion_rate}%</td></tr>)}</tbody></table></div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Your campaigns</h2></div>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {(report?.campaigns || []).map(campaign => {
              const link = `${window.location.origin}/login?tab=signup&ref=${encodeURIComponent(campaign.code)}`;
                return <div key={campaign.promo_id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div><p className="font-bold">{campaign.campaign_name || campaign.code} <span className="ml-2 text-xs font-medium uppercase text-emerald-700">{campaign.active ? 'Active' : 'Paused'}</span></p><p className="text-sm text-slate-600">Code: <span className="font-semibold">{campaign.code}</span> · {campaign.registration_commission_pence || 0}p + {campaign.registration_commission_tokens || 0} tokens per eligible signup · {campaign.topup_commission_mode === 'fixed' ? `${campaign.topup_fixed_commission_pence || 0}p` : `${((campaign.topup_commission_bps || 0) / 100).toFixed(2)}%`} top-up cash</p><p className="text-xs text-slate-500">Token commission: {campaign.topup_token_mode === 'percentage' ? `${campaign.topup_commission_tokens || 0}%` : `${campaign.topup_commission_tokens || 0} tokens`} · User reward: {campaign.signup_reward_tokens || 0} signup tokens, {campaign.topup_reward_mode === 'percentage' ? `${((campaign.topup_reward_bps || 0) / 100).toFixed(2)}%` : `${campaign.topup_reward_tokens || 0} tokens`} per qualifying top-up · {campaign.bonus_expiry_days ? `${campaign.bonus_expiry_days}d expiry` : 'no expiry'}</p><p className="text-xs text-slate-500">{campaign.starts_at ? `Starts ${new Date(campaign.starts_at).toLocaleDateString()}` : 'Started immediately'} · {campaign.expires_at ? `Ends ${new Date(campaign.expires_at).toLocaleDateString()}` : 'No end date'}</p><p className="mt-1 break-all text-xs text-slate-500">{link}</p></div>
                <div className="flex items-center gap-3"><div className="bg-white p-2" aria-label={`QR code for ${campaign.code}`}><QRCodeSVG value={link} size={96} level="M" /></div><div className="flex flex-col gap-2"><Button size="sm" variant="outline" onClick={() => copy(campaign.code)}><Copy className="mr-1 h-3.5 w-3.5" /> Copy code</Button><Button size="sm" variant="outline" onClick={() => copy(link)}><ExternalLink className="mr-1 h-3.5 w-3.5" /> Copy link</Button></div></div>
              </div>;
            })}
            {!report?.campaigns?.length && <p className="py-5 text-sm text-slate-500">No active campaign links are assigned to this account.</p>}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Commission history</h2><Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" /> Export CSV</Button></div>
          <div className="overflow-x-auto border-y border-slate-200 bg-white"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Activity</th><th className="p-3">Qualifying top-up</th><th className="p-3">Commission</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{(report?.commissions || []).map((row, index) => <tr key={`${row.date}-${row.activity}-${index}`}><td className="p-3">{row.date ? new Date(row.date).toLocaleDateString() : '—'}</td><td className="p-3 capitalize">{row.activity}</td><td className="p-3">{row.topup_amount}</td><td className="p-3">{row.commission}{row.tokens ? ` · ${row.tokens} tokens` : ''}</td><td className="p-3 capitalize">{row.status}</td></tr>)}</tbody></table>{!report?.commissions?.length && <p className="p-4 text-sm text-slate-500">No commissions recorded yet.</p>}</div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">Referral activity</h2>
          <div className="overflow-x-auto border-y border-slate-200 bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Referral reference</th><th className="p-3">Registration date</th><th className="p-3">Email verified</th><th className="p-3">Mobile verified</th><th className="p-3">Eligible</th><th className="p-3">Qualifying top-up</th></tr></thead><tbody className="divide-y divide-slate-100">{(report?.referrals || []).map(row => <tr key={row.referral_ref}><td className="p-3 font-mono">{row.referral_ref}</td><td className="p-3">{row.registered_at ? new Date(row.registered_at).toLocaleDateString() : '—'}</td><td className="p-3">{row.email_verified ? 'Yes' : 'No'}</td><td className="p-3">{row.mobile_verified ? 'Yes' : 'No'}</td><td className="p-3">{row.registration_eligible ? 'Yes' : 'Pending'}</td><td className="p-3">{row.topup_qualified ? 'Yes' : 'No'}</td></tr>)}</tbody></table>{!report?.referrals?.length && <p className="p-4 text-sm text-slate-500">No attributed registrations yet.</p>}</div>
        </section>
      </div>
    </main>
  );
}