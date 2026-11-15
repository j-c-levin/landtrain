import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

// Motion strips for the traveller: node scripts/lanes/character.mjs --out <dir> [--only a,b] [--profile desktop|phone]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const outDir = resolve(arg('out') ?? 'captures/lane-character-motion');
const only = arg('only')?.split(',') ?? null;

const PROFILES = {
  desktop: { width: 1440, height: 900, quality: 'high', touch: false },
  phone: { width: 390, height: 844, quality: 'low', touch: true },
};
const profileId = arg('profile') ?? 'desktop';
const profile = PROFILES[profileId];

const DECK = 1.78;
const ROOF = 5.05;
const UNDER = 0.06;
const R = ['KeyD'];
const L = ['KeyA'];
const U = ['KeyW'];

// cam: [dx, dy, dz, lookDx, lookDy] from the start position; follow keeps it on the figure.
const CLOSE = { cam: [0, 1.0, 6.5, 0, 0.95], follow: true, clip: [300, 540] };
const TRACK = { cam: [1.6, 1.0, 7.5, 1.6, 0.95], follow: false, clip: [1100, 520] };
const FRONT = { cam: [4.6, 1.2, 4.6, 0, 0.95], follow: true, clip: [320, 540] };
const GAME = { cam: null, clip: [200, 200] };

