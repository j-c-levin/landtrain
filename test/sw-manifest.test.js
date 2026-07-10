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
