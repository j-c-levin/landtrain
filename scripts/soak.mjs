import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (!process.argv[i].startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[process.argv[i].slice(2)] = true;
  else args[process.argv[i].slice(2)] = process.argv[++i];
}
if (args.help) {
  console.log('Usage: node scripts/soak.mjs [--mode journey|determinism|offline|alloc] [--tiers low,medium,high] [--views portrait,landscape,desktop] [--ts 20] [--built] [--parallel 2] [--out file.json]');
  process.exit(0);
}
const mode = args.mode || 'journey';
const tiers = (args.tiers || 'low,medium,high').split(',');
const views = (args.views || 'portrait,landscape').split(',');
const ts = Number(args.ts || 20);

const VIEWS = {
  portrait: { width: 390, height: 844, touch: true },
  landscape: { width: 844, height: 390, touch: true },
  desktop: { width: 1440, height: 900, touch: false },
};

async function freePort(from) {
  for (let port = from; port < from + 100; port++) {
    const free = await new Promise((done) => {
      const probe = createServer();
      probe.once('error', () => done(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error('no free port');
}

const servers = [];
const stopServers = () => { for (const s of servers.splice(0)) if (!s.killed) s.kill('SIGTERM'); };
process.on('exit', stopServers);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopServers(); process.exit(130); });

async function startVite(preview) {
  const port = await freePort(preview ? 5500 : 5400);
  const bin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [bin, ...(preview ? ['preview'] : []), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  });
  servers.push(server);
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
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium']) {
        if (existsSync(join(cache, dir, rel))) return join(cache, dir, rel);
      }
    }
  }
  throw new Error('no Chrome found; set CHROME_PATH');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function watch(page, sink, origin) {
  page.on('pageerror', (e) => sink.push({ type: 'pageerror', message: e.message }));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') sink.push({ type: m.type(), message: m.text().slice(0, 400) });
  });
  page.on('requestfailed', (r) => sink.push({ type: 'requestfailed', message: `${r.url()} ${r.failure()?.errorText}` }));
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) sink.push({ type: 'foreign-request', message: url });
  });
}

// ---------------------------------------------------------------- in page
// Grid search over the obstacle field from the nose to the arrival ring, then
// a line-of-sight pull so the route fits the 60-waypoint cap.
function planRoute({ blockedSrc, segSrc }) {
  const { train, obstacles, goalPos, WORLD } = __game;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // eslint-disable-next-line no-new-func
  const segDist = new Function('clamp', `${segSrc}; return segDist;`)(clamp);
  // eslint-disable-next-line no-new-func
  const blockedAt = new Function('segDist', `${blockedSrc}; return blockedAt;`)(segDist);
  const C = 20;
  const PAD = 34;
  const x0 = WORLD.minX + 60;
  const z0 = WORLD.minZ + 60;
  const nx = Math.floor((WORLD.maxX - WORLD.minX - 120) / C) + 1;
  const nz = Math.floor((WORLD.maxZ - WORLD.minZ - 120) / C) + 1;
  const wx = (i) => x0 + i * C;
  const wz = (j) => z0 + j * C;
  const grassland = !!__game.grassland;
  const reach = (grassland ? __game.grassland.arriveRadius : 160) - 40;
  const free = (i, j) => !blockedAt(obstacles, wx(i), wz(j), PAD);
  const si = clamp(Math.round((train.headPos.x - x0) / C), 0, nx - 1);
  const sj = clamp(Math.round((train.headPos.z - z0) / C), 0, nz - 1);
  const prev = new Int32Array(nx * nz).fill(-1);
  const queue = [sj * nx + si];
  prev[queue[0]] = queue[0];
  let end = -1;
  for (let q = 0; q < queue.length; q++) {
    const cell = queue[q];
    const i = cell % nx;
    const j = (cell - i) / nx;
    if (Math.hypot(wx(i) - goalPos.x, wz(j) - goalPos.z) < reach) { end = cell; break; }
    for (const [di, dj] of [[1, 0], [0, 1], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const next = b * nx + a;
      if (prev[next] !== -1 || !free(a, b)) continue;
      prev[next] = cell;
      queue.push(next);
    }
  }
  if (end < 0) return { ok: false, reason: 'no path' };
  const cells = [];
  for (let c = end; c !== prev[c]; c = prev[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => [wx(c % nx), wz((c - (c % nx)) / nx)]);
  const clear = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 0; s <= len; s += 5) {
      if (blockedAt(obstacles, a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len, PAD - 6)) return false;
    }
    return true;
  };
  const route = [];
  let from = [train.headPos.x, train.headPos.z];
  let k = 0;
  while (k < pts.length) {
    let far = k;
    for (let m = Math.min(pts.length - 1, k + 40); m > k; m--) if (clear(from, pts[m])) { far = m; break; }
    route.push(pts[far]);
    from = pts[far];
    k = far + 1;
  }
  train.clearRoute();
  for (const [x, z] of route.slice(0, 60)) train.addWaypoint(x, z);
  return { ok: true, waypoints: route.length };
}

