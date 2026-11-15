import * as THREE from 'three';
import { TUNING, damp } from '../constants.js';
import { createFigureMaterials } from '../look.js';

const K = [
  'bodyX', 'bodyY', 'bodyZ', 'turn', 'lean', 'roll', 'chest', 'headPitch', 'headYaw',
  'hipL', 'kneeL', 'hipR', 'kneeR',
  'armL', 'armLx', 'armLy', 'elbowL', 'armR', 'armRx', 'armRy', 'elbowR',
  'hat', 'scarf', 'pack', 'book', 'can', 'tool', 'poker',
  'footL', 'footR', 'liftL', 'liftR', 'ik', 'squash',
];
const I = Object.fromEntries(K.map((k, i) => [k, i]));
const N = K.length;

// Angles swing forward when positive; `turn` is measured toward the camera side.
const REST = { armL: 0.02, armLx: -0.13, elbowL: 0.32, armR: 0.02, armRx: 0.13, elbowR: 0.32, pack: 1, ik: 1 };
function pose(values) {
  const out = new Float32Array(N);
  for (const [k, v] of Object.entries({ ...REST, ...values })) out[I[k]] = v;
  return out;
}

const POSES = {
  idle: pose({ turn: 0.75, footL: 0.045, footR: -0.045 }),
  walk: pose({ turn: 0.18, lean: -0.1, scarf: -0.5 }),
  climb: pose({
    turn: 0.12, bodyX: -0.3, lean: -0.05, armL: 1.75, armR: 1.75, elbowL: 0.5, elbowR: 0.5, armLx: 0, armRx: 0, headPitch: 0.3,
    hipL: 0.7, hipR: 0.7, kneeL: -1, kneeR: -1, ik: 0,
  }),
  tend: pose({
    turn: -0.3, lean: -0.3, bodyY: -0.11, footL: 0.26, footR: -0.22, headPitch: 0.1,
    armL: 0.55, elbowL: 1.0, armLx: 0, armLy: 0.3, armR: 0.95, elbowR: 0.55, armRx: 0, poker: 1,
  }),
  tread: pose({
    turn: -0.2, bodyY: -0.28, chest: -1.1, headPitch: 0.6, squash: 1,
    hipL: 1.5, kneeL: -1.5, hipR: -0.2, kneeR: -1.4, ik: 0,
    armL: 0.75, elbowL: 0.5, armLx: 0, armR: 0.9, elbowR: 0.7, armRx: 0, tool: 1,
  }),
  water: pose({
    turn: -0.7, lean: -0.12, bodyY: -0.04, footL: 0.15, footR: -0.11, headPitch: -0.1,
    armL: -0.25, elbowL: 1.0, armLx: 0.35, armR: 2.4, elbowR: 0.2, armRx: 0, armRy: -0.1, can: 1,
  }),
  sit: pose({
    turn: Math.PI / 2, bodyX: -0.08, bodyY: -0.28, bodyZ: -0.2, lean: 0.22, headPitch: -0.3,
    hipL: 1.42, kneeL: -1.3, hipR: 1.5, kneeR: -1.45,
    armL: 0.7, elbowL: 1.3, armLx: 0, armLy: 0.25, armR: 0.7, elbowR: 1.3, armRx: 0, armRy: -0.25,
    pack: 0, book: 1, ik: 0,
  }),
  rise: pose({
    turn: 1.25, bodyZ: -0.12, bodyY: -0.16, lean: -0.4, chest: -0.25, headPitch: 0.3,
    footL: 0.1, footR: -0.06, armL: 0.6, elbowL: 0.5, armR: 0.5, elbowR: 0.6,
  }),
  recline: pose({
    turn: Math.PI, bodyX: -0.25, bodyY: 0.22, bodyZ: -0.2, lean: 0.75, chest: -0.5, headPitch: 0.1,
    hipL: 1.3, kneeL: -1.2, hipR: 1.45, kneeR: -1.35,
    armL: -0.5, elbowL: 0.3, armLx: -0.2, armR: -0.5, elbowR: 0.3, armRx: 0.2,
    pack: 0, ik: 0,
  }),
  lie: pose({
    turn: Math.PI, bodyX: -0.4, bodyY: 0.2, bodyZ: -0.3, lean: Math.PI / 2, chest: -0.32, headPitch: 0.2,
    hipL: -0.06, kneeL: -0.04, hipR: -0.03, kneeR: -0.1,
    armL: 0.5, elbowL: 1.25, armLx: 0, armLy: 0.55, armR: 0.42, elbowR: 1.35, armRx: 0, armRy: -0.55,
    pack: 0, hat: 1, ik: 0,
  }),
  wheel: pose({
    bodyY: 0.46, lean: -0.1, headPitch: 0.05,
    hipL: 1.42, kneeL: -1.25, hipR: 1.5, kneeR: -1.4,
    armL: 1.05, elbowL: 0.85, armLx: 0, armLy: -0.2, armR: 1.05, elbowR: 0.85, armRx: 0, armRy: 0.2, ik: 0,
  }),
};

