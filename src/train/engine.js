import * as THREE from 'three';
import { damp } from '../constants.js';
import { TRAIN_LOOK, getLookTier } from '../look.js';
import { box, profiledBox, curvedRoof, instancedDetails } from './parts.js';
import { CAR_WINDOWS } from './shell.js';
import { interiorKit, exteriorKit } from './interior-kit.js';

const ZONE = 'car1';
const BOILER = { x: 0.5, y: 3.25, r: 1.25, face: -0.55 };
const STACK = { x: 0.5, z: -1.4, top: 7.48 };
const CRANK = { x: 2.75, y: 2.9, r: 0.5, rod: 2.0, gland: 5.45 };
const HALF_PI = Math.PI / 2;

function buildHouse(train, g) {
  const M = train.materials;
  const fade = (source) => train.fadingMat(ZONE, source);
  const sheet = train.weathered(M.iron);
  curvedRoof(14.6, 5.5, 0.6, sheet, fade(sheet), 0, 5.05, g, { soot: [STACK.x, STACK.z, 1.7] });
  const seams = [];
  for (let x = -6.6; x < 7; x += 2.2) seams.push([x, 5.06, -0.6, 0.05, 0.03, 0.6]);
  instancedDetails(seams, train.geometry.detail, M.copper, g);

  for (const side of [-1, 1]) {
    const mat = (source) => side > 0 ? fade(source) : source;
    const z = side * 2.47;
    const straps = [[0, 4.42, z, 13.9, 0.14, 0.05]];
    const rivets = [];
    for (const x of [-6.72, -2.25, 2.2, 6.72]) {
      straps.push([x, 3.2, z, 0.17, 2.56, 0.05]);
      for (let y = 2.15; y < 4.4; y += 0.42) rivets.push([x, y, z + side * 0.03, 0.055, 0.055, 0.03]);
    }
    for (let x = -6.2; x < 6.5; x += 0.62) rivets.push([x, 4.42, z + side * 0.03, 0.055, 0.055, 0.03]);
    instancedDetails(straps, train.geometry.detail, mat(M.iron), g, true);
    instancedDetails(rivets, train.geometry.detail, mat(M.brass), g);
    box(1.15, 0.36, 0.05, mat(M.brass), BOILER.x, 2.22, z + side * 0.02, g, false);
    const brackets = [];
    for (const x of [-5.9, -2.25, 2.2, 5.9]) brackets.push([x, 4.5, side * 2.6, 0.12, 0.5, 0.12, side * 0.85]);
    instancedDetails(brackets, train.geometry.detail, mat(M.woodDark), g, true);
  }

  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.52, 3.0, 16), M.iron);
  stack.position.set(STACK.x, 5.8, STACK.z);
  stack.castShadow = true;
  g.add(stack);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.42, 0.32, 16, 1, true), M.sootGrime);
  lip.position.set(STACK.x, 7.32, STACK.z);
  g.add(lip);
  instancedDetails([
    [STACK.x, 5.04, STACK.z, 0.78, 0.16, 0.78],
    [STACK.x, 7.14, STACK.z, 0.47, 0.1, 0.47],
  ], new THREE.CylinderGeometry(1, 1, 1, 16), M.iron, g, true);
  instancedDetails([
    [STACK.x, 5.2, STACK.z, 0.6, 0.12, 0.6],
    [STACK.x, 6.45, STACK.z, 0.47, 0.12, 0.47],
    [-1.25, 5.3, -1.55, 0.09, 0.56, 0.09],
    [-1.25, 5.62, -1.55, 0.13, 0.12, 0.13],
  ], new THREE.CylinderGeometry(1, 1, 1, 14), M.brass, g, true);
  train.stackLocal = new THREE.Vector3(STACK.x, STACK.top, STACK.z);

  profiledBox(1.9, 0.36, 0.8, 0.08, M.hull, 4.6, 5.13, -1.5, g);
  box(2.1, 0.07, 0.98, M.iron, 4.6, 5.34, -1.5, g);
  const louvres = [];
  for (let x = 3.85; x < 5.4; x += 0.25) louvres.push([x, 5.13, -1.09, 0.16, 0.2, 0.03]);
  instancedDetails(louvres, train.geometry.detail, M.iron, g);

  const stays = [];
  for (const side of [-1, 1]) stays.push([STACK.x + side * 0.8, 5.78, STACK.z, 2.2, 0.035, 0.035, 0, 0, -side * 0.75]);
  if (getLookTier() !== 'low') for (let x = -6.4; x < 6.6; x += 0.45) stays.push([x, 5.068, 0.35, 0.05, 0.012, 0.96]);
  instancedDetails(stays, train.geometry.detail, M.iron, g);

  const k = exteriorKit(g, 'engine-roof');
  const { block, round } = k;
  block(13.5, 0.03, 1.0, M.iron, 0, 5.05, 0.35);
  for (const z of [-0.15, 0.85]) block(13.5, 0.05, 0.05, M.brass, 0, 5.06, z);
  round(0.52, 0.12, 0.52, M.iron, -3.4, 5.03, -1.45);
  const dome = k.mesh(new THREE.SphereGeometry(0.46, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), M.brass, -3.4, 5.08, -1.45);
  dome.scale.y = 1.15;
  round(0.09, 0.1, 0.09, M.brass, -3.4, 5.64, -1.45);
  for (const dx of [-0.16, 0.16]) {
    round(0.045, 0.34, 0.045, M.brass, -5.0 + dx, 5.2, -1.5);
    round(0.075, 0.06, 0.075, M.copper, -5.0 + dx, 5.38, -1.5);
  }
  block(0.62, 0.1, 0.3, M.iron, -5.0, 5.03, -1.5);
  const roofKit = k.finish();
  if (getLookTier() === 'low') roofKit.traverse((object) => { object.castShadow = false; });

  train.stackFlap = new THREE.Group();
  train.stackFlap.name = 'stack-flap';
  train.stackFlap.position.set(STACK.x + 0.62, 7.5, STACK.z);
  train.stackFlap.rotation.z = -0.1;
  const flap = new THREE.Mesh(train.geometry.drum, M.iron);
  flap.scale.set(0.66, 0.04, 0.66);
  flap.position.x = -0.62;
  flap.castShadow = true;
  const arm = new THREE.Mesh(train.geometry.detail, M.iron);
  arm.scale.set(0.42, 0.04, 0.06);
  arm.position.x = 0.2;
  const bob = new THREE.Mesh(train.geometry.drum, M.brass);
  bob.scale.set(0.13, 0.2, 0.13);
  bob.position.set(0.42, -0.08, 0);
  train.stackFlap.add(flap, arm, bob);
  g.add(train.stackFlap);
  instancedDetails([[STACK.x + 0.62, 7.42, STACK.z, 0.12, 0.2, 0.3], [STACK.x + 0.56, 7.3, STACK.z, 0.1, 0.1, 0.22]], train.geometry.detail, M.brass, g);
}

