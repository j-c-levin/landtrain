// Template for dist/sw.js — the `sw-manifest` Vite plugin (vite.config.js)
// fills in the two placeholders below at build time. This file itself is
// never served or imported; only the rendered dist/sw.js is.
// Cache Storage is scoped per-origin, not per-service-worker-scope, so a
// service worker registered at one path (e.g. a branch preview under
// /landtrain/<branch>/) can see and delete caches created by a service
// worker registered at another path on the same origin (e.g. /landtrain/
// for main). Namespacing the cache name by this worker's own scope keeps
// each deployment's caches isolated from every other deployment's.
const CACHE_VERSION = 'c2974ac1a6';
const CACHE_PREFIX = `precache-${self.registration.scope}-`;
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const PRECACHE_FILES = ["./assets/fraunces-italic-var-lSdLDfvT.woff2","./assets/fraunces-normal-var-DihXLNYH.woff2","./assets/index-BiLrJz43.js","./assets/index-D-iktqlj.css","./index.html"];

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
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
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