function probe() {
  const { train, rig, sky, camera, player, quality } = __game;
  const info = sky.renderer.info;
  const bad = [];
  const finite = (label, values) => { for (const v of values) if (!Number.isFinite(v)) { bad.push(label); break; } };
  finite('train.pos', train.pos.toArray());
  finite('train.speed', [train.speed, train.heading, train.eff, train.wear, train.plants]);
  finite('camera.position', camera.position.toArray());
  finite('camera.quaternion', camera.quaternion.toArray());
  finite('camera.projection', camera.projectionMatrix.elements);
  finite('player', [player.x, player.y, ...player.group.position.toArray()]);
  finite('sky', [sky.nightness, sky.duskness, sky.bounceIntensity, ...sky.keyDir.toArray(), sky.renderer.toneMappingExposure]);
  let objects = 0;
  const geoms = new Set();
  const mats = new Set();
  sky.scene.traverse((o) => {
    objects++;
    if (o.geometry) geoms.add(o.geometry);
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    const e = o.matrixWorld.elements;
    for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) { bad.push(`matrixWorld ${o.name || o.type}`); break; }
    if (o.isLight) finite(`light ${o.type}`, [o.intensity, o.color.r, o.color.g, o.color.b]);
  });
  for (const m of mats) {
    if (!m.uniforms) continue;
    for (const [name, u] of Object.entries(m.uniforms)) {
      const v = u.value;
      if (typeof v === 'number') finite(`uniform ${name}`, [v]);
      else if (v && (v.isVector2 || v.isVector3 || v.isVector4 || v.isColor)) finite(`uniform ${name}`, v.toArray());
    }
  }
  return {
    x: train.pos.x, z: train.pos.z, speed: train.speed, blocked: train.blocked, route: train.route.length,
    grassland: !!__game.grassland, mode: rig.mode, busy: rig.busy,
    card: !document.getElementById('card').classList.contains('hidden'),
    cardKind: document.getElementById('card').className,
    night: sky.nightness, tier: quality.tier,
    calls: info.render.calls, triangles: info.render.triangles,
    geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs.length,
    sceneObjects: objects, sceneGeometries: geoms.size, sceneMaterials: mats.size,
    heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
    frame: info.render.frame, ema: quality.metrics.emaFrameMs, bad,
  };
}

function worldHash(which) {
  const scene = __game.sky.scene;
  const rootObj = which === 'grassland' ? __game.grassland.root : scene;
  rootObj.updateMatrixWorld(true);
  const fnv = () => {
    let h = 2166136261;
    return { add(v) { h ^= v | 0; h = Math.imul(h, 16777619); }, get value() { return (h >>> 0).toString(16); } };
  };
  const geo = fnv();
  const layout = fnv();
  let objects = 0;
  let instances = 0;
  let vertices = 0;
  const perChild = {};
  const visit = (o, top) => {
    objects++;
    const own = perChild[top] ||= fnv();
    for (const v of [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()]) { layout.add(Math.round(v * 1000)); own.add(Math.round(v * 1000)); }
    if (o.geometry) {
      for (const [name, attr] of Object.entries(o.geometry.attributes)) {
        if (attr.usage === 35048) continue;
        const a = attr.array;
        geo.add(name.length + a.length);
        own.add(a.length);
        if (name === 'position') vertices += attr.count;
        for (let i = 0; i < a.length; i += 3) { const q = Math.round(a[i] * 1000); geo.add(q); own.add(q); }
      }
    }
    if (o.isInstancedMesh) {
      instances += o.count;
      const a = o.instanceMatrix.array;
      for (let i = 0; i < o.count * 16; i++) { const q = Math.round(a[i] * 1000); geo.add(q); own.add(q); }
      if (o.instanceColor) for (let i = 0; i < o.count * 3; i++) { const q = Math.round(o.instanceColor.array[i] * 1000); geo.add(q); own.add(q); }
    }
  };
  rootObj.children.forEach((child, index) => child.traverse((o) => visit(o, `${index}:${child.type}`)));
  return {
    geo: geo.value, layout: layout.value, objects, instances, vertices,
    children: Object.fromEntries(Object.entries(perChild).map(([k, v]) => [k, v.value])),
  };
}