function buildLining(k, M) {
  const { block } = k;
  const z = -2.245;
  block(13.58, 0.85, 0.03, M.wood, 0, 2.205, z);
  block(13.58, 0.07, 0.07, M.woodDark, 0, 2.63, z + 0.02);
  block(13.58, 0.12, 0.06, M.woodDark, 0, 1.84, z + 0.02);
  for (let x = -6.5; x < 6.8; x += 0.5) block(0.02, 0.72, 0.012, M.woodDark, x, 2.22, z + 0.018);
  block(13.58, 0.6, 0.03, M.sootWall, 0, 4.37, z);
  let edge = -6.79;
  for (const [wx, width] of [...CAR_WINDOWS[1], [6.79 + 0.5, 1]]) {
    const left = wx - width / 2;
    block(left - edge, 1.44, 0.03, M.sootWall, (edge + left) / 2, 3.35, z);
    edge = wx + width / 2;
  }
  for (const [wx, width] of CAR_WINDOWS[1]) {
    block(width + 0.16, 0.07, 0.12, M.woodDark, wx, 2.66, z + 0.05);
    block(width + 0.16, 0.07, 0.06, M.woodDark, wx, 4.07, z + 0.02);
  }
  block(2.9, 0.022, 2.1, M.iron, -0.1, 1.795, 0.2);
  for (let x = -1.42; x < 1.3; x += 0.26) block(0.02, 0.008, 2.0, M.sootGrime, x, 1.81, 0.2);
}

