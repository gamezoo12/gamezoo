import { useEffect, useState } from 'react';
import { cashoutAPI } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { CashoutReviewSettings } from '../../components/admin/CashoutReviewSettings';
import { Banknote, ShieldCheck, Eye, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

const gbp = (n) => `£${(Number(n) || 0).toFixed(2)}`;
const STATUSES = ['processing', 'paid', 'rejected'];

export default function CashOutAdmin() {
  const { toast } = useToast();
  const [config, setConfig] = useState(null);
  const [urls, setUrls] = useState({ google_review_url: '', trustpilot_review_url: '' });
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('processing');
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const loadConfig = async () => {
    try {
      const c = await cashoutAPI.adminConfig();
      setConfig(c);
      setUrls({ google_review_url: c.google_review_url || '', trustpilot_review_url: c.trustpilot_review_url || '' });
    } catch (e) { toast({ title: 'Failed to load config', variant: 'destructive' }); }
  };
  const loadRows = async () => {
    try { const d = await cashoutAPI.adminList(filter); setRows(d.items || []); }
    catch (e) { toast({ title: 'Failed to load withdrawals', variant: 'destructive' }); }
  };
  useEffect(() => { loadConfig(); }, []);
  useEffect(() => { loadRows(); }, [filter]);

  const toggleEnabled = async () => {
    setBusy(true);
    try {
      const c = await cashoutAPI.adminUpdateConfig({ enabled: !config.enabled });
      setConfig(c); toast({ title: `Cash out ${c.enabled ? 'enabled' : 'disabled'}` });
    } catch (e) { toast({ title: 'Update failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const saveUrls = async () => {
    setBusy(true);
    try { const c = await cashoutAPI.adminUpdateConfig(urls); setConfig(c); toast({ title: 'Review links saved' }); }
    catch (e) { toast({ title: 'Save failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const openDetail = async (id) => {
    try {
      const d = await cashoutAPI.adminDetail(id);
      setDetail(d);
      setNotificationMessage(`Your ${gbp(d.amount_gbp)} cash-out has been approved and paid successfully.`);
      setRejectReason('');
    } catch (e) { toast({ title: 'Failed to load detail', variant: 'destructive' }); }
  };
  const markPaid = async (id) => {
    if (!notificationMessage.trim()) { toast({ title: 'Notification message is required', variant: 'destructive' }); return; }
    if (!window.confirm(`Confirm that ${gbp(detail?.amount_gbp)} has been manually sent to this user's bank account.`)) return;
    setBusy(true);
    try { await cashoutAPI.adminMarkPaid(id, notificationMessage.trim()); toast({ title: 'Marked as paid & notification sent' }); setDetail(null); loadRows(); }
    catch (e) { toast({ title: e?.response?.data?.detail || 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const reject = async (id) => {
    if (!rejectReason.trim()) { toast({ title: 'Rejection reason is required', variant: 'destructive' }); return; }
    if (!notificationMessage.trim()) { toast({ title: 'Notification message is required', variant: 'destructive' }); return; }
    setBusy(true);
    try { await cashoutAPI.adminReject(id, rejectReason.trim(), notificationMessage.trim()); toast({ title: 'Rejected, tokens released & notification sent' }); setDetail(null); loadRows(); }
    catch (e) { toast({ title: e?.response?.data?.detail || 'Failed', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-6 space-y-6" data-testid="admin-cashout">
      <h1 className="text-2xl font-extrabold flex items-center gap-2"><Banknote className="w-6 h-6 text-[#6C2BFF]" /> Cash Out / Withdrawals</h1>

      {/* CONFIG */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-slate-900">Live cash-out</div>
            <div className="text-xs text-slate-500">When off, users see "Coming Soon" and the API blocks submissions.</div>
          </div>
          <Button onClick={toggleEnabled} disabled={busy || !config}
            className={config?.enabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-400'}
            data-testid="admin-cashout-toggle">
            {config?.enabled ? 'Enabled' : 'Disabled'}
          </Button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Google review URL</label>
            <Input value={urls.google_review_url} onChange={(e) => setUrls({ ...urls, google_review_url: e.target.value })}
              placeholder="https://…" data-testid="admin-google-url" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Trustpilot review URL</label>
            <Input value={urls.trustpilot_review_url} onChange={(e) => setUrls({ ...urls, trustpilot_review_url: e.target.value })}
              placeholder="https://…" data-testid="admin-trustpilot-url" />
          </div>
        </div>
        <Button variant="outline" onClick={saveUrls} disabled={busy} data-testid="admin-save-urls">Save review links</Button>
      </div>

      {config && <CashoutReviewSettings config={config} onSaved={setConfig} toast={toast} />}

      {/* WITHDRAWALS */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`text-xs font-bold uppercase px-3 py-1.5 rounded-full ${filter === s ? 'bg-[#6C2BFF] text-white' : 'bg-slate-100 text-slate-600'}`}
                data-testid={`admin-filter-${s}`}>{s}</button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={loadRows}><RefreshCw className="w-4 h-4" /></Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 text-xs uppercase">
              <th className="py-2">Withdrawal</th><th>User</th><th>Amount</th><th>KYC</th><th>Status</th><th></th>
            </tr></thead>
            <tbody data-testid="admin-cashout-rows">
              {rows.map((r) => (
                <tr key={r.withdrawal_id} className="border-t border-slate-100">
                  <td className="py-2 font-mono text-xs">{r.withdrawal_id}</td>
                  <td>{r.name || r.email}</td>
                  <td className="font-bold">{gbp(r.amount_gbp)}</td>
                  <td className="capitalize text-xs">{r.kyc_status_snapshot}</td>
                  <td className="capitalize">{r.status}</td>
                  <td><Button size="sm" variant="outline" onClick={() => openDetail(r.withdrawal_id)} data-testid="admin-view-btn"><Eye className="w-4 h-4" /></Button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan="6" className="py-6 text-center text-slate-400">No withdrawals</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()} data-testid="admin-cashout-detail">
            <h3 className="font-bold text-lg">{detail.withdrawal_id}</h3>
            <div className="text-sm space-y-1">
              <Row l="User" v={`${detail.user?.name || ''} (${detail.user?.email || ''})`} />
              <Row l="Amount" v={<b>{gbp(detail.amount_gbp)}</b>} />
              <Row l="Tokens" v={detail.amount_tokens} />
              <Row l="KYC (snapshot)" v={detail.kyc_status_snapshot} />
              <Row l="KYC (current)" v={detail.kyc_current_status} />
              <Row l="Status" v={detail.status} />
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm">
              <div className="text-xs font-bold uppercase text-slate-400 mb-1 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Bank payout details</div>
              <Row l="Holder" v={detail.bank?.account_holder} />
              <Row l="Email / Mail ID" v={detail.bank?.email} />
              <Row l="Sort code" v={detail.bank?.sort_code} />
              <Row l="Account number" v={detail.bank?.account_number} />
              <Row l="IBAN" v={detail.bank?.iban} />
              <Row l="BACS" v={detail.bank?.bacs} />
            </div>
            {detail.status === 'processing' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">In-app notification message</label>
                  <textarea
                    className="mt-1 w-full min-h-[84px] rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    placeholder="Message sent to the user's in-app notifications"
                    data-testid="admin-cashout-notification"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Rejection reason (required only when rejecting)</label>
                  <Input
                    value={rejectReason}
                    onChange={(e) => {
                      setRejectReason(e.target.value);
                      if (e.target.value.trim()) {
                        setNotificationMessage(`Your ${gbp(detail?.amount_gbp)} cash-out request was rejected. Reason: ${e.target.value.trim()}. The reserved tokens have been returned to your wallet.`);
                      }
                    }}
                    placeholder="Enter rejection reason"
                    data-testid="admin-cashout-reject-reason"
                  />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => markPaid(detail.withdrawal_id)} disabled={busy} data-testid="admin-mark-paid">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Mark as Paid
                  </Button>
                  <Button className="flex-1 bg-rose-600 hover:bg-rose-700" onClick={() => reject(detail.withdrawal_id)} disabled={busy} data-testid="admin-reject">
                    <XCircle className="w-4 h-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={() => setDetail(null)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ l, v }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-slate-500">{l}</span><span className="text-slate-900 text-right">{v}</span></div>;
}
