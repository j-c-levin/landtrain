import * as THREE from 'three';
import { GRASSLAND_LOOK, grasslandMaterials } from '../look.js';
import { GRASS_LANDMARK } from './layout.js';

export function mossyBoulders(rand, cx, cz, r, root, obstacles) {
  const group = new THREE.Group();
  const mat = grasslandMaterials.boulder(GRASSLAND_LOOK.boulder);
  const matDark = grasslandMaterials.boulder(GRASSLAND_LOOK.boulderDark);
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = r * (0.32 + rand() * 0.45);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rand() > 0.5 ? mat : matDark);
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.55;
    rock.position.set(cx + Math.cos(a) * d, s * 0.4, cz + Math.sin(a) * d);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.scale.y = 0.55 + rand() * 0.4;
    rock.castShadow = true;
    group.add(rock);
  }
  root.add(group);
  obstacles.push({ type: 'circle', x: cx, z: cz, r });
}

// Pure dressing around the knoll's foot: not pushed as an obstacle.
export function buildKnollBoulders({ root, rand }) {
  const bMat = grasslandMaterials.boulder(GRASSLAND_LOOK.boulder);
  const bMatDark = grasslandMaterials.boulder(GRASSLAND_LOOK.boulderDark);
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2;
    const r = 52 + rand() * 8;
    const s = 4 + rand() * 4;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rand() > 0.5 ? bMat : bMatDark);
    rock.position.set(GRASS_LANDMARK.x + Math.cos(a) * r, s * 0.3, GRASS_LANDMARK.z + Math.sin(a) * r);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.castShadow = true;
    rock.scale.y = 0.55 + rand() * 0.4;
    root.add(rock);
  }
}
