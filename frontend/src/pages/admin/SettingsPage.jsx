import { useEffect, useState } from 'react';
import { adminAPI, api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { Settings as SettingsIcon, Save, Trash2, AlertTriangle } from 'lucide-react';

export default function SettingsPage() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => { adminAPI.getSettings().then(setS).catch(() => setS({})); }, []);
  const upd = (k, v) => setS(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const r = await adminAPI.updateSettings(s);
      setS(r);
      toast({ title: 'Settings saved' });
    } catch (e) { toast({ title: 'Failed', description: e?.response?.data?.detail }); }
    finally { setBusy(false); }
  };

  if (!s) return <div className="text-slate-500">Loading settings…</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-6 h-6 text-[#6C2BFF]" />
        <h2 className="font-display text-2xl font-extrabold">Site Settings</h2>
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
        <h3 className="font-display font-bold text-lg">Branding</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div><Label>Site name</Label><Input value={s.site_name || ''} onChange={e => upd('site_name', e.target.value)} /></div>
          <div><Label>Tagline</Label><Input value={s.tagline || ''} onChange={e => upd('tagline', e.target.value)} /></div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
        <h3 className="font-display font-bold text-lg">Contact &amp; legal</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div><Label>Support email</Label><Input type="email" value={s.support_email || ''} onChange={e => upd('support_email', e.target.value)} /></div>
          <div><Label>Support phone</Label><Input value={s.support_phone || ''} onChange={e => upd('support_phone', e.target.value)} /></div>
          <div><Label>Company registration #</Label><Input value={s.company_registration || ''} onChange={e => upd('company_registration', e.target.value)} /></div>
          <div><Label>VAT number</Label><Input value={s.vat_number || ''} onChange={e => upd('vat_number', e.target.value)} /></div>
          <div><Label>Privacy policy URL</Label><Input value={s.privacy_policy_url || ''} onChange={e => upd('privacy_policy_url', e.target.value)} /></div>
          <div><Label>Terms &amp; conditions URL</Label><Input value={s.terms_url || ''} onChange={e => upd('terms_url', e.target.value)} /></div>
        </div>
        <div><Label>Postal free-entry address</Label><Textarea rows={4} value={s.postal_address || ''} onChange={e => upd('postal_address', e.target.value)} /></div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
        <h3 className="font-display font-bold text-lg">Payouts &amp; KYC</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div><Label>Currency</Label><Input value={s.currency || 'GBP'} onChange={e => upd('currency', e.target.value)} /></div>
          <div><Label>Minimum withdrawal</Label><Input type="number" value={s.min_withdrawal || 0} onChange={e => upd('min_withdrawal', parseFloat(e.target.value) || 0)} /></div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
          <div><div className="font-medium">Require KYC before payout</div><div className="text-sm text-slate-500">Users must be verified before we release cash prizes.</div></div>
          <Switch checked={!!s.kyc_required_for_payout} onCheckedChange={v => upd('kyc_required_for_payout', v)} />
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
        <h3 className="font-display font-bold text-lg">Access &amp; compliance</h3>
        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
          <div><div className="font-medium">New user sign-ups enabled</div><div className="text-sm text-slate-500">Turn off to close the site to new registrations.</div></div>
          <Switch checked={!!s.signup_enabled} onCheckedChange={v => upd('signup_enabled', v)} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
          <div><div className="font-medium">Auto-launch new contests</div><div className="text-sm text-slate-500">When ON, new contests go live immediately. Default OFF (draft first).</div></div>
          <Switch checked={!!s.auto_launch_contests} onCheckedChange={v => upd('auto_launch_contests', v)} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
          <div><div className="font-medium">18+ age gate</div><div className="text-sm text-slate-500">Show an age-check modal on first visit.</div></div>
          <Switch checked={!!s.age_gate_enabled} onCheckedChange={v => upd('age_gate_enabled', v)} />
        </div>
        <div><Label>Minimum age</Label><Input type="number" value={s.min_age || 18} onChange={e => upd('min_age', parseInt(e.target.value) || 18)} className="max-w-[8rem]" /></div>
      </section>

      <div className="flex justify-end sticky bottom-0 py-4 bg-slate-50/80 backdrop-blur">
        <Button onClick={save} disabled={busy} className="bg-[#6C2BFF] hover:bg-[#4A15D9]"><Save className="w-4 h-4 mr-1" /> {busy ? 'Saving…' : 'Save settings'}</Button>
      </div>

      <WipeDemoDataPanel />
    </div>
  );
}

// -----------------------------------------------------------------
// Danger Zone: one-click reset of all test/demo data. Used after a fresh
// production deploy when the pod inherits leftover demo rows from earlier
// testing. Requires super_admin role + password + literal phrase.
// -----------------------------------------------------------------
function WipeDemoDataPanel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);

  const run = async () => {
    if (confirm !== 'WIPE DEMO DATA') { toast({ title: 'Type the confirmation phrase exactly' }); return; }
    if (!password) { toast({ title: 'Enter your admin password' }); return; }
    setBusy(true);
    try {
      const r = await api.post('/admin/system/wipe-demo-data', { password, confirm }).then(x => x.data);
      setReport(r);
      toast({ title: 'Demo data wiped', description: `Removed rows across ${Object.keys(r.wiped || {}).length} collections.` });
      setPassword(''); setConfirm('');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast({ title: 'Wipe failed', description: e?.response?.data?.detail || 'See console' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 mt-8" data-testid="danger-zone-wipe">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5" /></div>
        <div className="flex-1">
          <h3 className="font-display font-extrabold text-rose-900 text-lg">Danger Zone — Wipe Demo Data</h3>
          <p className="text-sm text-rose-800 mt-1">
            Deletes ALL contests, orders, tickets, wallet transactions, KYC records, notifications, audit logs and every regular player account. <strong>Staff accounts (admin / super_admin / operator / support) are preserved</strong> and their wallets reset to £0. Legal documents and company settings are untouched. This is irreversible — use only right after a fresh production deploy to clear leftover test data.
          </p>

          {!open ? (
            <Button onClick={() => setOpen(true)} className="mt-4 bg-rose-600 hover:bg-rose-700 text-white" data-testid="wipe-open-btn">
              <Trash2 className="w-4 h-4 mr-1" /> Open danger zone
            </Button>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <Label>Your admin password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="•••••••" className="max-w-md" data-testid="wipe-password-input" />
              </div>
              <div>
                <Label>Type <span className="font-mono">WIPE DEMO DATA</span> to confirm</Label>
                <Input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="WIPE DEMO DATA" className="max-w-md font-mono" data-testid="wipe-confirm-input" />
              </div>
              <div className="flex gap-2">
                <Button onClick={run} disabled={busy} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="wipe-submit-btn">
                  {busy ? 'Wiping…' : 'Wipe demo data now'}
                </Button>
                <Button variant="outline" onClick={() => { setOpen(false); setPassword(''); setConfirm(''); }}>Cancel</Button>
              </div>
              {report && (
                <div className="mt-3 text-xs text-slate-700 bg-white rounded-lg border border-slate-200 p-3" data-testid="wipe-report">
                  <div className="font-semibold mb-1">Wipe report</div>
                  <pre className="whitespace-pre-wrap font-mono">{JSON.stringify(report.wiped, null, 2)}</pre>
                  <div className="mt-2">Preserved staff accounts: <strong>{report.preserved_users}</strong></div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
