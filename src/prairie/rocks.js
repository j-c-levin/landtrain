import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp } from '../constants.js';
import { PRAIRIE_LOOK, prairieMaterials, getLookTier } from '../look.js';
import { mulberry } from '../prng.js';
import { crag } from '../shapes.js';

const _c = new THREE.Color();
const _d = new THREE.Color();

// [height, radius] rows, foot to cap
const BUTTE = [[0, 1], [0.2, 0.8], [0.4, 0.64], [0.45, 0.55], [0.93, 0.5], [1, 0.45]];
const TERRACE = [[0, 1], [0.34, 0.86], [0.4, 0.74], [0.8, 0.69], [0.86, 0.56], [1, 0.54]];

// A stepped butte: talus skirt, ledge, fluted cliff, cap. Rows are painted
// foot-to-cap; the strata material draws the fine banding.
export function butteGeometry(rand, radius, height, {
  radial = 20, profile = BUTTE, bands = PRAIRIE_LOOK.mesaBands, foot = PRAIRIE_LOOK.flock[3], cap = PRAIRIE_LOOK.mesaCap,
  stretch = 1, flute = 0.1,
} = {}) {
  const rows = profile.length;
  const geo = new THREE.CylinderGeometry(radius, radius, height, radial, rows - 1);
  const p = geo.attributes.position;
  const palette = bands.map((c) => new THREE.Color(c));
  const col = new Float32Array(p.count * 3);
  const ph1 = rand() * 6.28;
  const ph2 = rand() * 6.28;
  const first = Math.floor(rand() * palette.length);
  const local = mulberry((ph1 * 1e6) | 0);
  const ribs = [];
  for (let i = 0; i < radial; i++) ribs.push(1 + (local() - 0.5) * 2 * flute);
  for (let i = 0; i < p.count; i++) {
    const row = Math.round(clamp(p.getY(i) / height + 0.5, 0, 1) * (rows - 1));
    const [t, r] = profile[row];
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const column = ((Math.round((a / (Math.PI * 2)) * radial) % radial) + radial) % radial;
    const cliff = clamp(t * 3, 0, 1);
    const k = r * (0.84 + 0.2 * Math.sin(a * 3 + ph1) + 0.1 * Math.sin(a * 7 + ph2)) * (1 + (ribs[column] - 1) * cliff);
    p.setXYZ(i, p.getX(i) * k * stretch, t * height, p.getZ(i) * k);
    _c.copy(palette[(first + row) % palette.length]);
    if (row === 0) _c.set(foot);
    else if (row === 1) _c.lerp(_d.set(foot), 0.45);
    else if (row === rows - 1) _c.set(cap);
    _c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export const mesaGeometry = (rand, radius, height) => butteGeometry(rand, radius, height);

export const terraceGeometry = (rand, radius, height, look) =>
  butteGeometry(rand, radius, height, { profile: TERRACE, radial: 24, flute: 0.05, ...look });

function boulderPaint(base, sun, dust) {
  return (height, up) => {
    _c.copy(base);
    _c.lerp(sun, clamp(up * 0.9, 0, 0.75));
    _c.lerp(dust, clamp(1 - (height - 0.38) * 5, 0, 0.8));
    return _c;
  };
}

function pebble(rand, radius, squash, paint) {
  const geo = new THREE.IcosahedronGeometry(radius, 0);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const ph = rand() * 9;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / radius;
    const k = 0.8 + 0.34 * Math.sin(p.getX(i) * 2.9 / radius + ph) * Math.cos(p.getZ(i) * 3.3 / radius + ph);
    p.setXYZ(i, p.getX(i) * k, Math.max(y, -0.3) * radius * squash, p.getZ(i) * k);
    paint(y * 0.5 + 0.5, y).toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export function bigRockCluster(rand, cx, cz, r, root, obstacles) {
  const group = new THREE.Group();
  const mat = prairieMaterials.crag();
  const light = new THREE.Color(PRAIRIE_LOOK.rock);
  const dark = new THREE.Color(PRAIRIE_LOOK.rockDark);
  const sun = new THREE.Color(PRAIRIE_LOOK.rockSun);
  const dust = new THREE.Color(PRAIRIE_LOOK.flock[3]);
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = r * (0.32 + rand() * 0.45);
    const isDark = rand() > 0.5;
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.55;
    const rot = [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI];
    const squash = 0.9 + rand() * 0.7;
    const rock = new THREE.Mesh(crag(rand, s, squash, boulderPaint(isDark ? dark : light, sun, dust)), mat);
    rock.position.set(cx + Math.cos(a) * d, s * 0.2, cz + Math.sin(a) * d);
    rock.rotation.y = rot[1];
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  const local = mulberry((cx * 7919 + cz * 104729) | 0);
  const scree = [];
  const count = getLookTier() === 'low' ? 7 : 13;
  for (let i = 0; i < count; i++) {
    const a = local() * Math.PI * 2;
    const d = r * (0.5 + local() * 0.62);
    const s = 1.2 + local() * local() * 6.5;
    const g = pebble(local, s, 0.55 + local() * 0.4, boulderPaint(local() > 0.5 ? dark : light, sun, dust));
    g.rotateY(local() * Math.PI);
    g.translate(cx + Math.cos(a) * d, s * 0.12, cz + Math.sin(a) * d);
    scree.push(g);
  }
  const rubble = new THREE.Mesh(mergeGeometries(scree), mat);
  for (const g of scree) g.dispose();
  rubble.castShadow = true;
  rubble.receiveShadow = true;
  group.add(rubble);

  root.add(group);
  obstacles.push({ type: 'circle', x: cx, z: cz, r });
}

// One long hogback: talus feet, buttressed shoulders, a jagged crest of massifs and saddles.
function ridgeWall(rand, x1, z1, dx, dz, len) {
  const columns = Math.ceil(len / 13);
  const ux = dx / len;
  const uz = dz / len;
  const tones = PRAIRIE_LOOK.ridgeBands.map((c) => new THREE.Color(c));
  const dust = new THREE.Color(PRAIRIE_LOOK.flock[3]);
  const sun = new THREE.Color(PRAIRIE_LOOK.rockSun);
  const swell = [rand() * 6.28, rand() * 6.28, 2 + rand() * 2];
  const pos = [];
  const col = [];
  const idx = [];
  for (let i = 0; i <= columns; i++) {
    const t = i / columns;
    const ends = Math.min(1, Math.sin(t * Math.PI) * 9);
    const massif = 0.5 + 0.5 * Math.sin(t * Math.PI * swell[2] + swell[0]) * Math.sin(t * 9.4 + swell[1]);
    const crest = (20 + 46 * massif + rand() * 16) * (0.25 + 0.75 * ends);
    const gully = i % 2 ? 0.72 : 1;
    const lean = (rand() - 0.5) * 7;
    const along = (rand() - 0.5) * 5;
    const cx = x1 + dx * t + ux * along;
    const cz = z1 + dz * t + uz * along;
    const tone = tones[Math.floor(rand() * tones.length)];
    // [offset across the ridge, height, colour]
    const section = [
      [-(21 + rand() * 6) * (0.5 + 0.5 * ends), -1, dust],
      [-(9 + rand() * 4) * gully, crest * (0.5 + rand() * 0.16), tone],
      [lean, crest, sun],
      [(9 + rand() * 4) * gully, crest * (0.5 + rand() * 0.16), tone],
      [(21 + rand() * 6) * (0.5 + 0.5 * ends), -1, dust],
    ];
    for (const [off, y, c] of section) {
      pos.push(cx - uz * off, y, cz + ux * off);
      col.push(c.r, c.g, c.b);
    }
    if (i < columns) {
      for (let j = 0; j < 4; j++) {
        const a = i * 5 + j;
        idx.push(a, a + 1, a + 6, a, a + 6, a + 5);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function ridge(rand, x1, z1, x2, z2, root, obstacles) {
  const group = new THREE.Group();
  const mat = prairieMaterials.crag(0.2, THREE.DoubleSide);
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const steps = Math.ceil(len / 24);
  const wall = new THREE.Mesh(ridgeWall(rand, x1, z1, dx, dz, len), mat);
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const local = mulberry((x1 * 31 + z1 * 17 + z2) | 0);
  const dust = new THREE.Color(PRAIRIE_LOOK.flock[3]);
  const sun = new THREE.Color(PRAIRIE_LOOK.rockSun);
  const tones = PRAIRIE_LOOK.ridgeBands.map((c) => new THREE.Color(c));
  const talus = [];
  const count = Math.round(steps * (getLookTier() === 'low' ? 0.6 : 1.5));
  for (let i = 0; i < count; i++) {
    const t = local();
    const side = local() > 0.5 ? 1 : -1;
    const off = side * (13 + local() * 17);
    const s = 2 + local() * local() * 7;
    const g = pebble(local, s, 0.6 + local() * 0.5, boulderPaint(tones[Math.floor(local() * tones.length)], sun, dust));
    g.rotateY(local() * Math.PI);
    g.translate(x1 + dx * t - (dz / len) * off, s * 0.14, z1 + dz * t + (dx / len) * off);
    talus.push(g);
  }
  const rubble = new THREE.Mesh(mergeGeometries(talus), mat);
  for (const g of talus) g.dispose();
  rubble.castShadow = true;
  rubble.receiveShadow = true;
  group.add(rubble);

  root.add(group);
  obstacles.push({ type: 'seg', x1, z1, x2, z2, w: 16 });
}
