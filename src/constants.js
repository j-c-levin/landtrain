// Shared spatial + tuning constants. Train-local space: +X is the nose
// (cab end), +Z is the open "doll's house" side the camera looks through.

export const CAR_LEN = 14;
export const CAR_GAP = 2.6;
export const CAR_CENTERS = [16.6, 0, -16.6]; // cab, engine, living
export const TRAIN_HALF = 24.6; // walkable extent each way from centre

// Feet heights for the three walkable storeys. The raised cab's floor IS
// the roof storey — you walk the rooftop straight into it.
export const LEVELS = {
  under: 0.06,
  deck: 1.78,
  roof: 5.05,
};

// Ladder columns (train-local X) and which storeys each connects.
// The front ladder stops at deck — the cab sits above it.
export const LADDERS = [
  { x: -24.0, levels: ['under', 'deck', 'roof'] },
  { x: -8.3, levels: ['under', 'deck', 'roof'] },
  { x: 8.3, levels: ['under', 'deck', 'roof'] },
  { x: 24.0, levels: ['under', 'deck'] },
];

// The raised cab occupies the front-car rooftop from this local X forward.
export const CAB_FROM_X = 12.6;

export const WORLD = {
  minX: -250,
  maxX: 2700,
  minZ: -780,
  maxZ: 780,
};

export const LANDMARK = { x: 2450, z: 0 };
export const ARRIVE_RADIUS = 95;

export const TUNING = {
  baseSpeed: 7.0, // u/s at perfect upkeep
  accel: 2.2,
  // Heading change per unit DISTANCE, not per second: the trail can never
  // bend tighter than R = 1/curvature ≈ 12.5u, so cars sweep real arcs and
  // never whip around a kink recorded during a slow pivot.
  curvature: 0.08,
  waypointRadius: 14,
  lookahead: 30, // bump detection distance ahead of the nose
  obstaclePad: 18, // clearance margin — firm enough to protect the side camera, fair to the eye

  effDriftPerSec: 0.30, // while moving
  effFloor: 25,
  wearPerUnit: 0.085, // 100 wear ≈ 1180 u travelled
  wearCeil: 100,
  plantDriftPerSec: 0.14,
  plantFloor: 18,

  serviceRate: 55, // gauge points per second while holding E
  repairRate: 70,
  waterRate: 65,

  walkSpeed: 4.6,
  climbSpeed: 2.7,

  revealRadius: 112,
  revealEvery: 14, // units travelled between fog punches
};

// speed = baseSpeed * effMult * treadMult — never zero, only sluggish.
export function effMult(eff) {
  return 0.45 + 0.55 * (eff / 100);
}

export function treadMult(wear) {
  return 1 - 0.35 * (wear / 100);
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smootherstep(t) {
  t = clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Frame-rate independent exponential approach.
export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}
