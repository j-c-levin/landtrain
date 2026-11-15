import * as THREE from 'three';
import { CAR_LEN, CAR_CENTERS, LADDERS } from '../constants.js';
import { painted, shaded, getLookTier } from '../look.js';
import { box, profiledBox, curvedRoof, instancedDetails, shadeInstances, hash } from './parts.js';
import { exteriorKit } from './interior-kit.js';

export const CAR_WINDOWS = [
  [[-4.6, 2.4], [-0.8, 2.4], [3.7, 3.8]],
  [[-4.75, 2.0], [0.5, 1.9], [4.5, 2.6]],
  [[-3.9, 2.5], [0, 2.8], [3.9, 2.5]],
];
// how brightly each window in CAR_WINDOWS order is lit from inside
export const WINDOW_LIGHT = { car0: [0.8, 1, 0.3], car1: [0.5, 1, 0.78], car2: [0.9, 1, 0.28], cab: [1, 0.62] };

const PATCH = new THREE.Color(0.86, 0.82, 0.74);
const DUST = new THREE.Color(0.7, 0.5, 0.3);

// Rain streaks under sills and eaves and the odd off-tone panel, laid matte over the enamel.
function weatherSide(train, g, material, wall, seed, side, sz, center, length, base, eave, sill, lintel, windows) {
  const marks = [];
  const tones = [];
  const z = sz + side * 0.104;
  const mark = (x, y, w, h, tone) => { marks.push([x, y, z, w, h, 0.012]); tones.push(tone); };
  let n = seed;
  const r = () => hash(n++);
  let edge = center - length / 2;
  for (const [wx, width] of windows) {
    const left = wx - width / 2;
    for (const cx of [left + 0.05, wx + width / 2 - 0.05, wx + (r() - 0.5) * width * 0.6]) {
      const h = 0.3 + r() * 0.45;
      mark(cx + (r() - 0.5) * 0.12, sill - 0.08 - h / 2, 0.07 + r() * 0.08, h, 0.5 + r() * 0.16);
    }
    if (left - edge > 0.7) {
      const w = (left - edge) * (0.45 + r() * 0.3);
      const h = (lintel - sill) * (0.4 + r() * 0.35);
      mark(edge + (left - edge) * (0.3 + r() * 0.4), sill + h / 2 + r() * (lintel - sill - h), w, h, r() < 0.5 ? 0.8 : 1.06);
    }
    edge = wx + width / 2;
  }
  for (let x = center - length / 2 + 0.5; x < center + length / 2 - 0.3; x += 0.7 + r() * 1.3) {
    const h = 0.1 + r() * Math.min(0.3, eave - lintel - 0.2);
    mark(x, eave - 0.09 - h / 2, 0.08 + r() * 0.12, h, 0.5 + r() * 0.16);
  }
  mark(center, base + 0.25, length, 0.1, 0.6);
  const mesh = instancedDetails(marks, train.geometry.panel, material, g);
  const grime = new THREE.Color();
  tones.forEach((tone, i) => mesh.setColorAt(i, grime.copy(wall.color).multiplyScalar(tone).multiply(tone > 0.7 ? PATCH : DUST)));
  mesh.receiveShadow = true;
}

