import * as THREE from 'three';
import { PRAIRIE_LOOK, jitterHSL } from '../look.js';

const COUNTS = {
  high: { tile: 380, cells: 4, seedGrass: 1500, scrub: 340, aloe: 260 },
  medium: { tile: 300, cells: 3, seedGrass: 800, scrub: 200, aloe: 150 },
  low: { tile: 230, cells: 2, seedGrass: 200, scrub: 56, aloe: 48 },
};

// How each standard cover type answers the region map.
export const PRAIRIE_KINDS = {
  micro: { bias: [1, 0.9, -0.7, 2], grow: 0.3, tint: 1 },
  tuft: { bias: [1, 0.8, -0.6, 2], grow: 0.35, tint: 1 },
  flower: { bias: [1, 1.6, -1, 2], grow: 0.2, tint: 0 },
  pebble: { bias: [0.7, -0.5, 0.6, -0.5], grow: 0, tint: 0 },
  tussock: { bias: [1.1, 0.8, -0.7, 2], grow: 0.45, tint: 1 },
  shrub: { bias: [1.15, 0.9, -0.7, 2], grow: 0.3, tint: 0.8 },
  stone: { bias: [0.6, -0.5, 0.8, -0.3], grow: 0, tint: 0 },
};

function sheet() {
  const pos = [];
  const col = [];
  const nor = [];
  const idx = [];
  return {
    vertex(x, y, z, shade, nx = 0, nz = 0) {
      pos.push(x, y, z);
      col.push(shade[0], shade[1], shade[2]);
      nor.push(nx * 0.3, 0.95, nz * 0.3);
      return pos.length / 3 - 1;
    },
    tri(a, b, c) {
      idx.push(a, b, c);
    },
    build() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      return geo;
    },
  };
}

const grey = (v) => [v, v, v * 0.92];

// A ribbon through `spine` points [x, y, z, halfWidth, shade], closed to a point at the last.
function ribbon(s, spine, sideX, sideZ) {
  let prev = null;
  for (let i = 0; i < spine.length; i++) {
    const [x, y, z, half, shade] = spine[i];
    if (i === spine.length - 1) {
      const tip = s.vertex(x, y, z, shade, sideZ, -sideX);
      s.tri(prev[0], prev[1], tip);
      return;
    }
    const a = s.vertex(x - sideX * half, y, z - sideZ * half, shade, sideZ, -sideX);
    const b = s.vertex(x + sideX * half, y, z + sideZ * half, shade, sideZ, -sideX);
    if (prev) {
      s.tri(prev[0], prev[1], b);
      s.tri(prev[0], b, a);
    }
    prev = [a, b];
  }
}

// Tall arching stems, some carrying a pale seed head: the grass the wind is seen in.
function seedGrassGeometry(rand) {
  const s = sheet();
  const head = PRAIRIE_LOOK.seedHead;
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2 + rand() * 0.9;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const h = 1.1 + rand() * 0.75;
    const lean = 0.18 + rand() * 0.3;
    const r0 = rand() * 0.12;
    const w = 0.035 + rand() * 0.02;
    const seeded = b % 2 === 1;
    const spine = [
      [dx * r0, 0, dz * r0, w, grey(0.5)],
      [dx * (r0 + lean * h * 0.35), h * 0.6, dz * (r0 + lean * h * 0.35), w * 0.75, grey(0.86)],
    ];
    if (seeded) {
      spine.push([dx * (r0 + lean * h * 0.72), h * 0.86, dz * (r0 + lean * h * 0.72), w * 2.3, head]);
    }
    spine.push([dx * (r0 + lean * h), h, dz * (r0 + lean * h), 0, seeded ? head : [1.05, 1.03, 0.9]]);
    ribbon(s, spine, -dz, dx);
  }
  return s.build();
}

