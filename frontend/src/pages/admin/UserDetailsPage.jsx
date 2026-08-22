import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/use-toast';
import BackButton from '../../components/BackButton';
import { gbp } from '../../lib/format';
import {
  User as UserIcon, ShieldCheck, Wallet, Ticket, Trophy, LifeBuoy,
  AlertTriangle, Ban, RotateCcw, Trash2, Clock, Mail, Gift, CheckCircle2,
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


function ProfileManagementCard({ userId, identity, onReload }) {
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  const makeForm = () => ({
    name: identity?.name || '',
    username: identity?.username || '',
    email: identity?.email || '',
    phone: identity?.phone || '',
    dob: identity?.dob || '',
    address: identity?.address || '',
    picture: identity?.picture || '',
  });

  const [form, setForm] = useState(makeForm);

  useEffect(() => {
    setForm({
      name: identity?.name || '',
      username: identity?.username || '',
      email: identity?.email || '',
      phone: identity?.phone || '',
      dob: identity?.dob || '',
      address: identity?.address || '',
      picture: identity?.picture || '',
    });

    setOtp('');
    setOtpSent(false);
  }, [
    identity?.name,
    identity?.username,
    identity?.email,
    identity?.phone,
    identity?.dob,
    identity?.address,
    identity?.picture,
  ]);

  const change = (field, value) => {
    setForm(current => ({
      ...current,
      [field]: value,
    }));
  };

  const cancelEdit = () => {
    setForm(makeForm());
    setEditing(false);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({
        title: 'Name required',
        description: 'The user name cannot be empty.',
      });
      return;
    }

    if (!form.email.trim()) {
      toast({
        title: 'Email required',
        description: 'Enter a valid email address.',
      });
      return;
    }

    try {
      setSaving(true);

      await adminAPI.updateUser(userId, {
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        dob: form.dob || null,
        address: form.address.trim(),
        picture: form.picture.trim(),
      });

      toast({
        title: 'Profile updated',
        description: 'User profile changes were saved and audited.',
      });

      setEditing(false);
      setOtp('');
      setOtpSent(false);

      await onReload();
    } catch (e) {
      toast({
        title: 'Profile update failed',
        description:
          e?.response?.data?.detail ||
          'Unable to update the user profile.',
      });
    } finally {
      setSaving(false);
    }
  };

  const sendOtp = async () => {
    try {
      setSendingOtp(true);

      const result = await adminAPI.sendUserPhoneOtp(userId);

      if (result?.already_verified) {
        toast({
          title: 'Already verified',
          description: 'This phone number is already verified.',
        });

        await onReload();
        return;
      }

      setOtpSent(true);

      toast({
        title: 'Verification code sent',
        description:
          'Ask the user for the SMS verification code, then enter it below.',
      });
    } catch (e) {
      toast({
        title: 'Could not send OTP',
        description:
          e?.response?.data?.detail ||
          'SMS verification could not be sent.',
      });
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    const code = otp.trim();

    if (!code) {
      toast({
        title: 'Enter verification code',
      });
      return;
    }

    try {
      setVerifyingOtp(true);

      await adminAPI.verifyUserPhoneOtp(
        userId,
        code
      );

      toast({
        title: 'Phone verified',
        description:
          'Twilio approved the verification code and the user is now verified.',
      });

      setOtp('');
      setOtpSent(false);

      await onReload();
    } catch (e) {
      toast({
        title: 'Verification failed',
        description:
          e?.response?.data?.detail ||
          'The verification code was not accepted.',
      });
    } finally {
      setVerifyingOtp(false);
    }
  };

  return (
    <div
      className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
      data-testid="admin-profile-management"
    >
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-extrabold text-lg">
            Profile Management
          </h3>

          <p className="text-xs text-slate-500 mt-1">
            Edit account identity and manage verified phone status.
          </p>
        </div>

        {!editing ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={!!identity?.erased}
            data-testid="edit-user-profile"
          >
            Edit Profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              size="sm"
              onClick={save}
              disabled={saving}
              data-testid="save-user-profile"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>

      <div className="p-5 space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          {[
            ['Full Name', 'name', 'text'],
            ['Username', 'username', 'text'],
            ['Email', 'email', 'email'],
            ['Phone', 'phone', 'tel'],
            ['Date of Birth', 'dob', 'date'],
            ['Profile Picture URL', 'picture', 'url'],
          ].map(([label, field, type]) => (
            <div key={field}>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                {label}
              </label>

              {editing ? (
                <Input
                  type={type}
                  value={form[field]}
                  onChange={e =>
                    change(field, e.target.value)
                  }
                  data-testid={`edit-user-${field}`}
                />
              ) : (
                <div className="min-h-10 px-3 py-2 rounded-md bg-slate-50 border border-slate-100 text-sm break-all">
                  {identity?.[field] || '—'}
                </div>
              )}
            </div>
          ))}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">
            Address
          </label>

          {editing ? (
            <textarea
              value={form.address}
              onChange={e =>
                change('address', e.target.value)
              }
              rows={3}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C2BFF]/20"
              data-testid="edit-user-address"
            />
          ) : (
            <div className="min-h-10 px-3 py-2 rounded-md bg-slate-50 border border-slate-100 text-sm">
              {identity?.address || '—'}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-sm">
                  Email Verification
                </div>

                <div className="text-xs text-slate-500 mt-1 break-all">
                  {identity?.email || 'No email'}
                </div>
              </div>

              {identity?.email_verified ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                  Verified
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                  Unverified
                </span>
              )}
            </div>

            {!identity?.email_verified && (
              <p className="text-xs text-slate-500 mt-3">
                No manual verification is available. Email verification
                requires a production email verification provider.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-sm">
                  Phone Verification
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  {identity?.phone || 'No phone number'}
                </div>
              </div>

              {identity?.phone_verified ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                  Verified
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                  Unverified
                </span>
              )}
            </div>

            {!identity?.phone_verified &&
             identity?.phone &&
             !identity?.erased && (
              <div className="mt-4 space-y-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendOtp}
                  disabled={sendingOtp}
                  data-testid="send-user-phone-otp"
                >
                  {sendingOtp
                    ? 'Sending…'
                    : otpSent
                    ? 'Resend SMS Code'
                    : 'Send SMS Verification Code'}
                </Button>

                {otpSent && (
                  <div className="flex gap-2">
                    <Input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Enter SMS code"
                      value={otp}
                      onChange={e =>
                        setOtp(
                          e.target.value
                            .replace(/\D/g, '')
                            .slice(0, 10)
                        )
                      }
                      data-testid="user-phone-otp-code"
                    />

                    <Button
                      onClick={verifyOtp}
                      disabled={
                        verifyingOtp ||
                        !otp.trim()
                      }
                      data-testid="verify-user-phone-otp"
                    >
                      {verifyingOtp
                        ? 'Verifying…'
                        : 'Verify'}
                    </Button>
                  </div>
                )}

                <p className="text-[11px] text-slate-500">
                  Verification is completed only after Twilio accepts
                  the SMS code. Admin cannot bypass this step.
                </p>
              </div>
            )}
          </div>
        </div>

        {(identity?.phone_verified_at ||
          identity?.email_verified_at) && (
          <div className="text-xs text-slate-500 border-t pt-4">
            {identity?.phone_verified_at && (
              <div>
                Phone verified:{' '}
                {new Date(
                  identity.phone_verified_at
                ).toLocaleString('en-GB')}
              </div>
            )}

            {identity?.email_verified_at && (
              <div>
                Email verified:{' '}
                {new Date(
                  identity.email_verified_at
                ).toLocaleString('en-GB')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


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

  const {
    identity, kyc, wallet, stats, orders, tickets, scores,
    wallet_transactions, notifications, support_cases, referrals,
    referral_joined_via, referrer_user, signup_bonus,
    sessions, admin_actions
  } = data;
  const suspended = !!identity.suspended;
  const erased = !!identity.erased;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="user-360-page">

      <ProfileManagementCard
        userId={user_id}
        identity={data?.identity || {}}
        onReload={load}
      />

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

      <Section title="Bonuses & Referrals" icon={Gift}>
        <div className="grid md:grid-cols-2 gap-5">

          {/* Signup bonus */}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="font-bold text-sm mb-3">Signup bonus</div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Offer eligible</span>
                <span className="font-semibold">
                  {signup_bonus?.eligible ? 'Yes' : 'No'}
                </span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Required top-up</span>
                <span className="font-semibold">£10+ in one verified payment</span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Qualifying top-up</span>
                <span className={signup_bonus?.qualifying_topup_completed ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                  {signup_bonus?.qualifying_topup_completed
                    ? `Completed${signup_bonus?.qualifying_topup_amount_gbp != null ? ` · ${gbp(signup_bonus.qualifying_topup_amount_gbp)}` : ''}`
                    : 'Waiting'}
                </span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-slate-500">5-token bonus</span>
                <span className={signup_bonus?.granted ? 'text-emerald-700 font-semibold' : 'text-slate-600 font-semibold'}>
                  {signup_bonus?.granted
                    ? `Granted · ${signup_bonus?.tokens || 5} tokens`
                    : 'Not granted'}
                </span>
              </div>

              {signup_bonus?.granted_at && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Granted at</span>
                  <span>{new Date(signup_bonus.granted_at).toLocaleString('en-GB')}</span>
                </div>
              )}

              {signup_bonus?.tx_id && (
                <div>
                  <div className="text-slate-500">Reward transaction</div>
                  <div className="font-mono break-all mt-0.5">{signup_bonus.tx_id}</div>
                </div>
              )}

              {signup_bonus?.qualifying_topup_session_id && (
                <div>
                  <div className="text-slate-500">Qualifying Stripe session</div>
                  <div className="font-mono break-all mt-0.5">
                    {signup_bonus.qualifying_topup_session_id}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* How this user joined */}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="font-bold text-sm mb-3">Joined via referral</div>

            {!referral_joined_via ? (
              <div className="text-xs text-slate-400">
                This user did not register through a referral.
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Referral code</span>
                  <span className="font-mono font-semibold">
                    {referral_joined_via.code || '—'}
                  </span>
                </div>

                <div>
                  <div className="text-slate-500">Invited by</div>
                  <div className="font-semibold mt-0.5">
                    {referrer_user?.name || 'Unknown user'}
                  </div>
                  <div className="text-slate-500">
                    {referrer_user?.public_id || referrer_user?.email || ''}
                  </div>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">£10 top-up</span>
                  <span className={referral_joined_via.topup_qualified ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    {referral_joined_via.topup_qualified ? 'Completed' : 'Waiting'}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Contest entry</span>
                  <span className={referral_joined_via.contest_entered ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    {referral_joined_via.contest_entered ? 'Completed' : 'Waiting'}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Referrer reward</span>
                  <span className={referral_joined_via.reward_granted ? 'text-emerald-700 font-semibold' : 'text-slate-600 font-semibold'}>
                    {referral_joined_via.reward_granted
                      ? `${referral_joined_via.reward_tokens || 5} tokens granted`
                      : 'Not granted'}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Status</span>
                  <span className="font-semibold">
                    {referral_joined_via.status || 'pending'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Referrals made by this user */}
        <div className="mt-5">
          <div className="font-bold text-sm mb-3">
            Referrals made by this user ({referrals?.length || 0})
          </div>

          {!referrals?.length ? (
            <div className="text-xs text-slate-400">
              No users referred yet.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2">User</th>
                    <th className="text-left px-3 py-2">Code</th>
                    <th className="text-left px-3 py-2">£10 top-up</th>
                    <th className="text-left px-3 py-2">Contest</th>
                    <th className="text-left px-3 py-2">Reward</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {referrals.map((r, i) => (
                    <tr key={r.referral_id || i} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-semibold">
                          {r.referred_name || r.referred_public_id || 'User'}
                        </div>
                        <div className="text-slate-400">
                          {r.referred_email || r.referred_user_id}
                        </div>
                      </td>

                      <td className="px-3 py-2 font-mono">{r.code || '—'}</td>

                      <td className="px-3 py-2">
                        {r.topup_qualified
                          ? <span className="text-emerald-700 font-semibold">✓ Complete</span>
                          : <span className="text-amber-700">Waiting</span>}
                      </td>

                      <td className="px-3 py-2">
                        {r.contest_entered
                          ? <span className="text-emerald-700 font-semibold">✓ Complete</span>
                          : <span className="text-amber-700">Waiting</span>}
                      </td>

                      <td className="px-3 py-2">
                        {r.reward_granted
                          ? <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              {r.reward_tokens || 5} tokens
                            </span>
                          : '—'}
                      </td>

                      <td className="px-3 py-2 font-semibold">
                        {r.display_status || r.status || 'pending'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

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
          <DialogHeader><DialogTitle>{suspended ? 'Reinstate user' : 'Suspend user'}</DialogTitle>
          <DialogDescription>{suspended ? 'Restore this account. The user will be able to sign in again.' : 'This closes the user out of the platform. Reversible from this page.'}</DialogDescription>
          </DialogHeader>
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
          <DialogHeader><DialogTitle className="text-rose-700 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Permanent erasure</DialogTitle>
          <DialogDescription>Personal data will be removed. Financial, tax and audit records are retained per Data Retention Policy. This is irreversible.</DialogDescription>
          </DialogHeader>
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
