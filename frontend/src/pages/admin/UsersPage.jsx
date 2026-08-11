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
  Wallet, Trophy, Ticket, Gift, UserPlus,
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
                <th className="text-left p-3">Public ID</th>
                <th className="text-left p-3">User</th>
                <th className="text-left p-3">Contact</th>
                <th className="text-left p-3">Registered</th>
                <th className="text-left p-3">Phone</th>
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
