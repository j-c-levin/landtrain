// Extra grassland views the standard shots miss: low angles on the water,
// dusk and night, the tree, the island, and the low tier.
// Usage: node scripts/lanes/grassland.mjs --out <dir> [--only a,b]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, mkdirSync, rmdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : null; };
// --root points the same views at another checkout (the base, for budget comparisons)
const root = resolve(arg('root') || join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const outDir = resolve(arg('out') || 'captures/lane-grassland-extra');
const only = arg('only')?.split(',');

const SKY = { day: 14.4, dusk: 52.8, night: 79.2 };
const RIVER = { x: 3100, z: 156, heading: 0 };
const BANK = { x: 3180, z: 110, heading: Math.PI / 2 };
const WEST = { x: 5240, z: 0, heading: 0 };
const SOUTH = { x: 5400, z: -205, heading: Math.PI / 2 };
const ISLE = { x: 5290, z: 20, heading: 0 };
const D = { width: 1440, height: 900, quality: 'high', touch: false };
const P = { width: 390, height: 844, quality: 'low', touch: true };
const L = { width: 844, height: 390, quality: 'low', touch: true };

// view: book orbit { theta, phi, dist } | cam: free camera { pos, look } | inhabit: true
const SHOTS = [
  { name: 'ending-vista', profile: D, time: 'day', train: { x: 5324.6, z: 0, heading: 0 }, ending: true },
  { name: 'river-low', profile: D, time: 'day', train: RIVER, view: { theta: 2.2, phi: 0.1, dist: 62 } },
  { name: 'river-along', profile: D, time: 'day', train: RIVER, cam: { pos: [3112, 7, 96], look: [3098, -1, 190] } },
  { name: 'river-bank', profile: D, time: 'day', train: BANK, view: { theta: -0.6, phi: 0.16, dist: 70 } },
  { name: 'river-waterline', profile: D, time: 'day', train: RIVER, cam: { pos: [3080, 1.2, 128], look: [3120, -1.5, 100] } },
  { name: 'river-dusk', profile: D, time: 'dusk', train: RIVER, view: { theta: 2.2, phi: 0.14, dist: 66 } },
  { name: 'river-night', profile: D, time: 'night', train: RIVER, view: { theta: 0.9, phi: 0.2, dist: 70 } },
  { name: 'west-causeway', profile: D, time: 'day', train: WEST, view: { theta: 3.5, phi: 0.2, dist: 90 } },
  { name: 'tree', profile: D, time: 'day', train: WEST, cam: { pos: [5150, 26, -70], look: [5400, 52, 0] } },
  { name: 'tree-dusk', profile: D, time: 'dusk', train: WEST, cam: { pos: [5180, 12, 90], look: [5400, 56, 0] } },
  { name: 'tree-night', profile: D, time: 'night', train: WEST, cam: { pos: [5150, 26, -70], look: [5400, 52, 0] } },
  { name: 'island', profile: D, time: 'day', train: ISLE, view: { theta: 3.9, phi: 0.16, dist: 80 } },
  { name: 'island-inhabit', profile: D, time: 'day', train: ISLE, inhabit: true },
  { name: 'south-causeway', profile: D, time: 'dusk', train: SOUTH, view: { theta: 0.5, phi: 0.2, dist: 80 } },
  { name: 'moat-map', profile: D, time: 'day', train: WEST, map: 1.6 },
  { name: 'low-river', profile: P, time: 'day', train: RIVER, view: { theta: 2.2, phi: 0.16, dist: 75 } },
  { name: 'low-river-inhabit', profile: L, time: 'day', train: RIVER, inhabit: true },
  { name: 'low-west-causeway', profile: L, time: 'day', train: WEST, view: { theta: 3.5, phi: 0.2, dist: 90 } },
  { name: 'low-tree', profile: P, time: 'dusk', train: WEST, cam: { pos: [5130, 22, -60], look: [5400, 60, 0] } },
].filter((s) => !only || only.some((o) => s.name.includes(o)));

function installPins({ skyTimes }) {
  const cap = { frozen: false, skySeconds: skyTimes.day, time: 10 };
  window.__cap = cap;
  let game;
  const wrap = (obj, name, dtIndex, timeIndex) => {
    const original = obj[name];
    obj[name] = function (...a) {
      if (cap.frozen && dtIndex !== null) a[dtIndex] = 0;
      if (timeIndex !== null) a[timeIndex] = cap.time;
      return original.apply(this, a);
    };
  };
  Object.defineProperty(window, '__game', {
    configurable: true,
    get: () => game,
    set(value) {
      game = value;
      const { sky, train, player, rig } = game;
      const skyUpdate = sky.update;
      sky.update = function (_dt, _elapsed, camera, trainPos, fog) {
        this.timeOffset = 0;
        this.fireflies.position.set(trainPos.x, 0, trainPos.z);
        return skyUpdate.call(this, 0, cap.skySeconds, camera, trainPos, fog);
      };
      wrap(train, 'update', 0, 1);
      wrap(train, 'updateRouteDisplay', null, 1);
      wrap(train, 'setFocus', 2, null);
      wrap(player, 'update', 0, 2);
      const rigUpdate = rig.update;
      rig.update = function (dt, time) {
        rigUpdate.call(this, cap.frozen ? 0 : dt, cap.time);
        if (cap.cam) {
          game.camera.position.set(...cap.cam.pos);
          game.camera.lookAt(...cap.cam.look);
        }
      };
      for (const [key, v] of Object.entries({ eff: 88, plants: 95, wear: 8 })) {
        Object.defineProperty(train, key, { configurable: true, get: () => v, set() {} });
      }
      Object.defineProperty(rig, 'autoOrbit', { configurable: true, get: () => false, set() {} });
    },
  });
}

const liveFor = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  const start = performance.now();
  const f = () => (performance.now() - start >= ms ? done() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), ms);

