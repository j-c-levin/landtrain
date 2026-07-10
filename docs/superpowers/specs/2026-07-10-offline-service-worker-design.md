# Offline Service Worker — Design

Date: 2026-07-10
Status: Approved

## Goal

Players who have visited the deployed game once, online, can reload and play
it fully offline afterward — no network required for the page, the bundle,
or the custom typeface. When a new build ships, returning players are told
and can opt into the update rather than silently getting a new version.

## Constraints from the existing deployment

- Vite (`base: '/landtrain/'`) builds a single-page app: one hashed JS bundle
  (~592K), one hashed CSS file, one unhashed `index.html`. No dynamic imports,
  no backend, no API calls.
- GitHub Pages deployment is unusual: `main` publishes to `/landtrain/`, but
  **every other branch** also auto-publishes its own preview to
  `/landtrain/<branch-slug>/` (`.github/workflows/deploy-preview.yml`,
  `--base` overridden per branch). One `sw.js` design must work correctly,
  unmodified, at any of these base paths.
- The project has zero non-`three` dependencies; everything else (audio, fog,
  camera) is hand-rolled. This feature follows the same style — no
  `vite-plugin-pwa`/workbox.
- The current typeface (Fraunces) loads from Google Fonts as a **variable
  font** (`ital,opsz,wght@0,9..144,300..700;1,9..144,300..700`) — i.e. only
  1–2 `.woff2` files cover the whole range, not one file per weight.

## Architecture

### 1. Self-hosted font (drops the Google Fonts CDN dependency)

Download the 1–2 `.woff2` files Google currently serves for that variable
Fraunces request, add them under `src/fonts/`, and reference them via a
local `@font-face` in `style.css` (existing serif fallback stack unchanged).
Remove the `<link rel="preconnect">`/`<link rel="stylesheet">` Google Fonts
tags from `index.html`.

Because Vite processes `url(...)` references in CSS through its normal asset
pipeline, the font files become hashed, same-origin build outputs — no
different from the JS/CSS bundle. They fall out of the design for free: no
cross-origin caching, no opaque responses, no separate font cache, no
stale-while-revalidate logic, and (unlike caching the Google Fonts CDN
response) the font is guaranteed available offline from the very first
visit, not the second.

*Why not keep the CDN and cache it instead:* caching the Google Fonts CSS
response at install time only caches the CSS text — nothing parses the
`@font-face src: url(...)` out of it, so the actual `.woff2` files are only
fetched (and only then cacheable) once the browser lays out text with that
family, i.e. no earlier than the *second* visit. Self-hosting is both
simpler and meets the "offline from first visit" bar the CDN approach can't.

### 2. Build-time manifest embedded directly into the service worker

A Vite plugin in `vite.config.js`, hooking `writeBundle` (fires after
`dist/` is fully written), does two things:

1. Walks `dist/` and collects every output file as a path relative to the
   output root (e.g. `./index.html`, `./assets/index-XXXX.js`,
   `./assets/fraunces-XXXX.woff2`).
2. Reads the **contents** of every one of those files and hashes them
   together into one short `VERSION` string.

It then reads an un-built template at the repo root, `service-worker.js`,
replaces two placeholder tokens (`__CACHE_VERSION__`, `__PRECACHE_FILES__`)
with the real version string and JSON file list, and writes the result to
`dist/sw.js` directly via `fs.writeFileSync`.

**This is load-bearing, not a nicety.** A browser only re-installs a service
worker when it detects the *script's own bytes* changed via a byte compare —
that is the entire trigger for the update lifecycle. A `sw.js` copied
verbatim by Vite's static-asset handling would be byte-identical on every
deploy, so the browser would never redetect it, `install` would never
re-fire, and returning players would be frozen on the first version they
ever installed — the refresh banner would never appear. Embedding the
manifest (and therefore a content hash covering every output file,
including the unhashed `index.html`) directly into `sw.js`'s source
guarantees its bytes change whenever *anything* in the build changes,
which is what makes update detection actually work.

