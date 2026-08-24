const CACHE_NAME    = 'jecca-hrms-v3';
const STATIC_ASSETS = [
  '/bg.jpeg',
  '/logo.jpeg',
];
const APP_SHELL_KEY = '/'; // one consistent cache key for "the current HTML shell"

// SPA route prefixes that should always be treated as navigations, even
// when the request was issued via fetch()/router prefetch rather than an
// actual browser navigation (request.mode !== 'navigate' in that case).
// Without this, a request like /portal/hrm?page=attendance falls through
// to the generic Cache-First bucket below, has no cache entry, and any
// network hiccup surfaces as a bare 504 instead of the offline fallback.
const APP_ROUTE_PREFIXES = ['/portal/'];

// Default timeout for /api/ calls.
const DEFAULT_API_TIMEOUT_MS = 8000;

// Heavier report-style queries (large page_size, wide date ranges, exports)
// legitimately take longer on shared hosting than a normal list call.
// These get a longer timeout instead of racing the same 8s clock and
// getting killed mid-flight, which was surfacing as a fake 503 even when
// the request would have succeeded a few seconds later.
const LONG_API_TIMEOUT_MS = 30000;

function getApiTimeout(url) {
  const pageSize = Number(url.searchParams.get('page_size') || 0);
  const isWideDateRange = url.searchParams.has('date_after') && url.searchParams.has('date_before');
  const isExport = url.pathname.endsWith('/export/') || url.searchParams.has('export');

  if (pageSize >= 1000 || isWideDateRange || isExport) {
    return LONG_API_TIMEOUT_MS;
  }
  return DEFAULT_API_TIMEOUT_MS;
}

// Races a fetch against a timeout so a hung/slow connection fails fast
// into the offline/cache fallback instead of leaving the UI stuck waiting.
const withTimeout = (promise, ms = DEFAULT_API_TIMEOUT_MS) =>
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

  // Endpoints where a stale cached response is actively dangerous to show
  // as if it were current — attendance is edited constantly by HODs/HRM and
  // the whole point of the register/history views is "is this marked right
  // now". Silently handing back a pre-edit snapshot with a 200 status here
  // makes a successful save look like it didn't happen. These get network
  // only: no cache read fallback, so a timeout surfaces as a real failure
  // the UI can retry, instead of quietly-wrong data.
  const NO_STALE_FALLBACK_PREFIXES = ['/api/attendance'];
  const noStaleFallback = NO_STALE_FALLBACK_PREFIXES.some(p => url.pathname.startsWith(p));

  // API calls → Network First, with a timeout so slow connections fail
  // fast. On failure, fall back to cache but mark the response as stale
  // via a header so the frontend can tell it's not fresh data instead of
  // silently trusting it. Heavy report-style queries get a longer timeout
  // (see getApiTimeout) instead of sharing the default 8s clock.
  if (url.pathname.startsWith('/api/')) {
    const timeoutMs = getApiTimeout(url);
    event.respondWith(
      withTimeout(fetch(request), timeoutMs)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          if (noStaleFallback) {
            return new Response(JSON.stringify({ error: 'timeout', stale_blocked: true }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
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
  //
  // Also treat known SPA route prefixes as navigations even when
  // request.mode isn't 'navigate' (e.g. a fetch()-driven route
  // reload/prefetch from within the app) — see APP_ROUTE_PREFIXES above.
  const isNavigation =
    request.mode === 'navigate' ||
    url.pathname === '/index.html' ||
    (url.origin === self.location.origin &&
      APP_ROUTE_PREFIXES.some(prefix => url.pathname.startsWith(prefix)));

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