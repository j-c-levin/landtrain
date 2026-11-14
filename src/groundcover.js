import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { floraMaterials, jitterHSL, getLookTier } from './look.js';
import { mulberry } from './prng.js';

// Ground cover that sells the scale: instanced tufts, pebbles, flowers and
// shrubs laid out once inside a square tile, then wrapped around a moving
// centre in the vertex shader. A given world position always shows the same
// instance, so the cover is deterministic without storing a world's worth of it.

// *Cells: each layer is cut into an n-by-n grid so whole cells can be skipped
// when they sit outside the lens, the wrap disc, or (for shadows) the key light's box.
const TIERS = {
  high: { microTile: 56, micro: 7000, microCells: 5, fineTile: 170, tufts: 10000, flowers: 1500, pebbles: 1500, fineCells: 8, midTile: 880, tussocks: 4200, shrubs: 1700, stones: 700, midCells: 9, shadows: true },
  medium: { microTile: 48, micro: 3600, microCells: 4, fineTile: 130, tufts: 5200, flowers: 800, pebbles: 700, fineCells: 5, midTile: 700, tussocks: 2400, shrubs: 1100, stones: 400, midCells: 7, shadows: false },
  low: { microTile: 40, micro: 1800, microCells: 3, fineTile: 96, tufts: 2200, flowers: 360, pebbles: 300, fineCells: 4, midTile: 520, tussocks: 1000, shrubs: 520, stones: 200, midCells: 6, shadows: false },
};

// lens height above which a layer is too small to resolve (the overhead map)
const MICRO_CEILING = 45;
const FINE_CEILING = 95;
// shrubs further than this from the lens drop to their coarse shape
const COARSE_FROM = 140;

const SHADOW_REACH = 72;

// below this viewport height the small layers thin out: their blades are under a pixel wide
const RESOLVE_HEIGHT = 720;
const RESOLVE_FLOOR = 0.55;
let viewportHeight = RESOLVE_HEIGHT;

export function setCoverViewport(height) {
  viewportHeight = height;
}

function bladeFan(rand, blades, height, spread, width) {
  const pos = [];
  const col = [];
  const nor = [];
  const idx = [];
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rand() * 0.9;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const h = height * (0.55 + rand() * 0.6);
    const lean = spread * (0.35 + rand() * 0.8);
    const w = width * (0.7 + rand() * 0.6);
    const r0 = rand() * width * 1.4;
    const base = pos.length / 3;
    const ring = [
      [r0, 0, w, 0.5],
      [r0 + lean * h * 0.3, h * 0.55, w * 0.7, 0.82],
    ];
    for (const [out, y, half, shade] of ring) {
      for (const side of [-1, 1]) {
        pos.push(dx * out - dz * half * side, y, dz * out + dx * half * side);
        col.push(shade, shade, shade * 0.92);
      }
    }
    pos.push(dx * (r0 + lean * h), h, dz * (r0 + lean * h));
    col.push(1.05, 1.03, 0.9);
    for (let i = 0; i < 5; i++) nor.push(dx * 0.3, 0.95, dz * 0.3);
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

// Shade a blob's vertices root-dark to crown-light, like drybrushed clump foliage.
export function shadeByHeight(geo, lo, hi) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / Math.max(1e-5, max.y - min.y);
    const v = lo + (hi - lo) * t;
    col[i * 3] = v;
    col[i * 3 + 1] = v;
    col[i * 3 + 2] = v * 0.94;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Clump foliage: a few lumpy puffs welded into one soft-shaded shrub. Every
// requested detail level is built from the same draws, so they share a shape.
function blobCluster(rand, n, details) {
  const parts = details.map(() => []);
  for (let i = 0; i < n; i++) {
    const a1 = rand() * 9;
    const a2 = rand() * 9;
    const s = i === 0 ? 1 : 0.45 + rand() * 0.35;
    const a = rand() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.65 + rand() * 0.4;
    const turn = rand() * Math.PI;
    const squash = 0.7 + rand() * 0.25;
    details.forEach((detail, level) => {
      const g = new THREE.IcosahedronGeometry(1, detail);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v);
        const y = p.getY(v);
        const z = p.getZ(v);
        const k = 0.78 + 0.2 * Math.sin(x * 4.1 + a1) * Math.sin(z * 3.7 + a2) + 0.16 * Math.sin(y * 5.3 + a1 + a2);
        p.setXYZ(v, x * k, Math.max(y, -0.35) * k, z * k);
      }
      g.rotateY(turn);
      g.scale(s, s * squash, s);
      g.translate(Math.cos(a) * d, s * 0.3, Math.sin(a) * d);
      parts[level].push(g);
    });
  }
  return parts.map((group) => {
    const joined = mergeGeometries(group);
    for (const g of group) g.dispose();
    // weld the facets so the clump shades as one soft tuft of foliage
    joined.deleteAttribute('normal');
    joined.deleteAttribute('uv');
    const merged = mergeVertices(joined, 1e-3);
    joined.dispose();
    merged.computeVertexNormals();
    return shadeByHeight(merged, 0.5, 1.14);
  });
}

