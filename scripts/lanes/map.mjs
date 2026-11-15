// Map-lane captures the standard shots miss: the climb into the chart frame by
// frame, a travelled journey, zoom extremes, the hover leg, and the cheaper tiers.
// Usage: node scripts/lanes/map.mjs --out captures/<name> [--only <substring>,...]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile, rm, rmdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
if (!arg('out')) {
  console.error('Usage: node scripts/lanes/map.mjs --out <dir> [--only a,b]');
  process.exit(2);
}
const outDir = resolve(arg('out'));
const only = arg('only')?.split(',') ?? null;

const SKY = { day: 14.4, dusk: 52.8, night: 79.2 };
const PIN = { eff: 88, plants: 95, wear: 8 };
const SPAWN = { x: 24.6, z: 0, heading: 0 };
const JOURNEY = [[260, -40], [420, -170], [640, -150], [800, 40], [1010, 120]];

const PROFILES = {
  high: { width: 1440, height: 900, quality: 'high', touch: false },
  medium: { width: 1440, height: 900, quality: 'medium', touch: false },
  phone: { width: 390, height: 844, quality: 'low', touch: true },
  wide: { width: 844, height: 390, quality: 'low', touch: true },
};

const SHOTS = [
  { profile: 'high', name: 'climb', time: 'day', climb: [0.2, 0.35, 0.5, 0.65, 0.8, 0.92] },
  { profile: 'high', name: 'journey', time: 'day', journey: true },
  { profile: 'high', name: 'journey', time: 'night', journey: true },
  { profile: 'high', name: 'journey-far', time: 'day', journey: true, zoom: 760 },
  { profile: 'high', name: 'journey-far', time: 'night', journey: true, zoom: 760 },
  { profile: 'high', name: 'journey-near', time: 'day', journey: true, zoom: 150 },
  { profile: 'high', name: 'journey-near', time: 'night', journey: true, zoom: 150 },
  { profile: 'high', name: 'hover', time: 'day', journey: true, hover: [70, 105] },
  { profile: 'high', name: 'coast', time: 'day', zoom: 190, pan: [-95, -75] },
  { profile: 'high', name: 'corner', time: 'day', zoom: 420, pan: [-200, 620] },
  { profile: 'high', name: 'start', time: 'dusk' },
  { profile: 'high', name: 'journey', time: 'dusk', journey: true },
  { profile: 'medium', name: 'journey', time: 'day', journey: true },
  { profile: 'phone', name: 'journey', time: 'day', journey: true },
  { profile: 'phone', name: 'journey', time: 'night', journey: true },
  { profile: 'phone', name: 'journey-far', time: 'day', journey: true, zoom: 760 },
  { profile: 'phone', name: 'start', time: 'night' },
  { profile: 'phone', name: 'start', time: 'day' },
  { profile: 'phone', name: 'key-open', time: 'day', journey: true, openKey: true },
  { profile: 'wide', name: 'journey', time: 'day', journey: true },
  { profile: 'wide', name: 'journey', time: 'night', journey: true },
];
const fileName = (s) => `${s.profile}--${s.name}--${s.time}`;
const selected = SHOTS.filter((s) => !only || only.some((o) => fileName(s).includes(o)));

