// Prairie lane captures: the route's chapters, the landmark near and far, wind frames.
// node scripts/lanes/prairie.mjs --out <dir> [--only a,b]
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : null);
const outDir = resolve(arg('out') || 'captures/lane-prairie-extra');
const only = arg('only')?.split(',');

const SKY = { day: 14.4, dusk: 52.8, night: 79.2 };
const READING = { x: -20.2, level: 'deck', y: 1.78 };
const CAB = { x: 20.5, level: 'roof', y: 5.05 };

const HIGH = { id: 'high', width: 1440, height: 900, quality: 'high', touch: false };
const LOW = { id: 'low', width: 844, height: 390, quality: 'low', touch: true };

// eye/look are world coordinates; a free lens replaces the rig for that shot
const free = (name, time, train, eye, look, extra = {}) => ({ name, time, train, eye, look, ...extra });
const cab = (name, time, x, z = 0) => ({ name, time, train: { x, z, heading: 0 }, cab: true });
const TREE = [2450, 60, 0];
const SHOTS = [
  cab('cab-straw', 'day', 300),
  cab('cab-thornveld', 'day', 800, 20),
  cab('cab-pans', 'day', 1180, 40),
  cab('cab-foothills', 'day', 1700, 150),
  cab('cab-arrival', 'day', 2262),
  cab('cab-arrival', 'dusk', 2262),
  cab('cab-arrival', 'night', 2262),
  free('wide-straw', 'day', { x: 300, z: 0, heading: 0 }, [250, 26, 85], [330, 2, -40]),
  free('wide-thornveld', 'day', { x: 800, z: 20, heading: 0 }, [745, 24, 105], [840, 2, -30]),
  free('wide-pans', 'day', { x: 1180, z: 40, heading: 0 }, [1120, 26, 130], [1230, 2, -40]),
  free('wide-wash', 'day', { x: 1290, z: -60, heading: 0 }, [1262, 15, 22], [1390, 0, -110]),
  free('wide-foothills', 'day', { x: 1700, z: 150, heading: 0 }, [1640, 30, 240], [1830, 14, 60]),
  free('wide-ridge-gap', 'dusk', { x: 2010, z: 200, heading: 0 }, [1962, 22, 300], [2090, 18, 120]),
  free('rocks-near', 'day', { x: 300, z: 0, heading: 0 }, [262, 9, 22], [350, 6, 70]),
  free('ground-near', 'day', { x: 800, z: 20, heading: 0 }, [828, 2.6, 46], [850, 0.6, 22]),
  free('tree-far', 'day', { x: 1500, z: 0, heading: 0 }, [1480, 14, 30], TREE),
  free('tree-mid', 'day', { x: 2060, z: 250, heading: 0 }, [2080, 12, 268], [2450, 52, 0]),
  free('tree-near', 'day', { x: 2262, z: 0, heading: 0 }, [2225, 9, 46], [2450, 54, 0]),
  free('tree-near', 'dusk', { x: 2262, z: 0, heading: 0 }, [2225, 9, 46], [2450, 54, 0]),
  free('tree-near', 'night', { x: 2262, z: 0, heading: 0 }, [2225, 9, 46], [2450, 54, 0]),
  free('tree-door', 'day', { x: 2262, z: 0, heading: 0 }, [2352, 30, 44], [2440, 26, 0]),
  free('tree-crown', 'day', { x: 2262, z: 0, heading: 0 }, [2390, 50, 96], [2452, 78, 0]),
  free('tree-above', 'day', { x: 2262, z: 0, heading: 0 }, [2330, 190, 150], [2450, 30, 0]),
  free('horizon-north', 'day', { x: 900, z: 0, heading: 0 }, [900, 9, 40], [900, 12, -600]),
  free('horizon-west', 'dusk', { x: 300, z: 0, heading: 0 }, [330, 8, 30], [-600, 30, -200]),
  free('edge-south', 'day', { x: 1000, z: 700, heading: 0 }, [990, 12, 660], [1040, 14, 1000]),
  free('wind-a', 'day', { x: 800, z: 20, heading: 0 }, [800, 7, 62], [870, 1, -10], { clock: 10 }),
  free('wind-b', 'day', { x: 800, z: 20, heading: 0 }, [800, 7, 62], [870, 1, -10], { clock: 11.2 }),
];

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

