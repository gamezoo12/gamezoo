import { useCallback, useEffect, useMemo, useState } from 'react';
import { gbp, tokens as fmtTokens, tokenCount } from '../../lib/format';
import { walletAPI, paymentsAPI, referralAPI } from '../../lib/api';
import useActiveOffer, { tokensText, refreshActiveOffer } from '../../lib/useActiveOffer';
import { useToast } from '../../hooks/use-toast';
import { Coins, ShieldCheck, TrendingUp, TrendingDown, Plus, Minus, Sparkles, Receipt, Wallet as WalletIcon, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import PrizeLeagueLogo from '../layout/PrizeLeagueLogo';
import CashOutCard from './CashOutCard';
import BonusTokensCard from './BonusTokensCard';

const FILTERS = [
 { id: 'today', label: 'Today', days: 1 },
 { id: 'week', label: 'Week', days: 7 },
 { id: 'month', label: 'Month', days: 30 },
 { id: 'year', label: 'Year', days: 365 },
 { id: 'all', label: 'All', days: null},
];

/** Return start-of-window in ms; null means no filter. */
function windowStart(filter) {
 if (!filter || filter === 'all') return null;
 const meta = FILTERS.find(f => f.id === filter);
 if (!meta || !meta.days) return null;
 return Date.now() - meta.days * 24 * 60 * 60 * 1000;
}

const TX_LABELS = {
 topup: 'Tokens purchased',
 spend: 'Contest entry',
 refund: 'Refund',
 admin_adjust: 'Admin adjustment',
 referral_bonus: 'Referral bonus',
 signup_bonus: 'Signup bonus',
 influencer_bonus: 'Influencer bonus',
 champion_prize: 'Championship prize',
 winnings: 'Winnings',
 bonus_grant: 'Bonus tokens credited',
 bonus_expiry: 'Unused bonus tokens expired',
 bonus_revoke: 'Bonus tokens revoked',
};

function TxReceipt({ tx, open, onClose, walletBefore }) {
 if (!tx) return null;
 const balanceAfter = tx.balance_after;
 const dt = new Date(tx.created_at);
 return (
 <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
 <DialogContent className="max-w-md" data-testid="tx-receipt">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Receipt className="w-5 h-5 text-[#6C2BFF]" /> Transaction receipt
 </DialogTitle>
 </DialogHeader>
 <div className="rounded-2xl border-2 border-dashed border-slate-200 p-5 bg-slate-50">
 <div className="flex items-center justify-between mb-4">
 <PrizeLeagueLogo size={28} emblemOnly />
 <div className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${tx.amount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
 {tx.amount > 0 ? 'Credit' : 'Debit'}
 </div>
 </div>
 <div className="space-y-2 text-sm">
 <Row label="Transaction ID" value={<span className="font-mono text-xs">{tx.tx_id}</span>} />
 <Row label="Date" value={dt.toLocaleDateString('en-GB')} />
 <Row label="Time" value={dt.toLocaleTimeString('en-GB')} />
 <Row label="Description" value={TX_LABELS[tx.kind] || tx.kind} />
 {tx.note && <Row label="Note" value={<span className="text-slate-500 text-xs">{tx.note}</span>} />}
 {tx.ref_order_id && <Row label="Order" value={<span className="font-mono text-xs">{tx.ref_order_id}</span>} />}
 <Row label="Payment method" value={tx.kind === 'topup' ? 'Stripe' : 'Wallet'} />
 <div className="h-px bg-slate-200 my-3" />
 <Row label="Tokens" bold value={<span className={tx.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}>{tx.amount > 0 ? '+' : ''}{fmtTokens(tx.amount)}</span>} />
 <Row label="Balance before" value={fmtTokens(walletBefore)} />
 <Row label="Balance after" bold value={fmtTokens(balanceAfter)} />
 <Row label="Status" value={<span className="text-emerald-600 font-semibold">Completed</span>} />
 </div>
 </div>
 <button className="mt-2 text-sm text-slate-500 hover:text-slate-800 mx-auto flex items-center gap-1" onClick={onClose}>
 <X className="w-3 h-3" /> Close
 </button>
 </DialogContent>
 </Dialog>
 );
}
function Row({ label, value, bold }) {
 return (
 <div className="flex justify-between items-center">
 <span className="text-slate-500">{label}</span>
 <span className={bold ? 'font-bold text-slate-900' : 'text-slate-800'}>{value}</span>
 </div>
 );
}

export default function WalletPanel({ wallet, walletTxs, setWallet, setWalletTxs, autoOpenTopup }) {
 const [busy, setBusy] = useState(false);
 const [customAmount, setCustomAmount] = useState('');
 const [filter, setFilter] = useState('month');
 const [selectedTx, setSelectedTx] = useState(null);
 const [showTopup, setShowTopup] = useState(!!autoOpenTopup);
 const [confirmingPayment, setConfirmingPayment] = useState(false);
 const [myOffer, setMyOffer] = useState(null);
 const [myPromotion, setMyPromotion] = useState(null);
 const { offer } = useActiveOffer();
 const { toast } = useToast();
 const minTopup = offer?.topup?.min_gbp;
 const maxTopup = offer?.topup?.max_gbp;
 const presets = offer?.topup?.presets_gbp || [];

 // The user's own signup terms (stored when they joined) decide what a payment earns them.
 const loadMyOffer = useCallback(() => referralAPI.me().then((r) => {
   setMyOffer(r?.signup_bonus || null);
   setMyPromotion(r?.promotion || null);
   return r;
 }).catch(() => null), []);
 useEffect(() => { loadMyOffer(); }, [loadMyOffer]);
 const isInfluencer = myPromotion?.acquisition_type === 'influencer';
 const promoUnresolved = myPromotion?.acquisition_type === 'unresolved';
 const signupBonusFor = (amount) => {
   if (isInfluencer || promoUnresolved) return 0;
   const s = myOffer;
   return s && s.eligible && !s.granted && s.offer_enabled && amount >= Number(s.required_topup_gbp) ? Number(s.reward_tokens) : 0;
 };
 const purchasedTokensFor = (amount) => amount * Number(offer?.topup?.tokens_per_gbp ?? 1);
 const normalTopupBonusFor = (amount) => {
   if (isInfluencer || promoUnresolved) return 0;
   const terms = myPromotion?.normal_topup_promo;
   if (!terms?.enabled || amount < Number(terms.minimum_gbp || 0)) return 0;
   if (terms.first_only && Number(myPromotion?.normal_topup_bonus_tokens_issued || 0) > 0) return 0;
   const purchased = purchasedTokensFor(amount);
   return terms.mode === 'percentage'
     ? purchased * Number(terms.reward_percent || 0) / 100
     : Number(terms.reward_tokens || 0);
 };
 const influencerSignupBonusFor = (amount) => {
   const p = myPromotion;
   const campaign = p?.campaign;
   if (!isInfluencer || !p?.campaign_active || p?.blocked_reason || p?.signup_bonus_status !== 'pending') return 0;
   if (campaign?.signup_when !== 'first_topup') return 0;
   if (amount < Number(campaign.topup_minimum_gbp || 0)) return 0;
   return Number(campaign.signup_reward_tokens || 0);
 };
 const influencerTopupBonusFor = (amount) => {
   const p = myPromotion;
   const campaign = p?.campaign;
   if (!isInfluencer || !p?.campaign_active || p?.blocked_reason || !campaign) return 0;
   const rank = Number(p.next_influencer_topup_rank || 1);
   const rule = campaign.topup_qualification;
   if (rule === 'first_success' && rank !== 1) return 0;
   if (rule === 'first_n' && rank > Number(campaign.topup_first_n || 1)) return 0;
   if (amount < Number(campaign.topup_minimum_gbp || 0)) return 0;
   return campaign.topup_reward_mode === 'percentage'
     ? amount * Number(campaign.topup_reward_percent || 0) / 100
     : Number(campaign.topup_reward_tokens || 0);
 };
 const refreshWallet = useCallback(async () => {
   const next = await walletAPI.me();
   setWallet(next);
   return next;
 }, [setWallet]);

 useEffect(() => { if (autoOpenTopup) setShowTopup(true); }, [autoOpenTopup]);

 // Post-Stripe redirect: when the URL includes ?topup=success, the actual
 // wallet credit lands via Stripe webhook — which can take 2-8 seconds.
 // Without polling the user sees stale balance and assumes it failed.
 // We poll wallet/me every 2s for up to 24s or until the balance grows.
 useEffect(() => {
   const params = new URLSearchParams(window.location.search);
   const topup = params.get('topup');
   if (topup !== 'success') return;
   setConfirmingPayment(true);
   const startBalance = Number(wallet?.balance) || 0;
   let ticks = 0;
   const maxTicks = 12; // 12 × 2s = 24s
   const poll = async () => {
     ticks += 1;
     try {
       const w = await import('../../lib/api').then(m => m.walletAPI.me());
       if (w && Number(w.balance) > startBalance) {
         setWallet(w);
         setConfirmingPayment(false);
         toast({ title: 'Payment confirmed 🎉', description: `+${Math.round(Number(w.balance) - startBalance)} tokens added to your wallet.` });
         // Reward status can change as soon as a verified payment lands.
         refreshActiveOffer();
         loadMyOffer();
         window.dispatchEvent(new CustomEvent('pl:wallet-updated'));
         // Refresh transactions too
         import('../../lib/api').then(m => m.walletAPI.transactions(20).then(r => setWalletTxs(r?.transactions || [])).catch(() => {}));
         return;
       }
     } catch { /* ignore, retry */ }
     if (ticks < maxTicks) {
       setTimeout(poll, 2000);
     } else {
       setConfirmingPayment(false);
       toast({ title: 'Payment is still processing', description: 'It may take up to a minute. Refresh the page shortly.' });
     }
   };
   const t = setTimeout(poll, 1500);
   return () => clearTimeout(t);
 // Intentionally not depending on `wallet` to avoid restarting the poll on each tick.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 const filteredTxs = useMemo(() => {
 const start = windowStart(filter);
 if (!start) return walletTxs;
 return walletTxs.filter(tx => new Date(tx.created_at).getTime() >= start);
 }, [walletTxs, filter]);

 const stats = useMemo(() => {
 const deposits = filteredTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
 const spending = filteredTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
 return { deposits, spending };
 }, [filteredTxs]);

 const topupPreset = async (amount) => {
 if (!offer?.topup) return toast({ title: 'Top-up pricing unavailable', description: 'Please try again shortly.' });
 if (amount < minTopup) return toast({ title: `Minimum purchase is ${fmtTokens(minTopup)}` });
 setBusy(true);
 try {
 const originUrl = window.location.origin;
 // Preset packages map 1:1 to Stripe lookup keys (1 token = £1).
 const preset = { 5: 'wallet_topup_5', 10: 'wallet_topup_10', 20: 'wallet_topup_20', 50: 'wallet_topup_50', 100: 'wallet_topup_100' }[amount];
 let session;
 if (preset) {
 session = await paymentsAPI.createCheckoutSession(preset, originUrl);
 } else {
 session = await paymentsAPI.createCustomTopup(amount, originUrl);
 }
 if (session?.url) { window.location.href = session.url; return; }
 toast({ title: 'Stripe unavailable', description: 'Please try again in a moment.' });
 } catch (err) {
 toast({ title: 'Purchase failed', description: err?.response?.data?.detail || 'Try again.' });
 } finally { setBusy(false); }
 };

 const submitCustom = () => {
 const n = parseInt(customAmount, 10);
 if (!offer?.topup) return toast({ title: 'Top-up pricing unavailable', description: 'Please try again shortly.' });
 if (Number.isNaN(n) || n < minTopup) return toast({ title: `Enter at least ${fmtTokens(minTopup)}` });
 if (n > maxTopup) return toast({ title: `Maximum single purchase is ${fmtTokens(maxTopup)}` });
 topupPreset(n);
 };

 return (
 <div className="space-y-6" data-testid="wallet-panel">
 {confirmingPayment && (
  <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-300 p-4 flex items-center gap-3" data-testid="topup-confirming">
    <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />
    <div>
      <div className="font-bold text-emerald-900">Confirming your payment…</div>
      <div className="text-xs text-emerald-800">Your tokens will appear as soon as Stripe finalises the charge (usually a few seconds).</div>
    </div>
  </div>
 )}
 {/* HERO BALANCE CARD */}
 <div className="bg-gradient-to-br from-[#3E0BAA] via-[#6C2BFF] to-[#8B5CFF] rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden" data-testid="wallet-hero">
 <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-[#FFD54A]/20 blur-3xl" />
 <div className="relative flex items-start justify-between">
 <div>
 <div className="text-white/85 text-xs uppercase tracking-widest flex items-center gap-2"><Coins className="w-4 h-4" /> Token balance</div>
 <div className="mt-1 font-display font-extrabold text-5xl md:text-6xl flex items-baseline gap-2" data-testid="wallet-balance">
 <span>{wallet ? tokenCount(wallet.tokens ?? wallet.balance) : 0}</span>
 <span className="text-xl md:text-2xl text-white/80 font-bold">tokens</span>
 </div>
 <div className="mt-2 text-xs text-white/85">Use tokens to enter contests · {minTopup != null ? `minimum ${minTopup} tokens per purchase` : 'top-up pricing loading'}</div>
 </div>
 <button
 onClick={() => setShowTopup(true)}
 className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-[#FFD54A] text-slate-900 flex items-center justify-center hover:brightness-110 transition shrink-0 shadow-lg"
 data-testid="wallet-topup-plus"
 aria-label="Buy tokens"
 >
 <Plus className="w-6 h-6 md:w-7 md:h-7" />
 </button>
 </div>
 <div className="relative mt-6 grid grid-cols-2 md:grid-cols-3 gap-3 text-white/90">
 <div className="bg-white/10 backdrop-blur rounded-xl p-3">
 <div className="text-[10px] uppercase tracking-wider text-white/70">Bought ({filter})</div>
 <div className="font-bold text-lg mt-0.5">{fmtTokens(stats.deposits)}</div>
 </div>
 <div className="bg-white/10 backdrop-blur rounded-xl p-3">
 <div className="text-[10px] uppercase tracking-wider text-white/70">Spent ({filter})</div>
 <div className="font-bold text-lg mt-0.5">{fmtTokens(stats.spending)}</div>
 </div>
 </div>
 </div>

 {/* BONUS / PURCHASED / TOTAL */}
 <BonusTokensCard wallet={wallet} onRefresh={refreshWallet} />

 {/* WALLET BREAKDOWN + CASH OUT */}
 <CashOutCard />

 {/* TOPUP PANEL */}
 {showTopup && (
 <div className="bg-white rounded-2xl border-2 border-[#6C2BFF]/30 p-6 md:p-8 shadow-lg" data-testid="wallet-topup-panel">
 <div className="flex items-center justify-between mb-1">
 <h3 className="font-display font-extrabold text-2xl text-slate-900">Buy tokens</h3>
 <button className="text-slate-400 hover:text-slate-700" onClick={() => setShowTopup(false)} aria-label="Close"><X className="w-4 h-4" /></button>
 </div>
 <p className="text-sm text-slate-500 mb-4">{minTopup != null ? `Minimum ${fmtTokens(minTopup)}` : 'Pricing unavailable'} · Secure Stripe checkout · Tokens credited after payment confirmation.</p>
 {isInfluencer && myPromotion?.campaign && (
  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 mb-4 text-xs text-emerald-900" data-testid="topup-influencer-offer">
   <strong>{myPromotion.campaign_name || myPromotion.influencer_name || 'Influencer campaign'}:</strong> {myPromotion.campaign.conditions_text}
   {myPromotion.blocked_reason && <div className="mt-1">Promotional reward is held for review.</div>}
  </div>
 )}
 {!isInfluencer && !promoUnresolved && myOffer?.eligible && !myOffer.granted && myOffer.offer_enabled && myOffer.conditions_text && (
  <div className="rounded-xl border border-[#FFD54A]/60 bg-[#FFD54A]/10 px-3 py-2.5 mb-4 text-xs text-slate-700" data-testid="topup-signup-offer">
   <strong>Your signup offer:</strong> {myOffer.conditions_text}
  </div>
 )}
 {!isInfluencer && !promoUnresolved && myPromotion?.normal_topup_promo?.enabled && (
  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 mb-4 text-xs text-emerald-900" data-testid="normal-topup-promo-terms">
   Normal top-up promotion: {myPromotion.normal_topup_promo.mode === 'percentage'
     ? `${myPromotion.normal_topup_promo.reward_percent}% Bonus Tokens`
     : `${tokensText(myPromotion.normal_topup_promo.reward_tokens)} Bonus Tokens`}
   {' '}on verified top-ups of {gbp(myPromotion.normal_topup_promo.minimum_gbp)} or more.
   {myPromotion.normal_topup_promo.first_only ? ' First qualifying top-up only.' : ' Each qualifying top-up.'}
   {myPromotion.normal_topup_promo.expiry_days ? ` Expires ${myPromotion.normal_topup_promo.expiry_days} days after credit.` : ''}
  </div>
 )}
 {promoUnresolved && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 mb-4 text-xs text-amber-900" data-testid="topup-promo-unresolved">Promotional rewards are paused while your promotion attribution is reviewed. Purchased Top-up Tokens are unaffected.</div>}

 <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
 {presets.map(n => (
 <button
 key={n}
 type="button"
 disabled={busy || !offer?.topup}
 onClick={() => topupPreset(n)}
 data-testid={`stripe-topup-${n}`}
 className={`group relative rounded-2xl border-2 p-4 text-center transition disabled:opacity-50 ${n === 20 ? 'border-[#FFD54A] bg-[#FFD54A]/5' : 'border-slate-200 hover:border-[#6C2BFF]'}`}
 >
 {n === 20 && <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-[#FFD54A] text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-full">Popular</span>}
 <div className="font-display text-2xl md:text-3xl font-extrabold text-slate-900 flex items-center justify-center gap-1">
 <Coins className="w-5 h-5 text-[#FFD54A]" />{purchasedTokensFor(n)}
 </div>
 <div className="text-[11px] text-slate-500 mt-1 font-semibold">top-up tokens</div>
 {signupBonusFor(n) > 0 && <div className="mt-1 text-[10px] font-bold text-emerald-700" data-testid={`topup-bonus-${n}`}>+ {tokensText(signupBonusFor(n))} Signup Bonus</div>}
 {influencerSignupBonusFor(n) > 0 && <div className="mt-1 text-[10px] font-bold text-emerald-700" data-testid={`topup-influencer-signup-${n}`}>+ {tokensText(influencerSignupBonusFor(n))} Influencer Signup Bonus</div>}
 {influencerTopupBonusFor(n) > 0 && <div className="mt-1 text-[10px] font-bold text-teal-700" data-testid={`topup-influencer-topup-${n}`}>+ {tokensText(influencerTopupBonusFor(n))} Influencer Top-up Bonus</div>}
 {normalTopupBonusFor(n) > 0 && <div className="mt-1 text-[10px] font-bold text-emerald-700" data-testid={`normal-topup-bonus-${n}`}>+ {tokensText(normalTopupBonusFor(n))} Normal Top-up Bonus</div>}
 </button>
 ))}
 </div>

 <div className="rounded-xl bg-slate-50 p-4">
 <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">Custom amount</div>
 <div className="flex gap-2">
 <div className="flex-1 relative">
 <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
 <Input
 type="number"
 min={minTopup}
 max={maxTopup}
 step={1}
 placeholder={`Min ${minTopup} tokens`}
 className="pl-9 h-11 font-bold text-lg"
 value={customAmount}
 onChange={(e) => setCustomAmount(e.target.value)}
 data-testid="wallet-custom-amount"
 />
 </div>
 <Button onClick={submitCustom} disabled={busy || !offer?.topup} data-testid="wallet-custom-topup" className="pl-btn-gold text-slate-900 h-11 font-extrabold px-6">
 <Sparkles className="w-4 h-4 mr-1" /> Buy tokens
 </Button>
 </div>
 <div className="text-[11px] text-slate-500 mt-2">
  {(() => {
    const amount = parseInt(customAmount, 10) || 0;
    const signup = signupBonusFor(amount) + influencerSignupBonusFor(amount);
    const normalTopup = normalTopupBonusFor(amount);
    const promo = influencerTopupBonusFor(amount);
    return `You'll receive ${purchasedTokensFor(amount)} purchased Top-up Tokens${signup ? ` + ${tokensText(signup)} signup bonus` : ''}${normalTopup ? ` + ${tokensText(normalTopup)} normal top-up bonus` : ''}${promo ? ` + ${tokensText(promo)} influencer top-up bonus` : ''}.`;
  })()} The exact charge amount is shown at Stripe checkout.
 </div>
 </div>
 <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
 <ShieldCheck className="w-4 h-4 text-emerald-600" /> Powered by Stripe. Card details never touch our servers.
 </div>
 </div>
 )}

 {/* TRANSACTION HISTORY */}
 <div className="bg-white rounded-2xl border border-slate-100 p-6">
 <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
 <h3 className="font-display font-bold text-lg">Transaction history</h3>
 <div className="flex flex-wrap gap-1" data-testid="wallet-filters">
 {FILTERS.map(f => (
 <button
 key={f.id}
 onClick={() => setFilter(f.id)}
 data-testid={`filter-${f.id}`}
 className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${filter === f.id ? 'bg-[#6C2BFF] text-white border-[#6C2BFF]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#6C2BFF]/40'}`}
 >{f.label}</button>
 ))}
 </div>
 </div>

 {filteredTxs.length === 0 ? (
 <div className="text-sm text-slate-500 text-center py-10" data-testid="wallet-tx-empty">
 <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
 No transactions in this window. Try a wider filter.
 </div>
 ) : (
 <ul className="divide-y divide-slate-100" data-testid="wallet-tx-list">
 {filteredTxs.map(tx => {
 const before = tx.balance_after - tx.amount;
 return (
 <li key={tx.tx_id}>
 <button
 onClick={() => setSelectedTx({ tx, walletBefore: before })}
 data-testid={`wallet-tx-${tx.tx_id}`}
 className="w-full py-3 flex items-center gap-3 text-left hover:bg-slate-50 rounded-lg px-2 -mx-2 transition"
 >
 <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tx.amount > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
 {tx.amount > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
 </div>
 <div className="flex-1 min-w-0">
 <div className="text-sm font-medium text-slate-800">{TX_LABELS[tx.kind] || tx.kind.replace(/_/g, ' ')}</div>
 <div className="text-xs text-slate-500 truncate">{tx.note || 'View receipt →'}</div>
 </div>
 <div className="text-right">
 <div className={`font-bold text-sm ${tx.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{tx.amount > 0 ? '+' : ''}{fmtTokens(tx.amount)}</div>
 <div className="text-xs text-slate-400">{new Date(tx.created_at).toLocaleDateString('en-GB')}</div>
 </div>
 </button>
 </li>
 );
 })}
 </ul>
 )}
 </div>

 <TxReceipt
 tx={selectedTx?.tx}
 walletBefore={selectedTx?.walletBefore}
 open={!!selectedTx}
 onClose={() => setSelectedTx(null)}
 />
 </div>
 );
}