// trim: { stripe, studs } materials for a coach line under the windows and pins along the rails.
export function cabinSides(train, g, zone, center, length, base, eave, wall, windows, z = 2.36, trim = null, tone = [0.9, 1, 0.92, 0.12]) {
  const M = train.materials;
  const sheet = train.weathered(wall);
  const sill = base + 0.85;
  const lintel = Math.min(base + 2.29, eave - 0.38);
  for (const side of [-1, 1]) {
    const sz = side * z;
    const material = (source) => side > 0 ? train.fadingMat(zone, source) : source;
    const panels = [
      [center, base + 0.425, sz, length, 0.85, 0.2],
      [center, (eave + lintel) / 2, sz, length, eave - lintel, 0.2],
    ];
    const frames = [];
    const panes = [];
    let edge = center - length / 2;
    for (const [wx, width] of windows) {
      const left = wx - width / 2;
      const right = wx + width / 2;
      panels.push([(edge + left) / 2, (sill + lintel) / 2, sz, left - edge, lintel - sill, 0.2]);
      for (const px of [left, right]) frames.push([px, (sill + lintel) / 2, sz + side * 0.09, 0.14, lintel - sill + 0.2, 0.3]);
      frames.push([wx, sill, sz + side * 0.14, width + 0.32, 0.14, 0.46]);
      frames.push([wx, lintel, sz + side * 0.09, width + 0.28, 0.13, 0.3]);
      frames.push([wx + width * 0.15, (sill + lintel) / 2, sz, 0.075, lintel - sill, 0.18]);
      panes.push([wx, (sill + lintel) / 2, sz, width, lintel - sill, 0.02]);
      edge = right;
    }
    const end = center + length / 2;
    panels.push([(edge + end) / 2, (sill + lintel) / 2, sz, end - edge, lintel - sill, 0.2]);
    const sheetSide = side > 0 ? train.nearWallMat(zone, sheet) : sheet;
    shadeInstances(instancedDetails(panels, train.geometry.panel, sheetSide, g, true),
      (i) => (i === 0 ? tone[0] : i === 1 ? tone[1] : tone[2] + hash(i + center) * tone[3]));
    const lit = WINDOW_LIGHT[zone];
    const glass = instancedDetails(panes, train.geometry.detail, train.zoneGlass(zone, side < 0), g);
    shadeInstances(glass, (i) => lit[i] ?? 1).renderOrder = 3;
    if (getLookTier() !== 'low') {
      weatherSide(train, g, side > 0 ? train.fadingMat(zone, train.materials.paintBase) : train.materials.paintBase, wall, Math.round(center * 10) + (side > 0 ? 40 : 90) + base * 7, side, sz, center, length, base, eave, sill, lintel, windows);
    }
    if (side > 0 && getLookTier() !== 'low') {
      const glints = [];
      windows.forEach(([wx, width], i) => {
        const pick = hash(wx * 3.1 + base);
        if (pick < 0.3) return;
        const gx = wx - width / 2 + 0.3 + hash(i + base) * Math.max(0.1, width * 0.55 - 0.6);
        const gy = lintel - 0.32 - hash(i * 5 + center) * 0.3;
        glints.push([gx, gy, sz + 0.02, 0.3 + pick * 0.24, 0.026, 0.004, 0, 0, 0.95]);
        if (pick > 0.62) glints.push([gx + 0.2, gy - 0.1, sz + 0.02, 0.2, 0.018, 0.004, 0, 0, 0.95]);
      });
      if (glints.length) instancedDetails(glints, train.geometry.detail, train.zoneGlass(zone, false, true), g).renderOrder = 4;
    }
    if (side < 0) {
      const lining = panels.map(([x, y, , w, h]) => [x, y, sz + 0.108, w, h, 0.02]);
      lining.push([center, eave - 0.2, sz + 0.14, length, 0.1, 0.06]);
      instancedDetails(lining, train.geometry.detail, painted(trim?.lining ?? wall), g).receiveShadow = true;
    }
    frames.push([center, base + 0.16, sz + side * 0.12, length, 0.18, 0.2]);
    frames.push([center, eave, sz, length + 0.12, 0.16, 0.24]);
    instancedDetails(frames, train.geometry.detail, material(M.woodDark), g, true);
    const boards = [];
    for (let px = center - length / 2 + 0.45; px < end; px += 0.65) boards.push([px, base + 0.43, sz + side * 0.105, 0.018, 0.55, 0.015]);
    instancedDetails(boards, train.geometry.detail, material(M.wood), g);
    if (!trim) continue;
    instancedDetails([[center, base + 0.68, sz + side * 0.105, length - 0.2, 0.05, 0.014]], train.geometry.detail, material(trim.stripe), g);
    if (getLookTier() !== 'high') continue;
    const studs = [];
    for (let px = center - length / 2 + 0.3; px < end; px += 0.6) {
      studs.push([px, base + 0.16, sz + side * 0.225, 0.05, 0.05, 0.02]);
      studs.push([px, eave, sz + side * 0.125, 0.05, 0.05, 0.02]);
    }
    train.tuck(instancedDetails(studs, train.geometry.detail, material(trim.studs), g));
  }
}

// Painted boards laid over the enamel deck, stopping short of the cut edge.
export function paintedFloor(train, g, center, length, base, z, depth, material = painted(train.materials.wood)) {
  const boards = [[center, base + 0.008, z, length, 0.012, depth]];
  instancedDetails(boards, train.geometry.detail, material, g).receiveShadow = true;
  if (material.transparent) return;
  const seams = [];
  for (let x = center - length / 2 + 0.3; x < center + length / 2; x += 0.6) seams.push([x, base + 0.0155, z, 0.03, 0.003, depth]);
  instancedDetails(seams, train.geometry.detail, painted(train.materials.woodDark), g);
}

