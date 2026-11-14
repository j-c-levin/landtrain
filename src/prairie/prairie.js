import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PRAIRIE, SPLIT_X, LANDMARK, ARRIVE_RADIUS, TRAIN_HALF, clamp } from '../constants.js';
import { PRAIRIE_LOOK, prairieMaterials, floraMaterials, jitterHSL } from '../look.js';
import { mulberry } from '../prng.js';
import { disposeSubtree } from '../dispose.js';
import { createGroundCover, shadeByHeight } from '../groundcover.js';
import { bigRockCluster, ridge, mesaGeometry } from './rocks.js';
import { buildLandmark } from './landmark.js';

// Umbrella thorn: a leaning wire trunk under flat pads of clump foliage.
function thornTree(rand, h, ox, oz, trunks, crowns) {
  const lean = (rand() - 0.5) * 0.5;
  const dir = rand() * Math.PI * 2;
  const top = [ox + Math.cos(dir) * lean * h, h, oz + Math.sin(dir) * lean * h];
  const limb = (x0, y0, z0, x1, y1, z1, r) => {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const g = new THREE.CylinderGeometry(r * 0.6, r, len, 5, 1, true);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()
    );
    g.applyQuaternion(q);
    g.translate(x0, y0, z0);
    trunks.push(g);
  };
  limb(ox, 0, oz, top[0], top[1], top[2], 0.07 * h);
  const pads = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < pads; i++) {
    const a = rand() * Math.PI * 2;
    const d = i === 0 ? 0 : h * (0.25 + rand() * 0.4);
    const r = h * (i === 0 ? 0.52 : 0.28 + rand() * 0.2);
    const px = top[0] + Math.cos(a) * d;
    const py = top[1] + (i === 0 ? 0.1 : -rand() * 0.22) * h;
    const pz = top[2] + Math.sin(a) * d;
    if (i > 0) limb(top[0] - (top[0] - ox) * 0.3, h * 0.7, top[2] - (top[2] - oz) * 0.3, px, py, pz, 0.035 * h);
    const pad = new THREE.IcosahedronGeometry(r, 1);
    pad.rotateY(rand() * Math.PI);
    pad.scale(1, 0.34 + rand() * 0.12, 1);
    pad.translate(px, py, pz);
    crowns.push(pad);
  }
}

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

  // --- ground cover: wraps around the camera, so it lives outside the chunks
  const cover = createGroundCover({
    look: PRAIRIE_LOOK, seed: 5150612, clipX: [PRAIRIE.minX - 400, PRAIRIE.maxX],
  });
  root.add(cover.group);

  // --- copses (individual, so they can fade near the camera) -------------
  const trees = [];
  for (let i = 0; i < 84; i++) {
    const t = new THREE.Group();
    const trunkMat = floraMaterials.fadingTrunk(PRAIRIE_LOOK.treeTrunk);
    const leafMat = floraMaterials.fadingLeaf();
    jitterHSL(leafMat.color, rand, PRAIRIE_LOOK.treeLeaf);
    const trunks = [];
    const crowns = [];
    const n = 1 + Math.floor(rand() * rand() * 3.2);
    for (let k = 0; k < n; k++) {
      const h = 5 + rand() * 6;
      const a = rand() * Math.PI * 2;
      const d = k === 0 ? 0 : 5 + rand() * 7;
      thornTree(rand, h, Math.cos(a) * d, Math.sin(a) * d, trunks, crowns);
    }
    const trunk = new THREE.Mesh(mergeGeometries(trunks), trunkMat);
    const crown = new THREE.Mesh(shadeByHeight(mergeGeometries(crowns), 0.62, 1.14), leafMat);
    for (const g of trunks) g.dispose();
    for (const g of crowns) g.dispose();
    trunk.castShadow = true;
    crown.castShadow = true;
    t.add(trunk, crown);
    t.position.set(
      PRAIRIE.minX + rand() * (PRAIRIE.maxX - PRAIRIE.minX),
      0,
      PRAIRIE.minZ + rand() * (PRAIRIE.maxZ - PRAIRIE.minZ)
    );
    if (Math.hypot(t.position.x - LANDMARK.x, t.position.z - LANDMARK.z) < 110) {
      t.position.x -= 200;
    }
    // keep the opening stretch of track clear of trunks
    if (Math.abs(t.position.z) < 16 && t.position.x < 160) t.position.z += 34;
    chunkFor(t.position.x).add(t);
    trees.push({ group: t, mats: [trunkMat, leafMat] });
  }

  // --- backscene mesas ---------------------------------------------------
  const mesaMat = prairieMaterials.hill();
  const mesaMatEast = prairieMaterials.hill();
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const d = 1050 + rand() * 760;
    let cx = (PRAIRIE.minX + PRAIRIE.maxX) / 2 + Math.cos(a) * d * 1.4;
    let cz = Math.sin(a) * d;
    const s = 110 + rand() * 230;
    const height = 60 + rand() * 120;
    // a backscene piece never stands on the playable table
    const zEdge = PRAIRIE.maxZ + 80;
    if (Math.abs(cz) < zEdge) cx = Math.min(cx, PRAIRIE.minX - 80 - s);
    else if (Math.abs(cz) - s < zEdge) cz = Math.sign(cz) * (zEdge + s);
    const geo = mesaGeometry(rand, s, height);
    // keep the red mesas west of the grassland border
    if (cx + s > PRAIRIE.maxX) {
      geo.dispose();
      continue;
    }
    const west = cx < SPLIT_X;
    const hill = new THREE.Mesh(geo, west ? mesaMat : mesaMatEast);
    hill.position.set(cx, -4, cz);
    hill.rotation.y = rand() * Math.PI;
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
    cover.dispose();
    disposeSubtree(root);
    scene.remove(root);
  }

  // Prunes western obstacles in place so the caller's reference stays valid.
  function disposeBefore() {
    disposeSubtree(chunkBefore);
    root.remove(chunkBefore);
    for (let i = trees.length - 1; i >= 0; i--) {
      if (trees[i].group.parent === chunkBefore) trees.splice(i, 1);
    }
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
    cover,
    dispose,
    disposeBefore,
    landmarkPos: { x: LANDMARK.x, z: LANDMARK.z },
    arriveRadius: ARRIVE_RADIUS,
    start: { x: TRAIN_HALF, z: 0, heading: 0 },
    update(_dt, time, trainPos, cameraPos, camera, heading = 0) {
      if (camera) cover.update(time, camera, trainPos, heading);
      for (const t of trees) {
        const d = Math.hypot(t.group.position.x - cameraPos.x, t.group.position.z - cameraPos.z);
        const o = clamp((d - 12) / 16, 0.08, 1);
        for (const m of t.mats) m.opacity = o;
      }
    },
  };
}
