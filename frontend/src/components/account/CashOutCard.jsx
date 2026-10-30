import { useEffect, useState } from 'react';
import { cashoutAPI, contestsAPI } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { CashoutReviewStep } from './CashoutReviewStep';
import {
  Banknote, Coins, Gift, Lock, ShieldCheck, ArrowRight, CheckCircle2,
  Landmark, Star, Trophy, ChevronRight,
} from 'lucide-react';

const gbp = (n) => `£${(Number(n) || 0).toFixed(2)}`;

export default function CashOutCard() {
  const { toast } = useToast();
  const [config, setConfig] = useState(null);
  const [summary, setSummary] = useState(null);
  const [banks, setBanks] = useState([]);
  const [requests, setRequests] = useState([]);
  const [contests, setContests] = useState([]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('amount');
  const [amount, setAmount] = useState('');
  const [bankId, setBankId] = useState('');
  const [newBank, setNewBank] = useState({ account_holder: '', email: '', sort_code: '', account_number: '', iban: '', bacs: '' });
  const [addingBank, setAddingBank] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const load = async () => {
    try {
      const [c, s, b, r] = await Promise.all([
        cashoutAPI.config(), cashoutAPI.summary(), cashoutAPI.banks(), cashoutAPI.myRequests(),
      ]);
      setConfig(c); setSummary(s); setBanks(b.items || []); setRequests(r.items || []);
    } catch (e) { /* wallet still renders */ }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    contestsAPI.list({ status: 'live' }).then((d) => setContests((Array.isArray(d) ? d : d?.items || []).slice(0, 3))).catch(() => {});
  }, []);

  const available = summary?.available_to_cash_out ?? 0;
  const kyc = summary?.kyc_status || 'none';

  const openFlow = () => {
    setAmount(''); setBankId(banks[0]?.bank_account_id || ''); setSuccess(null);
    setStep('amount'); setOpen(true);
  };

  const addBank = async () => {
    if (!newBank.account_holder || !newBank.email || !newBank.sort_code || !newBank.account_number || !newBank.iban || !newBank.bacs) {
      toast({ title: 'All bank fields are required', variant: 'destructive' }); return;
    }
    setAddingBank(true);
    try {
      const res = await cashoutAPI.addBank(newBank);
      const list = await cashoutAPI.banks(); setBanks(list.items || []);
      setBankId(res.bank_account_id);
      setNewBank({ account_holder: '', email: '', sort_code: '', account_number: '', iban: '', bacs: '' });
      toast({ title: 'Bank account added' });
    } catch (e) {
      toast({ title: e?.response?.data?.detail || 'Could not add bank account', variant: 'destructive' });
    } finally { setAddingBank(false); }
  };

  const submit = async (reviewId) => {
    const mode = config?.review_mode || 'disabled';
    if (reviewId === undefined && mode !== 'disabled' && !config?.has_review_bypass) { setStep('review'); return; }
    setSubmitting(true);
    try {
      const res = await cashoutAPI.request({ amount_tokens: parseInt(amount, 10), bank_account_id: bankId, review_id: reviewId || undefined });
      setSuccess(res); setStep('success');
      await load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (d?.code === 'REVIEW_REQUIRED') { setStep('review'); return; }
      toast({ title: typeof d === 'string' ? d : 'Cash out failed', variant: 'destructive' });
    } finally { setSubmitting(false); }
  };
  const openSupport = () => { setOpen(false); window.dispatchEvent(new CustomEvent('pl-open-support-ticket', { detail: {} })); };

  const amt = parseInt(amount, 10) || 0;
  const amountValid = amt > 0 && amt <= Math.floor(available);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="cashout-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-extrabold text-lg text-slate-900 flex items-center gap-2">
          <Banknote className="w-5 h-5 text-[#6C2BFF]" /> Wallet
        </h3>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">1 token = £1</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat testid="wallet-total" icon={<Coins className="w-4 h-4" />} label="Total Tokens" value={summary ? summary.total_tokens : '—'} tone="slate" />
        <Stat testid="wallet-tokens" icon={<Coins className="w-4 h-4" />} label="Tokens" value={summary ? summary.tokens : '—'} tone="violet" />
        <Stat testid="wallet-bonus" icon={<Gift className="w-4 h-4" />} label="Bonus Tokens" value={summary ? summary.bonus_tokens : '—'} tone="amber" />
        <Stat testid="wallet-available" icon={<Banknote className="w-4 h-4" />} label="Available to Cash Out" value={summary ? gbp(available) : '—'} tone="emerald" />
      </div>

      {summary?.pending_cash_out > 0 && (
        <div className="mt-3 text-xs font-semibold text-slate-500" data-testid="wallet-pending">
          Pending cash out: {gbp(summary.pending_cash_out)}
        </div>
      )}

      <div className="mt-4">
        {config?.enabled ? (
          <Button
            className="w-full h-12 rounded-2xl bg-[#6C2BFF] hover:bg-[#5a20e0] text-white font-bold"
            onClick={openFlow}
            disabled={available <= 0}
            data-testid="cashout-open-btn"
          >
            <Banknote className="w-4 h-4 mr-2" /> Cash Out
          </Button>
        ) : (
          <Button className="w-full h-12 rounded-2xl bg-slate-100 text-slate-500 font-bold cursor-not-allowed" disabled data-testid="cashout-coming-soon">
            <Lock className="w-4 h-4 mr-2" /> Cash Out — Coming Soon
          </Button>
        )}
        {available <= 0 && config?.enabled && (
          <p className="text-[11px] text-slate-400 mt-2 text-center">Only Championship winnings can be cashed out.</p>
        )}
      </div>

      {requests.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Cash out history</div>
          <div className="space-y-2">
            {requests.slice(0, 5).map((r) => (
              <div key={r.withdrawal_id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm" data-testid="cashout-history-row">
                <div>
                  <div className="font-semibold text-slate-800">{gbp(r.amount_gbp)}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{r.withdrawal_id}</div>
                </div>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="max-w-md" data-testid="cashout-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-[#6C2BFF]" />
              {step === 'success' ? 'Cash out requested' : 'Cash out'}
            </DialogTitle>
          </DialogHeader>

          {step === 'amount' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
                <div className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Available to cash out</div>
                <div className="text-3xl font-extrabold text-emerald-700">{gbp(available)}</div>
                <div className="text-[11px] text-emerald-600 mt-1">1 eligible token = £1</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Amount (tokens)</label>
                <Input type="number" min="1" max={Math.floor(available)} value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder="Enter tokens"
                  data-testid="cashout-amount-input" />
                <div className="text-sm font-bold text-slate-700 mt-1">{amt} tokens = {gbp(amt)}</div>
              </div>
              {kyc === 'none' && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5" />
                  <div>You'll need to complete identity verification (KYC). You can submit your cash out now and we'll review your KYC before paying. Visit <a href="/my-account/kyc" className="underline font-semibold">KYC</a>.</div>
                </div>
              )}
              <Button className="w-full h-11 rounded-2xl bg-[#6C2BFF] text-white font-bold" disabled={!amountValid}
                onClick={() => setStep('bank')} data-testid="cashout-amount-next">
                Continue <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {step === 'bank' && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-600">Select bank account</div>
              {banks.map((b) => (
                <button key={b.bank_account_id} onClick={() => setBankId(b.bank_account_id)}
                  className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 ${bankId === b.bank_account_id ? 'border-[#6C2BFF] bg-violet-50' : 'border-slate-200'}`}
                  data-testid="cashout-bank-option">
                  <Landmark className="w-4 h-4 text-slate-500" />
                  <div>
                    <div className="font-semibold text-sm text-slate-800">{b.account_holder}</div>
                    <div className="text-xs text-slate-400 font-mono">{b.sort_code_masked} · {b.account_number_masked}</div>
                  </div>
                </button>
              ))}
              <div className="rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-500">+ Add bank account</div>
                <Input placeholder="Account holder name" value={newBank.account_holder}
                  onChange={(e) => setNewBank({ ...newBank, account_holder: e.target.value })} data-testid="bank-holder-input" />
                <Input type="email" placeholder="Email / Mail ID" value={newBank.email}
                  onChange={(e) => setNewBank({ ...newBank, email: e.target.value })} data-testid="bank-email-input" />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Sort code" value={newBank.sort_code}
                    onChange={(e) => setNewBank({ ...newBank, sort_code: e.target.value })} data-testid="bank-sort-input" />
                  <Input placeholder="Account number" value={newBank.account_number}
                    onChange={(e) => setNewBank({ ...newBank, account_number: e.target.value })} data-testid="bank-number-input" />
                </div>
                <Input placeholder="IBAN" value={newBank.iban}
                  onChange={(e) => setNewBank({ ...newBank, iban: e.target.value })} data-testid="bank-iban-input" />
                <Input placeholder="BACS" value={newBank.bacs}
                  onChange={(e) => setNewBank({ ...newBank, bacs: e.target.value })} data-testid="bank-bacs-input" />
                <Button variant="outline" className="w-full h-9 rounded-xl" onClick={addBank} disabled={addingBank} data-testid="bank-add-btn">
                  {addingBank ? 'Adding…' : 'Add account'}
                </Button>
              </div>
              <Button className="w-full h-11 rounded-2xl bg-[#6C2BFF] text-white font-bold" disabled={!bankId}
                onClick={() => setStep('confirm')} data-testid="cashout-bank-next">
                Continue <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 p-4 space-y-2 text-sm">
                <Row label="Amount" value={<b>{gbp(amt)}</b>} />
                <Row label="Tokens" value={`${amt}`} />
                <Row label="Bank" value={banks.find((b) => b.bank_account_id === bankId)?.account_number_masked || '—'} />
                <Row label="KYC" value={<span className="capitalize">{kyc}</span>} />
              </div>
              <p className="text-[11px] text-slate-500">We'll review your KYC and payment details before completing the payment. No money is sent until an admin approves.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-11 rounded-2xl" onClick={() => setStep('bank')}>Back</Button>
                <Button className="flex-1 h-11 rounded-2xl bg-[#6C2BFF] text-white font-bold" onClick={() => submit()} disabled={submitting} data-testid="cashout-confirm-btn">
                  {submitting ? 'Submitting…' : 'Confirm cash out'}
                </Button>
              </div>
            </div>
          )}

          {step === 'review' && (
            <CashoutReviewStep config={config || {}} onBack={() => setStep('confirm')} onDone={(id) => submit(id)} onSkip={() => submit(null)} onSupport={openSupport} />
          )}

          {step === 'success' && success && (
            <div className="space-y-4" data-testid="cashout-success">
              <div className="flex flex-col items-center text-center py-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                <div className="text-lg font-extrabold text-slate-900 mt-2">Cash-out request submitted</div>
                <div className="text-2xl font-extrabold text-[#6C2BFF] mt-1">{gbp(success.amount_gbp)}</div>
                <div className="text-xs text-slate-500 mt-1">Status: Processing · <span className="font-mono">{success.withdrawal_id}</span></div>
                <p className="text-xs text-slate-500 mt-2">Your cash-out request is being processed. We'll review your KYC and payment details before completing the payment.</p>
              </div>
              {(success.google_review_url || success.trustpilot_review_url) && (
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400" /> Enjoying Prize League? Share your experience.</div>
                  <div className="flex gap-2">
                    {success.google_review_url && <a href={success.google_review_url} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs font-bold rounded-xl border border-slate-200 py-2 hover:bg-white" data-testid="review-google">Google Review</a>}
                    {success.trustpilot_review_url && <a href={success.trustpilot_review_url} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs font-bold rounded-xl border border-slate-200 py-2 hover:bg-white" data-testid="review-trustpilot">Trustpilot</a>}
                  </div>
                </div>
              )}
              {contests.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> Live paid contests</div>
                  <div className="space-y-1.5">
                    {contests.map((c) => (
                      <a key={c.slug || c.id} href={`/contests/${c.slug}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-xs hover:bg-slate-50" data-testid="cashout-live-contest">
                        <span className="font-semibold text-slate-700 truncate">{c.title || c.name}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <Button className="w-full h-11 rounded-2xl bg-slate-900 text-white font-bold" onClick={() => setOpen(false)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon, label, value, tone, testid }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-700', violet: 'bg-violet-50 text-[#6C2BFF]',
    amber: 'bg-amber-50 text-amber-700', emerald: 'bg-emerald-50 text-emerald-700',
  };
  return (
    <div className={`rounded-2xl p-3 ${tones[tone]}`} data-testid={testid}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-80">{icon}{label}</div>
      <div className="text-xl font-extrabold mt-1">{value}</div>
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex items-center justify-between"><span className="text-slate-500">{label}</span><span className="text-slate-900">{value}</span></div>;
}

function StatusPill({ status }) {
  const map = {
    processing: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-700', cancelled: 'bg-slate-100 text-slate-500',
  };
  return <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${map[status] || 'bg-slate-100 text-slate-600'}`} data-testid="cashout-status">{status}</span>;
}
