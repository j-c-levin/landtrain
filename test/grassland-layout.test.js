import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedAt } from '../src/collision.js';
import { TUNING } from '../src/constants.js';
import {
  GRASS_LANDMARK, WATER_Y, FOOT, RIVER_W, BANK, RIVER_SHORE, RING_SHORE, RING_MID, RING_W, RING_BANK,
  ISLAND_R, MOAT_R, channelY, onWater, riverDefs, riverCenterX,
} from '../src/grassland/layout.js';
import { MOAT_CROSSINGS, MOAT_GAP } from '../src/grassland/moat.js';

test('the shoreline is where the bank meets the water', () => {
  assert.ok(Math.abs(channelY(RIVER_SHORE, RIVER_W, BANK) - WATER_Y) < 1e-4);
  assert.ok(Math.abs(channelY(RING_SHORE, RING_W, RING_BANK) - WATER_Y) < 1e-4);
  assert.ok(RIVER_SHORE > RIVER_W && RIVER_SHORE < FOOT);
  assert.ok(RING_MID - RING_SHORE > ISLAND_R && RING_MID + RING_SHORE < MOAT_R);
});

test('the routing pad keeps the train off every river bank', () => {
  assert.ok(RIVER_W + TUNING.obstaclePad >= FOOT);
  for (const def of riverDefs) {
    for (const z of [-700, -300, 0, 300, 700]) assert.ok(onWater(riverCenterX(def, z) + RIVER_SHORE, z));
  }
});

test('the moat opens to the west, north and south only', () => {
  const ring = {
    type: 'ring', x: GRASS_LANDMARK.x, z: GRASS_LANDMARK.z, rInner: ISLAND_R, rOuter: MOAT_R,
    gaps: MOAT_CROSSINGS.map((a) => ({ a0: a - MOAT_GAP, a1: a + MOAT_GAP })),
  };
  const at = (a) => blockedAt([ring], GRASS_LANDMARK.x + Math.cos(a) * RING_MID, GRASS_LANDMARK.z + Math.sin(a) * RING_MID, TUNING.obstaclePad);
  assert.equal(at(Math.PI), false);
  assert.equal(at(-Math.PI + 0.1), false);
  assert.equal(at(Math.PI / 2), false);
  assert.equal(at(-Math.PI / 2), false);
  assert.equal(at(0), true);
  assert.equal(at(Math.PI * 0.75), true);
});
