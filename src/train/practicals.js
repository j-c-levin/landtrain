import * as THREE from 'three';
import { CAR_LEN } from '../constants.js';
import { CHART, TRAIN_LOOK, trainFx, getLookTier } from '../look.js';
import { CAR_WINDOWS } from './shell.js';

// Night practicals and grounding: a soft contact shadow under every car, warm
// pools the windows throw on the ground, lamp halos, and a headlamp beam on the
// high tier.
export function createPracticals() {
  return {
    contactMat: trainFx.contact(),
    nightContactMat: trainFx.contact(),
    spillMat: trainFx.spill(),
    haloMat: trainFx.lampHalo(),
    glows: [],
    disc: new THREE.CircleGeometry(1, 24),
    plan: new THREE.PlaneGeometry(CAR_LEN + 1.4, 5.6),
    planMat: trainFx.chartShadow(),
    plans: [],
    lights: [],
    beam: null,
    night: -1,
    lamp: -1,
    dusk: -1,
  };
}

// [x, z, length, depth, strength] of the pools that are not a window's: headlamp, veranda lantern
const POOLS = [[[13.5, 0, 9, 6, 1]], [], [[-7.4, 4.9, 2.6, 2.3, 0.7]]];
const CAR_HALF_WIDTH = 2.5;
// [x, y, z, width, height] bloom over each lit window group
const GLOWS = [
  [[3.5, 2.9, 2.4, 14, 4.2], [5, 6.4, 2.2, 11, 3.6]],
  [[0.5, 2.9, 2.4, 10, 3.8]],
  [[0, 2.9, 2.4, 14, 4.2]],
];
// [x, y, z, scale] lamp halos
const HALOS = [
  [[9.6, 3.75, 0, 3.0]],
  [[0.5, 2.9, 1.3, 2.8]],
  [[-7.05, 3.45, 2.6, 1.5]],
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
  // By night the lamps reach the ground through the floor; a second shadow keeps the underside dark.
  flat(P.nightContactMat, 0, 0.055, 0, 9.8, 5.2, 1);
  P.planMat.uniforms.uSize.value.set(CAR_LEN + 1.4, 5.6);
  const plan = new THREE.Mesh(P.plan, P.planMat);
  plan.rotation.x = -Math.PI / 2;
  plan.position.set(1.5, 0.08, 2.1);
  plan.visible = false;
  g.add(plan);
  P.plans.push(plan);
  // Each window throws its own pool, starting at the car's side so nothing glows beneath the floor.
  const pools = POOLS[ci].slice();
  for (const [wx, width] of CAR_WINDOWS[ci]) {
    pools.push([wx, CAR_HALF_WIDTH + 2.6, width / 2 + 2.3, 2.6, 0.8]);
    pools.push([wx, -CAR_HALF_WIDTH - 2.0, width / 2 + 1.9, 2.0, 0.45]);
  }
  const spill = new THREE.InstancedMesh(P.disc, P.spillMat, pools.length);
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  const strength = new THREE.Color();
  for (let i = 0; i < pools.length; i++) {
    const [x, z, len, depth, gain] = pools[i];
    spill.setMatrixAt(i, matrix.compose(at.set(x, 0.07, z), turn, size.set(len, depth, 1)));
    spill.setColorAt(i, strength.setScalar(gain));
  }
  spill.renderOrder = 2;
  spill.frustumCulled = false;
  g.add(spill);
  for (const [x, y, z, scale] of HALOS[ci]) {
    const halo = new THREE.Sprite(P.haloMat);
    halo.position.set(x, y, z);
    halo.scale.setScalar(scale);
    g.add(halo);
  }
  for (const [x, y, z, w, h] of GLOWS[ci]) {
    const material = trainFx.windowGlow();
    P.glows.push({ material, zone: y > 5 ? 'cab' : 'car' + ci });
    const glow = new THREE.Sprite(material);
    glow.position.set(x, y, z);
    glow.scale.set(w, h, 1);
    glow.renderOrder = 5;
    g.add(glow);
  }
  // The four interior lamps are the whole point-light budget. Their reach stays
  // tight so each one pools; the spill discs carry the light out of the windows.
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
  if (Math.abs(night - P.night) < 0.004 && Math.abs(lamp - P.lamp) < 0.004 && Math.abs(dusk - P.dusk) < 0.004) return;
  P.dusk = dusk;
  P.night = night;
  P.lamp = lamp;
  P.spillMat.opacity = 0.3 * night;
  P.haloMat.opacity = 0.05 + 0.24 * lamp;
  for (const { light, distance, intensity } of P.lights) {
    if (light === train.fireLight) continue;
    light.distance = distance * (1 + 0.3 * lamp);
    light.intensity = intensity * (1.2 + 0.8 * lamp);
  }
  if (P.beam) P.beam.intensity = 260 * night;
  train.materials.glow.emissiveIntensity = 1.5 + 0.7 * lamp;
  const sage = train.materials.sage;
  const sageSheet = train.weathered(sage);
  sage.emissiveIntensity = 0.2 * dusk;
  sageSheet.emissiveIntensity = sage.emissiveIntensity;
  train.zoneMats.car2.emissiveIntensity = sage.emissiveIntensity;
  for (const { source, mat } of train.fadeMats) if (source === sage || source === sageSheet) mat.emissiveIntensity = sage.emissiveIntensity;
  train.materials.headlamp.emissiveIntensity = 2.2 + 1.6 * night;
  train.glassGlow = 0.75 * night + 0.12 * dusk;
}

// A window's bloom belongs to the outside of a lit car; it clears off the one being looked into.
export function setPracticalsFocus(train) {
  const P = train.practicals;
  const chart = CHART.uChart.value;
  P.contactMat.opacity = (1 - 0.1 * Math.max(P.night, 0)) * (1 - chart);
  P.nightContactMat.opacity = Math.max(P.night, 0) * (1 - chart);
  for (let i = 0; i < P.plans.length; i++) P.plans[i].visible = chart > 0.01;
  for (let i = 0; i < P.glows.length; i++) {
    const { material, zone } = P.glows[i];
    material.opacity = 0.22 * Math.max(P.night, 0) * train.zoneMats[zone].opacity;
  }
}
