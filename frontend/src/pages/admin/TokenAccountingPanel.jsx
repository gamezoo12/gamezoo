import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';

const CATEGORIES = [
  ['topup_tokens', 'Top-up Tokens'],
  ['winning_bonus_tokens', 'Winning Bonus Tokens'],
  ['winning_tokens', 'Winning Tokens'],
  ['bonus_tokens', 'Bonus Tokens'],
];
const SOURCES = [
  ['all', 'All sources'], ['topup', 'Top-ups'], ['signup', 'Signup'], ['referral', 'Referral'],
  ['admin', 'Admin grants'], ['influencer', 'Influencer'], ['promotion', 'Promotion'],
  ['free_world', 'Free World'], ['paid_world', 'Paid World'], ['impossible_challenges', 'Impossible Challenges'],
  ['cashout', 'Cashouts'], ['refund', 'Refunds'], ['admin_adjustment', 'Admin adjustments'],
];
const WORLDS = [['all', 'All worlds'], ['free_world', 'Free World'], ['paid_world', 'Paid World'], ['impossible_challenges', 'Impossible Challenges']];
const number = (value) => value == null ? 'Unavailable' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
const dateText = (value) => value ? new Date(value).toLocaleString() : '—';

export default function TokenAccountingPanel({ compact = false, onOpenDetails, initialCategory = 'all', period = 'all_time' }) {
  const [category, setCategory] = useState(initialCategory);
  const [source, setSource] = useState('all');
  const [world, setWorld] = useState('all');
  const [userId, setUserId] = useState('');
  const [accounting, setAccounting] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setCategory(initialCategory);
    setSkip(0);
  }, [initialCategory]);

  const params = () => ({
    period,
    category, source, world, ...(userId.trim() ? { user_id: userId.trim() } : {}),
    skip, limit: 100,
  });

  useEffect(() => {
    let cancelled = false;
    const query = params();
    setError('');
    Promise.all([
      adminAPI.tokenAccounting({ period }),
      adminAPI.tokenLedger(query),
    ]).then(([summary, page]) => {
      if (cancelled) return;
      setAccounting(summary);
      setLedger(page);
    }).catch((err) => {
      if (!cancelled) setError(err?.response?.data?.detail || 'Token accounting is unavailable.');
    });
    return () => { cancelled = true; };
  }, [period, category, source, world, userId, skip]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await adminAPI.tokenLedgerCsv({ ...params(), skip: undefined, limit: undefined });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'prize-league-token-ledger.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.detail || 'CSV export failed.');
    } finally {
      setExporting(false);
    }
  };

  if (error && !accounting) return <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>;
  const cards = accounting?.categories || {};

  return (
    <section className="space-y-4" data-testid="token-accounting-panel">
      {!compact && <header>
        <h2 className="text-xl font-bold text-slate-900">Token Accounting</h2>
        <p className="text-sm text-slate-500">Category movements are sourced from wallet transactions. Unknown legacy history is never inferred.</p>
      </header>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CATEGORIES.map(([key, label]) => {
          const row = cards[key] || {};
          const atEnd = row.period_closing_balance;
          const visibleBalance = atEnd ?? row.current_remaining;
          return <button key={key} type="button" onClick={() => {
            setCategory(key); setSkip(0);
            if (compact) onOpenDetails?.(key);
          }} className={`rounded-lg border bg-white p-4 text-left hover:border-emerald-400 ${category === key && !compact ? 'border-emerald-500 ring-1 ring-emerald-200' : 'border-slate-200'}`} data-testid={`token-summary-${key}`}>
            <span className="block text-xs font-semibold uppercase text-slate-500">{label}</span>
            <span className="mt-1 block text-2xl font-bold tabular-nums text-slate-900">{number(visibleBalance)}</span>
            <span className="mt-1 block text-[11px] text-slate-500">{atEnd != null ? 'remaining at period end' : 'remaining now (period-end balance unavailable: legacy history)'}</span>
            {!compact && <span className="mt-2 block text-xs text-slate-500">In period: issued {number(row.period_credits)} · used {number(row.period_spent)}{key === 'winning_tokens' ? ` · withdrawn ${number(row.period_withdrawn)}` : ''}{key === 'bonus_tokens' ? ` · expired ${number(row.period_expired)}` : ''}</span>}
          </button>;
        })}
      </div>

          {category !== 'all' && category !== 'unclassified' && (() => {
            const movement = accounting?.categories?.[category];
            if (!movement) return null;
            return <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3" aria-label="Period reconciliation" data-testid="token-period-reconciliation">
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <div><span className="block text-xs text-slate-500">Opening</span><b>{number(movement.opening_balance)}</b></div>
                <div><span className="block text-xs text-slate-500">Issued credits</span><b>{number(movement.period_credits)}</b></div>
                <div><span className="block text-xs text-slate-500">Spent</span><b>−{number(movement.period_spent)}</b></div>
                <div><span className="block text-xs text-slate-500">Expired</span><b>−{number(movement.period_expired)}</b></div>
                {category === 'winning_tokens' && <div><span className="block text-xs text-slate-500">Withdrawn</span><b>−{number(movement.period_withdrawn)}</b></div>}
                <div><span className="block text-xs text-slate-500">Refunds / reversals</span><b>{number(movement.period_refunds)} / −{number(movement.period_reversals)}</b></div>
                <div><span className="block text-xs text-slate-500">Admin + / −</span><b>{number(movement.period_admin_positive)} / −{number(movement.period_admin_negative)}</b></div>
                <div><span className="block text-xs text-slate-500">Closing</span><b>{number(movement.period_closing_balance)}</b></div>
                <div><span className="block text-xs text-slate-500">Reconciliation</span><b>{movement.reconciliation}</b></div>
                <div><span className="block text-xs text-slate-500">Current remaining</span><b>{number(movement.current_remaining)}</b></div>
              </div>
              <p className="text-[11px] text-slate-500">Opening + issued + refunds + positive adjustments − spend − expiry − reversal − negative adjustments − completed cashouts = closing. Pending cashouts remain reserved, not completed. Opening and closing are unavailable if legacy movements are unclassified.</p>
            </section>;
          })()}

      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <span><b>Total outstanding:</b> {number(accounting?.current?.total_outstanding_tokens)} tokens</span>
        <span><b>Unclassified legacy:</b> {number(accounting?.current?.unclassified_legacy_tokens)} tokens</span>
        <span><b>Winning available:</b> {number(accounting?.cashouts?.available_tokens_current)} tokens</span>
        <span><b>Winning reserved:</b> {number(accounting?.cashouts?.pending_tokens_current)} tokens</span>
      </div>

      {!compact && <>
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-3 xl:grid-cols-6">
          <select aria-label="Token category" value={category} onChange={(event) => { setCategory(event.target.value); setSkip(0); }} className="h-9 rounded border px-2 text-sm">
            <option value="all">All categories</option>{CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="unclassified">Unclassified legacy</option>
          </select>
          <select aria-label="Transaction source" value={source} onChange={(event) => { setSource(event.target.value); setSkip(0); }} className="h-9 rounded border px-2 text-sm">{SOURCES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select aria-label="World" value={world} onChange={(event) => { setWorld(event.target.value); setSkip(0); }} className="h-9 rounded border px-2 text-sm">{WORLDS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <input aria-label="Filter user" value={userId} onChange={(event) => { setUserId(event.target.value); setSkip(0); }} placeholder="User ID" className="h-9 rounded border px-2 text-sm" />
          <button type="button" onClick={exportCsv} disabled={exporting} className="h-9 rounded bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50" data-testid="token-ledger-export">{exporting ? 'Exporting…' : 'Export CSV'}</button>
        </div>

        {error && <div role="alert" className="rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">{error}</div>}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-xs" data-testid="token-ledger-table">
            <thead className="bg-slate-50 uppercase text-slate-500"><tr>
              {['Date', 'User', 'Category', 'Source / type', 'From → to', 'World / contest', 'Amount', 'Status', 'Reason / reference'].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}
            </tr></thead>
            <tbody>
              {(ledger?.transactions || []).map((row) => <tr key={row.tx_id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2">{dateText(row.created_at)}</td>
                <td className="px-3 py-2"><span className="block">{row.user?.name || row.user?.email || row.user_id}</span><span className="font-mono text-slate-400">{row.user_id}</span></td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2">{row.source || row.kind}</td>
                <td className="px-3 py-2">{row.source_account || '—'} → {row.destination_account || '—'}</td>
                <td className="px-3 py-2">{row.world || '—'}{row.contest_id ? ` · ${row.contest_id}` : ''}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{number(row.amount_in_view ?? row.amount ?? Object.values(row.category_deltas || {}).find((value) => value))}</td>
                <td className="px-3 py-2">{row.status || 'posted'}</td>
                <td className="max-w-64 px-3 py-2">{row.note || row.reason || '—'}<span className="block break-all font-mono text-slate-400">{row.ref_order_id || row.reference || row.tx_id}</span></td>
              </tr>)}
              {!ledger?.transactions?.length && <tr><td colSpan="9" className="p-6 text-center text-slate-500">No token transactions match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{ledger?.total ?? 0} ledger events · opening/closing values are unavailable where legacy movements are unclassified.</span>
          <div className="flex gap-2"><button type="button" disabled={!skip} onClick={() => setSkip(Math.max(0, skip - 100))} className="rounded border px-2 py-1 disabled:opacity-40">Previous</button><button type="button" disabled={skip + 100 >= (ledger?.total || 0)} onClick={() => setSkip(skip + 100)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button></div>
        </div>
        {accounting?.cashouts && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm" data-testid="token-cashout-reconciliation">
          <b>Winning token cashouts:</b> requested {number(accounting.cashouts.requested_tokens_in_period)} ({number(accounting.cashouts.requested_count_in_period)} requests) · pending {number(accounting.cashouts.pending_tokens_current)} ({number(accounting.cashouts.pending_count_current)}) · completed all-time {number(accounting.cashouts.completed_tokens_all_time)} · rejected/reversed in period {number(accounting.cashouts.rejected_tokens_in_period)}.
        </div>}
        {accounting?.bonus_sources && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" data-testid="token-bonus-source-breakdown">
          {Object.entries(accounting.bonus_sources).map(([source, values]) => <div key={source} className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs">
            <h3 className="mb-1 font-bold capitalize text-amber-900">{source} bonus</h3>
            <div>Issued {number(values.issued)}</div><div>Used {number(values.spent_tracked)}</div>
            <div>Expired {number(values.expired_tracked)}</div><div>Remaining {number(values.outstanding_tracked)}</div>
          </div>)}
        </div>}
        {accounting?.accounting && <p className="text-xs text-slate-500">Cash received: {accounting.accounting.stripe_cash_received_gbp == null ? 'unavailable' : `£${number(accounting.accounting.stripe_cash_received_gbp)}`} · refunds: {accounting.accounting.stripe_refunds_gbp == null ? 'unavailable' : `£${number(accounting.accounting.stripe_refunds_gbp)}`} · recognized revenue, fees and net: unavailable without an accounting ledger.</p>}
      </>}
    </section>
  );
}