async function settle(page) {
  await page.waitForFunction(() => !__game.rig.busy && !__game.rig.soft, null, { timeout: 30000 });
  await liveFor(page, 3000);
  await page.waitForFunction(() => {
    const toast = document.getElementById('toast');
    return !__game.rig.busy && !toast.classList.contains('visible') && Number(getComputedStyle(toast).opacity) === 0;
  }, null, { timeout: 20000 });
}

async function resetStage(page, train, time, station) {
  await page.evaluate(({ train, seconds, station }) => {
    const { player, rig } = __game;
    __cap.frozen = false;
    __cap.cam = null;
    __cap.skySeconds = seconds;
    player.stand();
    player.syncDock('inhabit');
    __game.train.reset(train);
    __game.state.lastRevealAt = 0;
    __game.fog.reveal(__game.train.pos.x, __game.train.pos.z, 420);
    Object.assign(player, { x: station.x, y: station.y, level: station.level, z: 0.35,
      facing: 1, climbing: false, climbTarget: null, moving: false, walkPhase: 0 });
    Object.assign(rig, { mode: 'inhabit', transition: null, soft: null, mapBlend: 0,
      followX: station.x, followY: station.y, autoOrbit: false, recentering: false });
  }, { train, seconds: SKY[time], station });
}

const READING = { x: -20.2, level: 'deck', y: 1.78 };
const ENGINE = { x: -0.8, level: 'deck', y: 1.78 };
const CAB = { x: 20.5, level: 'roof', y: 5.05 };

async function ensureGrassland(page) {
  if (await page.evaluate(() => !!__game.grassland)) return;
  await resetStage(page, { x: 2450 - 60 + 24.6, z: 0, heading: 0 }, 'day', ENGINE);
  await page.waitForFunction(() => !!__game.grassland, null, { timeout: 60000 });
  await liveFor(page, 900);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('card').classList.contains('hidden'), null, { timeout: 5000 });
  await page.evaluate(() => {
    const g = __game.grassland;
    const update = g.update;
    g.update = function (dt, _time, ...rest) {
      return update.call(this, __cap.frozen ? 0 : dt, __cap.time, ...rest);
    };
  });
}

