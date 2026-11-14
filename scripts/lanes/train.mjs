// Train-lane views the standard shots miss: the train under way, the roofs, the underframe, the bunk car by night.
// node scripts/lanes/train.mjs --out captures/<name> [--only a,b]
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
const outDir = resolve(arg('out') ?? 'captures/lane-train-extra');
const only = arg('only')?.split(',');

const SKY = { day: 14.4, dusk: 52.8, night: 79.2 };
const LEVEL = { under: 0.06, deck: 1.78, roof: 5.05 };
// drive: seconds under way before the frame; book: orbit view [theta, phi, dist]
const SHOTS = [
  { name: 'moving-engine--day', time: 'day', x: -0.8, level: 'deck', drive: 7 },
  { name: 'moving-living--dusk', time: 'dusk', x: -16.6, level: 'deck', drive: 7.3 },
  { name: 'moving-turn-book--day', time: 'day', x: -20.2, level: 'deck', drive: 9, turn: true, book: [(5 * Math.PI) / 4, 0.3, 46] },
  { name: 'moving-turn-book--night', time: 'night', x: -20.2, level: 'deck', drive: 9, turn: true, book: [-Math.PI / 3, 0.22, 44] },
  { name: 'roof-living--day', time: 'day', x: -15.5, level: 'roof' },
  { name: 'roof-engine--dusk', time: 'dusk', x: -1.5, level: 'roof' },
  { name: 'under-engine--day', time: 'day', x: 0, level: 'under' },
  { name: 'under-front--day', time: 'day', x: 16.6, level: 'under' },
  { name: 'bunk--night', time: 'night', x: 14.5, level: 'deck' },
  { name: 'bunk--dusk', time: 'dusk', x: 14.5, level: 'deck' },
  { name: 'far-side-book--day', time: 'day', x: -20.2, level: 'deck', book: [Math.PI / 2 + 0.5, 0.3, 46] },
  { name: 'nose-book--dusk', time: 'dusk', x: -20.2, level: 'deck', book: [-0.5, 0.2, 40] },
];

const lock = join(process.env.TMPDIR ?? tmpdir(), 'landtrain-capture.lock');
async function takeLock() {
  for (;;) {
    try { mkdirSync(lock); return; } catch {
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 20 * 60000) await rmdir(lock).catch(() => {});
      else await new Promise((r) => setTimeout(r, 1000));
    }
  }
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

let server = null;
let locked = false;
function cleanup() {
  if (server && !server.killed) server.kill('SIGTERM');
  if (locked) { try { require('node:fs').rmdirSync(lock); } catch { /* gone */ } }
}

async function main() {
  await takeLock();
  locked = true;
  const port = await freePort();
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: root, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/landtrain/?quality=high`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--force-color-profile=srgb'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__game?.sky?.renderer);
  await page.evaluate(() => {
    const { sky, train } = __game;
    window.__lane = { seconds: 14.4 };
    const update = sky.update;
    sky.update = function (_dt, _elapsed, camera, trainPos, fog) {
      this.timeOffset = 0;
      return update.call(this, 0, __lane.seconds, camera, trainPos, fog);
    };
    for (const [key, value] of Object.entries({ eff: 88, plants: 95, wear: 8 })) {
      Object.defineProperty(train, key, { configurable: true, get: () => value, set() {} });
    }
  });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => __game.state.started);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const shot of SHOTS) {
    if (only && !only.some((o) => shot.name.includes(o))) continue;
    await page.evaluate(({ shot, seconds, y }) => {
      const { player, rig, train } = __game;
      __lane.seconds = seconds;
      player.stand();
      player.syncDock('inhabit');
      train.reset({ x: 24.6, z: 0, heading: 0 });
      __game.state.lastRevealAt = 0;
      Object.assign(player, { x: shot.x, y, level: shot.level, z: 0.35, facing: 1, climbing: false, climbTarget: null, moving: false, walkPhase: 0 });
      Object.assign(rig, { mode: 'inhabit', transition: null, soft: null, mapBlend: 0, followX: shot.x, followY: y, autoOrbit: false, recentering: false });
    }, { shot, seconds: SKY[shot.time], y: LEVEL[shot.level] });
    await wait(2500);
    if (shot.book) {
      await page.keyboard.press('KeyE');
      await page.waitForFunction(() => __game.rig.mode === 'book' && !__game.rig.busy, null, { timeout: 15000 });
      await page.evaluate(([theta, phi, dist]) => {
        const { rig } = __game;
        Object.defineProperty(rig, 'autoOrbit', { configurable: true, get: () => false, set() {} });
        rig.recentering = false;
        Object.assign(rig.orbit, { theta, phi, dist });
      }, shot.book);
      await wait(2500);
    }
    if (shot.drive) {
      await page.evaluate((turn) => {
        const { train } = __game;
        train.addWaypoint(train.headPos.x + 30, 0);
        train.addWaypoint(train.headPos.x + (turn ? 62 : 200), turn ? 42 : 0);
        if (turn) train.addWaypoint(train.headPos.x + 150, 60);
      }, !!shot.turn);
      await wait(shot.drive * 1000);
    }
    await writeFile(join(outDir, `${shot.name}.png`), await page.screenshot({ animations: 'disabled' }));
    const speed = await page.evaluate(() => __game.train.speed);
    console.log(`ok   ${shot.name}  speed ${speed.toFixed(1)}`);
  }
  await browser.close();
}

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });
process.on('exit', cleanup);
main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
