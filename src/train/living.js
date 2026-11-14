import { CAR_CENTERS } from '../constants.js';
import { box, profiledBox, curvedRoof, instancedDetails } from './parts.js';
import { buildLivingInterior } from './interiors.js';
import { Plant } from './plant.js';

export function buildLiving(train, g) {
  const M = train.materials;
  const result = buildLivingInterior(g, M, {
    createPlant: (x, y, z, scale, kind) => new Plant(g, M, train.geometry, x, y, z, scale, kind),
  });
  train.plantPots = result.plantPots;
  train.wateringCan = result.can;
  train.chairX = CAR_CENTERS[2] - 3.6;
  curvedRoof(16.1, 6.1, 0.65, M.roofGreen, train.fadingMat('car2', M.roofGreen), -0.65, 5.05, g);
  profiledBox(1.9, 0.24, 4.9, 0.08, M.wood, -7.8, 1.66, 0, g);
  for (const side of [-1, 1]) {
    const material = (source) => side > 0 ? train.fadingMat('car2', source) : source;
    const timber = [[-0.65, 4.39, side * 2.92, 16.2, 0.16, 0.18]];
    for (const x of [-8.55, -6.9]) {
      timber.push([x, 3.27, side * 2.25, 0.19, 2.98, 0.19]);
      timber.push([x + (x < -8 ? 0.22 : -0.22), 4.55, side * 2.25, 0.13, 0.68, 0.13, 0, 0, x < -8 ? -0.7 : 0.7]);
    }
    timber.push([-7.75, 2.68, side * 2.25, 1.8, 0.15, 0.22]);
    for (const x of [-8.3, -7.9, -7.5, -7.1]) timber.push([x, 2.21, side * 2.25, 0.07, 0.8, 0.07]);
    instancedDetails(timber, train.geometry.detail, material(M.woodDark), g, true);
    const eaveBrackets = [];
    for (const x of [-5.9, -2.6, 2.1, 6.3]) eaveBrackets.push([x, 4.4, side * 2.57, 0.12, 0.62, 0.12, side * 0.85]);
    instancedDetails(eaveBrackets, train.geometry.detail, material(M.wood), g, true);
    const awning = box(3.4, 0.1, 0.78, material(M.cream), 3.9, 4.13, side * 2.75, g);
    awning.rotation.x = side * 0.18;
    const stripes = [];
    for (let x = 2.4; x <= 5.4; x += 0.6) stripes.push([x, 4.19, side * 2.75, 0.22, 0.025, 0.78, side * 0.18]);
    instancedDetails(stripes, train.geometry.detail, material(M.sage), g);
    profiledBox(2.7, 0.32, 0.45, 0.08, material(M.wood), 3.9, 2.57, side * 2.63, g);
    const leaves = [];
    for (let i = 0; i < 7; i++) leaves.push([2.75 + i * 0.38, 2.83 + (i % 2) * 0.06, side * 2.64, 0.7, 0.9, 0.75]);
    instancedDetails(leaves, train.geometry.leaf, material(M.foliage), g);
  }
  box(0.16, 0.15, 2.3, M.woodDark, -8.55, 2.68, -1.05, g);
  box(0.16, 0.15, 0.7, train.fadingMat('car2', M.woodDark), -8.55, 2.68, 1.95, g);
  curvedRoof(0.2, 4.55, 0.15, M.woodDark, train.fadingMat('car2', M.woodDark), -8.55, 4.91, g);
  const lanternMat = train.fadingMat('car2', M.iron);
  profiledBox(0.28, 0.42, 0.28, 0.04, train.fadingMat('car2', M.glow), -7.05, 3.45, 2.5, g);
  instancedDetails([[-7.05, 3.69, 2.5, 0.38, 0.08, 0.38], [-7.05, 3.22, 2.5, 0.36, 0.08, 0.36], [-7.05, 3.9, 2.5, 0.045, 0.4, 0.045]], train.geometry.detail, lanternMat, g);
  const seams = [];
  for (let x = -7.8; x < 7.3; x += 2.2) seams.push([x, 5.06, -0.6, 0.04, 0.02, 0.55]);
  instancedDetails(seams, train.geometry.detail, M.sage, g);
}
