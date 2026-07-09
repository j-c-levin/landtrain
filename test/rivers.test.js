import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedAt } from '../src/world.js';
import { chainRiverSegs } from '../src/grassland.js';

// chainRiverSegs turns one meandering river into a chain of `nSegs` collision
// segs sampled off a centerline, remapping each river-global gap window
// [t0,t1] (over the full z-run) into the local t-space of whichever sub-seg(s)
// it overlaps. The remap works in z-space: each sub-seg owns an equal z-slice.

// Real-scale region numbers (mirrors the grassland: zMin=-780, zSpan=1560,
// 12 segs => 130u per seg), so gap windows sit comfortably mid-seg and the
// seg width (18) covers the shared joints between segs.
const Z_MIN = -780;
const Z_SPAN = 1560;
const N = 12;
const zAt = (t) => Z_MIN + t * Z_SPAN;

test('a gap fully inside one sub-seg lands on exactly that seg', () => {
  // seg boundaries fall on t = k/12; the window [0.53,0.57] (z 46.8..109.2)
  // sits wholly inside seg index 6 (t 0.5..0.5833, z 0..130.1).
  const def = { x: 3120, w: 18, amp: 45, gaps: [{ t0: 0.53, t1: 0.57 }] };
  const segs = chainRiverSegs(def, Z_MIN, Z_SPAN, () => 3120, N);

  assert.equal(segs.length, N);
  const withGaps = segs.filter((s) => s.gaps && s.gaps.length);
  assert.equal(withGaps.length, 1);
  assert.equal(segs.indexOf(withGaps[0]), 6);

  const g = withGaps[0].gaps[0];
  // z-window [46.8,109.2] within seg6 z-range [0,130.1] -> local t
  const z0 = 0, z1 = Z_SPAN / N; // seg6 spans z 0..130.1
  assert.ok(Math.abs(g.t0 - (zAt(0.53) - z0) / (z1 - z0)) < 1e-9);
  assert.ok(Math.abs(g.t1 - (zAt(0.57) - z0) / (z1 - z0)) < 1e-9);
});

test('a gap straddling a seg boundary splits across both sub-segs', () => {
  // window [0.55,0.62] (z 78..187.2) crosses the node at t=0.5833 (z=130.1),
  // so it splits between seg6 (t0.5..0.5833) and seg7 (t0.5833..0.6667).
  const def = { x: 3120, w: 18, amp: 45, gaps: [{ t0: 0.55, t1: 0.62 }] };
  const segs = chainRiverSegs(def, Z_MIN, Z_SPAN, () => 3120, N);

  const withGaps = segs.map((s, i) => ({ i, s })).filter((e) => e.s.gaps && e.s.gaps.length);
  assert.deepEqual(withGaps.map((e) => e.i), [6, 7]);

  const node = zAt(7 / 12); // 130.1, shared boundary of seg6/seg7
  // seg6 (z 0..node): window's lower part [78..node] -> local t
  const g6 = segs[6].gaps[0];
  assert.ok(Math.abs(g6.t0 - (zAt(0.55) - 0) / (node - 0)) < 1e-9);
  assert.ok(Math.abs(g6.t1 - 1) < 1e-9); // runs to the north end of seg6
  // seg7 (z node..2*node): window's upper part [node..187.2] -> local t
  const segLen = Z_SPAN / N;
  const g7 = segs[7].gaps[0];
  assert.ok(Math.abs(g7.t0 - 0) < 1e-9); // starts at the south end of seg7
  assert.ok(Math.abs(g7.t1 - (zAt(0.62) - node) / segLen) < 1e-9);
});

test('blockedAt is false at a meandering river gap centre, true just outside', () => {
  const def = { x: 3120, w: 18, amp: 45, waves: 2.0, phase: 0.4, gaps: [{ t0: 0.53, t1: 0.57 }] };
  const centerXAt = (z) =>
    def.x + def.amp * Math.sin(((z - Z_MIN) / Z_SPAN) * Math.PI * def.waves + def.phase);
  const segs = chainRiverSegs(def, Z_MIN, Z_SPAN, centerXAt, N);

  // gap centre (t=0.55): on the centerline, the crossing is open
  const gapMidZ = zAt(0.55);
  assert.equal(blockedAt(segs, centerXAt(gapMidZ), gapMidZ, 0), false);

  // a point on the river well outside the gap is blocked
  const offZ = zAt(0.30);
  assert.equal(blockedAt(segs, centerXAt(offZ), offZ, 0), true);
});
