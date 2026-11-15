import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.out || args.out === true) {
  console.error('Usage: npm run capture -- --out <dir> [--url <dev server url>] [--only <substring>[,<substring>...]]');
  process.exit(2);
}
const outDir = resolve(args.out);
const only = typeof args.only === 'string' ? args.only.split(',').map((o) => o.trim()).filter(Boolean) : null;

// time name -> sky clock seconds (DAY_LENGTH 120: phases 0.12 / 0.44 / 0.66)
const SKY = { day: 14.4, dusk: 52.8, night: 79.2 };
const PIN = { eff: 88, plants: 95, wear: 8 };
const SPAWN = { x: 24.6, z: 0, heading: 0 };
const RIVER = { x: 3100, z: 156, heading: 0 };
const DESTINATION = { x: 5240, z: 0, heading: 0 };
const APPROACH = { x: 2230, z: 60, heading: 0 };
const ROUTE = { train: APPROACH, reveal: 420, zoom: 1.5, route: [[2280, 10], [2340, -50], [2410, -30]] };

const PROFILES = {
  'desktop-1440x900': { width: 1440, height: 900, quality: 'high', touch: false },
  'touch-390x844': { width: 390, height: 844, quality: 'low', touch: true },
  'touch-844x390': { width: 844, height: 390, quality: 'low', touch: true },
};

const STATIONS = {
  engine: { x: -0.8, level: 'deck', y: 1.78, prompt: 'tend the engine' },
  plants: { x: -12.4, level: 'deck', y: 1.78, prompt: 'water the plants' },
  reading: { x: -20.2, level: 'deck', y: 1.78, prompt: 'sit & read awhile' },
  bunk: { x: 20.1, level: 'deck', y: 1.78, prompt: 'rest in the bunk' },
  cab: { x: 20.5, level: 'roof', y: 5.05, prompt: 'plot the route' },
};

const BOOK_VIEWS = {
  side: { theta: -Math.PI / 2, phi: 0.26, dist: 'fit' },
  threeQuarter: { theta: (5 * Math.PI) / 4, phi: 0.26, dist: 'fit' },
  wide: { theta: null, phi: 0.26, dist: 75 },
};

// kind: intro | inhabit | cab | map | book ; world: prairie | grassland
const shot = (profile, name, time, spec) => ({ profile, name, time, world: 'prairie', ...spec });
const D = 'desktop-1440x900';
const P = 'touch-390x844';
const L = 'touch-844x390';
const SHOTS = [
  shot(D, 'intro', 'day', { kind: 'intro' }),
  shot(D, 'inhabit-engine', 'day', { kind: 'inhabit', station: 'engine' }),
  shot(D, 'inhabit-plants', 'day', { kind: 'inhabit', station: 'plants' }),
  shot(D, 'inhabit-reading', 'day', { kind: 'inhabit', station: 'reading' }),
  shot(D, 'inhabit-bunk', 'day', { kind: 'inhabit', station: 'bunk' }),
  shot(D, 'inhabit-engine', 'night', { kind: 'inhabit', station: 'engine' }),
  shot(D, 'inhabit-reading', 'dusk', { kind: 'inhabit', station: 'reading' }),
  shot(D, 'inhabit-plants', 'dusk', { kind: 'inhabit', station: 'plants' }),
  shot(D, 'inhabit-plants', 'night', { kind: 'inhabit', station: 'plants' }),
  shot(D, 'cab', 'day', { kind: 'cab' }),
  shot(D, 'cab', 'dusk', { kind: 'cab' }),
  shot(D, 'cab', 'night', { kind: 'cab' }),
  shot(D, 'map-prairie', 'day', { kind: 'map' }),
  shot(D, 'map-prairie', 'night', { kind: 'map' }),
  shot(D, 'map-route', 'day', { kind: 'map', ...ROUTE }),
  shot(D, 'map-route', 'night', { kind: 'map', ...ROUTE }),
  shot(D, 'book-side', 'day', { kind: 'book', view: 'side' }),
  shot(D, 'book-3quarter', 'dusk', { kind: 'book', view: 'threeQuarter' }),
  shot(D, 'book-3quarter', 'night', { kind: 'book', view: 'threeQuarter' }),
  shot(D, 'grass-book-river', 'day', { kind: 'book', view: 'wide', world: 'grassland', train: RIVER }),
  shot(D, 'grass-inhabit-engine', 'day', { kind: 'inhabit', station: 'engine', world: 'grassland', train: RIVER }),
  shot(D, 'grass-map', 'day', { kind: 'map', world: 'grassland', train: RIVER }),
  shot(D, 'grass-book-destination', 'day', { kind: 'book', view: 'wide', world: 'grassland', train: DESTINATION }),
  shot(D, 'grass-ending', 'day', { kind: 'ending', world: 'grassland' }),
  shot(P, 'inhabit-plants', 'day', { kind: 'inhabit', station: 'plants' }),
  shot(P, 'cab', 'day', { kind: 'cab' }),
  shot(P, 'map-prairie', 'day', { kind: 'map' }),
  shot(P, 'book-side', 'night', { kind: 'book', view: 'side' }),
  shot(L, 'inhabit-reading', 'day', { kind: 'inhabit', station: 'reading' }),
  shot(L, 'cab', 'night', { kind: 'cab' }),
  shot(L, 'map-prairie', 'day', { kind: 'map' }),
];
const fileName = (s) => `${s.profile}--${s.name}--${s.time}`;
const selected = SHOTS.filter((s) => !only || only.some((o) => fileName(s).includes(o)));
if (!selected.length) {
  console.error(`--only "${only}" matches no shots`);
  process.exit(2);
}

