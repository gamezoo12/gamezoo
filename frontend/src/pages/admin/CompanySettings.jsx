import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../context/AuthContext';
import { Building2, Save, Lock, AlertTriangle } from 'lucide-react';

const FIELDS = [
  { key: 'legal_name', label: 'Legal company name' },
  { key: 'company_number', label: 'Company number' },
  { key: 'incorporated_on', label: 'Incorporated on' },
  { key: 'jurisdiction', label: 'Jurisdiction' },
  { key: 'company_type', label: 'Company type' },
  { key: 'website', label: 'Website' },
  { key: 'email_general', label: 'General email' },
  { key: 'email_support', label: 'Support email' },
];

const POSTAL_FIELDS = [
  { key: 'postal_address_line1', label: 'Postal address line 1' },
  { key: 'postal_address_line2', label: 'Postal address line 2 (city)' },
  { key: 'postal_address_country', label: 'Country (short)' },
  { key: 'postal_address_postcode', label: 'Postcode' },
  { key: 'postal_address_country_full', label: 'Country (full)' },
  { key: 'postal_max_entries_per_person', label: 'Max postal entries per person', type: 'number' },
];

export default function CompanySettingsAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === 'super_admin';
  const [company, setCompany] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/admin/company').then(r => setCompany(r.data)).catch(() => {});
  }, []);

  const setField = (k, v) => setCompany(c => ({ ...c, [k]: v }));
  const setAddr = (k, v) => setCompany(c => ({ ...c, registered_address: { ...(c?.registered_address || {}), [k]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/company', company);
      toast({ title: 'Company settings saved', description: 'Change written to audit log.' });
    } catch (err) {
      toast({ title: 'Save failed', description: err?.response?.data?.detail || err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!company) return <div className="p-6 text-slate-500">Loading…</div>;

  return (
    <div className="p-6 max-w-4xl" data-testid="company-settings-admin">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-5 h-5 text-indigo-600" />
        <h1 className="font-display font-extrabold text-2xl">Company Settings</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Editable by Super Admin only. Every change is written to the audit log.
      </p>

      {!isSuperAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2 mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          You are viewing in read-only mode. Only Super Admin can save changes.
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <h2 className="font-display font-bold text-lg mb-3">Company identity</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {FIELDS.map(f => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input
                value={company[f.key] || ''}
                onChange={e => setField(f.key, e.target.value)}
                disabled={!isSuperAdmin}
                data-testid={`company-${f.key}`}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <h2 className="font-display font-bold text-lg mb-3">Registered office</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {['line1', 'line2', 'country', 'postcode', 'country_full'].map(k => (
            <div key={k}>
              <Label>{k.replace('_', ' ')}</Label>
              <Input
                value={company.registered_address?.[k] || ''}
                onChange={e => setAddr(k, e.target.value)}
                disabled={!isSuperAdmin}
                data-testid={`addr-${k}`}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <h2 className="font-display font-bold text-lg mb-3">Free postal entry</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {POSTAL_FIELDS.map(f => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input
                type={f.type || 'text'}
                value={company[f.key] ?? ''}
                onChange={e => setField(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                disabled={!isSuperAdmin}
                data-testid={`postal-${f.key}`}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <Label>Required envelope details</Label>
            <textarea
              rows={5}
              value={company.postal_required_details || ''}
              onChange={e => setField('postal_required_details', e.target.value)}
              disabled={!isSuperAdmin}
              className="w-full rounded-lg border border-slate-200 p-2 text-sm font-mono"
              data-testid="postal-required-details"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Postal eligibility rules</Label>
            <textarea
              rows={3}
              value={company.postal_eligibility_rules || ''}
              onChange={e => setField('postal_eligibility_rules', e.target.value)}
              disabled={!isSuperAdmin}
              className="w-full rounded-lg border border-slate-200 p-2 text-sm"
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <h2 className="font-display font-bold text-lg mb-3">Legal footer text</h2>
        <textarea
          rows={4}
          value={company.legal_footer || ''}
          onChange={e => setField('legal_footer', e.target.value)}
          disabled={!isSuperAdmin}
          className="w-full rounded-lg border border-slate-200 p-3 text-sm"
          data-testid="company-legal-footer"
        />
      </section>

      <section className="bg-rose-50/40 rounded-2xl border border-rose-200 p-5 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-rose-600" />
          <h2 className="font-display font-bold text-lg text-rose-800">Legally restricted contest engines</h2>
        </div>
        <p className="text-sm text-rose-800/80 mb-3">
          Random-draw and instant-win competitions may have different UK legal
          treatment. These engines remain <strong>disabled</strong> until formal
          legal advice is obtained and a signed approval document is uploaded.
        </p>
        <div className="flex flex-col gap-2">
          {[
            ['random_draw_engine_enabled', 'Enable random-draw engine (Contest Type 2)'],
            ['instant_win_engine_enabled', 'Enable instant-win engine (Contest Type 3)'],
          ].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!company[k]}
                onChange={e => setField(k, e.target.checked)}
                disabled={!isSuperAdmin}
                className="w-4 h-4 accent-rose-600"
                data-testid={`toggle-${k}`}
              />
              <span>{label}</span>
              {!company[k] && <span className="text-[10px] uppercase tracking-wider text-rose-700">Legal approval required</span>}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <Label>Legal review notes</Label>
          <textarea
            rows={3}
            value={company.legal_review_notes || ''}
            onChange={e => setField('legal_review_notes', e.target.value)}
            disabled={!isSuperAdmin}
            className="w-full rounded-lg border border-rose-200 p-2 text-sm"
            placeholder="Solicitor name, advice date, approval reference…"
          />
        </div>
      </section>

      <Button
        onClick={save}
        disabled={!isSuperAdmin || saving}
        className="pl-btn-purple text-white"
        data-testid="company-save-btn"
      >
        <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save company settings'}
      </Button>
    </div>
  );
}