export function buildCarShell(train, g, ci) {
  const M = train.materials;
  const isCab = ci === 0;
  const zone = 'car' + ci;

  const chassis = [[0, 1.27, -1.65, CAR_LEN + 1.6, 0.34, 0.3], [0, 1.27, 1.65, CAR_LEN + 1.6, 0.34, 0.3]];
  for (const x of [-5.4, -3.2, 0, 3.2, 5.4]) chassis.push([x, 1.22, 0, 0.24, 0.28, 4.8]);
  instancedDetails(chassis, train.geometry.detail, M.frameIron, g, true);
  profiledBox(CAR_LEN + 0.2, 0.28, 4.9, 0.1, M.wood, 0, 1.64, 0, g);
  const decking = [];
  for (let x = -6.6; x < 7; x += 0.6) decking.push([x, 1.782, 0, 0.025, 0.008, 4.65]);
  instancedDetails(decking, train.geometry.detail, M.woodDark, g);

  const eave = ci === 2 ? 4.75 : 4.67;
  const wall = [M.cream, M.engineHull, M.sage][ci];
  const trim = [{ stripe: M.hull, studs: M.brass }, { stripe: M.brass, studs: M.brass }, { stripe: M.cream, studs: M.brass, lining: M.readingLining }][ci];
  cabinSides(train, g, zone, isCab ? 0.625 : 0, isCab ? 15.05 : 13.8, 1.78, eave, wall, CAR_WINDOWS[ci], 2.36, trim,
    ci === 1 ? [0.8, 0.9, 1.08, 0.14] : undefined);
  const front = isCab ? 8.15 : 6.9;
  for (const x of [-6.9, front]) {
    box(0.22, eave - 1.78, 1.65, shaded(M.endWall), x, (eave + 1.78) / 2, -1.5, g);
    box(0.22, eave - 1.78, 0.95, train.fadingMat(zone, wall), x, (eave + 1.78) / 2, 1.9, g);
    box(0.22, 0.35, 2.1, painted(M.woodDark), x, eave - 0.175, 0.35, g);
  }
  paintedFloor(train, g, (front - 6.9) / 2, front + 6.9 - 0.22, 1.78, 0, 4.52);
  if (isCab) {
    const sheet = train.weathered(M.copper);
    curvedRoof(15.6, 5.5, 0.6, sheet, train.fadingMat(zone, sheet), 0.5, 5.05, g, { patina: true });
  }

  // wheels: two bogies of two, both sides
  for (const bx of [-4.3, 4.3]) {
    for (const wx of [-1.1, 1.1]) {
      for (const wz of [-2.48, 2.48]) {
        const wheel = new THREE.Mesh(train.geometry.wheel, M.wheel);
        wheel.position.set(bx + wx, 0.92, wz);
        wheel.castShadow = true;
        g.add(wheel);
        train.wheels.push(wheel);
        const hub = new THREE.Mesh(train.geometry.wheelHub, M.gearBrass);
        wheel.add(hub);
        const spokes = [];
        for (let a = 0; a < Math.PI - 0.01; a += Math.PI / 4) spokes.push([0, 0, Math.sign(wz) * 0.24, 1.5, 0.09, 0.06, 0, 0, a]);
        instancedDetails(spokes, train.geometry.detail, M.cream, wheel);
      }
    }
  }
  for (const side of [-1, 1]) {
    const rods = new THREE.Group();
    rods.userData.phase = side > 0 ? 0 : Math.PI / 2;
    const bars = [];
    const pins = [];
    for (const bx of [-4.3, 4.3]) {
      bars.push([bx, 0.92, side * 2.86, 2.52, 0.13, 0.06]);
      for (const wx of [-1.1, 1.1]) pins.push([bx + wx, 0.92, side * 2.85, 0.095, 0.095, 0.15]);
    }
    instancedDetails(bars, train.geometry.detail, M.iron, rods);
    instancedDetails(pins, train.geometry.pin, M.gearBrass, rods);
    g.add(rods);
    train.rods.push(rods);
    train.tuck(rods);
  }
}

