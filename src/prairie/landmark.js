import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANDMARK } from '../constants.js';
import { CHART, PRAIRIE_LOOK, prairieMaterials, jitterHSL, getLookTier } from '../look.js';
import { mulberry } from '../prng.js';
import { terraceGeometry, TERRACE } from './rocks.js';

export const MESA_RADIUS = 96;
const MESA_HEIGHT = 17;
const TOP = MESA_HEIGHT - 0.5;
const FORK = 58;
const FAR_FROM = 640;
const LEVELS = TERRACE.map(([t]) => t * MESA_HEIGHT - 0.5);

const DETAIL = {
  high: { radial: 12, rings: 9, boughRadial: 7, clumps: [4, 3, 6], roots: 9, lanterns: 18, pennants: 16, shrubs: 26 },
  medium: { radial: 10, rings: 7, boughRadial: 6, clumps: [3, 2, 5], roots: 8, lanterns: 14, pennants: 13, shrubs: 18 },
  low: { radial: 8, rings: 6, boughRadial: 5, clumps: [2, 1, 4], roots: 6, lanterns: 10, pennants: 10, shrubs: 10 },
};

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();

const v = (x, y, z) => new THREE.Vector3(x, y, z);

// A tapered limb swept along a curve; `shape(t, a)` scales the radius, `tone(t, a)` shades the bark.
function tube(points, r0, r1, radial, rings, shape, tone) {
  const curve = new THREE.CatmullRomCurve3(points);
  const pos = [];
  const col = [];
  const idx = [];
  const [dark, lit] = PRAIRIE_LOOK.greatTree.bark;
  curve.getTangent(0, _t);
  _n.set(1, 0, 0);
  if (Math.abs(_t.x) > 0.9) _n.set(0, 0, 1);
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    curve.getPoint(t, _p);
    curve.getTangent(t, _t);
    _n.addScaledVector(_t, -_n.dot(_t)).normalize();
    _b.crossVectors(_t, _n);
    const r = r0 + (r1 - r0) * t ** 0.8;
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const rr = r * (shape ? shape(t, a) : 1);
      const cx = Math.cos(a) * rr;
      const sx = Math.sin(a) * rr;
      pos.push(_p.x + _n.x * cx + _b.x * sx, _p.y + _n.y * cx + _b.y * sx, _p.z + _n.z * cx + _b.z * sx);
      _c.set(dark).lerp(_c2.set(lit), tone ? tone(t, a) : 0.5).toArray(col, col.length);
    }
    if (i < rings) {
      for (let k = 0; k < radial; k++) {
        const a0 = i * radial + k;
        const a1 = i * radial + ((k + 1) % radial);
        idx.push(a0, a1, a1 + radial, a0, a1 + radial, a0 + radial);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, curve };
}

function clump(rand, x, y, z, r, squash, base, shade, detail = 1) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('uv');
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a1 = rand() * 9;
  const a2 = rand() * 9;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const pz = p.getZ(i);
    const k = 0.8 + 0.2 * Math.sin(px * 4.1 + a1) * Math.sin(pz * 3.7 + a2) + 0.14 * Math.sin(py * 5.3 + a1 + a2);
    const yy = Math.max(py, -0.32) * k;
    p.setXYZ(i, px * k * r, yy * r * squash, pz * k * r);
    const lift = (0.52 + 0.66 * (yy + 0.32) / 1.32) * shade;
    col[i * 3] = base.r * lift;
    col[i * 3 + 1] = base.g * lift;
    col[i * 3 + 2] = base.b * lift * 0.94;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.rotateY(rand() * Math.PI);
  geo.translate(x, y, z);
  geo.computeVertexNormals();
  return geo;
}

function tinted(geo, hex, gain = 1) {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  if (flat !== geo) geo.dispose();
  flat.deleteAttribute('uv');
  _c.set(hex).multiplyScalar(gain);
  const col = new Float32Array(flat.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) _c.toArray(col, i);
  flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return flat;
}

