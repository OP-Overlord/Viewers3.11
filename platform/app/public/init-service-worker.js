// Service worker registration is intentionally DISABLED.
//
// The previous PWA service worker cached JS/CSS with a StaleWhileRevalidate
// strategy, which served stale chunks after each deploy and left the viewer on
// a gray screen until a hard reload. We no longer register a service worker.
//
// This script only tears down any service worker a previous build installed:
// it unregisters existing registrations and clears the Cache Storage on the
// client. A static kill-switch `sw.js` (served alongside the app) handles the
// clients whose stale service worker would otherwise keep serving this file
// from cache.

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });

  if (self.caches && caches.keys) {
    caches
      .keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .catch(() => {
        /* no-op: Cache Storage may be unavailable */
      });
  }
}
