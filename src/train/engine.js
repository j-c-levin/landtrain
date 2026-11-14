import * as THREE from 'three';
import { TRAIN_LOOK } from '../look.js';
import { box, profiledBox, curvedRoof, instancedDetails } from './parts.js';
import { interiorKit } from './interior-kit.js';

export function buildEngine(train, g) {
  const M = train.materials;
  const nearIron = train.nearWallMat('car1', M.iron);
  box(15.0, 0.18, 1.9, M.iron, 0, 4.96, 0, g);
  curvedRoof(4.0, 5.5, 0.65, M.engine, train.fadingMat('car1', M.engine), -4.9, 5.05, g, false);
  for (const side of [-1, 1]) {
    const frame = [];
    for (const x of [-6.55, -3.1, 6.5]) {
      frame.push([x, 3.1, side * 2.32, 0.17, 2.64, 0.17]);
      frame.push([x + (x < 0 ? 0.3 : -0.3), 4.13, side * 2.32, 0.12, 0.8, 0.12, 0, 0, x < 0 ? -0.65 : 0.65]);
    }
    frame.push([0, 4.43, side * 2.32, 13.4, 0.18, 0.16]);
    frame.push([-4.85, 2.0, side * 2.32, 3.6, 0.44, 0.16]);
    instancedDetails(frame, train.geometry.detail, side > 0 ? nearIron : M.iron, g, true);
  }
  instancedDetails([[-3.1, 4.61, -0.675, 0.18, 0.65, 3.25], [6.5, 4.61, -0.675, 0.18, 0.65, 3.25]], train.geometry.detail, M.iron, g, true);
  instancedDetails([[-3.1, 4.61, 1.625, 0.18, 0.65, 1.35], [6.5, 4.61, 1.625, 0.18, 0.65, 1.35]], train.geometry.detail, nearIron, g, true);
  profiledBox(6.6, 0.42, 2.0, 0.15, M.iron, 0.6, 2.0, -1.3, g);
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 1.03, 6.2, 24), M.engine);
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(0.6, 3.12, -1.3);
  boiler.castShadow = true;
  boiler.receiveShadow = true;
  g.add(boiler);
  const bands = [-2.3, -0.7, 1.8, 3.5].map((x) => [x, 3.12, -1.3, 1, 1, 1, 0, Math.PI / 2]);
  instancedDetails(bands, new THREE.TorusGeometry(1.045, 0.07, 6, 24), M.iron, g, true);
  const endCap = new THREE.Mesh(new THREE.SphereGeometry(1.03, 20, 12), M.iron);
  endCap.scale.x = 0.32;
  endCap.position.set(3.7, 3.12, -1.3);
  g.add(endCap);
  const k = interiorKit(g, 'engine-workspace');
  const { block, round, cushion, pipe, ring } = k;
  train.fireboxMat = M.firebox;
  cushion(2.1, 2.07, 0.09, M.sootGrime, 0.25, 3.01, -0.28);
  cushion(1.88, 1.87, 0.23, M.copper, 0.25, 3.0, -0.3);
  cushion(1.65, 1.64, 0.06, M.iron, 0.25, 3.0, -0.154);
  cushion(1.44, 1.42, 0.05, M.firebox, 0.25, 3.0, -0.114);
  k.arch(1.85, 0.23, 0.065, 0.07, M.brass, 0.25, 3.67, -0.17);
  block(1.73, 0.16, 0.36, M.iron, 0.25, 2.13, -0.26);
  for (let i = 0; i < 6; i++) block(0.045, 1.28, 0.05, M.iron, -0.3 + i * 0.22, 3.0, -0.055);
  block(1.4, 0.06, 0.06, M.iron, 0.25, 2.62, -0.046);
  train.flames = k.pivot('firebox-flames', 0.25, 2.35, -0.075);
  for (let i = 0; i < 5; i++) {
    const flame = k.mesh(new THREE.ConeGeometry(0.13, 0.75 + (i % 3) * 0.16, 7), M.ember,
      -0.49 + i * 0.24, 0.47, 0, true);
    flame.scale.z = 0.12;
    train.flames.add(flame);
  }
  pipe([[-4.9, 3.68, -1.35], [-4.9, 4.06, -1.35], [-3.7, 4.23, -0.97], [-2.32, 4.2, -0.68], [-1.78, 3.8, -0.44]], 0.075, M.copper);
  pipe([[-2.3, 2.36, -0.56], [-2.72, 2.47, -0.49], [-2.72, 3.02, -0.47], [-2.36, 3.12, -0.48]], 0.067, M.copper);
  train.pressureNeedle = k.dial(0.46, -1.78, 3.78, -0.24, M, 'pressure-needle');
  train.valveWheel = k.pivot('engine-valve', -2.38, 2.97, -0.24);
  train.valveWheel.add(ring(0.37, 0.052, M.wine, 0, 0, 0, true));
  for (let i = 0; i < 3; i++) {
    const spoke = block(0.68, 0.035, 0.04, M.brass, 0, 0, 0, true);
    spoke.rotation.z = i * Math.PI / 3;
    train.valveWheel.add(spoke);
  }
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.6, 3.0, 14), M.iron);
  stack.position.set(1.4, 5.71, -1.3);
  stack.castShadow = true;
  g.add(stack);
  const sootCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.44, 0.32, 14, 1, true), M.sootGrime);
  sootCollar.position.set(1.4, 7.32, -1.3);
  g.add(sootCollar);
  train.stackLocal = new THREE.Vector3(1.4, 7.48, -1.3);

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.9, 16), M.engine);
  tank.position.set(-4.9, 2.73, -1.35);
  tank.castShadow = true;
  g.add(tank);
  instancedDetails([[-4.9, 3.68, -1.35, 0.75, 0.12, 0.75], [-4.9, 1.88, -1.35, 0.75, 0.12, 0.75]], new THREE.CylinderGeometry(1, 1, 1, 16), M.iron, g);
  profiledBox(2.0, 0.2, 1.5, 0.08, M.wood, 5.25, 2.75, -1.3, g);
  instancedDetails([[4.5, 2.22, -1.7, 0.15, 0.9, 0.15], [6, 2.22, -1.7, 0.15, 0.9, 0.15], [4.5, 2.22, -0.8, 0.15, 0.9, 0.15], [6, 2.22, -0.8, 0.15, 0.9, 0.15]], train.geometry.detail, M.iron, g);
  profiledBox(0.65, 0.36, 0.6, 0.06, M.iron, 5.5, 3.03, -1.15, g);

  cushion(2.06, 1.32, 0.09, M.woodDark, 5.28, 3.71, -1.94);
  block(1.86, 1.12, 0.035, M.teal, 5.28, 3.71, -1.88);
  block(1.84, 0.055, 0.11, M.brass, 5.28, 4.09, -1.81);
  for (const [i, x] of [4.67, 5.25, 5.85].entries()) {
    ring(0.065, 0.02, M.brass, x, 4.02, -1.73);
    block(0.065, 0.54, 0.06, M.iron, x, 3.63, -1.72).rotation.z = (i - 1) * 0.12;
    if (i === 1) block(0.42, 0.16, 0.17, M.iron, x, 3.87, -1.71);
    else {
      ring(0.12, 0.045, M.iron, x, 3.87, -1.72);
      block(0.1, 0.13, 0.055, M.wood, x, 3.4, -1.7);
    }
  }
  train.flywheel = k.pivot('engine-flywheel', 2.56, 2.95, -0.23);
  train.flywheel.add(ring(0.98, 0.1, M.iron, 0, 0, 0, true));
  train.flywheel.add(ring(0.98, 0.025, M.copper, 0, 0, 0.09, true));
  for (let i = 0; i < 3; i++) {
    const spoke = block(1.88, 0.09, 0.09, M.teal, 0, 0, 0, true);
    spoke.rotation.z = i * Math.PI / 3;
    train.flywheel.add(spoke);
  }
  const hub = round(0.17, 0.15, 0.17, M.brass, 0, 0, 0, true);
  hub.rotation.x = Math.PI / 2;
  train.flywheel.add(hub);
  train.connectingRod = block(1, 0.083, 0.06, M.copper, 3.7, 2.95, -0.1, true);
  train.connectingRod.name = 'engine-connecting-rod';
  train.piston = block(0.23, 0.23, 0.13, M.brass, 4.7, 2.95, -0.15, true);
  train.piston.name = 'engine-piston';
  cushion(1.21, 0.48, 0.43, M.engine, 5.32, 2.95, -0.46);
  for (const x of [4.78, 5.83]) block(0.1, 0.52, 0.46, M.iron, x, 2.95, -0.47);
  k.finish();
  train.fireLight = new THREE.PointLight(TRAIN_LOOK.fireLight, 8, 6, 2);
  train.fireLight.position.set(0.25, 3.15, 0.95);
  g.add(train.fireLight);
}
