// Service Worker for Miners Location Scout
// Network-first for pages, cache-first for static assets. API routes never cached.

const CACHE_VERSION = 2;
const CACHE_NAME = `miners-scout-v${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/assets/logo_white.webp',
  '/assets/map-style-bw.png',
  '/assets/map-style-color.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Store a response clone in the cache (fire-and-forget)
function cacheResponse(request, response) {
  const clone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never cache API routes or auth endpoints
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Only cache same-origin requests
  if (url.origin !== self.location.origin) return;

  const isNavigationRequest =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document';

  if (isNavigationRequest) {
    // Network-first for HTML pages: try fresh content, fall back to cache when offline
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) cacheResponse(event.request, response);
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first for static assets (JS, CSS, images, fonts)
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;

        return fetch(event.request).then((response) => {
          if (response.ok) cacheResponse(event.request, response);
          return response;
        });
      })
    );
  }
});