// ------------------------------------------------------------------ modes
async function open(browser, baseUrl, { tier, view, sink, search = {} }) {
  const v = VIEWS[view];
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.touch ? 3 : 1, hasTouch: v.touch, isMobile: v.touch,
    serviceWorkers: mode === 'offline' || args.built ? 'allow' : 'block', locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  watch(page, sink, new URL(baseUrl).origin);
  const url = new URL(baseUrl);
  if (tier) url.searchParams.set('quality', tier);
  for (const [k, val] of Object.entries(search)) url.searchParams.set(k, val);
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__game?.sky?.renderer);
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

async function start(page) {
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => __game.state.started);
}

async function collisionSources() {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(root, 'src/collision.js'), 'utf8');
  const cut = (name) => {
    const at = src.indexOf(`function ${name}(`);
    let depth = 0;
    for (let i = src.indexOf('{', at); i < src.length; i++) {
      if (src[i] === '{') depth++;
      if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
    }
    throw new Error(`cannot cut ${name}`);
  };
  return { segSrc: cut('segDist'), blockedSrc: `${cut('angleInWindow')}\n${cut('blockedAt')}` };
}

const STATION = {
  engine: { x: -0.8, level: 'deck', y: 1.78 },
  plants: { x: -12.4, level: 'deck', y: 1.78 },
  reading: { x: -20.2, level: 'deck', y: 1.78 },
  cab: { x: 20.5, level: 'roof', y: 5.05 },
};
const place = (page, at) => page.evaluate((s) => {
  const { player, rig } = __game;
  if (rig.busy || rig.mode === 'map' || rig.mode === 'book') return false;
  player.stand();
  Object.assign(player, { x: s.x, y: s.y, level: s.level, climbing: false, climbTarget: null });
  return true;
}, STATION[at]);

// One beat of play per call, cycling through every view and station.
async function exercise(page, beat) {
  const idle = await page.evaluate(() => !__game.rig.busy && !document.getElementById('card').classList.contains('hidden') === false);
  if (!idle) return 'busy';
  const step = beat % 6;
  if (step === 0) {
    if (!(await place(page, 'engine'))) return 'skip';
    await page.keyboard.down('KeyE');
    await sleep(1500);
    await page.keyboard.up('KeyE');
    return 'tend';
  }
  if (step === 1) {
    if (!(await place(page, 'reading'))) return 'skip';
    await sleep(300);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => __game.rig.mode === 'book' && !__game.rig.busy, null, { timeout: 15000 }).catch(() => {});
    await page.keyboard.press('KeyO');
    await sleep(2500);
    await page.evaluate(() => { if (__game.rig.mode === 'book' && !__game.rig.busy) { __game.player.stand(); __game.rig.exitBook(); } });
    await page.waitForFunction(() => __game.rig.mode !== 'book' && !__game.rig.busy, null, { timeout: 15000 }).catch(() => {});
    return 'book';
  }
  if (step === 2) {
    if (!(await place(page, 'cab'))) return 'skip';
    await page.waitForFunction(() => __game.rig.mode === 'cabin' && !__game.rig.busy && !__game.rig.soft, null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => { if (__game.rig.mode === 'cabin') __game.rig.enterMap(); });
    await page.waitForFunction(() => __game.rig.mode === 'map' && !__game.rig.busy, null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => { __game.rig.zoomMap(1.6); __game.rig.panMap(40, -30, innerHeight); });
    await sleep(1500);
    await page.evaluate(() => { if (__game.rig.mode === 'map' && !__game.rig.busy) __game.rig.exitMap(); });
    await page.waitForFunction(() => __game.rig.mode !== 'map' && !__game.rig.busy, null, { timeout: 15000 }).catch(() => {});
    return 'map';
  }
  if (step === 3) {
    if (!(await place(page, 'plants'))) return 'skip';
    await page.keyboard.down('KeyE');
    await sleep(1200);
    await page.keyboard.up('KeyE');
    return 'water';
  }
  if (step === 4) {
    await place(page, 'engine');
    await page.keyboard.down('ArrowLeft');
    await sleep(1800);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.down('ArrowUp');
    await sleep(1500);
    await page.keyboard.up('ArrowUp');
    return 'walk';
  }
  await sleep(1500);
  return 'ride';
}

