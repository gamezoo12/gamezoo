import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Clock3, Gift, Ticket, Wallet } from 'lucide-react';
import BackButton from '../components/BackButton';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { api } from '../lib/api';

const money = (value) => `£${Number(value || 0).toLocaleString('en-GB')}`;
const formatDate = (value) => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not set';

function campaignState(campaign) {
  const now = Date.now();
  if (campaign.end_at && new Date(campaign.end_at).getTime() <= now) return 'expired';
  if (campaign.start_at && new Date(campaign.start_at).getTime() > now) return 'upcoming';
  return campaign.is_live ? 'live' : 'paused';
}

function CampaignCard({ campaign, busy, onClaim, onDetails }) {
  const state = campaignState(campaign);
  const Icon = campaign.campaign_type === 'token_credit' ? Wallet : campaign.campaign_type === 'ticket_draw' ? Ticket : Gift;
  const reward = campaign.campaign_type === 'token_credit'
    ? `${campaign.reward_tokens} bonus tokens`
    : campaign.campaign_type === 'ticket_draw'
      ? `${campaign.prize_total_gbp ? money(campaign.prize_total_gbp) : 'Prize'} ticket draw`
      : `${campaign.winner_count || 1} referral draw winner${Number(campaign.winner_count) === 1 ? '' : 's'}`;
  const statusStyles = {
    live: 'bg-emerald-100 text-emerald-800',
    upcoming: 'bg-sky-100 text-sky-800',
    expired: 'bg-slate-100 text-slate-600',
    paused: 'bg-amber-100 text-amber-800',
  };

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-testid={`promotion-card-${campaign.promotion_id}`}>
      <div className="relative flex min-h-44 items-end overflow-hidden bg-[#101b26] p-5 text-white">
        {(campaign.desktop_image_url || campaign.tablet_image_url || campaign.mobile_image_url) && (
          <img src={campaign.desktop_image_url || campaign.tablet_image_url || campaign.mobile_image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent" />
        <div className="relative flex w-full items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/85">
              <Icon className="h-3.5 w-3.5" /> {campaign.campaign_type.replace(/_/g, ' ')}
            </div>
            <h2 className="text-xl font-black leading-tight sm:text-2xl">{campaign.name}</h2>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${statusStyles[state]}`}>{state}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-sm leading-relaxed text-slate-600">{campaign.description || 'See the offer details and claim while this promotion is open.'}</p>
        <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div className="flex items-center gap-2"><Gift className="h-4 w-4 text-emerald-700" /><span className="font-bold text-slate-900">{reward}</span></div>
          <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-500" /><span>Opens: {formatDate(campaign.start_at)}</span></div>
          <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" /><span>Expires: {formatDate(campaign.end_at)}</span></div>
          {campaign.joined && (
            <div className="flex items-center gap-2 pt-1 font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> Claimed{campaign.ticket_count ? ` · ${campaign.ticket_count} tickets` : campaign.claimed_tokens ? ` · ${campaign.claimed_tokens} tokens` : ''}
            </div>
          )}
        </div>
        <div className="mt-auto space-y-2 pt-4">
          <Button type="button" variant="outline" onClick={() => onDetails(campaign)} className="w-full font-bold" data-testid={`promotion-details-${campaign.promotion_id}`}>View details</Button>
          {campaign.joined ? (
            <Button disabled className="w-full bg-emerald-700 font-extrabold text-white">Claimed</Button>
          ) : state === 'live' ? (
            <Button onClick={() => onClaim(campaign)} disabled={busy} className="w-full bg-emerald-700 font-extrabold text-white hover:bg-emerald-600" data-testid={`claim-promotion-${campaign.promotion_id}`}>
              {busy ? 'Claiming…' : campaign.campaign_type === 'token_credit' ? 'Claim tokens' : 'Claim promotion'}
            </Button>
          ) : (
            <Button disabled className="w-full" variant="outline">{state === 'upcoming' ? 'Opens later' : state === 'expired' ? 'Expired' : 'Unavailable'}</Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function PromotionCampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/promotion/campaigns');
      setCampaigns(data.campaigns || []);
      setError('');
    } catch (requestError) {
      if (requestError?.response?.status === 401) {
        navigate('/login?next=%2Fmy-account%2Fpromotions', { replace: true });
        return;
      }
      setError(requestError?.response?.data?.detail || 'Promotions could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);
  useEffect(() => { load(); }, [load]);

  const claim = async (campaign) => {
    setBusyId(campaign.promotion_id);
    setNotice('');
    try {
      const { data } = await api.post(`/promotion/campaigns/${encodeURIComponent(campaign.promotion_id)}/claim`);
      setNotice(data.claimed_tokens
        ? `${data.claimed_tokens} tokens added to your wallet.`
        : 'Promotion claimed. Your entry is recorded.');
      await load();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Could not claim this promotion.');
    } finally {
      setBusyId('');
    }
  };

  const live = campaigns.filter((campaign) => campaignState(campaign) === 'live');
  const upcoming = campaigns.filter((campaign) => campaignState(campaign) === 'upcoming');
  const past = campaigns.filter((campaign) => ['expired', 'paused'].includes(campaignState(campaign)));

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-8 px-4 py-6 sm:px-6 lg:px-8" data-testid="promotion-campaigns-page">
      <BackButton />
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Offers & rewards</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Promotions</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Browse token rewards, entry-ticket draws and referral promotions. Each offer is claimable only during its published dates.</p>
      </header>
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}
      {loading ? <p className="py-10 text-center text-sm text-slate-500" role="status">Loading promotions…</p> : campaigns.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">There are no promotions available right now.</p> : (
        <div className="space-y-9">
          {[['Open now', live], ['Coming up', upcoming], ['Past promotions', past]].map(([title, rows]) => rows.length > 0 && (
            <section key={title}>
              <h2 className="mb-4 text-xl font-black text-slate-900">{title}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((campaign) => <CampaignCard key={campaign.promotion_id} campaign={campaign} busy={busyId === campaign.promotion_id} onClaim={claim} onDetails={setSelected} />)}
              </div>
            </section>
          ))}
        </div>
      )}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="promotion-details-dialog">
          {selected && (() => {
            const state = campaignState(selected);
            const img = selected.desktop_image_url || selected.tablet_image_url || selected.mobile_image_url;
            const reward = selected.campaign_type === 'token_credit'
              ? `${selected.reward_tokens} bonus tokens`
              : selected.campaign_type === 'ticket_draw'
                ? `${selected.prize_total_gbp ? money(selected.prize_total_gbp) : 'Prize'} ticket draw`
                : `${selected.winner_count || 1} referral draw winner${Number(selected.winner_count) === 1 ? '' : 's'}`;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{selected.name}</DialogTitle>
                  <DialogDescription className="capitalize">{selected.campaign_type.replace(/_/g, ' ')} · {state}</DialogDescription>
                </DialogHeader>
                {img && <img src={img} alt="" className="max-h-56 w-full rounded-lg object-cover" />}
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{selected.description || 'See the offer details and claim while this promotion is open.'}</p>
                <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <div><span className="font-bold">Reward:</span> {reward}</div>
                  <div><span className="font-bold">Opens:</span> {formatDate(selected.start_at)}</div>
                  <div><span className="font-bold">Expires:</span> {formatDate(selected.end_at)}</div>
                </div>
                {selected.joined ? (
                  <Button disabled className="w-full bg-emerald-700 font-extrabold text-white">Claimed</Button>
                ) : state === 'live' ? (
                  <Button onClick={async () => { await claim(selected); setSelected(null); }} disabled={busyId === selected.promotion_id} className="w-full bg-emerald-700 font-extrabold text-white hover:bg-emerald-600">
                    {selected.campaign_type === 'token_credit' ? 'Claim tokens' : 'Claim promotion'}
                  </Button>
                ) : null}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </main>
  );
}
