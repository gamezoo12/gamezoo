import { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe2, History, Search, UserCheck } from 'lucide-react';
import { countryAdminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { toast } from 'sonner';

const PRIZE = ['allow_paid_contests', 'allow_free_world_prizes', 'allow_promo_draws', 'allow_wallet_topups', 'allow_prize_claims'];
const errText = (e) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : 'Request failed'; };
const SHORT = { allow_registration: 'Register', allow_login: 'Login', allow_browsing: 'Browse', allow_free_games: 'Free games',
  allow_leaderboards: 'Leaderboards', allow_paid_browsing: 'Paid browse', allow_paid_contests: 'Paid contests',
  allow_free_world_prizes: 'FW prizes', allow_promo_draws: 'Promo draws', allow_wallet_topups: 'Top-ups',
  allow_prize_claims: 'Claims', require_email_otp: 'Email OTP', require_phone_otp: 'Phone OTP' };

function useConfirm() {
  const [pending, setPending] = useState(null);
  const ask = (msg, run, title = 'Disable access?') => setPending({ msg, run, title });
  const node = (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
      <AlertDialogContent data-testid="country-confirm-dialog">
        <AlertDialogHeader><AlertDialogTitle>{pending?.title}</AlertDialogTitle><AlertDialogDescription>{pending?.msg}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="country-confirm-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction data-testid="country-confirm-ok" onClick={() => { pending?.run(); setPending(null); }}>Yes, save</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return [ask, node];
}

function PolicyTable({ data, reload }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(new Set());
  const [draft, setDraft] = useState({});
  const [ask, confirmNode] = useConfirm();
  const rows = useMemo(() => data.countries.filter((c) => `${c.name} ${c.code}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const val = (c, k) => (draft[c.code]?.[k] ?? c[k]);
  const toggle = (c, k) => setDraft((d) => {
    const next = { ...d[c.code], [k]: !val(c, k) };
    if (next[k] === c[k]) delete next[k];
    const out = { ...d, [c.code]: next };
    if (!Object.keys(next).length) delete out[c.code];
    return out;
  });
  const bulk = (on) => {
    const codes = sel.size ? [...sel] : rows.map((r) => r.code);
    const perms = data.permissions.map((p) => p.key).filter((k) => !k.startsWith('require_'));
    setDraft((d) => { const n = { ...d }; codes.forEach((c) => { n[c] = { ...n[c], ...Object.fromEntries(perms.map((k) => [k, on])) }; }); return n; });
  };
  const save = async () => {
    const groups = {};
    Object.entries(draft).forEach(([code, ch]) => { const key = JSON.stringify(ch); (groups[key] ||= []).push(code); });
    const disabling = Object.values(draft).some((ch) => Object.entries(ch).some(([k, v]) => k.startsWith('allow_') && v === false));
    const prizeOn = Object.values(draft).some((ch) => PRIZE.some((k) => ch[k] === true));
    const run = async () => {
      try {
        for (const [key, codes] of Object.entries(groups)) await countryAdminAPI.update(codes, JSON.parse(key), true);
        toast.success('Country permissions saved'); setDraft({}); setSel(new Set()); reload();
      } catch (e) { toast.error(errText(e)); }
    };
    if (disabling) ask('Some countries will lose access to features. Players in those countries will be blocked straight away.', run, 'Disable access?');
    else if (prizeOn) ask(`You are turning on prize features (paid contests, prizes, draws, top-ups or claims) for ${Object.keys(draft).length} countries. Only do this where prize competitions are legal. Age, residency and KYC checks still apply.`, run, 'Enable prize features?');
    else run();
  };
  const pick = (code) => setSel((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search countries or ISO code" className="pl-9" data-testid="country-search" /></div>
        <Button variant="outline" onClick={() => setSel(new Set(rows.map((r) => r.code)))} data-testid="country-select-all">Select shown ({rows.length})</Button>
        <Button variant="outline" onClick={() => setSel(new Set())} data-testid="country-select-none">Clear selection</Button>
        <Button variant="outline" onClick={() => bulk(true)} data-testid="country-enable-all">Enable all{sel.size ? ` (${sel.size})` : ''}</Button>
        <Button variant="outline" onClick={() => bulk(false)} data-testid="country-disable-all">Disable all{sel.size ? ` (${sel.size})` : ''}</Button>
        <Button onClick={save} disabled={!Object.keys(draft).length} className="bg-[#6C2BFF] text-white" data-testid="country-save">Save changes ({Object.keys(draft).length})</Button>
      </div>
      <div className="max-h-[620px] overflow-auto rounded-xl border border-slate-200" data-testid="country-table">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left"><tr>
            <th className="p-2" /><th className="p-2">Country</th><th className="p-2">Users</th>
            {data.permissions.map((p) => <th key={p.key} className="p-2 text-center font-semibold" title={p.label}>{SHORT[p.key]}</th>)}
          </tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.code} className={`border-t ${draft[c.code] ? 'bg-amber-50' : ''}`} data-testid={`country-row-${c.code}`}>
              <td className="p-2"><input type="checkbox" checked={sel.has(c.code)} onChange={() => pick(c.code)} data-testid={`country-check-${c.code}`} /></td>
              <td className="whitespace-nowrap p-2 font-semibold">{c.name} <span className="text-slate-400">{c.code}</span>{c.custom && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-700">custom</span>}</td>
              <td className="p-2">{c.users}</td>
              {data.permissions.map((p) => <td key={p.key} className="p-2 text-center">
                <Switch checked={!!val(c, p.key)} onCheckedChange={() => toggle(c, p.key)} data-testid={`perm-${c.code}-${p.key}`} />
              </td>)}
            </tr>))}</tbody>
        </table>
      </div>
      {confirmNode}
    </div>
  );
}

function DefaultPolicy({ data, reload }) {
  const [draft, setDraft] = useState({});
  const [ask, confirmNode] = useConfirm();
  const v = (k) => draft[k] ?? data.default[k];
  const save = () => {
    const run = async () => { try { await countryAdminAPI.updateDefault(draft, true); toast.success('Default policy saved'); setDraft({}); reload(); } catch (e) { toast.error(errText(e)); } };
    if (Object.entries(draft).some(([k, x]) => k.startsWith('allow_') && x === false)) ask('Every country without its own settings will lose these features.', run); else run();
  };
  return (
    <div className="space-y-3" data-testid="country-default-policy">
      <p className="text-sm text-slate-600">Applies to every country except the United Kingdom and countries with their own settings. Prize features still need a verified resident aged 18+.</p>
      <div className="grid gap-2 sm:grid-cols-2">{data.permissions.map((p) => (
        <label key={p.key} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
          {p.label}<Switch checked={!!v(p.key)} onCheckedChange={(x) => setDraft((d) => ({ ...d, [p.key]: x }))} data-testid={`default-${p.key}`} />
        </label>))}</div>
      <Button onClick={save} disabled={!Object.keys(draft).length} className="bg-[#6C2BFF] text-white" data-testid="default-save">Save default policy</Button>
      {confirmNode}
    </div>
  );
}

function ChangeRequests() {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => countryAdminAPI.changeRequests().then((r) => setRows(r.requests)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const decide = async (id, approve) => { try { await countryAdminAPI.decide(id, approve); toast.success(approve ? 'Approved' : 'Rejected'); load(); } catch (e) { toast.error(errText(e)); } };
  if (!rows.length) return <p className="text-sm text-slate-500" data-testid="country-requests-empty">No pending country change requests.</p>;
  return (
    <div className="space-y-2" data-testid="country-requests">{rows.map((r) => (
      <div key={r.request_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
        <span className="font-semibold">{r.email}</span><span>{r.current_country} → <b>{r.requested_country}</b></span>
        {r.reason && <span className="text-slate-500">“{r.reason}”</span>}
        <span className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => decide(r.request_id, true)} data-testid={`ccr-approve-${r.request_id}`}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => decide(r.request_id, false)} data-testid={`ccr-reject-${r.request_id}`}>Reject</Button>
        </span>
      </div>))}</div>
  );
}

function AuditLog() {
  const [rows, setRows] = useState([]);
  useEffect(() => { countryAdminAPI.audit().then((r) => setRows(r.entries)).catch(() => {}); }, []);
  return (
    <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200" data-testid="country-audit">
      <table className="w-full text-xs"><thead className="bg-slate-50 text-left"><tr><th className="p-2">When</th><th className="p-2">Admin</th><th className="p-2">Action</th><th className="p-2">Countries</th><th className="p-2">Change</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t align-top">
          <td className="whitespace-nowrap p-2">{new Date(r.at).toLocaleString()}</td><td className="p-2">{r.admin_email}</td><td className="p-2">{r.action}</td>
          <td className="max-w-[220px] p-2">{(r.codes || []).join(', ')}</td><td className="p-2 font-mono">{JSON.stringify(r.after)}</td></tr>)}</tbody></table>
      {!rows.length && <p className="p-4 text-sm text-slate-500">No changes yet.</p>}
    </div>
  );
}

function LegalDrafts() {
  const [data, setData] = useState(null);
  useEffect(() => { countryAdminAPI.legalDrafts().then(setData).catch(() => {}); }, []);
  if (!data) return null;
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast.success('Copied')).catch(() => toast.error('Copy failed'));
  return (
    <div className="space-y-3" data-testid="country-legal-drafts">
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{data.note} Your published documents have not been changed.</p>
      {data.drafts.map((d) => (
        <div key={d.slug} className="rounded-xl border border-slate-200 p-4" data-testid={`legal-draft-${d.slug}`}>
          <div className="mb-2 flex items-center justify-between"><b>{d.title}</b>
            <Button size="sm" variant="outline" onClick={() => copy(d.text)} data-testid={`legal-draft-copy-${d.slug}`}>Copy wording</Button></div>
          <pre className="whitespace-pre-wrap text-xs text-slate-700">{d.text}</pre>
        </div>))}
    </div>
  );
}

export default function CountryManagementAdmin() {
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  const load = useCallback(() => countryAdminAPI.policies().then(setData).catch((e) => { if (e?.response?.status === 403) setDenied(true); else toast.error(errText(e)); }), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-5" data-testid="country-management-page">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900"><Globe2 className="h-6 w-6 text-[#6C2BFF]" /> Country Management</h1>
        <p className="text-sm text-slate-500">Control what each country can do. Changes apply within seconds, no redeploy. Admin settings never override age, verified residency, KYC or payment-provider rules.</p>
        {data && <p className="mt-1 text-xs text-slate-500" data-testid="users-without-country">{data.users_without_country} users have no country recorded (prize features locked until they confirm).</p>}
      </div>
      {denied ? <p className="text-sm font-semibold text-red-600" data-testid="country-access-denied">Super Admin only.</p> : !data ? <p className="text-sm text-slate-500">Loading…</p> : (
        <Tabs defaultValue="countries">
          <TabsList>
            <TabsTrigger value="countries" data-testid="tab-countries">Countries</TabsTrigger>
            <TabsTrigger value="default" data-testid="tab-default">Default policy</TabsTrigger>
            <TabsTrigger value="requests" data-testid="tab-requests"><UserCheck className="mr-1 h-3.5 w-3.5" />Change requests</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history"><History className="mr-1 h-3.5 w-3.5" />Change history</TabsTrigger>
            <TabsTrigger value="legal" data-testid="tab-legal">T&amp;C wording</TabsTrigger>
          </TabsList>
          <TabsContent value="countries"><PolicyTable data={data} reload={load} /></TabsContent>
          <TabsContent value="default"><DefaultPolicy data={data} reload={load} /></TabsContent>
          <TabsContent value="requests"><ChangeRequests /></TabsContent>
          <TabsContent value="history"><AuditLog /></TabsContent>
          <TabsContent value="legal"><LegalDrafts /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
