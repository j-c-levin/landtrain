import * as THREE from 'three';
import { GRASSLAND_LOOK, grasslandMaterials, jitterHSL, getLookTier } from '../look.js';
import { mulberry } from '../prng.js';
import { crag } from '../shapes.js';
import { WATER_Y } from './layout.js';

function reedTuft(rand) {
  const pos = [], col = [], nor = [], idx = [];
  const blades = 8;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rand() * 0.7;
    const dx = Math.cos(a), dz = Math.sin(a);
    const r0 = 0.1 + rand() * 0.3;
    const h = 2.6 + rand() * 2.2;
    const lean = 0.12 + rand() * 0.3;
    const w = 0.13 + rand() * 0.08;
    const px = -dz * w, pz = dx * w;
    const base = pos.length / 3;
    const at = (t, side) => {
      const out = r0 + lean * h * t * t;
      pos.push(dx * out + px * side * (1 - t * 0.7), h * t, dz * out + pz * side * (1 - t * 0.7));
      const v = 0.48 + 0.5 * t;
      col.push(v, v, v * 0.92);
      nor.push(dx * 0.35, 0.9, dz * 0.35);
    };
    at(0, -1); at(0, 1); at(0.55, -1); at(0.55, 1); at(1, 0);
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

function flowerClump(rand, n = 4) {
  const pos = [], col = [], nor = [], idx = [];
  const head = new THREE.OctahedronGeometry(1, 0);
  const hp = head.attributes.position;
  for (let f = 0; f < n; f++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.75;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 0.55 + rand() * 0.75;
    const tx = x + (rand() - 0.5) * 0.3, tz = z + (rand() - 0.5) * 0.3;
    let base = pos.length / 3;
    pos.push(x - 0.05, 0, z, x + 0.05, 0, z, tx, h, tz);
    col.push(0.2, 0.36, 0.14, 0.2, 0.36, 0.14, 0.34, 0.5, 0.2);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    idx.push(base, base + 1, base + 2);
    base = pos.length / 3;
    const s = 0.15 + rand() * 0.09;
    for (let v = 0; v < hp.count; v++) {
      const y = hp.getY(v);
      pos.push(tx + hp.getX(v) * s, h + y * s * 0.55, tz + hp.getZ(v) * s);
      const c = y > 0.5 ? 0.78 : 1;
      col.push(c, c, c);
      nor.push(hp.getX(v) * 0.5, 0.8, hp.getZ(v) * 0.5);
      idx.push(base + v);
    }
  }
  head.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

const shared = {};
export function bankKit() {
  if (shared.reed) return shared;
  const rand = mulberry(90417);
  shared.reed = reedTuft(rand);
  shared.flower = flowerClump(rand);
  shared.stone = crag(rand, 1, 0.9);
  shared.bloom = new THREE.ConeGeometry(0.5, 0.5, 6, 1, true);
  shared.bloom.rotateX(Math.PI);
  shared.bloom.translate(0, 0.25, 0);
  const n = shared.bloom.attributes.position.count;
  shared.bloom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return shared;
}

const dummy = new THREE.Object3D();
const PATCH = 200;
const at = new THREE.Vector2();
const tint = new THREE.Color();
const flowerTint = new THREE.Color();

// Items spread along a whole river are cut into patches of `patch` metres so each patch culls on its own.
export function instanced(parent, geometry, material, items, shadow = false, patch = 0) {
  if (!items.length) return null;
  const patches = new Map();
  for (const item of items) {
    const key = patch ? `${Math.floor(item[0] / patch)},${Math.floor(item[2] / patch)}` : '';
    if (!patches.has(key)) patches.set(key, []);
    patches.get(key).push(item);
  }
  let first = null;
  for (const list of patches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    for (let i = 0; i < list.length; i++) {
      const [x, y, z, sx, sy, sz, ry, color, rx = 0] = list[i];
      dummy.position.set(x, y, z);
      dummy.rotation.set(rx, ry, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color);
    }
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    first ??= mesh;
  }
  return first;
}

// body.at(s, d, out) maps distance along (s) and signed distance from the centre line (d) to world x/z.
export function dressBanks(root, body) {
  const k = bankKit();
  const tier = getLookTier();
  const density = (tier === 'low' ? 0.5 : tier === 'medium' ? 0.75 : 1) * ((body.s1 - body.s0) / 1600);
  const rand = mulberry(body.seed);
  const span = body.s1 - body.s0;
  const L = GRASSLAND_LOOK;
  const reeds = [], stones = [], flowers = [], blooms = [];

  const beds = Math.round(34 * density);
  for (let b = 0; b < beds; b++) {
    const featured = body.feature && b < body.feature.length * 2;
    const sc = featured ? body.feature[b >> 1] + (rand() - 0.5) * 14 : body.s0 + rand() * span;
    const side = featured ? (b & 1 ? 1 : -1) : rand() < 0.5 ? -1 : 1;
    const n = 8 + Math.floor(rand() * 9);
    for (let i = 0; i < n; i++) {
      const s = sc + (rand() - 0.5) * 24;
      const d = body.shore - 2.6 + rand() * 4.4;
      const scale = 0.75 + rand() * 0.75;
      const ry = rand() * Math.PI * 2;
      jitterHSL(tint, rand, L.reed);
      if (body.keepClear(s)) continue;
      body.at(s, side * d, at);
      reeds.push([at.x, body.bedY(d) - 0.15, at.y, scale, scale * (0.85 + rand() * 0.4), scale, ry, tint.clone()]);
    }
  }

  const stoneN = Math.round(46 * density);
  for (let i = 0; i < stoneN; i++) {
    const s = body.s0 + rand() * span;
    const side = rand() < 0.5 ? -1 : 1;
    const big = rand() < 0.16;
    const d = big ? body.shore - 3.2 + rand() * 2.8 : body.shore - 1.2 + rand() * 3.6;
    const size = big ? 1.5 + rand() * 1.6 : 0.35 + rand() * 0.75;
    const ry = rand() * Math.PI * 2;
    jitterHSL(tint, rand, L.bankStone);
    if (body.keepClear(s)) continue;
    body.at(s, side * d, at);
    const y = Math.max(body.bedY(d), big ? WATER_Y - size * 0.35 : -99) + size * 0.12;
    stones.push([at.x, y, at.y, size * (0.8 + rand() * 0.5), size * (0.6 + rand() * 0.3), size, ry, tint.clone()]);
  }

  const drifts = Math.round(26 * density);
  for (let f = 0; f < drifts; f++) {
    const sc = body.s0 + rand() * span;
    const side = rand() < 0.5 ? -1 : 1;
    flowerTint.set(body.flowers[Math.floor(rand() * body.flowers.length)]);
    const n = 4 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const s = sc + (rand() - 0.5) * 16;
      const d = body.shore + 1.6 + rand() * (body.lip - body.shore + 2.5);
      const scale = 0.8 + rand() * 0.7;
      const ry = rand() * Math.PI * 2;
      tint.copy(flowerTint).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.1);
      if (body.keepClear(s)) continue;
      body.at(s, side * d, at);
      flowers.push([at.x, Math.min(0, body.bedY(d)) - 0.03, at.y, scale, scale, scale, ry, tint.clone()]);
    }
  }

  for (const [x, z, size] of body.pads || []) {
    const r = rand();
    const pick = rand();
    if (r > 0.42) continue;
    tint.set(L.lilyBloom[pick < 0.5 ? 0 : 1]);
    blooms.push([x + size * 0.2, WATER_Y + 0.08, z - size * 0.15, size * 0.55, size * 0.6, size * 0.55, r * 20, tint.clone()]);
  }

  const group = new THREE.Group();
  instanced(group, k.reed, grasslandMaterials.reed(), reeds, false, PATCH);
  instanced(group, k.flower, grasslandMaterials.bloom(body.glow || 0), flowers, false, PATCH);
  instanced(group, k.bloom, grasslandMaterials.bloom(0), blooms, false, PATCH);
  group.userData.closeUp = true;
  root.add(group);
  instanced(root, k.stone, grasslandMaterials.bankStone(), stones, true, PATCH);
  return group;
}