function triangles(list) {
  const pos = [];
  const col = [];
  for (const [a, b, c, hex] of list) {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    _c.set(hex);
    for (let i = 0; i < 3; i++) col.push(_c.r, _c.g, _c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

const merged = (parts) => {
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return geo;
};

const trunkPath = () => [v(0, TOP - 3, 0), v(1.6, 30, -1.2), v(-1.2, 46, 1.6), v(0.4, FORK + 4, 0)];
const trunkShape = (t, a) => (1 + 1.1 * Math.exp(-t * 8) * (1 + 0.35 * Math.sin(a * 4 + 0.6))) * (1 + 0.08 * Math.sin(a * 5 + t * 5));
const trunkTone = (t, a) => 0.5 + 0.5 * Math.sin(a * 5 + t * 5) * 0.8 + (t - 0.5) * 0.3;

// The crown's skeleton: great boughs sweep out of the fork, each forking again under the canopy.
function skeleton(rand) {
  const boughs = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4 + (rand() - 0.5) * 0.5;
    const reach = 34 + rand() * 13;
    const top = 84 + rand() * 8;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const path = [
      v(dx * 1.5, FORK - 4, dz * 1.5), v(dx * 9, FORK + 9, dz * 9),
      v(dx * reach * 0.6, top - 9, dz * reach * 0.6), v(dx * reach, top, dz * reach),
    ];
    const forks = [];
    for (const turn of [-0.5 - rand() * 0.3, 0.45 + rand() * 0.3]) {
      const fa = a + turn;
      const fr = reach * (0.75 + rand() * 0.4);
      forks.push([
        v(dx * reach * 0.5, top - 13, dz * reach * 0.5),
        v((dx * reach * 0.55 + Math.cos(fa) * fr) * 0.55, top - 5, (dz * reach * 0.55 + Math.sin(fa) * fr) * 0.55),
        v(Math.cos(fa) * fr, top + 1 + rand() * 5, Math.sin(fa) * fr),
      ]);
    }
    boughs.push({ path, forks });
  }
  return boughs;
}

function crownAnchors(boughs) {
  const anchors = [{ at: v(0, 97, 0), kind: 2 }];
  for (const bough of boughs) {
    anchors.push({ at: bough.path[3], kind: 0 });
    for (const fork of bough.forks) anchors.push({ at: fork[2], kind: 1 });
  }
  return anchors;
}

function canopy(rand, anchors, counts, size) {
  const parts = [];
  const look = PRAIRIE_LOOK.greatTree;
  const base = new THREE.Color();
  for (const { at, kind } of anchors) {
    for (let i = 0; i < counts[kind]; i++) {
      const a = rand() * Math.PI * 2;
      const d = i === 0 ? 0 : (kind === 2 ? 9 + rand() * 12 : 6 + rand() * 9) * size;
      const r = (kind === 2 ? 15 + rand() * 6 : 10 + rand() * 7) * size * (i === 0 ? 1.15 : 1);
      const y = at.y + (kind === 2 ? rand() * 5 : -1 + rand() * 6) - (i === 0 ? 0 : 2);
      jitterHSL(base, rand, rand() > 0.9 ? look.leafGold : look.leafHsl);
      const out = Math.hypot(at.x, at.z) / 50;
      parts.push(clump(rand, at.x + Math.cos(a) * d, y, at.z + Math.sin(a) * d, r, 0.44 + rand() * 0.16, base, 1.06 - out * 0.16));
    }
  }
  return merged(parts);
}

function timber(rand, boughs, detail) {
  const parts = [];
  parts.push(tube(trunkPath(), 10, 6, detail.radial, detail.rings, trunkShape, trunkTone).geo);
  const curves = [];
  for (const bough of boughs) {
    const made = tube(bough.path, 4.2, 1.5, detail.boughRadial, 6, null, (t, a) => 0.35 + 0.3 * Math.sin(a * 3) + t * 0.3);
    parts.push(made.geo);
    curves.push(made.curve);
    for (const fork of bough.forks) {
      parts.push(tube(fork, 1.9, 0.6, Math.max(4, detail.boughRadial - 2), 3, null, () => 0.6).geo);
    }
  }
  for (let i = 0; i < detail.roots; i++) {
    const a = (i / detail.roots) * Math.PI * 2 + rand() * 0.5;
    const reach = 24 + rand() * 16;
    const bend = a + (rand() - 0.5) * 0.7;
    parts.push(tube([
      v(Math.cos(a) * 6, TOP + 7, Math.sin(a) * 6),
      v(Math.cos(a) * 15, TOP + 1.6, Math.sin(a) * 15),
      v(Math.cos(bend) * reach * 0.7, TOP + 0.8, Math.sin(bend) * reach * 0.7),
      v(Math.cos(bend) * reach, TOP - 2.5, Math.sin(bend) * reach),
    ], 3.4, 0.7, 5, 5, null, (t) => 0.3 + t * 0.4).geo);
  }
  return { geo: merged(parts), curves };
}

// The terrace's plan at each row of its profile, foot to rim: (row, angle) => radius.
function outline(mesa) {
  const p = mesa.attributes.position;
  const rows = new Map();
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    if (r < 1) continue;
    const key = Math.round(p.getY(i) * 10);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push([Math.atan2(p.getZ(i), p.getX(i)), r]);
  }
  const levels = [...rows.keys()].sort((a, b) => a - b).map((key) => rows.get(key));
  return (row, a) => {
    let best = levels[row][0];
    let gap = 9;
    for (const point of levels[row]) {
      const d = Math.abs(Math.atan2(Math.sin(point[0] - a), Math.cos(point[0] - a)));
      if (d < gap) {
        gap = d;
        best = point;
      }
    }
    return best[1];
  };
}

// Rows of the terrace along the west face, foot to rim: [radius, height].
function westFace(mesa) {
  const p = mesa.attributes.position;
  const rows = new Map();
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    if (r < 1) continue;
    const off = Math.abs(Math.abs(Math.atan2(p.getZ(i), p.getX(i))) - Math.PI);
    const key = Math.round(p.getY(i) * 10);
    const best = rows.get(key);
    if (!best || off < best.off) rows.set(key, { off, r, y: p.getY(i) });
  }
  return [...rows.values()].sort((a, b) => a.y - b.y);
}

