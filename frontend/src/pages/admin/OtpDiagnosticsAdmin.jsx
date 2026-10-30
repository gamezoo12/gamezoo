import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';

const BAD = /error|unreachable|expired|wrong/;

export default function OtpDiagnosticsAdmin() {
  const [hours, setHours] = useState(24);
  const [d, setD] = useState(null);
  const load = useCallback(() => api.get('/admin/otp-diagnostics', { params: { hours } }).then((r) => setD(r.data)).catch(() => setD({ summary: [], email_domains: [], recent: [] })), [hours]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-5" data-testid="otp-diagnostics-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-display text-2xl font-extrabold">OTP Diagnostics</h1><p className="text-sm text-slate-500">Delivery and verification outcomes for sign-up, phone and password-reset codes. Codes are never stored or shown.</p></div>
        <div className="flex gap-2">
          {[24, 168, 720].map((h) => <Button key={h} size="sm" variant={hours === h ? 'default' : 'outline'} onClick={() => setHours(h)} data-testid={`otp-range-${h}`}>{h === 24 ? '24h' : h === 168 ? '7 days' : '30 days'}</Button>)}
          <Button size="sm" variant="outline" onClick={load} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>
      <section className="rounded-2xl border border-slate-100 bg-white p-4">
        <h2 className="mb-2 font-bold">Summary</h2>
        <table className="w-full text-sm" data-testid="otp-summary"><thead className="text-left text-[11px] uppercase text-slate-500"><tr><th className="py-1">Channel</th><th>Purpose</th><th>Result</th><th>Provider code</th><th>Count</th></tr></thead>
          <tbody>{d?.summary.map((s, i) => <tr key={i} className={`border-t border-slate-100 ${BAD.test(s.result) ? 'text-rose-700' : ''}`}><td className="py-1">{s.channel}</td><td>{s.purpose}</td><td>{s.result}</td><td>{s.provider_code ?? '—'}</td><td className="font-bold">{s.count}</td></tr>)}</tbody></table>
        {d && !d.summary.length && <p className="py-4 text-sm text-slate-400">No OTP activity in this period.</p>}
      </section>
      <section className="rounded-2xl border border-slate-100 bg-white p-4">
        <h2 className="mb-2 font-bold">Email sends by provider domain</h2>
        <div className="flex flex-wrap gap-2" data-testid="otp-domains">{d?.email_domains.map((x, i) => <span key={i} className={`rounded-full px-2.5 py-1 text-xs ${x.result === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{x.domain || '?'} · {x.result} · {x.count}</span>)}</div>
      </section>
      <section className="rounded-2xl border border-slate-100 bg-white p-4 overflow-x-auto">
        <h2 className="mb-2 font-bold">Recent events</h2>
        <table className="w-full min-w-[720px] text-sm" data-testid="otp-recent"><thead className="text-left text-[11px] uppercase text-slate-500"><tr><th className="py-1">Time</th><th>Channel</th><th>Purpose</th><th>Destination</th><th>Result</th><th>Provider</th></tr></thead>
          <tbody>{d?.recent.map((r, i) => <tr key={i} className={`border-t border-slate-100 ${BAD.test(r.result) ? 'text-rose-700' : ''}`}><td className="py-1 whitespace-nowrap">{new Date(r.at).toLocaleString('en-GB')}</td><td>{r.channel}</td><td>{r.purpose}</td><td className="font-mono text-xs">{r.destination}</td><td>{r.result}</td><td className="text-xs">{r.provider_code ? `${r.provider_code} ${r.detail || ''}` : ''}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}
