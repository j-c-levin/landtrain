import { MeshBasicMaterial } from 'three';
import { setPixelRatioOverride } from './atmosphere/renderer.js';

const HIDDEN_LAYER = 31;

const setLayer = (root, on) => root?.traverse((o) => o.layers.set(on ? 0 : HIDDEN_LAYER));

function buildToggles({ renderer, scene, sunLight, bounceLight, sky, train, player, world, shroud, journey }) {
  const saved = {};
  const subtree = (roots) => (off) => { for (const root of roots()) setLayer(root, !off); };
  const each = (pick) => (off) => scene.traverse((o) => { if (pick(o)) o.layers.set(off ? HIDDEN_LAYER : 0); });
  const transparent = (o) => {
    const m = o.material;
    return !!m && (Array.isArray(m) ? m.some((x) => x.transparent) : m.transparent);
  };
  const keyOf = (o) => (o.isMesh && !Array.isArray(o.material) && o.material.customProgramCacheKey?.()) || '';
  return {
    shadows: (off) => { sunLight.castShadow = !off; },
    bounce: subtree(() => [bounceLight]),
    fill: subtree(() => [bounceLight.userData.fill]),
    points: each((o) => o.isPointLight || o.isSpotLight),
    hemi: subtree(() => [sky.hemi]),
    env: (off) => {
      if (off) {
        saved.env ??= scene.environment;
        scene.environment = null;
      } else if (saved.env) scene.environment = saved.env;
    },
    interiors: (off) => { for (const mesh of train.tucked) mesh.layers.set(off ? HIDDEN_LAYER : 0); },
    interiorShadows: (off) => {
      saved.casters ??= train.roomCasters.flat();
      for (const mesh of saved.casters) mesh.castShadow = !off;
    },
    trainShadows: (off) => {
      saved.trainCasters ??= train.cars.flatMap((car) => {
        const casters = [];
        car.group.traverse((o) => { if (o.castShadow && !o.isLight) casters.push(o); });
        return casters;
      });
      for (const mesh of saved.trainCasters) mesh.castShadow = !off;
    },
    shading: (off) => {
      saved.flat ??= new MeshBasicMaterial({ color: 0x8a8f86 });
      scene.overrideMaterial = off ? saved.flat : null;
    },
    train: subtree(() => train.cars.map((car) => car.group)),
    figure: subtree(() => [player.group]),
    cover: subtree(() => [world.cover.group, journey.grassland?.cover.group]),
    scenery: (off) => {
      for (const land of [world, journey.grassland]) {
        if (!land) continue;
        const cover = new Set();
        land.cover.group.traverse((o) => cover.add(o));
        land.root.traverse((o) => {
          if (!cover.has(o) && (o.castShadow || !o.receiveShadow)) o.layers.set(off ? HIDDEN_LAYER : 0);
        });
      }
    },
    ground: each((o) => keyOf(o).startsWith('flock')),
    water: each((o) => keyOf(o).startsWith('water')),
    smoke: subtree(() => train.smoke.map((puff) => puff.sprite)),
    sky: subtree(() => [sky.rig, sky.fireflies]),
    shroud: subtree(() => [shroud.mesh]),
    transparent: each(transparent),
    overlays: (off) => {
      for (const id of ['vignette', 'nightfall', 'grain']) {
        const el = document.getElementById(id);
        if (el) el.style.display = off ? 'none' : '';
      }
    },
    tonemap: (off) => {
      saved.tone ??= renderer.toneMapping;
      renderer.toneMapping = off ? 0 : saved.tone;
    },
  };
}

function countLights(scene) {
  const n = { dir: 0, point: 0, spot: 0, hemi: 0, shadowed: 0 };
  scene.traverseVisible((o) => {
    if (!o.isLight || !o.layers.test({ mask: 1 })) return;
    if (o.isDirectionalLight) n.dir++;
    else if (o.isPointLight) n.point++;
    else if (o.isSpotLight) n.spot++;
    else if (o.isHemisphereLight) n.hemi++;
    if (o.castShadow) n.shadowed++;
  });
  return n;
}

