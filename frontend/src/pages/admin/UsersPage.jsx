import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../lib/api';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useToast } from '../../hooks/use-toast';
import { gbp } from '../../lib/format';
import {
  Search, Users as UsersIcon, ShieldAlert, ShieldCheck,
  Phone, Check, X, SlidersHorizontal, RotateCcw,
  Wallet, Trophy, Ticket, Gift, UserPlus, Coins, MessageSquare, CheckSquare, Square,
} from 'lucide-react';

const ROLES = ['user', 'operator', 'support', 'admin', 'super_admin'];

const ROLE_COLORS = {
  user: 'bg-slate-100 text-slate-700',
  operator: 'bg-blue-100 text-blue-700',
  support: 'bg-indigo-100 text-indigo-700',
  admin: 'bg-amber-100 text-amber-700',
  super_admin: 'bg-rose-100 text-rose-700',
};

const EMPTY_FILTERS = {
  status: 'all',
  role: 'all',
  phoneVerification: 'all',
  emailVerification: 'all',
  kyc: 'all',
  acquisition: 'all',
  signupBonus: 'all',
  referralReward: 'all',
  influencerReward: 'all',
  joinedFrom: '',
  joinedTo: '',
  walletMin: '',
  walletMax: '',
  topupMin: '',
  topupMax: '',
  spentMin: '',
  spentMax: '',
  winningsMin: '',
  winningsMax: '',
  contests: 'all',
  sort: 'newest',
};

