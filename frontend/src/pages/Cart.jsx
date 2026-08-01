import { useEffect, useState } from 'react';
import { gbp, tokens as fmtTokens, tokenCount } from '../lib/format';
import { Button } from '../components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Trash2, ShoppingBag, Minus, Plus, Wallet, AlertCircle, Sparkles, ShieldCheck, RefreshCw } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { Link, useNavigate } from 'react-router-dom';
import { ordersAPI, walletAPI, contestsAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'gamezoo_cart';

/** Decode challenge JWT-ish token to extract `exp` epoch seconds. Returns 0
 * if malformed. Non-cryptographic — used only for client-side UX hints. */
function _tokenExp(tok) {
  if (!tok || typeof tok !== 'string') return 0;
  try {
    const b64 = tok.split('.')[0];
    const json = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
    return Number(json?.exp) || 0;
  } catch { return 0; }
}

/** Item needs a fresh skill answer if it's a skill contest AND
 * (no token OR token expired OR expiring in <60s). */
function _needsFreshSkill(item) {
  if ((item.entry_mode || 'skill_game') !== 'skill_game') return false;
  const exp = _tokenExp(item.challenge_token);
  const now = Math.floor(Date.now() / 1000);
  return !exp || exp - now < 60;
}

export default function Cart() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState(null);
  /** Map<contest_id, {question, options, challenge_token, expires_at, chosen: number|null, verifying: boolean, error: string|null}>
   *  Lives ONLY for the current Cart session — persisting across mounts adds no value. */
  const [skills, setSkills] = useState({});
  const { toast } = useToast();
  const { user } = useAuth();
  const nav = useNavigate();

  const loadWallet = () => {
    if (!user) return;
    walletAPI.me().then(setWallet).catch(() => setWallet(null));
  };

  const loadSkillFor = async (item) => {
    // Fetch a fresh challenge for a single item that needs one.
    if (!item.slug) return;  // random-draw items have no skill
    setSkills(prev => ({ ...prev, [item.contest_id]: { ...(prev[item.contest_id] || {}), verifying: true, error: null } }));
    try {
      const ch = await contestsAPI.skillChallenge(item.slug);
      setSkills(prev => ({
        ...prev,
        [item.contest_id]: {
          question: ch.question,
          options: ch.options || [],
          challenge_token: ch.challenge_token,
          expires_at: ch.expires_at,
          chosen: null,
          verifying: false,
          error: null,
        },
      }));
    } catch (err) {
      setSkills(prev => ({ ...prev, [item.contest_id]: { ...(prev[item.contest_id] || {}), verifying: false, error: 'Could not load skill question. Retry?' } }));
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    setItems(raw ? JSON.parse(raw) : []);
  }, []);

  useEffect(() => { loadWallet(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch fresh skill challenges for every skill-game item on mount OR
  // whenever the item list changes. This eliminates the class of "checkout
  // failed → expired challenge_token" errors: by the time the user clicks
  // Spend N tokens, every skill item has a live token and a valid answer.
  useEffect(() => {
    items.forEach(item => {
      if (_needsFreshSkill(item) && !skills[item.contest_id]) {
        loadSkillFor(item);
      }
    });
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickAnswer = (item, opt) => {
    setSkills(prev => ({
      ...prev,
      [item.contest_id]: { ...(prev[item.contest_id] || {}), chosen: opt, error: null },
    }));
  };

  const save = (list) => {
    setItems(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  const changeQty = (contest_id, delta) => {
    const next = items.map(i => i.contest_id === contest_id ? { ...i, qty: Math.max(1, Math.min(500, i.qty + delta)) } : i);
    save(next);
  };

  const setQty = (contest_id, qty) => {
    const q = Math.max(1, Math.min(500, parseInt(qty, 10) || 1));
    save(items.map(i => i.contest_id === contest_id ? { ...i, qty: q } : i));
  };

  const removeItem = (contest_id) => save(items.filter(i => i.contest_id !== contest_id));
  const clearAll = () => { save([]); toast({ title: 'Basket cleared' }); };

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const totalTickets = items.reduce((s, i) => s + i.qty, 0);
  const balanceAfter = wallet ? Math.max(0, wallet.balance - total) : null;
  const shortfall = wallet ? Math.max(0, total - wallet.balance) : total;

  const walletCheckout = async () => {
    if (items.length === 0) return;
    if (!user) { toast({ title: 'Please sign in first' }); nav('/login'); return; }

    // Gate: every skill-game item must have an answer chosen (either the
    // one they picked on CompetitionDetail, or a freshly picked one here).
    const missing = items
      .filter(i => (i.entry_mode || 'skill_game') === 'skill_game')
      .filter(i => {
        const fresh = skills[i.contest_id];
        // Fresh challenge issued → user must pick an option.
        if (fresh) return fresh.chosen == null;
        // No fresh challenge → rely on the item's stored (non-expired) token.
        return _needsFreshSkill(i);
      });
    if (missing.length > 0) {
      toast({ title: 'Answer skill questions first', description: `Choose the correct answer for ${missing.length} contest${missing.length > 1 ? 's' : ''} below.` });
      return;
    }

    setBusy(true);
    try {
      const payload = items.map(i => {
        const fresh = skills[i.contest_id];
        // Prefer the fresh, just-picked challenge over the stored one.
        if (fresh && fresh.chosen != null && fresh.challenge_token) {
          return { contest_id: i.contest_id, qty: i.qty, skill_answer: String(fresh.chosen), challenge_token: fresh.challenge_token };
        }
        return { contest_id: i.contest_id, qty: i.qty, skill_answer: i.skill_answer || 'n/a', challenge_token: i.challenge_token || null };
      });
      const r = await ordersAPI.checkout(payload);
      localStorage.removeItem(STORAGE_KEY);
      setItems([]);
      toast({ title: 'Payment successful 🎉', description: `${r.tickets} tickets · ${fmtTokens(r.total)} · Order #${r.order_id}` });
      nav('/my-account?tab=tickets');
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || 'Please try again.';
      if (status === 402) {
        toast({ title: 'Not enough tokens', description: `Buy ${fmtTokens(shortfall)} more to complete this order.` });
        nav('/my-account?tab=wallet&topup=1');
      } else if (status === 400 && /skill|token|answer|expired/i.test(detail)) {
        // Force a re-issue of the skill challenge for the failing contest(s)
        // so the user's next click can succeed.
        items.forEach(loadSkillFor);
        toast({ title: 'Skill question refreshed', description: 'Please answer the new question below and try again.' });
      } else {
        toast({ title: 'Checkout failed', description: detail });
      }
    } finally { setBusy(false); }
  };

  const goTopUp = () => nav('/my-account?tab=wallet&topup=1');

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 md:py-10" data-testid="cart-page">
      <h1 className="font-display text-3xl md:text-4xl font-extrabold text-slate-900">Your Basket</h1>
      <p className="text-sm text-slate-500 mt-1">Tickets are only allocated after successful payment.</p>

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 mt-8" data-testid="cart-empty">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto"><ShoppingBag className="w-6 h-6 text-slate-400" /></div>
          <p className="text-slate-500 mt-3">Your basket is empty.</p>
          <Link to="/competitions"><Button className="mt-4 pl-btn-purple text-white">Browse contests</Button></Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8 mt-8">
          <div className="lg:col-span-2 space-y-3">
            {items.map(i => (
              <div key={i.contest_id} className="bg-white rounded-2xl border border-slate-100 p-4" data-testid={`cart-item-${i.contest_id}`}>
              <div className="flex flex-col sm:flex-row gap-4">
                <img src={i.image} alt={i.title} loading="lazy" decoding="async" className="w-full sm:w-28 h-32 sm:h-28 object-cover rounded-lg bg-slate-100" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 break-words">{i.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {(i.entry_mode || 'skill_game') === 'random_tickets' ? 'Random Ticket Draw' : 'Skill Contest'} · {fmtTokens(i.price)}/entry
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <Button variant="outline" size="icon" data-testid={`item-minus-${i.contest_id}`} onClick={() => changeQty(i.contest_id, -1)} disabled={i.qty <= 1}>
                      <Minus className="w-4 h-4" />
                    </Button>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={i.qty}
                      onChange={(e) => setQty(i.contest_id, e.target.value)}
                      className="w-14 h-9 text-center rounded-md border border-slate-200 font-bold"
                      data-testid={`item-qty-${i.contest_id}`}
                    />
                    <Button variant="outline" size="icon" data-testid={`item-plus-${i.contest_id}`} onClick={() => changeQty(i.contest_id, 1)}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                  <div className="font-extrabold text-lg text-slate-900">{fmtTokens(i.qty * i.price)}</div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="text-slate-400 hover:text-rose-500" data-testid={`item-remove-${i.contest_id}`} aria-label="Remove item"><Trash2 className="w-4 h-4" /></button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this item?</AlertDialogTitle>
                        <AlertDialogDescription>“{i.title}” ({i.qty} ticket{i.qty > 1 ? 's' : ''}) will be removed from your basket.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeItem(i.contest_id)} className="bg-rose-500 hover:bg-rose-600">Remove item</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              {/* Inline skill re-verify — appears ONLY when the stored token is missing/expired.
                  Presence here means the user MUST answer before checkout can go through. */}
              {(i.entry_mode || 'skill_game') === 'skill_game' && skills[i.contest_id] && (
                <div className="mt-3 rounded-xl bg-[#6C2BFF]/5 border border-[#6C2BFF]/20 p-3" data-testid={`skill-inline-${i.contest_id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#6C2BFF] uppercase tracking-wider">
                      <ShieldCheck className="w-3.5 h-3.5" /> Skill check
                    </div>
                    <button
                      type="button"
                      onClick={() => loadSkillFor(i)}
                      disabled={skills[i.contest_id]?.verifying}
                      className="text-[11px] text-slate-500 hover:text-[#6C2BFF] flex items-center gap-1"
                      data-testid={`skill-refresh-${i.contest_id}`}
                    >
                      <RefreshCw className={`w-3 h-3 ${skills[i.contest_id]?.verifying ? 'animate-spin' : ''}`} />
                      New question
                    </button>
                  </div>
                  {skills[i.contest_id]?.error ? (
                    <div className="text-xs text-rose-600 mt-1">{skills[i.contest_id].error}</div>
                  ) : (
                    <>
                      <div className="mt-2 font-display font-extrabold text-lg text-slate-900">
                        {skills[i.contest_id]?.question || 'Loading question…'}
                      </div>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(skills[i.contest_id]?.options || []).map(opt => {
                          const chosen = skills[i.contest_id]?.chosen;
                          const active = chosen === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => pickAnswer(i, opt)}
                              data-testid={`skill-option-${i.contest_id}-${opt}`}
                              className={`h-10 rounded-lg border-2 font-extrabold text-sm transition ${active ? 'border-[#6C2BFF] bg-[#6C2BFF] text-white' : 'border-slate-200 hover:border-[#6C2BFF] text-slate-900'}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">Answer correctly to enter this contest. UK law requires a skill element on paid entries.</p>
                    </>
                  )}
                </div>
              )}
            </div>
            ))}

            <div className="flex justify-end pt-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="text-slate-500 hover:text-rose-600" data-testid="clear-basket-btn">
                    <Trash2 className="w-4 h-4 mr-1" /> Clear basket
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear your basket?</AlertDialogTitle>
                    <AlertDialogDescription>All {items.length} contest{items.length !== 1 ? 's' : ''} will be removed. You can add them back later.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep basket</AlertDialogCancel>
                    <AlertDialogAction onClick={clearAll} className="bg-rose-500 hover:bg-rose-600" data-testid="clear-basket-confirm">Clear everything</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div>
            <div className="bg-slate-900 text-white rounded-2xl p-6 sticky top-4" data-testid="checkout-summary">
              <div className="flex items-center gap-2 mb-4"><Wallet className="w-5 h-5 text-[#FFD54A]" /><div className="font-display font-bold">Checkout</div></div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-300"><span>Entries</span><span>{totalTickets}</span></div>
                <div className="flex justify-between text-slate-300"><span>Subtotal</span><span>{fmtTokens(total)}</span></div>
                <div className="flex justify-between text-slate-300"><span>Fees</span><span>0 tokens</span></div>
                <div className="h-px bg-slate-700 my-3" />
                <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-[#FFD54A]">{fmtTokens(total)}</span></div>
              </div>

              {user && wallet && (
                <div className="mt-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-xs space-y-1" data-testid="wallet-preview">
                  <div className="flex justify-between text-slate-300"><span>Your tokens</span><span className="font-semibold">{fmtTokens(wallet.tokens ?? wallet.balance)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">After purchase</span>
                    <span className={`font-semibold ${wallet.balance < total ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {wallet.balance < total ? `Need ${fmtTokens(shortfall)}` : fmtTokens(balanceAfter)}
                    </span>
                  </div>
                </div>
              )}

              {!user ? (
                <Button onClick={() => nav('/login')} data-testid="cart-signin-btn" className="w-full mt-4 pl-btn-gold text-slate-900 h-11 font-extrabold">
                  Sign in to checkout →
                </Button>
              ) : (wallet && wallet.balance < total) ? (
                <div className="mt-4 space-y-2">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                    <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                    <div className="text-xs text-rose-200">Not enough tokens. Buy {fmtTokens(shortfall)} more to complete this order — your basket will be waiting when you return.</div>
                  </div>
                  <Button onClick={goTopUp} data-testid="cart-topup-btn" className="w-full pl-btn-gold text-slate-900 h-11 font-extrabold">
                    <Sparkles className="w-4 h-4 mr-1" /> Buy tokens →
                  </Button>
                </div>
              ) : (
                <Button onClick={walletCheckout} disabled={busy} data-testid="cart-checkout-btn" className="w-full mt-4 pl-btn-gold text-slate-900 h-11 font-extrabold">
                  {busy ? 'Processing…' : `Spend ${fmtTokens(total)}`}
                </Button>
              )}

              <p className="text-[10px] text-slate-500 text-center mt-3">
                Server-validated token debit. Entries are only created after payment succeeds.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
