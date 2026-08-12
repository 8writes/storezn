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

// Push payload is always JSON (see lib/push.js's sendPushToUsers) -
// { title, body, url }. Falls back to a generic notification if a push
// ever arrives with no payload or malformed JSON, rather than silently
// dropping it (a bare push with no notification shown gets browsers to
// eventually revoke the subscription for "being noisy").
self.addEventListener("push", (event) => {
  let data = { title: "Storezn", body: "You have a new notification", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Not JSON - keep the generic fallback above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

// Focuses an already-open tab on the target URL instead of always
// opening a new one, if one happens to already be open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
