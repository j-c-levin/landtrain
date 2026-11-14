import * as THREE from 'three';
import { TRAIN_LOOK, trainFx, getLookTier } from '../look.js';

// Night practicals and grounding: a soft contact shadow under every car, warm
// pools the windows throw on the ground, lamp halos, and a headlamp beam on the
// high tier.
export function createPracticals() {
  return {
    contactMat: trainFx.contact(),
    spillMat: trainFx.spill(),
    haloMat: trainFx.lampHalo(),
    glowMat: trainFx.windowGlow(),
    disc: new THREE.CircleGeometry(1, 24),
    lights: [],
    beam: null,
    night: -1,
    lamp: -1,
  };
}

// [x, z, length, depth, strength] of each car's window spill, train-local
const SPILL = [
  [[1.5, 4.6, 8.5, 4.2, 0.8], [1.5, -4.4, 7.5, 3.6, 0.5], [13.5, 0, 9, 6.5, 1]],
  [[0.2, 4.2, 5.5, 4, 1], [0.2, -3.6, 4.5, 3, 0.6]],
  [[0, 4.8, 9.5, 4.4, 0.9], [0, -4.6, 9, 3.8, 0.6], [-8, 3.2, 3.6, 3.2, 0.7]],
];
// [x, y, z, width, height] bloom over each lit window group
const GLOWS = [
  [[3.5, 2.9, 2.4, 14, 4.2], [5, 6.4, 2.2, 11, 3.6]],
  [[0.4, 2.9, 1.2, 7, 5]],
  [[0, 2.9, 2.4, 14, 4.2]],
];
// [x, y, z, scale] lamp halos
const HALOS = [
  [[9.6, 3.75, 0, 3.4]],
  [[0.3, 3.1, 1.3, 3.2]],
  [[-7.05, 3.45, 2.6, 2.2]],
];
export function buildPracticals(train, g, ci) {
  const P = train.practicals;
  const flat = (material, x, y, z, sx, sz, order) => {
    const mesh = new THREE.Mesh(P.disc, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sz, 1);
    mesh.renderOrder = order;
    g.add(mesh);
    return mesh;
  };
  flat(P.contactMat, 0, 0.05, 0, 9.4, 3.9, 1);
  for (const [x, z, len, depth] of SPILL[ci]) flat(P.spillMat, x, 0.07, z, len, depth, 2);
  for (const [x, y, z, scale] of HALOS[ci]) {
    const halo = new THREE.Sprite(P.haloMat);
    halo.position.set(x, y, z);
    halo.scale.setScalar(scale);
    g.add(halo);
  }
  for (const [x, y, z, w, h] of GLOWS[ci]) {
    const glow = new THREE.Sprite(P.glowMat);
    glow.position.set(x, y, z);
    glow.scale.set(w, h, 1);
    glow.renderOrder = 5;
    g.add(glow);
  }
  // The four interior lamps are the whole point-light budget; at night their
  // reach grows so the same lamps spill out of the windows onto the ground.
  g.traverse((object) => {
    if (object.isPointLight) P.lights.push({ light: object, distance: object.distance, intensity: object.intensity });
  });
  if (ci === 0 && getLookTier() === 'high') {
    const beam = new THREE.SpotLight(TRAIN_LOOK.spillLight, 0, 70, 0.5, 0.85, 1.3);
    beam.position.set(9.5, 3.75, 0);
    beam.target.position.set(34, 0, 0);
    g.add(beam, beam.target);
    P.beam = beam;
  }
}

// Lamps come up as the sun gets low, ahead of the window spill and the beam.
export function setPracticalsNight(train, night, dusk = 0) {
  const P = train.practicals;
  const lamp = Math.max(night, dusk * 0.6);
  if (Math.abs(night - P.night) < 0.004 && Math.abs(lamp - P.lamp) < 0.004) return;
  P.night = night;
  P.lamp = lamp;
  P.spillMat.opacity = 0.42 * night;
  P.haloMat.opacity = 0.14 + 0.48 * lamp;
  P.glowMat.opacity = 0.22 * night;
  P.contactMat.opacity = 1 - 0.45 * night;
  for (const { light, distance, intensity } of P.lights) {
    light.distance = distance * (1.25 + 0.95 * lamp);
    if (light !== train.fireLight) light.intensity = intensity * (1.15 + 1.25 * lamp);
  }
  if (P.beam) P.beam.intensity = 260 * night;
  train.materials.glow.emissiveIntensity = 1.6 + 1.6 * lamp;
  train.materials.headlamp.emissiveIntensity = 2.4 + 2.6 * night;
  train.materials.glass.emissive.setHex(TRAIN_LOOK.spillLight);
  train.materials.glass.emissiveIntensity = 1.4 * night;
}
