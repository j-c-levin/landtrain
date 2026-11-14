import { GRASSLAND } from '../constants.js';

// Pure placement maths for the grassland: every builder derives from the same
// river centrelines and channel profile, so they can never drift apart.

export const GRASS_LANDMARK = { x: GRASSLAND.maxX - 250, z: 0 };
export const GRASS_ARRIVE_RADIUS = 95;

export const xMin = GRASSLAND.minX;
export const xMax = GRASSLAND.maxX;
export const zMin = GRASSLAND.minZ;
export const zMax = GRASSLAND.maxZ;
export const xSpan = xMax - xMin;
export const zSpan = zMax - zMin;
export const cxRegion = (xMin + xMax) / 2;

export const DEPTH = 7; // channel floor sits at y = -DEPTH
export const BANK = 24; // bank slope width (lip -> floor) for rivers
export const RIVER_W = 18; // river flat-floor half-width
export const FOOT = RIVER_W + BANK; // river channel footprint half-width
export const WATER_Y = -DEPTH + 0.6;

const smooth = (t) => t * t * (3 - 2 * t);
// Height at distance `d` from a channel centre line with flat-floor
// half-width `w` and slope width `bank`.
export const channelY = (d, w, bank) => {
  if (d <= w) return -DEPTH;
  if (d >= w + bank) return 0;
  return -DEPTH * (1 - smooth((d - w) / bank));
};

// Each river meanders as a sine wave around its base x, south (t=0) to north
// (t=1), with one bridge gap.
export const riverDefs = [
  { x: xMin + 420, w: RIVER_W, amp: 45, waves: 2.0, phase: 0.4, gaps: [{ t0: 0.58, t1: 0.62 }] },
  { x: xMin + 1180, w: RIVER_W, amp: 60, waves: 1.5, phase: 2.1, gaps: [{ t0: 0.29, t1: 0.33 }] },
  { x: xMin + 1980, w: RIVER_W, amp: 40, waves: 2.5, phase: 5.0, gaps: [{ t0: 0.52, t1: 0.56 }] },
];
export const riverCenterX = (def, z) =>
  def.x + def.amp * Math.sin(((z - zMin) / zSpan) * Math.PI * def.waves + def.phase);

const overEast = 2600;
export const groundWestX = xMin - 1;
export const groundEastX = xMax + overEast;
export const planeD = zSpan + overEast;

// The moat's annulus: island edge to outer bank.
export const ISLAND_R = 150;
export const MOAT_R = 230;

// Is (x,z) over a sunken water channel?
export const onWater = (x, z) => {
  for (const def of riverDefs) if (Math.abs(x - riverCenterX(def, z)) < FOOT + 3) return true;
  const dr = Math.hypot(x - GRASS_LANDMARK.x, z - GRASS_LANDMARK.z);
  return dr > ISLAND_R - 3 && dr < MOAT_R + 3;
};