`VERSION` is also used to name the Cache Storage entry (`precache-<version>`),
so `activate` can enumerate and delete any `precache-*` cache that isn't the
current version, keeping storage from growing across deploys.

### 3. `service-worker.js` (template → built into `dist/sw.js`)

- `install`: opens `precache-<VERSION>`, `cache.addAll()`s every file in the
  embedded manifest (index.html, JS, CSS, font files — everything needed to
  run fully offline).
- `activate`: deletes any cache whose name starts with `precache-` and isn't
  the current version; calls `clients.claim()` so an already-open tab is
  controlled without a hard reload.
- `fetch`:
  - **Navigation requests** (`request.mode === 'navigate'`): cache-first,
    always falling back to `fetch()` on a cache miss (never cache-only) —
    this matters because a branch preview's very first visit, or a visit to
    a scope no local cache covers yet, must still work online.
  - **Same-origin build assets** (anything under the resolved base path):
    cache-first, falling back to network and writing the response into the
    current version's cache if not already precached.
  - **Everything else** (there shouldn't be any same-origin traffic outside
    the build output, and no cross-origin requests remain post-font-change):
    pass straight to the network, uncached.

No cross-origin caching logic is needed anywhere — a direct simplification
from dropping the Google Fonts CDN.

### 4. Registration and update prompt (`src/sw-register.js`)

- Imported once from `src/main.js`.
- Registers only when `import.meta.env.PROD` is true — `npm run dev` stays
  completely uncached so local iteration never fights a stale cache.
- Registers at `import.meta.env.BASE_URL + 'sw.js'` (explicit, base-path-
  correct for both `main` and every branch preview — default SW scope is the
  directory containing the script, so this naturally confines each
  deployment's service worker to its own subtree with no extra config).
- Listens for `updatefound` on the registration; when the new worker reaches
  `installed` state *while a controller already exists* (i.e. this isn't the
  very first install), a new version is ready and waiting. Shows a small
  persistent banner (new markup, not the existing auto-dismissing `#toast`)
  with a "Refresh" button.
- Clicking Refresh posts a `{ type: 'SKIP_WAITING' }` message to the waiting
  worker; the worker calls `self.skipWaiting()` in response; on the
  resulting `controllerchange` event the page does one `location.reload()`
  (guarded so it can only fire once).

### 5. UI: update banner

New `#update-banner` element in `index.html`, styled in `style.css` in the
same visual language as `#toast` (dark translucent pill, cream text,
backdrop blur) but persistent — no auto-dismiss timer — with a small
"Refresh" button. Copy: something in the game's cozy voice, e.g. *"A new
version of the train has arrived — refresh to board it."*

## Known, accepted limitation

When a branch preview is deleted (`.github/workflows/cleanup-preview.yml`
removes its folder from `gh-pages`), a browser that previously visited that
preview keeps a zombie service worker registration, serving the dead
preview from its own cache indefinitely. Not worth solving for throwaway
branch previews on a hobby project — noted here rather than fixed.

## Files touched

- `vite.config.js` — add the manifest-embedding build plugin
- `service-worker.js` (new, repo root) — the service worker template
- `src/sw-register.js` (new) — registration + update-prompt wiring
- `src/main.js` — one new import
- `src/fonts/` (new) — self-hosted Fraunces `.woff2` file(s)
- `src/style.css` — local `@font-face`, drop nothing else font-related,
  add `#update-banner` styles
- `index.html` — remove Google Fonts `<link>` tags, add `#update-banner`
  markup

## Testing

- `npm run build && npm run preview`, then in DevTools Application tab:
  confirm `sw.js` registers, `precache-<version>` cache contains every
  build output file, and the page still renders (with Fraunces) after
  toggling "Offline" in the Network tab and hard-reloading.
- Change any source file trivially, rebuild, reload the still-open preview
  tab: confirm the update banner appears and clicking Refresh reloads to
  the new build with no console errors.
- Confirm `npm run dev` never registers a service worker
  (`navigator.serviceWorker.getRegistrations()` is empty).