const SEQUENCES = [
  { name: 'walk-cycle', at: [-3, DECK, 'deck'], ...CLOSE, steps: [{ n: 30, keys: R }, { n: 36, keys: R, every: 4 }] },
  { name: 'walk-track', at: [-3, DECK, 'deck'], ...TRACK, steps: [{ n: 6 }, { n: 44, keys: R, every: 4 }], cols: 2 },
  { name: 'walk-start-stop', at: [-3, DECK, 'deck'], ...CLOSE, steps: [{ n: 20 }, { n: 15, keys: R, every: 3 }, { n: 21, every: 3 }] },
  { name: 'walk-turn', at: [-3, DECK, 'deck'], ...CLOSE, steps: [{ n: 24, keys: R }, { n: 30, keys: L, every: 3 }] },
  { name: 'walk-front', at: [-3, DECK, 'deck'], ...FRONT, steps: [{ n: 30, keys: R }, { n: 36, keys: R, every: 4 }] },
  { name: 'idle', at: [-3, DECK, 'deck'], ...CLOSE, steps: [{ n: 60 }, { n: 420, every: 35 }] },
  { name: 'idle-front', at: [-3, DECK, 'deck'], ...FRONT, steps: [{ n: 60 }, { n: 140, every: 35 }] },
  { name: 'water', at: [-12.4, DECK, 'deck'], ...CLOSE, cam: [0.4, 1.0, 6.5, 0.4, 0.95], clip: [560, 540], steps: [{ n: 40 }, { n: 30, action: 'plants', every: 5 }, { n: 80, action: 'plants', every: 20 }, { n: 24, every: 6 }] },
  { name: 'tend', at: [-0.8, DECK, 'deck'], ...CLOSE, clip: [420, 540], steps: [{ n: 40 }, { n: 24, action: 'engine', every: 6 }, { n: 48, action: 'engine', every: 6 }, { n: 18, every: 6 }] },
  { name: 'tread', at: [16.6, UNDER, 'under'], ...CLOSE, clip: [420, 540], steps: [{ n: 40 }, { n: 24, action: 'tread', every: 6 }, { n: 48, action: 'tread', every: 6 }, { n: 18, every: 6 }] },
  { name: 'under-walk', at: [14, UNDER, 'under'], ...CLOSE, steps: [{ n: 30, keys: R }, { n: 36, keys: R, every: 4 }] },
  { name: 'sit', at: [-20.2, DECK, 'deck'], ...CLOSE, clip: [420, 540], steps: [{ n: 30 }, { n: 40, call: 'sit', every: 5 }, { n: 240, every: 40 }] },
  { name: 'sit-front', at: [-20.2, DECK, 'deck'], ...FRONT, clip: [420, 540], steps: [{ n: 1, call: 'sit' }, { n: 120 }, { n: 160, every: 40 }] },
  { name: 'stand-up', at: [-20.2, DECK, 'deck'], ...CLOSE, clip: [420, 540], steps: [{ n: 1, call: 'sit' }, { n: 90 }, { n: 40, call: 'stand', every: 5 }] },
  { name: 'bunk', at: [20.1, DECK, 'deck'], ...CLOSE, clip: [520, 540], steps: [{ n: 30 }, { n: 60, call: 'rest', every: 6 }, { n: 120, every: 40 }, { n: 36, call: 'stand', every: 6 }] },
  { name: 'climb', at: [-8.3, DECK, 'deck'], ...CLOSE, cam: [2.4, 1.0, 6, 0, 0.95], steps: [{ n: 20 }, { n: 54, keys: U, every: 6 }, { n: 30, every: 6 }] },
  { name: 'climb-track', at: [-8.3, DECK, 'deck'], cam: [1.5, 2.3, 12, 0, 2.3], follow: false, clip: [300, 800], steps: [{ n: 20 }, { n: 84, keys: U, every: 12 }] },
  { name: 'wheel', at: [19.1, ROOF, 'roof'], ...CLOSE, cam: [-2.6, 1.3, 6, 0, 0.95], clip: [420, 540], steps: [{ n: 30 }, { n: 40, call: 'wheel', every: 5 }, { n: 160, every: 40 }] },
  { name: 'game-walk', at: [-3, DECK, 'deck'], ...GAME, steps: [{ n: 20 }, { n: 40, keys: R, every: 4 }] },
  { name: 'game-water', at: [-12.4, DECK, 'deck'], ...GAME, steps: [{ n: 40 }, { n: 60, action: 'plants', every: 10 }] },
  { name: 'game-sit', at: [-20.2, DECK, 'deck'], ...GAME, steps: [{ n: 10 }, { n: 60, call: 'sit', every: 10 }] },
  { name: 'game-under', at: [14, UNDER, 'under'], ...GAME, clip: [220, 220], steps: [{ n: 30 }, { n: 16, keys: R, every: 4 }, { n: 60, action: 'tread', every: 15 }] },
  { name: 'game-bunk', at: [20.1, DECK, 'deck'], ...GAME, clip: [260, 200], steps: [{ n: 10 }, { n: 60, call: 'rest', every: 10 }] },
  { name: 'game-tend', at: [-0.8, DECK, 'deck'], ...GAME, steps: [{ n: 30 }, { n: 60, action: 'engine', every: 10 }] },
  { name: 'game-cab', at: [19.1, ROOF, 'roof'], ...GAME, clip: [220, 220], settle: 240, steps: [{ n: 40 }, { n: 20, keys: R, every: 5 }, { n: 40, call: 'wheel', every: 10 }] },
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

let server = null;
const stopServer = () => { if (server && !server.killed) server.kill('SIGTERM'); server = null; };
process.on('exit', stopServer);

async function startServer() {
  const port = await freePort();
  server = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/landtrain/`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(url)).ok) return url; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('vite did not come up');
}

function installLane() {
  const lane = { manual: false, cam: null, t: 10 };
  window.__lane = lane;
  let game;
  Object.defineProperty(window, '__game', {
    configurable: true,
    get: () => game,
    set(value) {
      game = value;
      const { player, rig, camera, train, sky } = game;
      const skyUpdate = sky.update;
      sky.update = function (_dt, _elapsed, ...rest) { return skyUpdate.call(this, 0, lane.sky ?? 14.4, ...rest); };
      for (const key of ['eff', 'plants', 'wear']) {
        Object.defineProperty(train, key, { configurable: true, get: () => 50, set() {} });
      }
      const update = player.update;
      player.update = function (dt, input, time) {
        if (lane.manual) return undefined;
        return update.call(this, dt, input, time);
      };
      const rigUpdate = rig.update;
      rig.update = function (dt, time) {
        rigUpdate.call(this, dt, time);
        const c = lane.cam;
        const fov = c ? 30 : 42;
        if (camera.fov !== fov) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
        if (!c) return;
        const p = c.follow ? player.group.getWorldPosition(lane.v ??= camera.position.clone()) : c.origin;
        camera.position.set(p.x + c.cam[0], p.y + c.cam[1], p.z + c.cam[2]);
        camera.lookAt(p.x + c.cam[3], p.y + c.cam[4], p.z);
      };
      lane.step = (n, keys, action) => {
        const input = { down: (k) => keys.includes(k), pressed: () => false };
        for (let i = 0; i < n; i++) {
          lane.t += 1 / 60;
          player.action = action;
          update.call(player, 1 / 60, input, lane.t);
        }
      };
      lane.place = (x, y, level) => {
        player.stand();
        player.syncDock('inhabit');
        Object.assign(player, { x, y, level, z: 0.35, facing: 1, climbing: false, climbTarget: null, moving: false, walkPhase: 0, action: null });
        Object.assign(rig, { mode: 'inhabit', transition: null, soft: null, mapBlend: 0, followX: x, followY: y });
        player.figure.snap('idle');
        lane.step(1, [], null);
      };
      lane.call = {
        sit: () => player.sit(null, 'book'),
        rest: () => player.sit({ x: 20.1, y: 2.5, z: -1.05 }, 'rest'),
        stand: () => player.stand(),
        wheel: () => player.takeWheel(),
      };
      lane.screen = () => {
        const v = player.group.getWorldPosition(camera.position.clone());
        v.y += lane.cam ? 0.95 : 0.8;
        v.project(camera);
        return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
      };
    },
  });
}

const rafs = (page, n) => page.evaluate((n) => new Promise((done) => {
  let left = n;
  const f = () => (--left <= 0 ? done() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);

function tile(frames, cols) {
  const first = PNG.sync.read(frames[0]);
  const { width: w, height: h } = first;
  const rows = Math.ceil(frames.length / cols);
  const sheet = new PNG({ width: w * cols, height: h * rows });
  sheet.data.fill(255);
  frames.forEach((buffer, i) => {
    const png = i === 0 ? first : PNG.sync.read(buffer);
    PNG.bitblt(png, sheet, 0, 0, w, h, (i % cols) * w, Math.floor(i / cols) * h);
  });
  return PNG.sync.write(sheet);
}

async function main() {
  const url = new URL(await startServer());
  url.searchParams.set('quality', profile.quality);
  await mkdir(outDir, { recursive: true });
  const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chrome)) throw new Error('no Chrome found; set CHROME_PATH');
  const browser = await chromium.launch({
    executablePath: chrome, headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--force-color-profile=srgb'],
  });
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1,
      hasTouch: profile.touch, isMobile: profile.touch, serviceWorkers: 'block', reducedMotion: 'no-preference',
    });
    await context.addInitScript(installLane);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url.href, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__game?.sky?.renderer);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __game.state.started);
    await page.addStyleTag({ content: '#prompt, #toast, #hud, .gauges { opacity: 0 !important; }' });

    for (const seq of SEQUENCES) {
      if (only && !only.some((o) => seq.name.includes(o))) continue;
      const game = seq.cam === null;
      await page.evaluate(({ seq, game, night }) => {
        __lane.manual = true;
        __lane.sky = night ? 79.2 : 14.4;
        __lane.place(...seq.at);
        const p = __game.player.group.getWorldPosition(__game.camera.position.clone());
        __lane.cam = game ? null : { cam: seq.cam, follow: seq.follow, origin: p };
      }, { seq, game, night: argv.includes('--night') });
      await rafs(page, seq.settle ?? 50);
      const frames = [];
      const [cw, ch] = seq.clip;
      for (const step of seq.steps) {
        if (step.call) await page.evaluate((name) => __lane.call[name](), step.call);
        const every = step.every ?? step.n;
        for (let done = 0; done < step.n; done += every) {
          await page.evaluate(({ n, keys, action }) => __lane.step(n, keys, action), { n: Math.min(every, step.n - done), keys: step.keys ?? [], action: step.action ?? null });
          if (!step.every) continue;
          await rafs(page, game ? 12 : 3);
          const [sx, sy] = seq.follow === false ? [profile.width / 2, profile.height / 2] : await page.evaluate(() => __lane.screen());
          const x = Math.round(Math.max(0, Math.min(profile.width - cw, sx - cw / 2)));
          const y = Math.round(Math.max(0, Math.min(profile.height - ch, sy - ch / 2)));
          frames.push(await page.screenshot({ clip: { x, y, width: Math.min(cw, profile.width), height: Math.min(ch, profile.height) } }));
        }
      }
      const cols = seq.cols ?? Math.min(frames.length, Math.max(1, Math.floor(1680 / Math.min(cw, profile.width))));
      await writeFile(join(outDir, `${profileId}--${seq.name}.png`), tile(frames, cols));
      console.log(`ok ${seq.name} ${frames.length} frames`);
    }
    await page.evaluate(() => { __lane.manual = false; __lane.cam = null; });
    await context.close();
  } finally {
    await browser.close();
    stopServer();
  }
  if (errors.length) {
    console.log(errors.join('\n'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  stopServer();
  process.exit(1);
});