function pebbleGeometry(rand) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.78 + 0.44 * Math.abs(Math.sin(p.getX(i) * 12.9 + p.getY(i) * 78.2 + p.getZ(i) * 37.7 + rand()));
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.6, p.getZ(i) * k);
  }
  g.translate(0, 0.22, 0);
  g.computeVertexNormals();
  return shadeByHeight(g, 0.62, 1.05);
}

function flowerGeometry(rand) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const d = 0.04 + rand() * 0.16;
    const h = 0.1 + rand() * 0.16;
    const head = new THREE.OctahedronGeometry(0.038 + rand() * 0.02, 0);
    head.translate(Math.cos(a) * d, h, Math.sin(a) * d);
    const hc = new Float32Array(head.attributes.position.count * 3).fill(1.15);
    head.setAttribute('color', new THREE.BufferAttribute(hc, 3));
    parts.push(head);
  }
  const leaves = bladeFan(rand, 4, 0.16, 0.9, 0.03);
  const lc = leaves.attributes.color;
  for (let v = 0; v < lc.count; v++) lc.setXYZ(v, 0.14, 0.3, 0.08);
  const flat = leaves.toNonIndexed();
  leaves.dispose();
  flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
  parts.push(flat);
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  merged.computeVertexNormals();
  return merged;
}

const WRAP_PARS = /* glsl */ `
  uniform vec2 uCoverCentre;
  uniform float uCoverTile;
  uniform vec2 uCoverClipX;
  uniform sampler2D uCoverMask;
  uniform vec4 uCoverMaskRect;
  uniform float uCoverTime;
  uniform float uCoverSway;
  uniform vec4 uCoverTrain;
  uniform vec3 uCoverClear;
  uniform vec2 uCoverEye;
  uniform float uCoverRegion;
  uniform vec4 uCoverBias;
  uniform vec2 uCoverLive;
  uniform vec3 uCoverLush;
  uniform vec3 uCoverParched;
  uniform vec3 uCoverBare;
  uniform vec3 uCoverGust;
  vec3 coverWorld;
`;

