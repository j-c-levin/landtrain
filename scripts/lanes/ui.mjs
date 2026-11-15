// Extra UI-lane views the standard shots miss: intro on every viewport, first-run
// coaching, the rig's own book framing, mid-transition frames, story cards.
// Usage: node scripts/lanes/ui.mjs --out <dir> [--only <substring>,...]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile, rmdir, stat } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
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
const outDir = resolve(arg('out') ?? 'captures/lane-ui-extra');
const only = arg('only')?.split(',') ?? null;

const SKY = { day: 14.4, dusk: 52.8, night: 79.2 };
const PROFILES = {
  desktop: { width: 1440, height: 900, quality: 'high', touch: false },
  portrait: { width: 390, height: 844, quality: 'low', touch: true },
  landscape: { width: 844, height: 390, quality: 'low', touch: true },
};
const STATIONS = {
  engine: { x: -0.8, level: 'deck', y: 1.78 },
  plants: { x: -12.4, level: 'deck', y: 1.78 },
  reading: { x: -20.2, level: 'deck', y: 1.78 },
  ladder: { x: -8.3, level: 'deck', y: 1.78 },
  cab: { x: 20.5, level: 'roof', y: 5.05 },
};

const lock = join(process.env.TMPDIR ?? tmpdir(), 'landtrain-capture.lock');
async function acquire() {
  for (;;) {
    try {
      mkdirSync(lock);
      return;
    } catch {
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > 20 * 60 * 1000) await rmdir(lock).catch(() => {});
      else await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

let server = null;
let locked = false;
function cleanup() {
  if (server && !server.killed) server.kill('SIGTERM');
  server = null;
  if (locked) {
    locked = false;
    try { rmdir(lock); } catch { /* gone */ }
  }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

async function startServer() {
  let port = 5400;
  for (; port < 5500; port++) {
    const free = await new Promise((done) => {
      const probe = createServer();
      probe.once('error', () => done(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
    });
    if (free) break;
  }
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/landtrain/`;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) return url;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('vite did not come up');
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
      const { sky } = game;
      const skyUpdate = sky.update;
      sky.update = function (_dt, _elapsed, camera, trainPos, fog) {
        this.timeOffset = 0;
        return skyUpdate.call(this, 0, cap.skySeconds, camera, trainPos, fog);
      };
    },
  });
}

const wait = (page, ms) => page.waitForTimeout(ms);
const idle = (page) => page.waitForFunction(() => !__game.rig.busy && !__game.rig.soft, null, { timeout: 30000 });

async function place(page, station, time = 'day', train = { x: 24.6, z: 0, heading: 0 }) {
  await page.evaluate(({ station, seconds, train }) => {
    const { player, rig } = __game;
    __cap.skySeconds = seconds;
    player.stand();
    player.syncDock('inhabit');
    __game.train.reset(train);
    Object.assign(player, { x: station.x, y: station.y, level: station.level, z: 0.35, facing: 1, climbing: false, climbTarget: null, moving: false });
    Object.assign(rig, { mode: 'inhabit', transition: null, soft: null, mapBlend: 0, followX: station.x, followY: station.y });
  }, { station, seconds: SKY[time], train });
}

async function run() {
  await acquire();
  locked = true;
  const baseUrl = await startServer();
  await mkdir(outDir, { recursive: true });
  const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chrome)) throw new Error('no Chrome found; set CHROME_PATH');
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--force-color-profile=srgb'] });
  const errors = [];

  for (const [id, profile] of Object.entries(PROFILES)) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.touch ? 3 : 1,
      hasTouch: profile.touch, isMobile: profile.touch, serviceWorkers: 'block',
    });
    await context.addInitScript(installPins, SKY);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${id}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${id}: ${m.text()}`); });
    await page.goto(`${baseUrl}?quality=${profile.quality}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__game?.sky?.renderer);
    await page.evaluate(() => document.fonts.ready);

    const snap = async (name) => {
      const file = `${id}--${name}`;
      if (only && !only.some((o) => file.includes(o))) return;
      await page.screenshot({ path: join(outDir, `${file}.png`), scale: 'css' });
      console.log(`ok   ${file}`);
    };

    await wait(page, 1500);
    await snap('intro');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __game.state.started);

    await place(page, STATIONS.engine);
    await wait(page, 2500);
    await snap('first-walk');

    await place(page, STATIONS.ladder, 'dusk');
    await wait(page, 1800);
    await snap('ladder-coach');

    await place(page, STATIONS.cab);
    await page.waitForFunction(() => __game.rig.mode === 'cabin', null, { timeout: 10000 });
    await idle(page);
    await wait(page, 5600);
    await snap('cab');

    await page.evaluate(() => { __game.rig.enterMap(); });
    await wait(page, 900);
    await snap('to-map-mid');
    await page.waitForFunction(() => __game.rig.mode === 'map' && !__game.rig.busy, null, { timeout: 15000 });
    await wait(page, 1200);
    await snap('map-empty');
    await page.evaluate(() => {
      __game.train.addWaypoint(140, -40);
      __game.train.addWaypoint(230, 10);
    });
    await wait(page, 600);
    await snap('map-route');
    await page.evaluate(() => { __game.train.clearRoute(); __game.rig.exitMap(); });
    await idle(page);

    for (const time of ['day', 'night']) {
      await place(page, STATIONS.reading, time);
      await wait(page, 600);
      await page.keyboard.press('KeyE');
      if (time === 'day') {
        await wait(page, 1200);
        await snap('to-book-mid');
      }
      await page.waitForFunction(() => __game.rig.mode === 'book' && !__game.rig.busy, null, { timeout: 15000 });
      await wait(page, 6000);
      await snap(`book-default-${time}`);
      if (time === 'night') {
        await page.evaluate(() => {
          const { rig } = __game;
          rig.autoOrbit = false;
          Object.assign(rig.orbit, { theta: -Math.PI / 2, phi: 0.26, dist: 160 });
        });
        await wait(page, 2500);
        await snap('book-side-night');
      }
      await page.keyboard.press('KeyE');
      await idle(page);
    }

    await place(page, STATIONS.engine, 'night');
    await wait(page, 2500);
    await snap('walk-night');

    await place(page, STATIONS.engine, 'dusk', { x: 2450 - 120, z: 0, heading: 0 });
    await page.waitForFunction(() => !document.getElementById('card').classList.contains('hidden'), null, { timeout: 15000 });
    await wait(page, 1500);
    await snap('arrival');

    await page.waitForFunction(() => !!__game.grassland, null, { timeout: 60000 });
    await wait(page, 900);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.getElementById('card').classList.contains('hidden'), null, { timeout: 5000 });
    await place(page, STATIONS.engine, 'day', { x: 5324.6, z: 0, heading: 0 });
    await page.waitForFunction(() => !document.getElementById('card').classList.contains('hidden'), null, { timeout: 15000 });
    await wait(page, 4000);
    await snap('ending');
    await context.close();
  }

  await writeFile(join(outDir, 'errors.json'), JSON.stringify(errors, null, 2));
  await browser.close();
  if (errors.length) console.log(`${errors.length} browser error(s); see errors.json`);
}

run().then(() => { cleanup(); process.exit(0); }, (error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});
