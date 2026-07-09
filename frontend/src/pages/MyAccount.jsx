import { useEffect, useState } from 'react';
import { ordersAPI, userAPI } from '../lib/api';
import { gbp } from '../lib/format';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Wallet, Ticket, Award, User, ShieldCheck, Clock, AlertCircle,
  LogOut, Bell, Lock, Mail, Phone, Trophy, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
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

export default function MyAccount() {
  const { user, loading, logout, refresh } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [orders, setOrders] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [kyc, setKyc] = useState({ status: 'none' });
  const [profile, setProfile] = useState({ name: '', email: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [kycBusy, setKycBusy] = useState(false);

  useEffect(() => {
    if (loading) return undefined;
    if (!user) { nav('/login', { replace: true }); return undefined; }
    setProfile({ name: user.name || '', email: user.email || '', phone: user.phone || '' });
    ordersAPI.mine().then(setOrders).catch((err) => console.error('[account] orders:', err?.message));
    ordersAPI.myTickets().then(setTickets).catch((err) => console.error('[account] tickets:', err?.message));
    userAPI.kycStatus().then(setKyc).catch((err) => console.error('[account] kyc:', err?.message));
    userAPI.notifications().then((r) => setNotifications(r?.notifications || [])).catch(() => {});
    return undefined;
  }, [user, loading, nav]);

  const doLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const goAdmin = async () => {
    await logout();
    window.location.href = '/admin/login';
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await userAPI.updateMe({ name: profile.name, phone: profile.phone, email: profile.email });
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

  if (loading || !user) return <div className="max-w-6xl mx-auto p-10 text-slate-500">Loading…</div>;
  const totalSpent = orders.reduce((s, o) => s + (o.total || 0), 0);
  const initials = (user.name || user.email || 'U').slice(0, 1).toUpperCase();
  const isPasswordAccount = user.method !== 'google';

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8" data-testid="my-account-page">
      <BackButton to="/" label="Back to home" className="mb-4" />

      {/* Header card with avatar + name + explicit action buttons */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 md:p-8 mb-8 shadow-2xl overflow-hidden relative">
        <div className="absolute -top-16 -right-16 w-60 h-60 bg-teal-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -left-10 w-60 h-60 bg-fuchsia-500/15 rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-3xl font-extrabold shrink-0">{initials}</div>
          <div className="flex-1">
            <h1 className="font-display text-3xl font-extrabold">Hi, {user.name} 👋</h1>
            <div className="text-slate-300 mt-1 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {user.email}</span>
              <KycBadge status={kyc.status} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={goAdmin}
              data-testid="account-go-admin"
              variant="outline"
              className="border-teal-400/50 text-teal-300 bg-teal-400/10 hover:bg-teal-400/20 hover:text-white"
            >
              <ShieldCheck className="w-4 h-4 mr-1" /> Sign out → Admin
            </Button>
            <Button
              onClick={doLogout}
              data-testid="account-signout"
              className="bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30"
            >
              <LogOut className="w-4 h-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total spent', value: gbp(totalSpent), Icon: Wallet, color: 'from-teal-500 to-emerald-500' },
          { label: 'Active tickets', value: tickets.length, Icon: Ticket, color: 'from-orange-500 to-rose-500' },
          { label: 'Orders', value: orders.length, Icon: Award, color: 'from-amber-400 to-orange-500' },
          { label: 'Notifications', value: notifications.length, Icon: Bell, color: 'from-fuchsia-500 to-pink-500' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-5 text-white bg-gradient-to-br ${s.color} shadow-lg`}>
            <s.Icon className="w-6 h-6 opacity-80" />
            <div className="mt-3 text-2xl font-extrabold font-display capitalize">{s.value}</div>
            <div className="text-sm opacity-90">{s.label}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="profile">
        <TabsList data-testid="account-tabs">
          <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">Security</TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-tickets">My Tickets</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">Notifications</TabsTrigger>
          <TabsTrigger value="verify" data-testid="tab-verify">Identity (KYC)</TabsTrigger>
        </TabsList>

        {/* PROFILE */}
        <TabsContent value="profile">
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h3 className="font-display font-bold text-lg mb-1">Personal details</h3>
            <p className="text-sm text-slate-500 mb-5">Keep your account info up-to-date so we can pay you out and email winners.</p>
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
                <Label>Phone (optional)</Label>
                <Input data-testid="profile-phone" type="tel" value={profile.phone || ''} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+44 …" />
              </div>
              <div>
                <Label>Account type</Label>
                <Input value={user.method === 'google' ? 'Google (social login)' : 'Email + password'} disabled />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={savingProfile} data-testid="save-profile-btn" className="bg-teal-600 hover:bg-teal-700">
                  {savingProfile ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        {/* SECURITY */}
        <TabsContent value="security">
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h3 className="font-display font-bold text-lg mb-1 flex items-center gap-2"><Lock className="w-5 h-5 text-teal-600" /> Change password</h3>
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
                  <Button type="submit" disabled={savingPw} data-testid="change-password-btn" className="bg-teal-600 hover:bg-teal-700">
                    {savingPw ? 'Updating…' : 'Update password'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                You signed in with Google — password is managed by Google. Manage it at
                <a className="text-teal-600 hover:underline ml-1" href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">Google Account Security</a>.
              </div>
            )}

            <div className="border-t border-slate-100 mt-8 pt-6">
              <h4 className="font-display font-bold text-sm text-slate-800 mb-2">Sessions</h4>
              <p className="text-sm text-slate-500 mb-3">Sign out of this device instantly.</p>
              <Button onClick={doLogout} variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" data-testid="security-signout">
                <LogOut className="w-4 h-4 mr-1" /> Sign out now
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* TICKETS */}
        <TabsContent value="tickets">
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            {tickets.length === 0 ? (
              <div className="py-8 text-center">
                <Ticket className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">You have no tickets yet.</p>
                <a href="/competitions" className="inline-flex items-center gap-1 text-teal-600 font-semibold mt-2">Browse contests <ArrowRight className="w-4 h-4" /></a>
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
        </TabsContent>

        {/* ORDERS */}
        <TabsContent value="orders">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 overflow-x-auto">
            {orders.length === 0 ? (
              <div className="py-8 text-center">
                <Award className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No orders yet.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-left">
                  <tr><th className="py-2">Order</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.order_id} className="border-t border-slate-100">
                      <td className="py-2 text-teal-600 font-mono">#{o.order_id.slice(0, 8)}</td>
                      <td>{o.items.length}</td>
                      <td className="font-semibold">{gbp(o.total)}</td>
                      <td><span className={`text-xs px-2 py-0.5 rounded-full ${o.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{o.status}</span></td>
                      <td className="text-slate-500">{new Date(o.created_at).toLocaleDateString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications">
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
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
        </TabsContent>

        {/* KYC */}
        <TabsContent value="verify">
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-teal-600" />
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
                    <Button type="submit" disabled={kycBusy} className="bg-teal-600 hover:bg-teal-700">
                      {kycBusy ? 'Submitting…' : (kyc.status === 'pending' || kyc.status === 'rejected' ? 'Re-submit verification' : 'Submit verification')}
                    </Button>
                  </div>
                </form>
                {kyc.status === 'rejected' && <p className="mt-3 text-sm text-rose-600">Rejected: {kyc.reject_reason}. Please correct and resubmit.</p>}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
