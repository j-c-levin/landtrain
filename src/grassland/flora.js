import * as THREE from 'three';
import { GRASSLAND_LOOK, floraMaterials, jitterHSL } from '../look.js';
import { GRASS_LANDMARK, onWater } from './layout.js';

function flowerColor(c, rand) {
  const F = GRASSLAND_LOOK.flower;
  const pick = rand();
  const hue = pick < 0.34 ? F.hues[0] : pick < 0.67 ? F.hues[1] : F.hues[2];
  jitterHSL(c, rand, { ...F, h: hue });
}

// Tufts, bushes, hummocks and wildflowers across the plain, then the island
// dressing around the knoll.
export function scatterFlora({ root, rand, randClearXZ }) {
  const dummy = new THREE.Object3D();

  function scatter(geo, mat, count, place) {
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      place(dummy, color, i);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, color);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    root.add(inst);
    return inst;
  }

  const randPos = (o) => {
    const { x, z } = randClearXZ();
    o.position.set(x, 0, z);
  };

  // grass tufts — fresh green (hue ~0.28) instead of the prairie's olive ~0.13
  scatter(
    new THREE.ConeGeometry(0.5, 1.2, 5),
    floraMaterials.tuft(),
    2000,
    (o, c) => {
      randPos(o);
      const s = 0.6 + rand() * 1.2;
      o.scale.set(s, s * (0.8 + rand() * 0.9), s);
      o.position.y = (o.scale.y * 1.2) / 2 - 0.05;
      o.rotation.y = rand() * Math.PI;
      jitterHSL(c, rand, GRASSLAND_LOOK.tuft);
    }
  );

  // bushes — green
  scatter(
    new THREE.IcosahedronGeometry(0.9, 1),
    floraMaterials.clump(),
    360,
    (o, c) => {
      randPos(o);
      const s = 0.9 + rand() * 1.7;
      o.scale.set(s, s * 0.65, s);
      o.position.y = s * 0.4;
      o.rotation.y = rand() * Math.PI;
      jitterHSL(c, rand, GRASSLAND_LOOK.bush);
    }
  );

  // grassy hummocks — low green-tinted domes (replace the desert stones)
  scatter(
    new THREE.SphereGeometry(1, 8, 6),
    floraMaterials.clump(),
    220,
    (o, c) => {
      randPos(o);
      const s = 1.2 + rand() * 2.6;
      o.scale.set(s, s * (0.32 + rand() * 0.2), s);
      o.position.y = o.scale.y * 0.5 - 0.2;
      o.rotation.y = rand() * Math.PI;
      jitterHSL(c, rand, GRASSLAND_LOOK.hummock);
    }
  );

  // wildflowers — brighter and denser than the prairie
  scatter(
    new THREE.SphereGeometry(0.16, 6, 5),
    floraMaterials.flower(),
    700,
    (o, c) => {
      randPos(o);
      o.scale.setScalar(0.9 + rand() * 1.3);
      o.position.y = 0.35;
      flowerColor(c, rand);
    }
  );

  // --- island dressing (the disc under the knoll was bare) ---------------
  // Placements sit within r 70-140 of the landmark — the annulus outside the
  // knoll's stepped foot + boulder ring (r<70 stays clear) and inside the
  // island's edge (r=150). Same geometries/palettes as the main tuft/bush/
  // flower scatter above, just re-placed with a
  // polar (angle, radius) sampler centred on GRASS_LANDMARK instead of
  // randClearXZ's region-wide rectangle.
  const islandPos = (o, rMin, rMax) => {
    const a = rand() * Math.PI * 2;
    const r = rMin + rand() * (rMax - rMin);
    o.position.set(GRASS_LANDMARK.x + Math.cos(a) * r, 0, GRASS_LANDMARK.z + Math.sin(a) * r);
  };

  scatter(
    new THREE.ConeGeometry(0.5, 1.2, 5),
    floraMaterials.tuft(),
    60,
    (o, c) => {
      islandPos(o, 70, 140);
      const s = 0.6 + rand() * 1.2;
      o.scale.set(s, s * (0.8 + rand() * 0.9), s);
      o.position.y = (o.scale.y * 1.2) / 2 - 0.05;
      o.rotation.y = rand() * Math.PI;
      jitterHSL(c, rand, GRASSLAND_LOOK.tuft);
    }
  );

  scatter(
    new THREE.IcosahedronGeometry(0.9, 1),
    floraMaterials.clump(),
    6,
    (o, c) => {
      islandPos(o, 70, 140);
      const s = 0.9 + rand() * 1.7;
      o.scale.set(s, s * 0.65, s);
      o.position.y = s * 0.4;
      o.rotation.y = rand() * Math.PI;
      jitterHSL(c, rand, GRASSLAND_LOOK.bush);
    }
  );

  scatter(
    new THREE.SphereGeometry(0.16, 6, 5),
    floraMaterials.flower(),
    20,
    (o, c) => {
      islandPos(o, 70, 140);
      o.scale.setScalar(0.9 + rand() * 1.3);
      o.position.y = 0.35;
      flowerColor(c, rand);
    }
  );

  // flower ring — a denser wildflower band right at r 66-80, framing the
  // knoll's boulder ring from just outside it
  scatter(
    new THREE.SphereGeometry(0.16, 6, 5),
    floraMaterials.flower(),
    40,
    (o, c) => {
      islandPos(o, 66, 80);
      o.scale.setScalar(0.9 + rand() * 1.3);
      o.position.y = 0.35;
      flowerColor(c, rand);
    }
  );
}

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
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, h, 6), trunkMat);
    trunk.position.y = h / 2;
    // drooping willow crown: stretched downward, wider than tall at the skirt.
    // Lowered to h*0.9 so the crown sits over a bigger, lower skirt with no
    // air gap — a droop-to-the-grass teardrop silhouette at a distance.
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.5, 1), leafMat);
    crown.position.y = h * 0.9;
    crown.scale.set(1.25, 1.7, 1.25); // vertically stretched (drooping)
    // Skirt enlarged and lowered so its bottom edge nears the ground (grounded
    // look) rather than floating above it.
    const skirt = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.45, 1), leafMat);
    skirt.position.y = h * 0.55;
    skirt.scale.set(1.6, 1.35, 1.6);
    t.add(trunk, crown, skirt);
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
