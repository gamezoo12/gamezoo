import { useEffect, useState } from 'react';
import { ordersAPI, userAPI, walletAPI, referralAPI, paymentsAPI } from '../lib/api';
import WalletPanel from '../components/account/WalletPanel';
import SupportPanel from '../components/account/SupportPanel';
import MyGamesPanel from '../components/account/MyGamesPanel';
import {
  User, Wallet, Ticket, Gamepad2, Bell, ShieldCheck, Lock,
  LifeBuoy, FileText, Settings2, Gift, LogOut, ArrowRight,
  Trophy, Copy, Check, Clock, AlertCircle, Mail, ChevronRight, Upload, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
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
  { id: 'profile',       label: 'Profile',        Icon: User,        color: 'from-violet-500 to-purple-600',   ring: 'ring-violet-400/40', hero: true },
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
  const { section } = useParams();
  const { toast } = useToast();

  const active = section || null;   // null → show tab list; else show selected panel
  const [signOutOpen, setSignOutOpen] = useState(false);

  const [tickets, setTickets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [kyc, setKyc] = useState({ status: 'none' });
  const [profile, setProfile] = useState({ name: '', email: '', phone: '', username: '', user_id: '', public_id: '', dob: '', address: '', phone_verified: false });
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
        user_id: me.user_id || '',
        public_id: me.public_id || '',
        dob: me.dob || '',
        address: me.address || '',
        phone_verified: !!me.phone_verified,
      }))
      .catch(() => setProfile(p => ({ ...p, name: user.name || '', email: user.email || '', username: user.username || '', user_id: user.user_id || '', public_id: user.public_id || '', phone_verified: !!user.phone_verified })));
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

  const [kycFiles, setKycFiles] = useState({ passport: null, address_proof: null });
  const [kycUrls, setKycUrls] = useState({ passport_url: '', address_proof_url: '' });
  const [uploadingKyc, setUploadingKyc] = useState({ passport: false, address_proof: false });

  const uploadKycFile = async (kind, file) => {
    if (!file) return;
    setUploadingKyc(u => ({ ...u, [kind]: true }));
    try {
      const r = await userAPI.kycUpload(kind, file);
      setKycUrls(u => ({ ...u, [`${kind}_url`]: r.url }));
      setKycFiles(f => ({ ...f, [kind]: file.name }));
      toast({ title: `${kind === 'passport' ? 'ID' : 'Address proof'} uploaded`, description: 'File attached to your submission.' });
    } catch (err) {
      toast({ title: 'Upload failed', description: err?.response?.data?.detail || err.message });
    } finally {
      setUploadingKyc(u => ({ ...u, [kind]: false }));
    }
  };

  const submitKyc = async (e) => {
    e.preventDefault();
    setKycBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const data = Object.fromEntries(fd.entries());
      if (kycUrls.passport_url) data.passport_url = kycUrls.passport_url;
      if (kycUrls.address_proof_url) data.address_proof_url = kycUrls.address_proof_url;
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
      nav('/my-account/wallet', { replace: true });
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
          nav('/my-account/wallet', { replace: true });
          return;
        }
        if (s.payment_status === 'failed' || s.payment_status === 'expired') {
          toast({ title: 'Payment did not complete', description: `Status: ${s.payment_status}` });
          nav('/my-account/wallet', { replace: true });
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
    // Each token opens as its own dedicated page
    nav(`/my-account/${id}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  if (loading || !user) {
    return <div className="max-w-6xl mx-auto p-10 text-slate-500">Loading…</div>;
  }
  const isPasswordAccount = user.method !== 'google';

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6" data-testid="my-account-page">
      <BackButton to={active ? '/my-account' : '/'} label={active ? 'Back to menu' : 'Back to home'} className="mb-4" />

      {/* MENU MODE — 12 stacked full-width tabs, only shown on /my-account root */}
      {!active && (
        <div
          className="flex flex-col gap-2.5 mb-8"
          data-testid="account-tokens"
        >
          {TOKENS.map(t => {
            const isProfile = t.id === 'profile';
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectToken(t.id)}
                data-testid={`token-${t.id}`}
                className={`group relative overflow-hidden w-full flex items-center gap-4 rounded-2xl bg-gradient-to-r ${t.color} text-white pl-4 pr-5 text-left transition-all duration-200 shadow-md hover:shadow-xl hover:translate-x-1 focus:outline-none focus-visible:ring-4 ${t.ring} ${isProfile ? 'py-6 sm:py-7' : 'py-4'}`}
              >
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl opacity-60 group-hover:opacity-100 transition-opacity" />
                <div className={`relative rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0 border border-white/25 ${isProfile ? 'w-16 h-16 sm:w-20 sm:h-20' : 'w-11 h-11 sm:w-12 sm:h-12'}`}>
                  {isProfile ? (
                    <span className="text-2xl sm:text-3xl font-extrabold">
                      {(profile.name || user.name || 'U').slice(0, 1).toUpperCase()}
                    </span>
                  ) : (
                    <t.Icon className="w-5 h-5 sm:w-6 sm:h-6 drop-shadow" />
                  )}
                </div>
                <div className="relative flex-1 min-w-0">
                  {isProfile ? (
                    <>
                      <div className="font-display font-extrabold text-lg sm:text-2xl leading-tight truncate">
                        {profile.name || user.name || 'Player'}
                      </div>
                      <div className="text-white/90 text-sm sm:text-base font-mono truncate">
                        @{profile.username || '—'}
                      </div>
                      <div className="text-white/70 text-[10px] sm:text-xs font-mono truncate mt-0.5">
                        ID: {profile.public_id || 'PL——'}
                      </div>
                    </>
                  ) : (
                    <div className="font-display font-extrabold text-base sm:text-lg leading-tight">
                      {t.label}
                    </div>
                  )}
                </div>
                <ChevronRight className={`relative opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ${isProfile ? 'w-6 h-6' : 'w-5 h-5'}`} />
              </button>
            );
          })}
        </div>
      )}

      {/* PANEL MODE — single-focus page for the selected section */}
      {active && (
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
                <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate" data-testid="profile-user-id">
                  ID: {profile.public_id || 'PL——'}
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
                {tickets.map(t => {
                  const c = t.contest || {};
                  const isSkill = (c.entry_mode || 'skill_game') === 'skill_game';
                  const canPlay = isSkill && c.status !== 'ended' && c.status !== 'closed';
                  return (
                  <div key={t.ticket_id} className="border border-slate-100 rounded-xl overflow-hidden bg-white flex flex-col" data-testid={`ticket-card-${t.ticket_id}`}>
                    {c.image && (
                      <div className="h-24 bg-slate-100 overflow-hidden">
                        <img src={c.image} alt={c.title || ''} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className="p-3 flex-1 flex flex-col">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Ticket #{t.ticket_number}</div>
                      <div className="font-bold text-slate-900 text-sm mt-0.5 line-clamp-2">{c.title || 'Contest'}</div>
                      {c.prize_title && <div className="text-[11px] text-slate-500 mt-0.5">🎁 {c.prize_title}</div>}
                      <div className="mt-3 flex gap-2">
                        {canPlay ? (
                          <Link to={`/play/${t.ticket_id}`} className="flex-1">
                            <Button size="sm" className="w-full pl-btn-gold text-slate-900 font-extrabold h-8" data-testid={`ticket-play-${t.ticket_id}`}>
                              <Sparkles className="w-3 h-3 mr-1" /> Play now
                            </Button>
                          </Link>
                        ) : (
                          <Link to={c.slug ? `/contests/${c.slug}` : '/contests'} className="flex-1">
                            <Button size="sm" variant="outline" className="w-full h-8" data-testid={`ticket-view-${t.ticket_id}`}>View contest</Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );})}
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

                  <div className="md:col-span-2 grid sm:grid-cols-2 gap-3 pt-2">
                    <label className={`flex flex-col gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer transition ${kycUrls.passport_url ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40'}`}>
                      <div className="flex items-center gap-2">
                        <Upload className="w-5 h-5 text-emerald-600" />
                        <span className="text-sm font-semibold text-slate-900">ID / Passport photo</span>
                      </div>
                      <div className="text-xs text-slate-500">JPG, PNG, WEBP or PDF · max 8 MB</div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadKycFile('passport', e.target.files[0])}
                        data-testid="kyc-upload-passport"
                      />
                      <div className="text-xs mt-1 truncate">
                        {uploadingKyc.passport ? <span className="text-amber-600">Uploading…</span> :
                          kycFiles.passport ? <span className="text-emerald-700 font-medium">✓ {kycFiles.passport}</span> :
                          <span className="text-slate-400">Click to select a file</span>}
                      </div>
                    </label>

                    <label className={`flex flex-col gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer transition ${kycUrls.address_proof_url ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40'}`}>
                      <div className="flex items-center gap-2">
                        <Upload className="w-5 h-5 text-emerald-600" />
                        <span className="text-sm font-semibold text-slate-900">Address proof</span>
                      </div>
                      <div className="text-xs text-slate-500">Utility bill / bank statement, &lt; 3 months old</div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadKycFile('address_proof', e.target.files[0])}
                        data-testid="kyc-upload-address"
                      />
                      <div className="text-xs mt-1 truncate">
                        {uploadingKyc.address_proof ? <span className="text-amber-600">Uploading…</span> :
                          kycFiles.address_proof ? <span className="text-emerald-700 font-medium">✓ {kycFiles.address_proof}</span> :
                          <span className="text-slate-400">Click to select a file</span>}
                      </div>
                    </label>
                  </div>

                  <div className="md:col-span-2">
                    <Button type="submit" disabled={kycBusy} className="bg-emerald-600 hover:bg-emerald-700" data-testid="kyc-submit-btn">
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
                { title: 'Terms & Conditions', desc: 'Rules of using Prize League', href: '/legal/terms' },
                { title: 'Privacy Policy', desc: 'How we handle your data', href: '/legal/privacy' },
                { title: 'Cookie Policy', desc: 'Cookies we use and why', href: '/legal/cookies' },
                { title: 'Responsible Participation', desc: 'Play safely and know your limits', href: '/legal/responsible' },
                { title: 'Complaints Procedure', desc: 'How to raise a formal complaint', href: '/legal/complaints' },
                { title: 'Refund Policy', desc: 'When and how refunds are processed', href: '/legal/refunds' },
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
      )}

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
