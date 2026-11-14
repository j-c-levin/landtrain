import * as THREE from 'three';
import { grasslandMaterials } from '../look.js';
import { GRASS_LANDMARK } from './layout.js';

// The second magic tree — a re-skin of the prairie's Great Tree. Same
// silhouette family (knoll + trunk + leaf blobs + glowing accents + halo) but
// cooler: a green grassy knoll, silver/blue blossom, cool glowing accents. All
// fog:false so it reads as a far silhouette on the horizon when approaching
// from the west.
export function buildGrassLandmark(root) {
  const group = new THREE.Group();
  group.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);

  const knollMat = grasslandMaterials.knoll();
  const knollFootMat = grasslandMaterials.knollFoot();
  const trunkMat = grasslandMaterials.trunk();
  const leafMat = grasslandMaterials.leaf();
  const accentMat = grasslandMaterials.accent();
  const lanternMat = grasslandMaterials.lantern();

  // Grassy knoll instead of the prairie's red mesa.
  const knoll = new THREE.Mesh(new THREE.CylinderGeometry(46, 64, 16, 9), knollMat);
  knoll.position.y = 8;
  group.add(knoll);

  // A stepped foot flaring wider than the knoll body — reads as a rocky/mossy
  // shelf the knoll sits on rather than a cylinder planted straight in the turf.
  const knollFoot = new THREE.Mesh(new THREE.CylinderGeometry(52, 58, 5, 9), knollFootMat);
  knollFoot.position.y = 2.5;
  group.add(knollFoot);

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

  const accentBlobs = [
    [14, 92, 10, 12],
    [-24, 80, -6, 11],
    [8, 68, 20, 13],
  ];
  for (const [bx, by, bz, br] of accentBlobs) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(br, 1), accentMat);
    blob.position.set(bx, by, bz);
    group.add(blob);
  }

  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    // orbit radius varies 22-30 via an index-based pseudo-variation (kept
    // parameter-free — this function takes no rand — so the layout stays
    // deterministic without threading the PRNG through)
    const orbitR = 22 + 8 * (0.5 + 0.5 * Math.sin(i * 1.7));
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), lanternMat);
    lantern.position.set(Math.cos(a) * orbitR, 56 + Math.sin(i * 2.7) * 10, Math.sin(a) * orbitR);
    group.add(lantern);
  }

  // A cool halo sprite so it glows even as a far silhouette.
  const halo = new THREE.Sprite(grasslandMaterials.halo());
  halo.scale.setScalar(160);
  halo.position.y = 78;
  group.add(halo);

  root.add(group);
  return group;
}
