import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRASSLAND_LOOK, floraMaterials, jitterHSL } from '../look.js';
import { shadeByHeight } from '../groundcover.js';
import { GRASS_LANDMARK, onWater } from './layout.js';

// Returns [{ group, mats }] so the biome can fade willows near the camera.
export function buildWillows({ root, rand, randX, randZ }) {
  // --- willows (individual, so they can fade near the camera) -----------
  // Drooping, vertically-stretched icosahedron crowns over slim trunks.
  const trees = [];
  const treeGroup = new THREE.Group();
  for (let i = 0; i < 70; i++) {
    const t = new THREE.Group();
    const h = 5 + rand() * 6;
    const trunkMat = floraMaterials.fadingTrunk(GRASSLAND_LOOK.willowTrunk);
    const leafMat = floraMaterials.fadingLeaf();
    jitterHSL(leafMat.color, rand, GRASSLAND_LOOK.willowLeaf);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, h, 6), trunkMat);
    trunk.position.y = h / 2;
    // weeping crown: a dome with curtains of foliage hanging to the grass
    const parts = [];
    const dome = new THREE.IcosahedronGeometry(h * 0.52, 1);
    dome.scale(1.2, 0.8, 1.2);
    dome.translate(0, h * 1.02, 0);
    parts.push(dome);
    const curtains = 6 + Math.floor(rand() * 3);
    for (let c = 0; c < curtains; c++) {
      const a = (c / curtains) * Math.PI * 2 + rand() * 0.5;
      const r = h * (0.48 + rand() * 0.14);
      const drop = new THREE.IcosahedronGeometry(h * (0.2 + rand() * 0.08), 0);
      drop.scale(1, 2.1 + rand() * 0.7, 1);
      drop.translate(Math.cos(a) * r, h * (0.62 + rand() * 0.1), Math.sin(a) * r);
      parts.push(drop);
    }
    const crown = new THREE.Mesh(shadeByHeight(mergeGeometries(parts), 0.6, 1.16), leafMat);
    for (const g of parts) g.dispose();
    trunk.castShadow = true;
    crown.castShadow = true;
    t.add(trunk, crown);
    // keep willows off the channels and off the landmark knoll
    let wx = randX(), wz = randZ(), n = 0;
    while (n++ < 12 && (onWater(wx, wz) ||
           Math.hypot(wx - GRASS_LANDMARK.x, wz - GRASS_LANDMARK.z) < 130)) {
      wx = randX(); wz = randZ();
    }
    t.position.set(wx, 0, wz);
    treeGroup.add(t);
    trees.push({ group: t, mats: [trunkMat, leafMat] });
  }
  root.add(treeGroup);
  return trees;
}