function buildBoiler(train, k, M) {
  const { block, round, cushion, ring, pipe } = k;
  const { x, y, r, face } = BOILER;
  block(3.0, 0.42, 1.8, M.sootGrime, x, 1.99, -1.35);
  for (const side of [-1, 1]) block(0.42, 0.62, 1.7, M.sootGrime, x + side * 1.12, 2.4, -1.35);
  block(3.1, 0.08, 1.9, M.iron, x, 2.2, -1.35);
  k.mesh(new THREE.CylinderGeometry(r, r, 1.6, 32), M.engine, x, y, face - 0.8).rotation.x = HALF_PI;
  for (const z of [-0.95, -1.75]) k.mesh(new THREE.TorusGeometry(r + 0.012, 0.06, 6, 32), M.iron, x, y, z);
  ring(r - 0.04, 0.075, M.brass, x, y, face);
  for (let i = 0; i < 18; i++) {
    const a = (i + 0.5) * Math.PI / 9;
    round(0.038, 0.05, 0.038, M.brass, x + Math.cos(a) * 1.04, y + Math.sin(a) * 1.04, face).rotation.x = HALF_PI;
  }

  const door = 2.76;
  train.fireboxMat = M.firebox;
  cushion(1.62, 1.3, 0.09, M.sootGrime, x, door, face + 0.03);
  cushion(1.46, 1.16, 0.22, M.copper, x, door, face + 0.05);
  cushion(1.26, 0.98, 0.06, M.iron, x, door, face + 0.165);
  cushion(1.1, 0.84, 0.05, M.firebox, x, door, face + 0.195);
  k.arch(1.44, 0.18, 0.06, 0.08, M.brass, x, door + 0.55, face + 0.15);
  block(1.56, 0.13, 0.44, M.iron, x, door - 0.64, face + 0.14);
  for (let i = 0; i < 5; i++) block(0.04, 0.76, 0.045, M.iron, x - 0.36 + i * 0.18, door, face + 0.245);
  block(1.04, 0.05, 0.05, M.iron, x, door - 0.26, face + 0.255);
  train.flames = k.pivot('firebox-flames', x, door - 0.38, face + 0.225);
  for (let i = 0; i < 5; i++) {
    const h = 0.5 + (i % 3) * 0.11;
    const flame = k.mesh(new THREE.ConeGeometry(0.1, h, 7), M.ember, -0.36 + i * 0.18, h / 2, 0, true);
    flame.scale.z = 0.12;
    train.flames.add(flame);
  }
  const leaf = k.pivot('firebox-door', x + 0.74, door, face + 0.2);
  leaf.rotation.y = 1.0;
  leaf.add(block(0.56, 0.92, 0.07, M.iron, 0.28, 0, 0, true));
  leaf.add(block(0.4, 0.06, 0.03, M.brass, 0.28, 0.28, 0.05, true));
  leaf.add(block(0.4, 0.06, 0.03, M.brass, 0.28, -0.28, 0.05, true));
  leaf.add(block(0.07, 0.3, 0.09, M.brass, 0.5, 0, 0.06, true));

  train.pressureNeedle = k.dial(0.36, x, y + 0.72, face + 0.06, M, 'pressure-needle');
  const glass = x - 0.84;
  round(0.04, 0.56, 0.04, M.glass, glass, y + 0.3, face + 0.1);
  round(0.022, 0.3, 0.022, M.teal, glass, y + 0.17, face + 0.1);
  for (const dy of [0, 0.6]) block(0.13, 0.08, 0.16, M.brass, glass, y + dy, face + 0.06);

  k.mesh(new THREE.SphereGeometry(0.3, 18, 12), M.brass, x, y + r - 0.02, -0.92);
  round(0.33, 0.07, 0.33, M.brass, x, y + r - 0.02, -0.92);
  round(0.48, 0.5, 0.48, M.iron, STACK.x, 4.55, STACK.z);

  const kx = x + 1.12;
  const kettle = k.mesh(new THREE.SphereGeometry(0.17, 14, 10), M.copper, kx, 2.84, -0.78);
  kettle.scale.y = 0.8;
  round(0.07, 0.04, 0.07, M.brass, kx, 2.99, -0.78);
  ring(0.13, 0.018, M.iron, kx, 2.97, -0.78);
  pipe([[kx - 0.13, 2.84, -0.78], [kx - 0.25, 2.9, -0.78], [kx - 0.3, 3.0, -0.78]], 0.025, M.copper);

  pipe([[x + 0.2, 4.62, -0.92], [1.4, 4.66, -0.95], [3.2, 4.66, -0.98], [5.1, 4.66, -0.95],
    [5.56, 4.5, -0.75], [5.6, 3.9, -0.5], [5.6, 3.4, -0.45]], 0.07, M.copper);
  for (const px of [1.7, 3.3, 4.9]) ring(0.1, 0.03, M.brass, px, 4.66, -0.96).rotation.y = HALF_PI;
}

