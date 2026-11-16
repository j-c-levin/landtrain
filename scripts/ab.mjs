import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `Usage: npm run bench -- [options]
  --tier low|medium|high   forced quality tier (default low)
  --out <file.json>        write results (default perf/bench-<tier>.json)
  --compare <file.json>    after running, print deltas against a previous result
  --diff <a.json> <b.json> print deltas between two results without running
  --scenes a,b             only scenes whose name contains one of these
  --ablate [a,b]           also measure each scene with one thing switched off at a time
  --frames <n>             frames per block (default 12); --blocks <n> blocks per scene (default 3)
  --built                  bench the production build (vite build + preview) instead of the dev server
  --url <url>              bench an already-running server
  --shots <dir>            save a screenshot of every scene (and every ablation)
  --gpu                    use the real GPU instead of SwiftShader (frame times stop being comparable)
  --pr <n>                 measure at this render pixel ratio instead of the tier's (e.g. 6 to load a fast GPU)
  --query a=b&c=d          extra query parameters for the page`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { args._.push(argv[i]); continue; }
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log(USAGE); process.exit(0); }

const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 3 };
const SKY = { day: 14.4, dusk: 52.8, night: 79.2 };
const SPAWN = { x: 24.6, z: 0, heading: 0 };
const RIVER = { x: 3100, z: 156, heading: 0 };
const STATIONS = {
  engine: { x: -0.8, level: 'deck', y: 1.78 },
  reading: { x: -20.2, level: 'deck', y: 1.78 },
  cab: { x: 20.5, level: 'roof', y: 5.05 },
};
const BOOK_VIEWS = {
  threeQuarter: { theta: (5 * Math.PI) / 4, phi: 0.26, dist: 'fit' },
  wide: { theta: null, phi: 0.26, dist: 75 },
  rig: null,
};

const SCENES = [
  { name: 'travel-day', kind: 'book', view: 'threeQuarter', time: 'day', travel: true },
  { name: 'travel-night', kind: 'book', view: 'rig', time: 'night', travel: true },
  { name: 'carriage-dusk', kind: 'inhabit', station: 'reading', time: 'dusk' },
  { name: 'engine-day', kind: 'inhabit', station: 'engine', time: 'day' },
  { name: 'map-day', kind: 'map', time: 'day' },
  { name: 'vista-grass', kind: 'book', view: 'wide', time: 'day', world: 'grassland', train: RIVER },
];

const ABLATIONS = [
  { name: 'pixel ratio 1.0', pr: 1 },
  { name: 'pixel ratio 0.5', pr: 0.5 },
  { name: 'shadows', off: ['shadows'] },
  { name: 'bounce light', off: ['bounce'] },
  { name: 'room fill light', off: ['fill'] },
  { name: 'point lights', off: ['points'] },
  { name: 'bounce+fill+points', off: ['bounce', 'fill', 'points'] },
  { name: 'hemisphere light', off: ['hemi'] },
  { name: 'environment map', off: ['env'] },
  { name: 'interiors', off: ['interiors'] },
  { name: 'interior shadows', off: ['interiorShadows'] },
  { name: 'train shadows', off: ['trainShadows'] },
  { name: 'all shading (flat)', off: ['shading'] },
  { name: 'whole train', off: ['train'] },
  { name: 'figure', off: ['figure'] },
  { name: 'ground cover', off: ['cover'] },
  { name: 'scenery', off: ['scenery'] },
  { name: 'ground', off: ['ground'] },
  { name: 'water', off: ['water'] },
  { name: 'smoke', off: ['smoke'] },
  { name: 'sky dome+stars', off: ['sky'] },
  { name: 'map shroud', off: ['shroud'] },
  { name: 'all transparent', off: ['transparent'] },
  { name: 'css overlays', off: ['overlays'] },
  { name: 'tone mapping', off: ['tonemap'] },
];

const SETTLE_DT = 0.1;
const basePr = Number(args.pr) || null;
const LOW_RES = 0.5;
const SETUP_PIXEL_RATIO = 0.3;

