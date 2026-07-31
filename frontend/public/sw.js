// Bump this on any meaningful change to caching behavior — it forces
// old cached entries to be thrown out on the next activate.
const CACHE_NAME    = 'jecca-hrms-v2';
const STATIC_ASSETS = [
  '/bg.jpeg',
  '/logo.jpeg',
];

// Install: cache the small set of rarely-changing static assets.
// Deliberately does NOT pre-cache '/' or '/index.html' — those must
// always be checked against the network first (see fetch handler below),
// otherwise a new deploy's HTML (and the new hashed JS/CSS filenames it
// points to) can never be seen after the very first visit.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: remove old caches, take control of open tabs immediately.
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

  // API calls → Network First, fallback to cache (unchanged).
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

  // Page navigations (loading '/' or any route) and index.html itself →
  // Network First. This is the fix: always try to get the freshest HTML
  // when online, so it always references the current build's JS/CSS.
  // Only falls back to a cached copy if the network request fails
  // (i.e. genuinely offline), which is exactly what offline support needs.
  const isNavigation = request.mode === 'navigate' || url.pathname === '/index.html';
  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/')))
    );
    return;
  }

  // Everything else (Vite's hashed JS/CSS bundles, images, fonts) →
  // Cache First is safe here: a new deploy gives these new filenames
  // (content hash baked in), so there's no staleness risk — old and new
  // versions simply have different URLs and never collide.
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