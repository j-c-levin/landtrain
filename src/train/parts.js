import * as THREE from 'three';
import { plantLeafGeometry } from './interior-kit.js';

export function createTrainGeometry() {
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

export function curvedRoof(length, width, rise, mat, nearMat, x, crest, parent, coverCenter = true) {
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
