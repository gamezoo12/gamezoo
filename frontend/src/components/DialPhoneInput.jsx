import { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { useCountries } from './CountrySelect';

const flag = (c) => (c ? String.fromCodePoint(...[...c].map((x) => 127397 + x.charCodeAt(0))) : '');

// Mobile input locked to the country of residence's dialling code; emits a full +E.164 number.
export default function DialPhoneInput({ country, value, onChange, testId, autoFocus }) {
  const countries = useCountries();
  const dial = countries.find((c) => c.code === country)?.dial || (country === 'GB' ? '44' : '');
  const [raw, setRaw] = useState(() => (value && dial && value.startsWith(`+${dial}`) ? value.slice(dial.length + 1) : ''));
  useEffect(() => { if (!value) setRaw(''); }, [value]);
  useEffect(() => { setRaw(''); }, [country]);
  const change = (text) => {
    setRaw(text);
    const digits = text.replace(/\D/g, '').replace(/^0+/, '');
    onChange(digits && dial ? `+${dial}${digits}` : '');
  };
  return (
    <div className="flex gap-2">
      <span className="flex h-10 shrink-0 items-center gap-1 rounded-md border border-input bg-slate-50 px-3 text-sm font-semibold text-slate-700" data-testid={`${testId}-dial`} title="Set by your country of residence">
        {flag(country)} +{dial || '…'}
      </span>
      <Input data-testid={testId} type="tel" inputMode="tel" value={raw} onChange={(e) => change(e.target.value)}
        placeholder={country === 'GB' ? '7700 900123' : 'Mobile number'} autoFocus={autoFocus} />
    </div>
  );
}