function dressing(rand, mesa, ring, detail, lights) {
  const look = PRAIRIE_LOOK.greatTree;
  const parts = [];
  const flags = [];

  // a stair cut up the west face, each tread set on the terrace's own profile
  const face = westFace(mesa);
  const radiusAt = (y) => {
    let k = 0;
    while (k < face.length - 2 && y > face[k + 1].y) k++;
    const t = Math.min(1, Math.max(0, (y - face[k].y) / Math.max(1e-3, face[k + 1].y - face[k].y)));
    return face[k].r + (face[k + 1].r - face[k].r) * t;
  };
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const h = (TOP + 0.5) * ((i + 1) / steps);
    const r = radiusAt(h + 0.5 - (TOP + 0.5) / steps) + 1.2;
    const wide = 11.5 - (i / steps) * 3;
    const box = new THREE.BoxGeometry(4.6, h + 2, wide);
    box.translate(-r + 1.6, h / 2 - 1.5, 0);
    parts.push(tinted(box, look.stair, i % 2 ? 0.93 : 1.05));
    for (const side of [-1, 1]) {
      const cheek = new THREE.BoxGeometry(4.6, h + 3.3, 1.3);
      cheek.translate(-r + 1.6, h / 2 - 0.85, side * (wide / 2 + 0.6));
      parts.push(tinted(cheek, look.stone, 0.9));
    }
  }

  const foot = radiusAt(0) + 3.5;
  for (const side of [-1, 1]) {
    const pillar = new THREE.BoxGeometry(2.2, 7, 2.2);
    pillar.translate(-foot, 3, side * 8.2);
    parts.push(tinted(pillar, look.stone, 0.96));
    const cap = new THREE.ConeGeometry(2.3, 1.6, 4);
    cap.rotateY(Math.PI / 4);
    cap.translate(-foot, 9.6, side * 8.2);
    parts.push(tinted(cap, look.timber, 1.4));
    lights.push(v(-foot, 7.8, side * 8.2));
  }

  const head = radiusAt(TOP) - 4;
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const stone = new THREE.CylinderGeometry(1.5 + rand() * 0.7, 1.7 + rand() * 0.7, 0.5, 6);
    stone.rotateY(rand() * Math.PI);
    stone.translate(-head + (head - 22) * t, TOP + 0.1, Math.sin(t * 5 + 1) * 1.6);
    parts.push(tinted(stone, look.stair, 0.9 + rand() * 0.2));
  }

  for (let i = 0; i < detail.shrubs; i++) {
    const a = rand() * Math.PI * 2;
    const row = [0, 1, 3][i % 3];
    const r = ring(row, a) + (row === 0 ? 2 + rand() * 9 : -2 - rand() * 6);
    const size = 0.9 + rand() * rand() * 2.6;
    const turn = rand() * Math.PI;
    if (Math.abs(Math.abs(a) - Math.PI) < 0.24) continue;
    const block = new THREE.IcosahedronGeometry(size, 0);
    block.scale(1, 0.62, 1);
    block.rotateY(turn);
    block.translate(Math.cos(a) * r, LEVELS[row] + size * 0.3, Math.sin(a) * r);
    parts.push(tinted(block, look.mesaBands[i % look.mesaBands.length], 0.86 + rand() * 0.2));
  }

  const porch = new THREE.BoxGeometry(5, 10.5, 7.4);
  porch.translate(-15, TOP + 4.6, 0);
  parts.push(tinted(porch, look.timber));
  const lintel = new THREE.BoxGeometry(6.6, 1.1, 9.4);
  lintel.translate(-15.4, TOP + 10.2, 0);
  parts.push(tinted(lintel, look.timber, 1.5));

  const posts = [];
  const lines = 8;
  for (let i = 0; i < lines; i++) {
    const a = ((i + 0.5) / lines) * Math.PI * 2;
    const r = MESA_RADIUS + 12 + rand() * 8;
    const post = v(Math.cos(a) * r, 11, Math.sin(a) * r);
    posts.push(post);
    const pole = new THREE.CylinderGeometry(0.45, 0.7, 12, 5);
    pole.translate(post.x, 5, post.z);
    parts.push(tinted(pole, look.timber, 1.3));
    lights.push(v(post.x, 12.2, post.z));

    const from = v(Math.cos(a) * 5, FORK + 1, Math.sin(a) * 5);
    const span = [];
    const n = detail.pennants + 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const at = from.clone().lerp(post, t);
      at.y -= Math.sin(t * Math.PI) * 9;
      span.push(at);
    }
    const side = v(-Math.sin(a), 0, Math.cos(a));
    const tris = [];
    for (let k = 0; k < n; k++) {
      const p0 = span[k];
      const p1 = span[k + 1];
      tris.push([p0, p1, v(p0.x, p0.y - 0.28, p0.z), look.timber]);
      tris.push([p1, v(p1.x, p1.y - 0.28, p1.z), v(p0.x, p0.y - 0.28, p0.z), look.timber]);
      if (k === 0) continue;
      const mid = p0.clone().lerp(p1, 0.5);
      const drop = 3.4 + rand() * 0.8;
      const flutter = (rand() - 0.5) * 1.6;
      tris.push([
        p0.clone().lerp(p1, 0.12), p0.clone().lerp(p1, 0.88),
        v(mid.x + side.x * flutter, mid.y - drop, mid.z + side.z * flutter),
        look.pennants[(k + i) % look.pennants.length],
      ]);
    }
    flags.push(triangles(tris));
  }
  return { fixed: merged(parts), flags: merged(flags) };
}

