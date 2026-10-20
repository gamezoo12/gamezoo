import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';

const t = (v) => `${(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const gbp = (v) => `\u00a3${(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Group({ title, tone, children, testid }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4" data-testid={testid}>
      <div className={`mb-2 text-xs font-bold uppercase tracking-wide ${tone}`}>{title}</div>
      <dl className="space-y-1 text-sm">{children}</dl>
    </div>
  );
}

function Row({ label, value, testid }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-900" data-testid={testid}>{value}</dd>
    </div>
  );
}

export default function DashboardWalletReport() {
  const [report, setReport] = useState(null);
  const [includeStaff, setIncludeStaff] = useState(false);
  const [includeTest, setIncludeTest] = useState(false);
  const [integrity, setIntegrity] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      adminAPI.walletReport({ include_staff: includeStaff, include_test: includeTest, refresh: true })
        .then((next) => { if (!cancelled) { setReport(next); setFailed(false); } })
        .catch(() => { if (!cancelled) setFailed(true); });
    };
    setFailed(false);
    setIntegrity(null);
    load();
    const timer = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [includeStaff, includeTest]);

  if (failed) return <div className="text-sm text-rose-600">Wallet report is unavailable.</div>;
  if (!report) return <div className="text-sm text-slate-400">Loading wallet report…</div>;
  const b = report.bonus_tokens; const p = report.purchased_tokens; const w = report.winnings;
  return (
    <section className="space-y-3" data-testid="dashboard-wallet-report">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-slate-900">Wallets and tokens</h2>
        <div className="flex gap-3 text-xs text-slate-600">
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={includeStaff} onChange={(e) => setIncludeStaff(e.target.checked)} /> Include staff</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> Include test accounts</label>
        </div>
      </div>
      <div className="text-[11px] text-slate-400">{report.units}</div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Group testid="wallet-bonus-group" title="Bonus tokens (tokens)" tone="text-amber-700">
          <Row label="Available now" value={t(b.available)} testid="bonus-available" />
          <Row label="Issued" value={t(b.issued)} />
          <Row label="Spent (source-labeled)" value={b.spent_total == null ? 'Unavailable for legacy rows' : t(b.spent_total)} />
          <Row label="Tracked grant spend" value={t(b.spent_from_tracked_grants)} />
          <Row label="Legacy non-expiring held" value={t(b.legacy_non_expiring_held)} />
          <Row label="Expired" value={t(b.expired)} testid="bonus-expired" />
          <Row label="Revoked" value={t(b.revoked)} />
          <Row label="Expiring within 24h" value={t(b.due_to_expire_24h)} testid="bonus-due-24h" />
          <Row label="Expiring within 7 days" value={t(b.due_to_expire_7d)} testid="bonus-due-7d" />
        </Group>
        <Group testid="wallet-purchased-group" title="Purchased tokens (tokens) and top-ups (GBP)" tone="text-violet-700">
          <Row label="Held by users" value={t(p.held)} />
          <Row label="Tokens purchased" value={t(p.purchased_total)} />
          <Row label="Tokens spent (all types)" value={t(p.spent_total_all_token_types)} />
          <Row label="Top-up value paid (GBP)" value={gbp(p.topup_value_gbp)} />
          <Row label="Refunds (tokens)" value={t(p.refunds_tokens)} />
          <Row label="Admin adjustments (tokens)" value={`+${t(p.admin_adjustments_tokens.credited)} / -${t(p.admin_adjustments_tokens.debited)}`} />
        </Group>
        <Group testid="wallet-winnings-group" title="Winnings" tone="text-emerald-700">
          <Row label="Champion prizes awarded (tokens)" value={t(w.championship_prize_tokens.awarded)} />
          <Row label="Held, withdrawable (tokens)" value={t(w.championship_prize_tokens.held_withdrawable)} />
          <Row label="Cash-outs pending (GBP)" value={gbp(w.championship_prize_tokens.pending_requests_gbp)} />
          <Row label="Cash-outs paid (GBP)" value={gbp(w.championship_prize_tokens.withdrawn_gbp)} />
          <Row label="Challenge winnings awarded (GBP)" value={gbp(w.challenge_winnings_gbp.awarded)} />
          <Row label="Challenge winnings held (GBP)" value={gbp(w.challenge_winnings_gbp.held)} />
          <Row label="Withdrawals pending (GBP)" value={gbp(w.challenge_winnings_gbp.pending_withdrawals)} />
          <Row label="Withdrawals completed (GBP)" value={gbp(w.challenge_winnings_gbp.completed_withdrawals)} />
          <Row label="Liabilities: tokens redeemable" value={t(w.prize_liabilities_outstanding.tokens_redeemable)} testid="liability-tokens" />
          <Row label="Liabilities: GBP" value={gbp(w.prize_liabilities_outstanding.gbp)} testid="liability-gbp" />
        </Group>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span data-testid="integrity-components">
          Classified balances {t(report.integrity.classified_balance_tokens)} tokens: {report.integrity.components_match === null ? 'legacy split incomplete' : report.integrity.components_match ? 'components match' : 'MISMATCH'}
          {report.integrity.unclassified_wallets > 0 && ` · ${t(report.integrity.unclassified_wallets)} legacy wallets (${t(report.integrity.unclassified_balance_tokens)} tokens) are not categorized`}
        </span>
        <button type="button" className="rounded border border-slate-200 px-2 py-1 font-semibold hover:bg-slate-50"
          onClick={() => adminAPI.walletIntegrity({
            include_staff: includeStaff,
            after_user_id: integrity?.has_more ? integrity.next_after_user_id : undefined,
            limit: 100,
          }).then((page) => setIntegrity((current) => {
            const continuing = Boolean(page.after_user_id);
            return {
              after_user_id: page.after_user_id,
              next_after_user_id: page.next_after_user_id,
              has_more: page.has_more,
              checked: (continuing ? current?.checked || 0 : 0) + page.checked,
              discrepancies: (continuing ? current?.discrepancies || 0 : 0) + page.discrepancies,
              last_page_discrepancies: page.discrepancies,
            };
          })).catch(() => setIntegrity({ error: true }))}>
          {integrity?.has_more ? 'Check next 100 wallets' : integrity ? 'Restart ledger check' : 'Compare with ledger'}
        </button>
        {integrity && !integrity.error && (
          <span data-testid="integrity-result">{integrity.checked} wallets checked, {integrity.discrepancies} differ from their ledger{integrity.has_more && ` · latest batch ${integrity.last_page_discrepancies} discrepancies`}</span>
        )}
      </div>
      <ul className="list-disc pl-5 text-[11px] text-slate-400">
        {[...b.notes, ...p.notes].map((x) => <li key={x}>{x}</li>)}
      </ul>
    </section>
  );
}
