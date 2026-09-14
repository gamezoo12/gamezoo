import { useCallback, useEffect, useState } from 'react';
import { Banknote, Eye, Check, X, Loader2, RefreshCw } from 'lucide-react';
import { winningsAdminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';

const gbp = (p) => `£${(Number(p || 0) / 100).toFixed(2)}`;
const FILTERS = [
  { id: '', label: 'All' },
  { id: 'processing', label: 'Processing' },
  { id: 'paid', label: 'Paid' },
  { id: 'rejected', label: 'Rejected' },
];

const statusPill = (s) => {
  const map = {
    processing: 'bg-amber-100 text-amber-700 border-amber-200',
    paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  };
  return map[s] || 'bg-slate-100 text-slate-600 border-slate-200';
};

export default function WinningsPayoutsAdmin() {
  const { toast } = useToast();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const [bank, setBank] = useState(null); // revealed bank detail object
  const [bankBusy, setBankBusy] = useState(false);

  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await winningsAdminAPI.list(status || undefined);
      setRows(r.items || []);
    } catch (e) {
      toast({ title: 'Failed to load', description: e?.response?.data?.detail || 'Try again.', variant: 'destructive' });
    } finally { setLoading(false); }
  }, [status, toast]);

  useEffect(() => { load(); }, [load]);

  const reveal = async (id) => {
    setBankBusy(true);
    try {
      const r = await winningsAdminAPI.bank(id);
      setBank(r);
    } catch (e) {
      toast({ title: 'Cannot reveal', description: e?.response?.data?.detail || 'Insufficient permissions.', variant: 'destructive' });
    } finally { setBankBusy(false); }
  };

  const markPaid = async (id) => {
    setBusyId(id);
    try {
      const r = await winningsAdminAPI.markPaid(id);
      toast({ title: r.idempotent ? 'Already processed' : 'Marked as paid', description: `Status: ${r.status}` });
      await load();
    } catch (e) {
      toast({ title: 'Failed', description: e?.response?.data?.detail || 'Try again.', variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const submitReject = async () => {
    if (!rejectReason.trim()) { toast({ title: 'Reason required', variant: 'destructive' }); return; }
    setBusyId(rejectId);
    try {
      const r = await winningsAdminAPI.reject(rejectId, rejectReason.trim());
      toast({ title: r.idempotent ? 'Already processed' : 'Withdrawal rejected', description: 'Funds released back to the user.' });
      setRejectId(null); setRejectReason('');
      await load();
    } catch (e) {
      toast({ title: 'Failed', description: e?.response?.data?.detail || 'Try again.', variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  return (
    <div data-testid="admin-winnings-payouts">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-slate-900 flex items-center gap-2">
            <Banknote className="w-6 h-6 text-[#6C2BFF]" /> Winnings Payouts
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Review UK bank withdrawal requests from the Winnings Wallet.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} data-testid="payouts-refresh">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap" data-testid="payouts-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id || 'all'}
            onClick={() => setStatus(f.id)}
            data-testid={`payouts-filter-${f.id || 'all'}`}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
              status === f.id ? 'bg-[#6C2BFF] text-white border-[#6C2BFF]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#6C2BFF]/40'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-400" data-testid="payouts-empty">No withdrawal requests.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="payouts-table">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-bold">User</th>
                  <th className="text-left px-4 py-3 font-bold">Amount</th>
                  <th className="text-left px-4 py-3 font-bold">Account</th>
                  <th className="text-left px-4 py-3 font-bold">Status</th>
                  <th className="text-left px-4 py-3 font-bold">Requested</th>
                  <th className="text-right px-4 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.withdrawal_id} className="hover:bg-slate-50/60" data-testid={`payout-row-${r.withdrawal_id}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{r.name || '—'}</div>
                      <div className="text-xs text-slate-400">{r.email || ''}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{r.public_id || ''}</div>
                    </td>
                    <td className="px-4 py-3 font-extrabold text-slate-900" data-testid={`payout-amount-${r.withdrawal_id}`}>{gbp(r.amount_pence)}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700">{r.account_holder || '—'}</div>
                      <div className="text-xs text-slate-400 font-mono">{r.sort_code || ''} · {r.account_number_masked || ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full border capitalize ${statusPill(r.status)}`} data-testid={`payout-status-${r.withdrawal_id}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.created_at ? new Date(r.created_at).toLocaleString('en-GB') : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => reveal(r.withdrawal_id)} data-testid={`payout-reveal-${r.withdrawal_id}`}>
                          <Eye className="w-3.5 h-3.5 mr-1" /> Bank
                        </Button>
                        {r.status === 'processing' && (
                          <>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busyId === r.withdrawal_id}
                              onClick={() => markPaid(r.withdrawal_id)} data-testid={`payout-markpaid-${r.withdrawal_id}`}>
                              <Check className="w-3.5 h-3.5 mr-1" /> Paid
                            </Button>
                            <Button size="sm" variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" disabled={busyId === r.withdrawal_id}
                              onClick={() => { setRejectId(r.withdrawal_id); setRejectReason(''); }} data-testid={`payout-reject-${r.withdrawal_id}`}>
                              <X className="w-3.5 h-3.5 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reveal bank modal */}
      {(bank || bankBusy) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="payout-bank-modal"
          onClick={() => { if (!bankBusy) setBank(null); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-lg mb-3 flex items-center gap-2"><Banknote className="w-5 h-5 text-[#6C2BFF]" /> Bank details</h3>
            {bankBusy ? (
              <div className="py-6 text-center text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Revealing…</div>
            ) : (
              <dl className="space-y-2 text-sm">
                <Row k="Account holder" v={bank.account_holder} t="bank-holder" />
                <Row k="Sort code" v={bank.sort_code} t="bank-sort" />
                <Row k="Account number" v={bank.account_number} t="bank-number" />
                <Row k="Amount" v={gbp(bank.amount_pence)} t="bank-amount" />
                <Row k="Status" v={bank.status} t="bank-status" />
              </dl>
            )}
            <Button className="w-full mt-5" variant="outline" onClick={() => setBank(null)} data-testid="bank-close">Close</Button>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="payout-reject-modal"
          onClick={() => busyId !== rejectId && setRejectId(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-lg">Reject withdrawal</h3>
            <p className="text-xs text-slate-500 mt-1">The reserved funds are returned to the user's available balance. A reason is required.</p>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm mt-4 min-h-[90px]"
              placeholder="Reason for rejection (e.g. bank details invalid, KYC pending)…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              data-testid="reject-reason-input"
            />
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" disabled={busyId === rejectId} onClick={() => setRejectId(null)} data-testid="reject-cancel">Cancel</Button>
              <Button className="flex-1 bg-rose-600 hover:bg-rose-700 text-white" disabled={busyId === rejectId} onClick={submitReject} data-testid="reject-submit">
                {busyId === rejectId ? 'Rejecting…' : 'Reject & release funds'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, t }) {
  return (
    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
      <dt className="text-slate-400">{k}</dt>
      <dd className="font-bold text-slate-900 font-mono" data-testid={t}>{v || '—'}</dd>
    </div>
  );
}