const WRAP_PROJECT = /* glsl */ `
  {
    vec4 local = instanceMatrix * vec4(transformed, 1.0);
    vec2 origin = instanceMatrix[3].xz;
    float halfTile = uCoverTile * 0.5;
    vec2 rel = mod(origin - uCoverCentre + halfTile, uCoverTile) - halfTile;
    vec2 world = uCoverCentre + rel;
    float keep = 1.0 - smoothstep(0.78 * halfTile, 0.98 * halfTile, length(rel));
    keep *= step(uCoverClipX.x, world.x) * step(world.x, uCoverClipX.y);
    vec4 region = texture2D(uCoverMask, (world - uCoverMaskRect.xy) * uCoverMaskRect.zw);
    keep *= smoothstep(0.35, 0.65, region.r);
    // region maps (opt-in): g lushness, b bare earth, a sand thin, grow and tint the cover
    float pick = fract(sin(dot(origin, vec2(12.9898, 78.233))) * 43758.5453);
    float want = uCoverBias.x + uCoverBias.y * (region.g * 2.0 - 1.0) + uCoverBias.z * region.b - uCoverBias.w * region.a;
    keep *= mix(1.0, step(pick, want), uCoverRegion);
    float grow = 1.0 + uCoverRegion * uCoverLive.x * (region.g * 2.0 - 1.0);
    // nothing grows through the train, and nothing looms against the lens
    vec2 ta = uCoverTrain.xy;
    vec2 tb = uCoverTrain.zw;
    vec2 seg = tb - ta;
    float along = clamp(dot(world - ta, seg) / max(dot(seg, seg), 1e-4), 0.0, 1.0);
    float off = length(world - ta - seg * along);
    keep *= mix(uCoverClear.z, 1.0, smoothstep(uCoverClear.x, uCoverClear.x * 1.6 + 0.5, off));
    keep *= smoothstep(uCoverClear.y * 0.35, uCoverClear.y, length(world - uCoverEye));
    vec3 shape = (local.xyz - vec3(origin.x, 0.0, origin.y)) * grow;
    float bend = shape.y * shape.y * uCoverSway;
    shape.x += sin(uCoverTime * 1.3 + world.x * 0.35 + world.y * 0.27) * bend;
    shape.z += cos(uCoverTime * 1.1 + world.x * 0.21 - world.y * 0.31) * bend * 0.6;
    // gusts (opt-in): fronts roll downwind, leaning the cover and lifting a sheen off its tips
    float gust = 0.0;
    if (uCoverGust.z > 0.0) {
      float front = dot(world, uCoverGust.xy) * 0.042 - uCoverTime * 1.15
        + sin(dot(world, vec2(-uCoverGust.y, uCoverGust.x)) * 0.019 + uCoverTime * 0.2) * 1.8;
      gust = 0.5 + 0.5 * sin(front);
      gust *= gust * (0.6 + 0.4 * sin(front * 0.37 + 1.7));
      shape.xz += uCoverGust.xy * min(bend, shape.y * 0.6) * uCoverGust.z * (0.3 + gust);
      gust *= step(1e-4, uCoverSway) * smoothstep(0.05, 0.5, shape.y);
    }
    #ifdef COVER_TINT
      vec3 tint = mix(uCoverParched, vec3(1.0), smoothstep(0.1, 0.5, region.g));
      tint = mix(tint, uCoverLush, smoothstep(0.5, 0.9, region.g));
      tint = mix(tint, uCoverBare, region.b * 0.8);
      vColor.rgb *= mix(vec3(1.0), tint, uCoverRegion * uCoverLive.y) * (1.0 + gust * 0.22);
    #endif
    coverWorld = vec3(world.x, 0.0, world.y) + shape * keep;
  }
  vec4 mvPosition = viewMatrix * vec4(coverWorld, 1.0);
  gl_Position = projectionMatrix * mvPosition;
`;

function wrapShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${WRAP_PARS}`)
    .replace('#include <project_vertex>', WRAP_PROJECT)
    .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(coverWorld, 1.0);');
}

let whiteMask = null;
function defaultMask() {
  if (!whiteMask) {
    whiteMask = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    whiteMask.needsUpdate = true;
  }
  return whiteMask;
}

// Rasterises `blocked(x, z)` into a mask the cover samples: 1 = may grow here.
export function coverMask({ minX, maxX, minZ, maxZ }, blocked, step = 4) {
  const w = Math.ceil((maxX - minX) / step);
  const h = Math.ceil((maxZ - minZ) / step);
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = blocked(minX + (i + 0.5) * step, minZ + (j + 0.5) * step) ? 0 : 255;
      const o = (j * w + i) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, w, h);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, rect: new THREE.Vector4(minX, minZ, 1 / (w * step), 1 / (h * step)) };
}

const _fwd = new THREE.Vector3();
const _view = new THREE.Matrix4();
const _inverse = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();

// look: { tuft, tussock, bush, stone, flower } HSL specs. clipX: world x-range
// the cover may occupy. mask: optional coverMask() result.
// Opt-in extras: regions { lush, parched, bare, kinds } reads the mask's g/b/a
// channels as a region map; gust { dir, strength } adds rolling wind; extend(ctx)
// adds a biome's own cover types after the standard ones.
export function createGroundCover({ look, seed, clipX, mask = null, regions = null, gust = null, extend = null }) {
  const tier = TIERS[getLookTier()] || TIERS.medium;
  const rand = mulberry(seed);
  const group = new THREE.Group();
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const shared = {
    uCoverClipX: { value: new THREE.Vector2(clipX[0], clipX[1]) },
    uCoverMask: { value: mask ? mask.texture : defaultMask() },
    uCoverMaskRect: { value: mask ? mask.rect : new THREE.Vector4(0, 0, 1, 1) },
    uCoverTime: { value: 0 },
    uCoverTrain: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCoverEye: { value: new THREE.Vector2(1e6, 1e6) },
    uCoverRegion: { value: regions ? 1 : 0 },
    uCoverLush: { value: new THREE.Vector3(...(regions?.lush ?? [1, 1, 1])) },
    uCoverParched: { value: new THREE.Vector3(...(regions?.parched ?? [1, 1, 1])) },
    uCoverBare: { value: new THREE.Vector3(...(regions?.bare ?? [1, 1, 1])) },
    uCoverGust: { value: new THREE.Vector3(gust?.dir[0] ?? 1, gust?.dir[1] ?? 0, gust && !reduced ? gust.strength : 0) },
  };
  const kinds = regions?.kinds ?? {};
  const layers = [];
  const depthMaterials = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // clear: [radius kept clear around the train, radius kept clear around the lens, size left under the train]
  function layer(tile, lead, clear, ceiling = Infinity) {
    const entry = {
      tile, lead, ceiling, centre: { value: new THREE.Vector2() }, clear: { value: new THREE.Vector3(...clear) }, grids: [],
    };
    layers.push(entry);
    return entry;
  }

  const matrix = new THREE.Matrix4();

  // live: { bias: [base, lush, bare, sand] chance an instance grows, grow, tint } under a region map
  function add(entry, n, shapes, material, count, sway, cast, place, live = null) {
    const [geometry, coarse = null] = [shapes].flat();
    const uniforms = {
      ...shared,
      uCoverCentre: entry.centre,
      uCoverTile: { value: entry.tile },
      uCoverClear: entry.clear,
      uCoverSway: { value: reduced ? 0 : sway },
      uCoverBias: { value: new THREE.Vector4(...(live?.bias ?? [1, 0, 0, 0])) },
      uCoverLive: { value: new THREE.Vector2(live?.grow ?? 0, live?.tint ?? 0) },
    };
    material.defines = { ...material.defines, COVER_TINT: '' };
    material.onBeforeCompile = (shader) => wrapShader(shader, uniforms);
    material.customProgramCacheKey = () => 'cover';
    let depth = null;
    if (cast && tier.shadows) {
      depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depth.onBeforeCompile = (shader) => wrapShader(shader, uniforms);
      depth.customProgramCacheKey = () => 'cover-depth';
      depthMaterials.push(depth);
    }
    const size = entry.tile / n;
    geometry.computeBoundingSphere();
    const meshes = new Array(n * n).fill(null);
    entry.grids.push({ n, meshes, geometry, coarse, pad: geometry.boundingSphere.radius * 3.2 });
    const matrices = new Float32Array(count * 16);
    const colors = new Float32Array(count * 3);
    const cellOf = new Uint16Array(count);
    const tally = new Uint32Array(n * n);
    for (let i = 0; i < count; i++) {
      dummy.position.set(rand() * entry.tile, 0, rand() * entry.tile);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      place(dummy, color);
      dummy.updateMatrix();
      dummy.matrix.toArray(matrices, i * 16);
      color.toArray(colors, i * 3);
      const cell = Math.min(n - 1, Math.floor(dummy.position.x / size)) + n * Math.min(n - 1, Math.floor(dummy.position.z / size));
      cellOf[i] = cell;
      tally[cell]++;
    }
    const filled = new Uint32Array(n * n);
    for (let cell = 0; cell < n * n; cell++) {
      if (!tally[cell]) continue;
      const mesh = new THREE.InstancedMesh(geometry, material, tally[cell]);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.userData.fullCount = tally[cell];
      mesh.userData.fine = entry.ceiling < Infinity;
      mesh.userData.casts = !!depth;
      if (depth) mesh.customDepthMaterial = depth;
      meshes[cell] = mesh;
      group.add(mesh);
    }
    for (let i = 0; i < count; i++) {
      const mesh = meshes[cellOf[i]];
      const slot = filled[cellOf[i]]++;
      mesh.setMatrixAt(slot, matrix.fromArray(matrices, i * 16));
      mesh.setColorAt(slot, color.fromArray(colors, i * 3));
    }
  }

  // a carpet of short static grass right where the lens is working
  const micro = layer(tier.microTile, 0.3, [2.6, 3.2, 0.5], MICRO_CEILING);
  add(micro, tier.microCells, bladeFan(rand, 5, 0.3, 0.7, 0.026), floraMaterials.cover({ side: THREE.DoubleSide }), tier.micro, 0.06, false, (o, c) => {
    const s = 0.6 + rand() * 0.9;
    o.scale.set(s, s * (0.6 + rand() * 0.8), s);
    jitterHSL(c, rand, look.tuft);
  }, kinds.micro);

  const fine = layer(tier.fineTile, 0.3, [2.7, 5, 0.45], FINE_CEILING);
  const tuftMat = floraMaterials.cover({ side: THREE.DoubleSide });
  add(fine, tier.fineCells, bladeFan(rand, 6, 0.5, 0.5, 0.032), tuftMat, tier.tufts, 0.09, false, (o, c) => {
    const s = 0.7 + rand() * rand() * 1.3;
    o.scale.set(s, s * (0.7 + rand() * 0.7), s);
    jitterHSL(c, rand, look.tuft);
  }, kinds.tuft);
  add(fine, tier.fineCells - 2, flowerGeometry(rand), floraMaterials.cover(), tier.flowers, 0.12, false, (o, c) => {
    o.scale.setScalar(0.9 + rand() * 1.1);
    const F = look.flower;
    jitterHSL(c, rand, { ...F, h: F.hues[Math.floor(rand() * F.hues.length)] });
  }, kinds.flower);
  add(fine, tier.fineCells - 2, pebbleGeometry(rand), floraMaterials.cover({ flatShading: true }), tier.pebbles, 0, false, (o, c) => {
    const s = 0.07 + rand() * rand() * 0.42;
    o.scale.set(s * (0.8 + rand() * 0.6), s, s * (0.8 + rand() * 0.6));
    jitterHSL(c, rand, look.stone);
  }, kinds.pebble);

  const mid = layer(tier.midTile, 0.36, [7.5, 16, 0]);
  add(mid, tier.midCells, bladeFan(rand, 9, 1.3, 0.6, 0.07), floraMaterials.cover({ side: THREE.DoubleSide }), tier.tussocks, 0.03, false, (o, c) => {
    const s = 0.6 + rand() * 1.2;
    o.scale.set(s, s * (0.7 + rand() * 0.8), s);
    jitterHSL(c, rand, look.tussock);
  }, kinds.tussock);
  add(mid, tier.midCells, blobCluster(rand, 2, getLookTier() === 'low' ? [0] : [1, 0]), floraMaterials.cover(), tier.shrubs, 0, true, (o, c) => {
    const s = 0.7 + rand() * rand() * 2.4;
    o.scale.set(s, s * (0.75 + rand() * 0.4), s);
    jitterHSL(c, rand, look.bush);
  }, kinds.shrub);
  add(mid, 4, pebbleGeometry(rand), floraMaterials.cover({ flatShading: true }), tier.stones, 0, true, (o, c) => {
    const s = 0.4 + rand() * rand() * 1.3;
    o.scale.set(s * (0.8 + rand() * 0.7), s * (0.6 + rand() * 0.5), s * (0.8 + rand() * 0.7));
    jitterHSL(c, rand, look.stone);
  }, kinds.stone);

  extend?.({ micro, fine, mid, layer, add, rand, tier: getLookTier(), cover: floraMaterials.cover });

  // Blade fans are lit as if they always face up, so neither side goes black.
  const litBothSides = (mat) => {
    const inner = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      inner(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')
      );
    };
    mat.customProgramCacheKey = () => 'cover-blades';
  };
  const bladeMats = new Set(group.children.map((mesh) => mesh.material).filter((mat) => mat.side === THREE.DoubleSide));
  for (const mat of bladeMats) litBothSides(mat);

  // A cell's instances wrap around the layer centre, so it can show on either
  // side of the seam: it is drawn if any of its wrapped images is wanted.
  function cull(entry, { n, meshes, geometry, coarse, pad }, clipLo, clipHi, trainPos, eye, shadowReach) {
    const size = entry.tile / n;
    const half = entry.tile / 2;
    const radius = size * 0.7072 + pad;
    const cx = entry.centre.value.x;
    const cz = entry.centre.value.y;
    for (let cell = 0; cell < n * n; cell++) {
      const mesh = meshes[cell];
      if (!mesh) continue;
      const rx = ((((cell % n) + 0.5) * size - cx + half) % entry.tile + entry.tile) % entry.tile - half;
      const rz = (((Math.floor(cell / n) + 0.5) * size - cz + half) % entry.tile + entry.tile) % entry.tile - half;
      let seen = false;
      let shades = false;
      let nearest = Infinity;
      for (let image = 0; image < 4; image++) {
        const ix = image & 1 ? rx - Math.sign(rx || 1) * entry.tile : rx;
        const iz = image & 2 ? rz - Math.sign(rz || 1) * entry.tile : rz;
        if (Math.hypot(ix, iz) > half + radius) continue;
        const wx = cx + ix;
        const wz = cz + iz;
        if (wx + radius < clipLo || wx - radius > clipHi) continue;
        _sphere.center.set(wx, 1, wz);
        _sphere.radius = radius;
        if (!_frustum.intersectsSphere(_sphere)) continue;
        seen = true;
        nearest = Math.min(nearest, Math.hypot(wx - eye.x, wz - eye.z) - radius);
        if (Math.abs(wx - trainPos.x) < shadowReach + radius && Math.abs(wz - trainPos.z) < shadowReach + radius) shades = true;
      }
      mesh.visible = seen;
      mesh.castShadow = shades && mesh.userData.casts;
      if (coarse && seen) mesh.geometry = nearest > COARSE_FROM ? coarse : geometry;
    }
  }

  let density = 1;
  let resolve = 1;
  const applyCounts = () => {
    for (const mesh of group.children) {
      mesh.count = Math.floor(mesh.userData.fullCount * density * (mesh.userData.fine ? resolve : 1));
    }
  };

  return {
    group,
    // The tile centre leads the camera along its gaze so the cover sits where
    // the lens is pointed, not behind it.
    update(time, camera, trainPos, heading) {
      // the other biome's cover is clipped to nothing out here: skip its draws
      group.visible = trainPos.x > clipX[0] - 600 && trainPos.x < clipX[1] + 600;
      if (!group.visible) return;
      const wanted = Math.min(1, Math.max(RESOLVE_FLOOR, viewportHeight / RESOLVE_HEIGHT));
      if (wanted !== resolve) {
        resolve = wanted;
        applyCounts();
      }
      shared.uCoverTime.value = time;
      const hx = Math.cos(heading) * 25;
      const hz = -Math.sin(heading) * 25;
      shared.uCoverTrain.value.set(trainPos.x - hx, trainPos.z - hz, trainPos.x + hx, trainPos.z + hz);
      // the overhead map looks straight down from far away: nothing to keep off the lens
      if (camera.position.y > 60) shared.uCoverEye.value.set(1e6, 1e6);
      else shared.uCoverEye.value.set(camera.position.x, camera.position.z);
      camera.getWorldDirection(_fwd);
      const flat = 1 - Math.abs(_fwd.y);
      camera.updateMatrixWorld();
      _view.multiplyMatrices(camera.projectionMatrix, _inverse.copy(camera.matrixWorld).invert());
      _frustum.setFromProjectionMatrix(_view);
      // the overhead map widens the key light's box to take in the whole view
      const shadowReach = camera.position.y > 60 ? 1e6 : SHADOW_REACH;
      for (const entry of layers) {
        const reach = entry.tile * entry.lead * flat;
        entry.centre.value.set(camera.position.x + _fwd.x * reach, camera.position.z + _fwd.z * reach);
        const resolved = camera.position.y < entry.ceiling;
        for (const grid of entry.grids) {
          if (resolved) cull(entry, grid, clipX[0], clipX[1], trainPos, camera.position, shadowReach);
          else for (const mesh of grid.meshes) if (mesh) mesh.visible = false;
        }
      }
    },
    dispose() {
      for (const depth of depthMaterials) depth.dispose();
      for (const entry of layers) for (const grid of entry.grids) grid.coarse?.dispose();
      if (mask) mask.texture.dispose();
    },
    setDensity(fraction) {
      density = fraction;
      applyCounts();
    },
  };
}
