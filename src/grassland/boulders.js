import * as THREE from 'three';
import { GRASSLAND_LOOK, grasslandMaterials } from '../look.js';
import { GRASS_LANDMARK } from './layout.js';
import { crag } from '../shapes.js';

const stone = new THREE.Color();
const moss = new THREE.Color(GRASSLAND_LOOK.moss);
const tint = new THREE.Color();
// grey stone flocked with moss wherever a face looks up
const mossy = (base) => (_h, up) => {
  stone.set(base);
  return tint.copy(stone).lerp(moss, Math.min(1, Math.max(0, (up - 0.25) / 0.5)));
};

export function mossyBoulders(rand, cx, cz, r, root, obstacles) {
  const group = new THREE.Group();
  const mat = grasslandMaterials.boulder();
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = r * (0.32 + rand() * 0.45);
    const dark = rand() > 0.5;
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.55;
    const geo = crag(rand, s, 0.8 + rand() * 0.6, mossy(dark ? GRASSLAND_LOOK.boulderDark : GRASSLAND_LOOK.boulder));
    const rock = new THREE.Mesh(geo, mat);
    rock.position.set(cx + Math.cos(a) * d, s * 0.2, cz + Math.sin(a) * d);
    rock.rotation.y = rand() * Math.PI;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }
  root.add(group);
  obstacles.push({ type: 'circle', x: cx, z: cz, r });
}

// Pure dressing around the knoll's foot: not pushed as an obstacle.
export function buildKnollBoulders({ root, rand }) {
  const bMat = grasslandMaterials.boulder();
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2;
    const r = 52 + rand() * 8;
    const s = 4 + rand() * 4;
    const dark = rand() > 0.5;
    const geo = crag(rand, s, 0.8 + rand() * 0.5, mossy(dark ? GRASSLAND_LOOK.boulderDark : GRASSLAND_LOOK.boulder));
    const rock = new THREE.Mesh(geo, bMat);
    rock.position.set(GRASS_LANDMARK.x + Math.cos(a) * r, s * 0.2, GRASS_LANDMARK.z + Math.sin(a) * r);
    rock.rotation.y = rand() * Math.PI;
    rock.castShadow = true;
    root.add(rock);
  }
}
