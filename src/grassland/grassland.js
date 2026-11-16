import * as THREE from 'three';
import { GRASSLAND, clamp } from '../constants.js';
import { CHART, GRASSLAND_LOOK, grasslandMaterials, ownInstancedDepth, settleFade } from '../look.js';
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
import { NIGHT, nightTame, nearCullSprite } from './fade.js';

const CLOSE_UP_CEILING = 150;

// Shares ONE sky, sun and haze with the prairie. The builders draw from one seeded stream: their ORDER is the world.
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
  const tamed = new Set();
  cover.group.traverse((o) => { if (o.material) tamed.add(o.material); });
  for (const mat of tamed) nightTame(mat);

  const bridgeGlowMat = nearCullSprite(grasslandMaterials.causewayGlow());
  buildRivers(ctx, bridgeGlowMat);
  const moat = buildMoat(ctx, bridgeGlowMat);

  const trees = buildWillows(ctx);
  buildHills(ctx);

  // Between adjacent rivers, clear of the bridge lanes (A ~z+156, B ~z-296, C ~z+62).
  mossyBoulders(rand, xMin + 800, -180, 46, root, obstacles);
  mossyBoulders(rand, xMin + 1580, 380, 50, root, obstacles);

  const landmark = buildGrassLandmark(root);
  buildKnollBoulders(ctx);
  const island = buildIsland(root);
  const key = scene.children.find((o) => o.isDirectionalLight && o.castShadow);
  const petals = buildPetals(root, scene);

  ownInstancedDepth(root);

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
      const chart = CHART.uChart.value;
      const night = key ? clamp((key.color.b - key.color.r) * 2, 0, 1) : 0;
      NIGHT.value = night * (1 - chart);
      moat.glowMat.opacity = 1 - chart;
      island.userData.lampPools.opacity = (0.04 + 0.5 * night) * (1 - chart);
      landmark.userData.setChart(chart);
      landmark.userData.setLight(night);
      const near = cameraPos.y < CLOSE_UP_CEILING;
      for (const o of closeUps) o.visible = near;

      for (const t of trees) {
        const d = Math.sqrt((t.group.position.x - cameraPos.x) ** 2 + (t.group.position.z - cameraPos.z) ** 2);
        const o = clamp((d - 12) / 16, 0.08, 1);
        for (const m of t.mats) settleFade(m, o);
      }
    },
  };
}