function lanterns(rand, curves, detail, lights) {
  const look = PRAIRIE_LOOK.greatTree;
  const bodies = [];
  const fittings = [];
  for (let i = 0; i < detail.lanterns; i++) {
    const curve = curves[i % curves.length];
    curve.getPoint(0.4 + rand() * 0.58, _p);
    const drop = 7 + rand() * 17;
    const x = _p.x;
    const z = _p.z;
    const y = _p.y - drop;
    const body = new THREE.CylinderGeometry(1.25, 0.95, 2.8, 6);
    body.translate(x, y, z);
    bodies.push(body);
    const cap = new THREE.ConeGeometry(1.7, 1.1, 6);
    cap.translate(x, y + 1.9, z);
    fittings.push(tinted(cap, look.timber));
    fittings.push(triangles([
      [v(x - 0.12, y + 2.2, z), v(x + 0.12, y + 2.2, z), v(x, _p.y, z), look.timber],
      [v(x, y + 2.2, z - 0.12), v(x, y + 2.2, z + 0.12), v(x, _p.y, z), look.timber],
    ]));
    lights.push(v(x, y, z));
  }
  return { bodies: merged(bodies), fittings: merged(fittings) };
}

function windows(lights) {
  const look = PRAIRIE_LOOK.greatTree;
  const curve = new THREE.CatmullRomCurve3(trunkPath());
  const panes = [];
  const frames = [];

  const door = new THREE.Shape();
  door.moveTo(-1.9, 0);
  door.lineTo(-1.9, 5);
  door.absarc(0, 5, 1.9, Math.PI, 0, true);
  door.lineTo(1.9, 0);
  const doorGeo = new THREE.ShapeGeometry(door, 5);
  doorGeo.rotateY(-Math.PI / 2);
  doorGeo.translate(-17.56, TOP + 0.4, 0);
  panes.push(doorGeo);
  lights.push(v(-18.4, TOP + 4, 0));

  for (const [y, a] of [[31, 2.5], [37, 3.7], [44, 2.9], [51, 3.4], [40, 1.2], [47, 5.3], [33, 0.2]]) {
    const t = (y - TOP + 3) / (FORK + 7 - TOP);
    curve.getPoint(t, _p);
    const r = (10 + (6 - 10) * t ** 0.8) * (1 + 1.5 * Math.exp(-t * 8)) * 1.08 + 0.2;
    const x = _p.x + Math.cos(a) * r;
    const z = _p.z + Math.sin(a) * r;
    const frame = new THREE.CylinderGeometry(1.75, 1.75, 2.4, 8);
    frame.rotateZ(Math.PI / 2);
    frame.rotateY(-a);
    frame.translate(x - Math.cos(a) * 1.0, y, z - Math.sin(a) * 1.0);
    frames.push(tinted(frame, look.timber, 1.2));
    const pane = new THREE.CircleGeometry(1.3, 8);
    pane.rotateY(Math.PI / 2 - a);
    pane.translate(x + Math.cos(a) * 0.24, y, z + Math.sin(a) * 0.24);
    panes.push(pane);
    lights.push(v(x + Math.cos(a) * 0.8, y, z + Math.sin(a) * 0.8));
  }
  return { panes: merged(panes), frames: merged(frames) };
}

