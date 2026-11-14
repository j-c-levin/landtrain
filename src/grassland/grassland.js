import * as THREE from 'three';
import { GRASSLAND, clamp } from '../constants.js';
import { GRASSLAND_LOOK, grasslandMaterials } from '../look.js';
import { createGroundCover, coverMask } from '../groundcover.js';
import { mulberry } from '../prng.js';
import { disposeSubtree } from '../dispose.js';
import { GRASS_LANDMARK, GRASS_ARRIVE_RADIUS, xMin, xSpan, zMin, zSpan, onWater } from './layout.js';
import { buildGround, buildHills } from './terrain.js';
import { buildWillows } from './flora.js';
import { buildRivers } from './rivers.js';
import { buildMoat } from './moat.js';
import { mossyBoulders, buildKnollBoulders } from './boulders.js';
import { buildGrassLandmark } from './landmark.js';
import { buildIsland, buildPetals } from './island.js';
import { WATER_TIME } from './water.js';

const CLOSE_UP_CEILING = 150;

// The eastern region of the seamless world. It shares ONE sky, sun and haze
// with the prairie: it creates no directional light and never touches scene.fog.
// The builders below draw from one seeded stream — their ORDER is the world.
export function createGrassland(scene) {
  const rand = mulberry(20260616);
  const obstacles = [];

  const root = new THREE.Group();
  scene.add(root);

  const randX = () => xMin + rand() * xSpan;
  const randZ = () => zMin + rand() * zSpan;
  const randClearXZ = () => {
    let x = randX(), z = randZ(), n = 0;
    while (onWater(x, z) && ++n < 10) { x = randX(); z = randZ(); }
    return { x, z };
  };
  const ctx = { root, rand, obstacles, randX, randZ, randClearXZ };

  buildGround(root);

  const mask = coverMask(
    { minX: GRASSLAND.minX, maxX: GRASSLAND.maxX + 400, minZ: GRASSLAND.minZ - 400, maxZ: GRASSLAND.maxZ + 400 },
    onWater
  );
  const cover = createGroundCover({
    look: GRASSLAND_LOOK, seed: 5150616, clipX: [GRASSLAND.minX, GRASSLAND.maxX + 400], mask,
  });
  root.add(cover.group);

  const bridgeGlowMat = grasslandMaterials.causewayGlow();
  buildRivers(ctx, bridgeGlowMat);
  buildMoat(ctx, bridgeGlowMat);

  const trees = buildWillows(ctx);
  buildHills(ctx);

  // Between adjacent rivers, clear of the bridge lanes (A ~z+156, B ~z-296, C ~z+62).
  mossyBoulders(rand, xMin + 800, -180, 46, root, obstacles);
  mossyBoulders(rand, xMin + 1580, 380, 50, root, obstacles);

  const landmark = buildGrassLandmark(root);
  buildKnollBoulders(ctx);
  buildIsland(root);
  const petals = buildPetals(root, scene);

  const closeUps = [];
  root.traverse((o) => { if (o.userData.closeUp) closeUps.push(o); });

  function dispose() {
    cover.dispose();
    disposeSubtree(root);
    scene.remove(root);
  }

  return {
    root,
    cover,
    dispose,
    obstacles,
    landmark,
    landmarkPos: { x: GRASS_LANDMARK.x, z: GRASS_LANDMARK.z },
    arriveRadius: GRASS_ARRIVE_RADIUS,
    update(_dt, time, trainPos, cameraPos, camera, heading = 0) {
      if (camera) {
        cover.update(time, camera, trainPos, heading);
        petals.update(time, camera);
      }
      WATER_TIME.value = time;
      const near = cameraPos.y < CLOSE_UP_CEILING;
      for (const o of closeUps) o.visible = near;

      for (const t of trees) {
        const d = Math.hypot(t.group.position.x - cameraPos.x, t.group.position.z - cameraPos.z);
        const o = clamp((d - 12) / 16, 0.08, 1);
        for (const m of t.mats) m.opacity = o;
      }
    },
  };
}