function VerifiedPill({ verified }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
      <Check className="w-3 h-3" /> Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500">
      <X className="w-3 h-3" /> Unverified
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const EXPIRY_OPTIONS = [
  ['none', 'No expiry'], ['1', '1 day'], ['3', '3 days'], ['7', '7 days'], ['14', '14 days'],
  ['30', '30 days'], ['60', '60 days'], ['90', '90 days'],
  ['custom_days', 'Custom number of days'], ['custom_date', 'Custom expiry date'],
];

// Text shown in the confirmation, or null when the chosen expiry is not valid.
function expiryDescription(choice, customDays, customDate) {
  if (choice === 'none') return 'No expiry: these tokens will not expire.';
  if (choice === 'custom_date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) return null;
    const todayUk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    if (customDate <= todayUk) return null;
    const displayDate = new Date(`${customDate}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
    return `Unused tokens expire at the end of ${displayDate} (UK time).`;
  }
  const days = choice === 'custom_days' ? Number(customDays) : Number(choice);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
  const when = new Date(Date.now() + days * 86400000).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' });
  return `Unused tokens expire in ${days} day${days === 1 ? '' : 's'} (about ${when}).`;
}

function expiryPayload(choice, customDays, customDate) {
  if (choice === 'none') return { expiry_mode: 'none' };
  if (choice === 'custom_date') return { expiry_mode: 'date', expiry_date: customDate };
  return { expiry_mode: 'days', expiry_days: choice === 'custom_days' ? Number(customDays) : Number(choice) };
}

function newBulkBatchId() {
  return window.crypto?.randomUUID?.() || `bulk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function moneyRange(value, min, max) {
  const n = num(value);

  if (min !== '' && n < Number(min)) return false;
  if (max !== '' && n > Number(max)) return false;

  return true;
}

function Select({ value, onChange, children, testid }) {
  return (
    <select
      value={value}
      onChange={onChange}
      data-testid={testid}
      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6C2BFF]/20"
    >
      {children}
    </select>
  );
}

export default function UsersPage() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkBatchId, setBulkBatchId] = useState('');
  const [bulkAmount, setBulkAmount] = useState('1');
  const [bulkNote, setBulkNote] = useState('');
  const [bulkCreditType, setBulkCreditType] = useState('purchased');
  const [expiryChoice, setExpiryChoice] = useState('none');
  const [expiryCustomDays, setExpiryCustomDays] = useState('');
  const [expiryCustomDate, setExpiryCustomDate] = useState('');
  const [consentEvidence, setConsentEvidence] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const { toast } = useToast();

  const load = () =>
    adminAPI.users()
      .then(setUsers)
      .catch(() => setUsers([]));

  useEffect(() => {
    load();
  }, []);

  const setFilter = (key, value) => {
    setFilters(current => ({
      ...current,
      [key]: value,
    }));
  };

  const clearFilters = () => {
    setQ('');
    setFilters(EMPTY_FILTERS);
  };

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else if (next.size < 200) next.add(userId);
      else toast({ title: 'Selection limit reached', description: 'Bulk actions are limited to 200 users per batch.' });
      return next;
    });
  };

  const selectFilteredUsers = () => {
    setSelectedUserIds((current) => new Set([...current, ...list.map((u) => u.user_id)].slice(0, 200)));
  };

  const clearSelection = () => setSelectedUserIds(new Set());

  const openBulkAction = (action) => {
    setBulkBatchId(newBulkBatchId());
    setBulkAction(action);
    setBulkNote('');
    setConsentEvidence('');
    setBulkCreditType('purchased');
    setExpiryChoice('none');
    setExpiryCustomDays('');
    setExpiryCustomDate('');
  };

  const submitBulkAction = async () => {
    const userIds = Array.from(selectedUserIds).slice(0, 200);
    if (!userIds.length) return;
    if (bulkAction === 'credit') {
      const amount = Number(bulkAmount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 500) {
        toast({ title: 'Invalid credit', description: 'Enter an amount greater than 0 and up to 500 tokens per user.' });
        return;
      }
      if (bulkNote.trim().length < 10) {
        toast({ title: 'Reason required', description: 'Enter a reason of at least 10 characters.' });
        return;
      }
      if (bulkCreditType === 'bonus' && expiryDescription(expiryChoice, expiryCustomDays, expiryCustomDate) === null) {
        toast({ title: 'Check the expiry', description: 'Enter a valid number of days (1-3650) or a future date.' });
        return;
      }
      const creditLabel = bulkCreditType === 'bonus' ? 'bonus tokens' : 'purchased/general tokens';
      const expiryNote = bulkCreditType === 'bonus'
        ? expiryDescription(expiryChoice, expiryCustomDays, expiryCustomDate)
        : 'No expiry is applied. This preserves the existing purchased/general token behavior.';
      if (!window.confirm(`Credit ${amount} ${creditLabel} to ${userIds.length} users? Total credit: ${amount * userIds.length} tokens.\n${expiryNote}`)) return;
    }
    if (bulkAction === 'sms_grant') {
      if (consentEvidence.trim().length < 20) {
        toast({ title: 'Consent evidence required', description: 'Document the users’ explicit opt-in (at least 20 characters).' });
        return;
      }
      if (!window.confirm(`Enable SMS consent for up to ${userIds.length} selected users with verified phone numbers? This does not send a message.`)) return;
    }
    if (bulkAction === 'sms_revoke') {
      if (bulkNote.trim().length < 10) {
        toast({ title: 'Reason required', description: 'Enter a reason of at least 10 characters.' });
        return;
      }
      if (!window.confirm(`Revoke SMS consent for ${userIds.length} selected users?`)) return;
    }

    setBulkBusy(true);
    try {
      const batchId = bulkBatchId || newBulkBatchId();
      const result = bulkAction === 'credit' && bulkCreditType === 'bonus'
        ? await adminAPI.creditBonus({
          batch_id: batchId,
          user_ids: userIds,
          amount: Number(bulkAmount),
          reason: bulkNote.trim(),
          confirm: true,
          ...expiryPayload(expiryChoice, expiryCustomDays, expiryCustomDate),
        })
        : await adminAPI.bulkUserActions({
          batch_id: batchId,
          user_ids: userIds,
          action: bulkAction,
          amount: undefined,
          note: bulkNote.trim(),
          consent_evidence: consentEvidence.trim(),
        });
      toast({
        title: 'Bulk action complete',
        description: `${result.succeeded} succeeded · ${result.skipped} skipped · ${result.failed} failed.`,
      });
      const processedIds = new Set((result.items || []).filter((item) => item.status === 'success').map((item) => item.user_id));
      setSelectedUserIds((current) => new Set([...current].filter((id) => !processedIds.has(id))));
      setBulkAction('');
      setBulkBatchId('');
      setBulkNote('');
      setConsentEvidence('');
      await load();
    } catch (error) {
      toast({ title: 'Bulk action failed', description: error?.response?.data?.detail || 'Unable to complete the selected action.' });
    } finally {
      setBulkBusy(false);
    }
  };

  const setRole = async (id, role) => {
    try {
      await adminAPI.updateUser(id, { role });
      toast({ title: 'Role updated' });
      await load();
      setEditing(null);
    } catch (e) {
      toast({
        title: 'Failed',
        description:
          e?.response?.data?.detail ||
          'Unable to update role.',
      });
    }
  };

  const toggleSuspend = async (u) => {
    if (u.suspended) {
      try {
        await adminAPI.unsuspendUser(u.user_id);
        toast({ title: 'User unsuspended' });
        await load();
      } catch (e) {
        toast({
          title: 'Failed',
          description:
            e?.response?.data?.detail ||
            'Unable to unsuspend user.',
        });
      }
    } else {
      window.location.href = `/admin/users/${u.user_id}`;
    }
  };

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();

    let result = users.filter(u => {
      if (term) {
        const searchable = [
          u.name,
          u.email,
          u.username,
          u.phone,
          u.public_id,
          u.user_id,
          u.influencer_code,
          u.influencer_name,
          u.joined_referral_code,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchable.includes(term)) return false;
      }

      if (filters.status === 'active' && (u.suspended || u.erased)) {
        return false;
      }

      if (filters.status === 'suspended' && !u.suspended) {
        return false;
      }

      if (filters.status === 'erased' && !u.erased) {
        return false;
      }

      if (filters.role !== 'all' && u.role !== filters.role) {
        return false;
      }

      if (
        filters.phoneVerification === 'verified' &&
        !u.phone_verified
      ) {
        return false;
      }

      if (
        filters.phoneVerification === 'unverified' &&
        u.phone_verified
      ) {
        return false;
      }

      if (
        filters.emailVerification === 'verified' &&
        !u.email_verified
      ) {
        return false;
      }

      if (
        filters.emailVerification === 'unverified' &&
        u.email_verified
      ) {
        return false;
      }

      if (
        filters.kyc !== 'all' &&
        (u.kyc_status || 'none') !== filters.kyc
      ) {
        return false;
      }

      if (
        filters.acquisition !== 'all' &&
        (u.acquisition_type || 'organic') !== filters.acquisition
      ) {
        return false;
      }

      if (
        filters.signupBonus !== 'all' &&
        (u.signup_bonus_status || 'none') !== filters.signupBonus
      ) {
        return false;
      }

      if (
        filters.referralReward === 'granted' &&
        !u.referral_reward_granted
      ) {
        return false;
      }

      if (
        filters.referralReward === 'pending' &&
        (
          u.acquisition_type !== 'referral' ||
          u.referral_reward_granted
        )
      ) {
        return false;
      }

      if (
        filters.influencerReward === 'granted' &&
        !u.influencer_reward_granted
      ) {
        return false;
      }

      if (
        filters.influencerReward === 'pending' &&
        (
          u.acquisition_type !== 'influencer' ||
          u.influencer_reward_granted
        )
      ) {
        return false;
      }

      if (filters.joinedFrom) {
        const created = u.created_at
          ? new Date(u.created_at).getTime()
          : 0;

        const from = new Date(
          `${filters.joinedFrom}T00:00:00`
        ).getTime();

        if (!created || created < from) return false;
      }

      if (filters.joinedTo) {
        const created = u.created_at
          ? new Date(u.created_at).getTime()
          : 0;

        const to = new Date(
          `${filters.joinedTo}T23:59:59`
        ).getTime();

        if (!created || created > to) return false;
      }

      if (
        !moneyRange(
          u.wallet_balance,
          filters.walletMin,
          filters.walletMax
        )
      ) return false;

      if (
        !moneyRange(
          u.lifetime_topup,
          filters.topupMin,
          filters.topupMax
        )
      ) return false;

      if (
        !moneyRange(
          u.spent,
          filters.spentMin,
          filters.spentMax
        )
      ) return false;

      if (
        !moneyRange(
          u.winnings,
          filters.winningsMin,
          filters.winningsMax
        )
      ) return false;

      if (
        filters.contests === 'entered' &&
        num(u.contests_count) <= 0
      ) {
        return false;
      }

      if (
        filters.contests === 'none' &&
        num(u.contests_count) > 0
      ) {
        return false;
      }

      return true;
    });

    result = [...result].sort((a, b) => {
      switch (filters.sort) {
        case 'oldest':
          return (
            new Date(a.created_at || 0) -
            new Date(b.created_at || 0)
          );

        case 'wallet_high':
          return num(b.wallet_balance) - num(a.wallet_balance);

        case 'topup_high':
          return num(b.lifetime_topup) - num(a.lifetime_topup);

        case 'spent_high':
          return num(b.spent) - num(a.spent);

        case 'winnings_high':
          return num(b.winnings) - num(a.winnings);

        case 'tickets_high':
          return num(b.tickets) - num(a.tickets);

        case 'newest':
        default:
          return (
            new Date(b.created_at || 0) -
            new Date(a.created_at || 0)
          );
      }
    });

    return result;
  }, [users, q, filters]);

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => {
      if (key === 'sort') return value !== 'newest';
      return value !== '' && value !== 'all';
    }
  ).length + (q ? 1 : 0);

  return (
    <div
      className="space-y-5"
      data-testid="admin-users-page"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-extrabold">
            User Management
          </h2>

          <div className="text-sm text-slate-500 mt-1">
            {list.length} shown · {users.length} total users
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters(v => !v)}
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-[#6C2BFF] text-white text-xs min-w-5 h-5 px-1.5 inline-flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={clearFilters}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />

        <Input
          placeholder="Search name, email, username, phone, public ID, user ID, referral or influencer…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="pl-9"
          data-testid="admin-users-search"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-700">
          {selectedUserIds.size} selected <span className="font-normal text-slate-500">(max 200 per batch)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={selectFilteredUsers} disabled={!list.length}>
            Select filtered ({Math.min(list.length, 200)})
          </Button>
          <Button type="button" variant="outline" onClick={clearSelection} disabled={!selectedUserIds.size}>
            Clear selection
          </Button>
          <Button type="button" variant="outline" onClick={() => { openBulkAction('credit'); setBulkAmount('1'); }} disabled={!selectedUserIds.size}>
            <Coins className="mr-2 h-4 w-4" /> Credit tokens
          </Button>
          <Button type="button" variant="outline" onClick={() => openBulkAction('sms_grant')} disabled={!selectedUserIds.size}>
            <MessageSquare className="mr-2 h-4 w-4" /> Grant SMS consent
          </Button>
          <Button type="button" variant="outline" onClick={() => openBulkAction('sms_revoke')} disabled={!selectedUserIds.size}>
            Revoke SMS consent
          </Button>
        </div>
      </div>

      {bulkAction && (
        <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4" data-testid="bulk-user-action-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">
                {bulkAction === 'credit' ? 'Credit tokens' : bulkAction === 'sms_grant' ? 'Bulk SMS consent grant' : 'Bulk SMS consent revoke'}
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                {bulkAction === 'credit'
                  ? `Credit each selected wallet; up to ${selectedUserIds.size} users will receive the same amount. Choose the token type; bonus tokens may expire, purchased/general tokens keep their existing behavior.`
                  : bulkAction === 'sms_grant'
                    ? 'This records consent only; it does not send SMS. Verified phone and documented express opt-in are required.'
                    : 'This revokes SMS consent for selected accounts and is individually audited.'}
              </p>
            </div>
            <button type="button" onClick={() => setBulkAction('')} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Close</button>
          </div>

          {bulkAction === 'credit' && (
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <label className="text-xs font-bold text-slate-600">
                Token type
                <select value={bulkCreditType} onChange={event => setBulkCreditType(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal" data-testid="bulk-credit-type">
                  <option value="purchased">Purchased / general (existing behavior)</option>
                  <option value="bonus">Bonus tokens</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">
                Tokens per user
                <Input type="number" min="0.01" max="500" step="0.01" value={bulkAmount} onChange={event => setBulkAmount(event.target.value)} className="mt-1 bg-white" data-testid="bulk-credit-amount" />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Reason (10+ characters)
                <Input value={bulkNote} onChange={event => setBulkNote(event.target.value)} placeholder="Document why these wallets are being credited" className="mt-1 bg-white" data-testid="bulk-credit-reason" />
              </label>
              {bulkCreditType === 'bonus' ? (
                <>
                  <label className="text-xs font-bold text-slate-600">
                    Expiry
                    <select value={expiryChoice} onChange={event => setExpiryChoice(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal" data-testid="bonus-expiry-select">
                      {EXPIRY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  {expiryChoice === 'custom_days' && (
                <label className="text-xs font-bold text-slate-600">
                  Days until expiry
                  <Input type="number" min="1" max="3650" value={expiryCustomDays} onChange={event => setExpiryCustomDays(event.target.value)} className="mt-1 bg-white" data-testid="bonus-expiry-days" />
                </label>
                  )}
                  {expiryChoice === 'custom_date' && (
                <label className="text-xs font-bold text-slate-600">
                  Expires at end of (UK date)
                  <Input type="date" value={expiryCustomDate} onChange={event => setExpiryCustomDate(event.target.value)} className="mt-1 bg-white" data-testid="bonus-expiry-date" />
                </label>
                  )}
                  <p className="text-[11px] text-slate-500 sm:col-span-2" data-testid="bonus-expiry-summary">
                    {expiryDescription(expiryChoice, expiryCustomDays, expiryCustomDate) || 'Choose a valid expiry.'} Spent tokens are never deducted again; only the unused remainder expires, and purchased tokens and winnings are never touched.
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-slate-500 sm:col-span-2">Purchased/general tokens retain the existing no-expiry behavior.</p>
              )}
            </div>
          )}

          {bulkAction === 'sms_grant' && (
            <label className="block text-xs font-bold text-slate-600">
              Explicit consent evidence (20+ characters)
              <textarea value={consentEvidence} onChange={event => setConsentEvidence(event.target.value)} placeholder="Record where and when each selected user opted in. Only users with verified phones will be updated." rows={3} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal" data-testid="bulk-sms-evidence" />
            </label>
          )}

          {bulkAction === 'sms_revoke' && (
            <label className="block text-xs font-bold text-slate-600">
              Reason (10+ characters)
              <Input value={bulkNote} onChange={event => setBulkNote(event.target.value)} placeholder="Document the reason for revocation" className="mt-1 bg-white" data-testid="bulk-sms-revoke-reason" />
            </label>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBulkAction('')} disabled={bulkBusy}>Cancel</Button>
            <Button type="button" onClick={submitBulkAction} disabled={bulkBusy} data-testid="bulk-user-action-submit">
              {bulkBusy ? 'Applying…' : `Apply to ${selectedUserIds.size} users`}
            </Button>
          </div>
        </section>
      )}

      {showFilters && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <Select
              value={filters.status}
              onChange={e => setFilter('status', e.target.value)}
            >
              <option value="all">All account statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="erased">Erased</option>
            </Select>

            <Select
              value={filters.role}
              onChange={e => setFilter('role', e.target.value)}
            >
              <option value="all">All roles</option>
              {ROLES.map(role => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>

            <Select
              value={filters.phoneVerification}
              onChange={e =>
                setFilter('phoneVerification', e.target.value)
              }
            >
              <option value="all">Any phone status</option>
              <option value="verified">Phone verified</option>
              <option value="unverified">Phone unverified</option>
            </Select>

            <Select
              value={filters.emailVerification}
              onChange={e =>
                setFilter('emailVerification', e.target.value)
              }
            >
              <option value="all">Any email status</option>
              <option value="verified">Email verified</option>
              <option value="unverified">Email unverified</option>
            </Select>

            <Select
              value={filters.kyc}
              onChange={e => setFilter('kyc', e.target.value)}
            >
              <option value="all">All KYC</option>
              <option value="approved">KYC approved</option>
              <option value="pending">KYC pending</option>
              <option value="rejected">KYC rejected</option>
              <option value="none">No KYC</option>
            </Select>

            <Select
              value={filters.acquisition}
              onChange={e =>
                setFilter('acquisition', e.target.value)
              }
            >
              <option value="all">All acquisition</option>
              <option value="organic">Organic</option>
              <option value="referral">Referral</option>
              <option value="influencer">Influencer</option>
            </Select>

            <Select
              value={filters.signupBonus}
              onChange={e =>
                setFilter('signupBonus', e.target.value)
              }
            >
              <option value="all">Any signup bonus</option>
              <option value="granted">Signup bonus granted</option>
              <option value="eligible">Signup bonus eligible</option>
              <option value="none">No signup bonus</option>
            </Select>

            <Select
              value={filters.referralReward}
              onChange={e =>
                setFilter('referralReward', e.target.value)
              }
            >
              <option value="all">Any referral reward</option>
              <option value="granted">Referral rewarded</option>
              <option value="pending">Referral pending</option>
            </Select>

            <Select
              value={filters.influencerReward}
              onChange={e =>
                setFilter('influencerReward', e.target.value)
              }
            >
              <option value="all">Any influencer reward</option>
              <option value="granted">Influencer rewarded</option>
              <option value="pending">Influencer pending</option>
            </Select>

            <Select
              value={filters.contests}
              onChange={e =>
                setFilter('contests', e.target.value)
              }
            >
              <option value="all">Any contest activity</option>
              <option value="entered">Entered contests</option>
              <option value="none">No contests</option>
            </Select>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Registration date
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Input
                type="date"
                value={filters.joinedFrom}
                onChange={e =>
                  setFilter('joinedFrom', e.target.value)
                }
              />

              <Input
                type="date"
                value={filters.joinedTo}
                onChange={e =>
                  setFilter('joinedTo', e.target.value)
                }
              />

              <div />

              <Select
                value={filters.sort}
                onChange={e => setFilter('sort', e.target.value)}
              >
                <option value="newest">Newest registrations</option>
                <option value="oldest">Oldest registrations</option>
                <option value="wallet_high">Highest wallet</option>
                <option value="topup_high">Highest top-up</option>
                <option value="spent_high">Highest spend</option>
                <option value="winnings_high">Highest winnings</option>
                <option value="tickets_high">Most tickets</option>
              </Select>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Financial ranges (£)
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                ['Wallet', 'walletMin', 'walletMax'],
                ['Lifetime Top-up', 'topupMin', 'topupMax'],
                ['Spend', 'spentMin', 'spentMax'],
                ['Winnings', 'winningsMin', 'winningsMax'],
              ].map(([label, minKey, maxKey]) => (
                <div
                  key={label}
                  className="border border-slate-100 rounded-xl p-3"
                >
                  <div className="text-xs font-semibold text-slate-600 mb-2">
                    {label}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Min"
                      value={filters[minKey]}
                      onChange={e =>
                        setFilter(minKey, e.target.value)
                      }
                    />

                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Max"
                      value={filters[maxKey]}
                      onChange={e =>
                        setFilter(maxKey, e.target.value)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border rounded-xl p-3">
          <UsersIcon className="w-4 h-4 text-indigo-500 mb-1" />
          <div className="text-xl font-extrabold">{list.length}</div>
          <div className="text-xs text-slate-500">Filtered users</div>
        </div>

        <div className="bg-white border rounded-xl p-3">
          <Wallet className="w-4 h-4 text-emerald-500 mb-1" />
          <div className="text-xl font-extrabold">
            {gbp(list.reduce(
              (sum, u) => sum + num(u.wallet_balance),
              0
            ))}
          </div>
          <div className="text-xs text-slate-500">Wallet balance</div>
        </div>

        <div className="bg-white border rounded-xl p-3">
          <Ticket className="w-4 h-4 text-blue-500 mb-1" />
          <div className="text-xl font-extrabold">
            {list.reduce((sum, u) => sum + num(u.tickets), 0)}
          </div>
          <div className="text-xs text-slate-500">Tickets</div>
        </div>

        <div className="bg-white border rounded-xl p-3">
          <Trophy className="w-4 h-4 text-amber-500 mb-1" />
          <div className="text-xl font-extrabold">
            {gbp(list.reduce(
              (sum, u) => sum + num(u.winnings),
              0
            ))}
          </div>
          <div className="text-xs text-slate-500">Winnings</div>
        </div>

        <div className="bg-white border rounded-xl p-3">
          <UserPlus className="w-4 h-4 text-purple-500 mb-1" />
          <div className="text-xl font-extrabold">
            {list.filter(
              u => u.acquisition_type === 'influencer'
            ).length}
          </div>
          <div className="text-xs text-slate-500">Influencer users</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
        {list.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3">
              <UsersIcon className="w-6 h-6 text-slate-400" />
            </div>

            <div className="text-slate-500 text-sm">
              No users match the selected filters.
            </div>

            <Button
              variant="outline"
              className="mt-4"
              onClick={clearFilters}
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[1750px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3 w-10">
                  <button
                    type="button"
                    onClick={() => list.every(user => selectedUserIds.has(user.user_id)) ? setSelectedUserIds(new Set()) : selectFilteredUsers()}
                    aria-label="Select filtered users"
                    title="Select filtered users"
                    className="text-slate-500 hover:text-indigo-700"
                  >
                    {list.length > 0 && list.every(user => selectedUserIds.has(user.user_id))
                      ? <CheckSquare className="h-4 w-4" />
                      : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="text-left p-3">Public ID</th>
                <th className="text-left p-3">User</th>
                <th className="text-left p-3">Contact</th>
                <th className="text-left p-3">Registered</th>
                <th className="text-left p-3">Phone</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">SMS Consent</th>
                <th className="text-left p-3">KYC</th>
                <th className="text-left p-3">Source</th>
                <th className="text-right p-3">Wallet</th>
                <th className="text-right p-3">Top-up</th>
                <th className="text-right p-3">Spent</th>
                <th className="text-right p-3">Winnings</th>
                <th className="text-right p-3">Contests</th>
                <th className="text-right p-3">Tickets</th>
                <th className="text-left p-3">Rewards</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>

            <tbody>
              {list.map(u => (
                <tr
                  key={u.user_id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                  data-testid={`user-row-${u.user_id}`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(u.user_id)}
                      onChange={() => toggleUserSelection(u.user_id)}
                      aria-label={`Select ${u.name || u.email || 'user'}`}
                      data-testid={`select-user-${u.user_id}`}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="p-3 font-mono text-xs font-bold text-indigo-700">
                    <Link
                      to={`/admin/users/${u.user_id}`}
                      className="hover:underline"
                    >
                      {u.public_id || '—'}
                    </Link>
                  </td>

                  <td className="p-3">
                    <div className="font-semibold text-slate-900">
                      {u.name || '—'}
                    </div>

                    <div className="text-xs text-slate-500">
                      @{u.username || '—'}
                    </div>

                    <div className="font-mono text-[10px] text-slate-400 mt-1">
                      {u.user_id}
                    </div>
                  </td>

                  <td className="p-3">
                    <div className="text-slate-700">
                      {u.email || '—'}
                    </div>

                    <div className="text-xs text-slate-500 mt-1">
                      {u.phone || 'No phone'}
                    </div>
                  </td>

                  <td className="p-3 text-xs text-slate-500">
                    {fmtDate(u.created_at)}
                  </td>

                  <td className="p-3">
                    <VerifiedPill verified={!!u.phone_verified} />
                  </td>

                  <td className="p-3">
                    <VerifiedPill verified={!!u.email_verified} />
                  </td>

                  <td className="p-3" data-testid={`sms-consent-${u.user_id}`}>
                    {u.sms_consent ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Enabled</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500 font-semibold">Disabled</span>
                    )}
                  </td>

                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      u.kyc_status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : u.kyc_status === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : u.kyc_status === 'rejected'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {u.kyc_status || 'none'}
                    </span>
                  </td>

                  <td className="p-3">
                    <div className="font-semibold capitalize text-xs">
                      {u.acquisition_type || 'organic'}
                    </div>

                    {u.influencer_code && (
                      <div className="text-[11px] text-purple-600 mt-1">
                        {u.influencer_code}
                      </div>
                    )}

                    {u.joined_referral_code && (
                      <div className="text-[11px] text-blue-600 mt-1">
                        {u.joined_referral_code}
                      </div>
                    )}
                  </td>

                  <td className="p-3 text-right font-semibold">
                    {gbp(u.wallet_balance)}
                  </td>

                  <td className="p-3 text-right">
                    {gbp(u.lifetime_topup)}
                  </td>

                  <td className="p-3 text-right">
                    {gbp(u.spent)}
                  </td>

                  <td className="p-3 text-right">
                    {gbp(u.winnings)}
                  </td>

                  <td className="p-3 text-right">
                    {u.contests_count || 0}
                  </td>

                  <td className="p-3 text-right">
                    {u.tickets || 0}
                  </td>

                  <td className="p-3">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {u.signup_bonus_status === 'granted' && (
                        <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                          Signup ✓
                        </span>
                      )}

                      {u.referral_reward_granted && (
                        <span className="text-[10px] px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                          Referral ✓
                        </span>
                      )}

                      {u.influencer_reward_granted && (
                        <span className="text-[10px] px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                          Influencer ✓
                        </span>
                      )}

                      {u.signup_bonus_status !== 'granted' &&
                       !u.referral_reward_granted &&
                       !u.influencer_reward_granted && (
                        <span className="text-xs text-slate-400">
                          —
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-3">
                    {editing === u.user_id ? (
                      <select
                        autoFocus
                        defaultValue={u.role}
                        onBlur={() => setEditing(null)}
                        onChange={e =>
                          setRole(u.user_id, e.target.value)
                        }
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditing(u.user_id)}
                        className={`text-xs px-2 py-1 rounded-full ${
                          ROLE_COLORS[u.role] || ROLE_COLORS.user
                        }`}
                      >
                        {u.role} ✎
                      </button>
                    )}
                  </td>

                  <td className="p-3">
                    {u.erased ? (
                      <span className="text-xs text-slate-500">
                        Erased
                      </span>
                    ) : u.suspended ? (
                      <span className="text-xs text-rose-600 inline-flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        Suspended
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Active
                      </span>
                    )}
                  </td>

                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <Link to={`/admin/users/${u.user_id}`}>
                          View 360°
                        </Link>
                      </Button>

                      {!u.erased && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleSuspend(u)}
                          className={
                            u.suspended
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                          }
                        >
                          {u.suspended
                            ? 'Unsuspend'
                            : 'Suspend'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
