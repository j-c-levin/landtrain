# Offline Service Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deployed game playable fully offline after one online visit, with a prompt-to-refresh flow for new deploys.

**Architecture:** A Vite build plugin embeds a content-hashed precache manifest directly into `dist/sw.js`'s source (so the service worker's own bytes change on every deploy, which is what actually triggers the browser's update lifecycle). The service worker precaches the app shell, hashed JS/CSS, and self-hosted font files on install, then serves same-origin requests cache-first with a network fallback. A tiny registration module shows a persistent banner when a new version is waiting.

**Tech Stack:** Vanilla JS, Vite 6, `node:test` for the parts that are pure logic (nothing else — no new dependencies).

Design doc: `docs/superpowers/specs/2026-07-10-offline-service-worker-design.md`

## Global Constraints

- No new dependencies — hand-rolled service worker, no `vite-plugin-pwa`/workbox (design doc, "Constraints").
- The service worker and its registration must work unmodified at every deployed base path: `/landtrain/` (main) and `/landtrain/<branch-slug>/` (every branch preview) — no per-deployment configuration.
- `npm run dev` must never register a service worker — production builds only (`import.meta.env.PROD`).
- Cache-first strategies must always fall back to the network on a cache miss — never cache-only (design doc §3).
- Updates are an explicit prompt-to-refresh, never a silent swap.
- No cross-origin caching logic anywhere — fonts are self-hosted instead of cached from the Google Fonts CDN (design doc §1).

---

## Task 1: Self-host the Fraunces font, drop the Google Fonts CDN

**Files:**
- Create: `src/fonts/fraunces-normal-var.woff2`
- Create: `src/fonts/fraunces-italic-var.woff2`
- Modify: `src/style.css:1` (insert `@font-face` rules before the existing `:root` block)
- Modify: `index.html:8-13` (remove the Google Fonts `<link>` tags)

**Interfaces:**
- Produces: a `'Fraunces'` font family available locally, weights 300–700 (variable), normal and italic — used unchanged by every existing CSS rule that already references `font-family: 'Fraunces', ...` or `font-style: italic`. No other task depends on this one.

- [ ] **Step 1: Download the two font files**

The current Google Fonts request (`family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700`) is a *variable* font — Google serves the whole weight/optical-size range as one file per style/subset. This game's UI is English-only, so only the `latin` subset is needed (confirmed by fetching the CSS with a modern Chrome UA):

```bash
mkdir -p src/fonts
curl -s -o src/fonts/fraunces-italic-var.woff2 "https://fonts.gstatic.com/s/fraunces/v38/6NU58FyLNQOQZAnv9ZwNjucMHVn85Ni7emAe9lKqZTnbB-gzTK0K1ChjeveQ.woff2"
curl -s -o src/fonts/fraunces-normal-var.woff2 "https://fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeA.woff2"
file src/fonts/*.woff2
```

Expected `file` output (two lines, one per file):
```
src/fonts/fraunces-italic-var.woff2: Web Open Font Format (Version 2), TrueType, length 81520, version 1.0
src/fonts/fraunces-normal-var.woff2: Web Open Font Format (Version 2), TrueType, length 67304, version 1.0
```

- [ ] **Step 2: Add local `@font-face` rules**

Insert at the very top of `src/style.css` (before the `:root { ... }` block):

```css
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url('./fonts/fraunces-normal-var.woff2') format('woff2');
}

@font-face {
  font-family: 'Fraunces';
  font-style: italic;
  font-weight: 300 700;
  font-display: swap;
  src: url('./fonts/fraunces-italic-var.woff2') format('woff2');
}

```

Leave the existing `font-family: 'Fraunces', Georgia, 'Times New Roman', serif;` declaration on `html, body` (line 24) exactly as-is — it already references the family by name, which now resolves locally instead of via the CDN.

- [ ] **Step 3: Remove the Google Fonts `<link>` tags**

In `index.html`, delete these lines (currently lines 8–13):

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&display=swap"
      rel="stylesheet"
    />