// A leafless thorn bush: wiry forked twigs, bleached at the tips.
function scrubGeometry(rand) {
  const s = sheet();
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI * 2 + rand() * 0.8;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const h = 0.7 + rand() * 0.6;
    const out = 0.5 + rand() * 0.5;
    const w = 0.04 + rand() * 0.02;
    const kink = (rand() - 0.5) * 0.5;
    const mx = dx * out * 0.45 - dz * kink * 0.3;
    const mz = dz * out * 0.45 + dx * kink * 0.3;
    ribbon(s, [
      [0, 0, 0, w, grey(0.55)],
      [mx, h * 0.55, mz, w * 0.7, grey(0.8)],
      [dx * out - dz * kink, h, dz * out + dx * kink, 0, grey(1.5)],
    ], -dz, dx);
    ribbon(s, [
      [mx, h * 0.55, mz, w * 0.6, grey(0.8)],
      [mx + dx * out * 0.2 + dz * 0.3, h * (0.85 + rand() * 0.3), mz + dz * out * 0.2 - dx * 0.3, 0, grey(1.5)],
    ], -dz, dx);
  }
  return s.build();
}

// A rosette of fat leaves under one tall flame-coloured bloom.
function aloeGeometry(rand) {
  const s = sheet();
  for (let b = 0; b < 6; b++) {
    const a = (b / 6) * Math.PI * 2 + rand() * 0.5;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const len = 0.5 + rand() * 0.3;
    const rise = 0.25 + rand() * 0.4;
    ribbon(s, [
      [dx * 0.04, 0.02, dz * 0.04, 0.1, grey(0.6)],
      [dx * len * 0.55, rise * 0.75, dz * len * 0.55, 0.075, grey(0.95)],
      [dx * len, rise, dz * len, 0, [1.2, 1.15, 0.95]],
    ], -dz, dx);
  }
  const bloom = PRAIRIE_LOOK.aloeBloom;
  const top = 1.0 + rand() * 0.35;
  const lean = (rand() - 0.5) * 0.16;
  ribbon(s, [
    [0, 0.1, 0, 0.022, grey(0.7)],
    [lean * 0.6, top * 0.62, 0, 0.022, grey(0.9)],
    [lean * 0.8, top * 0.74, 0, 0.085, bloom],
    [lean, top, 0, 0, bloom.map((v) => v * 1.25)],
  ], 0.7, 0.7);
  return s.build();
}

export function extendPrairieCover({ add, layer, rand, tier, cover }) {
  const counts = COUNTS[tier] || COUNTS.medium;
  const meadow = layer(counts.tile, 0.34, [5, 9, 0], 95);
  const look = PRAIRIE_LOOK;

  add(meadow, counts.cells, seedGrassGeometry(rand), cover({ side: THREE.DoubleSide }), counts.seedGrass, 0.05, false, (o, c) => {
    const s = 0.8 + rand() * 0.7;
    o.scale.set(s, s * (0.8 + rand() * 0.5), s);
    jitterHSL(c, rand, look.seedGrass);
  }, { bias: [0.22, 1.5, -0.6, 2], grow: 0.3, tint: 0.5 });

  add(meadow, counts.cells, scrubGeometry(rand), cover({ side: THREE.DoubleSide }), counts.scrub, 0.012, false, (o, c) => {
    const s = 0.9 + rand() * 1.1;
    o.scale.set(s, s * (0.8 + rand() * 0.5), s);
    jitterHSL(c, rand, look.scrub);
  }, { bias: [0.04, -0.4, 1.2, 0.6], grow: 0, tint: 0 });

  add(meadow, counts.cells, aloeGeometry(rand), cover({ side: THREE.DoubleSide }), counts.aloe, 0, false, (o, c) => {
    const s = 0.9 + rand() * 0.9;
    o.scale.setScalar(s);
    jitterHSL(c, rand, look.aloe);
  }, { bias: [0.12, -0.4, 1.0, 0.8], grow: 0, tint: 0 });
}
