import { useEffect, useState } from 'react';
import { adminAPI, api, uploadsAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { Settings as SettingsIcon, Save, Trash2, AlertTriangle, Upload, Image as ImageIcon, X } from 'lucide-react';

export default function SettingsPage() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => { adminAPI.getSettings().then(setS).catch(() => setS({})); }, []);
  const upd = (k, v) => setS(prev => ({ ...prev, [k]: v }));

  const promotionCount = Math.max(
    1,
    Math.min(5, Number(s?.promotion_slide_count) || 1)
  );

  const promotionSlides = Array.from(
    { length: promotionCount },
    (_, index) => ({
      url: String(s?.promotion_slides?.[index]?.url || ''),
    })
  );

  const setPromotionCount = (value) => {
    const count = Math.max(1, Math.min(5, Number(value) || 1));

    setS(prev => {
      const existing = Array.isArray(prev?.promotion_slides)
        ? prev.promotion_slides
        : [];

      return {
        ...prev,
        promotion_slide_count: count,
        promotion_slides: Array.from(
          { length: count },
          (_, index) => ({
            url: String(existing[index]?.url || ''),
          })
        ),
      };
    });
  };

  const uploadPromotionSlide = async (index, file) => {
    if (!file) return;

    try {
      const result = await uploadsAPI.image(file);

      setS(prev => {
        const count = Math.max(
          1,
          Math.min(5, Number(prev?.promotion_slide_count) || 1)
        );

        const slides = Array.from(
          { length: count },
          (_, position) => ({
            url: String(prev?.promotion_slides?.[position]?.url || ''),
          })
        );

        slides[index] = {
          url: result?.url || '',
        };

        return {
          ...prev,
          promotion_slides: slides,
        };
      });

      toast({
        title: `Promotion ${index + 1} uploaded`,
        description: 'Press Save settings to publish the slider change.',
      });
    } catch (e) {
      toast({
        title: 'Upload failed',
        description:
          e?.response?.data?.detail ||
          'Could not upload promotion image.',
      });
    }
  };

  const removePromotionSlide = (index) => {
    setS(prev => {
      const count = Math.max(
        1,
        Math.min(5, Number(prev?.promotion_slide_count) || 1)
      );

      const slides = Array.from(
        { length: count },
        (_, position) => ({
          url: String(prev?.promotion_slides?.[position]?.url || ''),
        })
      );

      slides[index] = { url: '' };

      return {
        ...prev,
        promotion_slides: slides,
      };
    });
  };

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

      <section
        className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5"
        data-testid="homepage-promotions-settings"
      >
        <div>
          <h3 className="font-display font-bold text-lg">
            Homepage Promotions
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Choose how many promotion slides appear at the top of the homepage.
            Recommended image size: 1600 × 800 px (2:1).
          </p>
        </div>

        <div className="max-w-xs">
          <Label>Number of slides</Label>

          <select
            value={promotionCount}
            onChange={e => setPromotionCount(e.target.value)}
            className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            data-testid="promotion-slide-count"
          >
            {[1, 2, 3, 4, 5].map(count => (
              <option key={count} value={count}>
                {count} {count === 1 ? 'slide' : 'slides'}
              </option>
            ))}
          </select>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {promotionSlides.map((slide, index) => (
            <div
              key={index}
              className="rounded-2xl border border-slate-200 overflow-hidden"
              data-testid={`promotion-admin-slot-${index}`}
            >
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="font-bold text-sm">
                  Slide {index + 1}
                </div>

                {slide.url && (
                  <button
                    type="button"
                    onClick={() => removePromotionSlide(index)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    <X className="w-4 h-4" />
                    Remove
                  </button>
                )}
              </div>

              <div className="p-4">
                <div className="relative aspect-[2/1] rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                  {slide.url ? (
                    <img
                      src={slide.url}
                      alt={`Promotion ${index + 1}`}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                      <ImageIcon className="w-8 h-8 mb-2" />
                      <div className="text-xs">
                        No image uploaded
                      </div>
                    </div>
                  )}
                </div>

                <label className="mt-3 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[#6C2BFF] hover:bg-[#4A15D9] text-white text-sm font-bold cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {slide.url ? 'Replace image' : 'Upload image'}

                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      uploadPromotionSlide(index, file);
                      e.target.value = '';
                    }}
                    data-testid={`promotion-upload-${index}`}
                  />
                </label>

                {slide.url && (
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    {slide.url}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 text-xs text-violet-800">
          Upload all required images, then use the main
          <strong> Save settings </strong>
          button below. The homepage slider updates from these saved settings.
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