// ---------------------------------------------------------------- server
async function freePort() {
  for (let port = 5300; port < 5400; port++) {
    const free = await new Promise((done) => {
      const probe = createServer();
      probe.once('error', () => done(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error('no free port in 5300-5399');
}

let server = null;
function stopServer() {
  if (server && !server.killed) server.kill('SIGTERM');
  server = null;
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopServer(); process.exit(130); });
process.on('exit', stopServer);

async function startServer() {
  const port = await freePort();
  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  server = spawn(process.execPath, [viteBin, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  const url = `http://127.0.0.1:${port}/landtrain/`;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(`vite exited early:\n${log}`);
    try {
      if ((await fetch(url)).ok) return url;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite did not come up:\n${log}`);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
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

// ----------------------------------------------------- in-page pin script
// Everything that moves is routed through wrappers installed when __game is
// assigned: clock-driven values read one fixed time, and while __cap.frozen is
// set every dt is 0, so nothing (camera glide, damping, clouds, meteors,
// fireflies, water scroll) can advance between frames.
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
      Object.defineProperty(rig, 'autoOrbit', { configurable: true, get: () => false, set() {} });
    },
  });
}

// ------------------------------------------------------------ page helpers
const rafs = (page, n) => page.evaluate((n) => new Promise((done) => {
  let left = n;
  const f = () => (--left <= 0 ? done() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);

const liveFor = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  const start = performance.now();
  const f = () => (performance.now() - start >= ms ? done() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), ms);

async function settle(page, { quiet = true } = {}) {
  await page.waitForFunction(() => !__game.rig.busy && !__game.rig.soft, null, { timeout: 30000 });
  await liveFor(page, 3200);
  await page.waitForFunction(() => !__game.rig.busy && !__game.rig.soft, null, { timeout: 30000 });
  if (quiet) {
    await page.waitForFunction(() => {
      const toast = document.getElementById('toast');
      return !toast.classList.contains('visible') && Number(getComputedStyle(toast).opacity) === 0;
    }, null, { timeout: 15000 });
  }
}

async function sampleFrames(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const times = [];
    let prev;
    const f = (now) => {
      if (prev !== undefined) times.push(now - prev);
      prev = now;
      if (times.length < 60) return requestAnimationFrame(f);
      const sorted = [...times].sort((a, b) => a - b);
      const info = __game.sky.renderer.info;
      resolve({
        medianFrameMs: (sorted[29] + sorted[30]) / 2,
        p95FrameMs: sorted[56],
        frames: times.length,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        points: info.render.points,
        lines: info.render.lines,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs.length,
      });
    };
    requestAnimationFrame(f);
  }));
}

const snapshot = (page) => page.evaluate(() => {
  const { rig, player, train, sky, quality, camera } = __game;
  return {
    mode: rig.mode, busy: rig.busy, soft: !!rig.soft, sitting: player.sitting,
    playerX: player.x, playerLevel: player.level,
    trainX: train.pos.x, speed: train.speed,
    nightness: sky.nightness, tier: quality.tier, forced: quality.forced,
    bufW: sky.renderer.domElement.width, bufH: sky.renderer.domElement.height,
    cardHidden: document.getElementById('card').classList.contains('hidden'),
    promptText: document.getElementById('prompt-text').textContent,
    camera: camera.position.toArray(),
    grassland: !!__game.grassland,
    dpr: devicePixelRatio, w: innerWidth, h: innerHeight,
  };
});

function pngStats(buffer) {
  const png = PNG.sync.read(buffer);
  const n = png.width * png.height;
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i += 7) {
    const o = i * 4;
    const l = 0.299 * png.data[o] + 0.587 * png.data[o + 1] + 0.114 * png.data[o + 2];
    sum += l; sumSq += l * l;
  }
  const m = n / 7;
  const mean = sum / m;
  return { width: png.width, height: png.height, meanLuma: mean, stdLuma: Math.sqrt(Math.max(0, sumSq / m - mean * mean)) };
}

// Hard-reset to a clean walking pose on the train before each shot, so shots
// never depend on the ones that ran before them.
async function resetStage(page, { train, station, time, reveal = 0 }) {
  await page.evaluate(({ train, station, seconds, reveal }) => {
    const { player, rig } = __game;
    __cap.frozen = false;
    __cap.skySeconds = seconds;
    player.stand();
    player.syncDock('inhabit');
    __game.train.reset(train);
    __game.state.lastRevealAt = 0;
    if (reveal) __game.fog.reveal(__game.train.pos.x, __game.train.pos.z, reveal);
    Object.assign(player, { x: station.x, y: station.y, level: station.level, z: 0.35,
      facing: 1, climbing: false, climbTarget: null, moving: false, walkPhase: 0 });
    Object.assign(rig, { mode: 'inhabit', transition: null, soft: null, mapBlend: 0,
      followX: station.x, followY: station.y, autoOrbit: false, recentering: false });
  }, { train, station, seconds: SKY[time], reveal });
}

async function ensureGrassland(page) {
  if (await page.evaluate(() => !!__game.grassland)) return;
  await resetStage(page, { train: { x: 2450 - 60 + 24.6, z: 0, heading: 0 }, station: STATIONS.engine, time: 'day' });
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

async function runShot(page, profile, spec) {
  const time = spec.time;
  if (spec.world === 'grassland') await ensureGrassland(page);
  const train = spec.train ?? SPAWN;

  if (spec.kind === 'intro') {
    // only meaningful as the fresh first frame of a profile
    await page.evaluate((s) => { __cap.skySeconds = s; }, SKY[time]);
    await settle(page, { quiet: false });
    return { expect: { mode: 'inhabit', started: false } };
  }

  if (spec.kind === 'ending') {
    await resetStage(page, { train: { x: 5400 - 100 + 24.6, z: 0, heading: 0 }, station: STATIONS.engine, time });
    await page.waitForFunction(() => !document.getElementById('card').classList.contains('hidden'), null, { timeout: 15000 });
    await liveFor(page, 1200);
    return { expect: { mode: 'inhabit', card: true } };
  }

  const cabLike = spec.kind === 'cab' || spec.kind === 'map';
  const station = STATIONS[cabLike ? 'cab' : spec.kind === 'book' ? 'reading' : spec.station];
  await resetStage(page, { train, station, time, reveal: spec.reveal ?? (spec.world === 'grassland' ? 300 : 0) });

  if (cabLike) {
    await settle(page);
    await page.waitForFunction(() => __game.rig.mode === 'cabin', null, { timeout: 10000 });
    if (spec.kind === 'map') {
      await page.evaluate(() => { __game.rig.enterMap(); });
      await page.waitForFunction(() => __game.rig.mode === 'map' && !__game.rig.busy, null, { timeout: 15000 });
      await page.evaluate(({ zoom, route }) => {
        __game.rig.mapHeight = 330 * (zoom ?? 1);
        for (const [x, z] of route ?? []) __game.train.addWaypoint(x, z);
      }, { zoom: spec.zoom, route: spec.route });
    }
  } else if (spec.kind === 'book') {
    await page.evaluate(() => { __cap.frozen = false; });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => __game.rig.mode === 'book' && !__game.rig.busy, null, { timeout: 15000 });
    await page.evaluate((view) => {
      const { rig, camera } = __game;
      const fit = Math.min(rig.maxOrbit, Math.max(55, 28 / (Math.tan((21 * Math.PI) / 180) * camera.aspect)));
      rig.autoOrbit = false;
      rig.recentering = false;
      rig.orbit.phi = view.phi;
      rig.orbit.dist = view.dist === 'fit' ? fit : view.dist;
      if (view.theta !== null) rig.orbit.theta = view.theta;
    }, BOOK_VIEWS[spec.view]);
  }
  await settle(page);
  const mode = spec.kind === 'cab' ? 'cabin' : spec.kind;
  return { expect: { mode, station } };
}

function verify(snap, profile, spec, info) {
  const problems = [];
  const eq = (label, got, want) => { if (got !== want) problems.push(`${label}: got ${got}, want ${want}`); };
  eq('mode', snap.mode, info.expect.mode);
  eq('busy', snap.busy || snap.soft, false);
  eq('tier', snap.tier, profile.quality);
  eq('forced tier', snap.forced, profile.quality);
  eq('viewport w', snap.w, profile.width);
  eq('viewport h', snap.h, profile.height);
  if (profile.touch) {
    if (snap.bufW <= profile.width) problems.push(`buffer w ${snap.bufW} is not sharper than the ${profile.width} viewport`);
    if (snap.bufW * snap.bufH > 900_000) problems.push(`buffer ${snap.bufW}x${snap.bufH} is over the low-tier pixel budget`);
  } else {
    eq('buffer w', snap.bufW, profile.width);
    eq('buffer h', snap.bufH, profile.height);
  }
  eq('speed', snap.speed, 0);
  if (spec.kind === 'intro') eq('intro card', snap.cardHidden, false);
  else if (spec.kind === 'ending') eq('end card', snap.cardHidden, false);
  else eq('card hidden', snap.cardHidden, true);
  if (spec.time === 'day') eq('nightness', snap.nightness, 0);
  if (spec.time === 'night') eq('nightness', snap.nightness, 1);
  if (spec.world === 'grassland') eq('grassland loaded', snap.grassland, true);
  if (spec.kind === 'book') eq('sitting', snap.sitting, true);
  if (['inhabit', 'cab'].includes(spec.kind)) {
    if (Math.abs(snap.playerX - info.expect.station.x) > 0.05) problems.push(`playerX ${snap.playerX} != ${info.expect.station.x}`);
  }
  if (spec.kind === 'inhabit' && !snap.promptText.includes(info.expect.station.prompt)) {
    problems.push(`prompt "${snap.promptText}" lacks "${info.expect.station.prompt}"`);
  }
  return problems;
}

// ------------------------------------------------------------------ main
async function main() {
  const baseUrl = typeof args.url === 'string' ? args.url : await startServer();
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const executablePath = findChrome();
  const browser = await chromium.launch({
    executablePath, headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--force-color-profile=srgb'],
  });
  const metrics = {
    generatedAt: new Date().toISOString(), url: baseUrl, browser: browser.version(),
    skySeconds: SKY, pinned: PIN, shots: {}, errors: [], problems: [],
  };
  let failed = false;

  try {
    for (const [profileId, profile] of Object.entries(PROFILES)) {
      const specs = selected.filter((s) => s.profile === profileId);
      if (!specs.length) continue;
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.touch ? 3 : 1,
        hasTouch: profile.touch, isMobile: profile.touch, serviceWorkers: 'block',
        locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'no-preference',
      });
      await context.addInitScript(installPins, { pin: PIN, skyTimes: SKY });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on('pageerror', (e) => metrics.errors.push({ profile: profileId, type: 'pageerror', message: e.message }));
      page.on('console', (m) => {
        if (m.type() === 'error') metrics.errors.push({ profile: profileId, type: 'console', message: m.text() });
      });
      const url = new URL(baseUrl);
      url.search = '';
      url.searchParams.set('quality', profile.quality);
      await page.goto(url.href, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__game?.sky?.renderer);
      await page.evaluate(() => document.fonts.ready);
      await page.bringToFront();

      let started = false;
      for (const spec of specs) {
        const name = fileName(spec);
        try {
          if (spec.kind !== 'intro' && !started) {
            await page.keyboard.press('Enter');
            await page.waitForFunction(() => __game.state.started);
            started = true;
          }
          const info = await runShot(page, profile, spec);
          await page.evaluate(() => { __cap.frozen = true; });
          await rafs(page, 6);
          const snap = await snapshot(page);
          const problems = verify(snap, profile, spec, info);
          const m = await sampleFrames(page);
          const buffer = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
          await writeFile(join(outDir, `${name}.png`), buffer);
          const stats = pngStats(buffer);
          if (stats.stdLuma < 6 || stats.meanLuma < 4) problems.push(`frame looks blank (mean ${stats.meanLuma.toFixed(1)}, std ${stats.stdLuma.toFixed(1)})`);
          metrics.shots[name] = { ...m, camera: snap.camera, image: stats };
          if (problems.length) {
            failed = true;
            metrics.problems.push({ shot: name, problems });
            console.log(`FAIL ${name}: ${problems.join('; ')}`);
          } else {
            console.log(`ok   ${name}  ${m.drawCalls} calls  ${Math.round(m.triangles / 1000)}k tris  ${m.medianFrameMs.toFixed(1)}ms`);
          }
        } catch (error) {
          failed = true;
          metrics.problems.push({ shot: name, problems: [error.message.split('\n')[0]] });
          console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`);
        }
      }
      await context.close();
    }
  } finally {
    await writeFile(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
    await browser.close();
    stopServer();
  }
  if (metrics.errors.length) {
    console.log(`${metrics.errors.length} browser error(s); see metrics.json`);
    failed = true;
  }
  console.log(`${Object.keys(metrics.shots).length} shots -> ${outDir}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  stopServer();
  process.exit(1);
});
