import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, adminAPI, cashoutAPI } from '../../lib/api';
import PromotionsConsent, { PROMO_OPTIONS } from '../../components/account/PromotionsConsent';
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
  Map as MapIcon, Coins, Swords,
} from 'lucide-react';

const Section = ({ title, icon: Icon, children, hidden = false }) => (
  <section hidden={hidden} className={`bg-white rounded-2xl border border-slate-200 p-5 ${hidden ? 'hidden' : ''}`}>
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

const newWalletAdjustmentId = () => globalThis.crypto?.randomUUID?.()
  || `admin-adjust-${Date.now()}-${Math.random().toString(36).slice(2)}`;


function AdminPromotionsCard({ userId }) {
  const { toast } = useToast();
  const [view, setView] = useState(null);
  const [values, setValues] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    adminAPI.userPromotionsConsent(userId).then(r => { if (live) { setView(r); setValues(r.preferences); } }).catch(() => {});
    return () => { live = false; };
  }, [userId]);

  const enabling = view && values && PROMO_OPTIONS.some(o => values[o.key] && !view.preferences[o.key]);
  const save = async () => {
    setSaving(true);
    try {
      const changed = Object.fromEntries(PROMO_OPTIONS.filter(o => values[o.key] !== view.preferences[o.key]).map(o => [o.key, values[o.key]]));
      if (!Object.keys(changed).length) { toast({ title: 'No changes to save' }); return; }
      const r = await adminAPI.saveUserPromotionsConsent(userId, { ...changed, reason: reason.trim() });
      setView(r); setValues(r.preferences); setReason('');
      toast({ title: 'Communication preferences saved' });
    } catch (e) {
      toast({ title: 'Could not save preferences', description: e?.response?.data?.detail || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const webState = { awaiting_user_subscription: 'Waiting for the user to allow notifications in their browser', browser_permission_denied: 'User has blocked browser notifications', not_opted_in: null }[view?.web_notifications_status];
  return (
    <div className="rounded-xl border border-slate-100 p-4" data-testid="admin-promotions-consent-card">
      {!values ? <div className="h-32 animate-pulse rounded-lg bg-slate-100" /> : (
        <>
          <PromotionsConsent values={values} onChange={setValues} showSave={false} disabled={saving} testid="admin-promotions" />
          {values.web_notifications && webState && <p className="mt-2 text-xs text-amber-700" data-testid="admin-web-notifications-status">{webState}</p>}
          {view?.sources && Object.values(view.sources).includes('admin') && <p className="mt-2 text-xs text-slate-500">Set by admin: {PROMO_OPTIONS.filter(o => view.sources[o.key] === 'admin').map(o => o.label).join(', ')}</p>}
          {enabling && <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (10+ characters)" className="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" data-testid="admin-promotions-reason" />}
          <Button size="sm" className="mt-3" onClick={save} disabled={saving || (enabling && reason.trim().length < 10)} data-testid="admin-promotions-save">{saving ? 'Saving…' : 'Save Preferences'}</Button>
        </>
      )}
    </div>
  );
}

function ProfileManagementCard({ userId, identity, onReload, view = 'profile', hidden = false }) {
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [sendingEmailLink, setSendingEmailLink] = useState(false);
  const [sendingPhoneLink, setSendingPhoneLink] = useState(false);
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

  const sendContactLink = async channel => {
    const setSending = channel === 'email' ? setSendingEmailLink : setSendingPhoneLink;
    try {
      setSending(true);
      await adminAPI.sendContactVerificationLink(userId, channel);
      toast({
        title: 'Verification link sent',
        description: channel === 'email'
          ? 'A single-use link was sent to the current email address.'
          : 'A link was sent to the current phone. The user must still complete SMS OTP verification.',
      });
      await onReload();
    } catch (error) {
      toast({ title: 'Could not send verification link', description: error?.response?.data?.detail || 'Please try again.' });
    } finally {
      setSending(false);
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
      hidden={hidden}
      data-testid="admin-profile-management"
    >
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-extrabold text-lg">
            {view === 'verification' ? 'Verification' : 'Profile Management'}
          </h3>

          <p className="text-xs text-slate-500 mt-1">
            Edit account identity and manage verified phone status.
          </p>
        </div>

        {view === 'profile' && (!editing ? (
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
        ))}
      </div>

      <div className="p-5 space-y-5">
        <div hidden={view !== 'profile'}>
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

        </div>

        <div hidden={view !== 'verification'} className="space-y-5">
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

            {identity?.email && !identity?.erased && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => sendContactLink('email')} disabled={sendingEmailLink} data-testid="send-user-email-verification-link">
                {sendingEmailLink ? 'Sending…' : identity?.email_verified ? 'Resend verification link' : 'Send verification link'}
              </Button>
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

            {identity?.phone && !identity?.erased && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => sendContactLink('phone')} disabled={sendingPhoneLink} data-testid="send-user-phone-verification-link">
                {sendingPhoneLink ? 'Sending…' : identity?.phone_verified ? 'Resend verification link' : 'Send OTP verification link'}
              </Button>
            )}

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

        {!identity?.erased && <AdminPromotionsCard userId={userId} />}

        {(identity?.phone_verified_at ||
          identity?.email_verified_at) && (
          <div className="text-xs text-slate-500 border-t pt-4">
            {identity?.phone_verified_at && (
              <div>
                Phone verified:{' '}
                {new Date(
                  identity.phone_verified_at
                ).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </div>
            )}

            {identity?.email_verified_at && (
              <div>
                Email verified:{' '}
                {new Date(
                  identity.email_verified_at
                ).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
              </div>
            )}
          </div>
        )}
        </div>
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
  const [activeSection, setActiveSection] = useState('profile');
  const [walletAdjustAmount, setWalletAdjustAmount] = useState('');
  const [walletAdjustReason, setWalletAdjustReason] = useState('');
  const [walletAdjustBusy, setWalletAdjustBusy] = useState(false);
  const [walletAdjustOperationId, setWalletAdjustOperationId] = useState(newWalletAdjustmentId);
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusExpiryDays, setBonusExpiryDays] = useState('');
  const [bonusReason, setBonusReason] = useState('');
  const [bonusBusy, setBonusBusy] = useState(false);
  const [bonusBatchId, setBonusBatchId] = useState(newWalletAdjustmentId);
  const [withdrawalDetail, setWithdrawalDetail] = useState(null);
  const [withdrawalMessage, setWithdrawalMessage] = useState('');
  const [withdrawalRejectReason, setWithdrawalRejectReason] = useState('');
  const [withdrawalBusy, setWithdrawalBusy] = useState(false);

  const sections = [
    ['profile', 'Profile'],
    ['activity', 'Activity'],
    ['free-world', 'Free World'],
    ['paid-world', 'Paid World'],
    ['challenges', 'Impossible Challenges'],
    ['wallet', 'Wallet'],
    ['bonus-tokens', 'Bonus Tokens'],
    ['orders-tickets', 'Tickets & Orders'],
    ['winnings', 'Winnings'],
    ['withdrawals', 'Withdrawals'],
    ['verification', 'Verification'],
    ['referrals', 'Referrals'],
    ['audit', 'Audit History'],
  ];

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canManageUserFunds = ['admin', 'super_admin'].includes(currentUser?.role);

  const load = () => {
    setState('loading');
    api.get(`/admin/users/${user_id}/360`)
      .then(r => { setData(r.data); setState('ok'); })
      .catch(err => setState(err?.response?.status === 404 ? 'missing' : 'error'));
  };
  useEffect(load, [user_id]);
  useEffect(() => {
    setWalletAdjustAmount('');
    setWalletAdjustReason('');
    setWalletAdjustOperationId(newWalletAdjustmentId());
    setBonusAmount('');
    setBonusExpiryDays('');
    setBonusReason('');
    setBonusBatchId(newWalletAdjustmentId());
    setWithdrawalDetail(null);
  }, [user_id]);

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

  const deductBonusGrant = async grant => {
    const remaining = Number(grant.remaining_amount || 0);
    if (remaining <= 0 || grant.status !== 'active') return;
    const reason = window.prompt('Reason for deducting this grant’s unused bonus tokens (10+ characters):');
    if (!reason || reason.trim().length < 10) return;
    if (!window.confirm(`Deduct the unused ${remaining} bonus tokens from this grant? Spent tokens, purchased tokens, and winnings will not be changed.`)) return;
    try {
      await adminAPI.revokeBonusGrant(grant.grant_id, reason.trim());
      toast({ title: 'Unused bonus deducted', description: 'Only the remaining amount in this grant was removed.' });
      load();
    } catch (error) {
      toast({ title: 'Bonus deduction failed', description: error?.response?.data?.detail || 'Please try again.' });
    }
  };

  const adjustWallet = async event => {
    event.preventDefault();
    const amount = Number(walletAdjustAmount);
    const adjustmentReason = walletAdjustReason.trim();
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 500) {
      return toast({ title: 'Enter an adjustment from -500 to 500 tokens, excluding zero.' });
    }
    if (adjustmentReason.length < 10) {
      return toast({ title: 'A reason of at least 10 characters is required.' });
    }
    const direction = amount > 0 ? 'credit' : 'deduct';
    if (!window.confirm(`${direction === 'credit' ? 'Credit' : 'Deduct'} ${Math.abs(amount)} tokens? This action will be audited.`)) return;
    setWalletAdjustBusy(true);
    try {
      const result = await adminAPI.adjustUserWallet(user_id, {
        amount,
        reason: adjustmentReason,
        operation_id: walletAdjustOperationId,
      });
      toast({
        title: result.idempotent_replay ? 'Adjustment already applied' : 'Wallet adjusted',
        description: `${direction === 'credit' ? 'Credited' : 'Deducted'} ${Math.abs(amount)} tokens.`,
      });
      setWalletAdjustAmount('');
      setWalletAdjustReason('');
      setWalletAdjustOperationId(newWalletAdjustmentId());
      load();
    } catch (error) {
      toast({ title: 'Wallet adjustment failed', description: error?.response?.data?.detail || 'Retrying will use the same operation ID.' });
    } finally {
      setWalletAdjustBusy(false);
    }
  };

  const grantBonus = async event => {
    event.preventDefault();
    const amount = Number(bonusAmount);
    const expiryDays = bonusExpiryDays.trim() ? Number(bonusExpiryDays) : null;
    if (!Number.isFinite(amount) || amount <= 0) return toast({ title: 'Enter a bonus amount greater than zero.' });
    if (bonusExpiryDays.trim() && (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 3650)) {
      return toast({ title: 'Expiry must be between 1 and 3650 days.' });
    }
    if (bonusReason.trim().length < 10) return toast({ title: 'A reason of at least 10 characters is required.' });
    if (!window.confirm(`Grant ${amount} expiring bonus tokens to this user? This action will be audited.`)) return;
    setBonusBusy(true);
    try {
      const result = await adminAPI.creditBonus({
        user_ids: [user_id], amount, reason: bonusReason.trim(), confirm: true,
        batch_id: bonusBatchId, expiry_mode: expiryDays ? 'days' : 'none', expiry_days: expiryDays,
      });
      const item = result.items?.find(entry => entry.user_id === user_id);
      if (item?.status !== 'success') throw new Error(item?.reason || 'The bonus grant was not applied.');
      toast({ title: item.replayed ? 'Bonus grant already applied' : 'Bonus tokens granted' });
      setBonusAmount('');
      setBonusExpiryDays('');
      setBonusReason('');
      setBonusBatchId(newWalletAdjustmentId());
      load();
    } catch (error) {
      toast({ title: 'Bonus grant failed', description: error?.response?.data?.detail || error.message || 'Retrying will use the same batch ID.' });
    } finally {
      setBonusBusy(false);
    }
  };

  const reviewWithdrawal = async withdrawalId => {
    setWithdrawalBusy(true);
    try {
      const detail = await cashoutAPI.adminDetail(withdrawalId);
      setWithdrawalDetail(detail);
      setWithdrawalMessage(`Your ${gbp(detail.amount_gbp)} cash-out has been approved and paid successfully.`);
      setWithdrawalRejectReason('');
    } catch (error) {
      toast({ title: 'Could not load withdrawal', description: error?.response?.data?.detail || 'Please try again.' });
    } finally {
      setWithdrawalBusy(false);
    }
  };

  const markWithdrawalPaid = async () => {
    if (!withdrawalMessage.trim()) return toast({ title: 'Notification message is required.' });
    if (!window.confirm('Confirm that the bank transfer has already been sent. This only records the completed payout.')) return;
    setWithdrawalBusy(true);
    try {
      const result = await cashoutAPI.adminMarkPaid(withdrawalDetail.withdrawal_id, withdrawalMessage.trim());
      toast({ title: result.idempotent ? 'Withdrawal already processed' : 'Withdrawal marked paid' });
      setWithdrawalDetail(null);
      load();
    } catch (error) {
      toast({ title: 'Could not update withdrawal', description: error?.response?.data?.detail || 'Please try again.' });
    } finally {
      setWithdrawalBusy(false);
    }
  };

  const rejectWithdrawal = async () => {
    if (withdrawalRejectReason.trim().length < 3) return toast({ title: 'A rejection reason is required.' });
    if (!withdrawalMessage.trim()) return toast({ title: 'Notification message is required.' });
    if (!window.confirm('Reject this withdrawal and return its reserved tokens to the user?')) return;
    setWithdrawalBusy(true);
    try {
      const result = await cashoutAPI.adminReject(
        withdrawalDetail.withdrawal_id, withdrawalRejectReason.trim(), withdrawalMessage.trim(),
      );
      toast({ title: result.idempotent ? 'Withdrawal already processed' : 'Withdrawal rejected' });
      setWithdrawalDetail(null);
      load();
    } catch (error) {
      toast({ title: 'Could not update withdrawal', description: error?.response?.data?.detail || 'Please try again.' });
    } finally {
      setWithdrawalBusy(false);
    }
  };

  if (state === 'loading') return <div className="p-6 text-slate-500">Loading user…</div>;
  if (state === 'missing') return <div className="p-6 text-slate-500">User not found.</div>;
  if (state === 'error') return <div className="p-6 text-rose-600">Failed to load.</div>;

  const {
    identity, kyc, wallet, stats, orders, tickets, scores,
    wallet_transactions, notifications, support_cases, referrals,
    referral_joined_via, referrer_user, signup_bonus,
    sessions, admin_actions, world, special_challenge,
    acquisition, page_visits, influencer_attribution,
    wallet_breakdown, bonus_grants, payments, withdrawals, promotion_status,
  } = data;
  const suspended = !!identity.suspended;
  const erased = !!identity.erased;
  const totalDepositsPence = (payments || []).reduce((sum, payment) => sum + (
    payment.payment_status === 'paid' ? Number(payment.amount_received_pence || payment.amount || 0) : 0
  ), 0);
  const totalSpend = (wallet_transactions || []).reduce((sum, tx) => sum + (Number(tx.amount) < 0 ? Math.abs(Number(tx.amount)) : 0), 0);

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
            <div className="font-display font-extrabold text-2xl break-words" data-testid="user-name">
              {identity.name} {erased && <span className="text-red-200">· ERASED</span>}
            </div>
            <div className="text-white/85 text-sm flex items-start gap-2 break-all">
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
        <StatCard label="Token balance" value={Number(wallet_breakdown?.balance_tokens || wallet?.balance || 0).toLocaleString()} tone="emerald" />
        <StatCard label="Lifetime top-ups" value={gbp(totalDepositsPence / 100)} tone="teal" />
        <StatCard label="Token spend" value={`${Number(totalSpend || 0).toLocaleString()} tokens`} tone="rose" />
        <StatCard label="Tickets" value={stats.tickets_count} tone="indigo" />
        <StatCard label="Paid scores" value={stats.scores_count} tone="amber" />
        <StatCard label="Free World" value={world?.stats?.level_attempts_count || 0} tone="fuchsia" />
      </div>

      <div className="sticky top-0 z-20 -mx-2 overflow-x-auto border-y border-slate-200 bg-white/95 px-2 py-2 backdrop-blur" data-testid="user-control-tabs">
        <div role="tablist" aria-label="User control centre sections" className="flex min-w-max gap-1">
          {sections.map(([id, label]) => (
            <button
              key={id}
              id={`user-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={activeSection === id}
              aria-controls="user-section-panel"
              onClick={() => setActiveSection(id)}
              className={`rounded-md px-3 py-2 text-xs font-bold whitespace-nowrap ${activeSection === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              data-testid={`user-tab-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div id="user-section-panel" role="tabpanel" aria-labelledby={`user-tab-${activeSection}`} data-testid={`user-panel-${activeSection}`}>

      <ProfileManagementCard
        userId={user_id}
        identity={data?.identity || {}}
        onReload={load}
        view={activeSection}
        hidden={activeSection !== 'profile' && activeSection !== 'verification'}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Acquisition & referral attribution" icon={Gift} hidden={activeSection !== 'referrals'}>
          {!acquisition && !influencer_attribution ? (
            <p className="text-sm text-slate-500">No consent-linked acquisition journey or influencer attribution is recorded for this account.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {acquisition && <dl className="grid grid-cols-[130px_1fr] gap-y-1 text-xs"><dt className="text-slate-500">Source</dt><dd>{acquisition.source_key || '—'}</dd><dt className="text-slate-500">Campaign</dt><dd>{acquisition.campaign || '—'}</dd><dt className="text-slate-500">Landing page</dt><dd>{acquisition.landing_path || '—'}</dd><dt className="text-slate-500">Device</dt><dd>{acquisition.device_type || '—'}</dd><dt className="text-slate-500">Attributed</dt><dd>{acquisition.attributed_at ? new Date(acquisition.attributed_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</dd></dl>}
              {influencer_attribution && <div className="border-t border-slate-100 pt-3 text-xs"><strong>Influencer campaign:</strong> {influencer_attribution.influencer_name || 'Partner'} · {influencer_attribution.code} · {influencer_attribution.campaign_name || 'Campaign'}<div className="mt-1 text-slate-500">Status: {influencer_attribution.status || 'pending'} · Signup reward: {influencer_attribution.reward_granted ? `${influencer_attribution.reward_tokens || 0} tokens granted` : 'not granted'}</div></div>}
              <div className="border-t border-slate-100 pt-3"><div className="mb-2 text-xs font-bold">Consented page journey</div>{(page_visits || []).length ? <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">{page_visits.map((visit, index) => <li key={`${visit.created_at}-${index}`} className="flex justify-between gap-3 border-b border-slate-100 py-1"><span className="truncate">{visit.page_path || visit.page_key}</span><span className="shrink-0 text-slate-500">{visit.created_at ? new Date(visit.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</span></li>)}</ul> : <p className="text-xs text-slate-500">No page visits are available for the attributed signup sessions.</p>}</div>
            </div>
          )}
        </Section>

        <Section title="Identity & KYC" icon={ShieldCheck} hidden={activeSection !== 'profile'}>
          <dl className="text-sm space-y-1.5">
            <div className="flex"><dt className="w-32 text-slate-500">User ID</dt><dd className="font-mono text-xs">{identity.user_id}</dd></div>
            <div className="flex"><dt className="w-32 text-slate-500">Username</dt><dd>{identity.username || '—'}</dd></div>
            <div className="flex"><dt className="w-32 text-slate-500">DOB</dt><dd>{identity.dob || '—'}</dd></div>
            <div className="flex"><dt className="w-32 text-slate-500">Address</dt><dd className="flex-1">{identity.address || '—'}</dd></div>
            <div className="flex"><dt className="w-32 text-slate-500">Joined</dt><dd>{identity.created_at ? new Date(identity.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</dd></div>
            <div className="flex"><dt className="w-32 text-slate-500">KYC status</dt><dd>{kyc?.status || 'none'}</dd></div>
          </dl>
        </Section>

        <Section title="Wallet" icon={Wallet} hidden={activeSection !== 'wallet'}>
          <div className="text-3xl font-black text-emerald-700">{Number(wallet_breakdown?.balance_tokens || wallet?.balance || 0).toLocaleString()} tokens</div>
          {wallet_breakdown?.source_classified ? (
            <>
              <div className="text-xs text-slate-500">Top-up: {Number(wallet_breakdown.topup_tokens).toLocaleString()} · Winning: {Number(wallet_breakdown.winning_tokens).toLocaleString()} · Winning bonus: {Number(wallet_breakdown.winning_bonus_tokens).toLocaleString()} · Bonus: {Number(wallet_breakdown.bonus_tokens).toLocaleString()} · Total: {Number(wallet_breakdown.total_tokens).toLocaleString()}</div>
              <div className="text-xs text-slate-500">Cashout available: {gbp(Number(wallet_breakdown.available_to_cash_out || 0))} · Lifetime top-ups: {gbp(totalDepositsPence / 100)} · Lifetime token spend: {Number(totalSpend || 0).toLocaleString()}</div>
            </>
          ) : (
            <div className="text-xs font-semibold text-amber-700">Legacy wallet source split unavailable; no category amounts are inferred.</div>
          )}
          <div className="mt-1 text-xs text-slate-500">Winnings available: {gbp(Number(wallet_breakdown?.winnings_pence || 0) / 100)} · Lifetime winnings: {gbp(Number(wallet_breakdown?.lifetime_winnings_pence || 0) / 100)}</div>
          {canManageUserFunds && <form className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end" onSubmit={adjustWallet}>
            <div className="space-y-1">
              <Label htmlFor="wallet-adjust-amount">Token adjustment</Label>
              <Input id="wallet-adjust-amount" type="number" step="0.01" min="-500" max="500" value={walletAdjustAmount} onChange={event => setWalletAdjustAmount(event.target.value)} placeholder="e.g. -5 or 10" disabled={walletAdjustBusy || erased} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wallet-adjust-reason">Reason (10+ characters)</Label>
              <Input id="wallet-adjust-reason" value={walletAdjustReason} onChange={event => setWalletAdjustReason(event.target.value)} maxLength={300} placeholder="Explain the correction" disabled={walletAdjustBusy || erased} />
            </div>
            <Button type="submit" disabled={walletAdjustBusy || erased || !walletAdjustAmount || !walletAdjustReason.trim()}>
              {walletAdjustBusy ? 'Applying…' : 'Apply adjustment'}
            </Button>
          </form>}
          <div className="mt-3 max-h-40 overflow-y-auto text-xs">
            {wallet_transactions.length === 0 ? <div className="text-slate-400">No wallet transactions.</div> :
              wallet_transactions.slice(0, 20).map((t, i) => (
                <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1">
                  <span>{t.kind} · {t.method || '—'}</span>
                  <span className={Number(t.amount) > 0 ? 'text-emerald-700' : 'text-rose-700'}>{gbp(t.amount)}</span>
                </div>
              ))
            }
          </div>
        </Section>

        <Section title="Paid World" icon={Ticket} hidden={activeSection !== 'paid-world'}>
          <div className="text-xs text-slate-500">Tickets: {tickets.length} · Orders: {orders.length} · Confirmed top-ups: {(payments || []).filter(payment => payment.payment_status === 'paid').length} · Scores: {scores.length}</div>
          <div className="mt-2 max-h-52 overflow-y-auto text-xs space-y-1">
            {scores.slice(0, 20).map((s, i) => (
              <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1">
                <span>{s.contest_id}</span>
                <span>#{s.ticket_number} · {s.points ?? '—'}pt</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Free World" icon={Trophy} hidden={activeSection !== 'free-world'}>
          <div className="text-xs text-slate-500">Attempts: {world?.stats?.level_attempts_count || 0} · Wins: {world?.stats?.winnings_count || 0} · Token events: {world?.stats?.token_events_count || 0}</div>
          <div className="mt-2 max-h-52 overflow-y-auto text-xs space-y-1">
            {(world?.token_history || []).slice(0, 12).map((event, i) => (
              <div key={`${event.kind}-${event.at}-${i}`} className="flex items-center justify-between border-b border-slate-100 py-1">
                <span>{event.kind} · {event.level || event.champion_stage || '—'}</span>
                <span className="text-slate-600">{event.token_cost ? `-${event.token_cost}` : '—'}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Support" icon={LifeBuoy} hidden={activeSection !== 'activity'}>
          {support_cases.length === 0 ? <div className="text-xs text-slate-400">No support cases.</div> :
            <ul className="text-xs space-y-1">
              {support_cases.slice(0, 15).map((c, i) => (
                <li key={i} className="border-b border-slate-100 py-1"><strong>{c.subject || c.category}</strong> · {c.status}</li>
              ))}
            </ul>
          }
        </Section>
      </div>

      <Section title="Recent activity" icon={Clock} hidden={activeSection !== 'activity'}>
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-bold">Sessions</h3>
            <div className="max-h-64 overflow-y-auto text-xs">
              {(sessions || []).map((session, index) => (
                <div key={session.session_id || session._id || index} className="border-b border-slate-100 py-2">
                  <div className="flex justify-between gap-2"><strong>{session.status || (session.revoked_at ? 'Ended' : 'Recorded')}</strong><span className="text-slate-500">{session.created_at ? new Date(session.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</span></div>
                  <div className="mt-1 break-all text-slate-500">{session.current_path || session.last_page || session.user_agent || session.device || 'Session details unavailable'}</div>
                </div>
              ))}
              {!sessions?.length && <p className="text-slate-400">No session history recorded.</p>}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold">Notifications</h3>
            <div className="max-h-64 overflow-y-auto text-xs">
              {(notifications || []).map((notification, index) => (
                <div key={notification.notification_id || notification._id || index} className="border-b border-slate-100 py-2">
                  <div className="flex justify-between gap-2"><strong>{notification.title || notification.kind || 'Notification'}</strong><span className="shrink-0 text-slate-500">{notification.created_at ? new Date(notification.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</span></div>
                  {notification.body && <p className="mt-1 text-slate-600">{notification.body}</p>}
                </div>
              ))}
              {!notifications?.length && <p className="text-slate-400">No notifications recorded.</p>}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Tickets and orders" icon={Ticket} hidden={activeSection !== 'orders-tickets'}>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="overflow-x-auto">
            <h3 className="mb-2 text-sm font-bold">Orders ({orders?.length || 0})</h3>
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-slate-500"><tr><th className="py-2">Order</th><th>User</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>{(orders || []).map((order, index) => <tr key={order.order_id || order._id || index} className="border-t border-slate-100"><td className="py-2 font-mono">{order.order_id || order.id || '—'}</td><td>{order.product_name || order.contest_title || order.contest_id || '—'}</td><td>{gbp(order.total ?? order.amount ?? 0)}</td><td>{order.status || '—'}</td><td>{order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB', { timeZone: 'Europe/London' }) : '—'}</td></tr>)}</tbody>
            </table>
            {!orders?.length && <p className="py-3 text-xs text-slate-400">No orders recorded.</p>}
          </div>
          <div className="overflow-x-auto">
            <h3 className="mb-2 text-sm font-bold">Tickets ({tickets?.length || 0})</h3>
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="text-slate-500"><tr><th className="py-2">Ticket</th><th>Contest</th><th>Number</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>{(tickets || []).map((ticket, index) => <tr key={ticket.ticket_id || ticket._id || index} className="border-t border-slate-100"><td className="py-2 font-mono">{ticket.ticket_id || ticket.order_id || '—'}</td><td>{ticket.contest_title || ticket.contest_id || '—'}</td><td>{ticket.ticket_number ?? '—'}</td><td>{ticket.status || (ticket.refunded ? 'refunded' : 'valid')}</td><td>{ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('en-GB', { timeZone: 'Europe/London' }) : '—'}</td></tr>)}</tbody>
            </table>
            {!tickets?.length && <p className="py-3 text-xs text-slate-400">No tickets recorded.</p>}
          </div>
        </div>
      </Section>

      <Section title="Winnings history" icon={Trophy} hidden={activeSection !== 'winnings'}>
        <div className="mb-3 text-xs text-slate-500">Lifetime Free World winnings: {gbp(world?.winnings_total || 0)}</div>
        <div className="max-h-96 overflow-y-auto text-xs">
          {(world?.winnings || []).map((winning, index) => <div key={winning.award_id || winning.winning_id || index} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2"><span>Championship {winning.global_contest_number ?? '—'} · Rank {winning.rank ?? '—'}</span><span>{winning.status || 'pending'} · {gbp(winning.winning_amount || 0)}</span><span className="text-slate-500">{(winning.paid_at || winning.frozen_at || winning.created_at) ? new Date(winning.paid_at || winning.frozen_at || winning.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</span></div>)}
          {!world?.winnings?.length && <p className="py-3 text-slate-400">No winnings recorded.</p>}
        </div>
      </Section>

      <Section title="Withdrawals" icon={Wallet} hidden={activeSection !== 'withdrawals'}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-slate-500"><tr><th className="py-2">Request</th><th>Amount</th><th>Status</th><th>Created</th><th>Payment reference</th><th /></tr></thead>
            <tbody>{(withdrawals || []).map((withdrawal, index) => <tr key={withdrawal.withdrawal_id || withdrawal._id || index} className="border-t border-slate-100"><td className="py-2 font-mono">{withdrawal.withdrawal_id || '—'}</td><td>{gbp(Number(withdrawal.amount_gbp || 0))}</td><td>{withdrawal.status || '—'}</td><td>{withdrawal.created_at ? new Date(withdrawal.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</td><td>{withdrawal.payment_reference || '—'}</td><td>{['admin', 'super_admin'].includes(currentUser?.role) && withdrawal.status === 'processing' && <Button size="sm" variant="outline" onClick={() => reviewWithdrawal(withdrawal.withdrawal_id)} disabled={withdrawalBusy}>Review</Button>}</td></tr>)}</tbody>
          </table>
          {!withdrawals?.length && <p className="py-3 text-slate-400">No withdrawal requests.</p>}
        </div>
        {withdrawalDetail && <div className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4" data-testid="user-withdrawal-review">
          <div className="flex items-center justify-between gap-2"><h3 className="font-bold">Review {withdrawalDetail.withdrawal_id}</h3><Button variant="outline" size="sm" onClick={() => setWithdrawalDetail(null)}>Close</Button></div>
          <div className="grid gap-1 text-xs sm:grid-cols-2"><div>Amount: <strong>{gbp(withdrawalDetail.amount_gbp)}</strong></div><div>Status: {withdrawalDetail.status}</div><div>Account holder: {withdrawalDetail.bank?.account_holder || '—'}</div><div>Sort code: {withdrawalDetail.bank?.sort_code || '—'}</div><div>Account number: {withdrawalDetail.bank?.account_number || '—'}</div><div>IBAN: {withdrawalDetail.bank?.iban || '—'}</div><div>Current KYC: {withdrawalDetail.kyc_current_status || '—'}</div></div>
          {withdrawalDetail.status === 'processing' && <>
            <div className="space-y-1"><Label htmlFor="withdrawal-notification">User notification</Label><textarea id="withdrawal-notification" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" rows={2} value={withdrawalMessage} onChange={event => setWithdrawalMessage(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="withdrawal-reject-reason">Rejection reason</Label><Input id="withdrawal-reject-reason" value={withdrawalRejectReason} onChange={event => setWithdrawalRejectReason(event.target.value)} maxLength={500} /></div>
            <div className="flex flex-wrap gap-2"><Button onClick={markWithdrawalPaid} disabled={withdrawalBusy}>Record payout as paid</Button><Button variant="outline" className="text-rose-700" onClick={rejectWithdrawal} disabled={withdrawalBusy || !withdrawalRejectReason.trim()}>Reject and release tokens</Button></div>
            <p className="text-xs text-amber-700">Only record a payout after the bank transfer has actually been sent.</p>
          </>}
        </div>}
      </Section>

      <Section title="Impossible Challenges" icon={Swords} hidden={activeSection !== 'challenges'}>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="font-bold text-sm mb-3">Challenge attempts</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">Attempts</span><span className="font-semibold">{special_challenge?.stats?.attempts_count || 0}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Rewards</span><span className="font-semibold">{special_challenge?.stats?.rewards_count || 0}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tokens spent</span><span className="font-semibold">{special_challenge?.stats?.total_tokens_spent || 0}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Credit total</span><span className="font-semibold">{gbp((special_challenge?.stats?.total_rewards_pence || 0) / 100)}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="font-bold text-sm mb-3">Recent challenge activity</div>
            <div className="max-h-52 overflow-y-auto text-xs space-y-2">
              {(special_challenge?.attempts || []).slice(0, 8).map((attempt, i) => (
                <div key={attempt.attempt_id || i} className="border-b border-slate-100 pb-2">
                  <div className="font-semibold">{attempt.challenge_id}</div>
                  <div className="text-slate-500">{attempt.result || attempt.status} · {attempt.elapsed_ms ? `${Math.round(attempt.elapsed_ms / 1000)}s` : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Bonus Tokens" icon={Gift} hidden={activeSection !== 'bonus-tokens'}>
        <div className="grid md:grid-cols-2 gap-5">

          {canManageUserFunds && <form className="space-y-3 rounded-xl border border-slate-200 p-4" onSubmit={grantBonus}>
            <div className="font-bold text-sm">Grant bonus tokens</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="user-bonus-amount">Amount</Label><Input id="user-bonus-amount" type="number" min="0.01" step="0.01" value={bonusAmount} onChange={event => setBonusAmount(event.target.value)} disabled={bonusBusy || erased} /></div>
              <div className="space-y-1"><Label htmlFor="user-bonus-expiry">Expiry days</Label><Input id="user-bonus-expiry" type="number" min="1" max="3650" step="1" value={bonusExpiryDays} onChange={event => setBonusExpiryDays(event.target.value)} placeholder="No expiry" disabled={bonusBusy || erased} /></div>
            </div>
            <div className="space-y-1"><Label htmlFor="user-bonus-reason">Reason</Label><Input id="user-bonus-reason" value={bonusReason} onChange={event => setBonusReason(event.target.value)} maxLength={300} placeholder="Reason for this grant" disabled={bonusBusy || erased} /></div>
            <Button type="submit" disabled={bonusBusy || erased || !bonusAmount || bonusReason.trim().length < 10}>{bonusBusy ? 'Granting…' : 'Grant bonus tokens'}</Button>
          </form>}

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="font-bold text-sm mb-3">Bonus grant history</div>
            <div className="max-h-64 space-y-2 overflow-y-auto text-xs">
              {(bonus_grants || []).map(grant => <div key={grant.grant_id} className="border-b border-slate-100 pb-2"><div className="flex justify-between gap-2"><strong>{grant.reason || 'Bonus grant'}</strong><span className="capitalize">{grant.status}</span></div><div className="mt-1 text-slate-600">Granted {Number(grant.original_amount || 0)} · Used {Number(grant.spent_amount || 0)} · Remaining {Number(grant.remaining_amount || 0)} · Expired {Number(grant.expired_amount || 0)}</div><div className="text-slate-500">{grant.expires_at ? `Expires ${new Date(grant.expires_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}` : 'No expiry'}</div>{grant.status === 'active' && Number(grant.remaining_amount || 0) > 0 && <Button variant="outline" size="sm" className="mt-2" onClick={() => deductBonusGrant(grant)} disabled={busy || erased}>Deduct unused bonus</Button>}</div>)}
              {!bonus_grants?.length && <p className="text-slate-400">No bonus grant history.</p>}
            </div>
          </div>

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
                <span className="font-semibold">{signup_bonus?.offer_terms?.qualifying_topup_gbp != null
                  ? Number(signup_bonus.offer_terms.qualifying_topup_gbp) === 0 ? 'No top-up required' : `${gbp(signup_bonus.offer_terms.qualifying_topup_gbp)}+ in one verified payment`
                  : 'No offer terms snapshot'}</span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Qualifying top-up</span>
                <span className={signup_bonus?.qualifying_topup_completed ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                  {Number(signup_bonus?.offer_terms?.qualifying_topup_gbp) === 0 && signup_bonus?.offer_terms?.qualifying_topup_gbp != null
                    ? 'Not required' : signup_bonus?.qualifying_topup_completed
                    ? `Completed${signup_bonus?.qualifying_topup_amount_gbp != null ? ` · ${gbp(signup_bonus.qualifying_topup_amount_gbp)}` : ''}`
                    : 'Waiting'}
                </span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Bonus reward</span>
                <span className={signup_bonus?.granted ? 'text-emerald-700 font-semibold' : 'text-slate-600 font-semibold'}>
                  {signup_bonus?.granted
                    ? `Granted · ${signup_bonus?.tokens ?? 0} tokens`
                    : 'Not granted'}
                </span>
              </div>

              {signup_bonus?.offer_version && <div className="flex justify-between gap-3">
                <span className="text-slate-500">Offer version</span><span className="font-semibold">{signup_bonus.offer_version}</span>
              </div>}
              {signup_bonus?.offer_terms?.expiry_days && <div className="flex justify-between gap-3">
                <span className="text-slate-500">Bonus expiry</span><span className="font-semibold">{signup_bonus.offer_terms.expiry_days} days after credit</span>
              </div>}

              {signup_bonus?.granted_at && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Granted at</span>
                  <span>{new Date(signup_bonus.granted_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</span>
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

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4" data-testid="user-promotion-eligibility">
            <div className="font-bold text-sm mb-3">Promotional eligibility · Influencer Exclusive</div>
            {promotion_status ? <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Acquisition</span><b>{promotion_status.acquisition_type}</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Campaign</span><b>{promotion_status.campaign_name || promotion_status.promo_code || '—'}</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Signup bonus</span><b>{promotion_status.signup_bonus_status}</b></div>
              {promotion_status.signup_pending_condition && <div className="text-amber-700">{promotion_status.signup_pending_condition}</div>}
              <div className="flex justify-between gap-3"><span className="text-slate-500">Top-up bonus</span><b>{promotion_status.topup_bonus_status}</b></div>
              {promotion_status.topup_pending_condition && <div className="text-amber-700">{promotion_status.topup_pending_condition}</div>}
              <div className="flex justify-between gap-3"><span className="text-slate-500">Normal bonus issued</span><b>{promotion_status.normal_bonus_tokens_issued ?? 'Unclassified'}</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Influencer bonus issued</span><b>{promotion_status.influencer_bonus_tokens_issued ?? 'Unclassified'}</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Purchased Top-up Tokens</span><b>{promotion_status.purchased_topup_tokens ?? 'Unclassified'}</b></div>
              {!!promotion_status.conflicts?.length && <ul className="list-disc pl-4 text-rose-700">{promotion_status.conflicts.map((item) => <li key={item.code}>{item.message}</li>)}</ul>}
              {!!promotion_status.reward_transaction_ids?.length && <div><div className="text-slate-500">Reward transaction IDs</div><div className="mt-1 break-all font-mono">{promotion_status.reward_transaction_ids.join(', ')}</div></div>}
              {!!promotion_status.bonus_expiry?.length && <div><div className="text-slate-500">Reward expiry</div>{promotion_status.bonus_expiry.map((item, index) => <div key={`${item.source}-${index}`}>{item.source}: {item.remaining ?? '—'} remaining · {item.expires_at ? new Date(item.expires_at).toLocaleDateString('en-GB') : 'No expiry'}</div>)}</div>}
            </div> : <p className="text-xs text-slate-500">Promotion status is unavailable.</p>}
          </div>

          {/* Referral details are shown in their own control-centre tab. */}
          <div hidden className="rounded-xl border border-slate-200 p-4">
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
                  <span className="text-slate-500">Qualifying top-up</span>
                  <span className={referral_joined_via.topup_qualified ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    {referral_joined_via.topup_qualified ? 'Completed' : `Waiting · ${referral_joined_via.offer_terms?.qualifying_topup_gbp != null ? `${gbp(referral_joined_via.offer_terms.qualifying_topup_gbp)}+ verified payment` : 'terms unavailable'}`}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Contest entry{referral_joined_via.offer_terms?.contest_entry_required === false ? ' (not required)' : ''}</span>
                  <span className={referral_joined_via.contest_entered ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    {referral_joined_via.contest_entered ? 'Completed' : 'Waiting'}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Referrer reward</span>
                  <span className={referral_joined_via.reward_granted ? 'text-emerald-700 font-semibold' : 'text-slate-600 font-semibold'}>
                    {referral_joined_via.reward_granted
                      ? `${referral_joined_via.reward_tokens ?? 0} tokens granted`
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
        <div hidden className="mt-5">
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
                    <th className="text-left px-3 py-2">Qualifying top-up</th>
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
                              {r.reward_tokens ?? 0} tokens
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

      <Section title="Referrals" icon={Gift} hidden={activeSection !== 'referrals'}>
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4 text-sm">
            <h3 className="mb-2 font-bold">Joined via referral</h3>
            {!referral_joined_via ? <p className="text-xs text-slate-500">This user did not register through a referral.</p> : <dl className="space-y-1 text-xs"><div className="flex justify-between gap-2"><dt className="text-slate-500">Code</dt><dd className="font-mono">{referral_joined_via.code || '—'}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Invited by</dt><dd>{referrer_user?.name || referrer_user?.email || 'Unknown user'}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Status</dt><dd>{referral_joined_via.status || 'pending'}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Top-up / contest</dt><dd>{referral_joined_via.topup_qualified ? 'Top-up complete' : 'Top-up pending'} · {referral_joined_via.contest_entered ? 'Entry complete' : 'Entry pending'}</dd></div></dl>}
          </div>
          <div className="rounded-lg border border-slate-200 p-4 text-sm">
            <h3 className="mb-2 font-bold">Influencer attribution</h3>
            {!influencer_attribution ? <p className="text-xs text-slate-500">No influencer campaign attribution recorded.</p> : <dl className="space-y-1 text-xs"><div className="flex justify-between gap-2"><dt className="text-slate-500">Partner</dt><dd>{influencer_attribution.influencer_name || influencer_attribution.influencer_id}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Promo code</dt><dd className="font-mono">{influencer_attribution.code || '—'}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Status</dt><dd>{influencer_attribution.status || 'pending'}</dd></div></dl>}
          </div>
        </div>
        <h3 className="mb-2 text-sm font-bold">Referred users ({referrals?.length || 0})</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-slate-500"><tr><th className="py-2">User</th><th>Code</th><th>Top-up</th><th>Contest entry</th><th>Reward</th><th>Status</th></tr></thead>
            <tbody>{(referrals || []).map((referral, index) => <tr key={referral.referral_id || index} className="border-t border-slate-100"><td className="py-2">{referral.referred_name || referral.referred_email || referral.referred_user_id}</td><td className="font-mono">{referral.code || '—'}</td><td>{referral.topup_qualified ? 'Complete' : `Waiting${referral.offer_terms?.qualifying_topup_gbp != null ? ` · ${gbp(referral.offer_terms.qualifying_topup_gbp)}+ verified payment` : ''}`}</td><td>{referral.offer_terms?.contest_entry_required === false ? 'Not required' : referral.contest_entered ? 'Complete' : 'Waiting'}</td><td>{referral.reward_granted ? `${referral.reward_tokens ?? 0} tokens` : '—'}</td><td>{referral.display_status || referral.status || 'pending'}{referral.reward_tx_id ? <div className="font-mono text-[10px]">{referral.reward_tx_id}</div> : null}</td></tr>)}</tbody>
          </table>
          {!referrals?.length && <p className="py-3 text-slate-400">No referrals made by this user.</p>}
        </div>
      </Section>

      {/* Free World history — read-only */}
      {world && (
        <section hidden={activeSection !== 'free-world'} className={`bg-white rounded-2xl border border-slate-200 p-5 ${activeSection !== 'free-world' ? 'hidden' : ''}`} data-testid="user-360-world-history">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-indigo-600" />
            <h2 className="font-display font-bold text-base">Free World history</h2>
          </div>

          {/* Progression summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard label="Championship" value={world.stats?.champion_stage ?? '—'} tone="indigo" />
            <StatCard label="Current level" value={world.stats?.current_level ?? '—'} tone="teal" />
            <StatCard label="Winnings" value={gbp(world.winnings_total || 0)} tone="emerald" />
            <StatCard label="Token events" value={world.stats?.token_events_count ?? 0} tone="amber" />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Championship progression */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 font-bold text-sm mb-3">
                <MapIcon className="w-4 h-4 text-violet-600" /> Championship progression
              </div>
              {!world.progress ? (
                <div className="text-xs text-slate-400">No Free World progress yet.</div>
              ) : (
                <dl className="text-xs space-y-1.5">
                  <div className="flex justify-between"><dt className="text-slate-500">Championship stage</dt><dd className="font-semibold">{world.progress.champion_stage ?? 1}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Current level</dt><dd className="font-semibold">{world.progress.current_level ?? 1}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Highest unlocked</dt><dd className="font-semibold">{world.progress.highest_unlocked_level ?? 1}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Completed (this stage)</dt><dd className="font-semibold">{(world.progress.completed_levels || []).join(', ') || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Skipped (this stage)</dt><dd className="font-semibold">{(world.progress.skipped_levels || []).join(', ') || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Champion ready</dt><dd className="font-semibold">{world.progress.champion_ready ? 'Yes' : 'No'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Season complete</dt><dd className="font-semibold">{world.progress.season_complete ? 'Yes' : 'No'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Last updated</dt><dd>{world.progress.updated_at ? new Date(world.progress.updated_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</dd></div>
                </dl>
              )}

              {!!world.level_skips?.length && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">Catch-up skips</div>
                  <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                    {world.level_skips.map((s, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1">
                        <span>C{s.champion_stage} · Level {s.level}</span>
                        <span className="text-slate-400">{s.skipped_at ? new Date(s.skipped_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Levels history */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 font-bold text-sm mb-3">
                <Swords className="w-4 h-4 text-indigo-600" /> Levels history ({world.stats?.level_attempts_count || 0})
              </div>
              {!world.level_attempts?.length ? (
                <div className="text-xs text-slate-400">No level attempts recorded.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto text-xs space-y-1">
                  {world.level_attempts.map((a, i) => (
                    <div key={a.attempt_id || i} className="flex items-center justify-between border-b border-slate-100 py-1.5 gap-2">
                      <div>
                        <div className="font-semibold">Level {a.level} · <span className="text-slate-500">{a.source || 'attempt'}</span></div>
                        <div className="text-slate-400">{a.created_at ? new Date(a.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`px-2 py-0.5 rounded-full font-bold ${a.passed === true ? 'bg-emerald-100 text-emerald-700' : a.passed === false ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                          {a.passed === true ? 'Passed' : a.passed === false ? 'Failed' : (a.status || 'started')}
                        </span>
                        {a.score != null && <div className="text-slate-400 mt-0.5">{a.score} pts</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Winnings history */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 font-bold text-sm mb-3">
                <Trophy className="w-4 h-4 text-emerald-600" /> Winnings history ({world.stats?.winnings_count || 0})
              </div>
              {!world.winnings?.length ? (
                <div className="text-xs text-slate-400">No Championship winnings.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto text-xs space-y-1">
                  {world.winnings.map((w, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1.5 gap-2">
                      <div>
                        <div className="font-semibold">Championship {w.global_contest_number} · Rank {w.rank}</div>
                        <div className="text-slate-400">{(w.paid_at || w.frozen_at) ? new Date(w.paid_at || w.frozen_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-emerald-700">{gbp(w.winning_amount || 0)}</div>
                        <span className={`px-2 py-0.5 rounded-full font-bold ${w.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {w.status === 'paid' ? 'Paid' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Token history */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 font-bold text-sm mb-3">
                <Coins className="w-4 h-4 text-amber-600" /> Token history ({world.stats?.token_events_count || 0})
              </div>
              {!world.token_history?.length ? (
                <div className="text-xs text-slate-400">No token unlocks or retries.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto text-xs space-y-1">
                  {world.token_history.map((t, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1.5 gap-2">
                      <div>
                        <div className="font-semibold">
                          {t.kind === 'level_unlock' ? 'Early unlock' : 'Retry'} · C{t.champion_stage ?? '—'} L{t.level ?? '—'}
                        </div>
                        <div className="text-slate-400">{t.at ? new Date(t.at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '—'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-amber-700">{t.token_cost ?? 1} 🪙</div>
                        <span className={`px-2 py-0.5 rounded-full font-bold ${t.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {t.paid ? 'Paid' : (t.status || 'reserved')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <Section title="Admin actions history" icon={Clock} hidden={activeSection !== 'audit'}>
        {admin_actions.length === 0 ? <div className="text-xs text-slate-400">No admin actions recorded.</div> :
          <ul className="text-xs space-y-1 max-h-52 overflow-y-auto">
            {admin_actions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-slate-400 shrink-0">{new Date(a.at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</span>
                <span className="font-semibold">{a.kind}</span>
                <span className="text-slate-500">by {a.admin_email}</span>
                {a.reason && <span className="text-slate-500 truncate">— {a.reason}</span>}
              </li>
            ))}
          </ul>
        }
      </Section>

      </div>

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
