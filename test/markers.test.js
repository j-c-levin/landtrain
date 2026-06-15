import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgePlacement } from '../src/markers.js';

test('target centered in front is on-screen', () => {
  const p = edgePlacement(0, 0, false, 0.9);
  assert.equal(p.onScreen, true);
});

test('target far to the right is off-screen, pinned right, points right', () => {
  const p = edgePlacement(2, 0, false, 0.9);
  assert.equal(p.onScreen, false);
  assert.ok(p.sx > 0.9, `sx ${p.sx} should be near right edge`);
  assert.ok(Math.abs(p.sy - 0.5) < 1e-9, 'sy centered');
  assert.ok(Math.abs(p.angle) < 1e-9, 'angle ~0 (right)');
});

test('target above is pinned to the top of the screen', () => {
  const p = edgePlacement(0, 2, false, 0.9);
  assert.equal(p.onScreen, false);
  assert.ok(p.sy < 0.1, `sy ${p.sy} should be near top`);
});

test('target behind the camera is off-screen and direction is flipped', () => {
  const p = edgePlacement(0.5, 0, true, 0.9);
  assert.equal(p.onScreen, false);
  assert.ok(p.sx < 0.1, `sx ${p.sx} should be flipped to the left`);
});
