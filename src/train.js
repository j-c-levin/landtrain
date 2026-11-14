import * as THREE from 'three';
import {
  CAR_LEN, CAR_CENTERS, LADDERS, TRAIN_HALF, WORLD, TUNING,
  effMult, treadMult, clamp, lerp, damp,
} from './constants.js';
import { blockedAt, softDiscTexture } from './world.js';
import { buildLivingInterior, buildBunkInterior } from './train-home.js';
import { interiorKit, plantLeafGeometry } from './train-interior-kit.js';

// Height of the map-view route overlay (line, dots, train ring). It MUST equal
// the y of the plane that map clicks raycast against (main.js groundPlane = 0),
// or the tilted map camera projects the markers off the cursor as parallax.
const ROUTE_Y = 0;

const TRAIN_COLOR = {
  hull: 0xa9674e,
  hullDark: 0x70483c,
  cream: 0xf2e3c6,
  innerWall: 0xe9d3ac,
  wood: 0x9a6b4f,
  woodDark: 0x7c5238,
  iron: 0x293c3d,
  brass: 0xc9913e,
  sage: 0x81957b,
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
    engine: new THREE.MeshStandardMaterial({ color: 0x315d5b, roughness: 0.62, metalness: 0.35 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x98634c, roughness: 0.62, metalness: 0.45 }),
    roofGreen: new THREE.MeshStandardMaterial({ color: 0x405f52, roughness: 0.85, metalness: 0.12 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x477b79, roughness: 0.86 }),
    wine: new THREE.MeshStandardMaterial({ color: 0x824e55, roughness: 1, side: THREE.DoubleSide }),
    linen: new THREE.MeshStandardMaterial({ color: 0xe3cfae, roughness: 1, side: THREE.DoubleSide }),
    pages: new THREE.MeshStandardMaterial({ color: 0xf1ddb5, roughness: 1 }),
    instrument: new THREE.MeshStandardMaterial({ color: 0xf4e7c7, roughness: 0.7, emissive: 0xf7b96c, emissiveIntensity: 0.16 }),
    lampshade: new THREE.MeshStandardMaterial({ color: 0xe5c78c, roughness: 1, emissive: 0xffc879, emissiveIntensity: 0.32, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0xabcac5, transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.24, side: THREE.DoubleSide }),
    lightPool: new THREE.MeshBasicMaterial({ color: 0xffd6a1, transparent: true, opacity: 0.12, depthWrite: false }),
    firebox: new THREE.MeshStandardMaterial({ color: 0x6b2f1a, emissive: 0xff6a2a, emissiveIntensity: 1.2, roughness: 0.6 }),
    ember: new THREE.MeshStandardMaterial({ color: 0xffb04c, emissive: 0xffb33e, emissiveIntensity: 1.7, roughness: 1 }),
    upholstery: new THREE.MeshStandardMaterial({ color: TRAIN_COLOR.hull, roughness: 0.95 }),
    book: new THREE.MeshStandardMaterial({ color: 0x5c7aa8, roughness: 0.8 }),
    sootGrime: new THREE.MeshStandardMaterial({ color: 0x5a4035, roughness: 0.98 }),
  };
}

