import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { pushAPI } from '../lib/api';
import { browserSupportsPush, enableBrowserNotifications } from '../lib/webPush';

// Shown only after an admin enabled Web Push for this user; the button triggers the browser's own Allow/Block prompt.
export default function WebPushPrompt() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!user?.user_id || !browserSupportsPush()) { setSettings(null); return undefined; }
    let active = true;
    pushAPI.settings().then((s) => { if (active) setSettings(s); }).catch(() => {});
    return () => { active = false; };
  }, [user?.user_id]);

  if (hidden || !settings?.prompt_required || !settings.available || Notification.permission === 'denied') return null;

  const enable = async () => {
    setBusy(true);
    const outcome = await enableBrowserNotifications(settings);
    setBusy(false);
    if (outcome !== 'failed') setHidden(true);
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg" role="dialog" aria-label="Notifications" data-testid="web-push-prompt">
      <span className="text-sm font-semibold text-slate-900">Get notifications from Prize League</span>
      <button type="button" onClick={enable} disabled={busy} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" data-testid="web-push-prompt-enable">
        {busy ? 'Enabling…' : 'Enable Notifications'}
      </button>
    </div>
  );
}
