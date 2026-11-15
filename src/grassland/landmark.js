import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRASSLAND_LOOK, grasslandMaterials, getLookTier } from '../look.js';
import { mulberry } from '../prng.js';
import { GRASS_LANDMARK } from './layout.js';
import { sheetGeometry } from './water.js';
import { nightTame } from './fade.js';

const TAU = Math.PI * 2;
const c1 = new THREE.Color();
const c2 = new THREE.Color();
const c3 = new THREE.Color();

function plain(geo) {
  geo.deleteAttribute('aFlow');
  geo.deleteAttribute('aShore');
  return geo;
}

function paint(geo, fn) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getY(i) : 0).toArray(col, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const KNOLL_R = [0, 9, 20, 30, 39, 47, 54, 60, 66, 72];
const KNOLL_Y = [15.8, 15.6, 14.9, 13.4, 11, 8, 5, 2.6, 0.9, -0.2];

function knollGeometry() {
  const SEG = 44;
  const geo = plain(sheetGeometry(SEG, KNOLL_R.length, (i, j, out) => {
    const a = (i / SEG) * TAU;
    const r = KNOLL_R[j] * (1 + 0.07 * Math.sin(a * 2 + 1) + 0.045 * Math.sin(a * 5 + 2.2));
    out[0] = Math.cos(a) * r;
    out[1] = KNOLL_Y[j] * (1 + 0.06 * Math.sin(a * 3 + 0.5));
    out[2] = Math.sin(a) * r;
  }, { closed: true }));
  geo.computeVertexNormals();
  return paint(geo, (_x, y, _z, up) => c1.setScalar(0.78 + 0.26 * up + 0.012 * y));
}

// A lathe skin facing outward: rings listed from the top down.
function skin(seg, ys, at) {
  const geo = plain(sheetGeometry(seg, ys.length, (i, j, out) => at((i / seg) * TAU, j, out), { closed: true }));
  geo.computeVertexNormals();
  return geo;
}

function limb(from, to, r0, r1) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, 7, 1, true);
  geo.deleteAttribute('uv');
  geo.translate(0, len / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  geo.translate(from.x, from.y, from.z);
  return geo.toNonIndexed();
}

function blob(rand, x, y, z, r, detail, squash = 0.78) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('uv');
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const a = rand() * 9, b = rand() * 9;
  for (let i = 0; i < p.count; i++) {
    const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i);
    const k = 0.86 + 0.16 * Math.sin(ux * 3.4 + a) * Math.cos(uz * 3.1 + b) + 0.1 * Math.sin(uy * 4.6 + a + b);
    p.setXYZ(i, x + ux * k * r, y + uy * k * r * squash, z + uz * k * r);
    n.setXYZ(i, ux, uy, uz);
  }
  return geo;
}

const CROWN = [
  [0, 93, 0, 30], [-25, 81, 10, 22], [23, 83, -12, 21], [6, 79, 27, 19], [-8, 81, -27, 19],
  [-40, 71, -6, 15], [38, 71, 12, 15], [17, 67, -36, 13], [-19, 67, 36, 13],
  [0, 106, 4, 18], [-15, 99, -10, 16], [17, 100, 10, 15],
];
const BLOSSOM = [
  [15, 104, 13, 8], [-27, 90, -8, 8], [9, 76, 40, 7], [33, 88, -4, 7], [-12, 110, 8, 6],
  [-44, 76, 4, 6], [24, 72, -40, 6], [-22, 74, 44, 6], [44, 76, 20, 5.5],
];

