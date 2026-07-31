import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/use-toast';
import BackButton from '../../components/BackButton';
import { gbp } from '../../lib/format';
import {
  User as UserIcon, ShieldCheck, Wallet, Ticket, Trophy, LifeBuoy,
  AlertTriangle, Ban, RotateCcw, Trash2, Clock, Mail,
} from 'lucide-react';

const Section = ({ title, icon: Icon, children }) => (
  <section className="bg-white rounded-2xl border border-slate-200 p-5">
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-indigo-600" />
      <h2 className="font-display font-bold text-base">{title}</h2>
    </div>
    {children}
  </section>
);

const StatCard = ({ label, value, tone = 'slate' }) => (
  <div className={`rounded-xl px-3 py-2 border bg-${tone}-50 border-${tone}-100`}>
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`font-display font-black text-xl text-${tone}-800`}>{value}</div>
  </div>
);

export default function UserDetailsPage() {
  const { user_id } = useParams();
  const nav = useNavigate();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [pwd, setPwd] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const isSuperAdmin = currentUser?.role === 'super_admin';

  const load = () => {
    setState('loading');
    api.get(`/admin/users/${user_id}/360`)
      .then(r => { setData(r.data); setState('ok'); })
      .catch(err => setState(err?.response?.status === 404 ? 'missing' : 'error'));
  };
  useEffect(load, [user_id]);

  const doSuspend = async () => {
    if (!pwd || !reason) return toast({ title: 'Password + reason required' });
    setBusy(true);
    try {
      const suspended = !!data?.identity?.suspended;
      if (suspended) {
        await api.post(`/admin/users/${user_id}/unsuspend`, {});
        toast({ title: 'User reinstated' });
      } else {
        await api.post(`/admin/users/${user_id}/suspend`, { admin_password: pwd, reason });
        toast({ title: 'User suspended' });
      }
      setConfirmSuspend(false); setPwd(''); setReason(''); load();
    } catch (err) {
      toast({ title: 'Failed', description: err?.response?.data?.detail });
    } finally { setBusy(false); }
  };

  const doErase = async () => {
    if (!pwd || !reason) return toast({ title: 'Password + reason required' });
    setBusy(true);
    try {
      await api.post(`/admin/users/${user_id}/erase`, { admin_password: pwd, reason });
      toast({ title: 'User erased', description: 'PII removed. Financial records retained.' });
      setConfirmErase(false); setPwd(''); setReason(''); load();
    } catch (err) {
      toast({ title: 'Failed', description: err?.response?.data?.detail });
    } finally { setBusy(false); }
  };

  if (state === 'loading') return <div className="p-6 text-slate-500">Loading user…</div>;
  if (state === 'missing') return <div className="p-6 text-slate-500">User not found.</div>;
  if (state === 'error') return <div className="p-6 text-rose-600">Failed to load.</div>;

  const { identity, kyc, wallet, stats, orders, tickets, scores, wallet_transactions, notifications, support_cases, referrals, sessions, admin_actions } = data;
  const suspended = !!identity.suspended;
  const erased = !!identity.erased;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="user-360-page">
      <BackButton to="/admin/users" label="All users" className="mb-1" />

      {/* Hero */}
      <div className="relative rounded-2xl bg-gradient-to-br from-violet-600 to-purple-800 text-white p-6 overflow-hidden">
        <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/25 text-2xl font-black flex items-center justify-center border-2 border-white/40">
            {(identity.name || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-2xl truncate" data-testid="user-name">
              {identity.name} {erased && <span className="text-red-200">· ERASED</span>}
            </div>
            <div className="text-white/85 text-sm truncate flex items-center gap-2">
              <Mail className="w-3.5 h-3.5" /> {identity.email}
            </div>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <span className="bg-white/20 px-2 py-0.5 rounded font-mono" data-testid="user-public-id">{identity.public_id || '—'}</span>
              <span className="bg-white/20 px-2 py-0.5 rounded">Role: {identity.role}</span>
              <span className="bg-white/20 px-2 py-0.5 rounded">Method: {identity.method}</span>
              {identity.phone_verified && <span className="bg-emerald-500/30 px-2 py-0.5 rounded">Phone verified</span>}
              {suspended && <span className="bg-rose-500/40 px-2 py-0.5 rounded">SUSPENDED</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="bg-white/10 text-white border-white/30 hover:bg-white/20" onClick={() => setConfirmSuspend(true)} data-testid="btn-suspend">
              {suspended ? (<><RotateCcw className="w-4 h-4 mr-1" /> Reinstate</>) : (<><Ban className="w-4 h-4 mr-1" /> Suspend</>)}
            </Button>
            {isSuperAdmin && !erased && (
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setConfirmErase(true)} data-testid="btn-erase">
                <Trash2 className="w-4 h-4 mr-1" /> Erase
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="user-stats">
        <StatCard label="Wallet" value={gbp(wallet?.balance || 0)} tone="emerald" />
        <StatCard label="Tickets" value={stats.tickets_count} tone="teal" />
        <StatCard label="Scores" value={stats.scores_count} tone="indigo" />
        <StatCard label="Orders" value={stats.orders_count} tone="amber" />
        <StatCard label="Support" value={stats.support_cases_count} tone="rose" />
        <StatCard label="Referrals" value={stats.referrals_count} tone="fuchsia" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Identity & KYC" icon={ShieldCheck}>
          <dl className="text-sm space-y-1.5">
            <div className="flex"><dt className="w-32 text-slate-500">User ID</dt><dd className="font-mono text-xs">{identity.user_id}</dd></div>
            <div className="flex"><dt className="w-32 text-slate-500">Username</dt><dd>{identity.username || '—'}</dd></div>
            <div className="flex"><dt className="w-32 text-slate-500">DOB</dt><dd>{identity.dob || '—'}</dd></div>
            <div className="flex"><dt className="w-32 text-slate-500">Address</dt><dd className="flex-1">{identity.address || '—'}</dd></div>
            <div className="flex"><dt className="w-32 text-slate-500">Joined</dt><dd>{identity.created_at ? new Date(identity.created_at).toLocaleString('en-GB') : '—'}</dd></div>
            <div className="flex"><dt className="w-32 text-slate-500">KYC status</dt><dd>{kyc?.status || 'none'}</dd></div>
          </dl>
        </Section>

        <Section title="Wallet" icon={Wallet}>
          <div className="text-3xl font-black text-emerald-700">{gbp(wallet?.balance || 0)}</div>
          <div className="text-xs text-slate-500">Lifetime top-up: {gbp(wallet?.lifetime_topup || 0)} · Lifetime spend: {gbp(wallet?.lifetime_spend || 0)}</div>
          <div className="mt-3 max-h-40 overflow-y-auto text-xs">
            {wallet_transactions.length === 0 ? <div className="text-slate-400">No wallet transactions.</div> :
              wallet_transactions.slice(0, 20).map((t, i) => (
                <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1">
                  <span>{t.kind} · {t.method || '—'}</span>
                  <span className={t.amount > 0 ? 'text-emerald-700' : 'text-rose-700'}>{gbp(t.amount)}</span>
                </div>
              ))
            }
          </div>
        </Section>

        <Section title="Tickets & Scores" icon={Ticket}>
          <div className="text-xs text-slate-500">Tickets: {tickets.length} · Scores: {scores.length}</div>
          <div className="mt-2 max-h-52 overflow-y-auto text-xs space-y-1">
            {scores.slice(0, 20).map((s, i) => (
              <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1">
                <span>{s.contest_id}</span>
                <span>#{s.ticket_number} · {s.points ?? '—'}pt</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Support" icon={LifeBuoy}>
          {support_cases.length === 0 ? <div className="text-xs text-slate-400">No support cases.</div> :
            <ul className="text-xs space-y-1">
              {support_cases.slice(0, 15).map((c, i) => (
                <li key={i} className="border-b border-slate-100 py-1"><strong>{c.subject || c.category}</strong> · {c.status}</li>
              ))}
            </ul>
          }
        </Section>
      </div>

      <Section title="Admin actions history" icon={Clock}>
        {admin_actions.length === 0 ? <div className="text-xs text-slate-400">No admin actions recorded.</div> :
          <ul className="text-xs space-y-1 max-h-52 overflow-y-auto">
            {admin_actions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-slate-400 shrink-0">{new Date(a.at).toLocaleString('en-GB')}</span>
                <span className="font-semibold">{a.kind}</span>
                <span className="text-slate-500">by {a.admin_email}</span>
                {a.reason && <span className="text-slate-500 truncate">— {a.reason}</span>}
              </li>
            ))}
          </ul>
        }
      </Section>

      {/* Suspend / Unsuspend confirm */}
      <Dialog open={confirmSuspend} onOpenChange={setConfirmSuspend}>
        <DialogContent>
          <DialogHeader><DialogTitle>{suspended ? 'Reinstate user' : 'Suspend user'}</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">{suspended ? 'Restore this account. The user will be able to sign in again.' : 'This closes the user out of the platform. Reversible from this page.'}</p>
          {!suspended && (
            <>
              <div><Label>Reason</Label><Input value={reason} onChange={e => setReason(e.target.value)} data-testid="suspend-reason" /></div>
              <div><Label>Your admin password</Label><Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} data-testid="suspend-password" /></div>
            </>
          )}
          <Button onClick={doSuspend} disabled={busy || (!suspended && (!pwd || !reason))} className="bg-slate-800 hover:bg-slate-900" data-testid="confirm-suspend">
            {busy ? 'Working…' : (suspended ? 'Reinstate' : 'Suspend')}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Erase confirm */}
      <Dialog open={confirmErase} onOpenChange={setConfirmErase}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-rose-700 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Permanent erasure</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">Personal data will be removed. Financial, tax and audit records are retained per Data Retention Policy. This is irreversible.</p>
          <div><Label>Reason (mandatory)</Label><Input value={reason} onChange={e => setReason(e.target.value)} data-testid="erase-reason" /></div>
          <div><Label>Super Admin password (re-auth)</Label><Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} data-testid="erase-password" /></div>
          <Button onClick={doErase} disabled={busy || !pwd || !reason} className="bg-red-600 hover:bg-red-700" data-testid="confirm-erase">
            {busy ? 'Erasing…' : 'Permanently erase'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
