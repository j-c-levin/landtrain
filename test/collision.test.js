import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedAt } from '../src/world.js';

// A horizontal seg from (0,0) to (100,0), width 10, no padding.
const seg = (gaps) => [{ type: 'seg', x1: 0, z1: 0, x2: 100, z2: 0, w: 10, ...(gaps ? { gaps } : {}) }];

test('point inside a seg width with no gaps is blocked', () => {
  assert.equal(blockedAt(seg(), 50, 3, 0), true);
});

test('the same point is not blocked when a gap covers its t', () => {
  // closest point at t=0.5; gap [0.4,0.6] covers it
  assert.equal(blockedAt(seg([{ t0: 0.4, t1: 0.6 }]), 50, 3, 0), false);
});

test('a point inside the seg width but outside the gap is blocked', () => {
  // closest point at t=0.1, outside the [0.4,0.6] gap
  assert.equal(blockedAt(seg([{ t0: 0.4, t1: 0.6 }]), 10, 3, 0), true);
});

test('a circle obstacle still blocks', () => {
  const obstacles = [{ type: 'circle', x: 0, z: 0, r: 20 }];
  assert.equal(blockedAt(obstacles, 5, 5, 0), true);
  assert.equal(blockedAt(obstacles, 100, 100, 0), false);
});
