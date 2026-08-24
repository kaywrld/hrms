const CACHE_NAME    = 'jecca-hrms-v3';
const STATIC_ASSETS = [
  '/bg.jpeg',
  '/logo.jpeg',
];
const APP_SHELL_KEY = '/'; // one consistent cache key for "the current HTML shell"

// Races a fetch against a timeout so a hung/slow connection fails fast
// into the offline/cache fallback instead of leaving the UI stuck waiting.
const withTimeout = (promise, ms = 8000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // API calls → Network First, with a timeout so slow connections fail
  // fast. On failure, fall back to cache but mark the response as stale
  // via a header so the frontend can tell it's not fresh data instead of
  // silently trusting it.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      withTimeout(fetch(request))
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            const headers = new Headers(cached.headers);
            headers.set('X-Served-By', 'sw-stale-cache');
            return new Response(cached.body, { status: cached.status, headers });
          }
          return new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return;
  }

  // Page navigations → Network First (with timeout). Every successful load
  // overwrites a single "app shell" cache entry (keyed as '/', regardless
  // of which SPA route was actually requested) — that's what's offered
  // offline, so it's always the most recently seen version, never a
  // permanently stale one.
  const isNavigation = request.mode === 'navigate' || url.pathname === '/index.html';
  if (isNavigation) {
    event.respondWith(
      withTimeout(fetch(request))
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(APP_SHELL_KEY, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(APP_SHELL_KEY);
          // Guaranteed fallback — never resolves to undefined, which is
          // what caused the "Failed to fetch" error.
          return cached || new Response(
            '<h1>You are offline</h1><p>Please reconnect and try again.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // Everything else (hashed JS/CSS bundles, images, fonts) → Cache First.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(err => {
          // Guaranteed fallback — never leaves the promise unhandled.
          console.warn('[SW] Fetch failed for', request.url, err);
          return new Response('', { status: 504, statusText: 'Gateway Timeout (offline)' });
        });
    })
  );
});