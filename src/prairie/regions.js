import * as THREE from 'three';
import { PRAIRIE, LANDMARK, clamp } from '../constants.js';
import { mulberry } from '../prng.js';

// Region map texels: r cover may grow, g lushness (0.5 = plain straw), b bare red earth, a pale sand.

export const REGION_RECT = { minX: PRAIRIE.minX - 460, maxX: PRAIRIE.maxX + 4, minZ: -1320, maxZ: 1320 };
const STEP = 8;

const LATTICE = 64;
const lattice = new Float32Array(LATTICE * LATTICE);
{
  const rand = mulberry(77120431);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
}

function noise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  let fx = x - xi;
  let fz = z - zi;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const x0 = xi & (LATTICE - 1);
  const x1 = (xi + 1) & (LATTICE - 1);
  const z0 = (zi & (LATTICE - 1)) * LATTICE;
  const z1 = ((zi + 1) & (LATTICE - 1)) * LATTICE;
  const a = lattice[z0 + x0];
  const b = lattice[z0 + x1];
  const c = lattice[z1 + x0];
  const d = lattice[z1 + x1];
  return a + (b - a) * fx + (c - a + (a - b + d - c) * fx) * fz;
}

function fbm(x, z) {
  return (noise(x, z) * 4 + noise(x * 2.03 + 17.1, z * 2.03 + 9.2) * 2 + noise(x * 4.1 + 3.7, z * 4.1 + 31.4)) / 7;
}

// [x, lush, bare]
const CHAPTERS = [
  [-800, 0.5, 0.04],
  [420, 0.5, 0.04],
  [640, 0.88, 0.0],
  [980, 0.86, 0.0],
  [1150, 0.2, 0.85],
  [1560, 0.16, 0.9],
  [1740, 0.4, 0.5],
  [2120, 0.42, 0.42],
  [2260, 0.92, 0.0],
  [3000, 1.0, 0.0],
];

const smooth = (t) => t * t * (3 - 2 * t);

export const WASH = { x: 1345, half: 17 };
export const washX = (z) => WASH.x + 150 * Math.sin(z * 0.0052 + 0.6) + 48 * Math.sin(z * 0.0171 + 2.1);

export const PANS = [
  { x: 1175, z: -250, rx: 92, rz: 58, turn: 0.4 },
  { x: 1490, z: 235, rx: 74, rz: 50, turn: -0.5 },
  { x: 1230, z: 430, rx: 60, rz: 38, turn: 1.1 },
];

const _out = { lush: 0.5, bare: 0, pale: 0, grow: 1 };

// Reuses one result object: read it before the next call.
export function regionAt(x, z, clearings = null) {
  const wx = x + (fbm(x * 0.0017 + 5.3, z * 0.0017 + 1.9) - 0.5) * 520;
  let k = 0;
  while (k < CHAPTERS.length - 2 && wx > CHAPTERS[k + 1][0]) k++;
  const a = CHAPTERS[k];
  const b = CHAPTERS[k + 1];
  const t = smooth(clamp((wx - a[0]) / (b[0] - a[0]), 0, 1));
  let lush = a[1] + (b[1] - a[1]) * t;
  let bare = a[2] + (b[2] - a[2]) * t;

  const edge = clamp((REGION_RECT.maxZ - 60 - Math.abs(z)) / 220, 0, 1) * clamp((x - REGION_RECT.minX - 40) / 200, 0, 1);
  const patch = fbm(x * 0.0125 + 40, z * 0.0125 + 12);
  const scald = fbm(x * 0.0085 + 90, z * 0.0085 + 70);
  lush += (patch - 0.47) * 1.15 * edge;
  bare += Math.max(0, scald - 0.56) * 2.6 * edge * (0.45 + bare);
  lush -= Math.max(0, scald - 0.56) * 1.6 * edge;

  const oasis = 1 - smooth(clamp((Math.hypot(x - LANDMARK.x, z - LANDMARK.z) - 150) / 330, 0, 1));
  lush = lush + (1 - lush) * oasis;
  bare *= 1 - oasis;

  let pale = 0;
  const ragged = (fbm(x * 0.045 + 7, z * 0.045 + 3) - 0.5) * 16;
  const swell = fbm(z * 0.0075 + 3.3, 8.1);
  const girth = WASH.half * (0.25 + 4.4 * swell * swell);
  const flow = clamp(fbm(z * 0.0052 + 21.7, 4.4) * 3.4 - 1.05, 0.22, 1);
  const off = x - washX(z);
  const bed = 1 - clamp((Math.abs(off) + ragged - girth * 0.4) / (girth * 0.9 + 5), 0, 1);
  const braidAt = (26 + 22 * Math.sin(z * 0.011 + 1.4)) * Math.sign(Math.sin(z * 0.0031 + 0.5));
  const braid = (1 - clamp((Math.abs(off - braidAt) + ragged * 0.6 - 2) / 9, 0, 1)) * clamp(fbm(z * 0.012 + 60, 2.2) * 3 - 1, 0, 1);
  pale = Math.max(pale, smooth(Math.max(bed, braid * 0.8)) * flow * edge);
  for (const p of PANS) {
    const c = Math.cos(p.turn);
    const s = Math.sin(p.turn);
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot((dx * c + dz * s) / p.rx, (dz * c - dx * s) / p.rz) + ragged * 0.012;
    pale = Math.max(pale, 1 - smooth(clamp((d - 0.72) / 0.36, 0, 1)));
  }
  const west = LANDMARK.x - x;
  if (west > 80 && west < 250) {
    const across = Math.abs(z - LANDMARK.z - 10 * Math.sin((west - 96) * 0.03));
    pale = Math.max(pale, 0.62 * (1 - smooth(clamp((across - 1) / 6, 0, 1))) * (1 - smooth(clamp((west - 170) / 60, 0, 1))));
  }
  lush *= 1 - pale;
  bare = Math.max(bare * (1 - pale), 0);

  let grow = 1;
  if (clearings) {
    for (const c of clearings) {
      const d = Math.hypot(x - c.x, z - c.z);
      grow = Math.min(grow, clamp((d - c.r) / 10 + 0.5, 0, 1));
    }
  }

  _out.lush = clamp(lush, 0, 1);
  _out.bare = clamp(bare, 0, 1);
  _out.pale = clamp(pale, 0, 1);
  _out.grow = grow;
  return _out;
}

export function regionMap(clearings) {
  const { minX, maxX, minZ, maxZ } = REGION_RECT;
  const w = Math.ceil((maxX - minX) / STEP);
  const h = Math.ceil((maxZ - minZ) / STEP);
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const r = regionAt(minX + (i + 0.5) * STEP, minZ + (j + 0.5) * STEP, clearings);
      const o = (j * w + i) * 4;
      data[o] = r.grow * 255;
      data[o + 1] = r.lush * 255;
      data[o + 2] = r.bare * 255;
      data[o + 3] = r.pale * 255;
    }
  }
  const texture = new THREE.DataTexture(data, w, h);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, rect: new THREE.Vector4(minX, minZ, 1 / (w * STEP), 1 / (h * STEP)) };
}
