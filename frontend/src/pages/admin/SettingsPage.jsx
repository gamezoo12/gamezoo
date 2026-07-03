import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { Settings as SettingsIcon, Save } from 'lucide-react';

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
        <SettingsIcon className="w-6 h-6 text-teal-600" />
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
        <Button onClick={save} disabled={busy} className="bg-teal-600 hover:bg-teal-700"><Save className="w-4 h-4 mr-1" /> {busy ? 'Saving…' : 'Save settings'}</Button>
      </div>
    </div>
  );
}
