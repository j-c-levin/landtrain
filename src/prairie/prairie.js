import * as THREE from 'three';
import { PRAIRIE, SPLIT_X, LANDMARK, ARRIVE_RADIUS, TRAIN_HALF, clamp } from '../constants.js';
import { PRAIRIE_LOOK, prairieMaterials, floraMaterials, jitterHSL } from '../look.js';
import { mulberry } from '../prng.js';
import { disposeSubtree } from '../dispose.js';
import { bigRockCluster, ridge } from './rocks.js';
import { buildLandmark } from './landmark.js';

export function createPrairie(scene) {
  const rand = mulberry(20260612);
  const obstacles = [];

  const root = new THREE.Group();
  scene.add(root);

  // The western chunk (x < SPLIT_X) is unloaded by disposeBefore() once the
  // train passes the mountains; the eastern chunk stays as a backtrack barrier.
  const chunkBefore = new THREE.Group();
  const chunkAfter = new THREE.Group();
  root.add(chunkBefore, chunkAfter);
  const chunkFor = (x) => (x < SPLIT_X ? chunkBefore : chunkAfter);

  // --- ground ----------------------------------------------------------
  // Sits a hair below y=0 and stops AT the seam (PRAIRIE.maxX): the grassland
  // owns all ground east of it, and an overrunning opaque plane would hide the
  // grassland's sunken river channels.
  const GROUND_Y = -0.05;
  const groundMargin = 1300;
  const groundDepth = PRAIRIE.maxZ - PRAIRIE.minZ + 2600;

  const westW = SPLIT_X - PRAIRIE.minX + groundMargin + 1;
  const groundWest = new THREE.Mesh(new THREE.PlaneGeometry(westW, groundDepth), prairieMaterials.ground());
  groundWest.rotation.x = -Math.PI / 2;
  groundWest.position.set((PRAIRIE.minX - groundMargin + SPLIT_X) / 2, GROUND_Y, 0);
  groundWest.receiveShadow = true;
  chunkBefore.add(groundWest);

  const eastW = PRAIRIE.maxX - SPLIT_X + 1;
  const groundEast = new THREE.Mesh(new THREE.PlaneGeometry(eastW, groundDepth), prairieMaterials.ground());
  groundEast.rotation.x = -Math.PI / 2;
  groundEast.position.set((SPLIT_X + PRAIRIE.maxX + 1) / 2, GROUND_Y, 0);
  groundEast.receiveShadow = true;
  chunkAfter.add(groundEast);

  // Meadow patches. Each owns its geometry so a west patch can be freed alone.
  const patchColors = PRAIRIE_LOOK.patches;
  for (let i = 0; i < 150; i++) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      floraMaterials.meadowPatch(patchColors[Math.floor(rand() * patchColors.length)], 0.4 + rand() * 0.3)
    );
    m.rotation.x = -Math.PI / 2;
    const s = 26 + rand() * 90;
    m.scale.set(s, s * (0.6 + rand() * 0.7), 1);
    m.rotation.z = rand() * Math.PI;
    m.position.set(
      PRAIRIE.minX + rand() * (PRAIRIE.maxX - PRAIRIE.minX),
      0.04,
      PRAIRIE.minZ + rand() * (PRAIRIE.maxZ - PRAIRIE.minZ)
    );
    chunkFor(m.position.x).add(m);
  }

  // --- instanced scatter ------------------------------------------------
  const dummy = new THREE.Object3D();

  // Instances are bucketed by x into west / east meshes with their own
  // geometry+material clones so disposeBefore() can free the west bucket.
  function scatter(geo, mat, count, place) {
    const color = new THREE.Color();
    const before = [];
    const after = [];
    for (let i = 0; i < count; i++) {
      place(dummy, color, i);
      dummy.updateMatrix();
      const entry = { matrix: dummy.matrix.clone(), color: color.clone() };
      (dummy.position.x < SPLIT_X ? before : after).push(entry);
    }

    const buildBucket = (entries, parent, g, m) => {
      const inst = new THREE.InstancedMesh(g, m, entries.length);
      for (let i = 0; i < entries.length; i++) {
        inst.setMatrixAt(i, entries[i].matrix);
        inst.setColorAt(i, entries[i].color);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      parent.add(inst);
      return inst;
    };

    buildBucket(before, chunkBefore, geo, mat);
    buildBucket(after, chunkAfter, geo.clone(), mat.clone());
  }

  const randPos = (o) => {
    o.position.set(
      PRAIRIE.minX + rand() * (PRAIRIE.maxX - PRAIRIE.minX),
      0,
      PRAIRIE.minZ + rand() * (PRAIRIE.maxZ - PRAIRIE.minZ)
    );
  };

  scatter(new THREE.ConeGeometry(0.5, 1.2, 5), floraMaterials.tuft(), 1700, (o, c) => {
    randPos(o);
    const s = 0.6 + rand() * 1.2;
    o.scale.set(s, s * (0.8 + rand() * 0.9), s);
    o.position.y = (o.scale.y * 1.2) / 2 - 0.05;
    o.rotation.y = rand() * Math.PI;
    jitterHSL(c, rand, PRAIRIE_LOOK.tuft);
  });

  scatter(new THREE.IcosahedronGeometry(0.9, 1), floraMaterials.clump(), 320, (o, c) => {
    randPos(o);
    const s = 0.9 + rand() * 1.7;
    o.scale.set(s, s * 0.65, s);
    o.position.y = s * 0.4;
    o.rotation.y = rand() * Math.PI;
    jitterHSL(c, rand, PRAIRIE_LOOK.bush);
  });

  scatter(new THREE.DodecahedronGeometry(0.55, 0), floraMaterials.clump(), 240, (o, c) => {
    randPos(o);
    const s = 0.5 + rand() * 1.4;
    o.scale.setScalar(s);
    o.position.y = s * 0.28;
    o.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
    jitterHSL(c, rand, PRAIRIE_LOOK.stone);
  });

  scatter(new THREE.SphereGeometry(0.16, 6, 5), floraMaterials.flower(), 420, (o, c) => {
    randPos(o);
    o.scale.setScalar(0.8 + rand() * 1.2);
    o.position.y = 0.35;
    const F = PRAIRIE_LOOK.flower;
    jitterHSL(c, rand, { ...F, h: rand() > 0.5 ? F.hues[0] : F.hues[1] });
  });

  // --- trees (individual, so they can fade near the camera) -------------
  const trees = [];
  for (let i = 0; i < 64; i++) {
    const t = new THREE.Group();
    const h = 4 + rand() * 5;
    const trunkMat = floraMaterials.fadingTrunk(PRAIRIE_LOOK.treeTrunk);
    const leafMat = floraMaterials.fadingLeaf();
    jitterHSL(leafMat.color, rand, PRAIRIE_LOOK.treeLeaf);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, h, 6), trunkMat);
    trunk.position.y = h / 2;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.55, 1), leafMat);
    crown.position.y = h + h * 0.2;
    crown.scale.y = 1.15;
    t.add(trunk, crown);
    t.position.set(
      PRAIRIE.minX + rand() * (PRAIRIE.maxX - PRAIRIE.minX),
      0,
      PRAIRIE.minZ + rand() * (PRAIRIE.maxZ - PRAIRIE.minZ)
    );
    if (Math.hypot(t.position.x - LANDMARK.x, t.position.z - LANDMARK.z) < 110) {
      t.position.x -= 200;
    }
    chunkFor(t.position.x).add(t);
    trees.push({ group: t, mats: [trunkMat, leafMat] });
  }

  // --- distant hills -----------------------------------------------------
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = 1150 + rand() * 700;
    const cx = (PRAIRIE.minX + PRAIRIE.maxX) / 2 + Math.cos(a) * d * 1.4;
    const cz = Math.sin(a) * d;
    const s = 120 + rand() * 240;
    // keep the tan hills west of the grassland border
    if (cx + s > PRAIRIE.maxX) continue;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 7), prairieMaterials.hill());
    hill.scale.y = 0.22 + rand() * 0.16;
    hill.position.set(cx, -6, cz);
    chunkFor(cx).add(hill);
  }

  // --- obstacle layout: scattered rocks, then the two ridge walls ---------
  bigRockCluster(rand, 350, 70, 40, chunkBefore, obstacles);
  bigRockCluster(rand, 565, -150, 46, chunkBefore, obstacles);
  bigRockCluster(rand, 790, 95, 42, chunkBefore, obstacles);
  bigRockCluster(rand, 1010, -55, 52, chunkBefore, obstacles);
  bigRockCluster(rand, 1255, 170, 44, chunkBefore, obstacles);
  bigRockCluster(rand, 1460, -185, 50, chunkBefore, obstacles);
  bigRockCluster(rand, 1660, 45, 46, chunkBefore, obstacles);

  // Ridge A blocks the south + centre (pass to the north),
  // Ridge B then blocks the north + centre (pass back south): a gentle S.
  ridge(rand, 1900, -760, 1900, 130, chunkAfter, obstacles);
  ridge(rand, 2130, 760, 2130, -50, chunkAfter, obstacles);

  const landmark = buildLandmark(chunkAfter);

  function dispose() {
    disposeSubtree(root);
    scene.remove(root);
  }

  // Prunes western obstacles in place so the caller's reference stays valid.
  function disposeBefore() {
    disposeSubtree(chunkBefore);
    root.remove(chunkBefore);
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      const ox = o.type === 'circle' ? o.x : Math.min(o.x1, o.x2);
      if (ox < SPLIT_X) obstacles.splice(i, 1);
    }
  }

  return {
    obstacles,
    landmark,
    root,
    dispose,
    disposeBefore,
    landmarkPos: { x: LANDMARK.x, z: LANDMARK.z },
    arriveRadius: ARRIVE_RADIUS,
    start: { x: TRAIN_HALF, z: 0, heading: 0 },
    update(_dt, _time, _trainPos, cameraPos) {
      for (const t of trees) {
        const d = Math.hypot(t.group.position.x - cameraPos.x, t.group.position.z - cameraPos.z);
        const o = clamp((d - 12) / 16, 0.08, 1);
        for (const m of t.mats) m.opacity = o;
      }
    },
  };
}