async function journey(browser, baseUrl, tier, view) {
  const sink = [];
  const { context, page } = await open(browser, baseUrl, { tier, view, sink, search: { ts } });
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const gc = () => cdp.send('HeapProfiler.collectGarbage');
  const sources = await collisionSources();
  await start(page);
  const samples = [];
  const marks = {};
  const mark = async (name) => { await gc(); marks[name] = await page.evaluate(probe); };
  const log = [];
  let plan = await page.evaluate(planRoute, sources);
  log.push(`plan prairie: ${JSON.stringify(plan)}`);
  await mark('start');
  const began = Date.now();
  let beat = 0;
  let replans = 0;
  let last = { x: -1e9, at: Date.now() };
  let stage = 'prairie';
  let done = false;
  const bad = new Set();
  while (!done && Date.now() - began < 600000) {
    const did = await exercise(page, beat++);
    const s = await page.evaluate(probe);
    s.t = (Date.now() - began) / 1000;
    s.did = did;
    samples.push(s);
    for (const b of s.bad) bad.add(b);
    if (Math.abs(s.x - last.x) > 2) last = { x: s.x, at: Date.now() };
    if (stage === 'prairie' && s.grassland) {
      stage = 'grassland';
      await mark('grasslandBuilt');
      await page.keyboard.press('Space');
      await sleep(800);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.getElementById('card').classList.contains('hidden'), null, { timeout: 20000 });
      plan = await page.evaluate(planRoute, sources);
      log.push(`plan grassland: ${JSON.stringify(plan)}`);
      continue;
    }
    if (stage === 'grassland' && s.card) {
      await mark('end');
      done = true;
      break;
    }
    if (!s.card && (s.blocked || (s.route === 0 && s.speed < 0.05)) && s.mode !== 'map') {
      if (++replans > 25) { log.push('gave up: too many replans'); break; }
      plan = await page.evaluate(planRoute, sources);
      log.push(`replan at x=${s.x.toFixed(0)} z=${s.z.toFixed(0)} blocked=${s.blocked}: ${JSON.stringify(plan)}`);
    }
    if (Date.now() - last.at > 60000) { log.push(`stuck at x=${s.x.toFixed(0)} z=${s.z.toFixed(0)}`); break; }
  }
  const seconds = (Date.now() - began) / 1000;
  const first = marks.start;
  const end = marks.end || samples[samples.length - 1];
  const peak = (key) => Math.max(...samples.map((s) => s[key]));
  const result = {
    tier, view, ts, completed: done, seconds: Number(seconds.toFixed(1)),
    gameSeconds: Math.round(seconds * ts), frames: end.frame - first.frame,
    fps: Number(((end.frame - first.frame) / seconds).toFixed(1)),
    replans, log, problems: sink, nan: [...bad],
    heapMB: Object.fromEntries(Object.entries(marks).map(([k, m]) => [k, Number((m.heap / 1048576).toFixed(1))])),
    gpu: Object.fromEntries(Object.entries(marks).map(([k, m]) => [k, {
      geometries: m.geometries, textures: m.textures, programs: m.programs,
      sceneGeometries: m.sceneGeometries, sceneObjects: m.sceneObjects,
    }])),
    peak: { calls: peak('calls'), triangles: peak('triangles'), geometries: peak('geometries'), textures: peak('textures'), programs: peak('programs'), heapMB: Number((peak('heap') / 1048576).toFixed(1)) },
    tierHeld: samples.every((s) => s.tier === tier),
    samples,
  };
  await context.close();
  return result;
}