// ---------------------------------------------------------------- server
async function freePort(from) {
  for (let port = from; port < from + 100; port++) {
    const free = await new Promise((done) => {
      const probe = createServer();
      probe.once('error', () => done(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error(`no free port from ${from}`);
}

let server = null;
function stopServer() {
  if (server && !server.killed) server.kill('SIGTERM');
  server = null;
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopServer(); process.exit(130); });
process.on('exit', stopServer);

async function startServer(built) {
  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (built) execFileSync(process.execPath, [viteBin, 'build'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  const port = await freePort(5400);
  const command = built ? ['preview'] : [];
  server = spawn(process.execPath, [viteBin, ...command, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
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
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      for (const rel of ['chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium']) {
        if (existsSync(join(cache, dir, rel))) return join(cache, dir, rel);
      }
    }
  }
  throw new Error('no Chrome found; set CHROME_PATH');
}

// ------------------------------------------------------------ page helpers
const step = (page, frames, dt) => page.evaluate(({ frames, dt }) => new Promise((done) => {
  if (dt !== null) __perf.fixedDt = dt;
  let left = frames;
  const f = () => (--left <= 0 ? done() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), { frames, dt });

const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout });

function pinSky() {
  const bench = { sky: 14.4 };
  window.__bench = bench;
  const sky = __game.sky;
  const update = sky.update;
  sky.update = function (_dt, _elapsed, camera, trainPos, fog) {
    this.timeOffset = 0;
    this.fireflies.position.set(trainPos.x, 0, trainPos.z);
    return update.call(this, 0, bench.sky, camera, trainPos, fog);
  };
  Object.defineProperty(__game.rig, 'autoOrbit', { configurable: true, get: () => false, set() {} });
}

async function resetStage(page, { train, station, time }) {
  await page.evaluate(({ train, station, seconds }) => {
    const { player, rig } = __game;
    __bench.sky = seconds;
    __perf.fixedDt = 0.1;
    player.stand();
    player.syncDock('inhabit');
    __game.train.reset(train);
    __game.state.lastRevealAt = 0;
    __game.fog.reveal(__game.train.pos.x, __game.train.pos.z, 300);
    Object.assign(player, { x: station.x, y: station.y, level: station.level, z: 0.35,
      facing: 1, climbing: false, climbTarget: null, moving: false, walkPhase: 0 });
    Object.assign(rig, { mode: 'inhabit', transition: null, soft: null, mapBlend: 0,
      followX: station.x, followY: station.y, recentering: false });
  }, { train, station, seconds: SKY[time] });
}

async function ensureGrassland(page) {
  if (await page.evaluate(() => !!__game.grassland)) return;
  await resetStage(page, { train: { x: 2450 - 60 + 24.6, z: 0, heading: 0 }, station: STATIONS.engine, time: 'day' });
  await until(page, () => !!__game.grassland);
  await step(page, 10, SETTLE_DT);
  // the arrival card arms its dismissal 600ms after it appears
  await page.waitForTimeout(800);
  await page.keyboard.press('Space');
  await until(page, () => document.getElementById('card').classList.contains('hidden'));
}

async function stage(page, scene) {
  await page.evaluate((pr) => { __perf.setPixelRatio(pr); __perf.off(['cover', 'scenery']); __perf.sync = false; }, SETUP_PIXEL_RATIO);
  if (scene.world === 'grassland') await ensureGrassland(page);
  const cabLike = scene.kind === 'map';
  const station = STATIONS[cabLike ? 'cab' : scene.kind === 'book' ? 'reading' : scene.station];
  await resetStage(page, { train: scene.train ?? SPAWN, station, time: scene.time });
  await until(page, () => !__game.rig.busy && !__game.rig.soft);

  if (scene.kind === 'map') {
    await until(page, () => __game.rig.mode === 'cabin');
    await page.evaluate(() => { __game.rig.enterMap(); });
    await until(page, () => __game.rig.mode === 'map' && !__game.rig.busy);
    await page.evaluate(() => { __game.rig.mapHeight = 330; });
  } else if (scene.kind === 'book') {
    await page.keyboard.press('KeyE');
    await until(page, () => __game.rig.mode === 'book' && !__game.rig.busy);
    await page.evaluate((view) => {
      const { rig, camera } = __game;
      if (!view) return;
      const fit = Math.min(rig.maxOrbit, Math.max(55, 28 / (Math.tan((21 * Math.PI) / 180) * camera.aspect)));
      rig.recentering = false;
      rig.orbit.phi = view.phi;
      rig.orbit.dist = view.dist === 'fit' ? fit : view.dist;
      if (view.theta !== null) rig.orbit.theta = view.theta;
    }, BOOK_VIEWS[scene.view]);
  }
  if (scene.travel) {
    await page.evaluate(() => { __game.train.addWaypoint(__game.train.pos.x + 600, 0); });
    await step(page, 80, SETTLE_DT);
  }
  await step(page, 40, SETTLE_DT);
  const state = await page.evaluate(() => ({
    mode: __game.rig.mode, busy: __game.rig.busy, speed: __game.train.speed, night: __game.sky.nightness,
    grassland: !!__game.grassland,
  }));
  const want = scene.kind === 'inhabit' ? 'inhabit' : scene.kind;
  if (state.mode !== want || state.busy) throw new Error(`${scene.name}: staged as ${state.mode}${state.busy ? ' (busy)' : ''}, wanted ${want}`);
  if (scene.travel && !(state.speed > 1)) throw new Error(`${scene.name}: train is not moving (speed ${state.speed})`);
  return state;
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (values, q) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const round = (n, d = 2) => Number(n.toFixed(d));

// Frozen frames (dt 0) at the real pixel ratio: every block renders the identical picture.
async function measure(page, { frames, blocks, pr = basePr, off = [] }) {
  await page.evaluate(({ pr, off }) => { __perf.setPixelRatio(pr); __perf.off(off); __perf.sync = true; }, { pr, off });
  await step(page, 5, 0);
  const perBlock = [];
  const all = [];
  for (let b = 0; b < blocks; b++) {
    await page.evaluate(() => { __perf.record = []; });
    await step(page, frames + 1, 0);
    const rows = await page.evaluate(() => { const r = __perf.record; __perf.record = null; return r; });
    perBlock.push(median(rows.map((r) => r[0])));
    all.push(...rows);
  }
  await step(page, 2, 0);
  const stats = await page.evaluate(() => {
    const s = __perf.stats;
    const r = __perf.renderer;
    return {
      calls: s.calls, shadowCalls: s.shadowCalls,
      triangles: s.triangles, shadowTriangles: s.shadowTriangles,
      points: s.points, programs: r.info.programs.length, geometries: r.info.memory.geometries, textures: r.info.memory.textures,
      width: r.domElement.width, height: r.domElement.height, pixelRatio: r.getPixelRatio(),
    };
  });
  // the panel's light count refreshes once a second, so read it straight from the scene
  const lights = await page.evaluate(() => {
    const n = { dir: 0, point: 0, spot: 0, hemi: 0 };
    __perf.scene.traverseVisible((o) => {
      if (!o.isLight || !(o.layers.mask & 1)) return;
      if (o.isDirectionalLight) n.dir++; else if (o.isPointLight) n.point++; else if (o.isSpotLight) n.spot++; else if (o.isHemisphereLight) n.hemi++;
    });
    return n;
  });
  const frame = all.map((r) => r[0]);
  return {
    frameMs: round(median(frame)),
    p90Ms: round(quantile(frame, 0.9)),
    jsMs: round(median(all.map((r) => r[1]))),
    syncMs: round(median(all.map((r) => r[2]))),
    blockMs: perBlock.map((v) => round(v)),
    spreadPct: round(((Math.max(...perBlock) - Math.min(...perBlock)) / median(perBlock)) * 100, 1),
    ...stats,
    pixels: stats.width * stats.height,
    lights,
  };
}

// ------------------------------------------------------------------ tables
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const kilo = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const lightText = (l) => `${l.dir}d${l.point}p${l.spot ? `${l.spot}s` : ''}${l.hemi}h`;

function printScenes(result) {
  console.log(`\n${result.meta.tier} tier, ${result.meta.viewport}, ${result.meta.gpu}`);
  console.log(`${pad('scene', 15)}${lpad('frame ms', 9)}${lpad('p90', 8)}${lpad('js', 7)}${lpad('fixed', 7)}${lpad('ms/Mpx', 8)}${lpad('+-%', 6)}${lpad('calls', 7)}${lpad('+shad', 6)}${lpad('tris', 7)}${lpad('+shad', 6)}${lpad('lights', 9)}${lpad('Mpx', 6)}${lpad('prog', 6)}`);
  for (const [name, s] of Object.entries(result.scenes)) {
    console.log(`${pad(name, 15)}${lpad(s.frameMs.toFixed(1), 9)}${lpad(s.p90Ms.toFixed(1), 8)}${lpad(s.jsMs.toFixed(1), 7)}${lpad(s.fixedMs.toFixed(0), 7)}${lpad(s.perMpxMs.toFixed(0), 8)}${lpad(s.spreadPct.toFixed(1), 6)}${lpad(s.calls, 7)}${lpad(s.shadowCalls, 6)}${lpad(kilo(s.triangles), 7)}${lpad(kilo(s.shadowTriangles), 6)}${lpad(lightText(s.lights), 9)}${lpad((s.pixels / 1e6).toFixed(2), 6)}${lpad(s.programs, 6)}`);
  }
}

function printAblation(result) {
  if (!result.ablation) return;
  const scenes = Object.keys(result.ablation);
  const names = [...new Set(scenes.flatMap((s) => Object.keys(result.ablation[s].variants)))];
  const mean = (name) => {
    const v = scenes.map((s) => result.ablation[s].variants[name]?.savedMs).filter((x) => x !== undefined);
    return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  };
  names.sort((a, b) => mean(b) - mean(a));
  console.log(`\nms saved per frame with one thing off, ${result.meta.tier} tier: "full/low" = at the tier's resolution / at a quarter of the pixels.`);
  console.log('A saving that survives at low resolution is geometry, shadow-map or draw-call work; one that shrinks is per-pixel shading.');
  console.log(`${pad('off', 22)}${scenes.map((s) => lpad(s, 15)).join('')}${lpad('mean', 9)}`);
  for (const name of names) {
    const cells = scenes.map((s) => {
      const v = result.ablation[s].variants[name];
      return lpad(v ? `${v.savedMs.toFixed(0)}${v.savedLowResMs === undefined ? '' : `/${v.savedLowResMs.toFixed(0)}`} (${v.savedPct.toFixed(0)}%)` : '-', 15);
    });
    console.log(`${pad(name, 22)}${cells.join('')}${lpad(mean(name).toFixed(1), 9)}`);
  }
  console.log(`${pad('baseline ms', 22)}${scenes.map((s) => lpad(`${result.ablation[s].baselineMs.toFixed(0)}/${result.ablation[s].lowResMs.toFixed(0)}`, 15)).join('')}`);
  console.log(`${pad('baseline drift ms', 22)}${scenes.map((s) => lpad(result.ablation[s].driftMs.toFixed(1), 15)).join('')}`);
}

function printDiff(before, after) {
  console.log(`\n${before.meta.tier} -> ${after.meta.tier} (before: ${before.meta.commit ?? '?'}, after: ${after.meta.commit ?? '?'})`);
  console.log(`${pad('scene', 15)}${lpad('frame ms', 18)}${lpad('change', 9)}${lpad('js ms', 14)}${lpad('calls', 14)}${lpad('tris', 14)}${lpad('shadow tris', 14)}${lpad('Mpx', 13)}`);
  const pair = (a, b, f = (x) => x) => `${f(a)}>${f(b)}`;
  for (const [name, b] of Object.entries(after.scenes)) {
    const a = before.scenes[name];
    if (!a) continue;
    const change = ((b.frameMs - a.frameMs) / a.frameMs) * 100;
    console.log(`${pad(name, 15)}${lpad(pair(a.frameMs, b.frameMs, (x) => x.toFixed(1)), 18)}${lpad(`${change >= 0 ? '+' : ''}${change.toFixed(0)}%`, 9)}${lpad(pair(a.jsMs, b.jsMs, (x) => x.toFixed(1)), 14)}${lpad(pair(a.calls + a.shadowCalls, b.calls + b.shadowCalls), 14)}${lpad(pair(a.triangles, b.triangles, kilo), 14)}${lpad(pair(a.shadowTriangles, b.shadowTriangles, kilo), 14)}${lpad(pair(a.pixels, b.pixels, (x) => (x / 1e6).toFixed(2)), 13)}`);
  }
}

const load = async (file) => JSON.parse(await readFile(resolve(file), 'utf8'));

// ------------------------------------------------------------------ main
async function main() {
  if (args.diff) {
    if (typeof args.diff !== 'string' || !args._[0]) throw new Error('--diff needs two files');
    printDiff(await load(args.diff), await load(args._[0]));
    return;
  }
  const tier = typeof args.tier === 'string' ? args.tier : 'low';
  if (!['low', 'medium', 'high'].includes(tier)) throw new Error(`unknown tier "${tier}"\n${USAGE}`);
  const frames = Number(args.frames) || 12;
  const blocks = Number(args.blocks) || 3;
  const outFile = resolve(typeof args.out === 'string' ? args.out : join(root, 'perf', `bench-${tier}.json`));
  const only = typeof args.scenes === 'string' ? args.scenes.split(',') : null;
  const scenes = SCENES.filter((s) => !only || only.some((o) => s.name.includes(o)));
  if (!scenes.length) throw new Error('--scenes matches nothing');
  const ablations = !args.ablate ? []
    : args.ablate === true ? ABLATIONS
      : ABLATIONS.filter((a) => args.ablate.split(',').some((o) => a.name.includes(o)));
  const shots = typeof args.shots === 'string' ? resolve(args.shots) : null;
  if (shots) await mkdir(shots, { recursive: true });

  const baseUrl = typeof args.url === 'string' ? args.url : await startServer(!!args.built);
  const browser = await chromium.launch({
    executablePath: findChrome(), headless: true,
    args: [
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--force-color-profile=srgb', '--disable-gpu-vsync', '--disable-frame-rate-limit',
      ...(args.gpu ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']),
    ],
  });
  let commit = null;
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim();
    if (execFileSync('git', ['status', '--porcelain', '--', 'src'], { cwd: root }).toString().trim()) commit += '+dirty';
  } catch { /* not a checkout */ }

  const result = {
    meta: {
      generatedAt: new Date().toISOString(), commit, tier, built: !!args.built, browser: browser.version(),
      viewport: `${VIEWPORT.width}x${VIEWPORT.height}@${VIEWPORT.deviceScaleFactor}`, frames, blocks, pixelRatio: basePr ?? 'tier', query: args.query || '',
    },
    scenes: {},
  };
  const errors = [];
  const started = Date.now();
  try {
    const context = await browser.newContext({
      viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: VIEWPORT.deviceScaleFactor,
      hasTouch: true, isMobile: true, serviceWorkers: 'block',
      locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const url = new URL(baseUrl);
    url.search = typeof args.query === 'string' ? args.query : '';
    url.searchParams.set('tier', tier);
    url.searchParams.set('perf', 'bench');
    url.searchParams.set('dt', String(SETTLE_DT));
    url.searchParams.set('pr', String(SETUP_PIXEL_RATIO));
    await page.goto(url.href, { waitUntil: 'networkidle' });
    await until(page, () => !!window.__game?.sky?.renderer && !!window.__perf);
    await page.evaluate(() => document.fonts.ready);
    await page.bringToFront();
    await page.evaluate(pinSky);
    result.meta.gpu = await page.evaluate(() => {
      const gl = __perf.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    result.meta.antialias = await page.evaluate(() => __perf.renderer.getContext().getContextAttributes().antialias);
    if (!args.gpu && !/swiftshader/i.test(result.meta.gpu)) throw new Error(`expected SwiftShader, got "${result.meta.gpu}"`);
    await page.keyboard.press('Enter');
    await until(page, () => __game.state.started);

    if (args.inspect) {
      const fn = await readFile(args.inspect, 'utf8');
      for (const scene of scenes) {
        await stage(page, scene);
        await page.evaluate(({ pr }) => { __perf.setPixelRatio(pr); __perf.off([]); }, { pr: basePr });
        await step(page, 3, 0);
        console.log(`\n${scene.name}\n${await page.evaluate(`(${fn})()`)}`);
      }
      return;
    }
    const variants = JSON.parse(await readFile(args.variants, 'utf8'));
    const rounds = Number(args.rounds) || 4;
    result.ab = {};
    for (const scene of scenes) {
      await stage(page, scene);
      const ms = Object.fromEntries(variants.map((v) => [v.name, []]));
      const info = {};
      for (let r = 0; r < rounds; r++) {
        for (const v of (r % 2 ? [...variants].reverse() : variants)) {
          await page.evaluate(v.apply);
          const m = await measure(page, { frames, blocks: 1 });
          ms[v.name].push(m.frameMs);
          info[v.name] = { calls: m.calls, shadowCalls: m.shadowCalls, tris: m.triangles, shadowTris: m.shadowTriangles };
        }
      }
      const base = median(ms[variants[0].name]);
      console.log(`\n${scene.name}`);
      for (const v of variants) {
        const med = median(ms[v.name]);
        const lo = Math.min(...ms[v.name]);
        const baseLo = Math.min(...ms[variants[0].name]);
        const i = info[v.name];
        console.log(`  ${pad(v.name, 18)} ${lpad(med.toFixed(1), 7)} ms ${lpad(((med - base) / base * 100).toFixed(1), 6)}%  min ${lpad(lo.toFixed(1), 7)} ${lpad(((lo - baseLo) / baseLo * 100).toFixed(1), 6)}%  [${ms[v.name].map((x) => x.toFixed(0)).join(' ')}]  calls ${i.calls}+${i.shadowCalls} tris ${kilo(i.tris)}+${kilo(i.shadowTris)}`);
      }
      result.ab[scene.name] = { ms, info };
    }
    await context.close();
  } finally {
    await browser.close();
    stopServer();
  }
  result.meta.seconds = Math.round((Date.now() - started) / 1000);
  result.errors = errors;
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(result, null, 2) + '\n');
  if (typeof args.compare === 'string') printDiff(await load(args.compare), result);
  if (errors.length) console.log(`\n${errors.length} browser error(s):\n  ${[...new Set(errors)].slice(0, 5).join('\n  ')}`);
  console.log(`\n${result.meta.seconds}s -> ${outFile}`);
}

main().catch((error) => {
  console.error(error.message || error);
  stopServer();
  process.exit(1);
});
