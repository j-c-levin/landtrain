import * as THREE from 'three';
import {
  CAR_LEN, CAR_CENTERS, LADDERS, TRAIN_HALF, WORLD, TUNING,
  effMult, treadMult, clamp, lerp, damp,
} from './constants.js';
import { blockedAt, softDiscTexture } from './world.js';

// Height of the map-view route overlay (line, dots, train ring). It MUST equal
// the y of the plane that map clicks raycast against (main.js groundPlane = 0),
// or the tilted map camera projects the markers off the cursor as parallax.
const ROUTE_Y = 0;

const TRAIN_COLOR = {
  hull: 0xb5573c,
  hullDark: 0x96452f,
  cream: 0xf2e3c6,
  innerWall: 0xe9d3ac,
  wood: 0x9a6b4f,
  woodDark: 0x7c5238,
  iron: 0x4a3f3a,
  brass: 0xc9913e,
  sage: 0x8a9a6b,
};

function createTrainMaterials() {
  return {
    hull: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.hull, roughness: 0.75 }),
    hullDark: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.hullDark, roughness: 0.8 }),
    cream: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.cream, roughness: 0.85 }),
    innerWall: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.innerWall, roughness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.wood, roughness: 0.9 }),
    woodDark: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.woodDark, roughness: 0.9 }),
    iron: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.iron, roughness: 0.6, metalness: 0.35 }),
    brass: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.brass, roughness: 0.4, metalness: 0.6 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb35c, emissiveIntensity: 1.6, roughness: 0.5 }),
    headlamp: new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffc868, emissiveIntensity: 2.4 }),
    wheel: new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.55, metalness: 0.4 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 0.9 }),
    pillow: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.brass, roughness: 0.95 }),
    sage: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.sage, roughness: 0.95 }),
    engine: new THREE.MeshStandardMaterial({ color: 0x6e5e54, roughness: 0.7, metalness: 0.3 }),
    firebox: new THREE.MeshStandardMaterial({ color: 0x6b2f1a, emissive: 0xff6a2a, emissiveIntensity: 1.2, roughness: 0.6 }),
    upholstery: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.hull, roughness: 0.95 }),
    book: new THREE.MeshStandardMaterial({ color: 0x5c7aa8, roughness: 0.8 }),
    sootGrime: new THREE.MeshStandardMaterial({ color: 0x5a4035, roughness: 0.98 }),
  };
}

function createTrainGeometry() {
  const wheel = new THREE.CylinderGeometry(0.78, 0.78, 0.32, 14);
  wheel.rotateX(Math.PI / 2);
  const wheelHub = new THREE.CylinderGeometry(0.18, 0.18, 0.42, 8);
  wheelHub.rotateX(Math.PI / 2);
  return {
    wheel,
    wheelHub,
    leaf: new THREE.SphereGeometry(0.22, 6, 5),
  };
}

function box(w, h, d, mat, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (shadow) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  parent.add(m);
  return m;
}

function profiledBox(length, height, depth, chamfer, mat, x, y, z, parent) {
  const shape = new THREE.Shape();
  const hx = depth / 2;
  const hy = height / 2;
  shape.moveTo(-hx + chamfer, -hy);
  shape.lineTo(hx - chamfer, -hy);
  shape.lineTo(hx, -hy + chamfer);
  shape.lineTo(hx, hy - chamfer);
  shape.lineTo(hx - chamfer, hy);
  shape.lineTo(-hx + chamfer, hy);
  shape.lineTo(-hx, hy - chamfer);
  shape.lineTo(-hx, -hy + chamfer);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, steps: 1, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  geometry.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function hippedRoof(length, width, rise, shoulder, mat, x, y, z, parent) {
  const shape = new THREE.Shape();
  const half = width / 2;
  shape.moveTo(-half, 0);
  shape.lineTo(-half + shoulder, rise);
  shape.lineTo(half - shoulder, rise);
  shape.lineTo(half, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, steps: 1, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  geometry.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function instancedDetails(items, geometry, material, parent, shadow = false) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  for (let i = 0; i < items.length; i++) {
    const [x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0] = items[i];
    rotation.setFromEuler(euler.set(rx, ry, rz));
    matrix.compose(position.set(x, y, z), rotation, scale.set(sx, sy, sz));
    mesh.setMatrixAt(i, matrix);
  }
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  parent.add(mesh);
  return mesh;
}

class Plant {
  constructor(parent, materials, geometry, x, z, scale = 1) {
    this.group = new THREE.Group();
    this.group.position.set(x, 1.78, z);
    this.group.scale.setScalar(scale);

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.42, 8), materials.woodDark);
    pot.position.y = 0.21;
    pot.castShadow = true;
    this.group.add(pot);

    this.leafMat = materials.foliage;
    this.foliage = new THREE.Group();
    this.foliage.position.y = 0.42;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leaf = new THREE.Mesh(geometry.leaf, this.leafMat);
      leaf.scale.set(0.55, 1.6, 0.55);
      leaf.position.set(Math.cos(a) * 0.16, 0.32, Math.sin(a) * 0.16);
      leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      this.foliage.add(leaf);
    }
    this.group.add(this.foliage);
    parent.add(this.group);
  }

  setHappiness(h01) {
    const droop = 1 - h01;
    this.foliage.scale.y = lerp(1, 0.62, droop);
    this.foliage.rotation.z = droop * 0.35;
    this.leafMat.color.setHSL(lerp(0.28, 0.16, droop), lerp(0.42, 0.28, droop), lerp(0.42, 0.36, droop));
  }
}

