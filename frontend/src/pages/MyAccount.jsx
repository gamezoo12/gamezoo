import { useEffect, useState } from 'react';
import { ordersAPI, userAPI, walletAPI, referralAPI, paymentsAPI } from '../lib/api';
import WalletPanel from '../components/account/WalletPanel';
import SupportPanel from '../components/account/SupportPanel';
import MyGamesPanel from '../components/account/MyGamesPanel';
import {
  User, Wallet, Ticket, Gamepad2, Bell, ShieldCheck, Lock,
  LifeBuoy, FileText, Settings2, Gift, LogOut, ArrowRight,
  Trophy, Copy, Check, Clock, AlertCircle, Mail,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { useToast } from '../hooks/use-toast';
import BackButton from '../components/BackButton';

const kycStyles = {
  approved: ['bg-emerald-100 text-emerald-700 border-emerald-200', ShieldCheck, 'Verified'],
  pending: ['bg-amber-100 text-amber-700 border-amber-200', Clock, 'Under review'],
  rejected: ['bg-rose-100 text-rose-700 border-rose-200', AlertCircle, 'Rejected'],
  none: ['bg-slate-100 text-slate-600 border-slate-200', User, 'Not submitted'],
};

const KycBadge = ({ status }) => {
  const [cls, Icon, label] = kycStyles[status] || kycStyles.none;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${cls}`} data-testid="kyc-badge">
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
};

// 12 navigation tokens — order & colours locked per spec
const TOKENS = [
  { id: 'profile',       label: 'Profile',        Icon: User,        color: 'from-violet-500 to-purple-600',   ring: 'ring-violet-400/40' },
  { id: 'wallet',        label: 'Wallet',         Icon: Wallet,      color: 'from-amber-500 to-orange-600',    ring: 'ring-amber-400/40' },
  { id: 'tickets',       label: 'Tickets',        Icon: Ticket,      color: 'from-teal-500 to-emerald-600',    ring: 'ring-teal-400/40' },
  { id: 'games',         label: 'My Games',       Icon: Gamepad2,    color: 'from-fuchsia-500 to-pink-600',    ring: 'ring-fuchsia-400/40' },
  { id: 'notifications', label: 'Notifications',  Icon: Bell,        color: 'from-sky-500 to-blue-600',        ring: 'ring-sky-400/40' },
  { id: 'kyc',           label: 'KYC',            Icon: ShieldCheck, color: 'from-emerald-500 to-green-600',   ring: 'ring-emerald-400/40' },
  { id: 'security',      label: 'Security',       Icon: Lock,        color: 'from-slate-700 to-slate-900',     ring: 'ring-slate-400/40' },
  { id: 'support',       label: 'Support',        Icon: LifeBuoy,    color: 'from-cyan-500 to-teal-600',       ring: 'ring-cyan-400/40' },
  { id: 'policies',      label: 'Policies',       Icon: FileText,    color: 'from-indigo-500 to-blue-700',     ring: 'ring-indigo-400/40' },
  { id: 'preferences',   label: 'Preferences',    Icon: Settings2,   color: 'from-stone-500 to-neutral-700',   ring: 'ring-stone-400/40' },
  { id: 'referrals',     label: 'Refer & Earn',   Icon: Gift,        color: 'from-rose-500 to-red-600',        ring: 'ring-rose-400/40' },
  { id: 'signout',       label: 'Sign Out',       Icon: LogOut,      color: 'from-red-600 to-rose-800',        ring: 'ring-red-500/50', danger: true },
];

export default function MyAccount() {
  const { user, loading, logout, refresh } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [active, setActive] = useState(searchParams.get('tab') || 'profile');
  const [signOutOpen, setSignOutOpen] = useState(false);

  const [tickets, setTickets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [kyc, setKyc] = useState({ status: 'none' });
  const [profile, setProfile] = useState({ name: '', email: '', phone: '', username: '', dob: '', address: '', phone_verified: false });
  const [wallet, setWallet] = useState(null);
  const [walletTxs, setWalletTxs] = useState([]);
  const [referral, setReferral] = useState(null);
  const [referralList, setReferralList] = useState([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [kycBusy, setKycBusy] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  useEffect(() => {
    if (loading) return undefined;
    if (!user) { nav('/login', { replace: true }); return undefined; }
    userAPI.me()
      .then(me => setProfile({
        name: me.name || '',
        email: me.email || '',
        phone: me.phone || '',
        username: me.username || '',
        dob: me.dob || '',
        address: me.address || '',
        phone_verified: !!me.phone_verified,
      }))
      .catch(() => setProfile(p => ({ ...p, name: user.name || '', email: user.email || '', username: user.username || '', phone_verified: !!user.phone_verified })));
    ordersAPI.myTickets().then(setTickets).catch(() => {});
    userAPI.kycStatus().then(setKyc).catch(() => {});
    userAPI.notifications().then(r => setNotifications(r?.notifications || [])).catch(() => {});
    walletAPI.me().then(setWallet).catch(() => {});
    walletAPI.transactions(20).then(r => setWalletTxs(r?.transactions || [])).catch(() => {});
    referralAPI.me().then(setReferral).catch(() => {});
    referralAPI.list().then(r => setReferralList(r?.referrals || [])).catch(() => {});
    return undefined;
  }, [user, loading, nav]);

  const doLogout = async () => {
    await logout();
    setSignOutOpen(false);
    window.location.href = '/';
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await userAPI.updateMe({ name: profile.name, address: profile.address, email: profile.email });
      toast({ title: 'Profile updated' });
      await refresh?.();
    } catch (err) {
      toast({ title: 'Update failed', description: err?.response?.data?.detail || err.message });
    } finally { setSavingProfile(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setSavingPw(true);
    try {
      const fd = new FormData(e.currentTarget);
      const current_password = fd.get('current_password');
      const new_password = fd.get('new_password');
      const confirm = fd.get('confirm_password');
      if (new_password !== confirm) {
        toast({ title: 'Passwords do not match' });
        setSavingPw(false);
        return;
      }
      await userAPI.changePassword({ current_password, new_password });
      toast({ title: 'Password changed', description: 'Use your new password on next sign-in.' });
      e.currentTarget.reset();
    } catch (err) {
      toast({ title: 'Failed', description: err?.response?.data?.detail || err.message });
    } finally { setSavingPw(false); }
  };

  const submitKyc = async (e) => {
    e.preventDefault();
    setKycBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const data = Object.fromEntries(fd.entries());
      await userAPI.kycSubmit(data);
      toast({ title: 'Verification submitted', description: 'We’ll email you when it’s reviewed.' });
      const s = await userAPI.kycStatus(); setKyc(s);
    } catch (err) {
      toast({ title: 'Failed', description: err?.response?.data?.detail });
    } finally { setKycBusy(false); }
  };

  // Handle return from Stripe checkout
  useEffect(() => {
    const topupParam = searchParams.get('topup');
    const sid = searchParams.get('session_id');
    if (topupParam === 'cancel') {
      toast({ title: 'Payment cancelled', description: 'No charge was made.' });
      nav('/my-account?tab=wallet', { replace: true });
      return undefined;
    }
    if (topupParam !== 'success' || !sid) return undefined;
    let attempts = 0;
    const maxAttempts = 15;
    const poll = async () => {
      attempts += 1;
      try {
        const s = await paymentsAPI.status(sid);
        if (s.payment_status === 'paid') {
          const [w, txs] = await Promise.all([walletAPI.me(), walletAPI.transactions(20)]);
          setWallet(w);
          setWalletTxs(txs?.transactions || []);
          toast({ title: '✅ Payment successful', description: `£${s.amount_gbp.toFixed(2)} added to your wallet.` });
          setActive('wallet');
          nav('/my-account?tab=wallet', { replace: true });
          return;
        }
        if (s.payment_status === 'failed' || s.payment_status === 'expired') {
          toast({ title: 'Payment did not complete', description: `Status: ${s.payment_status}` });
          nav('/my-account?tab=wallet', { replace: true });
          return;
        }
        if (attempts < maxAttempts) setTimeout(poll, 2000);
        else toast({ title: 'Still processing', description: 'Refresh in a moment — your balance will update.' });
      } catch {
        if (attempts < maxAttempts) setTimeout(poll, 2000);
      }
    };
    poll();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const copyReferralLink = async () => {
    const url = `${window.location.origin}/?ref=${referral?.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Copy manually: ' + url });
    }
  };

  const selectToken = (id) => {
    if (id === 'signout') { setSignOutOpen(true); return; }
    setActive(id);
    nav(`/my-account?tab=${id}`, { replace: true });
  };

  if (loading || !user) {
    return <div className="max-w-6xl mx-auto p-10 text-slate-500">Loading…</div>;
  }
  const isPasswordAccount = user.method !== 'google';

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6" data-testid="my-account-page">
      <BackButton to="/" label="Back to home" className="mb-4" />

      {/* 12 Navigation Tokens */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 mb-8"
        data-testid="account-tokens"
      >
        {TOKENS.map(t => {
          const isActive = active === t.id && t.id !== 'signout';
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectToken(t.id)}
              data-testid={`token-${t.id}`}
              className={`group relative overflow-hidden rounded-2xl p-4 text-white text-left transition-all duration-200 bg-gradient-to-br ${t.color} shadow-md hover:shadow-xl hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 ${t.ring} ${isActive ? 'ring-4 ' + t.ring + ' scale-[1.02]' : ''}`}
            >
              <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/10 blur-xl opacity-60 group-hover:opacity-100 transition-opacity" />
              <t.Icon className="w-6 h-6 mb-2 drop-shadow" />
              <div className="font-display font-extrabold text-sm sm:text-base leading-tight">
                {t.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Panel area */}
      <div className="min-h-[300px]">
        {active === 'profile' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6" data-testid="panel-profile">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xl font-extrabold flex items-center justify-center shrink-0">
                {(profile.name || user.name || 'U').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-xl text-slate-900 truncate">
                  @{profile.username || '—'}
                </div>
                <div className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                  <Mail className="w-3.5 h-3.5" /> {profile.email}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <KycBadge status={kyc.status} />
                {profile.phone_verified && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    <ShieldCheck className="w-3 h-3" /> Phone verified
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              Keep your account info up-to-date so we can pay you out and notify winners.
            </p>
            <form onSubmit={saveProfile} className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Full name</Label>
                <Input data-testid="profile-name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input data-testid="profile-email" type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} required />
              </div>
              <div>
                <Label>Phone</Label>
                <Input data-testid="profile-phone" type="tel" value={profile.phone || ''} placeholder="+44 …" disabled />
                <p className="text-[11px] text-slate-500 mt-1">Verified numbers can&apos;t be edited here — contact support to change.</p>
              </div>
              <div>
                <Label>Date of birth</Label>
                <Input data-testid="profile-dob" value={profile.dob || ''} disabled />
              </div>
              <div className="md:col-span-2">
                <Label>Address</Label>
                <Input data-testid="profile-address" value={profile.address || ''} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} placeholder="Street, city, postcode…" />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={savingProfile} data-testid="save-profile-btn" className="pl-btn-purple text-white">
                  {savingProfile ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {active === 'wallet' && (
          <div data-testid="panel-wallet">
            <WalletPanel
              wallet={wallet}
              walletTxs={walletTxs}
              setWallet={setWallet}
              setWalletTxs={setWalletTxs}
              autoOpenTopup={searchParams.get('topup') === '1'}
            />
          </div>
        )}

        {active === 'tickets' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6" data-testid="panel-tickets">
            {tickets.length === 0 ? (
              <div className="py-8 text-center">
                <Ticket className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">You have no tickets yet.</p>
                <a href="/competitions" className="inline-flex items-center gap-1 text-teal-600 font-semibold mt-2">
                  Browse contests <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {tickets.map(t => (
                  <div key={t.ticket_id} className="border border-slate-100 rounded-xl p-4 bg-gradient-to-br from-white to-slate-50">
                    <div className="text-xs text-slate-500">Ticket</div>
                    <div className="text-2xl font-extrabold font-display text-teal-600">#{t.ticket_number}</div>
                    <div className="text-xs text-slate-500 mt-2 truncate">Contest: {t.contest_id}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {active === 'games' && (
          <div data-testid="panel-games"><MyGamesPanel /></div>
        )}

        {active === 'notifications' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6" data-testid="panel-notifications">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No notifications yet. Winners announcements will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map(n => (
                  <li key={n.notification_id} className="py-3 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900">{n.title}</div>
                      <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>
                      <div className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleString('en-GB')}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {active === 'kyc' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6" data-testid="panel-kyc">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="font-display font-bold text-lg">Identity verification (KYC)</h3>
              <KycBadge status={kyc.status} />
            </div>
            {kyc.status === 'approved' ? (
              <p className="text-slate-600">Your identity has been verified. You&apos;re eligible for prize payouts.</p>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-4">Required before we can pay out cash prizes. Your info is kept private and only used for verification. All fields required.</p>
                <form onSubmit={submitKyc} className="grid md:grid-cols-2 gap-3">
                  <div><Label>Full legal name</Label><Input name="full_name" required defaultValue={kyc.full_name || ''} /></div>
                  <div><Label>Date of birth</Label><Input name="dob" type="date" required /></div>
                  <div className="md:col-span-2"><Label>Address</Label><Input name="address" required placeholder="Street, City, Postcode" /></div>
                  <div><Label>Country</Label><Input name="country" defaultValue={kyc.country || 'United Kingdom'} required /></div>
                  <div><Label>Phone</Label><Input name="phone" type="tel" defaultValue={profile.phone || ''} /></div>
                  <div>
                    <Label>ID type</Label>
                    <select name="id_type" defaultValue="passport" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <option value="passport">Passport</option>
                      <option value="driving-licence">Driving licence</option>
                      <option value="national-id">National ID</option>
                    </select>
                  </div>
                  <div><Label>ID number</Label><Input name="id_number" required /></div>
                  <div className="md:col-span-2">
                    <Button type="submit" disabled={kycBusy} className="bg-emerald-600 hover:bg-emerald-700">
                      {kycBusy ? 'Submitting…' : (kyc.status === 'pending' || kyc.status === 'rejected' ? 'Re-submit verification' : 'Submit verification')}
                    </Button>
                  </div>
                </form>
                {kyc.status === 'rejected' && <p className="mt-3 text-sm text-rose-600">Rejected: {kyc.reject_reason}. Please correct and resubmit.</p>}
              </>
            )}
          </div>
        )}

        {active === 'security' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6" data-testid="panel-security">
            <h3 className="font-display font-bold text-lg mb-1 flex items-center gap-2">
              <Lock className="w-5 h-5 text-slate-700" /> Change password
            </h3>
            <p className="text-sm text-slate-500 mb-5">Choose a strong password of 8+ characters.</p>
            {isPasswordAccount ? (
              <form onSubmit={changePassword} className="grid md:grid-cols-2 gap-4 max-w-2xl">
                <div className="md:col-span-2">
                  <Label>Current password</Label>
                  <Input data-testid="pw-current" name="current_password" type="password" required />
                </div>
                <div>
                  <Label>New password</Label>
                  <Input data-testid="pw-new" name="new_password" type="password" minLength={8} required />
                </div>
                <div>
                  <Label>Confirm new password</Label>
                  <Input data-testid="pw-confirm" name="confirm_password" type="password" minLength={8} required />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={savingPw} data-testid="change-password-btn" className="bg-slate-800 hover:bg-slate-900">
                    {savingPw ? 'Updating…' : 'Update password'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                You signed in with Google — password is managed by Google. Manage it at
                <a className="text-teal-600 hover:underline ml-1" href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">
                  Google Account Security
                </a>.
              </div>
            )}
          </div>
        )}

        {active === 'support' && (
          <div data-testid="panel-support"><SupportPanel /></div>
        )}

        {active === 'policies' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6" data-testid="panel-policies">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-indigo-600" />
              <h3 className="font-display font-bold text-lg">Legal &amp; policies</h3>
            </div>
            <ul className="divide-y divide-slate-100">
              {[
                { title: 'Terms & Conditions', desc: 'Rules of using Prize League', href: '/terms' },
                { title: 'Privacy Policy', desc: 'How we handle your data', href: '/privacy' },
                { title: 'Cookies Policy', desc: 'Cookies we use and why', href: '/cookies' },
                { title: 'Responsible Play', desc: 'Play safely and know your limits', href: '/responsible' },
                { title: 'Complaints Procedure', desc: 'How to raise a formal complaint', href: '/complaints' },
                { title: 'Refund Policy', desc: 'When and how refunds are processed', href: '/refunds' },
              ].map(p => (
                <li key={p.title} className="py-3 flex items-center justify-between hover:bg-slate-50 -mx-2 px-2 rounded">
                  <div>
                    <div className="font-medium text-slate-900">{p.title}</div>
                    <div className="text-xs text-slate-500">{p.desc}</div>
                  </div>
                  <a href={p.href} className="text-sm text-indigo-600 font-semibold inline-flex items-center gap-1">
                    Read <ArrowRight className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {active === 'preferences' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6" data-testid="panel-preferences">
            <div className="flex items-center gap-2 mb-4">
              <Settings2 className="w-5 h-5 text-stone-600" />
              <h3 className="font-display font-bold text-lg">Notifications &amp; account</h3>
            </div>
            <div className="space-y-4">
              {[
                { key: 'newsletter', label: 'Weekly newsletter', desc: 'Big prize drops + new games' },
                { key: 'win_email', label: 'Win notifications', desc: 'Email me when I win a prize' },
                { key: 'reminder_email', label: 'Draw reminders', desc: 'Notify me when a contest I entered is closing' },
              ].map(p => (
                <label key={p.key} className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <div className="font-medium text-sm">{p.label}</div>
                    <div className="text-xs text-slate-500">{p.desc}</div>
                  </div>
                  <input type="checkbox" defaultChecked className="w-4 h-4 accent-orange-500" />
                </label>
              ))}
            </div>
            <div className="border-t border-slate-100 mt-6 pt-6">
              <h4 className="font-display font-bold text-sm text-rose-700 mb-2">Danger zone</h4>
              <p className="text-sm text-slate-500 mb-3">Permanently delete your account and all data. This cannot be undone.</p>
              <Button
                variant="outline"
                className="border-rose-200 text-rose-600 hover:bg-rose-50"
                onClick={() => toast({ title: 'Contact support', description: 'To delete your account, please email support@prizeleague.co.uk from your registered address.' })}
                data-testid="delete-account-btn"
              >
                Request account deletion
              </Button>
            </div>
          </div>
        )}

        {active === 'referrals' && (
          <div className="space-y-6" data-testid="panel-referrals">
            <div className="bg-gradient-to-br from-rose-500 via-red-500 to-orange-500 text-white rounded-2xl p-6 shadow-xl">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <div className="text-white/85 text-xs uppercase tracking-wider">Free tickets earned</div>
                  <div className="font-display text-4xl font-extrabold">{referral?.tickets_earned ?? 0}</div>
                </div>
                <div>
                  <div className="text-white/85 text-xs uppercase tracking-wider">Completed</div>
                  <div className="font-display text-4xl font-extrabold">{referral?.completed ?? 0}</div>
                </div>
                <div>
                  <div className="text-white/85 text-xs uppercase tracking-wider">Pending</div>
                  <div className="font-display text-4xl font-extrabold">{referral?.pending ?? 0}</div>
                </div>
              </div>
              <div className="mt-6 bg-white/10 backdrop-blur rounded-xl p-4">
                <div className="text-xs uppercase text-white/85 mb-2">Your referral link — share it</div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 bg-black/30 rounded-lg px-3 py-2 font-mono text-sm text-amber-200 overflow-hidden text-ellipsis whitespace-nowrap">
                    {referral ? `${window.location.origin}/?ref=${referral.code}` : 'Loading…'}
                  </div>
                  <Button onClick={copyReferralLink} data-testid="account-referral-copy" className="bg-white text-slate-900 hover:bg-white/90">
                    {copiedRef ? <><Check className="w-4 h-4 mr-1" /> Copied</> : <><Copy className="w-4 h-4 mr-1" /> Copy</>}
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6">
              <h3 className="font-display font-bold text-lg mb-3">People you&apos;ve invited</h3>
              {referralList.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-6">
                  You haven&apos;t invited anyone yet. Share your link above to start earning.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {referralList.map(r => (
                    <li key={r.referral_id} className="py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-500 text-white text-sm font-bold flex items-center justify-center">
                        {(r.referred_name || r.referred_email || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{r.referred_name || 'Friend'}</div>
                        <div className="text-xs text-slate-500">{r.referred_email}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'completed' ? 'Completed +1 ticket' : 'Pending'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sign out confirmation */}
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent data-testid="signout-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of Prize League?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll need to sign in again to access your account, wallet and tickets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="signout-cancel">Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              data-testid="signout-confirm-btn"
              onClick={doLogout}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
