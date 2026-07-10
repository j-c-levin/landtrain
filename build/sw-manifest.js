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
