import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { painted } from '../look.js';

export function interiorKit(parent, name) {
  const root = new THREE.Group();
  root.name = name;
  parent.add(root);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
  const sources = new Set([cube, cylinder]);
  const statics = [];
  const retained = new Set();

  function mesh(geometry, source, x = 0, y = 0, z = 0, live = false) {
    const material = painted(source);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = !material.transparent;
    object.receiveShadow = true;
    root.add(object);
    sources.add(geometry);
    if (live) retained.add(geometry);
    else statics.push(object);
    return object;
  }

  function block(w, h, d, material, x, y, z, live = false) {
    const object = mesh(cube, material, x, y, z, live);
    object.scale.set(w, h, d);
    return object;
  }

  function round(rx, h, rz, material, x, y, z, live = false) {
    const object = mesh(cylinder, material, x, y, z, live);
    object.scale.set(rx, h, rz);
    return object;
  }

  function cushion(w, h, d, material, x, y, z) {
    const geometry = new THREE.SphereGeometry(1, 20, 12);
    const p = geometry.attributes.position;
    const puff = (v) => Math.sign(v) * Math.abs(v) ** 0.38;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, puff(p.getX(i)) * w / 2, puff(p.getY(i)) * h / 2, puff(p.getZ(i)) * d / 2);
    }
    geometry.computeVertexNormals();
    return mesh(geometry, material, x, y, z);
  }

  function pipe(points, radius, material) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 6, false), material);
  }

  function ring(radius, tube, material, x, y, z, live = false) {
    return mesh(new THREE.TorusGeometry(radius, tube, 8, 32), material, x, y, z, live);
  }

  function arch(w, rise, thickness, depth, material, x, y, z) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.quadraticCurveTo(0, rise * 2, w / 2, 0);
    shape.lineTo(w / 2, -thickness);
    shape.quadraticCurveTo(0, rise * 2 - thickness, -w / 2, -thickness);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
    geometry.translate(0, 0, -depth / 2);
    return mesh(geometry, material, x, y, z);
  }

  function cloth(width, path, material, x, folds = 0.035) {
    const geometry = new THREE.PlaneGeometry(width, 1, 16, 24);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i);
      const t = (0.5 - p.getY(i)) * (path.length - 1);
      const k = Math.min(Math.floor(t), path.length - 2);
      const f = t - k;
      p.setXYZ(i, x + u, THREE.MathUtils.lerp(path[k][1], path[k + 1][1], f) + Math.cos(u * 19) * folds,
        THREE.MathUtils.lerp(path[k][0], path[k + 1][0], f));
    }
    geometry.computeVertexNormals();
    return mesh(geometry, material);
  }

  function curtain(w, h, material, x, y, z) {
    const geometry = new THREE.PlaneGeometry(w, h, 18, 16);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i);
      const gather = 1 - 0.55 * Math.exp(-(((v + h * 0.16) / (h * 0.16)) ** 2));
      p.setXYZ(i, u * gather, v, Math.cos(u * 47) * 0.065 + 0.06 * (v / h) ** 2);
    }
    geometry.computeVertexNormals();
    return mesh(geometry, material, x, y, z);
  }

  function pivot(name, x, y, z) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, y, z);
    root.add(group);
    return group;
  }

  function dial(radius, x, y, z, M, name) {
    ring(radius, 0.045, M.brass, x, y, z);
    round(radius * 0.92, 0.045, radius * 0.92, M.instrument, x, y, z).rotation.x = Math.PI / 2;
    for (let i = 0; i < 13; i++) {
      const angle = -2.3 + i * 4.6 / 12;
      const tick = block(i % 3 === 0 ? 0.027 : 0.016, radius * (i % 3 === 0 ? 0.2 : 0.12), 0.012,
        M.iron, x + Math.sin(angle) * radius * 0.75, y + Math.cos(angle) * radius * 0.75, z + 0.034);
      tick.rotation.z = -angle;
    }
    const needle = pivot(name, x, y, z + 0.05);
    needle.add(block(0.032, radius * 0.85, 0.025, M.hull, 0, radius * 0.3, 0, true));
    round(0.055, 0.035, 0.055, M.brass, x, y, z + 0.065).rotation.x = Math.PI / 2;
    return needle;
  }

  function finish() {
    const batches = new Map();
    for (const object of statics) {
      object.updateMatrix();
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrix);
      if (!batches.has(object.material)) batches.set(object.material, []);
      batches.get(object.material).push(geometry);
      root.remove(object);
    }
    for (const [material, geometries] of batches) {
      const object = new THREE.Mesh(mergeGeometries(geometries), material);
      object.name = `${name}-${material.name || material.type}`;
      object.castShadow = !material.transparent;
      object.receiveShadow = true;
      root.add(object);
      for (const geometry of geometries) geometry.dispose();
    }
    for (const geometry of sources) if (!retained.has(geometry)) geometry.dispose();
    return root;
  }

  return { root, mesh, block, round, cushion, pipe, ring, arch, cloth, curtain, pivot, dial, finish };
}

export function plantLeafGeometry() {
  const geometry = new THREE.PlaneGeometry(1, 1, 6, 10);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), t = p.getY(i) + 0.5;
    const width = Math.sin(Math.PI * t) ** 0.72;
    p.setXYZ(i, u * width, t, 0.15 * Math.sin(Math.PI * t) * (1 - Math.abs(u) * 1.7));
  }
  geometry.computeVertexNormals();
  return geometry;
}
