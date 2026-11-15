import * as THREE from 'three';
import { PRAIRIE, SPLIT_X, LANDMARK, ARRIVE_RADIUS, TRAIN_HALF, clamp } from '../constants.js';
import { PRAIRIE_LOOK, prairieMaterials } from '../look.js';
import { mulberry } from '../prng.js';
import { disposeSubtree } from '../dispose.js';
import { createGroundCover } from '../groundcover.js';
import { bigRockCluster, ridge, mesaGeometry } from './rocks.js';
import { buildLandmark, MESA_RADIUS } from './landmark.js';
import { regionMap } from './regions.js';
import { PRAIRIE_KINDS, extendPrairieCover } from './cover.js';
import { copse, plantGroves } from './flora.js';
import { buildDunes, buildRanges } from './backscene.js';

const ROCKS = [
  [350, 70, 40], [565, -150, 46], [790, 95, 42], [1010, -55, 52], [1255, 170, 44], [1460, -185, 50], [1660, 45, 46],
];

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

  const region = regionMap([
    ...ROCKS.map(([x, z, r]) => ({ x, z, r: r * 0.8 })),
    { x: LANDMARK.x, z: LANDMARK.z, r: MESA_RADIUS * 0.94 },
  ]);

  // --- ground ----------------------------------------------------------
  // Sits a hair below y=0 and stops AT the seam (PRAIRIE.maxX): the grassland
  // owns all ground east of it, and an overrunning opaque plane would hide the
  // grassland's sunken river channels.
  const GROUND_Y = -0.05;
  const groundMargin = 1300;
  const groundDepth = PRAIRIE.maxZ - PRAIRIE.minZ + 2600;

  const westW = SPLIT_X - PRAIRIE.minX + groundMargin + 1;
  const groundWest = new THREE.Mesh(new THREE.PlaneGeometry(westW, groundDepth), prairieMaterials.ground(region));
  groundWest.rotation.x = -Math.PI / 2;
  groundWest.position.set((PRAIRIE.minX - groundMargin + SPLIT_X) / 2, GROUND_Y, 0);
  groundWest.receiveShadow = true;
  chunkBefore.add(groundWest);

  const eastW = PRAIRIE.maxX - SPLIT_X + 1;
  const groundEast = new THREE.Mesh(new THREE.PlaneGeometry(eastW, groundDepth), prairieMaterials.ground(region));
  groundEast.rotation.x = -Math.PI / 2;
  groundEast.position.set((SPLIT_X + PRAIRIE.maxX + 1) / 2, GROUND_Y, 0);
  groundEast.receiveShadow = true;
  chunkAfter.add(groundEast);

  // Until the grassland is built the land must not stop dead at the seam: a sunk apron runs on under where it will lie.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(groundMargin, groundDepth), prairieMaterials.ground(region));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(PRAIRIE.maxX + groundMargin / 2 - 1, -10, 0);
  chunkAfter.add(apron);

  // --- ground cover: wraps around the camera, so it lives outside the chunks
  const cover = createGroundCover({
    look: PRAIRIE_LOOK, seed: 5150612, clipX: [PRAIRIE.minX - 400, PRAIRIE.maxX], mask: region,
    regions: {
      lush: PRAIRIE_LOOK.coverLush, parched: PRAIRIE_LOOK.coverParched, bare: PRAIRIE_LOOK.coverBare, kinds: PRAIRIE_KINDS,
    },
    gust: { dir: [0.94, 0.342], strength: 7 },
    extend: extendPrairieCover,
  });
  root.add(cover.group);

  // --- copses (individual, so they can fade near the camera) -------------
  const trees = [];
  const plant = (tree) => {
    chunkFor(tree.group.position.x).add(tree.group);
    trees.push(tree);
  };
  for (let i = 0; i < 84; i++) {
    const tree = copse(rand);
    const t = tree.group;
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
    plant(tree);
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
  buildDunes(chunkFor);
  buildRanges(chunkAfter);

  // --- obstacle layout: scattered rocks, then the two ridge walls ---------
  for (const [x, z, r] of ROCKS) bigRockCluster(rand, x, z, r, chunkBefore, obstacles);

  // Ridge A blocks the south + centre (pass to the north),
  // Ridge B then blocks the north + centre (pass back south): a gentle S.
  ridge(rand, 1900, -760, 1900, 130, chunkAfter, obstacles);
  ridge(rand, 2130, 760, 2130, -50, chunkAfter, obstacles);

  plantGroves(obstacles, plant);

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
    // lamps: 0 by day, 1 once the lanterns should be burning
    update(_dt, time, trainPos, cameraPos, camera, heading = 0, lamps = 0) {
      if (camera) cover.update(time, camera, trainPos, heading);
      landmark.userData.tick(time, cameraPos, lamps);
      for (const t of trees) {
        const d = Math.hypot(t.group.position.x - cameraPos.x, t.group.position.z - cameraPos.z);
        const o = clamp((d - 14) / 16, 0, 1);
        t.group.visible = o > 0.02;
        for (const m of t.mats) m.opacity = o;
      }
    },
  };
}
