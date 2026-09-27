// Deliberately no runtime caching: private API, media, auth, shares and operator
// responses must never enter a service-worker cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
