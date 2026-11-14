import { clamp } from './constants.js';

// Distance from a point to a segment, plus the clamped parameter t (0..1) of
// the closest point along (x1,z1)->(x2,z2). The t lets callers test bridge
// gaps without recomputing the projection.
export function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (pz - z1) * dz) / len2;
  t = clamp(t, 0, 1);
  const cx = x1 + dx * t;
  const cz = z1 + dz * t;
  return { dist: Math.hypot(px - cx, pz - cz), t };
}

// Is angle `ang` inside the window [a0, a1] (radians), handling wrap past ±PI?
function angleInWindow(ang, a0, a1) {
  const TAU = Math.PI * 2;
  const norm = (x) => ((x % TAU) + TAU) % TAU;
  const a = norm(ang), lo = norm(a0), hi = norm(a1);
  return lo <= hi ? a >= lo && a <= hi : a >= lo || a <= hi;
}

export function blockedAt(obstacles, x, z, pad) {
  for (const o of obstacles) {
    if (o.type === 'circle') {
      if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
    } else if (o.type === 'ring') {
      const d = Math.hypot(x - o.x, z - o.z);
      if (d > o.rInner - pad && d < o.rOuter + pad) {
        const ang = Math.atan2(z - o.z, x - o.x);
        // a gap window (angular) marks a bridge: skip blocking there
        if (o.gaps && o.gaps.some((g) => angleInWindow(ang, g.a0, g.a1))) continue;
        return true;
      }
    } else {
      const { dist, t } = segDist(x, z, o.x1, o.z1, o.x2, o.z2);
      if (dist < o.w + pad) {
        // A `gaps: [{t0, t1}]` window marks a bridge — the closest point on
        // the seg falling inside any gap means this seg does not block here.
        if (o.gaps && o.gaps.some((g) => t >= g.t0 && t <= g.t1)) continue;
        return true;
      }
    }
  }
  return false;
}