function turf(rand, count, ring) {
  const parts = [];
  const base = new THREE.Color();
  const onStair = (a) => Math.abs(Math.abs(a) - Math.PI) < 0.22;
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = 15 + rand() * 20;
    if (Math.abs(Math.abs(a) - Math.PI) < 0.35 && d > 22) continue;
    jitterHSL(base, rand, PRAIRIE_LOOK.bush);
    parts.push(clump(rand, Math.cos(a) * d, TOP + 0.3, Math.sin(a) * d, 1.6 + rand() * 2.4, 0.7, base, 1));
  }
  const local = mulberry(8101);
  const sod = new THREE.Color(PRAIRIE_LOOK.greatTree.turf);
  const scatter = (n, row, inset, spread, size, look) => {
    for (let i = 0; i < n; i++) {
      const a = ((i + local()) / n) * Math.PI * 2;
      const r = ring(row, a) + inset + local() * spread;
      const s = size * (0.6 + local() * 0.9);
      if (look) jitterHSL(base, local, look);
      else base.copy(sod).multiplyScalar(0.82 + local() * 0.3);
      if (onStair(a)) continue;
      parts.push(clump(local, Math.cos(a) * r, LEVELS[row] + (look ? 0.2 : -s * 0.25), Math.sin(a) * r, s, look ? 0.7 : 0.5, base, 1, 0));
    }
  };
  scatter(Math.round(count * 1.5), 5, -1.6, 1.6, 2.6, null);
  scatter(Math.round(count * 0.6), 3, -11, 8, 1.7, PRAIRIE_LOOK.bush);
  scatter(Math.round(count * 0.7), 1, -11, 8, 2, PRAIRIE_LOOK.bush);
  scatter(Math.round(count * 0.7), 0, 1, 9, 2.3, PRAIRIE_LOOK.bush);
  return merged(parts);
}

function flock(rand) {
  const tris = [];
  const hex = PRAIRIE_LOOK.greatTree.bird;
  const birds = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 46 + rand() * 40;
    const y = 104 + rand() * 26;
    const at = v(Math.cos(a) * r, y, Math.sin(a) * r);
    const fwd = v(-Math.sin(a), 0, Math.cos(a));
    const out = v(Math.cos(a), 0, Math.sin(a));
    const span = 1.9 + rand() * 0.9;
    const lift = 0.5 + rand() * 1.1;
    const nose = at.clone().addScaledVector(fwd, 1.1);
    const tail = at.clone().addScaledVector(fwd, -0.9);
    for (const s of [-1, 1]) {
      const tip = at.clone().addScaledVector(out, span * s).addScaledVector(fwd, -0.7);
      tip.y += lift;
      tris.push([nose, tail, tip, hex]);
    }
  }
  birds.add(new THREE.Mesh(triangles(tris), prairieMaterials.bird()));
  return birds;
}

