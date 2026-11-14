import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRASSLAND_LOOK, floraMaterials, jitterHSL } from '../look.js';
import { shadeByHeight } from '../groundcover.js';
import { mulberry } from '../prng.js';
import { GRASS_LANDMARK, FOOT, zMin, zSpan, onWater, riverDefs, riverCenterX } from './layout.js';

// A weeping crown: a dome with curtains of foliage hanging to the grass.
function willow(rand, h) {
  const t = new THREE.Group();
  const trunkMat = floraMaterials.fadingTrunk(GRASSLAND_LOOK.willowTrunk);
  const leafMat = floraMaterials.fadingLeaf();
  jitterHSL(leafMat.color, rand, GRASSLAND_LOOK.willowLeaf);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, h, 6), trunkMat);
  trunk.position.y = h / 2;
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
  return { group: t, mats: [trunkMat, leafMat] };
}

// Returns [{ group, mats }] so the biome can fade willows near the camera.
export function buildWillows({ root, rand, randX, randZ }) {
  const trees = [];
  const treeGroup = new THREE.Group();
  for (let i = 0; i < 70; i++) {
    const tree = willow(rand, 5 + rand() * 6);
    let wx = randX(), wz = randZ(), n = 0;
    while (n++ < 12 && (onWater(wx, wz) ||
           Math.hypot(wx - GRASS_LANDMARK.x, wz - GRASS_LANDMARK.z) < 130)) {
      wx = randX(); wz = randZ();
    }
    tree.group.position.set(wx, 0, wz);
    treeGroup.add(tree.group);
    trees.push(tree);
  }

  // big old willows leaning over the water, the first pair framing each crossing
  const local = mulberry(40611);
  riverDefs.forEach((def) => {
    const g = def.gaps[0];
    const gapZ = zMin + zSpan * (g.t0 + g.t1) / 2;
    for (let i = 0; i < 7; i++) {
      const z = i < 2 ? gapZ + (i ? 1 : -1) * (84 + local() * 30) : zMin + local() * zSpan;
      const side = i < 2 ? (i ? 1 : -1) : local() < 0.5 ? -1 : 1;
      const dist = FOOT + 1 + local() * 5;
      if (Math.abs(z - gapZ) < 36) continue;
      const tree = willow(local, 10 + local() * 5);
      tree.group.position.set(riverCenterX(def, z) + side * dist, 0, z);
      tree.group.rotation.y = local() * Math.PI * 2;
      treeGroup.add(tree.group);
      trees.push(tree);
    }
  });
  root.add(treeGroup);
  return trees;
}