// fog:false throughout, so the tree stands on the horizon long before the island comes into view.
export function buildGrassLandmark(root) {
  const S = GRASSLAND_LOOK.silverTree;
  const rand = mulberry(60616);
  const low = getLookTier() === 'low';
  const group = new THREE.Group();
  group.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);

  const knoll = new THREE.Mesh(knollGeometry(), nightTame(grasslandMaterials.islandTurf()));
  knoll.receiveShadow = true;
  group.add(knoll);

  const TRUNK_Y = [68, 58, 46, 34, 26, 20.5, 17, 14];
  const TRUNK_R = [3.6, 4.3, 5.0, 5.8, 6.9, 8.8, 12, 16];
  const FLARE = [0, 0, 0, 0.04, 0.12, 0.3, 0.55, 0.85];
  const wood = [skin(14, TRUNK_Y, (a, j, out) => {
    const root5 = Math.pow(0.5 + 0.5 * Math.cos(a * 5 + 0.7), 2.4);
    const r = TRUNK_R[j] * (1 - FLARE[j] * 0.45 + FLARE[j] * 1.1 * root5) * (1 + 0.05 * Math.sin(a * 3 + j));
    const y = TRUNK_Y[j];
    out[0] = Math.cos(a) * r + Math.sin(y * 0.045) * 2.2;
    out[1] = y;
    out[2] = Math.sin(a) * r + Math.cos(y * 0.06) * 1.4;
  }).toNonIndexed()];
  const fork = new THREE.Vector3();
  const end = new THREE.Vector3();
  for (const [x, y, z, r] of CROWN.slice(0, 9)) {
    fork.set(x * 0.08, 52 + rand() * 12, z * 0.08);
    end.set(x * 0.9, y - r * 0.25, z * 0.9);
    wood.push(limb(fork, end, 3.4 - rand() * 0.8, 1.2));
  }
  for (const g of wood) g.computeVertexNormals();
  const bark = paint(mergeGeometries(wood), (x, y, z) => {
    const t = Math.min(1, Math.max(0, (y - 16) / 44));
    const streak = 0.9 + 0.16 * Math.sin(Math.atan2(z, x) * 9 + y * 0.35);
    return c1.set(S.bark).lerp(c2.set(S.barkPale), t).multiplyScalar(streak);
  });
  for (const g of wood) g.dispose();
  const trunk = new THREE.Mesh(bark, grasslandMaterials.treeBark());
  trunk.castShadow = true;
  group.add(trunk);

  const puffs = CROWN.map(([x, y, z, r]) => blob(rand, x, y, z, r, low ? 1 : 2));
  for (let i = 0; i < 40; i++) {
    const [x, y, z, r] = CROWN[i % CROWN.length];
    const a = rand() * TAU;
    const lift = -0.25 + rand() * 1.2;
    const flat = Math.sqrt(Math.max(0, 1 - Math.min(1, lift) ** 2));
    const reach = r * (0.72 + rand() * 0.25);
    puffs.push(blob(rand, x + Math.cos(a) * flat * reach, y + lift * reach * 0.78, z + Math.sin(a) * flat * reach,
      r * (0.3 + rand() * 0.2), low ? 0 : 1));
  }
  const crownGeo = paint(mergeGeometries(puffs), (_x, y, _z, up) => {
    const lift = Math.min(1, Math.max(0, (y - 58) / 56));
    c1.set(S.leafShade).lerp(c2.set(S.leaf), Math.min(1, Math.max(0, up * 0.9 + 0.6)));
    return c1.lerp(c3.set(S.leafLight), Math.max(0, up) * 0.6 + lift * 0.25);
  });
  for (const g of puffs) g.dispose();
  const crown = new THREE.Mesh(crownGeo, grasslandMaterials.treeCrown());
  crown.castShadow = true;
  group.add(crown);

  const buds = BLOSSOM.map(([x, y, z, r]) => blob(rand, x, y, z, r, 1, 0.85));
  const blossom = new THREE.Mesh(mergeGeometries(buds), grasslandMaterials.treeBlossom());
  group.add(blossom);
  for (const g of buds) g.dispose();

  const FLOWERS = 170;
  const flowers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), grasslandMaterials.treeBlossom(), FLOWERS);
  const dot = new THREE.Object3D();
  for (let i = 0; i < FLOWERS; i++) {
    const [x, y, z, r] = CROWN[i % CROWN.length];
    const a = rand() * TAU;
    const lift = -0.1 + rand() * 1.05;
    const flat = Math.sqrt(Math.max(0, 1 - Math.min(1, lift) ** 2));
    dot.position.set(x + Math.cos(a) * flat * r, y + lift * r * 0.78, z + Math.sin(a) * flat * r);
    dot.scale.setScalar(1.1 + rand() * 1.3);
    dot.rotation.set(rand() * 3, rand() * 3, 0);
    dot.updateMatrix();
    flowers.setMatrixAt(i, dot.matrix);
    flowers.setColorAt(i, c1.set(S.flower[Math.floor(rand() * S.flower.length)]));
  }
  if (low) flowers.count = 70;
  group.add(flowers);

  // strands of blossom trail from the crown's skirt; some end in a lantern
  const STRANDS = 72;
  const strandGeo = new THREE.LatheGeometry(
    (low ? [[0, -1], [1, -0.4], [0, 0]] : [[0, -1], [0.7, -0.7], [1, -0.4], [0.5, -0.12], [0, 0]])
      .map(([r, y]) => new THREE.Vector2(r, y)), low ? 4 : 5
  );
  const strands = new THREE.InstancedMesh(strandGeo, grasslandMaterials.treeBlossom(), STRANDS);
  const lamps = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < STRANDS; i++) {
    const a = (i / STRANDS) * TAU + rand() * 0.2;
    const r = 15 + rand() * 31;
    const top = 76 - r * 0.22 + rand() * 4;
    const len = 8 + rand() * 12;
    dummy.position.set(Math.cos(a) * r, top, Math.sin(a) * r);
    dummy.scale.set(0.75 + rand() * 0.5, len, 0.75 + rand() * 0.5);
    dummy.rotation.set((rand() - 0.5) * 0.08, rand() * 3, (rand() - 0.5) * 0.08);
    dummy.updateMatrix();
    strands.setMatrixAt(i, dummy.matrix);
    strands.setColorAt(i, c1.set(S.strand[Math.floor(rand() * S.strand.length)]));
    if (i % 5 === 0) lamps.push([dummy.position.x, top - len - 1.2, dummy.position.z]);
  }
  group.add(strands);

  const lanterns = new THREE.InstancedMesh(new THREE.SphereGeometry(1.5, 10, 8), grasslandMaterials.lantern(), lamps.length);
  const glowPos = new Float32Array(lamps.length * 3);
  const glowCol = new Float32Array(lamps.length * 3);
  c1.set(S.lanternGlow).multiplyScalar(0.7);
  lamps.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    lanterns.setMatrixAt(i, dummy.matrix);
    glowPos.set([x, y, z], i * 3);
    c1.toArray(glowCol, i * 3);
  });
  group.add(lanterns);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  glowGeo.setAttribute('color', new THREE.BufferAttribute(glowCol, 3));
  const glow = new THREE.Points(glowGeo, grasslandMaterials.glowPoints(15));
  group.add(glow);

  const halo = new THREE.Sprite(grasslandMaterials.halo());
  halo.scale.setScalar(200);
  halo.position.y = 86;
  group.add(halo);

  const RIM = 60;
  const plan = new Float32Array((RIM + 1) * 6 + 3);
  const planCol = new Float32Array((RIM + 1) * 6 + 3);
  const planIndex = [];
  plan.set([0, 104, 0]);
  planCol.set([1, 1, 1]);
  for (let i = 0; i <= RIM; i++) {
    const a = (i / RIM) * TAU;
    const r = 54 * (1 + 0.07 * Math.cos(a * 9) + 0.03 * Math.sin(a * 3 + 1));
    const k = 0.9 + 0.06 * Math.sin(a * 2 + 0.6);
    plan.set([Math.cos(a) * r * 0.62, 102, -Math.sin(a) * r * 0.62, Math.cos(a) * r, 98, -Math.sin(a) * r], i * 6 + 3);
    planCol.set([k, k, k + 0.02, 0.74, 0.77, 0.84], i * 6 + 3);
    if (i < RIM) {
      const v = i * 2 + 1;
      planIndex.push(0, v, v + 2, v, v + 1, v + 3, v, v + 3, v + 2);
    }
  }
  const planGeo = new THREE.BufferGeometry();
  planGeo.setAttribute('position', new THREE.BufferAttribute(plan, 3));
  planGeo.setAttribute('color', new THREE.BufferAttribute(planCol, 3));
  planGeo.setIndex(planIndex);
  const planMat = new THREE.MeshBasicMaterial({
    color: S.chartCrown, vertexColors: true, transparent: true, opacity: 0, fog: false,
  });
  const planCrown = new THREE.Mesh(planGeo, planMat);
  planCrown.visible = false;
  group.add(planCrown);
  // dew-bright points over the crown's sunlit top, so by day it reads as silver rather than cloud
  const dewRand = mulberry(60617);
  const DEW = low ? 26 : 60;
  const dewPos = new Float32Array(DEW * 3);
  const dewCol = new Float32Array(DEW * 3);
  for (let i = 0; i < DEW; i++) {
    const [x, y, z, r] = CROWN[i % CROWN.length];
    const a = dewRand() * TAU;
    const lift = 0.35 + dewRand() * 0.6;
    const flat = Math.sqrt(1 - lift * lift);
    dewPos.set([x + Math.cos(a) * flat * r * 1.02, y + lift * r * 0.8, z + Math.sin(a) * flat * r * 1.02], i * 3);
    c1.set(S.dew).multiplyScalar(0.45 + dewRand() * 0.55).toArray(dewCol, i * 3);
  }
  const dewGeo = new THREE.BufferGeometry();
  dewGeo.setAttribute('position', new THREE.BufferAttribute(dewPos, 3));
  dewGeo.setAttribute('color', new THREE.BufferAttribute(dewCol, 3));
  const dewMat = grasslandMaterials.glowPoints(6.5);
  const dew = new THREE.Points(dewGeo, dewMat);
  group.add(dew);

  const crownMat = crown.material;
  const pearl = new THREE.Color(S.leafPearl);
  const moonlit = new THREE.Color(S.leafGlow);
  group.userData.setLight = (night) => {
    crownMat.emissive.copy(pearl).lerp(moonlit, night);
    crownMat.emissiveIntensity = S.crownGlow[0] + (S.crownGlow[1] - S.crownGlow[0]) * night;
    dewMat.opacity = 1 - 0.75 * night;
  };
  group.userData.setLight(0);

  const detail = [crown, blossom, flowers, strands, lanterns, glow, halo, dew];
  group.userData.setChart = (chart) => {
    const drawn = chart > 0.7;
    planCrown.visible = chart > 0.3;
    planMat.opacity = Math.min(1, Math.max(0, (chart - 0.3) / 0.4));
    for (let i = 0; i < detail.length; i++) detail[i].visible = !drawn;
  };

  root.add(group);
  return group;
}