// Records the lead tractor point's travelled polyline. Each car samples it
// at its own arc-length offset, so a car turns exactly where the car ahead
// of it turned — and never just pivots on a point.
class TrailPath {
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

  // Sample position + heading at arc length s (clamped). The heading is
  // interpolated shortest-arc between the bracketing vertices' tangents —
  // a piecewise-constant tangent would make every car (and the camera)
  // snap as its sample crosses a segment boundary.
  frame(s) {
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
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      theta: thA + dTh * t,
    };
  }
}

// Arc-length offsets of each car centre behind the lead tractor point.
const CAR_OFFSETS = CAR_CENTERS.map((c) => TRAIN_HALF - c); // [8, 24.6, 41.2]

export class Train {
  constructor(scene) {
    this.scene = scene;
    this.materials = createTrainMaterials();
    this.geometry = createTrainGeometry();

    // --- state ---------------------------------------------------------
    this.heading = 0;
    this.speed = 0;
    this.paused = false;
    this.blocked = false;
    this.route = [];
    this.distanceTraveled = 0;
    this.eff = 88;
    this.wear = 8;
    this.plants = 95;
    this.onEvent = null;

    this.headPos = new THREE.Vector3(TRAIN_HALF, 0, 0);
    this.path = new TrailPath();
    this.path.seed(this.headPos.x, this.headPos.z, this.heading, 100);
    this._pos = new THREE.Vector3();

    this.wheels = [];
    this.zoneMats = {}; // see-through walls, one fading material per zone
    this.fadeMats = [];

    this.cars = [];
    for (let i = 0; i < CAR_CENTERS.length; i++) {
      const group = new THREE.Group();
      group.rotation.order = 'YXZ';
      scene.add(group);
      this.cars.push({ group, offset: CAR_OFFSETS[i] });
    }
    this.#buildCar(0);
    this.#buildCar(1);
    this.#buildCar(2);
    this.#buildRouteDisplay();
    this.#buildSmoke();
    this.#placeCars();
  }

  // Drop the whole train at a fresh spawn (new biome) facing `heading`,
  // exactly as a newly-constructed train would sit. Reseeds the trail, clears
  // the route, and resets gauges to fresh-journey values.
  reset({ x, z, heading }) {
    this.heading = heading;
    this.speed = 0;
    this.paused = false;
    this.blocked = false;
    this.clearRoute();
    this.distanceTraveled = 0;
    this.eff = 88;
    this.wear = 8;
    this.plants = 95;

    this.headPos.set(x, 0, z);
    this.path.seed(this.headPos.x, this.headPos.z, this.heading, 100);
    this.#placeCars();
  }

