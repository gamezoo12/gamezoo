/*
 * Prize League PWA Service Worker
 *
 * Intentionally does NOT cache network responses.
 * Live Prize League data must continue to come from the network.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() || '' };
  }
  const target = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')
    ? data.url
    : '/my-account/notifications';
  event.waitUntil(self.registration.showNotification(data.title || 'Prize League', {
    body: data.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: data.event_id || 'prize-league-notification',
    renotify: false,
    data: { url: target },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url;
  const url = typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? new URL(target, self.location.origin).href
    : new URL('/my-account/notifications', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const client = clients.find((candidate) => new URL(candidate.url).origin === self.location.origin);
    return client ? client.navigate(url).then(() => client.focus()) : self.clients.openWindow(url);
  }));
});

/*
 * Minimal network-only fetch handler.
 *
 * A fetch handler is required for the browser to treat the app as an
 * installable PWA (so the install prompt can fire). It intentionally does
 * NOT cache anything — every request goes straight to the network so live
 * Prize League data (auth, APIs, contests, wallet, leaderboards, Free World,
 * Special Challenge) is never served stale.
 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(fetch(event.request));
});