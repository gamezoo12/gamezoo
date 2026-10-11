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
                  {busy ? 'Joining…' : campaign.campaign_type === 'token_credit' ? 'Claim tokens' : 'Join contest'}
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
      const rows = data.campaigns || [];
      setCampaigns(rows);
      setError('');
      return rows;
    } catch (requestError) {
      if (requestError?.response?.status === 401) {
        navigate('/login?next=%2Fmy-account%2Fpromotions', { replace: true });
        return;
      }
      setError(requestError?.response?.data?.detail || 'Promotions could not be loaded.');
      return [];
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
        : 'You joined the contest. Your entry is recorded.');
      const rows = await load();
      setSelected(rows.find((row) => row.promotion_id === campaign.promotion_id) || null);
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="promotion-details-dialog">
          {selected && (() => {
            const state = campaignState(selected);
            const img = selected.desktop_image_url || selected.tablet_image_url || selected.mobile_image_url;
            const reward = selected.campaign_type === 'token_credit'
              ? `${selected.reward_tokens} bonus tokens`
              : selected.campaign_type === 'ticket_draw'
                ? `${selected.prize_total_gbp ? money(selected.prize_total_gbp) : 'Prize'} ticket draw`
                : `${selected.winner_count || 1} referral draw winner${Number(selected.winner_count) === 1 ? '' : 's'}`;
              const tickets = Array.isArray(selected.tickets) ? selected.tickets : [];
              const ticketCount = Number(selected.ticket_count ?? tickets.length);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{selected.name}</DialogTitle>
                  <DialogDescription className="capitalize">{selected.campaign_type.replace(/_/g, ' ')} · {state}</DialogDescription>
                </DialogHeader>
                {img && <img src={img} alt="" className="max-h-56 w-full rounded-lg object-cover" />}
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{selected.description || 'See the offer details and claim while this promotion is open.'}</p>
                <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div><span className="font-bold">Reward:</span> {reward}</div>
                  <div><span className="font-bold">Opens:</span> {formatDate(selected.start_at)}</div>
                  <div><span className="font-bold">Expires:</span> {formatDate(selected.end_at)}</div>
                  {selected.campaign_type !== 'token_credit' && <div><span className="font-bold">Winners:</span> {selected.winner_count || 1}</div>}
                  {Number(selected.prize_per_winner_gbp) > 0 && <div><span className="font-bold">Prize per winner:</span> {money(selected.prize_per_winner_gbp)}</div>}
                  {Number(selected.prize_total_gbp) > 0 && <div><span className="font-bold">Total prize:</span> {money(selected.prize_total_gbp)}</div>}
                </div>
                {selected.campaign_type !== 'token_credit' && (
                  <section className="rounded-lg border border-slate-200 p-4" data-testid="promotion-ticket-details">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-extrabold text-slate-900">Your tickets</h3>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-900">{ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'}</span>
                    </div>
                    {tickets.length ? (
                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {tickets.map((ticket) => (
                          <li key={ticket.ticket_number} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                            <span className="truncate font-mono font-bold text-slate-900">{ticket.ticket_number}</span>
                            <span className="shrink-0 text-xs capitalize text-slate-500">{ticket.source === 'referral' ? 'Referral' : 'Join entry'}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">{selected.joined ? 'Your ticket is being prepared.' : 'Join the contest to receive your entry ticket.'}</p>
                    )}
                  </section>
                )}
                {selected.campaign_type === 'referral_draw' && (
                  <section className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
                    <h3 className="font-extrabold text-cyan-950">Earn extra tickets by referring friends</h3>
                    <p className="mt-1 text-sm leading-relaxed text-cyan-900">An eligible friend must register through your referral link and join this promotion. Each qualifying friend adds one referral ticket to your entry.</p>
                    <Button type="button" variant="outline" onClick={() => navigate('/refer')} className="mt-3 border-cyan-700 font-bold text-cyan-900" data-testid="promotion-refer-friends">Refer friends</Button>
                  </section>
                )}
                {selected.campaign_type !== 'token_credit' && (
                  <section className="space-y-2 rounded-lg border border-slate-200 p-4 text-sm leading-relaxed text-slate-600">
                    <h3 className="font-extrabold text-slate-900">Promotion details</h3>
                    <p>Join while the promotion is open to receive one base entry ticket. Each ticket is one chance in the draw. Repeatedly joining does not create additional base tickets.</p>
                    {selected.campaign_type === 'referral_draw' && <p>Referral tickets are issued only after a referred friend registers through your referral relationship and joins this promotion. Sharing or clicking a link alone does not qualify.</p>}
                    <p>Winners are selected from valid tickets after the promotion closes. The prize is {selected.prize_per_winner_gbp ? `${money(selected.prize_per_winner_gbp)} per winner` : 'as described above'}.</p>
                  </section>
                )}
                {selected.joined ? (
                  <Button disabled className="w-full bg-emerald-700 font-extrabold text-white">{selected.campaign_type === 'token_credit' ? 'Claimed' : 'Joined contest'}</Button>
                ) : state === 'live' ? (
                  <Button onClick={() => claim(selected)} disabled={busyId === selected.promotion_id} className="w-full bg-emerald-700 font-extrabold text-white hover:bg-emerald-600" data-testid={`promotion-join-${selected.promotion_id}`}>
                    {busyId === selected.promotion_id ? 'Joining…' : selected.campaign_type === 'token_credit' ? 'Claim tokens' : 'Join contest'}
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
