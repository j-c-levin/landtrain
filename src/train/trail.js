import { clamp } from '../constants.js';

// Each car samples the lead point's polyline at its own offset, so it turns where the car ahead turned.
export class TrailPath {
  constructor() {
    this.pts = [];
    this.head = 0;
  }

  seed(x, z, heading, length) {
    this.pts = [];
    const n = Math.ceil(length / 2);
    let s = 0;
    for (let i = n; i >= 0; i--) {
      const d = i * 2;
      this.pts.push({ x: x - Math.cos(heading) * d, z: z + Math.sin(heading) * d, s: 0 });
    }
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1];
      const b = this.pts[i];
      s += Math.hypot(b.x - a.x, b.z - a.z);
      b.s = s;
    }
    this.head = s;
  }

  advance(x, z, step) {
    this.head += step;
    const last = this.pts[this.pts.length - 1];
    if (Math.hypot(x - last.x, z - last.z) >= 0.3) {
      this.pts.push({ x, z, s: this.head });
      while (this.pts.length > 2 && this.pts[1].s < this.head - 90) this.pts.shift();
    }
  }

  // Central-difference tangent at a polyline vertex.
  #tangentAt(idx) {
    const pts = this.pts;
    const a = pts[Math.max(0, idx - 1)];
    const b = pts[Math.min(pts.length - 1, idx + 1)];
    return Math.atan2(-(b.z - a.z), b.x - a.x);
  }

  // The heading is interpolated shortest-arc between vertex tangents, or cars snap at segment boundaries.
  frame(s, out = {}) {
    const pts = this.pts;
    s = clamp(s, pts[0].s, pts[pts.length - 1].s);
    let i = pts.length - 1;
    while (i > 1 && pts[i - 1].s > s) i--;
    const a = pts[i - 1];
    const b = pts[i];
    const t = (s - a.s) / ((b.s - a.s) || 1);
    const thA = this.#tangentAt(i - 1);
    const thB = this.#tangentAt(i);
    let dTh = thB - thA;
    while (dTh > Math.PI) dTh -= Math.PI * 2;
    while (dTh < -Math.PI) dTh += Math.PI * 2;
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.theta = thA + dTh * t;
    return out;
  }
}
