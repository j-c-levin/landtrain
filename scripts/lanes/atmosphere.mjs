// Motion and sky views the standard shots miss: the train under way (smoke,
// steam, dust), the sun and moon in frame, dawn, and the low tier at dusk.
// Usage: node scripts/lanes/atmosphere.mjs --out <dir> [--only name,name]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile, rmdir } from 'node:fs/promises';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : null);
const outDir = resolve(arg('out') ?? 'captures/lane-atmosphere-extra');
const only = arg('only')?.split(',');

const SKY = { day: 14.4, golden: 46, dusk: 52.8, sunset: 55.6, blue: 60, night: 79.2, moonrise: 64, dawn: 108.6 };
// view: side | book | cab | up (side view pitched at the sky)
const SHOTS = [
  { name: 'run-side-day', time: 'day', view: 'side', run: true, tier: 'high' },
  { name: 'run-book-day', time: 'day', view: 'book', run: true, tier: 'high' },
  { name: 'run-side-dusk', time: 'dusk', view: 'side', run: true, tier: 'high' },
  { name: 'run-book-dusk', time: 'dusk', view: 'book', run: true, tier: 'high' },
  { name: 'run-side-night', time: 'night', view: 'side', run: true, tier: 'high' },
  { name: 'idle-book-golden', time: 'golden', view: 'book', tier: 'high' },
  { name: 'idle-side-sunset', time: 'sunset', view: 'side', tier: 'high' },
  { name: 'idle-book-sunset', time: 'sunset', view: 'bookBack', tier: 'high' },
  { name: 'idle-side-blue', time: 'blue', view: 'side', tier: 'high' },
  { name: 'idle-book-night', time: 'night', view: 'bookBack', tier: 'high' },
  { name: 'idle-cab-dawn', time: 'dawn', view: 'cab', tier: 'high' },
  { name: 'idle-side-dawn', time: 'dawn', view: 'side', tier: 'high' },
  { name: 'low-run-side-dusk', time: 'dusk', view: 'side', run: true, tier: 'low' },
  { name: 'low-idle-side-night', time: 'night', view: 'side', tier: 'low' },
  { name: 'low-idle-book-day', time: 'day', view: 'book', tier: 'low' },
].filter((s) => !only || only.some((o) => s.name.includes(o)));

async function withLock(fn) {
  if (process.env.LANDTRAIN_LOCK_HELD) return fn();
  const lock = join(process.env.TMPDIR ?? tmpdir(), 'landtrain-capture.lock');
  for (;;) {
    try { mkdirSync(lock); break; } catch {
      try { if (Date.now() - statSync(lock).mtimeMs > 20 * 60000) await rmdir(lock); } catch { /* raced */ }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  const release = () => { try { rmdir(lock); } catch { /* gone */ } };
  process.on('exit', release);
  try { return await fn(); } finally { await rmdir(lock).catch(() => {}); }
}

async function freePort() {
  for (let port = 5300; port < 5400; port++) {
    const free = await new Promise((done) => {
      const probe = createServer();
      probe.once('error', () => done(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error('no free port');
}

function installPins(skyTimes) {
  const cap = { skySeconds: skyTimes.day };
  window.__cap = cap;
  let game;
  Object.defineProperty(window, '__game', {
    configurable: true,
    get: () => game,
    set(value) {
      game = value;
      const { sky, train } = game;
      const skyUpdate = sky.update;
      sky.update = function (dt, _elapsed, camera, trainPos, fog) {
        this.timeOffset = 0;
        return skyUpdate.call(this, dt, cap.skySeconds, camera, trainPos, fog);
      };
      for (const [key, value] of Object.entries({ eff: 88, plants: 95, wear: 8 })) {
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

async function shoot(page, spec) {
  await page.evaluate(({ seconds, run }) => {
    const { player, rig, train } = __game;
    __cap.skySeconds = seconds;
    if (rig.mode === 'book') rig.exitBook?.();
    player.stand();
    player.syncDock('inhabit');
    train.reset({ x: 24.6, z: 0, heading: 0 });
    __game.state.lastRevealAt = 0;
    Object.assign(player, { x: -0.8, y: 1.78, level: 'deck', z: 0.35, facing: 1, climbing: false, climbTarget: null });
    Object.assign(rig, { mode: 'inhabit', transition: null, soft: null, mapBlend: 0, followX: -0.8, followY: 1.78, autoOrbit: false, recentering: false });
    if (run) train.addWaypoint(900, 0);
  }, { seconds: SKY[spec.time], run: !!spec.run });
  if (spec.view === 'cab') {
    await page.evaluate(() => Object.assign(__game.player, { x: 20.5, y: 5.05, level: 'roof' }));
    await page.waitForFunction(() => __game.rig.mode === 'cabin', null, { timeout: 15000 });
  }
  if (spec.view === 'book' || spec.view === 'bookBack') {
    await page.evaluate(() => Object.assign(__game.player, { x: -20.2 }));
    await liveFor(page, 600);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => __game.rig.mode === 'book' && !__game.rig.busy, null, { timeout: 15000 });
    await page.evaluate((back) => {
      const { rig } = __game;
      rig.autoOrbit = false;
      rig.recentering = false;
      rig.orbit.phi = back ? 0.12 : 0.26;
      rig.orbit.dist = back ? 62 : 58;
      rig.orbit.theta = back ? -Math.PI / 2 - 0.5 : (5 * Math.PI) / 4;
    }, spec.view === 'bookBack');
  }
  await liveFor(page, spec.run ? 9000 : 6000);
  const buffer = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  await writeFile(join(outDir, `${spec.name}.png`), buffer);
  const info = await page.evaluate(() => ({ speed: __game.train.speed, mode: __game.rig.mode, tris: __game.sky.renderer.info.render.triangles }));
  console.log(`ok   ${spec.name}  speed ${info.speed.toFixed(1)}  ${info.mode}  ${Math.round(info.tris / 1000)}k tris`);
  if (spec.view === 'book' || spec.view === 'bookBack') {
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => __game.rig.mode !== 'book' && !__game.rig.busy, null, { timeout: 15000 });
  }
}

await withLock(async () => {
  const port = await freePort();
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  process.on('exit', () => server.kill('SIGTERM'));
  const url = `http://127.0.0.1:${port}/landtrain/`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  await mkdir(outDir, { recursive: true });
  const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chrome)) throw new Error('no Chrome found; set CHROME_PATH');
  const browser = await chromium.launch({
    executablePath: chrome, headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--force-color-profile=srgb'],
  });
  let failed = false;
  for (const tier of ['high', 'low']) {
    const specs = SHOTS.filter((s) => s.tier === tier);
    if (!specs.length) continue;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await context.addInitScript(installPins, SKY);
    const page = await context.newPage();
    page.on('pageerror', (e) => { failed = true; console.log(`pageerror: ${e.message}`); });
    page.on('console', (m) => { if (m.type() === 'error') { failed = true; console.log(`console: ${m.text()}`); } });
    await page.goto(`${url}?quality=${tier}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__game?.sky?.renderer);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __game.state.started);
    for (const spec of specs) {
      try { await shoot(page, spec); } catch (error) { failed = true; console.log(`FAIL ${spec.name}: ${error.message.split('\n')[0]}`); }
    }
    await context.close();
  }
  await browser.close();
  server.kill('SIGTERM');
  process.exitCode = failed ? 1 : 0;
});
