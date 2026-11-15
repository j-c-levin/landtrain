import * as THREE from 'three';
import { CAR_LEN } from '../constants.js';
import { CHART, TRAIN_LOOK, trainFx, getLookTier, painted } from '../look.js';
import { CAR_WINDOWS, WINDOW_LIGHT } from './shell.js';
import { hash } from './parts.js';

// Night practicals and grounding: a soft contact shadow under every car, warm
// pools the windows throw on the ground, lamp halos, and a headlamp beam on the
// high tier.
export function createPracticals() {
  return {
    contactMat: trainFx.contact(),
    nightContactMat: trainFx.contact(),
    spillMats: [],
    poolMat: trainFx.spill(),
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
// [x, y, z, half-width, half-height, strength, lies on the floor] of the light each lamp lays on its room
const ROOM_POOLS = [
  [[-2.7, 3.6, -2.1, 1.7, 1.25, 0.75, 0], [-2.7, 1.86, -0.7, 2.3, 1.4, 0.7, 1], [5.9, 3.1, -2.1, 1.5, 1.1, 0.7, 0], [3.2, 1.86, -0.4, 2.6, 1.5, 0.45, 1]],
  [[-3.3, 3.55, -2.1, 2.1, 1.35, 0.85, 0], [-3.8, 1.86, -0.6, 2.5, 1.5, 0.75, 1], [0.5, 1.86, 0.7, 3.2, 1.6, 0.9, 1]],
  [[-1.65, 3.3, -2.1, 1.8, 1.4, 0.75, 0], [-1.7, 1.86, -0.6, 2.4, 1.5, 0.7, 1], [4.2, 1.86, -0.5, 2.2, 1.3, 0.3, 1]],
];

export function buildPracticals(train, g, ci) {
  const P = train.practicals;
  const zone = 'car' + ci;
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
  flat(P.nightContactMat, 0, 0.055, 0, 10, 6.4, 1);
  P.planMat.uniforms.uSize.value.set(CAR_LEN + 1.4, 5.6);
  const plan = new THREE.Mesh(P.plan, P.planMat);
  plan.rotation.x = -Math.PI / 2;
  plan.position.set(1.5, 0.08, 2.1);
  plan.visible = false;
  g.add(plan);
  P.plans.push(plan);
  // Each window throws its own pool, starting at the car's side so nothing glows beneath the floor.
  const strength = new THREE.Color();
  const pools = POOLS[ci].slice();
  let brightest = 0;
  CAR_WINDOWS[ci].forEach(([wx, width], i) => {
    const lit = WINDOW_LIGHT[zone][i];
    if (lit > WINDOW_LIGHT[zone][brightest]) brightest = i;
    if (lit < 0.45) return;
    const skew = (hash(ci * 7 + i) - 0.5) * 1.6;
    pools.push([wx, CAR_HALF_WIDTH + 0.95, width * 0.4, 0.95, 0.6 * lit, 0]);
    pools.push([wx + skew, CAR_HALF_WIDTH + 2.5 + hash(ci * 3 + i + 5) * 0.7, width * 0.55 + 0.7, 2.5, 0.3 * lit, skew * 0.25]);
  });
  const [bx, bw] = CAR_WINDOWS[ci][brightest];
  pools.push([bx, -CAR_HALF_WIDTH - 1.5, bw * 0.5 + 0.4, 1.5, 0.32, 0.1]);
  const spillMat = trainFx.spill();
  spillMat.color.setHex(TRAIN_LOOK.roomLight[zone]).lerp(strength.setHex(0xffffff), 0.35);
  P.spillMats.push(spillMat);
  const spill = new THREE.InstancedMesh(P.disc, spillMat, pools.length);
  const matrix = new THREE.Matrix4();
  const lie = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const yaw = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  for (let i = 0; i < pools.length; i++) {
    const [x, z, len, depth, gain, twist = 0] = pools[i];
    yaw.setFromAxisAngle(up, twist).multiply(lie);
    spill.setMatrixAt(i, matrix.compose(at.set(x, 0.07, z), yaw, size.set(len, depth, 1)));
    spill.setColorAt(i, strength.setScalar(gain));
  }
  spill.renderOrder = 2;
  spill.frustumCulled = false;
  g.add(spill);
  const room = new THREE.InstancedMesh(P.disc, P.poolMat, ROOM_POOLS[ci].length);
  yaw.identity();
  ROOM_POOLS[ci].forEach(([x, y, z, w, h, gain, floor], i) => {
    room.setMatrixAt(i, matrix.compose(at.set(x, y, z), floor ? lie : yaw, size.set(w, h, 1)));
    room.setColorAt(i, strength.setHex(TRAIN_LOOK.roomLight[zone]).multiplyScalar(gain));
  });
  room.renderOrder = 2;
  room.frustumCulled = false;
  g.add(room);
  train.tuck(room);
  for (const [x, y, z, scale] of HALOS[ci]) {
    const halo = new THREE.Sprite(P.haloMat);
    halo.position.set(x, y, z);
    halo.scale.setScalar(scale);
    g.add(halo);
  }
  for (const [x, y, z, w, h] of GLOWS[ci]) {
    const material = trainFx.windowGlow();
    const lit = y > 5 ? 'cab' : zone;
    material.color.setHex(TRAIN_LOOK.roomLight[lit]);
    P.glows.push({ material, zone: lit });
    const glow = new THREE.Sprite(material);
    glow.position.set(x, y, z);
    glow.scale.set(w, h, 1);
    glow.renderOrder = 5;
    g.add(glow);
  }
  // The four interior lamps are the whole point-light budget. Their reach stays
  // tight so each one pools; the spill discs carry the light out of the windows.
  g.traverse((object) => {
    if (object.isPointLight) P.lights.push({ light: object, intensity: object.intensity });
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
  P.poolMat.opacity = 0.85 * lamp;
  P.haloMat.opacity = 0.05 + 0.2 * lamp;
  for (const { light, intensity } of P.lights) {
    if (light !== train.fireLight) light.intensity = intensity * (1.2 + 1.3 * lamp);
  }
  painted(train.materials.lampshade).emissiveIntensity = 0.32 + 0.3 * lamp;
  for (const puff of train.smoke) puff.sprite.material.color.setRGB(1 - 0.8 * night, 1 - 0.76 * night, 1 - 0.64 * night);
  if (P.beam) P.beam.intensity = 260 * night;
  train.materials.glow.emissiveIntensity = 1.5 + 0.7 * lamp;
  const sage = train.materials.sage;
  const sageSheet = train.weathered(sage);
  sage.emissiveIntensity = 0.2 * dusk;
  sageSheet.emissiveIntensity = sage.emissiveIntensity;
  train.zoneMats.car2.emissiveIntensity = sage.emissiveIntensity;
  for (const { source, mat } of train.fadeMats) if (source === sage || source === sageSheet) mat.emissiveIntensity = sage.emissiveIntensity;
  train.materials.headlamp.emissiveIntensity = 2.2 + 1.6 * night;
  train.glassGlow = Math.max(night * 0.42, dusk * 0.5);
}

// A window's bloom belongs to the outside of a lit car; it clears off the one being looked into.
export function setPracticalsFocus(train) {
  const P = train.practicals;
  const chart = CHART.uChart.value;
  P.contactMat.opacity = (1 - 0.1 * Math.max(P.night, 0)) * (1 - chart);
  P.nightContactMat.opacity = Math.max(P.night, 0) * (1 - chart);
  for (let i = 0; i < P.plans.length; i++) P.plans[i].visible = chart > 0.01;
  for (let i = 0; i < P.spillMats.length; i++) {
    P.spillMats[i].opacity = 0.3 * Math.max(P.night, 0) * (0.3 + 0.7 * train.zoneMats['car' + i].opacity);
  }
  for (let i = 0; i < P.glows.length; i++) {
    const { material, zone } = P.glows[i];
    material.opacity = 0.22 * Math.max(P.night, 0) * train.zoneMats[zone].opacity;
  }
}
