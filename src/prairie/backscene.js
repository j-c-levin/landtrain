import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PRAIRIE, SPLIT_X } from '../constants.js';
import { PRAIRIE_LOOK, prairieMaterials, getLookTier } from '../look.js';
import { mulberry } from '../prng.js';

const _c = new THREE.Color();
const ARCS = 6;

// A low swell of flocked ground: straw on the crown, olive in the lee.
function duneGeometry(rand, rx, rz, height) {
  const radial = 10;
  const rings = 3;
  const pos = [0, height, 0];
  const col = [];
  const idx = [];
  const tones = PRAIRIE_LOOK.dune.map((c) => new THREE.Color(c));
  const ph = rand() * 6.28;
  const lean = (rand() - 0.5) * 0.5;
  tones[1].toArray(col, 0);
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    for (let i = 0; i < radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const k = t * (0.86 + 0.16 * Math.sin(a * 2 + ph) + 0.08 * Math.sin(a * 5 + ph * 2));
      const y = height * Math.cos(t * Math.PI * 0.5) ** 1.3 * (1 + lean * Math.cos(a)) - (r === rings ? 3 : 0);
      pos.push(Math.cos(a) * rx * k, y, Math.sin(a) * rz * k);
      _c.copy(tones[1]).lerp(tones[Math.sin(a * 3 + ph) > 0 ? 0 : 2], t * (0.6 + 0.4 * Math.sin(a * 2 + ph * 3)));
      _c.toArray(col, col.length);
    }
  }
  for (let i = 0; i < radial; i++) {
    const j = (i + 1) % radial;
    idx.push(0, 1 + j, 1 + i);
    for (let r = 0; r < rings - 1; r++) {
      const a = 1 + r * radial;
      const b = a + radial;
      idx.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Rolling ground between the table edge and the buttes, merged by stretch so a view draws a few of them.
export function buildDunes(chunkFor) {
  const rand = mulberry(4410201);
  const mat = prairieMaterials.dune();
  const edge = PRAIRIE.maxZ + 30;
  const stretches = new Map();
  for (let i = 0; i < 52; i++) {
    const rx = 120 + rand() * 170;
    const rz = 60 + rand() * 80;
    const height = 12 + rand() * 26;
    const west = i % 6 === 5;
    let x;
    let z;
    if (west) {
      x = PRAIRIE.minX - 60 - rz * 1.2 - rand() * 330;
      z = (rand() - 0.5) * 1900;
    } else {
      x = PRAIRIE.minX - 500 + rand() * (PRAIRIE.maxX - PRAIRIE.minX + 500);
      x = Math.min(x, PRAIRIE.maxX - rx * 1.2);
      z = (i % 2 ? 1 : -1) * (edge + rz * 1.2 + rand() * rand() * 420);
    }
    const geo = duneGeometry(rand, west ? rz : rx, west ? rx : rz, height);
    geo.translate(x, -0.5, z);
    const key = west ? 'west' : `${Math.sign(z)}:${Math.floor(x / 620)}:${x < SPLIT_X}`;
    if (!stretches.has(key)) stretches.set(key, { x, parts: [] });
    stretches.get(key).parts.push(geo);
  }
  for (const { x, parts } of stretches.values()) {
    chunkFor(x).add(new THREE.Mesh(mergeGeometries(parts), mat));
    for (const g of parts) g.dispose();
  }
}

function rangeGeometry({ cx, ax, az, open, segments, height, seed, palette, inset }) {
  const rand = mulberry(seed);
  const pos = [];
  const col = [];
  const idx = [];
  const foot = new THREE.Color(palette[1]);
  const crest = new THREE.Color(palette[0]);
  const lattice = [];
  for (let i = 0; i < 64; i++) lattice.push(rand());
  const wave = (t) => {
    const i = Math.floor(t);
    const f = t - i;
    const s = f * f * (3 - 2 * f);
    return lattice[i & 63] * (1 - s) + lattice[(i + 1) & 63] * s;
  };
  const ROWS = 4;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = open + u * (Math.PI * 2 - open * 2);
    const taper = Math.min(1, Math.sin(u * Math.PI) * 5);
    const peaks = 1 - Math.abs(wave(u * 23) * 2 - 1);
    const h = height * taper * (0.3 + 0.4 * wave(u * 7 + 20) + 0.46 * peaks * peaks + 0.1 * rand());
    const spur = 1 - Math.abs(wave(u * 41 + 9) * 2 - 1);
    const x = cx + Math.cos(a) * ax;
    const z = Math.sin(a) * az;
    const nx = -Math.cos(a);
    const nz = -Math.sin(a);
    const jut = (rand() - 0.5) * inset * 0.4;
    const tone = (rand() - 0.5) * 0.3;
    const rows = [
      [inset * 1.25, -6, 0],
      [inset * (0.55 + 0.6 * spur), h * (0.1 + 0.26 * spur), 0.25 + tone],
      [inset * 0.3 + jut, h * (0.56 + 0.12 * rand()), 0.6 + tone],
      [0, h, 1],
    ];
    for (const [out, y, k] of rows) {
      pos.push(x + nx * out, y, z + nz * out);
      _c.copy(foot).lerp(crest, Math.min(1, Math.max(0, k))).toArray(col, col.length);
    }
    if (i < segments) {
      for (let j = 0; j < ROWS - 1; j++) {
        const b = i * ROWS + j;
        idx.push(b, b + ROWS, b + ROWS + 1, b, b + ROWS + 1, b + 1);
      }
    }
  }
  // cut into arcs so the lens only draws the stretch of horizon it faces
  const arcs = [];
  const span = Math.ceil(segments / ARCS);
  for (let from = 0; from < segments; from += span) {
    const to = Math.min(segments, from + span);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.slice(from * ROWS * 3, (to + 1) * ROWS * 3), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col.slice(from * ROWS * 3, (to + 1) * ROWS * 3), 3));
    geo.setIndex(idx.slice(from * (ROWS - 1) * 6, to * (ROWS - 1) * 6).map((i) => i - from * ROWS));
    geo.computeVertexNormals();
    arcs.push(geo);
  }
  return arcs;
}

// Painted backscene flats: a sandstone escarpment, then a pale far range, open to the east.
export function buildRanges(root) {
  const cx = 1000;
  const specs = [
    { ax: 3500, az: 2500, height: 105, seed: 630117, palette: PRAIRIE_LOOK.rangeNear, inset: 200, segments: 110, haze: 0.26, pitch: 0.07 },
    { ax: 4700, az: 3500, height: 205, seed: 630118, palette: PRAIRIE_LOOK.rangeFar, inset: 380, segments: 96, haze: 0.2, pitch: 0.04 },
  ];
  for (const spec of specs) {
    const open = Math.acos((PRAIRIE.maxX - cx) / spec.ax);
    const mat = prairieMaterials.range(spec.haze, spec.pitch);
    const segments = Math.round(spec.segments * (getLookTier() === 'low' ? 0.5 : 1));
    for (const geo of rangeGeometry({ cx, open, ...spec, segments })) root.add(new THREE.Mesh(geo, mat));
  }
}