function createPanel() {
  const el = document.createElement('pre');
  el.id = 'perf';
  el.style.cssText = [
    'position:fixed', 'left:calc(env(safe-area-inset-left, 0px) + 6px)', 'top:calc(env(safe-area-inset-top, 0px) + 104px)',
    'margin:0', 'padding:5px 7px', 'z-index:9999', 'pointer-events:none', 'white-space:pre',
    'font:10px/1.35 ui-monospace,Menlo,Consolas,monospace', 'color:#e9f2e4', 'background:rgba(12,16,14,0.72)',
    'border-radius:5px', 'font-variant-numeric:tabular-nums',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

const k = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// ?perf=1 shows the panel; ?perf=bench keeps the counters and hooks without it.
export function createPerf({ params, handles, tier }) {
  const mode = params.get('perf');
  if (!mode || mode === '0') return null;
  const { renderer, scene } = handles;
  const info = renderer.info;

  // three resets its counters after the shadow pass, so the two are tallied apart
  const total = { calls: 0, triangles: 0, points: 0, lines: 0 };
  const draw = renderer.render;
  renderer.render = function (...args) {
    draw.apply(this, args);
    for (const key in total) total[key] += info.render[key];
  };
  const shadow = { calls: 0, triangles: 0 };
  const castShadows = renderer.shadowMap.render;
  renderer.shadowMap.render = function (...args) {
    const calls = info.render.calls;
    const triangles = info.render.triangles;
    castShadows.apply(this, args);
    shadow.calls += info.render.calls - calls;
    shadow.triangles += info.render.triangles - triangles;
  };

  const toggles = { active: new Set() };
  const table = buildToggles(handles);
  const setOff = (names) => {
    const want = new Set(names);
    for (const name of toggles.active) if (!want.has(name)) table[name]?.(false);
    toggles.active = want;
    for (const name of want) {
      if (!table[name]) throw new Error(`unknown perf toggle "${name}" (have: ${Object.keys(table).join(', ')})`);
      table[name](true);
    }
  };

  const pr = parseFloat(params.get('pr'));
  if (pr > 0) setPixelRatioOverride(pr);
  let pendingOff = (params.get('off') || '').split(',').map((s) => s.trim()).filter(Boolean);

  const panel = mode === 'bench' ? null : createPanel();
  const frames = [];
  let jsStart = 0;
  let jsSum = 0;
  let jsCount = 0;
  let lastPaint = 0;
  let lastStamp = 0;
  const stats = {
    fps: 0, frameMs: 0, worstMs: 0, jsMs: 0,
    calls: 0, triangles: 0, shadowCalls: 0, shadowTriangles: 0, points: 0, lines: 0,
    programs: 0, geometries: 0, textures: 0,
    lights: countLights(scene),
    tier: tier(), dpr: window.devicePixelRatio, pixelRatio: renderer.getPixelRatio(), width: 0, height: 0,
    frame: 0,
  };
  const pixel = new Uint8Array(4);

  function paint() {
    const t = tier();
    const L = stats.lights;
    const mp = (stats.width * stats.height) / 1e6;
    panel.textContent = [
      `${stats.fps.toFixed(0)} fps  ${stats.frameMs.toFixed(1)} avg  ${stats.worstMs.toFixed(1)} worst ms`,
      `js ${stats.jsMs.toFixed(1)} ms   ${t.tier}${t.forced ? ' (forced)' : ''}`,
      `dpr ${stats.dpr} -> ${stats.pixelRatio.toFixed(2)}   ${stats.width}x${stats.height}  ${mp.toFixed(2)} Mpx`,
      `draw ${stats.calls} + ${stats.shadowCalls} shadow`,
      `tris ${k(stats.triangles)} + ${k(stats.shadowTriangles)} shadow`,
      `prog ${stats.programs}  lights ${L.dir}d ${L.point}p ${L.spot}s ${L.hemi}h`,
      toggles.active.size ? `off ${[...toggles.active].join(',')}` : '',
    ].filter(Boolean).join('\n');
  }

  return {
    stats,
    scene,
    renderer,
    handles,
    fixedDt: params.has('dt') ? parseFloat(params.get('dt')) || 0 : null,
    sync: false,
    record: null,
    toggles: Object.keys(table),
    off: setOff,
    setPixelRatio: setPixelRatioOverride,
    begin() {
      jsStart = performance.now();
    },
    end(stamp) {
      const js = performance.now() - jsStart;
      jsSum += js;
      jsCount++;
      let synced = js;
      if (this.sync) {
        const gl = renderer.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        synced = performance.now() - jsStart;
      }
      if (lastStamp) {
        frames.push(stamp - lastStamp);
        this.record?.push([stamp - lastStamp, js, synced]);
      }
      lastStamp = stamp;
      stats.frame++;
      Object.assign(stats, total);
      stats.shadowCalls = shadow.calls;
      stats.shadowTriangles = shadow.triangles;
      for (const key in total) total[key] = 0;
      shadow.calls = 0;
      shadow.triangles = 0;
      if (pendingOff && stats.frame > 2) {
        setOff(pendingOff);
        pendingOff = null;
      }
      if (stamp - lastPaint < 1000) return;
      lastPaint = stamp;
      const recent = frames.splice(0);
      if (recent.length) {
        const sum = recent.reduce((a, b) => a + b, 0);
        stats.frameMs = sum / recent.length;
        stats.worstMs = Math.max(...recent);
        stats.fps = 1000 / stats.frameMs;
      }
      stats.jsMs = jsSum / Math.max(1, jsCount);
      jsSum = 0;
      jsCount = 0;
      stats.programs = info.programs.length;
      stats.geometries = info.memory.geometries;
      stats.textures = info.memory.textures;
      stats.lights = countLights(scene);
      stats.tier = tier();
      stats.dpr = window.devicePixelRatio;
      stats.pixelRatio = renderer.getPixelRatio();
      stats.width = renderer.domElement.width;
      stats.height = renderer.domElement.height;
      if (panel) paint();
    },
  };
}
