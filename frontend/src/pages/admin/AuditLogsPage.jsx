import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { ClipboardList, Search, RefreshCw } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';

const SOURCE_TONE = {
  winner_selection: 'bg-amber-100 text-amber-800',
  support_case:     'bg-[#6C2BFF]/10 text-[#6C2BFF]',
};

function fmt(v) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const r = await adminAPI.auditLogs(500);
      setLogs(r.logs || []);
    } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);

  const term = q.toLowerCase();
  const filtered = logs.filter(l =>
    !term ||
    (l.action || '').toLowerCase().includes(term) ||
    (l.source || '').toLowerCase().includes(term) ||
    (l.contest_id || '').toLowerCase().includes(term) ||
    (l.target || '').toLowerCase().includes(term) ||
    (l.admin_email || '').toLowerCase().includes(term)
  );

  return (
    <div className="space-y-4" data-testid="admin-audit-logs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-2xl font-extrabold text-white flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-[#FFD54A]" /> Audit logs ({logs.length})
        </h2>
        <Button onClick={load} disabled={busy} variant="outline" size="sm" className="bg-white/5 text-white border-white/20 hover:bg-white/10">
          <RefreshCw className={`w-3 h-3 mr-1 ${busy ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search action, source, contest, admin…" value={q} onChange={e => setQ(e.target.value)} className="pl-9 bg-white/5 border-white/20 text-white placeholder:text-white/40" data-testid="audit-search" />
      </div>
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-white/60">No audit records match.</div>
        ) : (
          <table className="w-full text-sm min-w-[900px] text-white">
            <thead className="bg-white/5 text-white/70">
              <tr>
                <th className="text-left p-3">When</th>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">Action</th>
                <th className="text-left p-3">Admin</th>
                <th className="text-left p-3">Target</th>
                <th className="text-left p-3">Meta</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, idx) => (
                <tr key={`${l.source}-${l.at}-${idx}`} className="border-t border-white/10">
                  <td className="p-3 text-white/70 text-xs whitespace-nowrap">{l.at ? new Date(l.at).toLocaleString('en-GB') : '—'}</td>
                  <td className="p-3"><span className={`text-[10px] px-2 py-1 rounded-full ${SOURCE_TONE[l.source] || 'bg-slate-100 text-slate-700'}`}>{(l.source || 'system').replace('_', ' ')}</span></td>
                  <td className="p-3 font-semibold">{l.action}</td>
                  <td className="p-3 text-white/70">{l.admin_email || l.admin_id || '—'}</td>
                  <td className="p-3 text-white/70 font-mono text-xs">{l.contest_id || l.target || '—'}</td>
                  <td className="p-3 text-white/60 text-xs max-w-xs truncate" title={fmt(l.meta)}>{fmt(l.meta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-white/40">Read-only. Actions include winner selection (draw/publish/correct) and support case status changes.</p>
    </div>
  );
}
