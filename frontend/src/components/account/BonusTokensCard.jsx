import { useEffect } from 'react';
import { Gift } from 'lucide-react';

const n = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const dateText = (iso) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' });

function expiresIn(iso, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'expires in under an hour';
  if (hours < 48) return `expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `expires in ${Math.ceil(ms / 86400000)} days`;
}

/*
 * Bonus / purchased / total breakdown. Dates come from the server's grant records;
 * nothing here decides what is spendable. When the nearest expiry passes, the wallet is reloaded.
 */
export default function BonusTokensCard({ wallet, onRefresh }) {
  const grants = (wallet && wallet.bonus_grants) || [];
  const expiring = grants.filter((g) => g.expires_at);
  const nextExpiry = expiring.length ? Math.min(...expiring.map((g) => new Date(g.expires_at).getTime())) : null;

  useEffect(() => {
    if (!nextExpiry || !onRefresh) return undefined;
    // setTimeout is limited to ~24 days; re-check hourly for longer waits.
    const wait = Math.min(Math.max(nextExpiry - Date.now() + 3000, 3000), 3600000);
    const t = setTimeout(() => { Promise.resolve(onRefresh()).catch(() => {}); }, wait);
    return () => clearTimeout(t);
  }, [nextExpiry, onRefresh]);

  if (!wallet) return null;
  const bonus = Number(wallet.bonus || 0);
  const prize = Number(wallet.withdrawable || 0);
  const winningBonus = Number(wallet.winning_bonus_tokens ?? wallet.winning_bonus ?? 0);
  const purchased = Number(wallet.purchased_tokens || 0);
  const available = Math.max(0, Number(wallet.total_tokens ?? wallet.balance ?? 0));
  if (wallet.source_classified === false) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm" data-testid="wallet-breakdown-unclassified">
        <div className="flex justify-between font-semibold text-slate-900"><span>Available token balance</span><b>{n(available)}</b></div>
        <p className="mt-1 text-xs text-amber-800">This legacy balance is preserved; its token sources are not yet verified.</p>
      </div>
    );
  }
  if (bonus <= 0 && grants.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm" data-testid="wallet-breakdown">
        <div className="flex justify-between"><span className="text-slate-600">Top-up tokens</span><b data-testid="wallet-purchased">{n(purchased)}</b></div>
        <div className="mt-1 flex justify-between"><span className="text-slate-600">Winning tokens</span><b data-testid="wallet-winning">{n(prize)}</b></div>
        <div className="mt-1 flex justify-between"><span className="text-slate-600">Winning bonus tokens</span><b data-testid="wallet-winning-bonus">{n(winningBonus)}</b></div>
        <div className="mt-1 flex justify-between"><span className="text-slate-600">Bonus tokens</span><b data-testid="wallet-bonus-total">{n(bonus)}</b></div>
        <div className="mt-2 flex justify-between border-t border-slate-100 pt-2"><span className="font-semibold text-slate-800">Total available</span><b data-testid="wallet-total-available">{n(available)}</b></div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm" data-testid="wallet-breakdown">
      <div className="flex items-center gap-2 font-bold text-amber-900"><Gift className="h-4 w-4" /> Bonus tokens</div>
      <div className="mt-1 flex justify-between"><span className="text-slate-700">Bonus tokens</span><b data-testid="wallet-bonus-total">{n(bonus)}</b></div>
      <ul className="mt-1 space-y-0.5 text-xs text-slate-600" data-testid="wallet-bonus-grants">
        {grants.filter((g) => g.expires_at).map((g) => (
          <li key={g.grant_id} className={g.expires_soon ? 'font-semibold text-rose-700' : ''}>
            {n(g.remaining)} {g.remaining === 1 ? 'token' : 'tokens'} · {expiresIn(g.expires_at)} ({dateText(g.expires_at)})
          </li>
        ))}
        {Number(wallet.bonus_non_expiring_tokens || 0) > 0 && <li>{n(wallet.bonus_non_expiring_tokens)} tokens do not expire</li>}
      </ul>
      {Number(wallet.bonus_expiring_soon_tokens || 0) > 0 && (
        <div className="mt-1 text-xs font-semibold text-rose-700" data-testid="wallet-bonus-expiring-soon">
          {n(wallet.bonus_expiring_soon_tokens)} bonus tokens expire within 7 days. Use them first; they are spent before purchased tokens.
        </div>
      )}
      <div className="mt-2 flex justify-between"><span className="text-slate-700">Top-up tokens</span><b data-testid="wallet-purchased">{n(purchased)}</b></div>
      <div className="mt-1 flex justify-between"><span className="text-slate-700">Winning tokens</span><b data-testid="wallet-winning">{n(prize)}</b></div>
      <div className="mt-1 flex justify-between"><span className="text-slate-700">Winning bonus tokens</span><b data-testid="wallet-winning-bonus">{n(winningBonus)}</b></div>
      <div className="mt-2 flex justify-between border-t border-amber-200 pt-2"><span className="font-semibold text-slate-900">Total available</span><b data-testid="wallet-total-available">{n(available)}</b></div>
    </div>
  );
}
