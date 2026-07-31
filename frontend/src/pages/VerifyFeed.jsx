import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import BackButton from '../components/BackButton';
import { ShieldCheck, Hash, Calendar, Copy, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';

export default function VerifyFeed() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading');
  const [copiedIdx, setCopiedIdx] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    api.get('/engines/instant-win/verify')
      .then(r => { setRows(r.data.feed || []); setState('ok'); })
      .catch(() => setState('error'));
  }, []);

  const copy = async (h, i) => {
    try {
      await navigator.clipboard.writeText(h);
      setCopiedIdx(i);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch { toast({ title: 'Copy failed' }); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-10" data-testid="verify-feed-page">
      <BackButton to="/" label="Back to home" className="mb-4" />
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold mb-3">
        <ShieldCheck className="w-3.5 h-3.5" /> INDEPENDENT VERIFICATION
      </div>
      <h1 className="font-display text-4xl font-extrabold text-slate-900">Instant-Win Verification Feed</h1>
      <p className="text-slate-600 mt-3 max-w-2xl leading-relaxed">
        For every instant-win contest, Prize League commits the exact list of winning tickets
        <strong> before ticket sales open</strong>. We publish only the SHA-256 hash of that list here.
        After the contest ends, you can request the original file from support and verify the hash
        matches to prove no manipulation occurred.
      </p>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
          <h2 className="font-display font-bold text-lg text-slate-900">Committed contests</h2>
          <p className="text-xs text-slate-500">Ordered by most recent commit</p>
        </div>
        {state === 'loading' && <div className="p-8 text-slate-500 text-sm">Loading feed…</div>}
        {state === 'error' && <div className="p-8 text-rose-600 text-sm">Failed to load feed. Please retry.</div>}
        {state === 'ok' && rows.length === 0 && (
          <div className="p-10 text-center text-slate-500 text-sm">
            No instant-win commitments yet. Feed will populate as instant-win contests open.
          </div>
        )}
        {state === 'ok' && rows.length > 0 && (
          <ul className="divide-y divide-slate-100" data-testid="verify-feed-list">
            {rows.map((r, i) => (
              <li key={r.config_hash_sha256} className="p-4" data-testid={`verify-row-${i}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-display font-bold text-slate-900">
                    {r.contest?.title || <span className="text-slate-500">Contest removed</span>}
                  </h3>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {new Date(r.committed_at).toLocaleString('en-GB')}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-indigo-700 font-semibold">{r.num_winning_tickets} winning tickets</span>
                </div>
                <div className="mt-2 flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                  <Hash className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <code className="text-xs text-slate-800 font-mono break-all flex-1">{r.config_hash_sha256}</code>
                  <Button variant="outline" size="sm" onClick={() => copy(r.config_hash_sha256, i)} data-testid={`verify-copy-${i}`}>
                    {copiedIdx === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-500 mt-6 leading-relaxed">
        Algorithm: SHA-256 of the JSON-encoded winning-ticket list. The plain list stays encrypted
        server-side (Fernet) and is decrypted only when a valid entrant completes the required
        skill task on a specific ticket. See our{' '}
        <a href="/legal/anti-fraud" className="text-indigo-700 hover:underline">Anti-Fraud Policy</a>{' '}
        for the full commitment scheme.
      </p>
    </div>
  );
}
