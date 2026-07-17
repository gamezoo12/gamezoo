import { useEffect, useState } from 'react';
import { gbp } from '../lib/format';
import { Button } from '../components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Trash2, ShoppingBag, Minus, Plus, Wallet, AlertCircle, Sparkles } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { Link, useNavigate } from 'react-router-dom';
import { ordersAPI, walletAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'gamezoo_cart';

export default function Cart() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const nav = useNavigate();

  const loadWallet = () => {
    if (!user) return;
    walletAPI.me().then(setWallet).catch(() => setWallet(null));
  };

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    setItems(raw ? JSON.parse(raw) : []);
  }, []);

  useEffect(() => { loadWallet(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setBusy(true);
    try {
      const payload = items.map(i => ({ contest_id: i.contest_id, qty: i.qty, skill_answer: i.skill_answer || 'n/a' }));
      const r = await ordersAPI.checkout(payload);
      localStorage.removeItem(STORAGE_KEY);
      setItems([]);
      toast({ title: 'Payment successful 🎉', description: `${r.tickets} tickets · ${gbp(r.total)} · Order #${r.order_id}` });
      nav('/my-account?tab=tickets');
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || 'Please try again.';
      if (status === 402) {
        toast({ title: 'Insufficient wallet balance', description: `Top up ${gbp(shortfall)} to complete this order.` });
        nav('/my-account?tab=wallet&topup=1');
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
              <div key={i.contest_id} className="flex flex-col sm:flex-row gap-4 bg-white rounded-2xl border border-slate-100 p-4" data-testid={`cart-item-${i.contest_id}`}>
                <img src={i.image} alt={i.title} className="w-full sm:w-28 h-32 sm:h-28 object-cover rounded-lg bg-slate-100" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 break-words">{i.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {(i.entry_mode || 'skill_game') === 'random_tickets' ? 'Random Ticket Draw' : 'Skill Contest'} · {gbp(i.price)}/ticket
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
                  <div className="font-extrabold text-lg text-slate-900">{gbp(i.qty * i.price)}</div>
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
                <div className="flex justify-between text-slate-300"><span>Tickets</span><span>{totalTickets}</span></div>
                <div className="flex justify-between text-slate-300"><span>Subtotal</span><span>{gbp(total)}</span></div>
                <div className="flex justify-between text-slate-300"><span>Fees</span><span>£0.00</span></div>
                <div className="h-px bg-slate-700 my-3" />
                <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-[#FFD54A]">{gbp(total)}</span></div>
              </div>

              {user && wallet && (
                <div className="mt-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-xs space-y-1" data-testid="wallet-preview">
                  <div className="flex justify-between text-slate-300"><span>Wallet balance</span><span className="font-semibold">{gbp(wallet.balance)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">After purchase</span>
                    <span className={`font-semibold ${wallet.balance < total ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {wallet.balance < total ? `Need ${gbp(shortfall)}` : gbp(balanceAfter)}
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
                    <div className="text-xs text-rose-200">Insufficient wallet balance. Top up {gbp(shortfall)} to complete this order — your basket will be waiting when you return.</div>
                  </div>
                  <Button onClick={goTopUp} data-testid="cart-topup-btn" className="w-full pl-btn-gold text-slate-900 h-11 font-extrabold">
                    <Sparkles className="w-4 h-4 mr-1" /> Top up wallet →
                  </Button>
                </div>
              ) : (
                <Button onClick={walletCheckout} disabled={busy} data-testid="cart-checkout-btn" className="w-full mt-4 pl-btn-gold text-slate-900 h-11 font-extrabold">
                  {busy ? 'Processing…' : `Pay ${gbp(total)} from wallet`}
                </Button>
              )}

              <p className="text-[10px] text-slate-500 text-center mt-3">
                Server-validated wallet debit. Tickets are only created after payment succeeds.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