async function determinism(browser, baseUrl, tier) {
  const runs = [];
  for (let i = 0; i < 2; i++) {
    const sink = [];
    const { context, page } = await open(browser, baseUrl, { tier, view: views[0], sink, search: { ts: i === 0 ? 1 : 7 } });
    await sleep(i * 700);
    const prairie = await page.evaluate(worldHash, 'scene');
    await start(page);
    await page.evaluate(() => __game.driveToTree());
    await page.waitForFunction(() => !!__game.grassland, null, { timeout: 120000 });
    const grassland = await page.evaluate(worldHash, 'grassland');
    const obstacles = await page.evaluate(() => JSON.stringify(__game.obstacles).length + ':' + __game.obstacles.length);
    runs.push({ prairie, grassland, obstacles, problems: sink });
    await context.close();
  }
  const [a, b] = runs;
  const diff = (x, y) => Object.keys(x.children).filter((k) => x.children[k] !== y.children[k]);
  return {
    tier,
    prairie: { same: a.prairie.geo === b.prairie.geo, geo: [a.prairie.geo, b.prairie.geo], objects: a.prairie.objects, instances: a.prairie.instances, vertices: a.prairie.vertices, differingChildren: diff(a.prairie, b.prairie) },
    grassland: { same: a.grassland.geo === b.grassland.geo && a.grassland.layout === b.grassland.layout, geo: [a.grassland.geo, b.grassland.geo], layout: [a.grassland.layout, b.grassland.layout], objects: a.grassland.objects, instances: a.grassland.instances, vertices: a.grassland.vertices, differingChildren: diff(a.grassland, b.grassland) },
    obstacles: { same: a.obstacles === b.obstacles, value: a.obstacles },
    problems: [...a.problems, ...b.problems],
  };
}

async function alloc(browser, baseUrl, tier, view) {
  const sink = [];
  const { context, page } = await open(browser, baseUrl, { tier, view, sink, search: { ts: 4 } });
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const sources = await collisionSources();
  await start(page);
  await page.evaluate(planRoute, sources);
  const out = {};
  const stages = [
    ['driving-inhabit', async () => { await place(page, 'engine'); }],
    ['driving-book', async () => {
      await place(page, 'reading');
      await sleep(300);
      await page.keyboard.press('KeyE');
      await page.waitForFunction(() => __game.rig.mode === 'book' && !__game.rig.busy, null, { timeout: 15000 });
    }],
    ['map', async () => {
      await page.evaluate(() => { __game.player.stand(); __game.rig.exitBook(); });
      await page.waitForFunction(() => __game.rig.mode === 'inhabit' && !__game.rig.busy, null, { timeout: 15000 });
      await place(page, 'cab');
      await page.waitForFunction(() => __game.rig.mode === 'cabin' && !__game.rig.busy && !__game.rig.soft, null, { timeout: 15000 });
      await page.evaluate(() => __game.rig.enterMap());
      await page.waitForFunction(() => __game.rig.mode === 'map' && !__game.rig.busy, null, { timeout: 15000 });
    }],
  ];
  for (const [name, enter] of stages) {
    await enter();
    await sleep(1500);
    await cdp.send('HeapProfiler.collectGarbage');
    await page.evaluate(() => { window.__raf = 0; const f = () => { window.__raf++; requestAnimationFrame(f); }; if (!window.__rafOn) { window.__rafOn = true; requestAnimationFrame(f); } });
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    await sleep(8000);
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    const frames = await page.evaluate(() => window.__raf);
    const by = new Map();
    let total = 0;
    const walk = (node) => {
      if (node.selfSize) {
        const f = node.callFrame;
        const file = f.url.replace(/^.*\/landtrain\//, '').replace(/\?.*$/, '');
        const key = `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`;
        by.set(key, (by.get(key) || 0) + node.selfSize);
        total += node.selfSize;
      }
      for (const child of node.children || []) walk(child);
    };
    walk(profile.head);
    out[name] = {
      frames, bytesPerFrame: Math.round(total / frames),
      top: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => `${Math.round(v / frames)} B/frame  ${k}`),
    };
  }
  await context.close();
  return { tier, view, problems: sink, stages: out };
}

