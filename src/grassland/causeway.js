import * as THREE from 'three';
import { GRASSLAND_LOOK, grasslandMaterials, floraMaterials, softDiscTexture, jitterHSL } from '../look.js';
import { mulberry } from '../prng.js';
import { DEPTH, WATER_Y } from './layout.js';

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const hsl = {};

// A low timber causeway on piles: cross-planked deck with a worn running way,
// kerbs strapped in iron, post-and-rail fences, stone abutments and thresholds
// at each bank and brass lanterns at the corners and mid-span. `u` runs along
// the crossing, `v` across the path; nothing taller than the kerb stands
// inside vWidth.
export function buildCauseway(root, rand, glowMat, { axis, uCenter, uSpan, vCenter, vWidth, shore, planks = 9 }) {
  const L = GRASSLAND_LOOK.causeway;
  const group = new THREE.Group();
  const X = axis === 'x';
  const boxes = [], stones = [], piles = [], glass = [], roofs = [], rings = [], pools = [];
  const box = (list, u, y, v, lu, h, lv, color, ry = 0) =>
    list.push(X ? [u, y, v, lu, h, lv, ry, color] : [v, y, u, lv, h, lu, -ry, color]);
  const world = (u, v) => (X ? [u, v] : [v, u]);

  // the world stream is drawn exactly as before; all variety has its own
  for (let i = 0; i < planks; i++) rand();
  const local = mulberry(Math.round(uCenter * 13 + vCenter * 7) >>> 0);
  const shade = (hex, spread = 0.06) => {
    tint.set(hex).getHSL(hsl);
    return new THREE.Color().setHSL(hsl.h + (local() - 0.5) * 0.012, hsl.s * (0.85 + local() * 0.2), hsl.l + (local() - 0.5) * spread);
  };

  const u0 = uCenter - uSpan / 2;
  const PLANK = 1.1;
  const count = Math.floor(uSpan / PLANK);
  for (let i = 0; i < count; i++) {
    const over = vWidth + 0.5 + local() * 1.1;
    const shift = (local() - 0.5) * 0.7;
    box(boxes, u0 + (i + 0.5) * PLANK, 0.12 + local() * 0.02, vCenter + shift, PLANK - 0.12, 0.24, over,
      shade(L.deck, L.deckJitter), (local() - 0.5) * 0.012);
  }

  // running way: long boards laid over the cross planks where the wheels go
  for (const row of [-1, 0, 1]) {
    let u = u0 - 1.5 + local() * 3;
    while (u < u0 + uSpan + 1) {
      const len = 6.5 + local() * 4;
      const a = Math.max(u, u0 - 1.4), b = Math.min(u + len, u0 + uSpan + 1.4);
      box(boxes, (a + b) / 2, 0.245, vCenter + row * 1.72, b - a - 0.1, 0.1, 1.6, shade(L.runner, 0.05));
      u += len;
    }
  }

  const edge = vWidth / 2 + 1.5;
  const kerb = vWidth / 2 + 0.75;
  const beam = new THREE.Color(L.beam);
  const post = new THREE.Color(L.post);
  const rail = new THREE.Color(L.rail);
  const iron = new THREE.Color(GRASSLAND_LOOK.iron);
  for (const side of [-1, 1]) {
    box(boxes, uCenter, 0.24, vCenter + side * kerb, uSpan + 1.2, 0.56, 0.74, beam);
    const straps = Math.round(uSpan / 8);
    for (let i = 0; i <= straps; i++) {
      box(boxes, u0 + (i / straps) * uSpan, 0.26, vCenter + side * kerb, 0.26, 0.62, 0.82, iron);
    }
    const posts = Math.round(uSpan / 7);
    for (let i = 0; i <= posts; i++) {
      box(boxes, u0 + (i / posts) * uSpan, 0.85, vCenter + side * edge, 0.34, 1.7, 0.34, post);
    }
    box(boxes, uCenter, 1.62, vCenter + side * edge, uSpan + 0.8, 0.17, 0.2, rail);
    box(boxes, uCenter, 0.95, vCenter + side * edge, uSpan, 0.13, 0.13, rail);
  }

  // pile bents down into the channel, each ringed where it breaks the water
  const bents = Math.max(2, Math.round(uSpan / 9.5));
  const pileV = [-(vWidth / 2 + 0.75), -vWidth / 6, vWidth / 6, vWidth / 2 + 0.75];
  for (let b = 0; b < bents; b++) {
    const u = u0 + ((b + 0.5) / bents) * uSpan;
    box(boxes, u, -0.3, vCenter, 0.72, 0.52, vWidth + 2.6, beam);
    for (const pv of pileV) {
      piles.push([...world(u, vCenter + pv), 0.44]);
      if (Math.abs(u - uCenter) < shore - 0.6) rings.push([...world(u, vCenter + pv), 1.05 + local() * 0.3]);
    }
  }

  // low enough at mid-span to pass under the lens, tall on the banks
  const lantern = (u, v, postH, foot, onWater = false) => {
    const [x, z] = world(u, v);
    box(boxes, u, (postH + foot) / 2, v, 0.42, postH - foot, 0.42, post);
    box(boxes, u, postH + 0.02, v, 0.9, 0.12, 0.9, beam);
    glass.push([x, postH + 0.42, z]);
    roofs.push([x, postH + 0.96, z]);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(onWater ? 4.5 : 6.5);
    glow.position.set(x, postH + 0.45, z);
    group.add(glow);
    if (onWater) {
      piles.push([x, z, 0.3]);
      rings.push([x, z, 0.8]);
      pools.push([x, z]);
    }
  };

  // stonework: a flagged threshold where the deck lands, wing walls stepping
  // down each bank, and a plinth under every corner lantern
  const stone = () => jitterHSL(new THREE.Color(), local, GRASSLAND_LOOK.stonework);
  for (const end of [-1, 1]) {
    const uEnd = uCenter + end * (uSpan / 2);
    let v = -vWidth / 2 - 0.4;
    while (v < vWidth / 2 + 0.4) {
      const w = Math.min(1.9 + local() * 1.6, vWidth / 2 + 0.4 - v);
      box(stones, uEnd + end * 1.25, 0.02 + local() * 0.05, vCenter + v + w / 2, 2.3 + local() * 0.5, 0.36, w - 0.1, stone());
      v += w;
    }
    for (const side of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const inward = k * 2.05;
        const drop = Math.max(0, k - 1) * 0.42;
        box(stones, uEnd - end * (inward - 0.6), 0.1 - drop, vCenter + side * (edge + 1.35 + (local() - 0.5) * 0.2),
          2.0 + local() * 0.25, 1.25 + local() * 0.2, 1.5 + local() * 0.3, stone(), (local() - 0.5) * 0.06);
      }
      // the wing splays out onto the bank and ends in a lantern plinth, clear of the lens
      for (let k = 1; k <= 4; k++) {
        box(stones, uEnd + end * k * 1.5, 0.22 + local() * 0.1, vCenter + side * (edge + 1.35 + k * 1.5),
          2.2 + local() * 0.2, 1.2 + local() * 0.25, 1.4 + local() * 0.3, stone(), -Math.atan2(side, end));
      }
      const pu = uEnd + end * 7.4, pv = vCenter + side * (edge + 8.75);
      box(stones, pu, 0.45, pv, 2.0, 1.3, 2.0, stone());
      box(stones, pu, 1.2, pv, 1.5, 0.3, 1.5, stone());
      lantern(pu, pv, 4.6, 1.35);
    }
  }

  if (uSpan > 60) for (const vSide of [-1, 1]) lantern(uCenter, vCenter + vSide * (edge + 0.1), 1.5, -1.8, true);

  const instanced = (geometry, material, items, fit, shadow = true) => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    for (let i = 0; i < items.length; i++) {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      const color = fit(dummy, items[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (color) mesh.setColorAt(i, color);
    }
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    group.add(mesh);
  };
  const fitBox = (o, [x, y, z, sx, sy, sz, ry, color]) => {
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.rotation.y = ry;
    return color;
  };
  const unit = new THREE.BoxGeometry(1, 1, 1);
  instanced(unit, grasslandMaterials.causewayPlank(), boxes, fitBox);
  instanced(unit, grasslandMaterials.causewayStone(), stones, fitBox);
  const pileH = DEPTH + 0.2;
  instanced(new THREE.CylinderGeometry(0.85, 1, 1, 7, 1, true), grasslandMaterials.causewayPost(), piles, (o, [x, z, r]) => {
    o.position.set(x, -pileH / 2 - 0.1, z);
    o.scale.set(r, pileH, r);
  });
  instanced(new THREE.BoxGeometry(0.56, 0.7, 0.56), grasslandMaterials.causewayLantern(), glass, (o, [x, y, z]) => {
    o.position.set(x, y, z);
  }, false);
  instanced(new THREE.ConeGeometry(0.66, 0.42, 4), grasslandMaterials.causewayBrass(), roofs, (o, [x, y, z]) => {
    o.position.set(x, y, z);
    o.rotation.y = Math.PI / 4;
  });
  const foam = new THREE.Color(GRASSLAND_LOOK.waterFoam);
  const ringGeo = new THREE.RingGeometry(0.5, 0.82, 12);
  ringGeo.rotateX(-Math.PI / 2);
  instanced(ringGeo, grasslandMaterials.lilyPads(), rings, (o, [x, z, s]) => {
    o.position.set(x, WATER_Y + 0.07, z);
    o.scale.set(s, 1, s);
    return foam;
  }, false);
  const disc = new THREE.CircleGeometry(1, 16);
  disc.rotateX(-Math.PI / 2);
  instanced(disc, grasslandMaterials.lightPool(L.pool, 0.55), pools, (o, [x, z]) => {
    o.position.set(x, WATER_Y + 0.1, z);
    o.scale.set(7, 1, 7);
  }, false);

  // worn earth where the track runs onto each bank
  const earth = floraMaterials.meadowPatch(GRASSLAND_LOOK.pathEarth, 0.85);
  earth.alphaMap = softDiscTexture('rgba(255,255,255,1)', 'rgba(0,0,0,0)');
  for (const end of [-1, 1]) {
    const apron = new THREE.Mesh(disc, earth);
    const [x, z] = world(uCenter + end * (uSpan / 2 + 5), vCenter);
    apron.position.set(x, 0.03, z);
    apron.scale.set(X ? 15 : vWidth * 0.62, 1, X ? vWidth * 0.62 : 15);
    apron.receiveShadow = true;
    group.add(apron);
  }

  root.add(group);
  return group;
}
