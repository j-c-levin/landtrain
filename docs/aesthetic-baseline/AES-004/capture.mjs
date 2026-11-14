import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [phase, inputURL] = process.argv.slice(2);
assert(['before', 'after'].includes(phase) && inputURL,
  'Usage: node docs/aesthetic-baseline/AES-004/capture.mjs before|after http://127.0.0.1:5174/landtrain/');
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../..');
const output = resolve(directory, phase);
const measurementsPath = resolve(directory, `${phase}-measurements.json`);
const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const playwrightPath = process.env.PLAYWRIGHT_CORE_PATH ||
  '/var/folders/4j/304j50mn7250qwt41g3x_t0w0000gn/T/kilo/aes000-tools/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const git = (...args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', env: { ...process.env, DEVELOPER_DIR: '/Library/Developer/CommandLineTools' },
}).trim();
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const runtimePaths = git('ls-files', 'src', 'index.html', 'package.json', 'package-lock.json',
  'vite.config.js', 'service-worker.js').split('\n');
async function runtimeHashes() {
  return Object.fromEntries(await Promise.all(runtimePaths.map(async (path) =>
    [path, sha256(await readFile(resolve(root, path)))])));
}

try {
  await access(measurementsPath);
  throw new Error(`Refusing to overwrite ${measurementsPath}; preserve or remove the previous evidence explicitly.`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const originalHashes = await runtimeHashes();
if (phase === 'before') {
  assert.equal(git('diff', '03c1c3f', '--', ...runtimePaths), '', 'Before runtime must match 03c1c3f');
}
await mkdir(output, { recursive: false });

const profiles = [
  { id: 'desktop-1440x900', width: 1440, height: 900, quality: 'high', touch: false },
  { id: 'desktop-1024x768', width: 1024, height: 768, quality: 'medium', touch: false },
  { id: 'touch-390x844', width: 390, height: 844, quality: 'low', touch: true },
  { id: 'touch-844x390', width: 844, height: 390, quality: 'low', touch: true },
];
const stations = [
  { id: 'cab', x: 20.5, level: 'roof', y: 5.05, mode: 'cabin', prompt: 'plot the route' },
  { id: 'engine', x: -0.8, level: 'deck', y: 1.78, mode: 'inhabit', prompt: 'tend the engine' },
  { id: 'plants', x: -12.4, level: 'deck', y: 1.78, mode: 'inhabit', prompt: 'water the plants' },
  { id: 'reading', x: -20.2, level: 'deck', y: 1.78, mode: 'inhabit', prompt: 'sit & read awhile' },
  { id: 'bunk', x: 20.1, level: 'deck', y: 1.78, mode: 'inhabit', prompt: 'rest in the bunk' },
];
const skyTimes = { day: 0, night: 78 };
const launchArgs = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows'];
const report = {
  schemaVersion: 1, phase, complete: false, startedAt: new Date().toISOString(), inputURL,
  git: { branch: git('branch', '--show-current'), head: git('rev-parse', 'HEAD'),
    baselineRef: git('rev-parse', '03c1c3f'), statusBefore: git('status', '--short') },
  harnessSHA256: sha256(await readFile(fileURLToPath(import.meta.url))),
  runtimeHashes: originalHashes,
  methodology: {
    profiles, stations, skyTimes, dayLengthSeconds: 120,
    train: { nose: [24.6, 0, 0], heading: 0, route: [], eff: 88, plants: 95, wear: 8 },
    skyOverride: 'Installed when __game is assigned, before first game RAF. Original sky.update runs each frame with dt=0 and elapsed=0 or 78; timeOffset=0. Firefly origin fixed to train center. No source edits.',
    gaugeOverride: 'Page-only constant getter/setters prevent gauge drift; train/player/world animation and normal render loop remain live.',
    setup: 'Stand, undock, reset train, set exact station x/level/y/z=0.35/facing=1; native rig follows without custom inhabit zoom. Cab enters through normal automatic interaction.',
    settle: 'At least 2500ms live RAF, no camera transition/soft ease, expired toast (including CSS fade), then verify mode, pose, sky, quality, focus and UI.',
    performance: 'One visible foreground page at a time. Native RAF timestamp intervals; discard 30 intervals, retain 180 per daytime station. No manual renderer calls, synthetic clock, screenshots, scene traversal or CDP requests during sampling. sky.renderer.info render counters read each retained frame.',
    resourceScope: 'Unique geometry/material object references across car groups, explicitly pruning player.group even when docked; separate train-owned totals include routeGroup and smoke sprites. Scene/train lights include total, effectively visible, positive intensity and shadow casters.',
    exterior: 'Real reading-seat interaction enters book mode, seals walls, retains book UI. Held side theta=-PI/2 and rear three-quarter theta=5PI/4, phi=0.26. Distance=max(55,28/(tan(21deg)*aspect)), capped at native book maximum 130. Never labelled inhabit.',
    screenshots: 'Full page, DPR1, UI intact, fonts ready, no CSS injection or hidden overlays. Transient toasts expire naturally.',
    limitations: [
      'Touch profiles emulate viewport and coarse pointer, not physical mobile GPU/CPU or thermal behavior.',
      'RAF timings are display-paced end-to-end intervals, not isolated CPU/GPU render durations; counters include the normal renderer shadow work.',
      'Only sky and gauges are frozen. Native idle breathing, fire flicker and world animation remain live; pixel-perfect image identity is not guaranteed.',
      'Portrait book side view reaches native zoom limit 130 and may crop train ends; native inhabit framing is intentionally not widened.',
      'Sky dt=0 suppresses cloud drift, meteor progression and firefly lag; this same page-only condition must be used for after measurements.',
    ],
  },
  browser: { executablePath, playwrightPath, headless: true, launchArgs }, profiles: [], errors: [],
};
const browser = await chromium.launch({ executablePath, headless: true, args: launchArgs });

async function settle(page) {
  await page.evaluate(() => new Promise((done) => {
    const start = performance.now();
    function frame() {
      if (performance.now() - start >= 2500 && !__game.rig.busy && !__game.rig.soft) done();
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
  await page.waitForFunction(() => {
    const toast = document.getElementById('toast');
    return !toast.classList.contains('visible') && Number(getComputedStyle(toast).opacity) === 0;
  });
}

async function setup(page, station, light) {
  await page.evaluate(({ station, seconds }) => {
    const { train, player, rig } = __game;
    __capture.skySeconds = seconds;
    player.stand();
    player.syncDock('inhabit');
    train.reset({ x: 24.6, z: 0, heading: 0 });
    __game.state.lastRevealAt = 0;
    Object.assign(player, { x: station.x, y: station.y, level: station.level, z: 0.35,
      facing: 1, climbing: false, climbTarget: null, moving: false, walkPhase: 0 });
    Object.assign(rig, { mode: 'inhabit', transition: null, soft: null, mapBlend: 0,
      followX: station.x, followY: station.y, autoOrbit: false, recentering: false });
  }, { station, seconds: skyTimes[light] });
  await settle(page);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const { train, player, rig, sky, camera, quality } = __game;
    function resources(roots) {
      const objects = new Set(), geometries = new Set(), materials = new Set();
      let meshes = 0, instances = 0;
      function visit(object) {
        if (object === player.group || objects.has(object)) return;
        objects.add(object);
        if (object.geometry) geometries.add(object.geometry);
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
          if (material) materials.add(material);
        }
        if (object.isMesh) meshes++;
        if (object.isInstancedMesh) instances += object.count;
        object.children.forEach(visit);
      }
      roots.forEach(visit);
      return { objects: objects.size, geometries: geometries.size, materials: materials.size, meshes, instances };
    }
    function lights(roots) {
      const found = new Set();
      roots.forEach((root) => root.traverse((object) => { if (object.isLight) found.add(object); }));
      const entries = [...found].map((light) => {
        let visible = true;
        for (let parent = light; parent; parent = parent.parent) visible &&= parent.visible;
        return { type: light.type, visible, intensity: light.intensity, castShadow: light.castShadow,
          color: light.color.getHexString(), position: light.getWorldPosition(light.position.clone()).toArray() };
      });
      return { total: entries.length, visible: entries.filter((x) => x.visible).length,
        active: entries.filter((x) => x.visible && x.intensity > 0).length,
        shadowCasters: entries.filter((x) => x.castShadow).length, entries };
    }
    const cars = train.cars.map((car) => car.group);
    const info = sky.renderer.info;
    const gl = sky.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      mode: rig.mode, busy: rig.busy, soft: !!rig.soft, mapBlend: rig.mapBlend,
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
        fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far,
        followX: rig.followX, followY: rig.followY, orbit: { ...rig.orbit }, autoOrbit: rig.autoOrbit },
      player: { x: player.x, y: player.y, z: player.z, level: player.level, facing: player.facing,
        sitting: player.sitting, docked: player.docked, world: player.group.getWorldPosition(camera.position.clone()).toArray() },
      train: { nose: train.headPos.toArray(), center: train.pos.toArray(), heading: train.heading,
        speed: train.speed, routeLength: train.route.length, eff: train.eff, plants: train.plants, wear: train.wear,
        carCount: cars.length, wheelCount: train.wheels.length,
        cars: resources(cars), owned: resources([...cars, train.routeGroup, ...train.smoke.map((x) => x.sprite)]),
        zoneOpacity: Object.fromEntries(Object.entries(train.zoneMats).map(([key, mat]) => [key, mat.opacity])) },
      lights: { scene: lights([train.scene]), train: lights(cars) },
      sky: { seconds: __capture.skySeconds, nightness: sky.nightness, biomeBlend: sky.biomeBlend,
        exposure: sky.renderer.toneMappingExposure },
      quality: { tier: quality.tier, forced: quality.forced, policy: { ...quality.policy },
        metrics: quality.metrics, rendererDPR: sky.renderer.getPixelRatio() },
      renderer: { render: { ...info.render }, memory: { ...info.memory }, programs: info.programs.length,
        autoReset: info.autoReset, shadowMapEnabled: sky.renderer.shadowMap.enabled, shadowMapType: sky.renderer.shadowMap.type },
      environment: { visibility: document.visibilityState, focused: document.hasFocus(), dpr: devicePixelRatio,
        width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight, coarsePointer: matchMedia('(pointer: coarse)').matches,
        maxTouchPoints: navigator.maxTouchPoints, userAgent: navigator.userAgent,
        webglVendor: gl.getParameter(gl.VENDOR), webglRenderer: gl.getParameter(gl.RENDERER),
        unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null },
      ui: { bodyClasses: document.body.className, prompt: document.getElementById('prompt-text').textContent,
        promptVisible: document.getElementById('prompt').classList.contains('visible'),
        cardHidden: document.getElementById('card').classList.contains('hidden'),
        readingLine: document.getElementById('reading-line').textContent },
    };
  });
}

function verify(state, profile, station, light, book = false) {
  assert.equal(state.mode, book ? 'book' : station.mode);
  assert.equal(state.busy || state.soft, false);
  assert.equal(state.player.sitting, book);
  assert(Math.abs(state.player.x - station.x) < 0.001);
  assert.equal(state.player.level, station.level);
  if (!book) assert.equal(state.player.y, station.y);
  assert.equal(state.player.docked, book ? 2 : station.mode === 'cabin' ? 0 : null);
  assert.deepEqual(state.train.nose, [24.6, 0, 0]);
  assert.equal(state.train.heading, 0);
  assert.equal(state.train.speed, 0);
  assert.equal(state.train.routeLength, 0);
  assert.equal(state.train.eff, 88);
  assert.equal(state.train.plants, 95);
  assert.equal(state.train.wear, 8);
  assert.equal(state.sky.seconds, skyTimes[light]);
  assert.equal(state.sky.nightness, light === 'day' ? 0 : 1);
  assert.equal(state.quality.tier, profile.quality);
  assert.equal(state.quality.forced, profile.quality);
  assert.equal(state.environment.dpr, 1);
  assert.equal(state.quality.rendererDPR, 1);
  assert.equal(state.environment.coarsePointer, profile.touch);
  assert.equal(state.environment.visibility, 'visible');
  assert.equal(state.environment.focused, true);
  assert.equal(state.environment.width, profile.width);
  assert.equal(state.environment.height, profile.height);
  assert.equal(state.quality.metrics.drawingBufferWidth, profile.width);
  assert.equal(state.quality.metrics.drawingBufferHeight, profile.height);
  assert.equal(state.ui.cardHidden && state.ui.promptVisible, true);
  assert(state.ui.prompt.includes(book ? 'set the book down' : station.prompt));
}

async function performanceSample(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const frames = [];
    let previous, intervals = 0, lastRenderFrame;
    const timeout = setTimeout(() => reject(new Error('RAF sample timed out')), 60000);
    function frame(now) {
      const { render } = __game.sky.renderer.info;
      if (document.hidden || !document.hasFocus() || (lastRenderFrame !== undefined && render.frame <= lastRenderFrame)) {
        clearTimeout(timeout);
        reject(new Error('Sampling lost foreground focus or live renderer progress'));
        return;
      }
      lastRenderFrame = render.frame;
      if (previous !== undefined && intervals++ >= 30) {
        frames.push({ ms: now - previous, calls: render.calls, triangles: render.triangles,
          lines: render.lines, points: render.points, rendererFrame: render.frame });
      }
      previous = now;
      if (frames.length < 180) requestAnimationFrame(frame);
      else {
        clearTimeout(timeout);
        function stats(values) {
          const sorted = [...values].sort((a, b) => a - b);
          return { min: sorted[0], mean: values.reduce((a, b) => a + b, 0) / values.length,
            median: (sorted[89] + sorted[90]) / 2, p95: sorted[Math.ceil(values.length * 0.95) - 1], max: sorted.at(-1) };
        }
        resolve({ discarded: 30, retained: frames.length, frameMs: stats(frames.map((x) => x.ms)),
          calls: stats(frames.map((x) => x.calls)), triangles: stats(frames.map((x) => x.triangles)), frames });
      }
    }
    requestAnimationFrame(frame);
  }));
}