function installPins({ skyTimes }) {
  const cap = { frozen: false, skySeconds: skyTimes.day, time: 10, lens: null };
  window.__cap = cap;
  let game;
  Object.defineProperty(window, '__game', {
    configurable: true,
    get: () => game,
    set(value) {
      game = value;
      const { sky, train, player, rig, camera } = game;
      const skyUpdate = sky.update;
      sky.update = function (_dt, _elapsed, cam, trainPos, fog) {
        this.timeOffset = 0;
        this.fireflies.position.set(trainPos.x, 0, trainPos.z);
        return skyUpdate.call(this, 0, cap.skySeconds, cam, trainPos, fog);
      };
      const wrap = (obj, name, dtIndex, timeIndex) => {
        const original = obj[name];
        obj[name] = function (...a) {
          if (cap.frozen && dtIndex !== null) a[dtIndex] = 0;
          if (timeIndex !== null) a[timeIndex] = cap.time;
          return original.apply(this, a);
        };
      };
      wrap(train, 'update', 0, 1);
      wrap(train, 'setFocus', 2, null);
      wrap(player, 'update', 0, 2);
      const rigUpdate = rig.update;
      rig.update = function (dt, time) {
        rigUpdate.call(this, cap.frozen ? 0 : dt, time);
        if (cap.lens) {
          camera.position.fromArray(cap.lens.eye);
          camera.lookAt(cap.lens.look[0], cap.lens.look[1], cap.lens.look[2]);
          camera.updateMatrixWorld();
        }
      };
      for (const [key, value] of Object.entries({ eff: 88, plants: 95, wear: 8 })) {
        Object.defineProperty(train, key, { configurable: true, get: () => value, set() {} });
      }
      Object.defineProperty(rig, 'autoOrbit', { configurable: true, get: () => false, set() {} });
    },
  });
  // the prairie's own clock (cover wind, birds) is pinned through performance-independent time
  const raf = window.requestAnimationFrame.bind(window);
  window.__raf = raf;
}

const liveFor = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  const start = performance.now();
  const f = () => (performance.now() - start >= ms ? done() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), ms);

async function run() {
  const port = await freePort();
  const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const stop = () => server.kill('SIGTERM');
  process.on('exit', stop);
  const base = `http://127.0.0.1:${port}/landtrain/`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  await mkdir(outDir, { recursive: true });
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chrome)) throw new Error('set CHROME_PATH');
  const browser = await chromium.launch({
    executablePath: chrome, headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--force-color-profile=srgb'],
  });
  const metrics = {};
  const errors = [];
  for (const profile of [HIGH, LOW]) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1,
      hasTouch: profile.touch, isMobile: profile.touch, serviceWorkers: 'block', reducedMotion: 'no-preference',
    });
    await context.addInitScript(installPins, { skyTimes: SKY });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${profile.id}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${profile.id}: ${m.text()}`); });
    await page.goto(`${base}?quality=${profile.quality}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__game?.sky?.renderer);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __game.state.started);

    for (const shot of SHOTS) {
      const name = `${profile.id}--${shot.name}--${shot.time}`;
      if (only && !only.some((o) => name.includes(o))) continue;
      const station = shot.cab ? CAB : READING;
      await page.evaluate(({ shot, station, seconds }) => {
        const { player, rig, train } = __game;
        __cap.frozen = false;
        __cap.lens = null;
        __cap.skySeconds = seconds;
        player.stand();
        player.syncDock('inhabit');
        train.reset(shot.train);
        __game.state.lastRevealAt = 0;
        Object.assign(player, { x: station.x, y: station.y, level: station.level, z: 0.35, facing: 1, climbing: false, climbTarget: null, moving: false, walkPhase: 0 });
        Object.assign(rig, { mode: 'inhabit', transition: null, soft: null, mapBlend: 0, followX: station.x, followY: station.y, autoOrbit: false, recentering: false });
      }, { shot, station, seconds: SKY[shot.time] });
      await liveFor(page, 400);
      if (shot.cab) await page.waitForFunction(() => __game.rig.mode === 'cabin' && !__game.rig.soft, null, { timeout: 15000 });
      await liveFor(page, shot.cab ? 2600 : 600);
      await page.evaluate((shot) => {
        if (shot.eye) __cap.lens = { eye: shot.eye, look: shot.look };
        __cap.frozen = true;
      }, shot);
      await liveFor(page, 500);
      const info = await page.evaluate(() => {
        const i = __game.sky.renderer.info;
        return { calls: i.render.calls, triangles: i.render.triangles };
      });
      metrics[name] = info;
      await page.screenshot({ path: join(outDir, `${name}.png`) });
      console.log(`ok ${name} ${info.calls} calls ${Math.round(info.triangles / 1000)}k tris`);
    }
    await context.close();
  }
  await writeFile(join(outDir, 'metrics.json'), JSON.stringify({ metrics, errors }, null, 2));
  if (errors.length) console.log(`${errors.length} browser errors:\n${[...new Set(errors)].slice(0, 8).join('\n')}`);
  await browser.close();
  stop();
  process.exit(errors.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
