import { useEffect, useState } from 'react';
import { CalendarClock, Plus, Save, Ticket, Wallet } from 'lucide-react';
import { api, promotionCampaignAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';

const emptyCampaign = () => ({
  promotion_id: `promo-${Date.now()}`,
  name: '',
  description: '',
  campaign_type: 'ticket_draw',
  active: false,
  start_at: '',
  end_at: '',
  reward_tokens: 10,
  prize_total_gbp: 0,
  winner_count: 1,
  prize_per_winner_gbp: 0,
  mobile_image_url: '',
  tablet_image_url: '',
  desktop_image_url: '',
  signup_offer_text: '',
  topup_offer_text: '',
  show_join: true,
  show_refer: false,
  show_topup: false,
  join_url: '/my-account/promotions',
  refer_url: '/refer',
  topup_url: '/my-account/wallet?topup=1',
});

const toLocal = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const statusOf = (campaign) => {
  const now = Date.now();
  if (campaign.end_at && new Date(campaign.end_at).getTime() <= now) return 'Expired';
  if (campaign.start_at && new Date(campaign.start_at).getTime() > now) return 'Scheduled';
  return campaign.active ? 'Live' : 'Paused';
};

export default function PromotionCampaignsAdmin() {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawPanels, setDrawPanels] = useState({});
  const [drawBusy, setDrawBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/promotion/campaigns');
      setCampaigns(data.campaigns || []);
      setError('');
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Could not load campaigns.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const edit = (campaign) => setForm({
    ...campaign,
    start_at: toLocal(campaign.start_at),
    end_at: toLocal(campaign.end_at),
  });

  const save = async (event) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...form,
      start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      reward_tokens: Number(form.reward_tokens) || 0,
      prize_total_gbp: Number(form.prize_total_gbp) || 0,
      winner_count: Number(form.winner_count) || 1,
      prize_per_winner_gbp: Number(form.prize_per_winner_gbp) || 0,
    };
    try {
      if (form.existing) {
        await api.put(`/admin/promotion/campaigns/${encodeURIComponent(form.promotion_id)}`, payload);
      } else {
        await api.post('/admin/promotion/campaigns', payload);
      }
      setForm(null);
      setNotice('Promotion saved. Its dates control when players can claim it.');
      await load();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Could not save campaign.');
    } finally {
      setSaving(false);
    }
  };

  const loadDraw = async (campaign) => {
    setDrawBusy(campaign.promotion_id);
    try {
      const status = await promotionCampaignAPI.drawStatus(campaign.promotion_id);
      setDrawPanels((current) => ({ ...current, [campaign.promotion_id]: status }));
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Could not load this draw.');
    } finally {
      setDrawBusy('');
    }
  };

  const runCampaignDraw = async (campaign) => {
    if (!window.confirm(`Run the random draw for ${campaign.name}? This records the selected winners.`)) return;
    setDrawBusy(campaign.promotion_id);
    try {
      await promotionCampaignAPI.runDraw(campaign.promotion_id);
      await loadDraw(campaign);
      setNotice(`Draw completed for ${campaign.name}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Could not run this draw.');
    } finally {
      setDrawBusy('');
    }
  };

  const winnerAction = async (campaign, winner, action) => {
    if (action === 'pay' && !window.confirm(`Credit ${winner.prize_gbp} prize tokens to ${winner.user?.name || winner.user_id}?`)) return;
    const key = `${campaign.promotion_id}-${winner.place}`;
    setDrawBusy(key);
    try {
      if (action === 'verify') await promotionCampaignAPI.verifyWinner(campaign.promotion_id, winner.place);
      else await promotionCampaignAPI.payWinner(campaign.promotion_id, winner.place);
      await loadDraw(campaign);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Could not update this winner.');
    } finally {
      setDrawBusy('');
    }
  };

  return (
    <div className="space-y-6" data-testid="promotion-campaigns-admin">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Campaign controls</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Promotion campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">Create multiple offers and set their claim windows.</p>
        </div>
        <Button onClick={() => setForm(emptyCampaign())} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-600"><Plus className="h-4 w-4" /> New promotion</Button>
      </header>
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      {form && (
        <form onSubmit={save} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" data-testid="promotion-campaign-form">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black">{form.existing ? 'Edit promotion' : 'Create promotion'}</h2>
            <button type="button" onClick={() => setForm(null)} className="text-sm font-bold text-slate-500 hover:text-slate-900">Close</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Promotion ID" value={form.promotion_id} disabled={form.existing} onChange={(value) => setForm({ ...form, promotion_id: value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
            <Field label="Title" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
            <label className="text-xs font-bold text-slate-600">Promotion type<select value={form.campaign_type} onChange={(event) => setForm({ ...form, campaign_type: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"><option value="ticket_draw">Entry ticket draw</option><option value="referral_draw">Referral ticket draw</option><option value="token_credit">Token credit</option></select></label>
            <Field label="Starts at" type="datetime-local" value={form.start_at || ''} onChange={(value) => setForm({ ...form, start_at: value })} />
            <Field label="Expires at" type="datetime-local" value={form.end_at || ''} onChange={(value) => setForm({ ...form, end_at: value })} />
            {form.campaign_type === 'token_credit' ? (
              <Field label="Token reward" type="number" min="1" max="1000" value={form.reward_tokens} onChange={(value) => setForm({ ...form, reward_tokens: value })} />
            ) : (
              <>
                <Field label="Total prize (£)" type="number" min="0" value={form.prize_total_gbp} onChange={(value) => setForm({ ...form, prize_total_gbp: value })} />
                <Field label="Number of winners" type="number" min="1" value={form.winner_count} onChange={(value) => setForm({ ...form, winner_count: value })} />
                <Field label="Prize per winner (£)" type="number" min="0" value={form.prize_per_winner_gbp} onChange={(value) => setForm({ ...form, prize_per_winner_gbp: value })} />
              </>
            )}
            <Field label="Mobile artwork URL" value={form.mobile_image_url || ''} onChange={(value) => setForm({ ...form, mobile_image_url: value })} />
            <Field label="Tablet artwork URL" value={form.tablet_image_url || ''} onChange={(value) => setForm({ ...form, tablet_image_url: value })} />
            <Field label="Desktop artwork URL" value={form.desktop_image_url || ''} onChange={(value) => setForm({ ...form, desktop_image_url: value })} />
          </div>
          <label className="block text-xs font-bold text-slate-600">Description<textarea value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Signup offer text" value={form.signup_offer_text || ''} onChange={(value) => setForm({ ...form, signup_offer_text: value })} />
            <Field label="Top-up offer text" value={form.topup_offer_text || ''} onChange={(value) => setForm({ ...form, topup_offer_text: value })} />
            {[["Join", 'show_join', 'join_url'], ["Refer", 'show_refer', 'refer_url'], ["Top Up", 'show_topup', 'topup_url']].map(([label, enabled, link]) => <div key={enabled}>
              <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!form[enabled]} onChange={(event) => setForm({ ...form, [enabled]: event.target.checked })} />{label}</label>
              <Field label="Destination" value={form[link] || ''} onChange={(value) => setForm({ ...form, [link]: value })} />
            </div>)}
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={!!form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Enabled during the scheduled window</label>
          <div className="flex justify-end">
            <Button disabled={saving} type="submit" className="gap-2 bg-slate-900 text-white"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save promotion'}</Button>
          </div>
        </form>
      )}

      {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading campaigns…</p> : campaigns.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-slate-500">No promotions yet.</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Claim window</th><th className="px-4 py-3">Reward</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((campaign) => <tr key={campaign.promotion_id}>
                <td className="px-4 py-3"><div className="font-bold text-slate-900">{campaign.name}</div><div className="font-mono text-xs text-slate-500">{campaign.promotion_id}{campaign.legacy ? ' · legacy' : ''}</div></td>
                <td className="px-4 py-3 capitalize">{campaign.campaign_type?.replace(/_/g, ' ') || 'referral draw'}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{campaign.start_at ? new Date(campaign.start_at).toLocaleString() : 'Any time'}<br />until {campaign.end_at ? new Date(campaign.end_at).toLocaleString() : 'No expiry'}</td>
                <td className="px-4 py-3">{campaign.campaign_type === 'token_credit' ? `${campaign.reward_tokens} tokens` : `${campaign.winner_count || 1} winner(s)`}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${statusOf(campaign) === 'Live' ? 'bg-emerald-100 text-emerald-800' : statusOf(campaign) === 'Scheduled' ? 'bg-sky-100 text-sky-800' : statusOf(campaign) === 'Expired' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>{statusOf(campaign)}</span></td>
                <td className="px-4 py-3 text-right">{!campaign.legacy && <Button variant="outline" size="sm" onClick={() => edit({ ...campaign, existing: true })}>Edit</Button>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}

      {campaigns.filter((campaign) => ['ticket_draw', 'referral_draw'].includes(campaign.campaign_type)).length > 0 && (
        <section className="space-y-3" data-testid="promotion-campaign-draws">
          <div>
            <h2 className="text-xl font-black text-slate-900">Ticket draw campaigns</h2>
            <p className="mt-1 text-sm text-slate-500">Draw becomes available after the campaign expiry time.</p>
          </div>
          {campaigns.filter((campaign) => ['ticket_draw', 'referral_draw'].includes(campaign.campaign_type)).map((campaign) => {
            const drawState = drawPanels[campaign.promotion_id];
            return <div key={campaign.promotion_id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="font-bold text-slate-900">{campaign.name}</div><div className="text-xs text-slate-500">{campaign.promotion_id}</div></div>
                {!drawState ? <Button type="button" variant="outline" disabled={drawBusy === campaign.promotion_id} onClick={() => loadDraw(campaign)}>{drawBusy === campaign.promotion_id ? 'Loading…' : 'Load draw status'}</Button>
                  : drawState.can_draw ? <Button type="button" disabled={!!drawBusy} onClick={() => runCampaignDraw(campaign)}>{drawBusy === campaign.promotion_id ? 'Drawing…' : 'Run secure random draw'}</Button>
                    : <span className="text-xs font-semibold text-slate-500">{drawState.drawn ? 'Draw complete' : drawState.blocked_reason}</span>}
              </div>
              {drawState && <div className="mt-3 text-xs text-slate-500">{drawState.eligible_ticket_count} entries · {drawState.eligible_user_count} unique users</div>}
              {drawState?.draw?.winners?.length > 0 && <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                {drawState.draw.winners.map((winner) => <div key={winner.place} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <div className="text-sm"><b>#{winner.place}</b> {winner.user?.name || winner.user?.username || winner.user_id} · ticket {winner.ticket_number} · £{winner.prize_gbp} prize</div>
                  <div className="flex gap-2 text-xs">
                    {winner.verification_status !== 'verified' && <button type="button" disabled={!!drawBusy} onClick={() => winnerAction(campaign, winner, 'verify')} className="rounded-md border px-2.5 py-1.5 font-bold">Verify</button>}
                    {winner.payment_status !== 'paid' && <button type="button" disabled={!!drawBusy || winner.verification_status !== 'verified'} onClick={() => winnerAction(campaign, winner, 'pay')} className="rounded-md bg-emerald-700 px-2.5 py-1.5 font-bold text-white disabled:opacity-40">Credit prize</button>}
                    {winner.payment_status === 'paid' && <span className="font-bold text-emerald-700">Paid</span>}
                  </div>
                </div>)}
              </div>}
            </div>;
          })}
        </section>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', disabled = false, min, max }) {
  return <label className="text-xs font-bold text-slate-600">{label}<input type={type} min={min} max={max} disabled={disabled} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal disabled:bg-slate-100" /></label>;
}
