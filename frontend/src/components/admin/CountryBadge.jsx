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
  const code = country !== undefined ? country : (userId && loaded ? loaded[userId] : undefined);
  if (code === undefined) return null;
  return (
    <span data-testid={`country-badge-${userId || code || 'none'}`} title={code ? `Country of residence: ${code}` : 'No country recorded'}
      className={`ml-1 inline-flex items-center gap-0.5 rounded px-1 py-px align-middle text-[10px] font-bold ${code ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700'}`}>
      {code ? <>{flag(code)} {code}</> : '—'}
    </span>
  );
}