const RATE = new Float32Array(N).fill(11);
for (const k of ['bodyX', 'bodyY', 'bodyZ', 'lean']) RATE[I[k]] = 7;
for (const k of ['hipL', 'kneeL', 'hipR', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR']) RATE[I[k]] = 20;
for (const k of ['pack', 'can', 'tool', 'poker']) RATE[I[k]] = 14;
RATE[I.book] = 30;
RATE[I.hat] = 6;
for (const k of ['footL', 'footR', 'liftL', 'liftR', 'ik', 'squash']) RATE[I[k]] = 12;

const HIP_Y = 0.58;
const THIGH = 0.28;
const SHIN = 0.3;
const TWO_PI = Math.PI * 2;

// One stride lands each foot for STANCE of the cycle; the rest is flight.
export const STRIDE_TIME = 0.44;
const STANCE = 0.35;
const REACH = (TUNING.walkSpeed * STRIDE_TIME * STANCE) / 2;
const SWING_SLOPE = -TUNING.walkSpeed * STRIDE_TIME * (1 - STANCE);
const HIP_SLIDE = 0.1;

const foot = { x: 0, lift: 0 };
function gaitFoot(q) {
  q -= Math.floor(q);
  if (q < STANCE) {
    foot.x = REACH * (1 - (2 * q) / STANCE);
    foot.lift = 0;
    return;
  }
  const s = (q - STANCE) / (1 - STANCE);
  const s2 = s * s;
  const s3 = s2 * s;
  foot.x = (2 * s3 - 3 * s2 + 1) * -REACH + (s3 - 2 * s2 + s) * SWING_SLOPE + (3 * s2 - 2 * s3) * REACH + (s3 - s2) * SWING_SLOPE;
  foot.lift = Math.sin(Math.PI * s) * 0.15;
}

const leg = { hip: 0, knee: 0 };
function solveLeg(x, y) {
  let d = Math.hypot(x, y);
  const max = THIGH + SHIN - 0.004;
  if (d > max) {
    x *= max / d;
    y *= max / d;
    d = max;
  } else if (d < 0.12) d = 0.12;
  const inner = Math.acos((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN));
  leg.knee = inner - Math.PI;
  leg.hip = Math.atan2(x, -y) + Math.acos((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d));
}
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const HOLD = { sit: ['rise', 0.2], lie: ['recline', 0.42] };
// 1 at the top of a reach, easing down through the grip, then a quick reach back up
function climbStroke(q) {
  q -= Math.floor(q);
  return q < 0.7 ? 1 - q / 0.7 : 0.5 - 0.5 * Math.cos(((q - 0.7) / 0.3) * Math.PI);
}

export class Figure {
  constructor() {
    this.materials = createFigureMaterials();
    this.cur = new Float32Array(N);
    this.tgt = new Float32Array(N);
    this.cur.set(POSES.idle);
    this.mode = 'idle';
    this.work = 0;
    this.bob = 0;
    this.duck = 0;
    this.gait = 0;
    this.phase = 0;
    this.pour = 0;
    this.hold = 0;
    this.holdPose = 'rise';
    this.pouring = false;
    this.lastFacing = 1;
    this.holdingCan = false;
    this.root = new THREE.Group();
    this.root.rotation.order = 'YZX';
    this.#build();
    this.#apply(0);
  }

  #build() {
    const M = this.materials;
    const mesh = (geo, mat, x, y, z, parent, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const pivot = (x, y, z, parent) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    const ball = new THREE.SphereGeometry(1, 14, 10);
    const blob = (mat, r, x, y, z, parent, shadow = false) => {
      const m = mesh(ball, mat, x, y, z, parent, shadow);
      m.scale.setScalar(r);
      return m;
    };

    const thighGeo = new THREE.CapsuleGeometry(0.09, 0.14, 4, 10);
    const shinGeo = new THREE.CapsuleGeometry(0.075, 0.12, 4, 10);
    const bootGeo = new THREE.CapsuleGeometry(0.085, 0.1, 4, 10);
    this.hips = [];
    this.knees = [];
    for (const side of [1, -1]) {
      const hip = pivot(0, HIP_Y, side * 0.105, this.root);
      mesh(thighGeo, M.legs, 0, -0.14, 0, hip);
      const knee = pivot(0, -0.28, 0, hip);
      mesh(shinGeo, M.legs, 0, -0.1, 0, knee);
      const boot = mesh(bootGeo, M.boot, 0.035, -0.225, 0, knee);
      boot.rotation.z = Math.PI / 2;
      boot.scale.set(0.88, 1, 1.05);
      mesh(new THREE.CylinderGeometry(0.086, 0.09, 0.07, 10), M.boot, 0, -0.17, 0, knee, false);
      this.hips.push(hip);
      this.knees.push(knee);
    }

    this.chest = pivot(0, HIP_Y, 0, this.root);
    const coatProfile = [
      [0, -0.1], [0.2, -0.11], [0.262, -0.07], [0.25, 0.04], [0.215, 0.24], [0.19, 0.4], [0.15, 0.5], [0.09, 0.565], [0, 0.58],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    this.coat = mesh(new THREE.LatheGeometry(coatProfile, 18), M.coat, 0, 0, 0, this.chest);
    this.coat.scale.x = 0.86;
    const hem = mesh(new THREE.TorusGeometry(0.236, 0.022, 6, 20), M.trim, 0, -0.075, 0, this.chest, false);
    hem.rotation.x = Math.PI / 2;
    hem.scale.x = 0.86;
    for (const y of [0.16, 0.31]) blob(M.brass, 0.028, 0.2 - (y - 0.16) * 0.12, y, 0, this.chest);
    const belt = mesh(new THREE.TorusGeometry(0.242, 0.022, 6, 20), M.leather, 0, 0.07, 0, this.chest, false);
    belt.rotation.x = Math.PI / 2;
    belt.scale.x = 0.86;
    mesh(new THREE.BoxGeometry(0.03, 0.075, 0.09), M.brass, 0.212, 0.07, 0, this.chest, false);

    const scarf = mesh(new THREE.TorusGeometry(0.125, 0.062, 8, 16), M.scarf, 0, 0.555, 0, this.chest);
    scarf.rotation.x = Math.PI / 2;
    this.scarfTail = pivot(-0.1, 0.55, 0.07, this.chest);
    mesh(new THREE.BoxGeometry(0.05, 0.3, 0.11), M.scarf, 0, -0.15, 0, this.scarfTail);
    mesh(new THREE.BoxGeometry(0.052, 0.04, 0.112), M.trim, 0, -0.25, 0, this.scarfTail, false);

    this.pack = pivot(-0.2, 0.3, 0, this.chest);
    const bag = mesh(new THREE.BoxGeometry(0.17, 0.26, 0.3), M.leather, -0.05, -0.04, 0, this.pack);
    bag.rotation.z = 0.06;
    mesh(new THREE.BoxGeometry(0.03, 0.1, 0.24), M.trim, -0.14, 0.0, 0, this.pack, false);
    const roll = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12), M.legs, -0.07, 0.14, 0, this.pack);
    roll.rotation.x = Math.PI / 2;
    for (const z of [-0.09, 0.09]) {
      const strap = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 12), M.leather, -0.07, 0.14, z, this.pack, false);
      strap.rotation.x = Math.PI / 2;
    }

    const upperGeo = new THREE.CapsuleGeometry(0.068, 0.1, 4, 10);
    const foreGeo = new THREE.CapsuleGeometry(0.062, 0.1, 4, 10);
    this.shoulders = [];
    this.elbows = [];
    this.hands = [];
    for (const side of [1, -1]) {
      const shoulder = pivot(0, 0.46, side * 0.225, this.chest);
      shoulder.rotation.order = 'YXZ';
      mesh(upperGeo, M.coat, 0, -0.1, 0, shoulder);
      const elbow = pivot(0, -0.21, 0, shoulder);
      mesh(foreGeo, M.coat, 0, -0.09, 0, elbow);
      mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.035, 10), M.trim, 0, -0.155, 0, elbow, false);
      const hand = pivot(0, -0.215, 0, elbow);
      blob(M.hand, 0.068, 0, 0, 0, hand, true);
      this.shoulders.push(shoulder);
      this.elbows.push(elbow);
      this.hands.push(hand);
    }

    this.neck = pivot(0, 0.58, 0, this.chest);
    const head = blob(M.skin, 0.25, 0, 0.215, 0, this.neck, true);
    head.scale.set(0.24, 0.25, 0.25);
    const hair = blob(M.hair, 0.262, -0.125, 0.24, 0, this.neck, true);
    hair.scale.set(0.2, 0.25, 0.272);
    for (const z of [-0.175, 0.175]) blob(M.hair, 0.1, -0.13, 0.09, z, this.neck).scale.set(0.09, 0.13, 0.085);
    blob(M.skin, 0.042, 0.238, 0.185, 0, this.neck);
    this.eyes = [];
    for (const z of [-0.095, 0.095]) {
      this.eyes.push(blob(M.eye, 0.036, 0.212, 0.245, z, this.neck));
      blob(M.blush, 0.045, 0.19, 0.155, z * 1.45, this.neck).scale.set(0.02, 0.035, 0.045);
    }

    const smile = mesh(new THREE.TorusGeometry(0.042, 0.011, 4, 8, Math.PI), M.hair, 0.208, 0.125, 0, this.neck, false);
    smile.rotation.y = -Math.PI / 2;
    smile.scale.y = -1;
    blob(M.hair, 0.1, 0.145, 0.35, 0, this.neck).scale.set(0.11, 0.06, 0.2);
    this.tail = pivot(-0.27, 0.17, 0, this.neck);
    blob(M.hair, 0.085, -0.01, -0.05, 0, this.tail, true);
    blob(M.hair, 0.06, -0.03, -0.15, 0, this.tail, true);
    blob(M.scarf, 0.04, 0.02, 0.02, 0, this.tail).scale.set(0.04, 0.03, 0.075);

    this.hat = pivot(0, 0.215, 0, this.neck);
    const hatTilt = pivot(0, 0.185, 0, this.hat);
    hatTilt.rotation.z = 0.14;
    mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.035, 20), M.hat, 0, 0, 0, hatTilt);
    mesh(new THREE.CylinderGeometry(0.17, 0.215, 0.2, 18), M.hat, 0, 0.11, 0, hatTilt);
    blob(M.hat, 0.17, 0, 0.2, 0, hatTilt).scale.set(0.17, 0.07, 0.17);
    mesh(new THREE.CylinderGeometry(0.212, 0.222, 0.06, 18), M.trim, 0, 0.05, 0, hatTilt, false);
    const feather = mesh(new THREE.ConeGeometry(0.035, 0.2, 5), M.scarf, -0.07, 0.115, 0.215, hatTilt, false);
    feather.rotation.set(0.25, 0, 1.0);
    feather.scale.z = 0.4;

    this.book = pivot(0.3, 0.27, 0, this.chest);
    this.book.rotation.z = -0.45;
    for (const side of [1, -1]) {
      const half = pivot(0, 0, 0, this.book);
      half.rotation.y = side * -0.3;
      mesh(new THREE.BoxGeometry(0.025, 0.24, 0.17), M.cover, 0.014, 0, side * 0.085, half, false);
      mesh(new THREE.BoxGeometry(0.02, 0.21, 0.15), M.pages, -0.006, 0, side * 0.082, half, false);
    }

    this.can = pivot(0, -0.02, 0, this.hands[1]);
    this.canTilt = pivot(0, 0, 0, this.can);
    this.canTilt.scale.setScalar(1.2);
    mesh(new THREE.CylinderGeometry(0.115, 0.15, 0.24, 14), M.copper, 0, -0.2, 0, this.canTilt);
    const handle = mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 14, Math.PI), M.copper, 0, -0.08, 0, this.canTilt, false);
    handle.scale.y = 0.9;
    const spout = mesh(new THREE.CylinderGeometry(0.028, 0.05, 0.32, 8), M.copper, 0.22, -0.16, 0, this.canTilt, false);
    spout.rotation.z = -0.95;
    const rose = mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.035, 10), M.brass, 0.36, -0.07, 0, this.canTilt, false);
    rose.rotation.z = -0.95;
    this.rose = pivot(0.39, -0.055, 0, this.canTilt);

    this.tool = pivot(0, 0, 0, this.hands[1]);
    mesh(new THREE.BoxGeometry(0.04, 0.34, 0.035), M.iron, 0, -0.13, 0, this.tool, false);
    mesh(new THREE.BoxGeometry(0.13, 0.08, 0.04), M.brass, 0, -0.32, 0, this.tool, false);

    this.poker = pivot(0, 0, 0, this.hands[1]);
    this.pokerTilt = pivot(0, 0, 0, this.poker);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), M.leather, 0, 0.02, 0, this.pokerTilt, false);
    mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.74, 6), M.brass, 0, -0.42, 0, this.pokerTilt);
    mesh(new THREE.BoxGeometry(0.13, 0.045, 0.045), M.brass, 0.045, -0.78, 0, this.pokerTilt, false);
    blob(M.hat, 0.045, 0.1, -0.78, 0, this.pokerTilt);
  }

  snap(mode) {
    this.mode = mode;
    this.cur.set(POSES[mode]);
  }

  update(dt, time, mode, facing, phase, motion, low = false, view = -facing * 1.57) {
    const { cur, tgt } = this;
    if (facing !== this.lastFacing) {
      cur[I.turn] -= Math.PI * facing;
      this.lastFacing = facing;
    }
    const was = this.mode;
    if (mode !== was) {
      const through = HOLD[mode] ?? HOLD[was];
      if (through && (mode === 'idle' || HOLD[mode])) {
        this.holdPose = through[0];
        this.hold = through[1];
      }
      if (mode === 'tend' || mode === 'water') this.work = 0;
    }
    this.mode = mode;
    this.hold = Math.max(0, this.hold - dt);
    const shown = this.hold > 0 && (mode === 'idle' || HOLD[mode]) ? this.holdPose : mode;
    this.phase = phase / TWO_PI;
    tgt.set(POSES[shown]);
    tgt[I.turn] *= -facing;
    const live = time * motion;
    const behind = Math.abs(view) > 1.9;

    if (shown === 'walk') {
      tgt[I.scarf] += Math.sin(phase * 2 + 1) * 0.16;
    } else if (shown === 'climb') {
      const p = this.phase - Math.floor(this.phase);
      const a = climbStroke(p);
      const b = climbStroke(p + 0.5);
      tgt[I.armL] += a * 0.5;
      tgt[I.armR] += b * 0.5;
      tgt[I.elbowL] += (1 - a) * 0.35;
      tgt[I.elbowR] += (1 - b) * 0.35;
      tgt[I.hipL] += b * 0.5;
      tgt[I.hipR] += a * 0.5;
      tgt[I.kneeL] -= b * 0.6;
      tgt[I.kneeR] -= a * 0.6;
      tgt[I.roll] = (a - b) * 0.04;
    } else if (shown === 'tend') {
      this.work += dt * 5.2;
      const s = Math.sin(this.work);
      const jab = Math.max(0, s);
      tgt[I.armR] += s * 0.3;
      tgt[I.elbowR] -= s * 0.45;
      tgt[I.armL] += s * 0.35;
      tgt[I.elbowL] -= s * 0.3;
      tgt[I.lean] -= s * 0.13;
      tgt[I.bodyX] += s * 0.07;
      tgt[I.bodyY] -= jab * 0.05;
      tgt[I.chest] -= jab * 0.12;
      tgt[I.headPitch] += jab * 0.12;
      tgt[I.scarf] = -s * 0.2;
    } else if (shown === 'tread') {
      this.work += dt * 8;
      const s = Math.sin(this.work);
      tgt[I.armR] += s * 0.4;
      tgt[I.elbowR] -= s * 0.4;
      tgt[I.armL] -= s * 0.1;
      tgt[I.chest] += s * 0.04;
      tgt[I.headPitch] += s * 0.05;
    } else if (shown === 'water') {
      this.work += dt * 2.4;
      const s = Math.sin(this.work);
      tgt[I.armR] += s * 0.05;
      tgt[I.armRy] += Math.sin(this.work * 0.5) * 0.1;
      tgt[I.lean] += s * 0.015;
      tgt[I.headYaw] = Math.sin(this.work * 0.5) * 0.12;
    } else if (shown === 'sit') {
      const turnPage = Math.max(0, Math.sin(live * 0.9) - 0.94) * 16;
      tgt[I.armR] += turnPage * 0.25;
      tgt[I.elbowR] -= turnPage * 0.3;
      tgt[I.headPitch] += Math.sin(live * 0.45) * 0.05;
      tgt[I.headYaw] = Math.sin(live * 0.3) * 0.1;
      tgt[I.kneeR] += Math.sin(live * 1.1) * 0.2;
      tgt[I.kneeL] += Math.sin(live * 1.1 + 2.2) * 0.14;
    } else if (shown === 'wheel') {
      const steer = Math.sin(live * 0.9) * 0.09 + Math.sin(live * 0.37) * 0.05;
      tgt[I.armL] += steer;
      tgt[I.armR] -= steer;
      tgt[I.elbowL] -= steer * 0.7;
      tgt[I.elbowR] += steer * 0.7;
      tgt[I.roll] = steer * 0.1;
      tgt[I.turn] = clamp(view, -0.55, 0.55);
      tgt[I.headYaw] = clamp(view - tgt[I.turn], -0.85, 0.85) * (behind ? 1 : 0.4) + Math.sin(live * 0.23) * 0.12;
      tgt[I.kneeL] += Math.sin(live * 0.8) * 0.1;
      tgt[I.kneeR] += Math.sin(live * 0.8 + 2) * 0.1;
    } else if (shown === 'idle') {
      const limit = behind ? 1.3 : 0.75;
      tgt[I.turn] = clamp(view, -limit, limit);
      const toward = view < 0 ? -1 : 1;
      const shift = Math.sin(live * 1.05);
      tgt[I.roll] = shift * 0.05;
      tgt[I.bodyZ] += shift * 0.018;
      tgt[I.bodyY] -= 0.012 + shift * shift * 0.016;
      tgt[I.footL] += shift * 0.012;
      tgt[I.footR] += shift * 0.012;
      tgt[I.headYaw] = behind
        ? clamp(view - tgt[I.turn], -0.8, 0.8) + Math.sin(live * 0.37) * 0.1
        : toward * (0.15 + Math.sin(live * 0.37) * 0.22 + Math.sin(live * 0.83) * 0.1);
      const rock = Math.max(0, Math.sin(live * 0.57 + 2) - 0.9) * 10;
      tgt[I.bodyY] += rock * 0.035;
      tgt[I.armLx] -= rock * 0.3;
      tgt[I.armRx] += rock * 0.3;
      tgt[I.headPitch] = Math.sin(live * 0.29 + 1) * 0.06 + rock * 0.14;
      const sway = Math.sin(live * 1.05 + 0.6);
      tgt[I.armL] += sway * 0.09;
      tgt[I.armR] -= sway * 0.09;
      tgt[I.elbowL] += sway * 0.07;
      tgt[I.elbowR] -= sway * 0.07;
      tgt[I.scarf] = Math.sin(live * 1.3) * 0.07;
      const tip = Math.min(1, Math.max(0, Math.sin(live * 0.9 + 1) - 0.72) * 6);
      const arm = view < 0 ? I.armR : I.armL;
      tgt[arm] += tip * 2.35;
      tgt[arm + 3] += tip * 1.15;
      tgt[I.headPitch] -= tip * 0.12;
      tgt[I.squash] = tip * 0.08;
    } else if (shown === 'lie') {
      const sigh = Math.sin(live * 1.2);
      tgt[I.chest] += sigh * 0.025;
      tgt[I.elbowL] -= sigh * 0.04;
      tgt[I.elbowR] -= sigh * 0.04;
      tgt[I.headYaw] = Math.sin(live * 0.21) * 0.08;
    }

    if (shown === 'tend' || shown === 'tread' || shown === 'water') this.#useNearHand(facing);

    this.duck = damp(this.duck, low && (mode === 'idle' || mode === 'walk') ? 1 : 0, 9, dt);
    const duck = this.duck;
    if (duck > 0.001) {
      tgt[I.chest] -= 1.2 * duck;
      tgt[I.headPitch] += 0.8 * duck;
      tgt[I.bodyY] -= 0.33 * duck;
      tgt[I.squash] = duck;
      tgt[I.lean] *= 1 - duck;
    }

    const settle = shown === 'lie' || shown === 'recline' ? 0.6 : 1;
    for (let i = 0; i < N; i++) cur[i] = damp(cur[i], tgt[i], RATE[i] * (i <= I.chest ? settle : 1), dt);
    this.gait = damp(this.gait, mode === 'walk' ? 1 : 0, 18, dt);
    this.pour = damp(this.pour, mode === 'water' ? 1 : 0, 8, dt);

    const breath = Math.sin(live * (mode === 'lie' ? 1.2 : 1.8)) * motion;
    this.coat.scale.set(0.86 + breath * 0.02, 1 + breath * 0.016, 1 + breath * 0.014);
    this.neck.position.y = 0.58 + breath * 0.011;
    this.shoulders[0].position.y = this.shoulders[1].position.y = 0.46 + breath * 0.009;
    const shut = mode === 'lie' || (motion > 0 && live % 4.3 < 0.13);
    const blink = shut ? 0.12 : 1;
    this.eyes[0].scale.y = this.eyes[1].scale.y = 0.036 * blink;
    this.tail.rotation.z = -0.1 - this.gait * 0.5 + Math.sin(live * 1.1) * 0.04 + Math.sin(phase * 2 + 2.4) * 0.14 * this.gait;
    this.#apply(mode === 'water' ? 1 : 0, facing);
  }

  #apply(pouring, facing = 1) {
    const c = this.cur;
    const g = this.gait;
    const p = this.phase;
    const swing = Math.cos(TWO_PI * (p - 0.03));
    const bounce = -Math.cos(2 * TWO_PI * (p - STANCE / 2));
    const rise = g * (bounce * 0.03 - 0.08 * (1 - this.duck));
    const late = -Math.cos(2 * TWO_PI * (p - STANCE / 2 - 0.07)) * g;

    this.root.position.set(c[I.bodyX], c[I.bodyY] + rise, c[I.bodyZ]);
    let turn = c[I.turn] % TWO_PI;
    if (turn > Math.PI) turn -= TWO_PI;
    else if (turn < -Math.PI) turn += TWO_PI;
    c[I.turn] = turn;
    this.root.rotation.set(c[I.roll] + g * swing * 0.03, turn - g * swing * 0.07, c[I.lean]);
    this.chest.rotation.z = c[I.chest];
    this.neck.rotation.set(0, c[I.headYaw] + g * swing * 0.05, c[I.headPitch] - late * 0.03);

    const ground = -(HIP_Y + c[I.bodyY] + rise);
    const ik = c[I.ik];
    for (let i = 0; i < 2; i++) {
      gaitFoot(p + i * 0.5);
      const slide = (foot.x / REACH) * HIP_SLIDE * g;
      const x = mix(c[I.footL + i], foot.x, g) - slide;
      const y = ground + mix(c[I.liftL + i], foot.lift, g) - (x + slide) * c[I.lean];
      solveLeg(x, Math.min(y, -0.1));
      this.hips[i].position.x = slide * ik;
      this.hips[i].rotation.z = mix(c[I.hipL + i * 2], leg.hip, ik);
      this.knees[i].rotation.z = mix(c[I.kneeL + i * 2], leg.knee, ik);
    }

    this.shoulders[0].rotation.set(c[I.armLx], c[I.armLy], mix(c[I.armL], 0.1 - swing * 0.75, g));
    this.elbows[0].rotation.z = mix(c[I.elbowL], 0.95 - swing * 0.3, g);
    this.shoulders[1].rotation.set(c[I.armRx], c[I.armRy], mix(c[I.armR], 0.1 + swing * 0.75, g));
    this.elbows[1].rotation.z = mix(c[I.elbowR], 0.95 + swing * 0.3, g);

    const doff = c[I.hat];
    this.hat.rotation.z = -doff * Math.PI * 0.5;
    this.hat.position.set(doff * -0.1 + Math.sin(doff * Math.PI) * 0.3, mix(0.215 + late * 0.012, -0.45, doff), 0);
    this.hat.scale.y = 1 - c[I.squash] * 0.5;
    this.pack.position.y = 0.3 - late * 0.018;
    this.scarfTail.rotation.z = c[I.scarf];
    this.#prop(this.pack, c[I.pack]);
    this.#prop(this.book, c[I.book]);
    this.#prop(this.can, c[I.can]);
    this.#prop(this.tool, c[I.tool]);
    this.#prop(this.poker, c[I.poker]);
    this.holdingCan = c[I.can] > 0.5;
    const near = facing > 0 ? 0 : 1;
    const reach = this.shoulders[near].rotation.z + this.elbows[near].rotation.z + c[I.lean] + c[I.chest];
    const tip = this.pour * (0.28 + Math.sin(this.work) * 0.07);
    this.canTilt.rotation.z = -reach - tip;
    this.pokerTilt.rotation.z = 1.42 - reach;
    this.pouring = pouring === 1 && this.pour > 0.8 && c[I.can] > 0.9;
  }

  #useNearHand(facing) {
    const t = this.tgt;
    const hand = this.hands[facing > 0 ? 0 : 1];
    if (this.can.parent !== hand) hand.add(this.can, this.tool, this.poker);
    if (facing < 0) return;
    let v = t[I.armL]; t[I.armL] = t[I.armR]; t[I.armR] = v;
    v = t[I.elbowL]; t[I.elbowL] = t[I.elbowR]; t[I.elbowR] = v;
    v = t[I.armLx]; t[I.armLx] = -t[I.armRx]; t[I.armRx] = -v;
    v = t[I.armLy]; t[I.armLy] = -t[I.armRy]; t[I.armRy] = -v;
  }

  #prop(object, amount) {
    object.visible = amount > 0.02;
    object.scale.setScalar(Math.max(amount, 0.001));
  }
}
