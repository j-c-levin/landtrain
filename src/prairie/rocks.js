import * as THREE from 'three';
import { PRAIRIE_LOOK, prairieMaterials } from '../look.js';

export function bigRockCluster(rand, cx, cz, r, root, obstacles) {
  const group = new THREE.Group();
  const mat = prairieMaterials.rock(PRAIRIE_LOOK.rock);
  const matDark = prairieMaterials.rock(PRAIRIE_LOOK.rockDark);
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = r * (0.32 + rand() * 0.45);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rand() > 0.5 ? mat : matDark);
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.55;
    rock.position.set(cx + Math.cos(a) * d, s * 0.45, cz + Math.sin(a) * d);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.scale.y = 0.6 + rand() * 0.5;
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
    const rock = new THREE.Mesh(new THREE.ConeGeometry(s, s * (2.1 + rand() * 0.9), 5), rand() > 0.5 ? mat : matWarm);
    rock.position.set(
      x1 + dx * t + (rand() - 0.5) * 10,
      s * 0.7,
      z1 + dz * t + (rand() - 0.5) * 10
    );
    rock.rotation.y = rand() * Math.PI;
    rock.rotation.x = (rand() - 0.5) * 0.14;
    group.add(rock);
  }
  root.add(group);
  obstacles.push({ type: 'seg', x1, z1, x2, z2, w: 16 });
}
