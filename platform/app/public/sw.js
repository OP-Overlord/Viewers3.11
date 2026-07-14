// Kill-switch service worker.
//
// The previous OHIF PWA service worker cached JS/CSS with a StaleWhileRevalidate
// strategy. After each deploy it served stale chunks, leaving the viewer stuck on
// a gray screen until a hard reload (Ctrl+Shift+R). We no longer ship a caching
// service worker; this self-destructing one clears every cache and unregisters
// itself so clients always load fresh assets straight from the server.
//
// The browser fetches this file directly (bypassing any active SW cache) on its
// update check, so previously-poisoned clients pick it up and tear themselves
// down on their next visit.
//
// IMPORTANT: do NOT add a `fetch` handler here — without one this SW is fully
// transparent and never intercepts requests.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
      await self.registration.unregister();
    })()
  );
});
