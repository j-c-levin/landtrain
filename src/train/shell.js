import * as THREE from 'three';
import { CAR_LEN, CAR_CENTERS, LADDERS } from '../constants.js';
import { painted } from '../look.js';
import { box, profiledBox, curvedRoof, instancedDetails } from './parts.js';

export function cabinSides(train, g, zone, center, length, base, eave, wall, windows, z = 2.36) {
  const M = train.materials;
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
    let edge = center - length / 2;
    for (const [wx, width] of windows) {
      const left = wx - width / 2;
      const right = wx + width / 2;
      panels.push([(edge + left) / 2, (sill + lintel) / 2, sz, left - edge, lintel - sill, 0.2]);
      for (const px of [left, right]) frames.push([px, (sill + lintel) / 2, sz + side * 0.09, 0.14, lintel - sill + 0.2, 0.3]);
      frames.push([wx, sill, sz + side * 0.14, width + 0.32, 0.14, 0.46]);
      frames.push([wx, lintel, sz + side * 0.09, width + 0.28, 0.13, 0.3]);
      frames.push([wx + width * 0.15, (sill + lintel) / 2, sz, 0.075, lintel - sill, 0.18]);
      edge = right;
    }
    const end = center + length / 2;
    panels.push([(edge + end) / 2, (sill + lintel) / 2, sz, end - edge, lintel - sill, 0.2]);
    instancedDetails(panels, train.geometry.detail, side > 0 ? train.nearWallMat(zone, wall) : wall, g, true);
    if (side < 0) {
      const lining = panels.map(([x, y, , w, h]) => [x, y, sz + 0.108, w, h, 0.02]);
      lining.push([center, eave - 0.2, sz + 0.14, length, 0.1, 0.06]);
      instancedDetails(lining, train.geometry.detail, painted(wall), g).receiveShadow = true;
    }
    frames.push([center, base + 0.16, sz + side * 0.12, length, 0.18, 0.2]);
    frames.push([center, eave, sz, length + 0.12, 0.16, 0.24]);
    instancedDetails(frames, train.geometry.detail, material(M.woodDark), g, true);
    const boards = [];
    for (let px = center - length / 2 + 0.45; px < end; px += 0.65) boards.push([px, base + 0.43, sz + side * 0.105, 0.018, 0.55, 0.015]);
    instancedDetails(boards, train.geometry.detail, material(M.wood), g);
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
  const isEngine = ci === 1;
  const zone = 'car' + ci;

  const chassis = [[0, 1.27, -1.65, CAR_LEN + 1.6, 0.34, 0.3], [0, 1.27, 1.65, CAR_LEN + 1.6, 0.34, 0.3]];
  for (const x of [-5.4, -3.2, 0, 3.2, 5.4]) chassis.push([x, 1.22, 0, 0.24, 0.28, 4.8]);
  instancedDetails(chassis, train.geometry.detail, M.iron, g, true);
  profiledBox(CAR_LEN + 0.2, 0.28, 4.9, 0.1, M.wood, 0, 1.64, 0, g);
  const decking = [];
  for (let x = -6.6; x < 7; x += 0.6) decking.push([x, 1.782, 0, 0.025, 0.008, 4.65]);
  instancedDetails(decking, train.geometry.detail, M.woodDark, g);

  if (!isEngine) {
    const eave = ci === 2 ? 4.75 : 4.67;
    cabinSides(train, g, zone, isCab ? 0.625 : 0, isCab ? 15.05 : 13.8, 1.78, eave, ci === 2 ? M.sage : M.cream,
      ci === 2 ? [[-3.9, 2.5], [0, 2.8], [3.9, 2.5]] : [[-4.6, 2.4], [-0.8, 2.4], [3.7, 3.8]]);
    const front = isCab ? 8.15 : 6.9;
    for (const x of [-6.9, front]) {
      box(0.22, eave - 1.78, 1.65, painted(M.innerWall), x, (eave + 1.78) / 2, -1.5, g);
      box(0.22, eave - 1.78, 0.95, train.fadingMat(zone, ci === 2 ? M.sage : M.cream), x, (eave + 1.78) / 2, 1.9, g);
      box(0.22, 0.35, 2.1, painted(M.woodDark), x, eave - 0.175, 0.35, g);
    }
    paintedFloor(train, g, (front - 6.9) / 2, front + 6.9 - 0.22, 1.78, 0, 4.52);
  }
  if (isCab) curvedRoof(15.6, 5.5, 0.6, M.copper, train.fadingMat(zone, M.copper), 0.5, 5.05, g);

  // wheels: two bogies of two, both sides
  for (const bx of [-4.3, 4.3]) {
    for (const wx of [-1.1, 1.1]) {
      for (const wz of [-2.48, 2.48]) {
        const wheel = new THREE.Mesh(train.geometry.wheel, M.wheel);
        wheel.position.set(bx + wx, 0.92, wz);
        wheel.castShadow = true;
        g.add(wheel);
        train.wheels.push(wheel);
        const hub = new THREE.Mesh(train.geometry.wheelHub, M.wheelBoss);
        wheel.add(hub);
        const spokes = [];
        for (let a = 0; a < Math.PI - 0.01; a += Math.PI / 4) spokes.push([0, 0, Math.sign(wz) * 0.24, 1.5, 0.09, 0.06, 0, 0, a]);
        instancedDetails(spokes, train.geometry.detail, M.spoke, wheel);
      }
    }
  }
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
  instancedDetails(runningGear, train.geometry.detail, M.iron, g, true);
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
