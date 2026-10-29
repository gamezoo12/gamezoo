import { Checkbox } from '../ui/checkbox';

export const PROMO_OPTIONS = [
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
  { key: 'web_notifications', label: 'Web Notifications' },
  { key: 'newsletter', label: 'Weekly Newsletter' },
];

export const EMPTY_PROMO = { sms: false, whatsapp: false, email: false, web_notifications: false, newsletter: false };

export default function PromotionsConsent({ values, onChange, onSave, saving = false, disabled = false, showSave = true, testid = 'promotions-consent' }) {
  const allSelected = PROMO_OPTIONS.every(o => values[o.key]);
  const setAll = (checked) => onChange(Object.fromEntries(PROMO_OPTIONS.map(o => [o.key, !!checked])));
  return (
    <section data-testid={testid} aria-label="Promotions Consent">
      <h3 className="font-display font-bold text-base text-slate-900">Promotions Consent</h3>
      <div className="mt-3 space-y-2">
        <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
          <Checkbox checked={allSelected} disabled={disabled || saving} onCheckedChange={setAll} data-testid={`${testid}-select-all`} />
          Select All
        </label>
        {PROMO_OPTIONS.map(o => (
          <label key={o.key} className="flex items-center gap-3 px-3 py-1.5 text-sm text-slate-800">
            <Checkbox
              checked={!!values[o.key]}
              disabled={disabled || saving}
              onCheckedChange={(v) => onChange({ ...values, [o.key]: !!v })}
              data-testid={`${testid}-${o.key}`}
            />
            {o.label}
          </label>
        ))}
      </div>
      {showSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || saving}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          data-testid={`${testid}-save`}
        >
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
      )}
    </section>
  );
}
