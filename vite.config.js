import { defineConfig } from 'vite';

// Bind to all interfaces and accept any Host header, so the game can be
// opened from other devices over the LAN or Tailscale (including MagicDNS
// hostnames like joshuas-macbook-pro.<tailnet>.ts.net, which Vite's host
// check would otherwise block). Fine for a dev/prototype server on a
// private network; don't expose this to the open internet.
export default defineConfig({
  // Project Pages are served from https://<user>.github.io/landtrain/, so all
  // built asset URLs must be prefixed with the repo name. Harmless in dev.
  base: '/landtrain/',
  server: {
    host: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
});
