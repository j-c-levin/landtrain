import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PRAIRIE, LANDMARK } from '../constants.js';
import { PRAIRIE_LOOK, prairieMaterials, floraMaterials, jitterHSL, getLookTier } from '../look.js';
import { mulberry } from '../prng.js';
import { shadeByHeight } from '../groundcover.js';
import { regionAt } from './regions.js';

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();

function limb(out, x0, y0, z0, x1, y1, z1, r) {
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const g = new THREE.CylinderGeometry(r * 0.6, r, len, 5, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(_q.setFromUnitVectors(UP, _dir.set(x1 - x0, y1 - y0, z1 - z0).normalize()));
  g.translate(x0, y0, z0);
  out.push(g);
}

// Umbrella thorn: a leaning wire trunk under flat pads of clump foliage.
function thornTree(rand, h, ox, oz, trunks, crowns, detail, lead = 0) {
  const lean = (rand() - 0.5) * 0.5;
  const dir = rand() * Math.PI * 2;
  const top = [ox + Math.cos(dir) * lean * h, h, oz + Math.sin(dir) * lean * h];
  limb(trunks, ox, 0, oz, top[0], top[1], top[2], 0.07 * h);
  const pads = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < pads; i++) {
    const a = rand() * Math.PI * 2;
    const d = i === 0 ? 0 : h * (0.25 + rand() * 0.4);
    const r = h * (i === 0 ? 0.52 : 0.28 + rand() * 0.2);
    const px = top[0] + Math.cos(a) * d;
    const py = top[1] + (i === 0 ? 0.1 : -rand() * 0.22) * h;
    const pz = top[2] + Math.sin(a) * d;
    if (i > 0) limb(trunks, top[0] - (top[0] - ox) * 0.3, h * 0.7, top[2] - (top[2] - oz) * 0.3, px, py, pz, 0.035 * h);
    const pad = new THREE.IcosahedronGeometry(r, i === 0 ? Math.max(detail, lead) : detail);
    pad.rotateY(rand() * Math.PI);
    pad.scale(1, 0.34 + rand() * 0.12, 1);
    pad.translate(px, py, pz);
    crowns.push(pad);
  }
}

// One fading stand of thorn trees. Draw order is fixed: leaf tint, count, then each tree.
export function copse(rand, { count = null, height = [5, 6], detail = getLookTier() === 'low' ? 0 : 1, lead = 1 } = {}) {
  const group = new THREE.Group();
  const trunkMat = floraMaterials.fadingTrunk(PRAIRIE_LOOK.treeTrunk);
  const leafMat = floraMaterials.fadingLeaf();
  jitterHSL(leafMat.color, rand, PRAIRIE_LOOK.treeLeaf);
  const trunks = [];
  const crowns = [];
  const n = count ?? 1 + Math.floor(rand() * rand() * 3.2);
  for (let k = 0; k < n; k++) {
    const h = height[0] + rand() * height[1];
    const a = rand() * Math.PI * 2;
    const d = k === 0 ? 0 : 5 + rand() * 7;
    thornTree(rand, h, Math.cos(a) * d, Math.sin(a) * d, trunks, crowns, detail, lead);
  }
  const trunk = new THREE.Mesh(mergeGeometries(trunks), trunkMat);
  const crown = new THREE.Mesh(shadeByHeight(mergeGeometries(crowns), 0.62, 1.14), leafMat);
  for (const g of trunks) g.dispose();
  for (const g of crowns) g.dispose();
  trunk.castShadow = true;
  crown.castShadow = true;
  group.add(trunk, crown);
  return { group, mats: [trunkMat, leafMat] };
}

function snag(rand) {
  const group = new THREE.Group();
  const mat = prairieMaterials.snag();
  const parts = [];
  const h = 4 + rand() * 4;
  const lean = (rand() - 0.5) * 0.5;
  const dir = rand() * Math.PI * 2;
  const tx = Math.cos(dir) * lean * h;
  const tz = Math.sin(dir) * lean * h;
  limb(parts, 0, 0, 0, tx, h, tz, 0.065 * h);
  const arms = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < arms; i++) {
    const a = rand() * Math.PI * 2;
    const from = 0.45 + rand() * 0.45;
    const reach = h * (0.25 + rand() * 0.35);
    limb(
      parts, tx * from, h * from, tz * from,
      tx * from + Math.cos(a) * reach, h * from + reach * (0.5 + rand() * 0.7), tz * from + Math.sin(a) * reach, 0.03 * h
    );
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
  for (const g of parts) g.dispose();
  mesh.castShadow = true;
  group.add(mesh);
  return { group, mats: [mat] };
}

function clearOf(obstacles, x, z, pad) {
  for (const o of obstacles) {
    if (o.type === 'circle') {
      if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return false;
    } else {
      const dx = o.x2 - o.x1;
      const dz = o.z2 - o.z1;
      const t = Math.max(0, Math.min(1, ((x - o.x1) * dx + (z - o.z1) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(x - o.x1 - dx * t, z - o.z1 - dz * t) < o.w + pad + 14) return false;
    }
  }
  return true;
}

// Groves gather where the region map is lush, snags stand where it is bare.
export function plantGroves(obstacles, place) {
  const rand = mulberry(88013);
  const low = getLookTier() === 'low';
  const sites = [];
  for (let i = 0; i < 150; i++) {
    const x = PRAIRIE.minX + 120 + rand() * (PRAIRIE.maxX - PRAIRIE.minX - 140);
    const z = PRAIRIE.minZ + 20 + rand() * (PRAIRIE.maxZ - PRAIRIE.minZ - 40);
    const roll = rand();
    const count = 2 + Math.floor(rand() * 3.4);
    const region = regionAt(x, z);
    const fromTree = Math.hypot(x - LANDMARK.x, z - LANDMARK.z);
    if (fromTree < 135 || (Math.abs(z) < 20 && x < 200) || !clearOf(obstacles, x, z, 10)) continue;
    if (region.pale > 0.2) continue;
    if (roll < region.lush * region.lush * 0.42) sites.push({ kind: 'grove', x, z, count, tall: fromTree < 420 });
    else if (roll > 1 - region.bare * 0.2) sites.push({ kind: 'snag', x, z });
  }
  sites.forEach((site, i) => {
    const local = mulberry(88013 + (i + 1) * 7919);
    const made = site.kind === 'snag'
      ? snag(local)
      : copse(local, { count: low ? Math.min(site.count, 3) : site.count, height: site.tall ? [7, 7] : [5, 6], lead: low ? 0 : 1 });
    made.group.position.set(site.x, 0, site.z);
    made.group.rotation.y = local() * Math.PI * 2;
    place(made);
  });
}