try {
  const cdp = await browser.newBrowserCDPSession();
  report.browser.version = await cdp.send('Browser.getVersion');
  report.browser.systemInfo = await cdp.send('SystemInfo.getInfo');
  report.browser.commandLine = await cdp.send('Browser.getBrowserCommandLine');
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: 1, hasTouch: profile.touch, isMobile: profile.touch,
      serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light' });
    await context.addInitScript(() => {
      window.__capture = { skySeconds: 0 };
      let game;
      Object.defineProperty(window, '__game', {
        configurable: true, get: () => game,
        set(value) {
          game = value;
          const update = game.sky.update;
          game.sky.update = function (_dt, _elapsed, camera, trainPos, fog) {
            this.timeOffset = 0;
            this.fireflies.position.set(trainPos.x, 0, trainPos.z);
            return update.call(this, 0, __capture.skySeconds, camera, trainPos, fog);
          };
          for (const [key, value] of Object.entries({ eff: 88, plants: 95, wear: 8 })) {
            Object.defineProperty(game.train, key, { configurable: true, get: () => value, set() {} });
          }
        },
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const profileReport = { ...profile, shots: [], performance: {}, servedRuntimeHashes: {} };
    report.profiles.push(profileReport);
    const responses = [];
    page.on('pageerror', (error) => report.errors.push({ profile: profile.id, type: 'pageerror', message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') report.errors.push({ profile: profile.id, type: 'console', message: message.text() });
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.includes('/src/') && /\.(js|css)$/.test(url.pathname)) {
        responses.push(response.body().then((body) => {
          profileReport.servedRuntimeHashes[url.pathname] = sha256(body);
        }));
      }
    });
    const url = new URL(inputURL);
    url.search = '';
    url.searchParams.set('quality', profile.quality);
    profileReport.url = url.href;
    await page.goto(url.href, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__game?.sky?.renderer);
    await page.evaluate(() => document.fonts.ready);
    await page.bringToFront();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __game.state.started);

    async function capture(name, station, light, book = false) {
      const state = await snapshot(page);
      verify(state, profile, station, light, book);
      const path = resolve(output, `${profile.id}--${name}--${light}.png`);
      await page.screenshot({ path, fullPage: true });
      const png = await readFile(path);
      assert.equal(png.readUInt32BE(16), state.environment.pageWidth);
      assert.equal(png.readUInt32BE(20), state.environment.pageHeight);
      profileReport.shots.push({ name, light, path: relative(directory, path), sha256: sha256(png),
        bytes: png.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20), state });
    }

    for (const station of stations) {
      for (const light of ['day', 'night']) {
        await setup(page, station, light);
        if (light === 'day') {
          const start = await snapshot(page);
          verify(start, profile, station, light);
          const sample = await performanceSample(page);
          const end = await snapshot(page);
          verify(end, profile, station, light);
          assert.deepEqual(end.camera.position, start.camera.position);
          assert.deepEqual(end.camera.quaternion, start.camera.quaternion);
          profileReport.performance[station.id] = { start, ...sample, end };
          console.log(`${profile.id} ${station.id}: ${sample.retained} RAF samples, mean ${sample.frameMs.mean.toFixed(2)}ms, p95 ${sample.frameMs.p95.toFixed(2)}ms, ${sample.calls.median} calls`);
        }
        await capture(`${station.id}-${station.mode}`, station, light);
      }
    }
    const reading = stations.find((station) => station.id === 'reading');
    await setup(page, reading, 'day');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => __game.rig.mode === 'book' && !__game.rig.busy);
    for (const [name, theta] of [['side', -Math.PI / 2], ['3quarter', 5 * Math.PI / 4]]) {
      for (const light of ['day', 'night']) {
        await page.evaluate(({ theta, seconds }) => {
          __capture.skySeconds = seconds;
          const { rig, camera } = __game;
          rig.autoOrbit = false;
          rig.recentering = false;
          Object.assign(rig.orbit, { theta, phi: 0.26,
            dist: Math.min(130, Math.max(55, 28 / (Math.tan(21 * Math.PI / 180) * camera.aspect))) });
        }, { theta, seconds: skyTimes[light] });
        await settle(page);
        await capture(`exterior-book-${name}`, reading, light, true);
      }
    }
    await Promise.all(responses);
    assert.equal(profileReport.shots.length, 14);
    await context.close();
    await writeFile(measurementsPath, JSON.stringify(report, null, 2) + '\n');
  }
  assert.deepEqual(await runtimeHashes(), originalHashes, 'Runtime changed during capture; baseline is invalid');
  for (const profile of report.profiles.slice(1)) {
    assert.deepEqual(profile.servedRuntimeHashes, report.profiles[0].servedRuntimeHashes,
      'Served source changed between profiles');
  }
  assert.equal(report.errors.length, 0, 'Browser errors occurred; inspect measurement report');
  report.complete = true;
  report.completedAt = new Date().toISOString();
  report.summary = { screenshots: report.profiles.reduce((n, p) => n + p.shots.length, 0),
    daytimeStationSamples: 20, retainedRAFIntervals: 3600, discardedRAFIntervals: 600,
    sourceUnchangedDuringCapture: true };
  console.log(`${phase} baseline complete: ${report.summary.screenshots} screenshots; ${measurementsPath}`);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await writeFile(measurementsPath, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
