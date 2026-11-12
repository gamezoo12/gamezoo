import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { countryAdminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';

function TwilioCosts({ title, usage }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid={`twilio-${title.replace(/\s/g, '-').toLowerCase()}`}>
      <p className="mb-2 font-bold">{title} — actual Twilio billing</p>
      {!usage?.available ? <p className="text-xs text-slate-500">Not available: {usage?.reason}</p> : (
        <table className="w-full text-xs"><tbody>{usage.records.map((r) => <tr key={r.category} className={`border-t ${r.is_total ? 'bg-slate-50 font-bold' : ''}`}>
          <td className="p-1.5">{r.description}</td><td className="p-1.5">{r.count}</td><td className="p-1.5 font-semibold">{r.price.toFixed(2)} {r.unit?.toUpperCase()}</td></tr>)}</tbody></table>)}
    </div>
  );
}

export default function OtpSettingsAdmin() {
  const [policies, setPolicies] = useState(null);
  const [otp, setOtp] = useState(null);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState({});
  const [denied, setDenied] = useState(false);
  const load = useCallback(() => {
    countryAdminAPI.policies().then(setPolicies).catch((e) => e?.response?.status === 403 && setDenied(true));
    countryAdminAPI.otp().then(setOtp).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const rows = useMemo(() => (policies?.countries || []).filter((c) => `${c.name} ${c.code}`.toLowerCase().includes(q.toLowerCase())), [policies, q]);
  const v = (c, k) => draft[c.code]?.[k] ?? c[k];
  const set = (c, k, val) => setDraft((d) => ({ ...d, [c.code]: { ...d[c.code], [k]: val } }));
  const save = async () => {
    try {
      for (const [code, ch] of Object.entries(draft)) await countryAdminAPI.update([code], ch, true);
      toast.success('OTP settings saved. Existing accounts keep the verification they signed up with.'); setDraft({}); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed'); }
  };
  if (denied) return <p className="text-sm font-semibold text-red-600" data-testid="country-access-denied">Super Admin only.</p>;
  return (
    <div className="space-y-5" data-testid="otp-settings-page">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900"><MessageSquare className="h-6 w-6 text-[#6C2BFF]" /> OTP &amp; SMS Costs</h1>
      <p className="text-sm text-slate-500">SMS codes are only sent to countries with Phone OTP on. Resend cooldown {otp?.rules?.resend_cooldown_seconds ?? 30}s, max {otp?.rules?.max_sends_per_15_min ?? 5} codes per 15 minutes per number. Changing a rule never removes verification from existing accounts.</p>
      {otp && <div className="grid gap-3 lg:grid-cols-2"><TwilioCosts title="This month" usage={otp.twilio_this_month} /><TwilioCosts title="Last month" usage={otp.twilio_last_month} /></div>}
      {otp && <p className="text-xs text-slate-500">{otp.note}</p>}
      {otp?.alerts?.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm" data-testid="sms-alerts">
        {otp.alerts.slice(0, 10).map((a, i) => <p key={i}>{new Date(a.at).toLocaleString()} · {a.country} · {a.kind === 'limit_reached' ? 'Daily SMS limit reached' : 'Alert threshold reached'} ({a.count}/{a.limit || '∞'})</p>)}</div>}
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country" className="max-w-xs" data-testid="otp-search" />
        <Button onClick={save} disabled={!Object.keys(draft).length} className="bg-[#6C2BFF] text-white" data-testid="otp-save">Save ({Object.keys(draft).length})</Button>
      </div>
      {policies && <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200" data-testid="otp-table">
        <table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-left"><tr><th className="p-2">Country</th><th className="p-2">Email OTP</th><th className="p-2">Phone OTP (SMS)</th>
          <th className="p-2">SMS daily limit</th><th className="p-2">Alert at</th><th className="p-2">Sent 24h</th><th className="p-2">Sent 30d</th></tr></thead>
          <tbody>{rows.map((c) => { const s = otp?.sms_by_country?.[c.code] || {}; return (
            <tr key={c.code} className={`border-t ${draft[c.code] ? 'bg-amber-50' : ''}`} data-testid={`otp-row-${c.code}`}>
              <td className="p-2 font-semibold">{c.name} <span className="text-slate-400">{c.code}</span></td>
              <td className="p-2"><Switch checked={!!v(c, 'require_email_otp')} onCheckedChange={(x) => set(c, 'require_email_otp', x)} data-testid={`otp-email-${c.code}`} /></td>
              <td className="p-2"><Switch checked={!!v(c, 'require_phone_otp')} onCheckedChange={(x) => set(c, 'require_phone_otp', x)} data-testid={`otp-phone-${c.code}`} /></td>
              <td className="p-2"><Input type="number" min={0} className="h-8 w-24" value={v(c, 'sms_daily_limit')} onChange={(e) => set(c, 'sms_daily_limit', Number(e.target.value))} data-testid={`otp-limit-${c.code}`} /></td>
              <td className="p-2"><Input type="number" min={0} className="h-8 w-24" value={v(c, 'sms_alert_at')} onChange={(e) => set(c, 'sms_alert_at', Number(e.target.value))} data-testid={`otp-alert-${c.code}`} /></td>
              <td className="p-2">{s.sent_24h || 0}</td><td className="p-2">{s.sent_30d || 0}</td>
            </tr>); })}</tbody></table>
      </div>}
      <p className="text-xs text-slate-500">Daily limit 0 = no cap. SMS counts by country are recorded from this release onwards.</p>
    </div>
  );
}