```

The `<link rel="stylesheet" href="/src/style.css" />` line stays.

- [ ] **Step 4: Manually verify no CDN requests remain**

```bash
npm run dev
```

Open the printed URL, open DevTools → Network, filter on "font", reload the page. Expected: zero requests to `fonts.googleapis.com` or `fonts.gstatic.com`; two `woff2` requests to `localhost` under `/src/fonts/`; body text still renders in the Fraunces serif style (visibly distinct from the Georgia/Times fallback — compare the title card, which uses italic).

- [ ] **Step 5: Commit**

```bash
git add src/fonts/fraunces-normal-var.woff2 src/fonts/fraunces-italic-var.woff2 src/style.css index.html
git commit -m "Self-host Fraunces font, drop Google Fonts CDN dependency"
```

---

## Task 2: Precache manifest build logic (pure, TDD)

**Files:**
- Create: `build/sw-manifest.js`
- Test: `test/sw-manifest.test.js`

**Interfaces:**
- Produces: `buildPrecacheManifest(files)` where `files: Array<{ path: string, contents: Buffer | string }>` → `{ version: string, precacheList: string[] }`. `version` is a 10-hex-char digest of every file's path + contents (sorted first, so the result is independent of input order and changes whenever *any* file's bytes change — including unhashed files like `index.html`). `precacheList` is `files` sorted by `path` and mapped to just the `path` strings.
- Produces: `renderServiceWorker(template, version, precacheList)` where `template: string`, `version: string`, `precacheList: string[]` → `string`. Replaces the literal substrings `__CACHE_VERSION__` and `__PRECACHE_FILES__` in `template` with `version` and `JSON.stringify(precacheList)` respectively. Both exported from `build/sw-manifest.js`. Task 4 imports both; Task 3 must contain literal `__CACHE_VERSION__` / `__PRECACHE_FILES__` tokens for this to have something to replace.

- [ ] **Step 1: Write the failing tests**

Create `test/sw-manifest.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrecacheManifest, renderServiceWorker } from '../build/sw-manifest.js';

const file = (path, contents) => ({ path, contents: Buffer.from(contents) });

test('version is stable regardless of input file order', () => {
  const a = buildPrecacheManifest([file('./b.js', '2'), file('./a.js', '1')]);
  const b = buildPrecacheManifest([file('./a.js', '1'), file('./b.js', '2')]);
  assert.equal(a.version, b.version);
});

test("version changes when a file's contents change, even if the file list is unchanged", () => {
  // Regression guard: index.html is never content-hashed by Vite, so the
  // version must come from file *contents*, not just filenames.
  const before = buildPrecacheManifest([file('./index.html', '<p>old</p>')]);
  const after = buildPrecacheManifest([file('./index.html', '<p>new</p>')]);
  assert.notEqual(before.version, after.version);
});

test('version is unchanged when nothing changes', () => {
  const a = buildPrecacheManifest([file('./index.html', '<p>x</p>')]);
  const b = buildPrecacheManifest([file('./index.html', '<p>x</p>')]);
  assert.equal(a.version, b.version);
});

test('precacheList is sorted and contains every input path', () => {
  const { precacheList } = buildPrecacheManifest([file('./b.js', '2'), file('./a.js', '1')]);
  assert.deepEqual(precacheList, ['./a.js', './b.js']);
});

