import * as THREE from 'three';
import { clamp } from '../constants.js';
import { PRAIRIE_LOOK, prairieMaterials } from '../look.js';
import { crag } from '../shapes.js';

export function bigRockCluster(rand, cx, cz, r, root, obstacles) {
  const group = new THREE.Group();
  const mat = prairieMaterials.rock(PRAIRIE_LOOK.rock);
  const matDark = prairieMaterials.rock(PRAIRIE_LOOK.rockDark);
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = r * (0.32 + rand() * 0.45);
    const dark = rand() > 0.5;
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.55;
    const rot = [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI];
    const squash = 0.9 + rand() * 0.7;
    const rock = new THREE.Mesh(crag(rand, s, squash), dark ? matDark : mat);
    rock.position.set(cx + Math.cos(a) * d, s * 0.2, cz + Math.sin(a) * d);
    rock.rotation.y = rot[1];
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }
  root.add(group);
  obstacles.push({ type: 'circle', x: cx, z: cz, r });
}

export function ridge(rand, x1, z1, x2, z2, root, obstacles) {
  const group = new THREE.Group();
  const mat = prairieMaterials.rock(PRAIRIE_LOOK.ridge);
  const matWarm = prairieMaterials.rock(PRAIRIE_LOOK.ridgeWarm);
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const steps = Math.ceil(len / 24);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = 13 + rand() * 11;
    const tall = 2.1 + rand() * 0.9;
    const warm = rand() > 0.5;
    const geo = new THREE.ConeGeometry(s, s * tall, 7, 3);
    const p = geo.attributes.position;
    const ph = rand() * 6;
    for (let v = 0; v < p.count; v++) {
      const k = 0.86 + 0.22 * Math.sin(p.getY(v) * 0.4 + Math.atan2(p.getZ(v), p.getX(v)) * 3 + ph);
      p.setX(v, p.getX(v) * k);
      p.setZ(v, p.getZ(v) * k);
    }
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, warm ? matWarm : mat);
    rock.position.set(
      x1 + dx * t + (rand() - 0.5) * 10,
      s * 0.7,
      z1 + dz * t + (rand() - 0.5) * 10
    );
    rock.rotation.y = rand() * Math.PI;
    rock.rotation.x = (rand() - 0.5) * 0.14;
    rock.castShadow = true;
    group.add(rock);
  }
  root.add(group);
  obstacles.push({ type: 'seg', x1, z1, x2, z2, w: 16 });
}

// Stepped butte for the backscene: talus skirt, cliff bands, flat cap, strata painted by height.
export function mesaGeometry(rand, radius, height) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 20, 5);
  const p = geo.attributes.position;
  const profile = [1.0, 0.78, 0.72, 0.58, 0.54, 0.47];
  const bands = PRAIRIE_LOOK.mesaBands.map((c) => new THREE.Color(c));
  const col = new Float32Array(p.count * 3);
  const ph1 = rand() * 6.28;
  const ph2 = rand() * 6.28;
  const first = Math.floor(rand() * bands.length);
  const tint = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = clamp(p.getY(i) / height + 0.5, 0, 1);
    const row = Math.round(t * 5);
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = profile[row] * (0.84 + 0.2 * Math.sin(a * 3 + ph1) + 0.1 * Math.sin(a * 7 + ph2));
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
    tint.copy(bands[(first + row) % bands.length]);
    if (row === 0) tint.set(PRAIRIE_LOOK.flock[3]);
    col[i * 3] = tint.r;
    col[i * 3 + 1] = tint.g;
    col[i * 3 + 2] = tint.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.translate(0, height / 2, 0);
  geo.computeVertexNormals();
  return geo;
}
