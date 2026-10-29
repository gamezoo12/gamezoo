import { useEffect, useState } from 'react';

const KEY = 'pl-analytics-consent';
const AT_KEY = 'pl-analytics-consent-at';
const RENEW_AFTER_MS = 365 * 24 * 60 * 60 * 1000;

function browserOptOut() {
  return navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
}

function store(value) {
  try {
    localStorage.setItem(KEY, value);
    localStorage.setItem(AT_KEY, String(Date.now()));
  } catch (e) { /* tracking remains disabled */ }
}

// A saved choice is remembered until it is a year old; a missing timestamp is stamped now, not re-asked.
function savedChoice() {
  try {
    const value = localStorage.getItem(KEY);
    if (value !== 'granted' && value !== 'denied') return null;
    const at = Number(localStorage.getItem(AT_KEY));
    if (!at) { localStorage.setItem(AT_KEY, String(Date.now())); return value; }
    return Date.now() - at > RENEW_AFTER_MS ? null : value;
  } catch (e) {
    return 'denied';
  }
}

export default function AnalyticsConsent() {
  const [open, setOpen] = useState(() => savedChoice() === null && !browserOptOut());

  useEffect(() => {
    if (browserOptOut() && savedChoice() === null) store('denied');
    const reopen = () => setOpen(true);
    window.addEventListener('pl-open-privacy-settings', reopen);
    return () => window.removeEventListener('pl-open-privacy-settings', reopen);
  }, []);

  const choose = (value) => {
    store(value);
    setOpen(false);
    window.dispatchEvent(new CustomEvent('pl-analytics-consent-change'));
  };

  if (!open) return null;
  return (
    <aside className="fixed bottom-3 left-3 right-3 z-[12000] mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl" role="dialog" aria-label="Analytics preferences" data-testid="analytics-consent">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-slate-700">Allow optional analytics to help us improve Prize League?</p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => choose('denied')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" data-testid="analytics-decline">Decline</button>
          <button type="button" onClick={() => choose('granted')} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white" data-testid="analytics-accept">Allow analytics</button>
        </div>
      </div>
    </aside>
  );
}