test('renderServiceWorker substitutes both placeholders', () => {
  const template = "const CACHE_VERSION = '__CACHE_VERSION__';\nconst PRECACHE_FILES = __PRECACHE_FILES__;";
  const out = renderServiceWorker(template, 'abc123', ['./index.html', './assets/app.js']);
  assert.ok(out.includes("const CACHE_VERSION = 'abc123';"));
  assert.ok(out.includes('const PRECACHE_FILES = ["./index.html","./assets/app.js"];'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test test/sw-manifest.test.js
```

Expected: fails with `Cannot find module '../build/sw-manifest.js'` (or similar) — the module doesn't exist yet.

- [ ] **Step 3: Implement `build/sw-manifest.js`**

```js
import { createHash } from 'node:crypto';

// files: [{ path: './assets/index-XXXX.js', contents: Buffer }, ...]
// Sorting first makes the hash (and therefore the resulting cache version)
// independent of directory-traversal order.
export function buildPrecacheManifest(files) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const file of sorted) {
    hash.update(file.path);
    hash.update(file.contents);
  }
  return {
    version: hash.digest('hex').slice(0, 10),
    precacheList: sorted.map((f) => f.path),
  };
}

export function renderServiceWorker(template, version, precacheList) {
  return template
    .replace('__CACHE_VERSION__', version)
    .replace('__PRECACHE_FILES__', JSON.stringify(precacheList));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test test/sw-manifest.test.js
```

Expected: `tests 5`, `pass 5`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add build/sw-manifest.js test/sw-manifest.test.js
git commit -m "Add precache manifest build logic with unit tests"
```

---

## Task 3: Service worker runtime template

**Files:**
- Create: `service-worker.js` (repo root — an un-built template, not part of the Vite module graph; read directly by the Task 4 build plugin and never imported from app code)

**Interfaces:**
- Consumes: the placeholder tokens `__CACHE_VERSION__` and `__PRECACHE_FILES__`, which Task 4's build plugin fills in via `renderServiceWorker` (Task 2) before writing the result to `dist/sw.js`.
- Produces: the message contract `{ type: 'SKIP_WAITING' }` — posting this message to the service worker triggers `self.skipWaiting()`. Task 5's registration code must post exactly this shape to trigger an update.

- [ ] **Step 1: Write `service-worker.js`**

```js
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
```

- [ ] **Step 2: Check the template is syntactically valid**

The bare `__PRECACHE_FILES__` token parses as a (currently undefined) identifier reference, so plain `node --check` on the un-rendered template is a valid syntax check even before substitution:

```bash
node --check service-worker.js
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "Add service worker runtime template"
```

---

## Task 4: Wire the manifest plugin into the Vite build

**Files:**
- Modify: `vite.config.js`

**Interfaces:**
- Consumes: `buildPrecacheManifest`, `renderServiceWorker` from `build/sw-manifest.js` (Task 2); the `service-worker.js` template from the repo root (Task 3).
- Produces: `dist/sw.js` after every `npm run build` — a fully rendered service worker with real `CACHE_VERSION` and `PRECACHE_FILES` values, placed at the output root so it lands at `<base>sw.js` for any `--base` the build is run with (main or a branch preview).

- [ ] **Step 1: Add the plugin to `vite.config.js`**

Replace the full contents of `vite.config.js` with:

```js
import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrecacheManifest, renderServiceWorker } from './build/sw-manifest.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function collectFiles(dir) {
  let out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out = out.concat(collectFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

// Writes dist/sw.js with this build's precache manifest embedded directly in
// its source, so the service worker's own bytes change on every deploy —
// that's what triggers the browser's update-detection (see design doc,
// docs/superpowers/specs/2026-07-10-offline-service-worker-design.md).
function swManifestPlugin() {
  return {
    name: 'sw-manifest',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir;
      const files = collectFiles(outDir).map((abs) => ({
        path: './' + relative(outDir, abs).split(sep).join('/'),
        contents: readFileSync(abs),
      }));
      const { version, precacheList } = buildPrecacheManifest(files);
      const template = readFileSync(join(__dirname, 'service-worker.js'), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), renderServiceWorker(template, version, precacheList));
    },
  };
}

// Bind to all interfaces and accept any Host header, so the game can be
// opened from other devices over the LAN or Tailscale (including MagicDNS
// hostnames like joshuas-macbook-pro.<tailnet>.ts.net, which Vite's host
// check would otherwise block). Fine for a dev/prototype server on a
// private network; don't expose this to the open internet.
export default defineConfig({
  // Project Pages are served from https://<user>.github.io/landtrain/, so all
  // built asset URLs must be prefixed with the repo name. Harmless in dev.
  base: '/landtrain/',
  plugins: [swManifestPlugin()],
  server: {
    host: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
});
```

- [ ] **Step 2: Build and verify `dist/sw.js`**

```bash
npm run build
node --check dist/sw.js
grep -c "__CACHE_VERSION__\|__PRECACHE_FILES__" dist/sw.js
grep -o "CACHE_VERSION = '[a-f0-9]*'" dist/sw.js
grep -o 'PRECACHE_FILES = \[[^]]*\]' dist/sw.js
```

Expected: `node --check` prints nothing (valid syntax); the placeholder-count grep prints `0`; the version grep prints something like `CACHE_VERSION = 'a1b2c3d4e5'` (10 hex characters, not the literal token); the file-list grep prints an array including `"./index.html"` and the hashed JS/CSS/font asset paths under `./assets/`.

- [ ] **Step 3: Re-run the full test suite**

```bash
node --test test/*.test.js
```

Expected: all tests still pass (this task didn't touch any tested logic, but confirms the build didn't break anything importable).

- [ ] **Step 4: Commit**

```bash
git add vite.config.js
git commit -m "Embed the precache manifest into dist/sw.js at build time"
```

---

## Task 5: Registration and update-prompt UI

**Files:**
- Create: `src/sw-register.js`
- Modify: `src/main.js:12` (add one import + one call)
- Modify: `index.html` (add the update-banner markup)
- Modify: `src/style.css` (add `#update-banner` styles)

**Interfaces:**
- Consumes: `dist/sw.js` being registrable at `import.meta.env.BASE_URL + 'sw.js'` (Task 4); the service worker's `{ type: 'SKIP_WAITING' }` message contract (Task 3).
- Produces: `registerServiceWorker()`, exported from `src/sw-register.js`, called once from `src/main.js` with no arguments and no return value used.

- [ ] **Step 1: Add the update-banner markup**

In `index.html`, insert this just before the closing `</body>` tag (after the existing `#card` div, before the `<script type="module" src="/src/main.js">` line — order relative to the script tag doesn't matter, but keep it after `#card` for readability):

```html
    <div id="update-banner">
      <span>A new version of the train has arrived — refresh to board it.</span>
      <button id="update-banner-refresh" type="button">Refresh</button>
    </div>
```

- [ ] **Step 2: Add banner styles**

Append to `src/style.css` (styled like the existing `#toast` block, but persistent — no auto-dismiss — and with a button):

```css
/* ---------- update banner ---------- */
#update-banner {
  position: absolute;
  bottom: 118px;
  left: 50%;
  transform: translateX(-50%) translateY(8px);
  max-width: 520px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 18px 11px 22px;
  border-radius: 12px;
  background: rgba(36, 26, 40, 0.78);
  border: 1px solid rgba(247, 234, 210, 0.22);
  color: var(--cream);
  font-size: 15px;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.45s ease, transform 0.45s ease;
  backdrop-filter: blur(3px);
}

#update-banner.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}

#update-banner-refresh {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(247, 234, 210, 0.35);
  background: var(--rust);
  color: var(--cream);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 3: Write `src/sw-register.js`**

```js
// Registers the built service worker (dist/sw.js) in production only, and
// shows a persistent banner when a new version has finished installing and
// is waiting to take over. Never runs under `npm run dev`.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((registration) => {
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        // 'installed' with an existing controller means this is an update,
        // not the very first install — the new worker is now waiting.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(installing);
        }
      });
    });
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

