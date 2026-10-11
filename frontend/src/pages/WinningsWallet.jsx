import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Gamepad2, Gift, Sparkles, Wallet } from 'lucide-react';
import { winningsAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';

const gbp = (p) => `£${(Number(p || 0) / 100).toFixed(2)}`;

export default function WinningsWallet() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [challengeGames, setChallengeGames] = useState([]);
  const [challengeGamesLoading, setChallengeGamesLoading] = useState(true);
  const [challengeAttempts, setChallengeAttempts] = useState([]);
  const [attemptsLoading, setAttemptsLoading] = useState(true);
  const [attemptsError, setAttemptsError] = useState('');

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
    } catch (e) { /* not logged in / transient */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    winningsAPI.challengeGames()
      .then((data) => setChallengeGames(data.games || []))
      .catch(() => setChallengeGames([]))
      .finally(() => setChallengeGamesLoading(false));
    winningsAPI.challengeAttempts()
      .then((data) => setChallengeAttempts(data.items || []))
      .catch((error) => setAttemptsError(error?.response?.data?.detail || 'Spending history is temporarily unavailable.'))
      .finally(() => setAttemptsLoading(false));
  }, []);

  const highestChallengePrize = challengeGames.reduce(
    (highest, game) => Math.max(highest, Number(game.prize_pence) || 0),
    0,
  );

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
      {/* Special Challenge promotion */}
      <section
        className="relative isolate overflow-hidden rounded-2xl border border-emerald-300/25 bg-[#071b1a] text-white shadow-xl"
        data-testid="something-special-card"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: 'linear-gradient(rgba(148, 255, 225, .16) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 255, 225, .16) 1px, transparent 1px)',
            backgroundSize: '34px 34px',
          }}
        />
        <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/25 bg-emerald-200/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-200">
              <Sparkles className="h-4 w-4" /> Special Challenges
            </div>
            <h2 className="mt-4 max-w-2xl text-3xl font-black leading-tight sm:text-4xl">
              Play more games.
              <span className="block text-emerald-300">Win instant rewards.</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Take on a skill challenge, beat the target and earn rewards directly into your Winnings Wallet.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-emerald-300" />
                <span className="text-sm font-bold">
                  {challengeGamesLoading ? 'Loading games' : `${challengeGames.length} live games`}
                </span>
              </div>
              {highestChallengePrize > 0 && (
                <div className="flex items-center gap-2 border-l border-white/15 pl-6">
                  <Gift className="h-5 w-5 text-amber-300" />
                  <span className="text-sm font-bold">Prizes up to {gbp(highestChallengePrize)}</span>
                </div>
              )}
            </div>
          </div>
          <Button
            className="h-12 gap-2 bg-emerald-300 px-5 font-black text-emerald-950 hover:bg-emerald-200"
            onClick={() => navigate('/challenge')}
            data-testid="start-challenge-button"
          >
            Explore challenges <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

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

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" data-testid="challenge-spending-history">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-extrabold text-lg text-slate-900">Challenge spending</h3>
            <p className="mt-1 text-sm text-slate-500">Token entry costs for your challenge attempts</p>
          </div>
          {!attemptsLoading && !attemptsError && (
            <span className="text-xs font-bold text-slate-500">{challengeAttempts.length} attempts</span>
          )}
        </div>
        {attemptsLoading ? (
          <p className="px-5 py-4 text-sm text-slate-500" role="status">Loading challenge spending…</p>
        ) : attemptsError ? (
          <p className="px-5 py-4 text-sm text-rose-700" role="alert">{attemptsError}</p>
        ) : challengeAttempts.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No challenge attempts or entry costs yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {challengeAttempts.map((attempt) => {
              const outcome = attempt.result === 'success'
                ? 'Won'
                : attempt.result === 'fail'
                  ? 'Not completed'
                  : 'In progress';
              const outcomeClass = attempt.result === 'success'
                ? 'text-emerald-700 bg-emerald-50'
                : attempt.result === 'fail'
                  ? 'text-rose-700 bg-rose-50'
                  : 'text-amber-700 bg-amber-50';
              return (
                <div key={attempt.attempt_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{attempt.game_name || attempt.challenge_id}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {attempt.started_at ? new Date(attempt.started_at).toLocaleString() : 'Date unavailable'}
                      {attempt.size ? ` · ${attempt.size} ${attempt.type === 'colour_match' ? 'colours' : 'numbers'}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${outcomeClass}`}>{outcome}</span>
                    <span className="min-w-20 text-right text-sm font-extrabold text-slate-900">
                      {attempt.tokens_spent > 0 ? `-${attempt.tokens_spent} tokens` : 'Free'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