async function runShot(page, spec) {
  await ensureGrassland(page);
  // the ending fires once; hide its card for every later shot
  await page.evaluate(() => document.getElementById('card').classList.add('hidden'));
  if (spec.ending) {
    // the vista holds only while the card is up, so hide it without dismissing it
    await resetStage(page, spec.train, spec.time, ENGINE);
    await page.waitForFunction(() => !document.getElementById('card').classList.contains('hidden'), null, { timeout: 15000 });
    await page.evaluate(() => { document.getElementById('card').style.visibility = 'hidden'; });
    await liveFor(page, 3500);
    return;
  }
  await page.evaluate(() => { document.getElementById('card').style.visibility = ''; });
  if (spec.inhabit) {
    await resetStage(page, spec.train, spec.time, ENGINE);
  } else if (spec.map) {
    await resetStage(page, spec.train, spec.time, CAB);
    await settle(page);
    await page.waitForFunction(() => __game.rig.mode === 'cabin', null, { timeout: 10000 });
    await page.evaluate(() => { __game.rig.enterMap(); });
    await page.waitForFunction(() => __game.rig.mode === 'map' && !__game.rig.busy, null, { timeout: 15000 });
    await page.evaluate((zoom) => { __game.rig.mapHeight = 330 * zoom; }, spec.map);
  } else {
    await resetStage(page, spec.train, spec.time, READING);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => __game.rig.mode === 'book' && !__game.rig.busy, null, { timeout: 15000 });
    await page.evaluate((view) => {
      const { rig } = __game;
      rig.autoOrbit = false;
      rig.recentering = false;
      if (view) Object.assign(rig.orbit, view);
    }, spec.view || null);
  }
  await settle(page);
  if (spec.cam) {
    await page.evaluate((cam) => { __cap.cam = cam; }, spec.cam);
    await liveFor(page, 1500);
  }
  await page.waitForFunction(() => {
    document.getElementById('card').classList.add('hidden');
    return !__game.rig.vistaBlend;
  }, null, { timeout: 20000 });
}

async function freePort() {
  for (let port = 5400; port < 5500; port++) {
    const free = await new Promise((done) => {
      const probe = createServer();
      probe.once('error', () => done(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error('no free port');
}

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium']) {
        if (existsSync(join(cache, dir, rel))) return join(cache, dir, rel);
      }
    }
  }
  throw new Error('no Chrome found; set CHROME_PATH');
}

// the same queue the standard capture uses, so lanes never share the GPU
const LOCK = join(process.env.TMPDIR || tmpdir(), 'landtrain-capture.lock');
async function lock() {
  for (;;) {
    try { mkdirSync(LOCK); return; } catch {
      try { if (Date.now() - statSync(LOCK).mtimeMs > 20 * 60000) rmdirSync(LOCK); } catch { /* raced */ }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
let server = null;
let locked = false;
function cleanup() {
  if (server && !server.killed) server.kill('SIGTERM');
  server = null;
  if (locked) { try { rmdirSync(LOCK); } catch { /* gone */ } locked = false; }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });
process.on('exit', cleanup);

async function main() {
  await lock();
  locked = true;
  const port = await freePort();
  server = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const baseUrl = `http://127.0.0.1:${port}/landtrain/`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(baseUrl)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: findChrome(), headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--force-color-profile=srgb'],
  });
  const metrics = { shots: {}, errors: [] };
  let failed = false;
  try {
    for (const profile of [D, P, L]) {
      const specs = SHOTS.filter((s) => s.profile === profile);
      if (!specs.length) continue;
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.touch ? 3 : 1,
        hasTouch: profile.touch, isMobile: profile.touch, serviceWorkers: 'block',
        locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'no-preference',
      });
      await context.addInitScript(installPins, { skyTimes: SKY });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on('pageerror', (e) => metrics.errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') metrics.errors.push(m.text()); });
      await page.goto(`${baseUrl}?quality=${profile.quality}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__game?.sky?.renderer);
      await page.evaluate(() => document.fonts.ready);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => __game.state.started);
      for (const spec of specs) {
        const name = `${profile.quality}-${profile.width}x${profile.height}--${spec.name}--${spec.time}`;
        try {
          await runShot(page, spec);
          await page.evaluate(() => { __cap.frozen = true; });
          if (arg('eval')) await page.evaluate(arg('eval'));
          await liveFor(page, 250);
          const info = await page.evaluate(() => {
            const r = __game.sky.renderer.info;
            return { drawCalls: r.render.calls, triangles: r.render.triangles, points: r.render.points };
          });
          await writeFile(join(outDir, `${name}.png`), await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' }));
          metrics.shots[name] = info;
          console.log(`ok   ${name}  ${info.drawCalls} calls  ${Math.round(info.triangles / 1000)}k tris`);
        } catch (error) {
          failed = true;
          console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`);
        }
      }
      await context.close();
    }
  } finally {
    await writeFile(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
    await browser.close();
    cleanup();
  }
  if (metrics.errors.length) { console.log(metrics.errors.slice(0, 8).join('\n')); failed = true; }
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); cleanup(); process.exit(1); });