// Queen-post truss under the floor and whatever each car slings between its bogies.
function buildUnderframe(train, g, ci) {
  const M = train.materials;
  const gear = [];
  for (const z of [-1.9, 1.9]) {
    gear.push([0, 0.55, z, 3.0, 0.07, 0.07]);
    for (const side of [-1, 1]) {
      gear.push([side * 1.5, 0.83, z, 0.1, 0.62, 0.1]);
      gear.push([side * 2.4, 0.835, z, 1.89, 0.07, 0.07, 0, 0, side * 0.307]);
    }
  }
  train.tuck(instancedDetails(gear, train.geometry.detail, M.frameIron, g));
  if (getLookTier() === 'low') return;
  const k = exteriorKit(g, 'underframe');
  const { block, round } = k;
  const tank = (x, r, len, material) => {
    round(r, len, r, material, x, 0.86, -1.1).rotation.z = Math.PI / 2;
    for (const dx of [-len * 0.32, len * 0.32]) round(r + 0.025, 0.09, r + 0.025, M.iron, x + dx, 0.86, -1.1).rotation.z = Math.PI / 2;
    round(0.08, 0.12, 0.08, M.brass, x + len * 0.18, 0.86 + r, -1.1);
  };
  if (ci === 0) tank(-0.2, 0.4, 2.7, M.engine);
  if (ci === 1) {
    block(2.3, 0.46, 1.5, M.sootGrime, 0.5, 0.99, -1.2);
    block(2.42, 0.06, 1.6, M.iron, 0.5, 0.75, -1.2);
    block(0.5, 0.3, 0.06, M.iron, 0.5, 0.99, -0.43);
    tank(-1.5, 0.3, 1.2, M.copper);
  }
  if (ci === 2) {
    block(2.2, 0.62, 0.9, M.woodDark, 0.2, 0.9, -1.2);
    block(2.3, 0.06, 1.0, M.wood, 0.2, 1.22, -1.2);
    for (const x of [-0.5, 0.9]) block(0.09, 0.64, 0.92, M.iron, x, 0.9, -1.2);
    block(0.16, 0.14, 0.04, M.brass, 0.2, 1.02, -0.74);
  }
  k.finish().traverse((object) => { object.castShadow = false; });
  train.tuck(k.root);
}

function buildExteriorDetails(train, g, ci) {
  const M = train.materials;
  const runningGear = [];
  const springs = [];
  for (const z of [-2.18, 2.18]) {
    for (const x of [-4.3, 4.3]) {
      runningGear.push([x, 1.04, z, 3.25, 0.22, 0.25]);
      for (let i = 0; i < 3; i++) springs.push([x, 1.35 + i * 0.075, z, 1.4 + i * 0.32, 0.045, 0.24]);
    }
    runningGear.push([0, 1.63, z, 13.9, 0.2, 0.16]);
  }
  buildUnderframe(train, g, ci);
  instancedDetails(runningGear, train.geometry.detail, M.frameIron, g, true);
  instancedDetails(springs, train.geometry.detail, M.engine, g);

  for (const gapX of ci === 0 ? [-8.55] : ci === 2 ? [8.55] : []) {
    instancedDetails([
      [gapX, 1.05, -0.62, 1, 1, 1, 0, Math.PI / 2],
      [gapX, 1.05, 0.62, 1, 1, 1, 0, Math.PI / 2],
    ], new THREE.TorusGeometry(0.4, 0.08, 6, 12, Math.PI), M.iron, g);
  }
}

export function buildCarFittings(train, g, ci) {
  const M = train.materials;
  buildExteriorDetails(train, g, ci);

  const ladderParts = [];
  for (const l of LADDERS) {
    const rel = l.x - CAR_CENTERS[ci];
    if (Math.abs(rel) > CAR_LEN / 2 + 1.5) continue;
    const tall = l.levels.includes('roof');
    const h = tall ? 5.3 : 2.6;
    for (const rz of [0.62, 1.18]) {
      ladderParts.push([rel, h / 2, rz + 0.95, 0.13, h, 0.13]);
    }
    for (let y = 0.45; y < h - 0.1; y += 0.48) {
      ladderParts.push([rel, y, 1.85, 0.11, 0.11, 0.62]);
    }
  }
  if (ladderParts.length) instancedDetails(ladderParts, train.geometry.detail, M.iron, g, true);

  // gap walkway plank + coupler off the inward end
  const gapRel = ci === 0 ? -8.3 : ci === 2 ? 8.3 : null;
  if (gapRel !== null) {
    box(2.4, 0.22, 1.8, M.woodDark, gapRel, 1.67, 0.3, g);
    box(ci === 0 ? 1.8 : 1.7, 0.14, 1.9, M.iron, ci === 0 ? -8.2 : 8.25, 4.98, 0, g);
    box(2.2, 0.4, 0.4, M.iron, gapRel, 1.1, 0, g);
  }
}