function buildFeed(train, k, M) {
  const { block, round, ring, pipe } = k;
  round(0.44, 2.2, 0.44, M.engine, -6.22, 2.9, -1.65);
  for (const y of [1.86, 2.9, 3.96]) round(0.46, 0.09, 0.46, M.iron, -6.22, y, -1.65);
  round(0.3, 0.06, 0.3, M.brass, -6.22, 4.03, -1.65);
  block(0.06, 0.2, 0.3, M.brass, -6.22, 2.3, -1.12);
  round(0.035, 0.16, 0.035, M.brass, -6.22, 2.2, -1.0);
  pipe([[-6.22, 4.0, -1.65], [-6.2, 4.4, -1.72], [-5.6, 4.5, -1.85], [-3.6, 4.5, -1.9], [-2.1, 4.5, -1.85],
    [-1.8, 4.3, -1.6], [-1.78, 3.6, -0.95], [-1.78, 3.05, -0.66], [-1.7, 2.82, -0.68], [-0.8, 2.78, -0.82]], 0.065, M.copper);
  block(0.3, 0.3, 0.26, M.brass, -1.78, 2.98, -0.6);
  train.valveWheel = k.pivot('engine-valve', -1.78, 2.98, -0.42);
  train.valveWheel.add(ring(0.31, 0.05, M.wine, 0, 0, 0, true));
  for (let i = 0; i < 3; i++) {
    const spoke = block(0.58, 0.035, 0.04, M.brass, 0, 0, 0, true);
    spoke.rotation.z = i * Math.PI / 3;
    train.valveWheel.add(spoke);
  }
}

