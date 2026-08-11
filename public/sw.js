// Deliberately does no caching - exists only so the browser considers the
// app installable as a PWA. Every request just passes straight through to
// the network.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
