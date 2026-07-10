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