function buildStores(k, M) {
  const { block, round, cushion, ring, pipe } = k;
  for (const x of [-5.72, -3.62]) {
    block(0.09, 1.2, 0.09, M.iron, x, 2.38, -1.1);
    block(0.09, 1.2, 0.09, M.iron, x, 2.38, -2.0);
    block(0.09, 0.08, 0.98, M.iron, x, 2.96, -1.55);
  }
  block(2.19, 0.07, 1.0, M.iron, -4.67, 1.83, -1.55);
  const rows = [[5, 0.2], [4, 0.2], [3, 0.19]];
  let y = 2.07;
  for (const [row, [count, radius]] of rows.entries()) {
    for (let i = 0; i < count; i++) {
      const x = -5.49 + row * 0.205 + i * 0.41;
      const r = radius - ((i + row) % 3) * 0.015;
      const len = 0.92 + ((i * 2 + row) % 3) * 0.05;
      const z = -1.56 + ((i + row * 2) % 3) * 0.03;
      round(r, len, r, M.woodDark, x, y, z).rotation.x = HALF_PI;
      round(r * 0.86, 0.02, r * 0.86, M.wood, x, y, z + len / 2).rotation.x = HALF_PI;
      round(r * 0.3, 0.02, r * 0.3, M.pillow, x, y, z + len / 2 + 0.006).rotation.x = HALF_PI;
    }
    y += 0.345;
  }
  const split = block(0.3, 0.2, 0.8, M.wood, -4.3, 1.93, -0.72);
  split.rotation.y = 0.5;
  block(0.3, 0.2, 0.75, M.woodDark, -4.75, 1.93, -0.78).rotation.y = -0.3;

  cushion(1.5, 1.26, 0.08, M.woodDark, -3.0, 3.5, -2.2);
  block(1.32, 1.08, 0.035, M.teal, -3.0, 3.5, -2.16);
  block(1.3, 0.055, 0.1, M.brass, -3.0, 3.88, -2.1);
  for (const [i, x] of [-3.43, -3.0, -2.57].entries()) {
    ring(0.06, 0.02, M.brass, x, 3.82, -2.04);
    block(0.06, 0.52, 0.055, i === 1 ? M.wood : M.iron, x, 3.45, -2.05).rotation.z = (i - 1) * 0.1;
    if (i === 1) block(0.4, 0.15, 0.16, M.iron, x, 3.68, -2.04);
    else ring(0.115, 0.045, M.iron, x, 3.68, -2.05);
  }

  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + 0.5;
    const leg = block(0.07, 0.68, 0.07, M.woodDark, -3.0 + Math.cos(a) * 0.2, 2.1, -1.05 + Math.sin(a) * 0.2);
    leg.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
  }
  round(0.34, 0.07, 0.34, M.wood, -3.0, 2.46, -1.05);
  cushion(0.62, 0.16, 0.62, M.upholstery, -3.0, 2.55, -1.05);

  block(0.055, 1.5, 0.055, M.wood, -2.2, 2.56, -2.0).rotation.set(0.14, 0, -0.08);
  block(0.3, 0.36, 0.04, M.iron, -2.25, 1.98, -1.9).rotation.set(0.14, 0, -0.08);
  block(0.04, 1.4, 0.04, M.iron, -2.45, 2.5, -2.02).rotation.set(0.14, 0, 0.1);

  pipe([[-4.0, 4.86, -0.95], [-4.0, 4.56, -0.95]], 0.018, M.iron);
  round(0.14, 0.05, 0.14, M.brass, -4.0, 4.54, -0.95);
  round(0.1, 0.24, 0.1, M.glow, -4.0, 4.39, -0.95);
  round(0.13, 0.05, 0.13, M.brass, -4.0, 4.25, -0.95);
}

