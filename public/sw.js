// FlatHub's service worker. It exists for one reason: the browser decrypts an incoming web push
// and dispatches a `push` event HERE, so without this file there are no notifications at all on
// Android, and none on an iPhone's Home Screen install either.
//
// Deliberately NOT an offline/caching worker. Caching the app shell would mean a mate reading a
// stale kitty balance after a top-up landed, and this app's whole promise is that the screen shows
// the truth. Every notification is a nudge to a screen that fetches fresh — never the fact itself.
//
// Served from public/, which Expo copies to the web output root, so its scope is "/" — the whole
// app. Registered from src/lib/push.ts.

// Take over as soon as a new version is deployed, instead of waiting for every tab to close.
// A notification worker that is a version behind is a notification nobody gets.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  // The subscription is made with userVisibleOnly: true, which is mandatory on every browser that
  // supports web push: we are REQUIRED to show a notification for every push that arrives. So
  // there is no silent-data path here, and a malformed payload still has to put something on
  // screen rather than nothing.
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(d.title || 'FlatHub', {
      body: d.body || '',
      // Collapse by tag: a second send of the same trigger REPLACES the first in the tray instead
      // of stacking. One stale "your duty is due today" is forgivable; four of them is why people
      // turn notifications off.
      tag: d.tag || 'flathub',
      // The per-trigger 'silent' preference (v3/b5-profile) arrives here: the notification still
      // lands in the tray and still counts, it just does not buzz the phone.
      silent: !!d.silent,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Where tapping it should land. Always a screen that already shows the fact, because on
      // iPhone some pushes are simply missed and a missed one must cost nothing.
      data: { url: typeof d.url === 'string' ? d.url : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      // Reuse the window the mate already has open — opening a second copy of a Home Screen web
      // app is disorienting, and on iOS it may not open one at all.
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) await client.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// ponytail: no `pushsubscriptionchange` handler. The spec'd event is the proper way to hear that a
// subscription rotated, but re-registering from here needs a signed-in Supabase session and the
// worker has no access to the app's auth token. src/lib/push.ts re-subscribes on every app open
// instead, which is the mitigation iOS needs anyway — Apple's own forums document the
// subscription vanishing with no event at all (https://developer.apple.com/forums/thread/728796).
//
// ponytail: no navigator.setAppBadge() here either. The OS icon badge works on an iPhone Home
// Screen install from iOS 16.4 and is not implemented on Chrome for Android, so it is a bonus on
// one platform — and it needs an unread COUNT, which is the in-app count B-later builds. Set it
// from the push payload once that count exists.
