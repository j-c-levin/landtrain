import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getLookTier } from '../look.js';
import { plantLeafGeometry } from './interior-kit.js';

export const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function tint(geometry, shade) {
  const p = geometry.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = shade(p.getX(i), p.getY(i), p.getZ(i));
    if (v.length) c.set(v, i * 3);
    else c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geometry;
}

// Vertex colour masks the paint: bright rim, shaded web, dark iron tyre and balance weight.
function wheelGeometry(fine) {
  const seg = fine ? 24 : 18;
  const flat = (geo, v) => tint(geo, () => v);
  const web = new THREE.CylinderGeometry(0.78, 0.78, 0.3, seg);
  web.rotateX(Math.PI / 2);
  const rim = new THREE.TorusGeometry(0.71, 0.09, fine ? 5 : 4, seg);
  rim.scale(1, 1, 2.4);
  const tyre = new THREE.TorusGeometry(0.84, 0.1, fine ? 6 : 5, seg);
  tyre.scale(1, 1, 2.5);
  const boss = new THREE.CylinderGeometry(0.3, 0.3, 0.52, fine ? 14 : 10);
  boss.rotateX(Math.PI / 2);
  const parts = [flat(web, 0.66), flat(rim, 1), flat(tyre, 0.09), flat(boss, 0.5)];
  if (fine) {
    const weight = new THREE.CylinderGeometry(0.64, 0.64, 0.4, 6, 1, false, Math.PI - 0.55, 1.1);
    weight.rotateX(Math.PI / 2);
    parts.push(flat(weight, 0.2));
  }
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return merged;
}

// Panels pick up road dust along their lower edge.
function panelGeometry(fine) {
  if (!fine) return tint(new THREE.BoxGeometry(1, 1, 1), (x, y) => (y < 0 ? 0.86 : 1));
  return tint(new THREE.BoxGeometry(1, 1, 1, 1, 3, 1), (x, y) => (y < -0.4 ? 0.8 : y < -0.1 ? 0.95 : 1));
}

export function createTrainGeometry() {
  const fine = getLookTier() === 'high';
  const wheel = wheelGeometry(fine);
  const wheelHub = new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10);
  wheelHub.rotateX(Math.PI / 2);
  return {
    wheel,
    wheelHub,
    detail: new THREE.BoxGeometry(1, 1, 1),
    panel: panelGeometry(fine),
    pin: new THREE.CylinderGeometry(1, 1, 1, fine ? 10 : 6).rotateX(Math.PI / 2),
    drum: new THREE.CylinderGeometry(1, 1, 1, 16),
    leaf: new THREE.SphereGeometry(0.22, 6, 5),
    plantLeaf: plantLeafGeometry(),
  };
}

export function box(w, h, d, mat, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (shadow) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  parent.add(m);
  return m;
}

export function profiledBox(length, height, depth, chamfer, mat, x, y, z, parent) {
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

// mat and nearMat must take vertex colours. soot: [x, z, reach] of a chimney.
export function curvedRoof(length, width, rise, mat, nearMat, x, crest, parent, { coverCenter = true, soot = null, patina = false } = {}) {
  const shape = new THREE.Shape();
  const half = width / 2;
  const crown = 0.95;
  shape.moveTo(crown, 0);
  shape.quadraticCurveTo(half - 0.35, 0, half, -rise);
  shape.lineTo(half, -rise - 0.14);
  shape.quadraticCurveTo(half - 0.35, -0.14, crown, -0.14);
  shape.closePath();
  const steps = getLookTier() === 'high' ? Math.max(1, Math.round(length / (patina ? 0.55 : 2.2))) : 1;
  const wear = (px, py, pz) => {
    const t = Math.min(1, Math.max(0, -py / (rise + 0.14)));
    const sheet = hash(Math.floor((px + x + 40) / 2.2));
    const streak = hash(Math.floor((px + x + 40) / 2.2) + 91);
    let v = 1 - 0.3 * t * t - (sheet - 0.5) * 0.1 - streak * 0.16 * t;
    if (soot) {
      const d = Math.hypot(px + x - soot[0], Math.abs(pz) - Math.abs(soot[1])) / soot[2];
      v *= 1 - 0.6 * Math.exp(-d * d);
    }
    if (!patina) return v;
    const run = Math.floor((px + x + 40) / 0.55);
    v *= 1 - 0.22 * hash(run + 3) * t;
    const green = Math.min(1, 0.35 * t * t + 1.1 * hash(run + 17) ** 2 * t);
    return [v * (1 - 0.5 * green), v * (1 + 0.22 * green), v * (1 + 0.4 * green)];
  };
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, steps, curveSegments: 10, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  geometry.rotateY(Math.PI / 2);
  tint(geometry, wear);
  for (const near of [false, true]) {
    const mesh = new THREE.Mesh(geometry, near ? nearMat : mat);
    mesh.position.set(x, crest, 0);
    if (near) mesh.rotation.y = Math.PI;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
  if (!coverCenter) return;
  const cover = new THREE.Mesh(tint(new THREE.BoxGeometry(length, 0.14, crown * 2, steps, 1, 1), (px, py, pz) => wear(px, 0, pz)), mat);
  cover.position.set(x, crest - 0.07, 0);
  cover.castShadow = true;
  cover.receiveShadow = true;
  parent.add(cover);
}

export function instancedDetails(items, geometry, material, parent, shadow = false) {
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

export function shadeInstances(mesh, shade) {
  const color = new THREE.Color();
  for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, color.setScalar(shade(i)));
  return mesh;
}
