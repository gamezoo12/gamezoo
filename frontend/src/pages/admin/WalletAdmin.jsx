import { useEffect, useState } from 'react';
import { adminWalletAPI } from '../../lib/api';
import { gbp } from '../../lib/format';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useToast } from '../../hooks/use-toast';
import { Wallet, TrendingUp, TrendingDown, Coins, Search } from 'lucide-react';

export default function WalletAdmin() {
  const [wallets, setWallets] = useState([]);
  const [totals, setTotals] = useState(null);
  const [q, setQ] = useState('');
  const [openUser, setOpenUser] = useState(null);
  const [txs, setTxs] = useState([]);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustNote, setAdjustNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = () => {
    adminWalletAPI.list().then(r => { setWallets(r?.wallets || []); setTotals(r?.totals); }).catch(err => console.error(err));
  };

  useEffect(() => { load(); }, []);

  const openWallet = async (w) => {
    setOpenUser(w);
    setAdjustAmount(0);
    setAdjustNote('');
    try {
      const r = await adminWalletAPI.userTransactions(w.user_id);
      setTxs(r?.transactions || []);
    } catch (err) {
      console.error(err);
    }
  };

  const adjust = async () => {
    if (!openUser || Number(adjustAmount) === 0) return;
    setBusy(true);
    try {
      await adminWalletAPI.adjust(openUser.user_id, Number(adjustAmount), adjustNote);
      toast({ title: 'Wallet adjusted', description: `${adjustAmount > 0 ? '+' : ''}£${adjustAmount} to ${openUser.email}` });
      load();
      const r = await adminWalletAPI.userTransactions(openUser.user_id);
      setTxs(r?.transactions || []);
    } catch (err) {
      toast({ title: 'Adjust failed', description: err?.response?.data?.detail });
    } finally { setBusy(false); }
  };

  const filtered = wallets.filter(w => {
    if (!q) return true;
    const qq = q.toLowerCase();
    return (w.email || '').toLowerCase().includes(qq) || (w.name || '').toLowerCase().includes(qq) || (w.user_id || '').toLowerCase().includes(qq);
  });

  return (
    <div className="space-y-6" data-testid="admin-wallet-page">
      <h2 className="font-display text-2xl font-extrabold flex items-center gap-2">
        <Wallet className="w-6 h-6 text-orange-600" /> User wallets
      </h2>

      {/* Totals */}
      <div className="grid md:grid-cols-4 gap-4">
        {[
          { label: 'Total on platform', value: totals ? gbp(totals.total_balance) : '£0.00', color: 'from-emerald-500 to-teal-600', Icon: Coins },
          { label: 'Lifetime top-ups', value: totals ? gbp(totals.total_lifetime_topup) : '£0.00', color: 'from-orange-500 to-rose-500', Icon: TrendingUp },
          { label: 'Lifetime spend', value: totals ? gbp(totals.total_lifetime_spend) : '£0.00', color: 'from-fuchsia-500 to-pink-500', Icon: TrendingDown },
          { label: 'Wallets', value: totals?.wallet_count || 0, color: 'from-indigo-500 to-purple-600', Icon: Wallet },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-5 bg-gradient-to-br ${s.color} text-white shadow-lg`}>
            <s.Icon className="w-6 h-6 opacity-80" />
            <div className="mt-3 text-2xl font-extrabold font-display">{s.value}</div>
            <div className="text-xs opacity-90">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search email / name / user_id"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="pl-9 bg-slate-800 border-slate-700 text-white placeholder-slate-500"
              data-testid="admin-wallet-search"
            />
          </div>
          <span className="text-xs text-slate-400">{filtered.length} wallets</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-200">
            <thead className="text-slate-400 text-left">
              <tr>
                <th className="py-2">User</th>
                <th>Balance</th>
                <th>Lifetime top-up</th>
                <th>Lifetime spend</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(w => (
                <tr key={w.user_id} className="border-t border-slate-800 hover:bg-slate-800/50">
                  <td className="py-2">
                    <div className="font-medium text-white">{w.name || w.email || w.user_id}</div>
                    <div className="text-xs text-slate-500">{w.email}</div>
                  </td>
                  <td className="font-bold text-orange-400">{gbp(w.balance)}</td>
                  <td>{gbp(w.lifetime_topup || 0)}</td>
                  <td>{gbp(w.lifetime_spend || 0)}</td>
                  <td>
                    <Button size="sm" onClick={() => openWallet(w)} data-testid={`open-wallet-${w.user_id}`} variant="outline" className="border-slate-600 text-slate-200 hover:bg-slate-700 bg-transparent">
                      Adjust / View
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="5" className="py-8 text-center text-slate-500">No wallets found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer / modal */}
      {openUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setOpenUser(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display font-bold text-lg">{openUser.name || openUser.email}</h3>
                <div className="text-sm text-slate-500">{openUser.email}</div>
                <div className="mt-2 text-2xl font-extrabold text-orange-600">{gbp(openUser.balance)}</div>
              </div>
              <button onClick={() => setOpenUser(null)} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">×</button>
            </div>

            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <div><Label>Amount (+ credit / - debit)</Label>
                <Input type="number" step="0.01" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} data-testid="admin-adjust-amount" />
              </div>
              <div className="md:col-span-2"><Label>Note (reason)</Label>
                <Input value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="e.g. Goodwill credit, refund #ABC" data-testid="admin-adjust-note" />
              </div>
            </div>
            <Button
              onClick={adjust}
              disabled={busy || Number(adjustAmount) === 0}
              data-testid="admin-adjust-btn"
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >{busy ? 'Applying…' : 'Apply adjustment'}</Button>

            <h4 className="font-display font-bold text-sm mt-6 mb-2">Recent transactions</h4>
            <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {txs.map(tx => (
                <li key={tx.tx_id} className="py-2 flex items-center gap-3 text-sm">
                  <span className="capitalize text-slate-600">{tx.kind.replace(/_/g, ' ')}</span>
                  <span className="flex-1 text-xs text-slate-400 truncate">{tx.note}</span>
                  <span className={`font-bold ${tx.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{tx.amount > 0 ? '+' : ''}{gbp(tx.amount)}</span>
                </li>
              ))}
              {txs.length === 0 && <li className="py-3 text-sm text-slate-500 text-center">No transactions yet.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
