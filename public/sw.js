// Storezn service worker.
//
// Two jobs:
//  1. Offline shell - so the app (and the register in particular) opens
//     with no network once it's been visited online. Runtime caching, no
//     build-time precache manifest, because Next serves content-hashed
//     asset URLs that change every deploy.
//  2. Web push - unchanged from before (see the push / notificationclick
//     handlers at the bottom).
//
// Strategy:
//  - /_next/static/*, /_next/image, fonts, images  -> cache-first
//    (immutable, content-hashed; safe to keep forever, trimmed by count)
//  - navigations + RSC fetches + other same-origin GET -> network-first,
//    fall back to the cached copy, then to a minimal offline page
//  - POST/PUT/etc, cross-origin, and /api/*  -> passed straight through.
//    API failures offline are handled by the app itself (the register's
//    IndexedDB sale queue + catalogue snapshot, see lib/posOffline.js).
//
// Bump VERSION only when this strategy changes - not every deploy. A
// changed sw.js is byte-compared by the browser and the new worker
// activates on its own (skipWaiting + clients.claim below).

const VERSION = "v2";
const STATIC_CACHE = `storezn-static-${VERSION}`;
const PAGES_CACHE = `storezn-pages-${VERSION}`;
const STATIC_MAX = 300;

const PRECACHE = ["/manifest.json", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    /\.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/i.test(url.pathname)
  );
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) {
    cache.put(request, res.clone());
    trimCache(STATIC_CACHE, STATIC_MAX);
  }
  return res;
}

function offlinePage() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>Offline</title><style>` +
      `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;min-height:100dvh;display:grid;place-items:center;background:#f6f8f4;color:#1a1e1a}` +
      `.c{max-width:22rem;text-align:center;padding:2rem;line-height:1.5}` +
      `h1{font-size:1.15rem;margin:0 0 .5rem}p{color:#59635c;font-size:.9rem;margin:.4rem 0}` +
      `a{display:inline-block;margin-top:1rem;color:#fff;background:#1f7a4d;padding:.6rem 1rem;border-radius:3px;text-decoration:none;font-weight:600;font-size:.9rem}` +
      `</style></head><body><div class="c"><h1>You're offline</h1>` +
      `<p>Reconnect and this page will load. Once the register has been opened it keeps working offline - sales are saved and sync when you're back.</p>` +
      `<a href="/vendor/orders/new">Open the register</a></div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (request.mode === "navigate") return offlinePage();
    throw err;
  }
}

// "Set up offline" button: the page sends the list of asset URLs it has
// already loaded plus the register route, and we fetch + cache them all
// now instead of waiting for them to be requested naturally. Replies on
// the message port with how many landed.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "PRECACHE" || !Array.isArray(data.urls)) return;
  const reply = event.ports && event.ports[0];
  event.waitUntil(
    (async () => {
      const staticC = await caches.open(STATIC_CACHE);
      const pagesC = await caches.open(PAGES_CACHE);
      let ok = 0;
      await Promise.all(
        data.urls.map(async (u) => {
          try {
            const req = new Request(u, { credentials: "same-origin" });
            const res = await fetch(req);
            if (!res || !res.ok) return;
            const target = isStaticAsset(new URL(u, self.location.origin)) ? staticC : pagesC;
            await target.put(req, res.clone());
            ok += 1;
          } catch {
            /* skip whatever won't fetch */
          }
        }),
      );
      trimCache(STATIC_CACHE, STATIC_MAX);
      if (reply) reply.postMessage({ cached: ok, total: data.urls.length });
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request).catch(() => fetch(request)));
    return;
  }

  // navigations, RSC fetches, and any other same-origin GET
  event.respondWith(networkFirst(request));
});

/* -------------------------------------------------------------------- */
/* Web push - unchanged                                                 */
/* -------------------------------------------------------------------- */

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
