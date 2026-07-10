// Template for dist/sw.js — the `sw-manifest` Vite plugin (vite.config.js)
// fills in the two placeholders below at build time. This file itself is
// never served or imported; only the rendered dist/sw.js is.
const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = `precache-${CACHE_VERSION}`;
const PRECACHE_FILES = __PRECACHE_FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('precache-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // This is a single-page app: any navigation resolves to the cached shell,
  // regardless of the exact path requested. Falls through to the network on
  // a cache miss (e.g. a scope this worker hasn't precached yet).
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((cached) => cached || fetch(request)));
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let the browser handle other origins normally

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
