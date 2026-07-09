// TrenchNote service worker — the offline layer (ADR 0008).
//
// Two caches, two strategies:
//
//   SHELL  (pages, our js, vendored libs, manifest, icons)
//     Cache-first. The app must OPEN with zero connectivity. Precached at
//     install; a new deploy changes this file (bump VERSION!), which makes
//     the browser install the new worker and re-download the shell.
//
//   API    (GET /api/... — records, files/photos)
//     Network-first with cache fallback. Live data when there's signal;
//     the last-known copy when there isn't. Every response we cache gets
//     an X-TN-Cached-At header stamped on it at store time, so when the
//     fallback serves it, the page can tell the user exactly how old the
//     data is. Cached data must never impersonate live data.
//
// Writes (POST/PATCH) pass straight through — offline queueing happens in
// tn-sync.js where the user can SEE it, not in service-worker magic.

const VERSION = 'v5';                    // bump on every shell change
const SHELL_CACHE = 'tn-shell-' + VERSION;
const API_CACHE = 'tn-api-' + VERSION;

const SHELL = [
  './',
  'index.html',
  'asset.html',
  'material.html',
  'labels.html',
  'login.html',
  'scan.html',
  'tn-auth.js',
  'tn-sync.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'vendor/alpine.min.js',
  'vendor/qrcode.min.js',
  // vendor/jsQR.min.js is deliberately NOT precached: it's the QR-decode
  // fallback for browsers without BarcodeDetector (iOS Safari), and
  // precaching would ship its weight to every browser. scan.html injects
  // it lazily; the runtime caching below keeps it for offline reuse on
  // the phones that actually fetched it. (ADR 0009)
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())   // new worker takes over without a tab-close dance
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // Drop caches from older VERSIONs so stale shells can't linger
        keys.filter((k) => k !== SHELL_CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())  // control already-open tabs immediately
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only GETs, only our own origin. Everything else (POST/PATCH writes,
  // auth-refresh, cross-origin) goes straight to the network untouched.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiNetworkFirst(req));
  } else {
    event.respondWith(shellCacheFirst(req));
  }
});

// ---- Shell: cache-first ----------------------------------------------------
// ignoreSearch matters: a scanned QR opens asset.html?code=A001, and that
// must match the cached asset.html.
async function shellCacheFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(req);
  // Runtime-cache successful static misses — this is how the lazily
  // loaded jsQR fallback becomes available offline on the (iOS) phones
  // that needed it, without precaching it for everyone.
  if (res.ok) {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(req, res.clone());
  }
  return res;
}

// ---- API reads: network-first, stamped cache fallback ----------------------
async function apiNetworkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      // Store a copy stamped with WHEN we cached it. We rebuild the
      // response because headers on a fetched Response are immutable.
      const cache = await caches.open(API_CACHE);
      const body = await res.clone().arrayBuffer();
      const headers = new Headers(res.headers);
      headers.set('X-TN-Cached-At', new Date().toISOString());
      cache.put(req, new Response(body, { status: res.status, headers }));
    }
    return res;
  } catch (err) {
    // Network is gone. Serve the last-known copy if we have one —
    // it carries X-TN-Cached-At, which the page turns into an
    // "as of 2:14 PM" banner (see tn-sync.js).
    // ignoreVary: PocketBase varies on Authorization, and the token
    // rotates on every auth-refresh — without this, yesterday's cache
    // would never match today's token.
    const cached = await caches.match(req, { ignoreVary: true });
    if (cached) return cached;
    // Nothing cached: a JSON 503 so page error handling stays sane.
    return new Response(
      JSON.stringify({ offline: true, message: 'Offline and no cached copy of this data.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
