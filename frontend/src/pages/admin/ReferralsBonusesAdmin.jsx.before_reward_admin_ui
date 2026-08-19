import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Gift,
  Users,
  Coins,
  Search,
  CheckCircle2,
  Clock,
  CreditCard,
  Ticket,
  RefreshCw,
} from 'lucide-react';

import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';


const Metric = ({ label, value, Icon, note }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500">
          {label}
        </div>

        <div className="font-display text-3xl font-black text-slate-900 mt-1">
          {value}
        </div>

        {note && (
          <div className="text-[11px] text-slate-400 mt-1">
            {note}
          </div>
        )}
      </div>

      <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
        <Icon className="w-5 h-5 text-violet-600" />
      </div>
    </div>
  </div>
);


const Status = ({ children, tone = 'slate' }) => {
  const classes = {
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    violet: 'bg-violet-100 text-violet-700',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <span
      className={`inline-flex px-2 py-1 rounded-full text-[11px] font-semibold ${
        classes[tone] || classes.slate
      }`}
    >
      {children}
    </span>
  );
};


const fmtDate = (value) => {
  if (!value) return '—';

  try {
    return new Date(value).toLocaleString('en-GB');
  } catch {
    return '—';
  }
};


export default function ReferralsBonusesAdmin() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [query, setQuery] = useState('');
  const [refFilter, setRefFilter] = useState('all');
  const [bonusFilter, setBonusFilter] = useState('all');

  const load = async () => {
    setState('loading');

    try {
      const r = await api.get('/admin/referrals-bonuses');
      setData(r.data);
      setState('ok');
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    load();
  }, []);


  const filteredReferrals = useMemo(() => {
    const rows = data?.referrals || [];
    const q = query.trim().toLowerCase();

    return rows.filter((r) => {
      const searchable = [
        r.referrer_name,
        r.referrer_email,
        r.referrer_public_id,
        r.referred_name,
        r.referred_email,
        r.referred_public_id,
        r.code,
        r.referral_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (q && !searchable.includes(q)) return false;

      if (refFilter === 'rewarded') {
        return r.reward_granted || r.status === 'completed';
      }

      if (refFilter === 'waiting_topup') {
        return (
          r.status !== 'completed' &&
          !r.topup_qualified
        );
      }

      if (refFilter === 'waiting_contest') {
        return (
          r.status !== 'completed' &&
          r.topup_qualified &&
          !r.contest_entered
        );
      }

      if (refFilter === 'processing') {
        return (
          r.status !== 'completed' &&
          r.topup_qualified &&
          r.contest_entered &&
          !r.reward_granted
        );
      }

      return true;
    });
  }, [data, query, refFilter]);


  const filteredBonuses = useMemo(() => {
    const rows = data?.signup_bonuses || [];
    const q = query.trim().toLowerCase();

    return rows.filter((u) => {
      const searchable = [
        u.name,
        u.email,
        u.public_id,
        u.user_id,
        u.referral_code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (q && !searchable.includes(q)) return false;

      if (bonusFilter === 'granted') {
        return u.signup_bonus_granted === true;
      }

      if (bonusFilter === 'waiting_topup') {
        return (
          u.signup_bonus_offer_eligible === true &&
          !u.qualifying_topup_completed &&
          !u.signup_bonus_granted
        );
      }

      if (bonusFilter === 'qualified') {
        return (
          u.qualifying_topup_completed === true &&
          !u.signup_bonus_granted
        );
      }

      return true;
    });
  }, [data, query, bonusFilter]);


  if (state === 'loading') {
    return (
      <div className="p-6 text-slate-500">
        Loading referrals & bonuses…
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <div className="font-bold text-rose-700">
            Could not load referral dashboard
          </div>

          <Button
            onClick={load}
            variant="outline"
            className="mt-3"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const summary = data?.summary || {};
  const rules = data?.rules || {};

  return (
    <div
      className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-6"
      data-testid="admin-referrals-bonuses"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-violet-700 text-xs uppercase tracking-widest font-bold">
            <Gift className="w-4 h-4" />
            Rewards Operations
          </div>

          <h1 className="font-display text-3xl font-extrabold text-slate-900 mt-1">
            Referrals & Bonuses
          </h1>

          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Read-only production tracking for signup bonuses and referral
            qualification. Rewards remain controlled automatically by verified
            payment and contest-entry events.
          </p>
        </div>

        <Button
          onClick={load}
          variant="outline"
          data-testid="admin-referrals-refresh"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Rules */}
      <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
        <div className="font-semibold text-violet-900 text-sm">
          Current programme rules
        </div>

        <div className="text-xs text-violet-800 mt-1">
          Normal wallet minimum: £{rules.minimum_wallet_topup_gbp ?? 5}.
          {' '}Signup bonus: one verified £{rules.signup_qualifying_topup_gbp ?? 10}+
          top-up → {rules.signup_bonus_tokens ?? 5} tokens.
          {' '}Referral: referred user completes one verified
          £{rules.referral_qualifying_topup_gbp ?? 10}+ top-up and enters
          {` ${rules.referral_required_contest_entries ?? 1} `}
          contest → referrer receives {rules.referral_reward_tokens ?? 5} tokens.
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <Metric
          label="Signup eligible"
          value={summary.signup_eligible ?? 0}
          Icon={Users}
        />

        <Metric
          label="Signup bonuses"
          value={summary.signup_granted ?? 0}
          Icon={Gift}
          note={`${summary.signup_tokens_granted ?? 0} tokens granted`}
        />

        <Metric
          label="Signup waiting £10"
          value={summary.signup_waiting_topup ?? 0}
          Icon={CreditCard}
        />

        <Metric
          label="Referrals"
          value={summary.referrals_total ?? 0}
          Icon={Users}
        />

        <Metric
          label="Referral rewarded"
          value={summary.referral_rewarded ?? 0}
          Icon={CheckCircle2}
          note={`${summary.referral_tokens_granted ?? 0} tokens granted`}
        />

        <Metric
          label="Total bonus tokens"
          value={summary.total_bonus_tokens_granted ?? 0}
          Icon={Coins}
        />
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="relative">
          <Search className="absolute w-4 h-4 left-3 top-1/2 -translate-y-1/2 text-slate-400" />

          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            placeholder="Search user, email, PL ID, referral code or referral ID…"
            data-testid="admin-referrals-search"
          />
        </div>
      </div>

      {/* Referral table */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-lg">
              Referral tracking
            </h2>

            <p className="text-xs text-slate-500">
              {filteredReferrals.length} records shown
            </p>
          </div>

          <select
            value={refFilter}
            onChange={(e) => setRefFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white"
            data-testid="admin-referral-filter"
          >
            <option value="all">All referrals</option>
            <option value="waiting_topup">Waiting for £10 top-up</option>
            <option value="waiting_contest">Waiting for contest entry</option>
            <option value="processing">Processing reward</option>
            <option value="rewarded">Rewarded</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">Referrer</th>
                <th className="text-left px-4 py-3">Referred user</th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">£10 top-up</th>
                <th className="text-left px-4 py-3">Contest</th>
                <th className="text-left px-4 py-3">Reward</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">References</th>
              </tr>
            </thead>

            <tbody>
              {filteredReferrals.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    No referral records match this filter.
                  </td>
                </tr>
              ) : (
                filteredReferrals.map((r) => {
                  let tone = 'amber';

                  if (r.reward_granted || r.status === 'completed') {
                    tone = 'emerald';
                  } else if (r.topup_qualified && !r.contest_entered) {
                    tone = 'blue';
                  } else if (
                    r.topup_qualified &&
                    r.contest_entered
                  ) {
                    tone = 'violet';
                  }

                  return (
                    <tr
                      key={r.referral_id}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/users/${r.referrer_user_id}`}
                          className="font-semibold text-violet-700 hover:underline"
                        >
                          {r.referrer_name ||
                            r.referrer_public_id ||
                            'Referrer'}
                        </Link>

                        <div className="text-slate-400 mt-0.5">
                          {r.referrer_public_id || ''}
                        </div>

                        <div className="text-slate-400 truncate max-w-[210px]">
                          {r.referrer_email || ''}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/users/${r.referred_user_id}`}
                          className="font-semibold text-violet-700 hover:underline"
                        >
                          {r.referred_name ||
                            r.referred_public_id ||
                            'Referred user'}
                        </Link>

                        <div className="text-slate-400 mt-0.5">
                          {r.referred_public_id || ''}
                        </div>

                        <div className="text-slate-400 truncate max-w-[210px]">
                          {r.referred_email || ''}
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono">
                        {r.code || '—'}
                      </td>

                      <td className="px-4 py-3">
                        {r.topup_qualified ? (
                          <>
                            <Status tone="emerald">✓ Qualified</Status>

                            <div className="text-slate-400 mt-1">
                              {r.topup_amount_gbp != null
                                ? `£${Number(r.topup_amount_gbp).toFixed(2)}`
                                : ''}
                            </div>

                            <div className="text-slate-400">
                              {fmtDate(r.topup_qualified_at)}
                            </div>
                          </>
                        ) : (
                          <Status tone="amber">Waiting</Status>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {r.contest_entered ? (
                          <>
                            <Status tone="emerald">✓ Entered</Status>

                            <div className="text-slate-400 mt-1">
                              {fmtDate(r.contest_entered_at)}
                            </div>
                          </>
                        ) : (
                          <Status tone="amber">Waiting</Status>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {r.reward_granted ? (
                          <>
                            <Status tone="emerald">
                              +{r.reward_tokens || 5} tokens
                            </Status>

                            <div className="text-slate-400 mt-1">
                              {fmtDate(r.completed_at)}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <Status tone={tone}>
                          {r.display_status ||
                            r.status ||
                            'Pending'}
                        </Status>
                      </td>

                      <td className="px-4 py-3">
                        <div className="space-y-1 max-w-[230px]">
                          {r.topup_session_id && (
                            <div>
                              <span className="text-slate-400">Stripe </span>
                              <span className="font-mono break-all">
                                {r.topup_session_id}
                              </span>
                            </div>
                          )}

                          {r.first_contest_order_id && (
                            <div>
                              <span className="text-slate-400">Order </span>
                              <span className="font-mono break-all">
                                {r.first_contest_order_id}
                              </span>
                            </div>
                          )}

                          {r.reward_tx_id && (
                            <div>
                              <span className="text-slate-400">Reward TX </span>
                              <span className="font-mono break-all">
                                {r.reward_tx_id}
                              </span>
                            </div>
                          )}

                          {!r.topup_session_id &&
                            !r.first_contest_order_id &&
                            !r.reward_tx_id && (
                              <span className="text-slate-400">—</span>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Signup bonus table */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-lg">
              Signup bonus tracking
            </h2>

            <p className="text-xs text-slate-500">
              {filteredBonuses.length} eligible/qualifying users shown
            </p>
          </div>

          <select
            value={bonusFilter}
            onChange={(e) => setBonusFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white"
            data-testid="admin-signup-bonus-filter"
          >
            <option value="all">All bonus users</option>
            <option value="waiting_topup">Waiting for £10 top-up</option>
            <option value="qualified">Qualified / processing</option>
            <option value="granted">Granted</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Joined</th>
                <th className="text-left px-4 py-3">Eligibility</th>
                <th className="text-left px-4 py-3">£10 top-up</th>
                <th className="text-left px-4 py-3">Signup bonus</th>
                <th className="text-left px-4 py-3">References</th>
              </tr>
            </thead>

            <tbody>
              {filteredBonuses.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    No signup bonus records match this filter.
                  </td>
                </tr>
              ) : (
                filteredBonuses.map((u) => (
                  <tr
                    key={u.user_id}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/users/${u.user_id}`}
                        className="font-semibold text-violet-700 hover:underline"
                      >
                        {u.name || u.public_id || 'User'}
                      </Link>

                      <div className="text-slate-400">
                        {u.public_id || ''}
                      </div>

                      <div className="text-slate-400 truncate max-w-[240px]">
                        {u.email || ''}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {fmtDate(u.created_at)}
                    </td>

                    <td className="px-4 py-3">
                      {u.signup_bonus_offer_eligible ? (
                        <Status tone="emerald">Eligible</Status>
                      ) : (
                        <Status>Not eligible</Status>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {u.qualifying_topup_completed ? (
                        <>
                          <Status tone="emerald">✓ Qualified</Status>

                          <div className="mt-1 text-slate-400">
                            {u.qualifying_topup_amount_gbp != null
                              ? `£${Number(
                                  u.qualifying_topup_amount_gbp
                                ).toFixed(2)}`
                              : ''}
                          </div>

                          <div className="text-slate-400">
                            {fmtDate(u.qualifying_topup_at)}
                          </div>
                        </>
                      ) : (
                        <Status tone="amber">Waiting for £10</Status>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {u.signup_bonus_granted ? (
                        <>
                          <Status tone="emerald">
                            +{u.signup_bonus_tokens || 5} tokens
                          </Status>

                          <div className="text-slate-400 mt-1">
                            {fmtDate(u.signup_bonus_granted_at)}
                          </div>
                        </>
                      ) : u.qualifying_topup_completed ? (
                        <Status tone="violet">Processing</Status>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="space-y-1 max-w-[260px]">
                        {u.qualifying_topup_session_id && (
                          <div>
                            <span className="text-slate-400">Stripe </span>
                            <span className="font-mono break-all">
                              {u.qualifying_topup_session_id}
                            </span>
                          </div>
                        )}

                        {u.signup_bonus_tx_id && (
                          <div>
                            <span className="text-slate-400">Bonus TX </span>
                            <span className="font-mono break-all">
                              {u.signup_bonus_tx_id}
                            </span>
                          </div>
                        )}

                        {!u.qualifying_topup_session_id &&
                          !u.signup_bonus_tx_id && (
                            <span className="text-slate-400">—</span>
                          )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Operational status */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Clock className="w-5 h-5 text-amber-600" />

          <div className="font-bold mt-2">
            {summary.referral_waiting_topup ?? 0}
          </div>

          <div className="text-xs text-amber-800">
            referrals waiting for £10 top-up
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <Ticket className="w-5 h-5 text-blue-600" />

          <div className="font-bold mt-2">
            {summary.referral_waiting_contest ?? 0}
          </div>

          <div className="text-xs text-blue-800">
            referrals waiting for contest entry
          </div>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <Gift className="w-5 h-5 text-violet-600" />

          <div className="font-bold mt-2">
            {summary.referral_processing ?? 0}
          </div>

          <div className="text-xs text-violet-800">
            referral rewards processing
          </div>
        </div>
      </div>
    </div>
  );
}
