import { useSyncExternalStore } from 'react';
import { countryAdminAPI } from '../../lib/api';

let map = null;
let loading = false;
const listeners = new Set();
const subscribe = (l) => {
  listeners.add(l);
  if (!map && !loading) {
    loading = true;
    countryAdminAPI.userCountries().then((r) => { map = r.map || {}; listeners.forEach((x) => x()); }).catch(() => { loading = false; });
  }
  return () => listeners.delete(l);
};
const flag = (code) => (code && code.length === 2 ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '');

// Small country badge for admin lists; pass `country` directly or a `userId` to look it up.
export default function CountryBadge({ userId, country }) {
  const loaded = useSyncExternalStore(subscribe, () => map);
  const code = country !== undefined ? country : (userId && loaded ? (loaded[userId] ?? null) : undefined);
  if (code === undefined) return null;
  return (
    <span data-testid={`country-badge-${userId || code || 'none'}`} title={code ? `Country of residence: ${code}` : 'No country recorded'}
      className={`ml-1 inline-flex items-center gap-0.5 rounded px-1 py-px align-middle text-[10px] font-bold ${code ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700'}`}>
      {code ? <>{flag(code)} {code}</> : '—'}
    </span>
  );
}

export const useUserCountryMap = () => useSyncExternalStore(subscribe, () => map);

// Keeps rows whose user matches the chosen country ('' = all, 'UNSET' = no country recorded).
export function filterByCountry(rows, value, countryMap, getUserId = (r) => r.user_id, getCountry) {
  if (!value || !rows) return rows;
  return rows.filter((r) => {
    const code = getCountry ? getCountry(r) : countryMap?.[getUserId(r)];
    return value === 'UNSET' ? !code : code === value;
  });
}

export function CountryFilter({ value, onChange, testId = 'country-filter' }) {
  const m = useUserCountryMap();
  const codes = [...new Set(Object.values(m || {}).filter(Boolean))].sort();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} aria-label="Filter by country"
      className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800">
      <option value="">All countries</option>
      {codes.map((c) => <option key={c} value={c}>{flag(c)} {c}</option>)}
      <option value="UNSET">No country recorded</option>
    </select>
  );
}