function createTrainGeometry() {
  const wheel = new THREE.CylinderGeometry(0.92, 0.92, 0.48, 18);
  wheel.rotateX(Math.PI / 2);
  const wheelHub = new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10);
  wheelHub.rotateX(Math.PI / 2);
  return {
    wheel,
    wheelHub,
    detail: new THREE.BoxGeometry(1, 1, 1),
    leaf: new THREE.SphereGeometry(0.22, 6, 5),
    plantLeaf: plantLeafGeometry(),
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

function curvedRoof(length, width, rise, mat, nearMat, x, crest, parent, coverCenter = true) {
  const shape = new THREE.Shape();
  const half = width / 2;
  const crown = 0.95;
  shape.moveTo(crown, 0);
  shape.quadraticCurveTo(half - 0.35, 0, half, -rise);
  shape.lineTo(half, -rise - 0.14);
  shape.quadraticCurveTo(half - 0.35, -0.14, crown, -0.14);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, steps: 1, curveSegments: 10, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  geometry.rotateY(Math.PI / 2);
  for (const near of [false, true]) {
    const mesh = new THREE.Mesh(geometry, near ? nearMat : mat);
    mesh.position.set(x, crest, 0);
    if (near) mesh.rotation.y = Math.PI;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
  if (coverCenter) box(length, 0.14, crown * 2, mat, x, crest - 0.07, 0, parent);
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
  constructor(parent, materials, geometry, x, y, z, scale, kind) {
    this.group = new THREE.Group();
    this.group.name = `plant-${kind}`;
    this.group.position.set(x, y, z);
    this.group.scale.setScalar(scale);
    parent.add(this.group);
    const k = interiorKit(this.group, `plant-pot-${kind}`);
    const potMat = [materials.hull, materials.cream, materials.teal][kind];
    k.mesh(new THREE.CylinderGeometry(0.34, 0.23, 0.43, 20), potMat, 0, 0.235, 0);
    k.ring(0.329, 0.034, potMat, 0, 0.452, 0).rotation.x = Math.PI / 2;
    k.round(0.38, 0.04, 0.38, potMat, 0, 0.022, 0);
    this.soilMat = new THREE.MeshStandardMaterial({ color: 0x765238, roughness: 1 });
    k.round(0.298, 0.026, 0.298, this.soilMat, 0, 0.443, 0);
    this.leafMat = materials.foliage.clone();
    this.leafMat.side = THREE.DoubleSide;
    this.leafMat.emissive.setHex(0x3b583c);
    this.leafMat.emissiveIntensity = 0.12;
    this.drySoil = new THREE.Color(0x765238);
    this.wetSoil = new THREE.Color(0x332d24);
    this.thirstyGreen = new THREE.Color(0x659050);
    this.wateredGreen = new THREE.Color(0x709d57);
    this.leaves = [];
    if (kind === 0) {
      for (let i = 0; i < 11; i++) this.leaves.push({ x: 0, y: 0.43, z: -0.025 * (i % 3),
        angle: -1.15 + i * 0.23, twist: (i % 3 - 1) * 0.5, w: 0.25, h: 0.89 + (i % 3) * 0.12 });
    } else if (kind === 1) {
      k.pipe([[0, 0.44, 0], [-0.05, 0.83, 0], [0.07, 1.37, -0.03]], 0.018, materials.woodDark);
      for (let i = 0; i < 7; i++) this.leaves.push({ x: i % 2 ? -0.04 : 0.04, y: 0.61 + i * 0.117,
        z: -0.06, angle: (i % 2 ? 1 : -1) * (0.65 + (i % 3) * 0.2), twist: (i % 3 - 1) * 0.3, w: 0.58, h: 0.66 });
    } else {
      for (let i = 0; i < 8; i++) this.leaves.push({ x: (i % 2 ? -1 : 1) * 0.12, y: 0.42 - Math.max(0, i - 4) * 0.14,
        z: i > 4 ? 0.2 : -0.03, angle: (i % 2 ? 1 : -1) * (0.45 + i * 0.23), twist: (i % 3 - 1) * 0.25, w: 0.5, h: 0.59 });
      for (const side of [-1, 1]) k.pipe([[0, 0.47, 0], [side * 0.24, 0.44, 0.14], [side * 0.29, -0.05, 0.2]], 0.015, materials.foliage);
    }
    this.leafMesh = new THREE.InstancedMesh(geometry.plantLeaf, this.leafMat, this.leaves.length);
    this.leafMesh.castShadow = true;
    this.leafMesh.receiveShadow = true;
    this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.leafMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.6);
    this.group.add(this.leafMesh);
    this.transform = new THREE.Object3D();
    k.finish();
    this.setHappiness(1);
  }

  setHappiness(h, time = 0, motion = 0) {
    const t = clamp(h, 0, 1);
    this.leafMat.color.lerpColors(this.thirstyGreen, this.wateredGreen, t);
    this.soilMat.color.lerpColors(this.drySoil, this.wetSoil, t);
    this.soilMat.roughness = lerp(1, 0.7, t);
    for (let i = 0; i < this.leaves.length; i++) {
      const leaf = this.leaves[i];
      this.transform.position.set(leaf.x, leaf.y, leaf.z);
      this.transform.scale.set(leaf.w, leaf.h * lerp(0.91, 1, t), 1);
      this.transform.rotation.set(0.07 * Math.sin(time * 0.65 + i) * motion, leaf.twist,
        leaf.angle + Math.sign(leaf.angle) * (1 - t) * 0.28 + Math.sin(time * 0.7 + i * 0.9) * 0.025 * motion);
      this.transform.updateMatrix();
      this.leafMesh.setMatrixAt(i, this.transform.matrix);
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;
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
    this.motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.previousPlants = this.plants;
    this.wateringPulse = 0;

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
    this.carVisuals = this.cars.flatMap(({ group }) => group.children);
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
    this.previousPlants = this.plants;
    this.wateringPulse = 0;
    this.path.seed(this.headPos.x, this.headPos.z, this.heading, 100);
    this.#placeCars();
  }

  #nearWallMat(zone, source = this.materials.innerWall) {
    if (!this.zoneMats[zone]) {
      this.zoneMats[zone] = source.clone();
      this.zoneMats[zone].transparent = true;
    }
    return this.zoneMats[zone];
  }

  #fadingMat(zone, source) {
    const existing = this.fadeMats.find((entry) => entry.zone === zone && entry.source === source);
    if (existing) return existing.mat;
    const mat = source.clone();
    mat.transparent = true;
    mat.opacity = 1;
    this.fadeMats.push({ zone, source, mat });
    return mat;
  }

  #cabinSides(g, zone, center, length, base, eave, wall, windows, z = 2.36) {
    const M = this.materials;
    const sill = base + 0.85;
    const lintel = Math.min(base + 2.29, eave - 0.38);
    for (const side of [-1, 1]) {
      const sz = side * z;
      const material = (source) => side > 0 ? this.#fadingMat(zone, source) : source;
      const panels = [
        [center, base + 0.425, sz, length, 0.85, 0.2],
        [center, (eave + lintel) / 2, sz, length, eave - lintel, 0.2],
      ];
      const frames = [];
      let edge = center - length / 2;
      for (const [wx, width] of windows) {
        const left = wx - width / 2;
        const right = wx + width / 2;
        panels.push([(edge + left) / 2, (sill + lintel) / 2, sz, left - edge, lintel - sill, 0.2]);
        for (const px of [left, right]) frames.push([px, (sill + lintel) / 2, sz + side * 0.09, 0.14, lintel - sill + 0.2, 0.3]);
        frames.push([wx, sill, sz + side * 0.14, width + 0.32, 0.14, 0.46]);
        frames.push([wx, lintel, sz + side * 0.09, width + 0.28, 0.13, 0.3]);
        frames.push([wx + width * 0.15, (sill + lintel) / 2, sz, 0.075, lintel - sill, 0.18]);
        edge = right;
      }
      const end = center + length / 2;
      panels.push([(edge + end) / 2, (sill + lintel) / 2, sz, end - edge, lintel - sill, 0.2]);
      instancedDetails(panels, this.geometry.detail, side > 0 ? this.#nearWallMat(zone, wall) : wall, g, true);
      frames.push([center, base + 0.16, sz + side * 0.12, length, 0.18, 0.2]);
      frames.push([center, eave, sz, length + 0.12, 0.16, 0.24]);
      instancedDetails(frames, this.geometry.detail, material(M.woodDark), g, true);
      const boards = [];
      for (let px = center - length / 2 + 0.45; px < end; px += 0.65) boards.push([px, base + 0.43, sz + side * 0.105, 0.018, 0.55, 0.015]);
      instancedDetails(boards, this.geometry.detail, material(M.wood), g);
    }
  }

  #buildCar(ci) {
    const g = this.cars[ci].group;
    const M = this.materials;
    const isCab = ci === 0;
    const isEngine = ci === 1;
    const zone = 'car' + ci;

    const chassis = [[0, 1.27, -1.65, CAR_LEN + 1.6, 0.34, 0.3], [0, 1.27, 1.65, CAR_LEN + 1.6, 0.34, 0.3]];
    for (const x of [-5.4, -3.2, 0, 3.2, 5.4]) chassis.push([x, 1.22, 0, 0.24, 0.28, 4.8]);
    instancedDetails(chassis, this.geometry.detail, M.iron, g, true);
    profiledBox(CAR_LEN + 0.2, 0.28, 4.9, 0.1, M.wood, 0, 1.64, 0, g);
    const decking = [];
    for (let x = -6.6; x < 7; x += 0.6) decking.push([x, 1.782, 0, 0.025, 0.008, 4.65]);
    instancedDetails(decking, this.geometry.detail, M.woodDark, g);

    if (!isEngine) {
      const eave = ci === 2 ? 4.75 : 4.67;
      this.#cabinSides(g, zone, isCab ? 0.625 : 0, isCab ? 15.05 : 13.8, 1.78, eave, ci === 2 ? M.sage : M.cream,
        ci === 2 ? [[-3.9, 2.5], [0, 2.8], [3.9, 2.5]] : [[-4.6, 2.4], [-0.8, 2.4], [3.7, 3.8]]);
      for (const x of [-6.9, isCab ? 8.15 : 6.9]) {
        box(0.22, eave - 1.78, 1.65, M.innerWall, x, (eave + 1.78) / 2, -1.5, g);
        box(0.22, eave - 1.78, 0.95, this.#fadingMat(zone, ci === 2 ? M.sage : M.cream), x, (eave + 1.78) / 2, 1.9, g);
        box(0.22, 0.35, 2.1, M.woodDark, x, eave - 0.175, 0.35, g);
      }
    }
    if (isCab) curvedRoof(15.6, 5.5, 0.6, M.copper, this.#fadingMat(zone, M.copper), 0.5, 5.05, g);

    // wheels: two bogies of two, both sides
    for (const bx of [-4.3, 4.3]) {
      for (const wx of [-1.1, 1.1]) {
        for (const wz of [-2.48, 2.48]) {
          const wheel = new THREE.Mesh(this.geometry.wheel, M.wheel);
          wheel.position.set(bx + wx, 0.92, wz);
          wheel.castShadow = true;
          g.add(wheel);
          this.wheels.push(wheel);
          const hub = new THREE.Mesh(this.geometry.wheelHub, M.iron);
          wheel.add(hub);
          const spokes = [];
          for (let a = 0; a < Math.PI; a += Math.PI / 3) spokes.push([0, 0, Math.sign(wz) * 0.25, 1.45, 0.1, 0.06, 0, 0, a]);
          instancedDetails(spokes, this.geometry.detail, M.woodDark, wheel);
        }
      }
    }

    if (isCab) this.#buildFrontCar(g);
    if (isEngine) this.#buildEngine(g);
    if (ci === 2) this.#buildLiving(g);
    this.#buildExteriorDetails(g, ci);

    const ladderParts = [];
    for (const l of LADDERS) {
      const rel = l.x - CAR_CENTERS[ci];
      if (Math.abs(rel) > CAR_LEN / 2 + 1.5) continue;
      const tall = l.levels.includes('roof');
      const h = tall ? 5.3 : 2.6;
      for (const rz of [0.62, 1.18]) {
        ladderParts.push([rel, h / 2, rz + 0.95, 0.13, h, 0.13]);
      }
      for (let y = 0.45; y < h - 0.1; y += 0.48) {
        ladderParts.push([rel, y, 1.85, 0.11, 0.11, 0.62]);
      }
    }
    if (ladderParts.length) instancedDetails(ladderParts, this.geometry.detail, M.iron, g, true);

    // gap walkway plank + coupler off the inward end
    const gapRel = ci === 0 ? -8.3 : ci === 2 ? 8.3 : null;
    if (gapRel !== null) {
      box(2.4, 0.22, 1.8, M.woodDark, gapRel, 1.67, 0.3, g);
      box(ci === 0 ? 1.8 : 1.7, 0.14, 1.9, M.iron, ci === 0 ? -8.2 : 8.25, 4.98, 0, g);
      box(2.2, 0.4, 0.4, M.iron, gapRel, 1.1, 0, g);
    }
  }

  // Front car: cargo vestibule at deck level, raised driver's cab perched
  // on the rooftop — its floor IS the roof storey, walked straight into.
  #buildFrontCar(g) {
    const M = this.materials;
    const bowShape = new THREE.Shape();
    bowShape.moveTo(8.2, 1.78);
    bowShape.lineTo(8.8, 2.05);
    bowShape.quadraticCurveTo(9.6, 2.8, 9.1, 4.0);
    bowShape.quadraticCurveTo(8.7, 4.9, 8.2, 5.02);
    bowShape.closePath();
    const bowGeo = new THREE.ExtrudeGeometry(bowShape, { depth: 4.05, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, steps: 1, curveSegments: 10 });
    bowGeo.translate(0, 0, -2.025);
    const bow = new THREE.Mesh(bowGeo, M.hull);
    bow.castShadow = true;
    bow.receiveShadow = true;
    g.add(bow);
    profiledBox(1.25, 0.24, 4.7, 0.1, M.wood, 7.5, 1.66, 0, g);
    profiledBox(0.38, 0.44, 4.8, 0.17, M.iron, 8.9, 1.45, 0, g);
    const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.61, 0.32, 16), M.iron);
    lampHousing.rotation.z = -Math.PI / 2;
    lampHousing.position.set(9.27, 3.75, 0);
    g.add(lampHousing);
    const headlamp = new THREE.Mesh(new THREE.SphereGeometry(0.39, 16, 10), M.headlamp);
    headlamp.scale.x = 0.35;
    headlamp.position.set(9.45, 3.75, 0);
    g.add(headlamp);
    const grille = [];
    for (let z = -1.5; z <= 1.5; z += 0.5) grille.push([9.22, 2.83, z, 0.09, 0.72, 0.12, 0, 0, 0.12]);
    instancedDetails(grille, this.geometry.detail, M.iron, g);

    buildBunkInterior(g, M);
    profiledBox(2.6, 1.05, 1.3, 0.12, M.wood, -3.7, 2.305, -1.55, g);
    instancedDetails([[-4.45, 2.43, -0.88, 0.5, 0.06, 0.06], [-3, 2.43, -0.88, 0.5, 0.06, 0.06]], this.geometry.detail, M.iron, g);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 1.15, 12), M.woodDark);
    barrel.position.set(-1.3, 2.355, -1.65);
    barrel.castShadow = true;
    g.add(barrel);

    box(12.0, 0.14, 1.275, M.wood, 2, 4.98, -1.5875, g);
    box(12.0, 0.14, 1.275, this.#fadingMat('car0', M.wood), 2, 4.98, 1.5875, g);
    this.#cabinSides(g, 'cab', 2.075, 12.15, 5.05, 7.61, M.cream, [[-1.65, 3.5], [4, 5.6]], 2.13);
    for (const side of [-1, 1]) {
      const mat = side > 0 ? this.#fadingMat('cab', M.hull) : M.hull;
      profiledBox(0.26, 0.83, 2.18, 0.12, mat, 8.15, 5.465, side * 1.09, g);
      const post = box(0.18, 1.5, 0.18, side > 0 ? this.#fadingMat('cab', M.woodDark) : M.woodDark, 8.06, 6.56, side * 2.05, g);
      post.rotation.z = 0.12;
    }
    box(0.23, 0.38, 4.3, M.woodDark, 7.96, 7.44, 0, g);
    box(0.18, 0.3, 4.4, M.woodDark, -4, 7.46, 0, g);
    curvedRoof(13.3, 5.55, 0.72, M.copper, this.#fadingMat('cab', M.copper), 2, 7.92, g);
    const seams = [];
    for (const x of [-3.7, -1.2, 1.3, 3.8, 6.3]) seams.push([x, 7.935, 0, 0.045, 0.035, 1.85]);
    instancedDetails(seams, this.geometry.detail, M.hullDark, g);

    const k = interiorKit(g, 'cab-interior');
    const { block, round, cushion, pipe, ring } = k;
    cushion(4.2, 0.75, 1.43, M.teal, 4.71, 5.49, -1.27);
    cushion(4.47, 0.15, 1.58, M.wood, 4.71, 5.93, -1.24);
    for (const x of [2.96, 4.09, 5.32, 6.48]) block(0.055, 0.52, 0.035, M.wood, x, 5.51, -0.532);
    block(4.0, 0.045, 0.04, M.brass, 4.71, 5.8, -0.51);
    pipe([[2.88, 5.26, -0.39], [3.12, 5.27, -0.35], [6.25, 5.27, -0.35], [6.51, 5.44, -0.43]], 0.035, M.brass);
    const dash = interiorKit(g, 'cab-instrument-cluster');
    dash.root.position.set(5.57, 6.41, -1.05);
    dash.root.rotation.y = -0.35;
    dash.cushion(2.37, 1.05, 0.24, M.woodDark, 0, 0, 0);
    dash.cushion(2.22, 0.9, 0.05, M.iron, 0, 0, 0.137);
    this.headingNeedle = dash.dial(0.36, 0.14, 0.08, 0.18, M, 'heading-needle');
    this.speedNeedle = dash.dial(0.22, -0.73, 0.03, 0.18, M, 'speed-needle');
    dash.block(0.36, 0.08, 0.04, M.brass, 0.14, -0.39, 0.18);
    for (let i = 0; i < 3; i++) dash.round(0.039, 0.036, 0.039, i === 0 ? M.glow : M.copper,
      0.81, -0.17 + i * 0.18, 0.18).rotation.x = Math.PI / 2;
    dash.finish();

    this.cabWheel = k.pivot('cab-wheel', 3.11, 6.22, -1.02);
    this.cabWheel.rotation.y = Math.PI / 2;
    this.cabWheel.add(ring(0.49, 0.055, M.woodDark, 0, 0, 0, true));
    this.cabWheel.add(ring(0.45, 0.018, M.brass, 0, 0, 0.024, true));
    for (let i = 0; i < 3; i++) {
      const spoke = block(0.88, 0.045, 0.04, M.brass, 0, 0, 0, true);
      spoke.rotation.z = i * Math.PI / 3;
      this.cabWheel.add(spoke);
    }
    pipe([[3.18, 6.22, -1.02], [3.6, 5.87, -1.02]], 0.075, M.iron);
    this.cabLevers = [];
    for (let i = 0; i < 2; i++) {
      const x = 4.1 + i * 0.42;
      cushion(0.25, 0.1, 0.45, M.iron, x, 6.035, -0.6);
      const lever = k.pivot(`cab-lever-${i}`, x, 6.07, -0.65);
      lever.add(block(0.048, 0.43, 0.048, M.brass, 0, 0.215, 0, true));
      lever.add(k.mesh(new THREE.SphereGeometry(0.095, 12, 8), i ? M.wine : M.woodDark, 0, 0.46, 0, true));
      this.cabLevers.push(lever);
    }
    round(0.27, 0.08, 0.27, M.iron, 1.73, 5.095, -1.13);
    round(0.07, 0.62, 0.07, M.brass, 1.73, 5.4, -1.13);
    cushion(1.16, 0.28, 1.1, M.wine, 1.73, 5.85, -1.13);
    cushion(0.26, 0.92, 1.15, M.wine, 1.17, 6.17, -1.13).rotation.z = 0.12;
    const chart = interiorKit(g, 'route-chart');
    chart.root.position.set(0.04, 6.01, -1.59);
    chart.root.rotation.x = 0.3;
    chart.block(1.64, 0.1, 0.99, M.woodDark, 0, 0, 0);
    chart.block(1.48, 0.017, 0.89, M.pages, 0, 0.065, 0);
    for (let i = -2; i <= 2; i++) chart.block(1.39, 0.006, 0.012, M.sage, 0, 0.078, i * 0.16);
    for (let i = -3; i <= 3; i++) chart.block(0.012, 0.006, 0.81, M.sage, i * 0.2, 0.078, 0);
    chart.pipe([[-0.6, 0.087, 0.29], [-0.31, 0.087, 0.2], [-0.17, 0.087, -0.09], [0.21, 0.087, 0.02], [0.57, 0.087, -0.31]], 0.022, M.hull);
    chart.round(0.052, 0.013, 0.052, M.brass, 0.57, 0.086, -0.31);
    chart.finish();
    for (const x of [-0.7, 0.77]) block(0.09, 0.94, 0.09, M.woodDark, x, 5.52, -1.67);
    for (const [x, w] of [[-1.65, 3.5], [4, 5.6]]) block(w - 0.14, 1.24, 0.012, M.glass, x, 6.6, -2.12);
    for (const z of [-1.05, 1.05]) block(0.012, 1.3, 1.95, M.glass, 8.045, 6.59, z).rotation.z = 0.1;
    block(0.08, 1.46, 0.075, M.woodDark, 8.04, 6.59, 0).rotation.z = 0.1;
    pipe([[5.87, 7.38, -1.85], [6.23, 7.28, -1.55], [6.24, 7.12, -1.24]], 0.025, M.brass);
    k.mesh(new THREE.CylinderGeometry(0.1, 0.3, 0.22, 24, 1, true), M.teal, 6.24, 7.07, -1.24);
    round(0.14, 0.025, 0.14, M.glow, 6.24, 6.97, -1.24);
    k.finish();
    const light = new THREE.PointLight(0xffd5a4, 9, 6.5, 2);
    light.position.set(5.4, 7.0, -0.2);
    g.add(light);
    this.cabLight = light;
  }

  #buildEngine(g) {
    const M = this.materials;
    const nearIron = this.#nearWallMat('car1', M.iron);
    box(15.0, 0.18, 1.9, M.iron, 0, 4.96, 0, g);
    curvedRoof(4.0, 5.5, 0.65, M.engine, this.#fadingMat('car1', M.engine), -4.9, 5.05, g, false);
    for (const side of [-1, 1]) {
      const frame = [];
      for (const x of [-6.55, -3.1, 6.5]) {
        frame.push([x, 3.1, side * 2.32, 0.17, 2.64, 0.17]);
        frame.push([x + (x < 0 ? 0.3 : -0.3), 4.13, side * 2.32, 0.12, 0.8, 0.12, 0, 0, x < 0 ? -0.65 : 0.65]);
      }
      frame.push([0, 4.43, side * 2.32, 13.4, 0.18, 0.16]);
      frame.push([-4.85, 2.0, side * 2.32, 3.6, 0.44, 0.16]);
      instancedDetails(frame, this.geometry.detail, side > 0 ? nearIron : M.iron, g, true);
    }
    instancedDetails([[-3.1, 4.61, -0.675, 0.18, 0.65, 3.25], [6.5, 4.61, -0.675, 0.18, 0.65, 3.25]], this.geometry.detail, M.iron, g, true);
    instancedDetails([[-3.1, 4.61, 1.625, 0.18, 0.65, 1.35], [6.5, 4.61, 1.625, 0.18, 0.65, 1.35]], this.geometry.detail, nearIron, g, true);
    profiledBox(6.6, 0.42, 2.0, 0.15, M.iron, 0.6, 2.0, -1.3, g);
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 1.03, 6.2, 24), M.engine);
    boiler.rotation.z = Math.PI / 2;
    boiler.position.set(0.6, 3.12, -1.3);
    boiler.castShadow = true;
    boiler.receiveShadow = true;
    g.add(boiler);
    const bands = [-2.3, -0.7, 1.8, 3.5].map((x) => [x, 3.12, -1.3, 1, 1, 1, 0, Math.PI / 2]);
    instancedDetails(bands, new THREE.TorusGeometry(1.045, 0.07, 6, 24), M.iron, g, true);
    const endCap = new THREE.Mesh(new THREE.SphereGeometry(1.03, 20, 12), M.iron);
    endCap.scale.x = 0.32;
    endCap.position.set(3.7, 3.12, -1.3);
    g.add(endCap);
    const k = interiorKit(g, 'engine-workspace');
    const { block, round, cushion, pipe, ring } = k;
    this.fireboxMat = M.firebox;
    cushion(2.1, 2.07, 0.09, M.sootGrime, 0.25, 3.01, -0.28);
    cushion(1.88, 1.87, 0.23, M.copper, 0.25, 3.0, -0.3);
    cushion(1.65, 1.64, 0.06, M.iron, 0.25, 3.0, -0.154);
    cushion(1.44, 1.42, 0.05, M.firebox, 0.25, 3.0, -0.114);
    k.arch(1.85, 0.23, 0.065, 0.07, M.brass, 0.25, 3.67, -0.17);
    block(1.73, 0.16, 0.36, M.iron, 0.25, 2.13, -0.26);
    for (let i = 0; i < 6; i++) block(0.045, 1.28, 0.05, M.iron, -0.3 + i * 0.22, 3.0, -0.055);
    block(1.4, 0.06, 0.06, M.iron, 0.25, 2.62, -0.046);
    this.flames = k.pivot('firebox-flames', 0.25, 2.35, -0.075);
    for (let i = 0; i < 5; i++) {
      const flame = k.mesh(new THREE.ConeGeometry(0.13, 0.75 + (i % 3) * 0.16, 7), M.ember,
        -0.49 + i * 0.24, 0.47, 0, true);
      flame.scale.z = 0.12;
      this.flames.add(flame);
    }
    pipe([[-4.9, 3.68, -1.35], [-4.9, 4.06, -1.35], [-3.7, 4.23, -0.97], [-2.32, 4.2, -0.68], [-1.78, 3.8, -0.44]], 0.075, M.copper);
    pipe([[-2.3, 2.36, -0.56], [-2.72, 2.47, -0.49], [-2.72, 3.02, -0.47], [-2.36, 3.12, -0.48]], 0.067, M.copper);
    this.pressureNeedle = k.dial(0.46, -1.78, 3.78, -0.24, M, 'pressure-needle');
    this.valveWheel = k.pivot('engine-valve', -2.38, 2.97, -0.24);
    this.valveWheel.add(ring(0.37, 0.052, M.wine, 0, 0, 0, true));
    for (let i = 0; i < 3; i++) {
      const spoke = block(0.68, 0.035, 0.04, M.brass, 0, 0, 0, true);
      spoke.rotation.z = i * Math.PI / 3;
      this.valveWheel.add(spoke);
    }
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.6, 3.0, 14), M.iron);
    stack.position.set(1.4, 5.71, -1.3);
    stack.castShadow = true;
    g.add(stack);
    const sootCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.44, 0.32, 14, 1, true), M.sootGrime);
    sootCollar.position.set(1.4, 7.32, -1.3);
    g.add(sootCollar);
    this.stackLocal = new THREE.Vector3(1.4, 7.48, -1.3);

    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.9, 16), M.engine);
    tank.position.set(-4.9, 2.73, -1.35);
    tank.castShadow = true;
    g.add(tank);
    instancedDetails([[-4.9, 3.68, -1.35, 0.75, 0.12, 0.75], [-4.9, 1.88, -1.35, 0.75, 0.12, 0.75]], new THREE.CylinderGeometry(1, 1, 1, 16), M.iron, g);
    profiledBox(2.0, 0.2, 1.5, 0.08, M.wood, 5.25, 2.75, -1.3, g);
    instancedDetails([[4.5, 2.22, -1.7, 0.15, 0.9, 0.15], [6, 2.22, -1.7, 0.15, 0.9, 0.15], [4.5, 2.22, -0.8, 0.15, 0.9, 0.15], [6, 2.22, -0.8, 0.15, 0.9, 0.15]], this.geometry.detail, M.iron, g);
    profiledBox(0.65, 0.36, 0.6, 0.06, M.iron, 5.5, 3.03, -1.15, g);

    cushion(2.06, 1.32, 0.09, M.woodDark, 5.28, 3.71, -1.94);
    block(1.86, 1.12, 0.035, M.teal, 5.28, 3.71, -1.88);
    block(1.84, 0.055, 0.11, M.brass, 5.28, 4.09, -1.81);
    for (const [i, x] of [4.67, 5.25, 5.85].entries()) {
      ring(0.065, 0.02, M.brass, x, 4.02, -1.73);
      block(0.065, 0.54, 0.06, M.iron, x, 3.63, -1.72).rotation.z = (i - 1) * 0.12;
      if (i === 1) block(0.42, 0.16, 0.17, M.iron, x, 3.87, -1.71);
      else {
        ring(0.12, 0.045, M.iron, x, 3.87, -1.72);
        block(0.1, 0.13, 0.055, M.wood, x, 3.4, -1.7);
      }
    }
    this.flywheel = k.pivot('engine-flywheel', 2.56, 2.95, -0.23);
    this.flywheel.add(ring(0.98, 0.1, M.iron, 0, 0, 0, true));
    this.flywheel.add(ring(0.98, 0.025, M.copper, 0, 0, 0.09, true));
    for (let i = 0; i < 3; i++) {
      const spoke = block(1.88, 0.09, 0.09, M.teal, 0, 0, 0, true);
      spoke.rotation.z = i * Math.PI / 3;
      this.flywheel.add(spoke);
    }
    const hub = round(0.17, 0.15, 0.17, M.brass, 0, 0, 0, true);
    hub.rotation.x = Math.PI / 2;
    this.flywheel.add(hub);
    this.connectingRod = block(1, 0.083, 0.06, M.copper, 3.7, 2.95, -0.1, true);
    this.connectingRod.name = 'engine-connecting-rod';
    this.piston = block(0.23, 0.23, 0.13, M.brass, 4.7, 2.95, -0.15, true);
    this.piston.name = 'engine-piston';
    cushion(1.21, 0.48, 0.43, M.engine, 5.32, 2.95, -0.46);
    for (const x of [4.78, 5.83]) block(0.1, 0.52, 0.46, M.iron, x, 2.95, -0.47);
    k.finish();
    this.fireLight = new THREE.PointLight(0xffb273, 8, 6, 2);
    this.fireLight.position.set(0.25, 3.15, 0.95);
    g.add(this.fireLight);
  }

  #buildLiving(g) {
    const M = this.materials;
    const result = buildLivingInterior(g, M, {
      createPlant: (x, y, z, scale, kind) => new Plant(g, M, this.geometry, x, y, z, scale, kind),
    });
    this.plantPots = result.plantPots;
    this.wateringCan = result.can;
    this.chairX = CAR_CENTERS[2] - 3.6;
    curvedRoof(16.1, 6.1, 0.65, M.roofGreen, this.#fadingMat('car2', M.roofGreen), -0.65, 5.05, g);
    profiledBox(1.9, 0.24, 4.9, 0.08, M.wood, -7.8, 1.66, 0, g);
    for (const side of [-1, 1]) {
      const material = (source) => side > 0 ? this.#fadingMat('car2', source) : source;
      const timber = [[-0.65, 4.39, side * 2.92, 16.2, 0.16, 0.18]];
      for (const x of [-8.55, -6.9]) {
        timber.push([x, 3.27, side * 2.25, 0.19, 2.98, 0.19]);
        timber.push([x + (x < -8 ? 0.22 : -0.22), 4.55, side * 2.25, 0.13, 0.68, 0.13, 0, 0, x < -8 ? -0.7 : 0.7]);
      }
      timber.push([-7.75, 2.68, side * 2.25, 1.8, 0.15, 0.22]);
      for (const x of [-8.3, -7.9, -7.5, -7.1]) timber.push([x, 2.21, side * 2.25, 0.07, 0.8, 0.07]);
      instancedDetails(timber, this.geometry.detail, material(M.woodDark), g, true);
      const eaveBrackets = [];
      for (const x of [-5.9, -2.6, 2.1, 6.3]) eaveBrackets.push([x, 4.4, side * 2.57, 0.12, 0.62, 0.12, side * 0.85]);
      instancedDetails(eaveBrackets, this.geometry.detail, material(M.wood), g, true);
      const awning = box(3.4, 0.1, 0.78, material(M.cream), 3.9, 4.13, side * 2.75, g);
      awning.rotation.x = side * 0.18;
      const stripes = [];
      for (let x = 2.4; x <= 5.4; x += 0.6) stripes.push([x, 4.19, side * 2.75, 0.22, 0.025, 0.78, side * 0.18]);
      instancedDetails(stripes, this.geometry.detail, material(M.sage), g);
      profiledBox(2.7, 0.32, 0.45, 0.08, material(M.wood), 3.9, 2.57, side * 2.63, g);
      const leaves = [];
      for (let i = 0; i < 7; i++) leaves.push([2.75 + i * 0.38, 2.83 + (i % 2) * 0.06, side * 2.64, 0.7, 0.9, 0.75]);
      instancedDetails(leaves, this.geometry.leaf, material(M.foliage), g);
    }
    box(0.16, 0.15, 2.3, M.woodDark, -8.55, 2.68, -1.05, g);
    box(0.16, 0.15, 0.7, this.#fadingMat('car2', M.woodDark), -8.55, 2.68, 1.95, g);
    curvedRoof(0.2, 4.55, 0.15, M.woodDark, this.#fadingMat('car2', M.woodDark), -8.55, 4.91, g);
    const lanternMat = this.#fadingMat('car2', M.iron);
    profiledBox(0.28, 0.42, 0.28, 0.04, this.#fadingMat('car2', M.glow), -7.05, 3.45, 2.5, g);
    instancedDetails([[-7.05, 3.69, 2.5, 0.38, 0.08, 0.38], [-7.05, 3.22, 2.5, 0.36, 0.08, 0.36], [-7.05, 3.9, 2.5, 0.045, 0.4, 0.045]], this.geometry.detail, lanternMat, g);
    const seams = [];
    for (let x = -7.8; x < 7.3; x += 2.2) seams.push([x, 5.06, -0.6, 0.04, 0.02, 0.55]);
    instancedDetails(seams, this.geometry.detail, M.sage, g);
  }

  #buildExteriorDetails(g, ci) {
    const M = this.materials;
    const runningGear = [];
    const springs = [];
    for (const z of [-2.18, 2.18]) {
      for (const x of [-4.3, 4.3]) {
        runningGear.push([x, 1.04, z, 3.25, 0.22, 0.25]);
        for (let i = 0; i < 3; i++) springs.push([x, 1.35 + i * 0.075, z, 1.4 + i * 0.32, 0.045, 0.24]);
      }
      runningGear.push([0, 1.63, z, 13.9, 0.2, 0.16]);
    }
    instancedDetails(runningGear, this.geometry.detail, M.iron, g, true);
    instancedDetails(springs, this.geometry.detail, M.engine, g);

    for (const gapX of ci === 0 ? [-8.55] : ci === 2 ? [8.55] : []) {
      instancedDetails([
        [gapX, 1.05, -0.62, 1, 1, 1, 0, Math.PI / 2],
        [gapX, 1.05, 0.62, 1, 1, 1, 0, Math.PI / 2],
      ], new THREE.TorusGeometry(0.4, 0.08, 6, 12, Math.PI), M.iron, g);
    }
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
    const spin = (this.speed / 0.92) * dt;
    for (const w of this.wheels) w.rotation.z -= spin;
    if (this.flywheel) this.flywheel.rotation.z -= this.speed * dt * 1.7;
    const motion = this.motionQuery?.matches ? 0 : 1;
    const speed01 = clamp(this.speed / TUNING.baseSpeed, 0, 1);
    this.headingNeedle.rotation.z = -this.heading;
    this.speedNeedle.rotation.z = damp(this.speedNeedle.rotation.z, 2.3 - speed01 * 4.6, 5, dt);
    this.cabWheel.rotation.z = Math.sin(this.heading) * 0.7;
    this.cabLevers[0].rotation.z = damp(this.cabLevers[0].rotation.z, -0.38 + speed01 * 0.85, 5, dt);
    this.cabLevers[1].rotation.x = damp(this.cabLevers[1].rotation.x, this.paused || this.blocked ? 0.5 : -0.25, 5, dt);
    const crankX = 2.56 + Math.cos(this.flywheel.rotation.z) * 0.62;
    const crankY = 2.95 + Math.sin(this.flywheel.rotation.z) * 0.62;
    const reach = Math.sqrt(2.4 ** 2 - (crankY - 2.95) ** 2);
    this.piston.position.x = crankX + reach;
    this.connectingRod.position.set(crankX + reach / 2, (crankY + 2.95) / 2, -0.1);
    this.connectingRod.scale.x = 2.4;
    this.connectingRod.rotation.z = Math.atan2(2.95 - crankY, reach);

    const rust = this.wear / 100;
    this.materials.wheel.color.setRGB(
      lerp(0.29, 0.54, rust),
      lerp(0.27, 0.31, rust),
      lerp(0.25, 0.18, rust)
    );

    const eff01 = this.eff / 100;
    const flicker = 1 + 0.06 * Math.sin(time * 8.1) * Math.sin(time * 4.3) * motion;
    this.pressureNeedle.rotation.z = damp(this.pressureNeedle.rotation.z, 2.3 - eff01 * 4.6, 5, dt);
    this.valveWheel.rotation.z = damp(this.valveWheel.rotation.z, eff01 * Math.PI * 1.2, 4, dt);
    this.flames.scale.y = (0.28 + eff01 * 0.78) * flicker;
    this.materials.ember.emissiveIntensity = (0.7 + eff01 * 1.5) * flicker;
    if (this.fireboxMat) {
      this.fireboxMat.emissiveIntensity = (0.15 + eff01 * 0.65) * flicker;
    }
    if (this.fireLight) this.fireLight.intensity = 3 + eff01 * 6;

    const plant01 = (this.plants - TUNING.plantFloor) / (100 - TUNING.plantFloor);
    if (this.plantPots) for (const pl of this.plantPots) pl.setHappiness(plant01, time, motion);
    this.wateringPulse = damp(this.wateringPulse, this.plants > this.previousPlants + 0.001 ? 1 : 0, 7, dt);
    this.previousPlants = this.plants;
    this.wateringCan.rotation.z = -this.wateringPulse * 0.38;

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
    const geometries = new Set([...Object.values(this.geometry), this.dotGeo]);
    const materials = new Set([...Object.values(this.materials), this.dotMat]);
    const textures = new Set();
    const instances = new Set();
    // A docked player is a passenger, not a train-owned render resource.
    const roots = [...this.carVisuals, this.routeGroup, ...this.smoke.map((puff) => puff.sprite)];
    for (const root of roots) {
      root.traverse((obj) => {
        if (obj.isInstancedMesh) instances.add(obj);
        if (obj.geometry) geometries.add(obj.geometry);
        if (!obj.material) return;
        const owned = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of owned) {
          materials.add(material);
        }
      });
      this.scene.remove(root);
    }
    for (const car of this.cars) this.scene.remove(car.group);
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
    for (const instance of instances) instance.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
  }
}