function buildMotion(train, k, M) {
  const { block, round, cushion, ring, pipe } = k;
  const { x, y, r, rod, gland } = CRANK;
  const plane = -0.25;
  block(0.95, 0.14, 0.56, M.iron, x, 1.86, plane - 0.4);
  block(0.34, 1.2, 0.3, M.iron, x, 2.4, plane - 0.4);
  round(0.07, 0.5, 0.07, M.brass, x, y, plane - 0.2).rotation.x = HALF_PI;

  train.flywheel = k.pivot('engine-flywheel', x, y, plane);
  train.flywheel.add(ring(0.92, 0.1, M.iron, 0, 0, 0, true));
  train.flywheel.add(ring(0.92, 0.025, M.copper, 0, 0, 0.09, true));
  for (let i = 0; i < 3; i++) {
    const spoke = block(1.76, 0.09, 0.08, M.teal, 0, 0, 0, true);
    spoke.rotation.z = i * Math.PI / 3;
    train.flywheel.add(spoke);
  }
  const hub = round(0.17, 0.16, 0.17, M.brass, 0, 0, 0, true);
  hub.rotation.x = HALF_PI;
  train.flywheel.add(hub);
  const pin = round(0.06, 0.2, 0.06, M.brass, r, 0, 0.1, true);
  pin.rotation.x = HALF_PI;
  train.flywheel.add(pin);

  block(3.0, 0.3, 0.9, M.iron, 5.2, 1.93, -0.5);
  block(3.1, 0.07, 1.0, M.woodDark, 5.2, 1.8, -0.5);
  block(0.85, 0.52, 0.5, M.iron, 5.95, 2.34, -0.42);
  cushion(1.15, 0.64, 0.62, M.engine, 5.95, y, -0.42);
  for (const fx of [5.4, 6.5]) block(0.1, 0.72, 0.64, M.iron, fx, y, -0.42);
  cushion(0.78, 0.26, 0.44, M.copper, 5.95, 3.31, -0.42);
  for (const dy of [-0.17, 0.17]) block(1.28, 0.05, 0.09, M.iron, 4.76, y + dy, plane + 0.08);
  block(0.09, 0.98, 0.1, M.iron, 4.14, 2.57, plane - 0.02);

  train.connectingRod = block(rod, 0.08, 0.06, M.copper, 0, 0, 0, true);
  train.connectingRod.name = 'engine-connecting-rod';
  train.piston = block(0.22, 0.24, 0.2, M.brass, 0, y, plane + 0.08, true);
  train.piston.name = 'engine-piston';
  train.pistonRod = block(1, 0.06, 0.06, M.iron, 0, y, plane + 0.08, true);
  train.pistonRod.name = 'engine-piston-rod';

  round(0.1, 0.1, 0.1, M.iron, 5.95, 3.47, -0.42);
  train.governor = k.pivot('engine-governor', 5.95, 3.5, -0.42);
  train.governor.add(round(0.028, 0.66, 0.028, M.brass, 0, 0.33, 0, true));
  train.governor.add(round(0.07, 0.06, 0.07, M.brass, 0, 0.66, 0, true));
  train.governorArms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(0, 0.64, 0);
    arm.add(block(0.03, 0.42, 0.03, M.iron, 0, -0.21, 0, true));
    arm.add(k.mesh(new THREE.SphereGeometry(0.105, 12, 8), M.brass, 0, -0.44, 0, true));
    arm.userData.side = side;
    train.governor.add(arm);
    return arm;
  });

  pipe([[4.76, 2.08, -0.62], [4.76, 3.3, -0.62], [4.76, 3.46, -0.58]], 0.035, M.brass);
  train.wearNeedle = k.dial(0.24, 4.76, 3.7, -0.56, M, 'wear-needle');
  k.mesh(new THREE.ConeGeometry(0.11, 0.2, 12), M.copper, 4.25, 2.18, -0.72);
  pipe([[4.25, 2.26, -0.72], [4.32, 2.4, -0.72], [4.47, 2.42, -0.72]], 0.016, M.copper);
}

export function buildEngine(train, g) {
  const M = train.materials;
  buildHouse(train, g);
  const k = interiorKit(g, 'engine-workspace');
  buildLining(k, M);
  buildBoiler(train, k, M);
  buildFeed(train, k, M);
  buildStores(k, M);
  buildMotion(train, k, M);
  k.finish(M.paintBase);
  train.tuck(k.root);
  train.fireLight = new THREE.PointLight(TRAIN_LOOK.fireLight, 8, 8, 2);
  train.fireLight.position.set(BOILER.x, 3.2, 0.9);
  g.add(train.fireLight);
  animateEngine(train, 0, 0);
}

export function animateEngine(train, dt, speed01) {
  const { x, y, r, rod, gland } = CRANK;
  const wheel = train.flywheel;
  wheel.rotation.z -= train.speed * dt * 1.7;
  const pinX = x + Math.cos(wheel.rotation.z) * r;
  const pinY = y + Math.sin(wheel.rotation.z) * r;
  const reach = Math.sqrt(rod * rod - (pinY - y) ** 2);
  const head = pinX + reach;
  train.piston.position.x = head;
  train.connectingRod.position.set(pinX + reach / 2, (pinY + y) / 2, -0.12);
  train.connectingRod.rotation.z = Math.atan2(y - pinY, reach);
  train.pistonRod.position.x = (head + gland) / 2;
  train.pistonRod.scale.x = gland - head;

  const lift = 0.06 + speed01 * 0.22 + Math.sin(wheel.rotation.z * 2) * 0.08 * speed01;
  train.stackFlap.rotation.z = damp(train.stackFlap.rotation.z, -lift, 9, dt);

  train.governor.rotation.y += train.speed * dt * 2.4;
  const spread = 0.28 + speed01 * 0.8;
  for (const arm of train.governorArms) arm.rotation.z = arm.userData.side * spread;
  train.wearNeedle.rotation.z = damp(train.wearNeedle.rotation.z, 2.3 - (1 - train.wear / 100) * 4.6, 5, dt);
}
