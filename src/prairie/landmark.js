import * as THREE from 'three';
import { LANDMARK } from '../constants.js';
import { prairieMaterials } from '../look.js';
import { mulberry } from '../prng.js';
import { mesaGeometry } from './rocks.js';

// The Great Tree. Its materials ignore scene fog so it reads on the horizon from the start.
export function buildLandmark(root) {
  const group = new THREE.Group();
  group.position.set(LANDMARK.x, 0, LANDMARK.z);

  const mesaMat = prairieMaterials.mesa();
  const trunkMat = prairieMaterials.trunk();
  const leafMat = prairieMaterials.leaf();
  const lanternMat = prairieMaterials.lantern();

  const mesa = new THREE.Mesh(mesaGeometry(mulberry(81), 96, 17), mesaMat);
  mesa.position.y = -0.5;
  group.add(mesa);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(5, 9, 62, 7), trunkMat);
  trunk.position.y = 16 + 31;
  group.add(trunk);

  const blobs = [
    [0, 86, 0, 36],
    [-20, 72, 8, 24],
    [18, 74, -10, 22],
  ];
  for (const [bx, by, bz, br] of blobs) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(br, 1), leafMat);
    blob.position.set(bx, by, bz);
    group.add(blob);
  }

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), lanternMat);
    lantern.position.set(Math.cos(a) * 26, 56 + Math.sin(i * 2.7) * 10, Math.sin(a) * 26);
    group.add(lantern);
  }

  const halo = new THREE.Sprite(prairieMaterials.halo());
  halo.scale.setScalar(160);
  halo.position.y = 78;
  group.add(halo);

  root.add(group);
  return group;
}
