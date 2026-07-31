const CACHE_NAME    = 'jecca-hrms-v2';
const STATIC_ASSETS = [
  '/bg.jpeg',
  '/logo.jpeg',
];
const APP_SHELL_KEY = '/'; // one consistent cache key for "the current HTML shell"

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

  // API calls → Network First, fallback to cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Page navigations → Network First. Every successful load overwrites a
  // single "app shell" cache entry (keyed as '/', regardless of which SPA
  // route was actually requested) — that's what's offered offline, so it's
  // always the most recently seen version, never a permanently stale one.
  const isNavigation = request.mode === 'navigate' || url.pathname === '/index.html';
  if (isNavigation) {
    event.respondWith(
      fetch(request)
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
      return fetch(request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});