  #nearWallMat(zone) {
    if (!this.zoneMats[zone]) {
      this.zoneMats[zone] = new THREE.MeshStandardMaterial({
        color: TRAIN_COLOR.innerWall, roughness: 0.95, transparent: true, opacity: 1,
      });
    }
    return this.zoneMats[zone];
  }

  #fadingMat(zone, source) {
    const mat = source.clone();
    mat.transparent = true;
    mat.opacity = 1;
    this.fadeMats.push({ zone, mat });
    return mat;
  }

  // Build the near-side wall (camera side) with the same window rhythm as
  // the far wall. It fades out for the car the player occupies.
  #nearWall(g, zone, z = 2.36) {
    const mat = this.#nearWallMat(zone);
    const pieces = [
      [CAR_LEN - 0.3, 0.92, 0, 2.24],
      [CAR_LEN - 0.3, 0.8, 0, 4.3],
      [2.0, 1.2, -5.85, 3.3],
      [2.0, 1.2, -1.95, 3.3],
      [2.0, 1.2, 1.95, 3.3],
      [2.0, 1.2, 5.85, 3.3],
    ];
    for (const [w, h, x, y] of pieces) {
      box(w, h, 0.24, mat, x, y, z, g, false);
    }
  }

  #buildCar(ci) {
    const g = this.cars[ci].group;
    const M = this.materials;
    const isCab = ci === 0;
    const isEngine = ci === 1;
    const zone = 'car' + ci;

    // under-frame rails + deck + roof
    box(CAR_LEN + 2, 0.22, 0.5, M.iron, 0, 1.36, -1.6, g);
    box(CAR_LEN + 2, 0.22, 0.5, M.iron, 0, 1.36, 1.6, g);
    box(CAR_LEN, 0.3, 5, M.wood, 0, 1.62, 0, g);
    if (ci === 2) hippedRoof(CAR_LEN + 0.8, 5.7, 0.34, 1.15, M.cream, 0, 4.68, 0, g);
    else if (ci === 1) hippedRoof(CAR_LEN + 0.7, 5.55, 0.3, 0.75, M.hullDark, 0, 4.72, 0, g);
    else box(CAR_LEN + 0.5, 0.3, 5.3, M.hullDark, 0, 4.86, 0, g);

    // far wall with window openings
    box(CAR_LEN - 0.3, 0.92, 0.28, M.innerWall, 0, 2.24, -2.36, g);
    box(CAR_LEN - 0.3, 0.8, 0.28, M.innerWall, 0, 4.3, -2.36, g);
    for (const mx of [-5.85, -1.95, 1.95, 5.85]) {
      box(2.0, 1.2, 0.28, M.innerWall, mx, 3.3, -2.36, g);
    }
    // near wall — the see-through side
    this.#nearWall(g, zone);

    // hull skirt below deck
    if (ci === 2) profiledBox(CAR_LEN, 0.55, 4.6, 0.16, M.hull, 0, 1.2, 0, g);
    else box(CAR_LEN, 0.55, 4.6, M.hull, 0, 1.2, 0, g);

    // end walls with a doorway on the near side
    for (const side of [-1, 1]) {
      const ex = side * (CAR_LEN / 2 - 0.12);
      box(0.24, 1.05, 4.9, M.hull, ex, 4.18, 0, g);
      box(0.24, 1.95, 2.5, M.hull, ex, 2.72, -1.2, g);
    }

    // dark wood window sills, both sides
    for (let wi = -1; wi <= 1; wi++) {
      box(2.0, 0.07, 0.34, M.woodDark, wi * 3.9, 2.72, -2.36, g, false);
      box(2.0, 0.07, 0.34, M.woodDark, wi * 3.9, 2.72, 2.36, g, false);
    }

    // wheels: two bogies of two, both sides
    for (const bx of [-4.3, 4.3]) {
      for (const wx of [-1.1, 1.1]) {
        for (const wz of [-1.95, 1.95]) {
          const wheel = new THREE.Mesh(this.geometry.wheel, M.wheel);
          wheel.position.set(bx + wx, 0.78, wz);
          wheel.castShadow = true;
          g.add(wheel);
          this.wheels.push(wheel);
          const hub = new THREE.Mesh(this.geometry.wheelHub, M.iron);
          hub.position.copy(wheel.position);
          g.add(hub);
        }
      }
    }

    // roof railing along the far edge (front car: only up to the cab)
    const railSpan = isCab ? [-7.2, -4.4] : [-7, 7];
    const railLen = railSpan[1] - railSpan[0];
    box(railLen, 0.11, 0.11, M.iron, (railSpan[0] + railSpan[1]) / 2, 5.6, -2.45, g, false);
    for (let x = railSpan[0] + 0.4; x < railSpan[1]; x += 3) {
      box(0.11, 0.6, 0.11, M.iron, x, 5.3, -2.45, g, false);
    }

    if (isCab) this.#buildFrontCar(g);
    if (isEngine) this.#buildEngine(g);
    if (ci === 2) this.#buildLiving(g);
    this.#buildExteriorDetails(g, ci);

    // ladders attached to whichever car owns that column
    for (const l of LADDERS) {
      const rel = l.x - CAR_CENTERS[ci];
      if (Math.abs(rel) > CAR_LEN / 2 + 1.5) continue;
      const tall = l.levels.includes('roof');
      const ladder = new THREE.Group();
      const h = tall ? 5.3 : 2.6;
      for (const rz of [0.62, 1.18]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.13, h, 0.13), M.iron);
        rail.position.set(0, h / 2, rz);
        ladder.add(rail);
      }
      for (let y = 0.45; y < h - 0.1; y += 0.48) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.62), M.iron);
        rung.position.set(0, y, 0.9);
        ladder.add(rung);
      }
      ladder.position.set(rel, 0, 0.95);
      g.add(ladder);
    }

    // gap walkway plank + coupler off the inward end
    const gapRel = ci === 0 ? -8.3 : ci === 2 ? 8.3 : null;
    if (gapRel !== null) {
      box(3.0, 0.22, 1.8, M.woodDark, gapRel, 1.56, 0.3, g);
      box(2.2, 0.4, 0.4, M.iron, gapRel, 1.1, 0, g);
    }

    // end balcony + railing on the outward end
    if (ci === 0 || ci === 2) {
      const bx = ci === 0 ? CAR_LEN / 2 + 0.4 : -CAR_LEN / 2 - 0.4;
      box(2.2, 0.22, 4.2, M.woodDark, bx, 1.56, 0, g);
      box(2.2, 0.12, 0.12, M.iron, bx, 2.6, 2.0, g, false);
      box(0.12, 1.0, 0.12, M.iron, bx - 1, 2.1, 2.0, g, false);
      box(0.12, 1.0, 0.12, M.iron, bx + 1, 2.1, 2.0, g, false);
    }
  }

  // Front car: cargo vestibule at deck level, raised driver's cab perched
  // on the rooftop — its floor IS the roof storey, walked straight into.
  #buildFrontCar(g) {
    const M = this.materials;
    // nose + headlamp
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.45, 1.9, 10), M.hullDark);
    nose.rotation.z = Math.PI / 2;
    nose.position.set(CAR_LEN / 2 + 1.8, 2.5, 0);
    nose.castShadow = true;
    g.add(nose);
    const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.68, 0.62, 10), M.iron);
    lampHousing.rotation.z = Math.PI / 2;
    lampHousing.position.set(CAR_LEN / 2 + 2.75, 2.5, 0);
    lampHousing.castShadow = true;
    g.add(lampHousing);
    const headlamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), M.headlamp);
    headlamp.position.set(CAR_LEN / 2 + 3.08, 2.5, 0);
    g.add(headlamp);

    const pilot = new THREE.Mesh(new THREE.ConeGeometry(1.45, 2.2, 4), M.iron);
    pilot.rotation.z = -Math.PI / 2;
    pilot.scale.z = 0.7;
    pilot.position.set(CAR_LEN / 2 + 1.7, 1.55, 0);
    pilot.castShadow = true;
    g.add(pilot);
    box(0.32, 0.5, 4.6, M.iron, CAR_LEN / 2 + 0.85, 1.22, 0, g);

    // deck-level quarters beneath the cab: a bunk to rest in, plus stores
    box(3.0, 0.5, 1.6, M.woodDark, 3.5, 2.05, -1.4, g); // bunk frame
    box(2.8, 0.25, 1.4, M.cream, 3.5, 2.42, -1.4, g); // mattress
    box(0.7, 0.2, 1.1, M.pillow, 4.5, 2.62, -1.4, g, false); // pillow
    box(1.9, 0.12, 1.2, M.sage, 2.9, 2.56, -1.35, g, false); // blanket
    box(0.9, 0.9, 0.9, M.woodDark, -3.4, 2.25, -1.6, g);
    box(0.85, 0.85, 0.85, M.wood, -4.4, 2.22, -1.3, g);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 10), M.wood);
    barrel.position.set(-1.8, 2.3, -1.7);
    barrel.castShadow = true;
    g.add(barrel);
    // a small warm lamp by the bunk
    const bunkBulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), M.glow);
    bunkBulb.position.set(5.4, 3.4, -1.9);
    g.add(bunkBulb);
    const bunkLight = new THREE.PointLight(0xffb066, 16, 12, 2);
    bunkLight.position.set(5.0, 3.3, -1.2);
    g.add(bunkLight);

    // --- the raised cab: local x -4.0 .. +7.0, floor y 5.05 ------------
    const lintel = -4.0;
    // far wall: bands + mullions around two windows
    box(11, 0.9, 0.24, M.innerWall, 1.5, 5.5, -2.25, g);
    box(11, 0.55, 0.24, M.innerWall, 1.5, 7.27, -2.25, g);
    for (const [mx, mw] of [[-3.1, 1.8], [0.7, 1.8], [5.3, 3.4]]) {
      box(mw, 1.05, 0.24, M.innerWall, mx, 6.48, -2.25, g);
    }
    // near wall — its own fade zone
    const cabMat = this.#nearWallMat('cab');
    box(11, 0.9, 0.24, cabMat, 1.5, 5.5, 2.25, g, false);
    box(11, 0.55, 0.24, cabMat, 1.5, 7.27, 2.25, g, false);
    for (const [mx, mw] of [[-3.1, 1.8], [0.7, 1.8], [5.3, 3.4]]) {
      box(mw, 1.05, 0.24, cabMat, mx, 6.48, 2.25, g, false);
    }
    // front wall with the big forward window — an open aperture like every
    // other window on the train; corner posts frame it and the cab light
    // glows through it at night
    box(0.24, 0.85, 4.9, M.hull, 7.0, 5.47, 0, g);
    box(0.24, 1.2, 0.4, M.hull, 7.0, 6.5, -2.25, g, false);
    box(0.24, 1.2, 0.4, M.hull, 7.0, 6.5, 2.25, g, false);
    box(0.24, 0.45, 4.9, M.hull, 7.0, 7.32, 0, g);
    // rear lintel over the open doorway from the rooftop walk
    box(0.24, 0.35, 4.9, M.hull, lintel, 7.32, 0, g);
    // cab canopy
    hippedRoof(12.4, 5.8, 0.65, 1.35, M.hullDark, 1.65, 7.48, 0, g);
    box(0.18, 0.42, 5.55, M.cream, 7.55, 7.5, 0, g, false);

    // console up in the cab
    box(1.8, 1.0, 1.8, M.woodDark, 4.4, 5.55, -1.2, g);
    const wheelMesh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 18), M.brass);
    wheelMesh.position.set(3.6, 6.35, -1.2);
    wheelMesh.rotation.y = Math.PI / 2;
    g.add(wheelMesh);
    for (let i = 0; i < 3; i++) {
      const lever = box(0.07, 0.6, 0.07, M.iron, 4.0 + i * 0.4, 6.3, -0.4, g, false);
      lever.rotation.x = -0.3 + i * 0.3;
    }

    const light = new THREE.PointLight(0xffc985, 22, 16, 2);
    light.position.set(2.5, 7.1, 0);
    g.add(light);
    this.cabLight = light;
  }

  #buildEngine(g) {
    const M = this.materials;
    box(4.6, 2.3, 2.6, M.engine, 0.6, 2.95, -0.8, g);
    box(4.0, 0.25, 2.2, M.iron, 0.6, 4.2, -0.8, g, false);
    this.fireboxMat = M.firebox;
    const firebox = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 0.15), this.fireboxMat);
    firebox.position.set(0.6, 2.7, 0.56);
    g.add(firebox);
    for (let i = 0; i < 3; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 8), M.iron);
      pipe.position.set(-1.6 + i * 0.5, 3.4, -1.6);
      g.add(pipe);
    }
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 16), M.cream);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(-2.4, 3.5, -2.15);
    g.add(dial);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.78, 2.35, 10), M.hullDark);
    stack.position.set(1.4, 6.05, -1.3);
    stack.castShadow = true;
    g.add(stack);
    const sootCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.58, 0.42, 10), M.sootGrime);
    sootCollar.position.set(1.4, 7.23, -1.3);
    g.add(sootCollar);
    this.stackLocal = new THREE.Vector3(1.4, 7.48, -1.3);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), M.engine);
    dome.position.set(-2.4, 5.03, -0.75);
    dome.castShadow = true;
    g.add(dome);

    const flywheels = [[1.0, 3.0, -2.61], [1.0, 3.0, 2.61]];
    instancedDetails(flywheels, new THREE.TorusGeometry(1.02, 0.18, 8, 18), M.iron, g, true);
    instancedDetails(flywheels, this.geometry.wheelHub, M.brass, g);

    const vents = [];
    for (const z of [-2.54, 2.54]) {
      for (let x = -5.4; x <= -3.0; x += 0.6) vents.push([x, 3.5, z, 0.36, 0.12, 1]);
    }
    instancedDetails(vents, new THREE.BoxGeometry(1, 1, 0.12), M.iron, g);

    this.fireLight = new THREE.PointLight(0xff7a30, 26, 14, 2);
    this.fireLight.position.set(0.6, 2.9, 0.8);
    g.add(this.fireLight);
  }

  #buildLiving(g) {
    const M = this.materials;
    const chair = new THREE.Group();
    chair.position.set(-3.6, 1.78, -0.7);
    const seatMat = M.upholstery;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), seatMat);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 0.4), seatMat);
    back.position.set(0, 1.0, -0.6);
    const armGeo = new THREE.BoxGeometry(0.28, 0.5, 1.3);
    const armL = new THREE.Mesh(armGeo, seatMat);
    armL.position.set(-0.62, 0.85, 0);
    const armR = armL.clone();
    armR.position.x = 0.62;
    chair.add(seat, back, armL, armR);
    chair.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(chair);
    this.chairX = CAR_CENTERS[2] - 3.6;

    box(0.7, 0.75, 0.7, M.wood, -2.2, 2.15, -0.8, g);
    const book = box(0.5, 0.1, 0.36, M.book, -2.2, 2.58, -0.8, g, false);
    book.rotation.y = 0.4;

    box(2.6, 0.5, 1.6, M.woodDark, -5.4, 2.05, -1.4, g);
    box(2.4, 0.25, 1.4, M.cream, -5.4, 2.42, -1.4, g);

    box(3.2, 0.12, 0.6, M.wood, 2.5, 3.6, -2.0, g);
    for (let i = 0; i < 5; i++) {
      const bcol = new THREE.Color().setHSL(0.02 + i * 0.09, 0.5, 0.5);
      box(0.22, 0.55, 0.4, new THREE.MeshStandardMaterial({ color: bcol, roughness: 0.9 }), 1.4 + i * 0.45, 3.95, -2.0, g, false);
    }

    this.plantPots = [
      new Plant(g, M, this.geometry, 4.2, -1.7, 1.1),
      new Plant(g, M, this.geometry, 5.0, -1.5, 0.85),
      new Plant(g, M, this.geometry, 3.4, -1.5, 0.9),
    ];

    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.4, 10), M.brass);
    lampShade.position.set(-1, 4.45, -0.5);
    g.add(lampShade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M.glow);
    bulb.position.set(-1, 4.28, -0.5);
    g.add(bulb);
    const light = new THREE.PointLight(0xffb066, 28, 17, 2);
    light.position.set(-1, 4.0, -0.3);
    g.add(light);

    const awningGeometry = new THREE.BoxGeometry(1, 1, 1);
    instancedDetails([[1.6, 4.52, -2.78, 7.6, 0.16, 1.05, 0.16]], awningGeometry, M.sage, g);
    instancedDetails([[1.6, 4.52, 2.78, 7.6, 0.16, 1.05, -0.16]], awningGeometry, this.#fadingMat('car2', M.sage), g);

    const farPlanters = [];
    const nearPlanters = [];
    const farLeaves = [];
    const nearLeaves = [];
    for (const z of [-2.58, 2.58]) {
      const planters = z < 0 ? farPlanters : nearPlanters;
      const leaves = z < 0 ? farLeaves : nearLeaves;
      for (const x of [0, 3.9]) {
        planters.push([x, 2.67, z, 2.15, 0.32, 0.42]);
        for (let i = -2; i <= 2; i++) leaves.push([x + i * 0.37, 2.98 + (i % 2) * 0.08, z, 0.65, 0.7, 0.65]);
      }
    }
    const planterGeometry = new THREE.BoxGeometry(1, 1, 1);
    instancedDetails(farPlanters, planterGeometry, M.woodDark, g);
    instancedDetails(nearPlanters, planterGeometry, this.#fadingMat('car2', M.woodDark), g);
    instancedDetails(farLeaves, this.geometry.leaf, M.foliage, g);
    instancedDetails(nearLeaves, this.geometry.leaf, this.#fadingMat('car2', M.foliage), g);

    box(2.4, 0.78, 1.45, M.wood, -2.1, 5.43, -1.25, g);
    box(0.14, 0.82, 1.52, M.brass, -2.1, 5.45, -1.25, g, false);
    const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.0, 10), M.sage);
    bedroll.rotation.z = Math.PI / 2;
    bedroll.position.set(1.0, 5.43, -1.35);
    bedroll.castShadow = true;
    g.add(bedroll);
  }

  #buildExteriorDetails(g, ci) {
    const M = this.materials;
    const farStructure = [
      [0, 2.7, -2.54, CAR_LEN - 0.35, 0.12, 0.12],
    ];
    const nearStructure = [[0, 2.7, 2.54, CAR_LEN - 0.35, 0.12, 0.12]];
    const ribs = ci === 2 ? [-5.85, -1.95, 1.95, 5.85] : ci === 1 ? [-5.85, 5.85] : [-5.85];
    for (const z of [-2.54, 2.54]) {
      const structure = z < 0 ? farStructure : nearStructure;
      for (const x of ribs) structure.push([x, 3.3, z, 0.22, 2.3, 0.12]);
      structure.push([-7.72, 1.22, z, 0.38, 0.5, 0.12], [7.72, 1.22, z, 0.38, 0.5, 0.12]);
    }
    const structureGeometry = new THREE.BoxGeometry(1, 1, 1);
    instancedDetails(farStructure, structureGeometry, M.hullDark, g);
    instancedDetails(nearStructure, structureGeometry, this.#fadingMat('car' + ci, M.hullDark), g);

    const runningGear = [];
    for (const z of [-2.15, 2.15]) {
      for (const x of [-4.3, 4.3]) {
        runningGear.push([x, 1.13, z, 3.15, 0.38, 0.34]);
        for (const sx of [-0.75, 0, 0.75]) runningGear.push([x + sx, 1.42, z, 0.42, 0.24, 0.28]);
      }
    }
    instancedDetails(runningGear, new THREE.BoxGeometry(1, 1, 1), M.iron, g);

    if (ci !== 0) {
      const farRivets = [];
      const nearRivets = [];
      for (const z of [-2.64, 2.64]) {
        const rivets = z < 0 ? farRivets : nearRivets;
        for (const x of ci === 2 ? [-5.85, 5.85] : [-5.85]) {
          rivets.push([x, 3.0, z], [x, 3.6, z]);
        }
      }
      const rivetGeometry = new THREE.SphereGeometry(0.15, 8, 6);
      instancedDetails(farRivets, rivetGeometry, M.iron, g);
      instancedDetails(nearRivets, rivetGeometry, this.#fadingMat('car' + ci, M.iron), g);
    }

    for (const gapX of ci === 0 ? [-8.55] : ci === 2 ? [8.55] : []) {
      instancedDetails([
        [gapX, 1.05, -0.62, 1, 1, 1, 0, Math.PI / 2],
        [gapX, 1.05, 0.62, 1, 1, 1, 0, Math.PI / 2],
      ], new THREE.TorusGeometry(0.4, 0.08, 6, 12, Math.PI), M.iron, g);
    }

    box(CAR_LEN - 1.0, 0.18, 0.08, M.sootGrime, 0, 1.01, -2.34, g, false);
  }

  // ---------------------------------------------------- route display (map)
  #buildRouteDisplay() {
    this.routeGroup = new THREE.Group();
    this.scene.add(this.routeGroup);

    const lineGeo = new THREE.BufferGeometry();
    this.linePositions = new Float32Array(64 * 3);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.routeLine = new THREE.Line(
      lineGeo,
      new THREE.LineDashedMaterial({
        color: 0xf7ead2, dashSize: 7, gapSize: 5, transparent: true, opacity: 0.9, depthTest: false, fog: false,
      })
    );
    this.routeLine.renderOrder = 59;
    this.routeLine.frustumCulled = false;
    this.routeGroup.add(this.routeLine);

    this.dotGeo = new THREE.CircleGeometry(4, 16);
    this.dotMat = new THREE.MeshBasicMaterial({ color: 0xecd9a0, transparent: true, depthTest: false, fog: false });
    this.dots = [];

    this.trainRing = new THREE.Mesh(
      new THREE.RingGeometry(10, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0xf7ead2, transparent: true, depthTest: false, fog: false, side: THREE.DoubleSide })
    );
    this.trainRing.rotation.x = -Math.PI / 2;
    this.trainRing.renderOrder = 60;
    this.routeGroup.add(this.trainRing);

    this.beacon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softDiscTexture('rgba(255,205,120,0.95)', 'rgba(255,205,120,0)'),
        transparent: true, depthTest: false, fog: false,
      })
    );
    this.beacon.renderOrder = 61;
    this.beacon.scale.setScalar(55);
    this.routeGroup.add(this.beacon);
    this.beaconPos = new THREE.Vector3(2450, 80, 0);
  }

  #buildSmoke() {
    const tex = softDiscTexture('rgba(245,238,228,0.65)', 'rgba(245,238,228,0)');
    this.smoke = [];
    for (let i = 0; i < 36; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      this.scene.add(s);
      this.smoke.push({ sprite: s, life: 0, max: 2.4 });
    }
    this.smokeTimer = 0;
  }

  // ----------------------------------------------------------- route edits
  addWaypoint(x, z) {
    x = clamp(x, WORLD.minX + 40, WORLD.maxX - 40);
    z = clamp(z, WORLD.minZ + 40, WORLD.maxZ - 40);
    if (this.route.length >= 60) return false;
    this.route.push(new THREE.Vector2(x, z));
    this.blocked = false;
    return true;
  }

  undoWaypoint() {
    this.route.pop();
    this.blocked = false;
  }

  clearRoute() {
    this.route.length = 0;
    this.blocked = false;
  }

  get pos() {
    return this._pos;
  }

  forwardDir(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  // World-space frame (position on the ground + heading) for a point at
  // train-local X. The player and camera both ride the trail through this.
  frameAt(localX) {
    return this.path.frame(this.path.head - (TRAIN_HALF - localX));
  }

  // --------------------------------------------------------------- update
  update(dt, time, obstacles) {
    const p = this.headPos;

    const moving = !this.paused && !this.blocked && this.route.length > 0;
    const targetSpeed = moving ? TUNING.baseSpeed * effMult(this.eff) * treadMult(this.wear) : 0;
    this.speed = damp(this.speed, targetSpeed, TUNING.accel, dt);
    if (this.speed < 0.02 && targetSpeed === 0) this.speed = 0;

    if (moving) {
      const wp = this.route[0];
      const dx = wp.x - p.x;
      const dz = wp.y - p.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(-dz, dx);

      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      // slow for sharp course changes (and gate the bump check below)
      const align = clamp(1.3 - Math.abs(diff), 0.45, 1);
      const step = this.speed * dt * align;

      // curvature-limited steering: turn amount is tied to distance
      // travelled, so the recorded trail is everywhere a gentle arc
      const maxTurn = step * TUNING.curvature;
      this.heading += clamp(diff, -maxTurn, maxTurn);

      const dir = this.forwardDir();
      p.x += dir.x * step;
      p.z += dir.z * step;
      this.path.advance(p.x, p.z, step);

      this.distanceTraveled += step;
      this.wear = clamp(this.wear + step * TUNING.wearPerUnit, 0, TUNING.wearCeil);
      this.eff = clamp(this.eff - TUNING.effDriftPerSec * dt, TUNING.effFloor, 100);

      if (dist < TUNING.waypointRadius) {
        this.route.shift();
        if (this.route.length === 0 && this.onEvent) this.onEvent('route-finished');
      }

      // bump detection: a point ahead of the nose, only while truly driving
      if (align > 0.6) {
        const lx = p.x + dir.x * TUNING.lookahead;
        const lz = p.z + dir.z * TUNING.lookahead;
        if (blockedAt(obstacles, lx, lz, TUNING.obstaclePad)) {
          this.blocked = true;
          this.speed = 0;
          if (this.onEvent) this.onEvent('blocked');
        }
      }
    }

    this.plants = clamp(this.plants - TUNING.plantDriftPerSec * dt, TUNING.plantFloor, 100);

    this.#placeCars();

    // -- visuals --
    const spin = (this.speed / 0.78) * dt;
    for (const w of this.wheels) w.rotation.z -= spin;

    const rust = this.wear / 100;
    this.materials.wheel.color.setRGB(
      lerp(0.29, 0.54, rust),
      lerp(0.27, 0.31, rust),
      lerp(0.25, 0.18, rust)
    );

    const eff01 = this.eff / 100;
    if (this.fireboxMat) {
      this.fireboxMat.emissiveIntensity = (0.35 + eff01 * 1.5) * (0.92 + 0.08 * Math.sin(time * 13) * Math.sin(time * 5.1));
    }
    if (this.fireLight) this.fireLight.intensity = 10 + eff01 * 22 + Math.sin(time * 11) * 2;

    const plant01 = (this.plants - TUNING.plantFloor) / (100 - TUNING.plantFloor);
    if (this.plantPots) for (const pl of this.plantPots) pl.setHappiness(plant01);

    this.#updateSmoke(dt);
  }

  // Each car rides the trail at its own offset. The unevenness is keyed to
  // distance s, so each car hits the same bumps as it passes over them and
  // everything stills when the train rests. Short wavelengths (1.7–7.6u)
  // read as ground rumble, not a boat's swell; one faint long roll remains.
  #placeCars() {
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const s = this.path.head - car.offset;
      const f = this.path.frame(s);
      const p = i * 2.39;
      const roll =
        (Math.sin(s * 1.9 + p) * 0.45 + Math.sin(s * 0.83 + p * 2.7) * 0.35 + Math.sin(s * 3.7 + p * 1.3) * 0.2) * 0.0075 +
        Math.sin(s * 0.21 + p) * 0.003;
      const pitch = (Math.sin(s * 2.6 + p * 1.9) * 0.6 + Math.sin(s * 1.21 + p) * 0.4) * 0.0055;
      const bob = (Math.sin(s * 2.3 + p) + Math.sin(s * 4.1 + p * 2.2) * 0.5) * 0.016;
      car.group.position.set(f.x, bob, f.z);
      car.group.rotation.set(roll, f.theta, pitch);
    }
    const mid = this.path.frame(this.path.head - CAR_OFFSETS[1]);
    this._pos.set(mid.x, 0, mid.z);
  }

  // See-through walls: the zone the player occupies fades out; in book
  // mode everything goes opaque so the train reads as a solid home.
  setFocus(zone, allOpaque, dt) {
    for (const key of Object.keys(this.zoneMats)) {
      const mat = this.zoneMats[key];
      const target = allOpaque ? 1 : key === zone ? 0.06 : 1;
      mat.opacity = damp(mat.opacity, target, 7, dt);
      mat.depthWrite = mat.opacity > 0.5;
    }
    for (const { zone: key, mat } of this.fadeMats) {
      const target = allOpaque ? 1 : key === zone ? 0.06 : 1;
      mat.opacity = damp(mat.opacity, target, 7, dt);
      mat.depthWrite = mat.opacity > 0.5;
    }
  }

  #updateSmoke(dt) {
    this.smokeTimer -= dt;
    const speed01 = this.speed / TUNING.baseSpeed;
    if (this.smokeTimer <= 0 && this.speed > 0.4) {
      this.smokeTimer = lerp(0.5, 0.13, speed01);
      const puff = this.smoke.find((s) => s.life <= 0);
      if (puff) {
        puff.life = puff.max;
        const wp = this.stackLocal.clone();
        this.cars[1].group.localToWorld(wp);
        puff.sprite.position.copy(wp);
        puff.sprite.visible = true;
      }
    }
    for (const s of this.smoke) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const t = 1 - s.life / s.max;
      s.sprite.position.y += dt * 2.4;
      s.sprite.scale.setScalar(lerp(1.4, 6.5, t));
      s.sprite.material.opacity = 0.5 * (1 - t);
      if (s.life <= 0) s.sprite.visible = false;
    }
  }

  // ------------------------------------------------- map overlay rendering
  updateRouteDisplay(mapBlend, time) {
    this.routeGroup.visible = mapBlend > 0.02;
    if (!this.routeGroup.visible) return;

    const p = this._pos;
    const pts = [[p.x, p.z], ...this.route.map((w) => [w.x, w.y])];
    for (let i = 0; i < pts.length && i < 64; i++) {
      this.linePositions[i * 3] = pts[i][0];
      // The overlay MUST sit on the same plane map clicks raycast to (the
      // y=0 ground plane in main.js). The map camera is a tilted perspective,
      // so any vertical gap projects as parallax — markers would drift away
      // from the cursor toward the screen edges. Keep this at ROUTE_Y = 0.
      this.linePositions[i * 3 + 1] = ROUTE_Y;
      this.linePositions[i * 3 + 2] = pts[i][1];
    }
    this.routeLine.geometry.setDrawRange(0, Math.min(pts.length, 64));
    this.routeLine.geometry.attributes.position.needsUpdate = true;
    this.routeLine.computeLineDistances();
    this.routeLine.material.opacity = 0.9 * mapBlend;

    while (this.dots.length < this.route.length) {
      const d = new THREE.Mesh(this.dotGeo, this.dotMat.clone());
      d.rotation.x = -Math.PI / 2;
      d.renderOrder = 60;
      this.routeGroup.add(d);
      this.dots.push(d);
    }
    for (let i = 0; i < this.dots.length; i++) {
      const visible = i < this.route.length;
      this.dots[i].visible = visible;
      if (visible) {
        this.dots[i].position.set(this.route[i].x, ROUTE_Y, this.route[i].y);
        this.dots[i].material.opacity = mapBlend * (i === this.route.length - 1 ? 1 : 0.7);
      }
    }

    const pulse = 1 + Math.sin(time * 2.4) * 0.12;
    this.trainRing.position.set(p.x, ROUTE_Y, p.z);
    this.trainRing.scale.setScalar(pulse);
    this.trainRing.material.opacity = mapBlend * 0.85;

    this.beacon.position.copy(this.beaconPos);
    this.beacon.scale.setScalar(55 * (1 + Math.sin(time * 1.7) * 0.1));
    this.beacon.material.opacity = mapBlend * 0.9;
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const instances = new Set();
    const roots = [...this.cars.map((car) => car.group), this.routeGroup, ...this.smoke.map((puff) => puff.sprite)];
    for (const root of roots) {
      root.traverse((obj) => {
        if (obj.isInstancedMesh) instances.add(obj);
        if (obj.geometry) geometries.add(obj.geometry);
        if (!obj.material) return;
        const owned = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of owned) {
          materials.add(material);
          for (const value of Object.values(material)) {
            if (value?.isTexture) textures.add(value);
          }
        }
      });
      this.scene.remove(root);
    }
    for (const instance of instances) instance.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
  }
}
