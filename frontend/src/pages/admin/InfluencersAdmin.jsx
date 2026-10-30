import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Copy, ExternalLink, Plus, QrCode, RefreshCw, Users } from 'lucide-react';
import { InfluencerPosterDialog } from '../../components/admin/InfluencerPosterDialog';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

const initialCampaign = {
  code: '', influencer_name: '', campaign_name: '', reward_type: 'cash',
  registration_commission_pence: '50', registration_commission_tokens: '0', registration_eligibility: 'email_verified',
  topup_commission_mode: 'percentage', topup_commission_bps: '500',
  topup_fixed_commission_pence: '0', topup_minimum_pence: '0',
  topup_token_mode: 'fixed', topup_commission_tokens: '0',
  topup_qualification: 'first_success', topup_first_n: '1',
  attribution_window_days: '30', signup_reward_tokens: '0', topup_reward_tokens: '0',
  topup_reward_mode: 'fixed', topup_reward_bps: '0',
  bonus_expiry_days: '30', starts_at: '', expires_at: '',
  commission_cap_pence: '', budget_pence: '',
};

export default function InfluencersAdmin() {
  const [profiles, setProfiles] = useState([]);
  const [promos, setPromos] = useState([]);
  const [selected, setSelected] = useState('');
  const [commissions, setCommissions] = useState([]);
  const [assignment, setAssignment] = useState({ email: '', display_name: '' });
  const [invite, setInvite] = useState({ email: '', display_name: '' });
  const [inviteUrl, setInviteUrl] = useState('');
  const [campaign, setCampaign] = useState(initialCampaign);
  const [editingPromoId, setEditingPromoId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [posterPromo, setPosterPromo] = useState(null);

  const selectedProfile = profiles.find(profile => profile.influencer_id === selected);
  const selectedPromos = useMemo(() => promos.filter(promo => promo.influencer_id === selected), [promos, selected]);

  const refresh = async (filters = { q: search, status: statusFilter }) => {
    const [profileResult, promoResult] = await Promise.all([adminAPI.influencers(filters), adminAPI.influencerPromos()]);
    setProfiles(profileResult.influencers || []);
    setPromos(promoResult.promos || []);
  };

  useEffect(() => {
    refresh().catch(error => setMessage(error?.response?.data?.detail || 'Could not load influencer records.'));
  }, []);

  useEffect(() => {
    if (!selected) {
      setCommissions([]);
      return;
    }
    adminAPI.influencerCommissions(selected)
      .then(result => setCommissions(result.commissions || []))
      .catch(error => setMessage(error?.response?.data?.detail || 'Could not load commission history.'));
  }, [selected]);

  const assign = async event => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await adminAPI.assignInfluencer(assignment);
      setAssignment({ email: '', display_name: '' });
      await refresh();
      setSelected(result.influencer_id);
      setMessage('Influencer access assigned.');
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not assign influencer access.');
    } finally {
      setBusy(false);
    }
  };

  const createInvite = async event => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await adminAPI.createInfluencerInvite(invite);
      setInviteUrl(result.signup_url);
      setMessage(`One-use invitation created for ${result.email}. It expires ${new Date(result.expires_at).toLocaleString()}.`);
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not create invitation.');
    } finally {
      setBusy(false);
    }
  };

  const createCampaign = async event => {
    event.preventDefault();
    if (!selectedProfile) return;
    setBusy(true);
    setMessage('');
    try {
      const payload = {
        ...campaign,
        influencer_id: selected,
        influencer_name: selectedProfile.display_name,
        registration_commission_pence: Number(campaign.registration_commission_pence),
        registration_commission_tokens: Number(campaign.registration_commission_tokens),
        topup_commission_bps: Number(campaign.topup_commission_bps),
        topup_fixed_commission_pence: Number(campaign.topup_fixed_commission_pence),
        topup_commission_tokens: Number(campaign.topup_commission_tokens),
        topup_minimum_pence: Number(campaign.topup_minimum_pence),
        topup_first_n: Number(campaign.topup_first_n),
        attribution_window_days: Number(campaign.attribution_window_days),
        signup_reward_tokens: Number(campaign.signup_reward_tokens),
        topup_reward_tokens: Number(campaign.topup_reward_tokens),
        topup_reward_bps: Number(campaign.topup_reward_bps),
        bonus_expiry_days: campaign.bonus_expiry_days === '' ? null : Number(campaign.bonus_expiry_days),
        commission_cap_pence: campaign.commission_cap_pence === '' ? null : Number(campaign.commission_cap_pence),
        budget_pence: campaign.budget_pence === '' ? null : Number(campaign.budget_pence),
        starts_at: campaign.starts_at ? new Date(campaign.starts_at).toISOString() : null,
        expires_at: campaign.expires_at ? new Date(campaign.expires_at).toISOString() : null,
      };
      if (editingPromoId) {
        const updates = { ...payload };
        delete updates.code;
        delete updates.influencer_id;
        delete updates.influencer_name;
        await adminAPI.updateInfluencerPromo(editingPromoId, updates);
      } else {
        await adminAPI.createInfluencerPromo(payload);
      }
      setCampaign(initialCampaign);
      setEditingPromoId('');
      await refresh();
      setMessage(editingPromoId ? 'Campaign updated.' : 'Campaign created. Its link is available below.');
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not create campaign.');
    } finally {
      setBusy(false);
    }
  };

  const setProfileStatus = async status => {
    setBusy(true);
    try {
      await adminAPI.updateInfluencer(selected, { status });
      await refresh();
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not update influencer status.');
    } finally {
      setBusy(false);
    }
  };

  const setCampaignActive = async promo => {
    setBusy(true);
    try {
      await adminAPI.updateInfluencerPromo(promo.promo_id, { active: !promo.active });
      await refresh();
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not update campaign.');
    } finally {
      setBusy(false);
    }
  };

  const editCampaign = promo => {
    const asDateInput = value => {
      if (!value) return '';
      const date = new Date(value);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };
    setEditingPromoId(promo.promo_id);
    setCampaign({
      ...initialCampaign,
      code: promo.code || '', campaign_name: promo.campaign_name || '',
      reward_type: promo.reward_type || 'none',
      registration_commission_pence: String(promo.registration_commission_pence || 0),
      registration_commission_tokens: String(promo.registration_commission_tokens || 0),
      registration_eligibility: promo.registration_eligibility || 'email_verified',
      topup_commission_mode: promo.topup_commission_mode || 'disabled',
      topup_commission_bps: String(promo.topup_commission_bps || 0),
      topup_fixed_commission_pence: String(promo.topup_fixed_commission_pence || 0),
      topup_token_mode: promo.topup_token_mode || 'fixed',
      topup_commission_tokens: String(promo.topup_commission_tokens || 0),
      topup_qualification: promo.topup_qualification || 'first_success',
      topup_first_n: String(promo.topup_first_n || 1),
      topup_minimum_pence: String(promo.topup_minimum_pence || 0),
      signup_reward_tokens: String(promo.signup_reward_tokens || 0),
      topup_reward_tokens: String(promo.topup_reward_tokens || 0),
      topup_reward_mode: promo.topup_reward_mode || 'fixed',
      topup_reward_bps: String(promo.topup_reward_bps || 0),
      attribution_window_days: String(promo.attribution_window_days || 30),
      bonus_expiry_days: promo.bonus_expiry_days == null ? '' : String(promo.bonus_expiry_days),
      commission_cap_pence: promo.commission_cap_pence == null ? '' : String(promo.commission_cap_pence),
      budget_pence: promo.budget_pence == null ? '' : String(promo.budget_pence),
      starts_at: asDateInput(promo.starts_at), expires_at: asDateInput(promo.expires_at),
    });
  };

  const cancelCampaignEdit = () => {
    setCampaign(initialCampaign);
    setEditingPromoId('');
  };

  const review = async (row, decision) => {
    const reason = window.prompt(`Reason to ${decision} this commission (at least 10 characters):`);
    if (!reason || reason.trim().length < 10) return;
    try {
      await adminAPI.reviewInfluencerCommission(selected, row.commission_id, { decision, reason: reason.trim() });
      setCommissions((await adminAPI.influencerCommissions(selected)).commissions || []);
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not review commission.');
    }
  };

  const recordPayment = async row => {
    const reference = window.prompt('External settlement reference:');
    if (!reference || reference.trim().length < 4) return;
    const note = window.prompt('Record how settlement was verified (at least 10 characters):');
    if (!note || note.trim().length < 10) return;
    try {
      await adminAPI.recordInfluencerPayment(selected, row.commission_id, {
        payment_method: 'bank_transfer', payment_reference: reference.trim(),
        paid_at: new Date().toISOString(), confirmed_external_payment: true, note: note.trim(),
      });
      setCommissions((await adminAPI.influencerCommissions(selected)).commissions || []);
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not record external payment.');
    }
  };

  const campaignLink = code => `${window.location.origin}/login?tab=signup&ref=${encodeURIComponent(code)}`;
  const copy = value => navigator.clipboard?.writeText(value).then(() => setMessage('Copied to clipboard.'));
  const exportCsv = async kind => {
    try {
      const blob = kind === 'campaigns'
        ? await adminAPI.exportInfluencerCampaigns(selected ? { influencer_id: selected } : {})
        : await adminAPI.exportInfluencerCommissions(selected ? { influencer_id: selected } : {});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `influencer-${kind}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error?.response?.data?.detail || 'Could not export report.');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-testid="admin-influencers">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Partner operations</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Influencers</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportCsv('campaigns')}><ExternalLink className="mr-2 h-4 w-4" /> Export campaigns</Button>
          <Button variant="outline" onClick={() => exportCsv('commissions')}><ExternalLink className="mr-2 h-4 w-4" /> Export commissions</Button>
          <Button variant="outline" onClick={() => refresh().catch(() => setMessage('Refresh failed.'))} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
        </div>
      </header>
      {message && <p role="status" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{message}</p>}

      <section className="grid gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)]">
        <div className="space-y-4">
          <form onSubmit={assign} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="flex items-center gap-2 font-bold text-slate-900"><Users className="h-4 w-4" /> Assign existing user</h2>
            <Input required type="email" value={assignment.email} onChange={event => setAssignment({ ...assignment, email: event.target.value })} placeholder="Account email" aria-label="Account email" />
            <Input required value={assignment.display_name} onChange={event => setAssignment({ ...assignment, display_name: event.target.value })} placeholder="Partner display name" aria-label="Partner display name" />
            <Button disabled={busy} type="submit"><Plus className="mr-2 h-4 w-4" /> Assign influencer role</Button>
          </form>
          <form onSubmit={createInvite} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-bold text-slate-900">Invite new partner</h2>
            <Input required type="email" value={invite.email} onChange={event => setInvite({ ...invite, email: event.target.value })} placeholder="Partner email" aria-label="Invite email" />
            <Input required value={invite.display_name} onChange={event => setInvite({ ...invite, display_name: event.target.value })} placeholder="Partner display name" aria-label="Invite display name" />
            <Button disabled={busy} type="submit"><Plus className="mr-2 h-4 w-4" /> Create signup invitation</Button>
            {inviteUrl && <div className="space-y-2 border-t border-slate-100 pt-3"><p className="break-all text-xs text-slate-600">{inviteUrl}</p><Button type="button" size="sm" variant="outline" onClick={() => copy(inviteUrl)}><Copy className="mr-2 h-3.5 w-3.5" /> Copy invitation link</Button></div>}
          </form>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3 font-bold">Partner accounts <span className="text-slate-400">{profiles.length}</span></div>
            <form className="flex gap-2 border-b border-slate-100 p-3" onSubmit={event => { event.preventDefault(); refresh({ q: search, status: statusFilter }).catch(() => setMessage('Search failed.')); }}>
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or email" aria-label="Search influencers" />
              <select aria-label="Influencer status" value={statusFilter} onChange={event => { const value = event.target.value; setStatusFilter(value); refresh({ q: search, status: value }).catch(() => setMessage('Filter failed.')); }} className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm"><option value="all">All</option><option value="active">Active</option><option value="paused">Paused</option><option value="deactivated">Deactivated</option></select>
              <Button type="submit" variant="outline">Search</Button>
            </form>
            <div className="max-h-[32rem] overflow-auto divide-y divide-slate-100">
              {profiles.map(profile => (
                <button key={profile.influencer_id} type="button" onClick={() => setSelected(profile.influencer_id)}
                  className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${selected === profile.influencer_id ? 'bg-emerald-50' : ''}`}>
                  <span className="block font-semibold text-slate-900">{profile.display_name}</span>
                  <span className="block truncate text-xs text-slate-500">{profile.user?.email || profile.user_id}</span>
                  <span className="mt-1 inline-block text-[11px] uppercase text-slate-500">{profile.status}</span>
                  {profile.stats && <span className="mt-1 block text-[11px] text-slate-500">{profile.stats.visits} visits · {profile.stats.registrations} signups · {profile.stats.topup_users} top-up users · {profile.stats.commission} earned</span>}
                </button>
              ))}
              {!profiles.length && <p className="p-4 text-sm text-slate-500">No influencer accounts yet.</p>}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {!selectedProfile ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Select an influencer to manage campaigns and commissions.</div>
          ) : (
            <>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="text-lg font-bold text-slate-900">{selectedProfile.display_name}</h2><p className="text-xs text-slate-500">{selectedProfile.user?.email} · {selectedProfile.status}</p></div>
                  <Button variant="outline" disabled={busy} onClick={() => setProfileStatus(selectedProfile.status === 'active' ? 'paused' : 'active')}>
                    {selectedProfile.status === 'active' ? 'Pause access' : 'Activate access'}
                  </Button>
                </div>
              </section>

              <form onSubmit={createCampaign} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><h2 className="font-bold text-slate-900">{editingPromoId ? `Edit campaign ${campaign.code}` : 'Create campaign'}</h2><p className="text-xs text-slate-500">Rates are snapshotted on qualifying events. No cash payout is initiated here.</p></div>
                {!editingPromoId && <Input required value={campaign.code} onChange={event => setCampaign({ ...campaign, code: event.target.value.toUpperCase() })} placeholder="Unique promo code" aria-label="Promo code" />}
                <Input required value={campaign.campaign_name} onChange={event => setCampaign({ ...campaign, campaign_name: event.target.value })} placeholder="Campaign name" aria-label="Campaign name" />
                <label className="text-xs font-semibold text-slate-600">Partner reward<select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={campaign.reward_type} onChange={event => setCampaign({ ...campaign, reward_type: event.target.value })}><option value="cash">Cash commission</option><option value="tokens">Tokens</option><option value="both">Cash and tokens</option><option value="none">No commission</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Registration eligibility<select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={campaign.registration_eligibility} onChange={event => setCampaign({ ...campaign, registration_eligibility: event.target.value })}><option value="email_verified">Email verified</option><option value="mobile_verified">Mobile verified</option><option value="first_topup">First qualifying top-up</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Registration commission (pence)<Input type="number" min="0" value={campaign.registration_commission_pence} onChange={event => setCampaign({ ...campaign, registration_commission_pence: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Registration commission (tokens)<Input type="number" min="0" step="0.01" value={campaign.registration_commission_tokens} onChange={event => setCampaign({ ...campaign, registration_commission_tokens: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Top-up commission<select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={campaign.topup_commission_mode} onChange={event => setCampaign({ ...campaign, topup_commission_mode: event.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed</option><option value="disabled">Disabled</option></select></label>
                <label className="text-xs font-semibold text-slate-600">Top-up percentage (basis points)<Input type="number" min="0" max="10000" value={campaign.topup_commission_bps} onChange={event => setCampaign({ ...campaign, topup_commission_bps: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Fixed top-up commission (pence)<Input type="number" min="0" value={campaign.topup_fixed_commission_pence} onChange={event => setCampaign({ ...campaign, topup_fixed_commission_pence: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Top-up token commission<select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={campaign.topup_token_mode} onChange={event => setCampaign({ ...campaign, topup_token_mode: event.target.value })}><option value="fixed">Fixed tokens</option><option value="percentage">Percentage of eligible GBP</option></select></label>
                <label className="text-xs font-semibold text-slate-600">{campaign.topup_token_mode === 'percentage' ? 'Token commission percentage' : 'Tokens per qualifying top-up'}<Input type="number" min="0" step="0.01" value={campaign.topup_commission_tokens} onChange={event => setCampaign({ ...campaign, topup_commission_tokens: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Qualifying top-ups<select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={campaign.topup_qualification} onChange={event => setCampaign({ ...campaign, topup_qualification: event.target.value })}><option value="first_success">First successful top-up</option><option value="every_success">Every successful top-up</option><option value="first_n">First N successful top-ups</option></select></label>
                <label className="text-xs font-semibold text-slate-600">First N top-ups<Input type="number" min="1" max="100" value={campaign.topup_first_n} onChange={event => setCampaign({ ...campaign, topup_first_n: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Signup bonus tokens<Input type="number" min="0" step="0.01" value={campaign.signup_reward_tokens} onChange={event => setCampaign({ ...campaign, signup_reward_tokens: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Top-up bonus tokens<Input type="number" min="0" step="0.01" value={campaign.topup_reward_tokens} onChange={event => setCampaign({ ...campaign, topup_reward_tokens: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">User top-up bonus type<select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={campaign.topup_reward_mode} onChange={event => setCampaign({ ...campaign, topup_reward_mode: event.target.value })}><option value="fixed">Fixed tokens</option><option value="percentage">Percentage of top-up value</option></select></label>
                <label className="text-xs font-semibold text-slate-600">User top-up bonus percentage (basis points)<Input type="number" min="0" max="10000" value={campaign.topup_reward_bps} onChange={event => setCampaign({ ...campaign, topup_reward_bps: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Attribution window (days)<Input type="number" min="1" max="365" value={campaign.attribution_window_days} onChange={event => setCampaign({ ...campaign, attribution_window_days: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Bonus expiry (days, blank = no expiry)<Input type="number" min="1" max="3650" value={campaign.bonus_expiry_days} onChange={event => setCampaign({ ...campaign, bonus_expiry_days: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Minimum qualifying top-up (pence)<Input type="number" min="0" value={campaign.topup_minimum_pence} onChange={event => setCampaign({ ...campaign, topup_minimum_pence: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Commission cap (pence, blank = none)<Input type="number" min="0" value={campaign.commission_cap_pence} onChange={event => setCampaign({ ...campaign, commission_cap_pence: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Campaign budget (pence, blank = none)<Input type="number" min="0" value={campaign.budget_pence} onChange={event => setCampaign({ ...campaign, budget_pence: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Starts at<Input type="datetime-local" value={campaign.starts_at} onChange={event => setCampaign({ ...campaign, starts_at: event.target.value })} /></label>
                <label className="text-xs font-semibold text-slate-600">Ends at<Input type="datetime-local" value={campaign.expires_at} onChange={event => setCampaign({ ...campaign, expires_at: event.target.value })} /></label>
                <div className="sm:col-span-2 flex gap-2"><Button type="submit" disabled={busy}><Plus className="mr-2 h-4 w-4" /> {editingPromoId ? 'Save campaign' : 'Create campaign'}</Button>{editingPromoId && <Button type="button" variant="outline" onClick={cancelCampaignEdit} disabled={busy}>Cancel edit</Button>}</div>
              </form>

              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3 font-bold">Campaigns and affiliate links</div>
                <div className="divide-y divide-slate-100">
                  {selectedPromos.map(promo => (
                    <div key={promo.promo_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div><p className="font-semibold">{promo.campaign_name || promo.code} <span className="text-xs text-slate-500">{promo.active ? 'Active' : 'Paused'}</span></p><p className="text-xs text-slate-500">{promo.code} · {promo.registration_commission_pence || 0}p / eligible signup · {(promo.topup_commission_bps || 0) / 100}% top-up</p><a className="mt-1 block break-all text-xs text-emerald-700 underline" href={campaignLink(promo.code)}>{campaignLink(promo.code)}</a></div>
                      <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => copy(campaignLink(promo.code))}><Copy className="mr-1 h-3.5 w-3.5" /> Copy</Button><Button size="sm" variant="outline" onClick={() => setPosterPromo(promo)} data-testid={`influencer-qr-btn-${promo.code}`}><QrCode className="mr-1 h-3.5 w-3.5" /> QR & Poster</Button><Button size="sm" variant="outline" onClick={() => editCampaign(promo)}>Edit</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setCampaignActive(promo)}>{promo.active ? 'Pause' : 'Activate'}</Button></div>
                    </div>
                  ))}
                  {!selectedPromos.length && <p className="p-4 text-sm text-slate-500">No campaigns created for this partner.</p>}
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="font-bold">Commission ledger</h2><BadgeCheck className="h-4 w-4 text-emerald-700" /></div>
                <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Event</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{commissions.map(row => <tr key={row.commission_id}><td className="p-3">{row.event_kind}<span className="block text-xs text-slate-500">{row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}</span></td><td className="p-3">£{(Number(row.amount_pence || 0) / 100).toFixed(2)}{row.amount_tokens ? ` · ${row.amount_tokens} tokens` : ''}</td><td className="p-3 capitalize">{row.status}</td><td className="p-3">{row.status === 'pending' && <div className="flex gap-1"><Button size="sm" onClick={() => review(row, 'approved')}>Approve</Button><Button size="sm" variant="outline" onClick={() => review(row, 'rejected')}>Reject</Button></div>}{row.status === 'approved' && Number(row.amount_pence) > 0 && <Button size="sm" variant="outline" onClick={() => recordPayment(row)}><ExternalLink className="mr-1 h-3 w-3" /> Record settled payment</Button>}</td></tr>)}</tbody></table>{!commissions.length && <p className="p-4 text-sm text-slate-500">No commission events yet.</p>}</div>
              </section>
            </>
          )}
        </div>
      </section>
      {posterPromo && <InfluencerPosterDialog promo={posterPromo} link={campaignLink(posterPromo.code)} onClose={() => setPosterPromo(null)} notify={setMessage} />}
    </div>
  );
}