const LOCK = join(process.env.TMPDIR || tmpdir(), 'landtrain-capture.lock');
async function lock() {
  for (;;) {
    try {
      await mkdir(LOCK);
      return;
    } catch {
      const age = await stat(LOCK).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > 20 * 60000) await rmdir(LOCK).catch(() => {});
      else await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
let locked = false;
let server = null;
function cleanup() {
  if (server && !server.killed) server.kill('SIGTERM');
  server = null;
  if (locked) {
    locked = false;
    try { spawn('rmdir', [LOCK], { stdio: 'ignore' }); } catch { /* gone */ }
  }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

async function startServer() {
  let port = 5300;
  for (; port < 5400; port++) {
    const free = await new Promise((done) => {
      const probe = createServer();
      probe.once('error', () => done(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
    });
    if (free) break;
  }
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root, stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}/landtrain/`;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) return url;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('vite did not come up');
}

function installPins({ pin, skyTimes }) {
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
      wrap(rig, 'update', 0, 1);
      for (const [key, value] of Object.entries(pin)) {
        Object.defineProperty(train, key, { configurable: true, get: () => value, set() {} });
      }
    },
  });
}

const liveFor = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  const start = performance.now();
  const f = () => (performance.now() - start >= ms ? done() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), ms);

async function stage(page, spec) {
  await page.evaluate(({ spawn, seconds, journey }) => {
    const { player, rig, train, fog } = __game;
    __cap.frozen = false;
    __cap.skySeconds = seconds;
    player.stand();
    player.syncDock('inhabit');
    fog.reset();
    train.reset(spawn);
    __game.state.lastRevealAt = 0;
    const reveal = () => {
      const f = train.forwardDir();
      fog.revealCone(train.pos.x, train.pos.z, f.x, f.z, 112, 280, 150, 40, 18);
    };
    reveal();
    if (journey) {
      for (const [x, z] of journey) train.addWaypoint(x, z);
      let last = 0;
      for (let i = 0; i < 40000 && train.route.length && !train.blocked; i++) {
        train.paused = false;
        train.update(0.05, 0, __game.obstacles);
        train.updateRouteDisplay(0, 0);
        if (train.distanceTraveled - last >= 14) {
          last = train.distanceTraveled;
          reveal();
        }
      }
    }
    Object.assign(player, { x: 20.5, y: 5.05, level: 'roof', z: 0.35, facing: 1, climbing: false, climbTarget: null, moving: false, walkPhase: 0 });
    Object.assign(rig, { mode: 'inhabit', transition: null, soft: null, mapBlend: 0, followX: 20.5, followY: 5.05, autoOrbit: false, recentering: false });
  }, { spawn: SPAWN, seconds: SKY[spec.time], journey: spec.journey ? JOURNEY : null });
  await page.waitForFunction(() => __game.rig.mode === 'cabin' && !__game.rig.busy && !__game.rig.soft, null, { timeout: 30000 });
  await liveFor(page, 600);
}

async function shoot(page, name) {
  await page.evaluate(() => { __cap.frozen = true; });
  await liveFor(page, 120);
  await writeFile(join(outDir, `${name}.png`), await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' }));
  await page.evaluate(() => { __cap.frozen = false; });
  console.log(`ok   ${name}`);
}

async function runShot(page, spec) {
  await stage(page, spec);
  await page.evaluate(() => { __game.rig.enterMap(); });
  if (spec.climb) {
    for (const at of spec.climb) {
      await page.waitForFunction((at) => __game.rig.mapBlend >= at, at, { timeout: 15000, polling: 'raf' });
      await shoot(page, `${fileName(spec)}--${String(Math.round(at * 100)).padStart(3, '0')}`);
    }
    return;
  }
  await page.waitForFunction(() => __game.rig.mode === 'map' && !__game.rig.busy, null, { timeout: 15000 });
  await page.evaluate(({ zoom, pan }) => {
    const { rig } = __game;
    rig.mapHeight = zoom ?? 330;
    rig.pan.set(pan?.[0] ?? 0, pan?.[1] ?? 0);
  }, { zoom: spec.zoom ?? null, pan: spec.pan ?? null });
  await liveFor(page, 2600);
  if (spec.openKey) await page.locator('.chart-cartouche').tap();
  if (spec.hover) {
    const at = await page.evaluate(([x, z]) => {
      const { pos } = __game.train;
      const v = pos.clone().set(pos.x + x, 0, pos.z + z).project(__game.camera);
      return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
    }, spec.hover);
    await page.mouse.move(at[0] - 30, at[1] - 30);
    await page.mouse.move(at[0], at[1], { steps: 4 });
    await liveFor(page, 300);
  }
  await page.waitForFunction(() => {
    const toast = document.getElementById('toast');
    return !toast.classList.contains('visible') && Number(getComputedStyle(toast).opacity) === 0;
  }, null, { timeout: 15000 });
  await shoot(page, fileName(spec));
  if (spec.openKey) await page.locator('.chart-cartouche').tap();
  if (spec.hover) await page.locator('#btn-exit').hover();
}

async function main() {
  await lock();
  locked = true;
  const baseUrl = await startServer();
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({
    executablePath: existsSync(chrome) ? chrome : undefined, headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--force-color-profile=srgb'],
  });
  const errors = [];
  let failed = false;
  try {
    for (const [id, profile] of Object.entries(PROFILES)) {
      const specs = selected.filter((s) => s.profile === id);
      if (!specs.length) continue;
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.touch ? 3 : 1,
        hasTouch: profile.touch, isMobile: profile.touch, serviceWorkers: 'block',
        locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light',
      });
      await context.addInitScript(installPins, { pin: PIN, skyTimes: SKY });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${id}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`${id}: ${m.text()}`); });
      await page.goto(`${baseUrl}?quality=${profile.quality}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__game?.sky?.renderer);
      await page.evaluate(() => document.fonts.ready);
      await page.bringToFront();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => __game.state.started);
      for (const spec of specs) {
        try {
          await runShot(page, spec);
        } catch (error) {
          failed = true;
          console.log(`FAIL ${fileName(spec)}: ${error.message.split('\n')[0]}`);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await writeFile(join(outDir, 'errors.json'), JSON.stringify(errors, null, 2) + '\n');
    cleanup();
  }
  if (errors.length) console.log(`${errors.length} browser error(s); see errors.json`);
  process.exit(failed || errors.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});
