import { pushAPI } from './api';

const toKey = (publicKey) => {
  const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

export const browserSupportsPush = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Runs the native permission prompt, then saves a subscription. Returns subscribed | denied | unsupported | failed.
export async function enableBrowserNotifications(settings) {
  if (!browserSupportsPush() || !settings?.available || !settings.public_key) return 'unsupported';
  try {
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      await pushAPI.updatePreferences({ web_push_browser_permission: permission === 'denied' ? 'denied' : 'default' });
      return 'denied';
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription()
      || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(settings.public_key) });
    await pushAPI.registerWebSubscription(subscription.toJSON());
    return 'subscribed';
  } catch {
    return 'failed';
  }
}
