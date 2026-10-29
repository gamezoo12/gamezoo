import { useEffect, useState } from 'react';
import { offersAPI } from './api';

// The saved offer is read from the backend; a short cache keeps pages cheap while edits still show up within seconds.
const TTL_MS = 30000;
let cached = null;
let cachedAt = 0;
let inflight = null;

export const refreshActiveOffer = () => {
  cachedAt = 0;
  window.dispatchEvent(new Event('pl:offer-refresh'));
};

const load = () => {
  if (cached && Date.now() - cachedAt < TTL_MS) return Promise.resolve(cached);
  if (!inflight) {
    inflight = offersAPI.active()
      .then((data) => { cached = data; cachedAt = Date.now(); return data; })
      .finally(() => { inflight = null; });
  }
  return inflight;
};

export const gbpText = (value) => {
  const n = Number(value || 0);
  return `\u00a3${Number.isInteger(n) ? n : n.toFixed(2)}`;
};

export const tokensText = (value) => {
  const n = Number(value || 0);
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} token${n === 1 ? '' : 's'}`;
};

export default function useActiveOffer() {
  const [offer, setOffer] = useState(cached);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = () => load().then((data) => { if (alive) { setOffer(data); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    run();
    window.addEventListener('pl:offer-refresh', run);
    return () => { alive = false; window.removeEventListener('pl:offer-refresh', run); };
  }, []);

  return { offer, failed, loading: !offer && !failed };
}