// Hazed lightly, so the tree grows out of the horizon as the train closes in.
export function buildLandmark(root) {
  const tier = getLookTier();
  const detail = DETAIL[tier] || DETAIL.medium;
  const look = PRAIRIE_LOOK.greatTree;
  const rand = mulberry(81);
  const group = new THREE.Group();
  group.position.set(LANDMARK.x, 0, LANDMARK.z);

  const trunkMat = prairieMaterials.trunk();
  const leafMat = prairieMaterials.leaf();
  const dressMat = prairieMaterials.dressing();
  const lanternMat = prairieMaterials.lantern();

  const mesaGeo = terraceGeometry(rand, MESA_RADIUS, MESA_HEIGHT, { bands: look.mesaBands, cap: look.turf });
  const mesa = new THREE.Mesh(mesaGeo, prairieMaterials.mesa());
  mesa.position.y = -0.5;
  mesa.castShadow = true;
  group.add(mesa);

  const ring = outline(mesaGeo);
  const boughs = skeleton(rand);
  const anchors = crownAnchors(boughs);
  const lights = [];

  const near = new THREE.Group();
  const far = new THREE.Group();
  group.add(near, far);

  const wood = timber(rand, boughs, detail);
  const trunk = new THREE.Mesh(wood.geo, trunkMat);
  const crown = new THREE.Mesh(canopy(rand, anchors, detail.clumps, 1), leafMat);
  trunk.castShadow = true;
  crown.castShadow = true;
  near.add(trunk, crown);

  const hung = lanterns(rand, wood.curves, detail, lights);
  const lit = windows(lights);
  near.add(new THREE.Mesh(hung.bodies, lanternMat), new THREE.Mesh(lit.panes, lanternMat));
  const dressed = dressing(rand, mesaGeo, ring, detail, lights);
  const trim = merged([dressed.fixed, hung.fittings, lit.frames]);
  near.add(new THREE.Mesh(trim, dressMat));
  const bunting = new THREE.Mesh(dressed.flags, dressMat);
  near.add(bunting);
  near.add(new THREE.Mesh(turf(rand, detail.shrubs, ring), leafMat));

  const farRand = mulberry(82);
  const farWood = timber(farRand, boughs, { radial: 6, rings: 4, boughRadial: 4, roots: 0 });
  far.add(new THREE.Mesh(farWood.geo, trunkMat));
  far.add(new THREE.Mesh(canopy(farRand, anchors.filter((a) => a.kind !== 1), [1, 0, 2], 1.75), leafMat));

  const glowGeo = new THREE.BufferGeometry().setFromPoints(lights);
  const glow = new THREE.Points(glowGeo, prairieMaterials.lanternGlow());
  group.add(glow);

  const birds = flock(rand);
  group.add(birds);

  const halo = new THREE.Sprite(prairieMaterials.halo());
  halo.material.blending = THREE.AdditiveBlending;
  halo.scale.setScalar(190);
  halo.position.y = 84;
  group.add(halo);

  // glow: 0 by day, 1 with the lamps fully lit
  group.userData.tick = (time, eye, glowing = 0) => {
    const close = Math.hypot(eye.x - LANDMARK.x, eye.z - LANDMARK.z) < FAR_FROM || eye.y > 200;
    near.visible = close;
    far.visible = !close;
    birds.rotation.y = time * 0.07;
    glow.material.opacity = 0.22 + 0.68 * glowing;
    lanternMat.emissiveIntensity = 1.5 + 1.6 * glowing;
    // a beacon from afar, a faint bloom up close
    const away = Math.hypot(eye.x - LANDMARK.x, eye.z - LANDMARK.z);
    halo.material.opacity = (0.3 + 0.4 * glowing) * Math.min(1, Math.max(0.2, (away - 180) / 700)) * (1 - CHART.uChart.value);
    // strung lines are not a thing a chart shows, and the pen would ink them as spokes
    bunting.visible = CHART.uChart.value < 0.5;
  };
  group.userData.tick(0, { x: 0, z: 0 });

  root.add(group);
  return group;
}