async function offline(browser, baseUrl) {
  const sink = [];
  const { context, page } = await open(browser, baseUrl, { tier: null, view: 'portrait', sink });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => caches.keys().then((k) => k.length > 0));
  await sleep(500);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const out = [];
    for (const n of names) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
    return { names, files: out.sort() };
  });
  const onDisk = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), `${rel}${e.name}/`);
      else if (e.name !== 'sw.js') onDisk.push(`/landtrain/${rel}${e.name}`);
    }
  };
  walk(join(root, 'dist'), '');
  const uncached = onDisk.filter((f) => !cached.files.includes(f));
  await context.setOffline(true);
  const online = sink.length;
  const requests = [];
  page.on('response', (r) => requests.push({ url: new URL(r.url()).pathname, sw: r.fromServiceWorker(), status: r.status() }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!document.getElementById('hud').children.length && !!document.querySelector('#card:not(.hidden)'), null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].map((f) => `${f.family} ${f.style} ${f.status}`));
  await page.keyboard.press('Enter');
  await sleep(4000);
  const alive = await page.evaluate(() => {
    const c = document.getElementById('scene');
    return { hud: document.getElementById('hud').children.length, cardHidden: document.getElementById('card').classList.contains('hidden'), w: c.width, h: c.height, controlled: !!navigator.serviceWorker.controller };
  });
  await context.close();
  return {
    cacheNames: cached.names, cachedFiles: cached.files, distFiles: onDisk.sort(), uncached,
    offlineReload: { requests, fonts, alive, problemsWhileOffline: sink.slice(online) }, problems: sink,
  };
}

async function main() {
  const baseUrl = typeof args.url === 'string' ? args.url : await startVite(mode === 'offline' || !!args.built);
  const browser = await chromium.launch({
    executablePath: findChrome(), headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--force-color-profile=srgb', '--enable-precise-memory-info'],
  });
  const results = [];
  try {
    if (mode === 'journey') {
      const runs = tiers.flatMap((tier) => views.map((view) => [tier, view]));
      const width = Number(args.parallel || 2);
      for (let i = 0; i < runs.length; i += width) {
        const batch = await Promise.all(runs.slice(i, i + width).map(([tier, view]) => journey(browser, baseUrl, tier, view)));
        for (const r of batch) {
          results.push(r);
          console.log(`${r.tier.padEnd(6)} ${r.view.padEnd(9)} ${r.completed ? 'arrived' : 'DID NOT ARRIVE'}  ${r.seconds}s real / ${r.gameSeconds}s game  ${r.fps} fps  problems ${r.problems.length}  nan ${r.nan.length}  heap ${JSON.stringify(r.heapMB)}  peak ${JSON.stringify(r.peak)}`);
          for (const line of r.log) console.log(`    ${line}`);
          for (const [k, g] of Object.entries(r.gpu)) console.log(`    ${k}: ${JSON.stringify(g)}`);
          for (const p of r.problems.slice(0, 12)) console.log(`    ! ${p.type}: ${p.message}`);
          for (const n of r.nan) console.log(`    ! non-finite: ${n}`);
        }
      }
    } else if (mode === 'determinism') {
      for (const tier of tiers) {
        const r = await determinism(browser, baseUrl, tier);
        results.push(r);
        console.log(JSON.stringify(r, null, 1));
      }
    } else if (mode === 'alloc') {
      for (const tier of tiers) for (const view of views) {
        const r = await alloc(browser, baseUrl, tier, view);
        results.push(r);
        console.log(`${tier} ${view}  problems ${r.problems.length}`);
        for (const [name, s] of Object.entries(r.stages)) {
          console.log(`  ${name}: ${s.bytesPerFrame} B/frame over ${s.frames} frames`);
          for (const line of s.top) console.log(`      ${line}`);
        }
      }
    } else if (mode === 'offline') {
      const r = await offline(browser, baseUrl);
      results.push(r);
      console.log(JSON.stringify(r, null, 1));
    }
  } finally {
    if (typeof args.out === 'string') {
      mkdirSync(dirname(resolve(args.out)), { recursive: true });
      writeFileSync(resolve(args.out), JSON.stringify(results, null, 1) + '\n');
    }
    await browser.close();
    stopServers();
  }
  const failed = results.some((r) => (r.problems?.length ?? 0) > 0 || (r.nan?.length ?? 0) > 0 || r.completed === false
    || r.prairie?.same === false || r.grassland?.same === false || (r.uncached?.length ?? 0) > 0);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  stopServers();
  process.exit(1);
});
