import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, Wallet } from 'lucide-react';
import { winningsAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';

const gbp = (p) => `£${(Number(p || 0) / 100).toFixed(2)}`;

export default function WinningsWallet() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [alreadyWon, setAlreadyWon] = useState(false);

  // withdrawal
  const [wOpen, setWOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [holder, setHolder] = useState('');
  const [sort, setSort] = useState('');
  const [acct, setAcct] = useState('');
  const [wBusy, setWBusy] = useState(false);
  const [myWd, setMyWd] = useState([]);

  const load = useCallback(async () => {
    try {
      const [w, l, wd] = await Promise.all([
        winningsAPI.wallet(), winningsAPI.ledger(), winningsAPI.myWithdrawals(),
      ]);
      setWallet(w); setLedger(l.items || []); setMyWd(wd.items || []);
      setAlreadyWon((l.items || []).some((x) => x.type === 'challenge_reward'));
    } catch (e) { /* not logged in / transient */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submitWithdraw = async () => {
    const pence = Math.round(parseFloat(amount || '0') * 100);
    if (!pence || pence <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    setWBusy(true);
    try {
      await winningsAPI.withdraw({ amount_pence: pence, account_holder: holder, sort_code: sort, account_number: acct });
      toast({ title: 'Withdrawal Processing', description: 'Our team will transfer the funds manually.' });
      setWOpen(false); setAmount(''); setHolder(''); setSort(''); setAcct('');
      await load();
    } catch (e) {
      toast({ title: 'Withdrawal failed', description: e?.response?.data?.detail || 'Check your balance.', variant: 'destructive' });
    } finally { setWBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="winnings-page">
      {/* Something Special card */}
      <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-5"
        data-testid="something-special-card">
        <div className="flex items-center gap-2 text-amber-700 font-black uppercase tracking-widest text-xs">
          <Gift className="w-4 h-4" /> Something Special
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mt-1">100 Number Sequence Challenge 🎁</h2>
        <p className="text-sm text-slate-600 mt-2">
          Complete the 100-number sequence correctly within 90 seconds to earn £50.
          Unlimited attempts. One £50 reward per eligible user.
        </p>
        {alreadyWon ? (
          <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 font-bold text-sm"
            data-testid="challenge-already-won">
            Challenge completed — £50 credited to your Winnings Wallet. You can still play for practice (no further reward).
          </div>
        ) : null}
        <Button className="mt-4 bg-amber-500 hover:bg-amber-600 text-white font-extrabold"
          onClick={() => navigate('/challenge')} data-testid="start-challenge-button">
          {alreadyWon ? 'Play again (practice)' : 'Play for £50'}
        </Button>
      </div>

      {/* Winnings Wallet */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="winnings-wallet-card">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-lg flex items-center gap-2"><Wallet className="w-5 h-5 text-[#6C2BFF]" /> Winnings Wallet</h3>
          <Button variant="outline" onClick={() => setWOpen(true)}
            disabled={!wallet || wallet.available_pence <= 0} data-testid="withdraw-button">Withdraw Winnings</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Stat label="Available" v={gbp(wallet?.available_pence)} t="wallet-available" />
          <Stat label="Pending withdrawal" v={gbp(wallet?.pending_pence)} t="wallet-pending" />
          <Stat label="Total won" v={gbp(wallet?.total_won_pence)} t="wallet-total-won" />
          <Stat label="Paid out" v={gbp(wallet?.total_paid_pence)} t="wallet-total-paid" />
        </div>
        <div className="mt-4">
          <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Transaction history</h4>
          <div className="divide-y divide-slate-100" data-testid="winnings-ledger">
            {ledger.length === 0 && <div className="text-sm text-slate-400 py-3">No transactions yet.</div>}
            {ledger.map((x) => (
              <div key={x.transaction_id} className="flex justify-between py-2 text-sm">
                <span className="text-slate-600">{x.type.replace(/_/g, ' ')}</span>
                <span className="font-bold">{gbp(x.amount_pence)} · {x.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Withdrawal form */}
      {wOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="withdraw-modal"
          onClick={() => !wBusy && setWOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-lg">Withdraw Winnings</h3>
            <p className="text-xs text-slate-500 mt-1">Available: {gbp(wallet?.available_pence)}. UK bank transfer, processed manually by our team.</p>
            <div className="space-y-3 mt-4">
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Amount (£)" value={amount}
                onChange={(e) => setAmount(e.target.value)} data-testid="wd-amount" />
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Account holder name" value={holder}
                onChange={(e) => setHolder(e.target.value)} data-testid="wd-holder" />
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Sort code" value={sort}
                onChange={(e) => setSort(e.target.value)} data-testid="wd-sort" />
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Account number" value={acct}
                onChange={(e) => setAcct(e.target.value)} data-testid="wd-acct" />
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" disabled={wBusy} onClick={() => setWOpen(false)} data-testid="wd-cancel">Cancel</Button>
              <Button className="flex-1" disabled={wBusy} onClick={submitWithdraw} data-testid="wd-submit">
                {wBusy ? 'Submitting…' : 'Request withdrawal'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, v, t }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2">
      <div className="text-[11px] uppercase font-bold text-slate-400">{label}</div>
      <div className="font-extrabold text-slate-900" data-testid={t}>{v}</div>
    </div>
  );
}
