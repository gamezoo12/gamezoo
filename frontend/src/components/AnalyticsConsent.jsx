import { useEffect, useState } from 'react';

const KEY = 'pl-analytics-consent';

function browserOptOut() {
  return navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
}

export default function AnalyticsConsent() {
  const [choice, setChoice] = useState(() => {
    try { return localStorage.getItem(KEY); } catch (e) { return 'denied'; }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (choice === null) setOpen(true);
  }, [choice]);

  const choose = (value) => {
    try { localStorage.setItem(KEY, value); } catch (e) { /* tracking remains disabled */ }
    setChoice(value);
    setOpen(false);
    window.dispatchEvent(new CustomEvent('pl-analytics-consent-change'));
  };

  return (
    <>
      {open && (
        <aside className="fixed bottom-3 left-3 right-3 z-[12000] mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl" role="dialog" aria-label="Analytics preferences" data-testid="analytics-consent">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm text-slate-700">
              {browserOptOut()
                ? 'Your browser privacy setting disables optional analytics. No analytics will be collected.'
                : 'Allow optional, privacy-light analytics to help us understand page visits and improve Prize League? We never send your name, email, IP address or authentication tokens.'}
            </p>
            <div className="flex shrink-0 gap-2">
              {browserOptOut() ? (
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Close</button>
              ) : (
                <>
                  <button type="button" onClick={() => choose('denied')} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" data-testid="analytics-decline">Decline</button>
                  <button type="button" onClick={() => choose('granted')} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white" data-testid="analytics-accept">Allow analytics</button>
                </>
              )}
            </div>
          </div>
        </aside>
      )}
      {!open && choice !== null && (
        <button type="button" onClick={() => setOpen(true)} className="fixed bottom-2 left-2 z-[40] rounded border border-slate-300 bg-white/90 px-2 py-1 text-[10px] text-slate-600 shadow-sm" data-testid="analytics-settings">Privacy settings</button>
      )}
    </>
  );
}
