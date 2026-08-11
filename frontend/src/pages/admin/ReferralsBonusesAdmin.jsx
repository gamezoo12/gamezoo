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
  Save,
  Plus,
  Megaphone,
  Power,
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
    rose: 'bg-rose-100 text-rose-700',
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


const emptyPromo = {
  code: '',
  influencer_name: '',
  campaign_name: '',
  reward_tokens: '',
  qualifying_topup_gbp: '',
  contest_entry_required: '',
  max_redemptions: 0,
  starts_at: '',
  expires_at: '',
  active: true,
};


export default function ReferralsBonusesAdmin() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');

  const [query, setQuery] = useState('');
  const [refFilter, setRefFilter] = useState('all');
  const [bonusFilter, setBonusFilter] = useState('all');

  const [rewardSettings, setRewardSettings] = useState(null);
  const [savingRewards, setSavingRewards] = useState(false);

  const [promoForm, setPromoForm] = useState(emptyPromo);
  const [creatingPromo, setCreatingPromo] = useState(false);

  const [message, setMessage] = useState(null);


  const load = async () => {
    setState('loading');

    try {
      const r = await api.get('/admin/referrals-bonuses');

      setData(r.data);
      setRewardSettings(r.data?.reward_settings || null);

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
        return r.status !== 'completed' && !r.topup_qualified;
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


  const saveRewards = async () => {
    if (!rewardSettings) return;

    setSavingRewards(true);
    setMessage(null);

    try {
      const saved = await api.put(
        '/admin/reward-settings',
        rewardSettings
      );

      setRewardSettings(saved.data);

      setMessage({
        type: 'success',
        text: 'Reward settings saved successfully.',
      });

      await load();
    } catch (e) {
      setMessage({
        type: 'error',
        text:
          e?.response?.data?.detail ||
          'Could not save reward settings.',
      });
    } finally {
      setSavingRewards(false);
    }
  };


  const createPromo = async () => {
    if (!promoForm.code.trim() || !promoForm.influencer_name.trim()) {
      setMessage({
        type: 'error',
        text: 'Promo code and influencer name are required.',
      });
      return;
    }

    setCreatingPromo(true);
    setMessage(null);

    try {
      const payload = {
        code: promoForm.code.trim(),
        influencer_name: promoForm.influencer_name.trim(),
        campaign_name: promoForm.campaign_name.trim(),

        reward_tokens:
          promoForm.reward_tokens === ''
            ? null
            : Number(promoForm.reward_tokens),

        qualifying_topup_gbp:
          promoForm.qualifying_topup_gbp === ''
            ? null
            : Number(promoForm.qualifying_topup_gbp),

        contest_entry_required:
          promoForm.contest_entry_required === ''
            ? null
            : promoForm.contest_entry_required === 'true',

        max_redemptions:
          Number(promoForm.max_redemptions) || 0,

        starts_at:
          promoForm.starts_at
            ? new Date(promoForm.starts_at).toISOString()
            : null,

        expires_at:
          promoForm.expires_at
            ? new Date(promoForm.expires_at).toISOString()
            : null,

        active: promoForm.active,
      };

      await api.post('/admin/influencer-promos', payload);

      setPromoForm(emptyPromo);

      setMessage({
        type: 'success',
        text: 'Influencer promo code created.',
      });

      await load();
    } catch (e) {
      setMessage({
        type: 'error',
        text:
          e?.response?.data?.detail ||
          'Could not create influencer promo code.',
      });
    } finally {
      setCreatingPromo(false);
    }
  };


  const togglePromo = async (promo) => {
    setMessage(null);

    try {
      await api.put(
        `/admin/influencer-promos/${promo.promo_id}`,
        {
          active: !promo.active,
        }
      );

      setMessage({
        type: 'success',
        text: `${promo.code} ${
          promo.active ? 'disabled' : 'enabled'
        }.`,
      });

      await load();
    } catch (e) {
      setMessage({
        type: 'error',
        text:
          e?.response?.data?.detail ||
          'Could not update influencer promo.',
      });
    }
  };


  if (state === 'loading') {
    return (
      <div className="p-6 text-slate-500">
        Loading rewards dashboard…
      </div>
    );
  }


  if (state === 'error') {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <div className="font-bold text-rose-700">
            Could not load rewards dashboard
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
  const promos = data?.influencer_promos || [];
  const attributions = data?.influencer_attributions || [];


  return (
    <div
      className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-6"
      data-testid="admin-referrals-bonuses"
    >
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-violet-700 text-xs uppercase tracking-widest font-bold">
            <Gift className="w-4 h-4" />
            Rewards Operations
          </div>

          <h1 className="font-display text-3xl font-extrabold text-slate-900 mt-1">
            Referrals, Bonuses & Influencers
          </h1>

          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Manage reward values and influencer campaigns while verified
            production events remain responsible for granting tokens.
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


      {/* MESSAGE */}
      {message && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {message.text}
        </div>
      )}


      {/* MAIN METRICS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <Metric
          label="Signup eligible"
          value={summary.signup_eligible ?? 0}
          Icon={Users}
        />

        <Metric
          label="Signup rewards"
          value={summary.signup_granted ?? 0}
          Icon={Gift}
          note={`${summary.signup_tokens_granted ?? 0} tokens`}
        />

        <Metric
          label="Referrals"
          value={summary.referrals_total ?? 0}
          Icon={Users}
        />

        <Metric
          label="Referral rewards"
          value={summary.referral_rewarded ?? 0}
          Icon={CheckCircle2}
          note={`${summary.referral_tokens_granted ?? 0} tokens`}
        />

        <Metric
          label="Influencer signups"
          value={summary.influencer_signups ?? 0}
          Icon={Megaphone}
        />

        <Metric
          label="Influencer rewards"
          value={summary.influencer_rewards_issued ?? 0}
          Icon={Gift}
          note={`${summary.influencer_tokens_granted ?? 0} tokens`}
        />

        <Metric
          label="Pending influencer"
          value={summary.influencer_pending ?? 0}
          Icon={Clock}
        />

        <Metric
          label="All bonus tokens"
          value={summary.total_bonus_tokens_granted ?? 0}
          Icon={Coins}
        />
      </div>


      {/* REWARD SETTINGS */}
      {rewardSettings && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="font-display text-xl font-bold text-slate-900">
              Reward Settings
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              These values control future qualifying rewards. Previously
              granted rewards are not changed.
            </p>
          </div>

          <div className="p-5 grid lg:grid-cols-3 gap-5">

            {/* SIGNUP */}
            <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
              <div className="font-bold text-violet-900">
                Signup Bonus
              </div>

              <label className="block text-xs font-semibold mt-4 mb-1">
                Reward tokens
              </label>

              <Input
                type="number"
                min="0"
                step="1"
                value={rewardSettings.signup_reward_tokens}
                onChange={(e) =>
                  setRewardSettings({
                    ...rewardSettings,
                    signup_reward_tokens: Number(e.target.value),
                  })
                }
              />

              <label className="block text-xs font-semibold mt-3 mb-1">
                Qualifying top-up (£)
              </label>

              <Input
                type="number"
                min="0"
                step="0.01"
                value={rewardSettings.signup_qualifying_topup_gbp}
                onChange={(e) =>
                  setRewardSettings({
                    ...rewardSettings,
                    signup_qualifying_topup_gbp:
                      Number(e.target.value),
                  })
                }
              />
            </div>


            {/* REFERRAL */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="font-bold text-blue-900">
                Referral Bonus
              </div>

              <label className="block text-xs font-semibold mt-4 mb-1">
                Reward tokens
              </label>

              <Input
                type="number"
                min="0"
                step="1"
                value={rewardSettings.referral_reward_tokens}
                onChange={(e) =>
                  setRewardSettings({
                    ...rewardSettings,
                    referral_reward_tokens: Number(e.target.value),
                  })
                }
              />

              <label className="block text-xs font-semibold mt-3 mb-1">
                Qualifying top-up (£)
              </label>

              <Input
                type="number"
                min="0"
                step="0.01"
                value={rewardSettings.referral_qualifying_topup_gbp}
                onChange={(e) =>
                  setRewardSettings({
                    ...rewardSettings,
                    referral_qualifying_topup_gbp:
                      Number(e.target.value),
                  })
                }
              />

              <label className="flex items-center gap-2 mt-4 text-sm">
                <input
                  type="checkbox"
                  checked={
                    rewardSettings.referral_contest_entry_required
                  }
                  onChange={(e) =>
                    setRewardSettings({
                      ...rewardSettings,
                      referral_contest_entry_required:
                        e.target.checked,
                    })
                  }
                />

                Contest entry required
              </label>
            </div>


            {/* INFLUENCER */}
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div className="font-bold text-emerald-900">
                Influencer Bonus
              </div>

              <label className="block text-xs font-semibold mt-4 mb-1">
                Default reward tokens
              </label>

              <Input
                type="number"
                min="0"
                step="1"
                value={rewardSettings.influencer_reward_tokens}
                onChange={(e) =>
                  setRewardSettings({
                    ...rewardSettings,
                    influencer_reward_tokens: Number(e.target.value),
                  })
                }
              />

              <label className="block text-xs font-semibold mt-3 mb-1">
                Qualifying top-up (£)
              </label>

              <Input
                type="number"
                min="0"
                step="0.01"
                value={
                  rewardSettings.influencer_qualifying_topup_gbp
                }
                onChange={(e) =>
                  setRewardSettings({
                    ...rewardSettings,
                    influencer_qualifying_topup_gbp:
                      Number(e.target.value),
                  })
                }
              />

              <label className="flex items-center gap-2 mt-4 text-sm">
                <input
                  type="checkbox"
                  checked={
                    rewardSettings.influencer_contest_entry_required
                  }
                  onChange={(e) =>
                    setRewardSettings({
                      ...rewardSettings,
                      influencer_contest_entry_required:
                        e.target.checked,
                    })
                  }
                />

                Contest entry required
              </label>
            </div>
          </div>

          <div className="px-5 pb-5">
            <Button
              onClick={saveRewards}
              disabled={savingRewards}
            >
              <Save className="w-4 h-4 mr-1" />

              {savingRewards
                ? 'Saving…'
                : 'Save Reward Settings'}
            </Button>
          </div>
        </section>
      )}


      {/* CREATE INFLUENCER PROMO */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h2 className="font-display text-xl font-bold">
            Create Influencer Promo Code
          </h2>

          <p className="text-xs text-slate-500 mt-1">
            Blank reward fields use the global Influencer Bonus settings.
          </p>
        </div>

        <div className="p-5 grid md:grid-cols-2 lg:grid-cols-4 gap-4">

          <div>
            <label className="text-xs font-semibold">
              Promo code *
            </label>

            <Input
              value={promoForm.code}
              placeholder="RAM2"
              onChange={(e) =>
                setPromoForm({
                  ...promoForm,
                  code: e.target.value.toUpperCase(),
                })
              }
            />
          </div>


          <div>
            <label className="text-xs font-semibold">
              Influencer name *
            </label>

            <Input
              value={promoForm.influencer_name}
              placeholder="Influencer name"
              onChange={(e) =>
                setPromoForm({
                  ...promoForm,
                  influencer_name: e.target.value,
                })
              }
            />
          </div>


          <div>
            <label className="text-xs font-semibold">
              Campaign name
            </label>

            <Input
              value={promoForm.campaign_name}
              placeholder="Instagram August"
              onChange={(e) =>
                setPromoForm({
                  ...promoForm,
                  campaign_name: e.target.value,
                })
              }
            />
          </div>


          <div>
            <label className="text-xs font-semibold">
              Custom tokens
            </label>

            <Input
              type="number"
              min="0"
              placeholder="Use default"
              value={promoForm.reward_tokens}
              onChange={(e) =>
                setPromoForm({
                  ...promoForm,
                  reward_tokens: e.target.value,
                })
              }
            />
          </div>


          <div>
            <label className="text-xs font-semibold">
              Custom qualifying top-up (£)
            </label>

            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Use default"
              value={promoForm.qualifying_topup_gbp}
              onChange={(e) =>
                setPromoForm({
                  ...promoForm,
                  qualifying_topup_gbp: e.target.value,
                })
              }
            />
          </div>


          <div>
            <label className="text-xs font-semibold">
              Contest requirement
            </label>

            <select
              value={promoForm.contest_entry_required}
              onChange={(e) =>
                setPromoForm({
                  ...promoForm,
                  contest_entry_required: e.target.value,
                })
              }
              className="w-full h-9 border border-slate-200 rounded-md px-3 text-sm bg-white"
            >
              <option value="">Use default</option>
              <option value="true">Required</option>
              <option value="false">Not required</option>
            </select>
          </div>


          <div>
            <label className="text-xs font-semibold">
              Maximum rewards
            </label>

            <Input
              type="number"
              min="0"
              value={promoForm.max_redemptions}
              onChange={(e) =>
                setPromoForm({
                  ...promoForm,
                  max_redemptions: e.target.value,
                })
              }
            />

            <div className="text-[10px] text-slate-400 mt-1">
              0 = unlimited
            </div>
          </div>


          <div>
            <label className="text-xs font-semibold">
              Start
            </label>

            <Input
              type="datetime-local"
              value={promoForm.starts_at}
              onChange={(e) =>
                setPromoForm({
                  ...promoForm,
                  starts_at: e.target.value,
                })
              }
            />
          </div>


          <div>
            <label className="text-xs font-semibold">
              Expiry
            </label>

            <Input
              type="datetime-local"
              value={promoForm.expires_at}
              onChange={(e) =>
                setPromoForm({
                  ...promoForm,
                  expires_at: e.target.value,
                })
              }
            />
          </div>
        </div>

        <div className="px-5 pb-5">
          <Button
            onClick={createPromo}
            disabled={creatingPromo}
          >
            <Plus className="w-4 h-4 mr-1" />

            {creatingPromo
              ? 'Creating…'
              : 'Create Promo Code'}
          </Button>
        </div>
      </section>


      {/* INFLUENCER CAMPAIGNS */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-display font-bold text-lg">
            Influencer Campaigns
          </h2>

          <p className="text-xs text-slate-500">
            {promos.length} campaigns
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Influencer</th>
                <th className="text-left px-4 py-3">Campaign</th>
                <th className="text-left px-4 py-3">Reward</th>
                <th className="text-left px-4 py-3">Signups</th>
                <th className="text-left px-4 py-3">Rewards</th>
                <th className="text-left px-4 py-3">Limit</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {promos.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center px-4 py-10 text-slate-400"
                  >
                    No influencer campaigns created yet.
                  </td>
                </tr>
              ) : (
                promos.map((promo) => (
                  <tr
                    key={promo.promo_id}
                    className="border-t border-slate-100"
                  >
                    <td className="px-4 py-3 font-mono font-bold">
                      {promo.code}
                    </td>

                    <td className="px-4 py-3">
                      {promo.influencer_name}
                    </td>

                    <td className="px-4 py-3">
                      {promo.campaign_name || '—'}
                    </td>

                    <td className="px-4 py-3">
                      {promo.effective_reward_tokens ??
                        promo.reward_tokens ??
                        rewardSettings?.influencer_reward_tokens ??
                        '—'}{' '}
                      tokens
                    </td>

                    <td className="px-4 py-3">
                      {promo.signups ?? 0}
                    </td>

                    <td className="px-4 py-3">
                      {promo.redemptions ?? 0}
                    </td>

                    <td className="px-4 py-3">
                      {promo.max_redemptions
                        ? promo.max_redemptions
                        : 'Unlimited'}
                    </td>

                    <td className="px-4 py-3">
                      <Status
                        tone={promo.active ? 'emerald' : 'slate'}
                      >
                        {promo.active ? 'Active' : 'Disabled'}
                      </Status>
                    </td>

                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => togglePromo(promo)}
                      >
                        <Power className="w-3.5 h-3.5" />

                        {promo.active ? 'Disable' : 'Enable'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>


      {/* INFLUENCER ATTRIBUTIONS */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-display font-bold text-lg">
            Influencer Performance
          </h2>

          <p className="text-xs text-slate-500">
            {attributions.length} attributed users
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Influencer</th>
                <th className="text-left px-4 py-3">Top-up</th>
                <th className="text-left px-4 py-3">Contest</th>
                <th className="text-left px-4 py-3">Reward</th>
                <th className="text-left px-4 py-3">Joined</th>
              </tr>
            </thead>

            <tbody>
              {attributions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center px-4 py-10 text-slate-400"
                  >
                    No influencer signups yet.
                  </td>
                </tr>
              ) : (
                attributions.map((a) => (
                  <tr
                    key={
                      a.attribution_id ||
                      `${a.user_id}-${a.promo_id}`
                    }
                    className="border-t border-slate-100"
                  >
                    <td className="px-4 py-3">
                      {a.user_id ? (
                        <Link
                          to={`/admin/users/${a.user_id}`}
                          className="font-semibold text-violet-700 hover:underline"
                        >
                          {a.user_name ||
                            a.public_id ||
                            a.user_id}
                        </Link>
                      ) : (
                        '—'
                      )}

                      {a.email && (
                        <div className="text-slate-400">
                          {a.email}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 font-mono">
                      {a.code || a.promo_code || '—'}
                    </td>

                    <td className="px-4 py-3">
                      {a.influencer_name || '—'}
                    </td>

                    <td className="px-4 py-3">
                      {a.topup_qualified ? (
                        <Status tone="emerald">Qualified</Status>
                      ) : (
                        <Status tone="amber">Waiting</Status>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {a.contest_entered ? (
                        <Status tone="emerald">Entered</Status>
                      ) : (
                        <Status tone="amber">Waiting</Status>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {a.reward_granted ? (
                        <Status tone="emerald">
                          +{a.reward_tokens || 0}
                        </Status>
                      ) : (
                        <Status tone="violet">Pending</Status>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {fmtDate(a.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>


      {/* CURRENT RULES */}
      <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
        <div className="font-semibold text-violet-900 text-sm">
          Current programme rules
        </div>

        <div className="text-xs text-violet-800 mt-1 leading-5">
          Signup: verified £
          {rules.signup_qualifying_topup_gbp ?? 0}+ top-up →{' '}
          {rules.signup_bonus_tokens ?? 0} tokens.
          {' '}Referral: verified £
          {rules.referral_qualifying_topup_gbp ?? 0}+ top-up
          {rules.referral_required_contest_entries
            ? ' + contest entry'
            : ''}
          {' '}→ {rules.referral_reward_tokens ?? 0} tokens.
          {' '}Influencer default: verified £
          {rules.influencer_qualifying_topup_gbp ?? 0}+ top-up
          {rules.influencer_contest_entry_required
            ? ' + contest entry'
            : ''}
          {' '}→ {rules.influencer_reward_tokens ?? 0} tokens.
        </div>
      </div>


      {/* SEARCH */}
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


      {/* REFERRAL TABLE */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-lg">
              Referral Tracking
            </h2>

            <p className="text-xs text-slate-500">
              {filteredReferrals.length} records shown
            </p>
          </div>

          <select
            value={refFilter}
            onChange={(e) => setRefFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="all">All referrals</option>
            <option value="waiting_topup">Waiting for top-up</option>
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
                <th className="text-left px-4 py-3">Referred User</th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Top-up</th>
                <th className="text-left px-4 py-3">Contest</th>
                <th className="text-left px-4 py-3">Reward</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>

            <tbody>
              {filteredReferrals.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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
                  } else if (
                    r.topup_qualified &&
                    !r.contest_entered
                  ) {
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

                        <div className="text-slate-400">
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

                        <div className="text-slate-400">
                          {r.referred_email || ''}
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono">
                        {r.code || '—'}
                      </td>

                      <td className="px-4 py-3">
                        {r.topup_qualified ? (
                          <Status tone="emerald">Qualified</Status>
                        ) : (
                          <Status tone="amber">Waiting</Status>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {r.contest_entered ? (
                          <Status tone="emerald">Entered</Status>
                        ) : (
                          <Status tone="amber">Waiting</Status>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {r.reward_granted ? (
                          <Status tone="emerald">
                            +{r.reward_tokens || 0} tokens
                          </Status>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <Status tone={tone}>
                          {r.display_status ||
                            r.status ||
                            'Pending'}
                        </Status>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>


      {/* SIGNUP TABLE */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-lg">
              Signup Bonus Tracking
            </h2>

            <p className="text-xs text-slate-500">
              {filteredBonuses.length} users shown
            </p>
          </div>

          <select
            value={bonusFilter}
            onChange={(e) => setBonusFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="all">All bonus users</option>
            <option value="waiting_topup">Waiting for top-up</option>
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
                <th className="text-left px-4 py-3">Top-up</th>
                <th className="text-left px-4 py-3">Bonus</th>
              </tr>
            </thead>

            <tbody>
              {filteredBonuses.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    No signup bonus records match this filter.
                  </td>
                </tr>
              ) : (
                filteredBonuses.map((u) => (
                  <tr
                    key={u.user_id}
                    className="border-t border-slate-100"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/users/${u.user_id}`}
                        className="font-semibold text-violet-700 hover:underline"
                      >
                        {u.name || u.public_id || 'User'}
                      </Link>

                      <div className="text-slate-400">
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
                        <Status tone="emerald">Qualified</Status>
                      ) : (
                        <Status tone="amber">Waiting</Status>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {u.signup_bonus_granted ? (
                        <Status tone="emerald">
                          +{u.signup_bonus_tokens || 0} tokens
                        </Status>
                      ) : u.qualifying_topup_completed ? (
                        <Status tone="violet">Processing</Status>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>


      {/* OPERATIONAL STATUS */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Clock className="w-5 h-5 text-amber-600" />

          <div className="font-bold mt-2">
            {summary.referral_waiting_topup ?? 0}
          </div>

          <div className="text-xs text-amber-800">
            referrals waiting for qualifying top-up
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