function showUpdateBanner(waitingWorker) {
  const banner = document.getElementById('update-banner');
  const button = document.getElementById('update-banner-refresh');
  if (!banner || !button) return;
  banner.classList.add('visible');
  button.addEventListener('click', () => waitingWorker.postMessage({ type: 'SKIP_WAITING' }), { once: true });
}
```

- [ ] **Step 4: Wire it into `main.js`**

In `src/main.js`, add the import alongside the existing ones (after line 13, `import { edgePlacement } from './markers.js';`):

```js
import { registerServiceWorker } from './sw-register.js';
```

And call it right after the imports, before the `// ----------------------------------------------------------------- input` section:

```js
registerServiceWorker();
```

- [ ] **Step 5: Manual end-to-end verification**

```bash
npm run build && npm run preview
```

Open the printed URL in Chrome, DevTools → Application → Service Workers: confirm `sw.js` is listed as activated and running. Application → Cache Storage: confirm a `precache-<version>` cache exists containing `./index.html`, the hashed JS/CSS, and both font files.

Offline check: in the Network tab, set throttling to "Offline", then hard-reload the page. Expected: the game still loads and renders (including the Fraunces font) with no console errors.

Update-flow check: with the preview server still running, make a trivial edit to any source file (e.g. add a space to a comment in `src/main.js`), run `npm run build` again in a second terminal, then reload the still-open preview tab (a normal reload, not hard-reload). Expected: within a few seconds the `#update-banner` becomes visible; clicking "Refresh" reloads the page and DevTools → Application → Service Workers shows the new version active, with the old `precache-*` cache gone from Cache Storage.

Dev-mode check:

```bash
npm run dev
```

Open the printed URL, run `navigator.serviceWorker.getRegistrations().then(r => console.log(r.length))` in the console. Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add src/sw-register.js src/main.js index.html src/style.css
git commit -m "Register the service worker with a prompt-to-refresh update banner"
```
