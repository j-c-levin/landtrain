import { CAR_CENTERS } from '../constants.js';
import { box, profiledBox, curvedRoof, instancedDetails } from './parts.js';
import { buildLivingInterior } from './interiors.js';
import { Plant } from './plant.js';
import { exteriorKit } from './interior-kit.js';
import * as THREE from 'three';
import { getLookTier } from '../look.js';

export function buildLiving(train, g) {
  const M = train.materials;
  const result = buildLivingInterior(g, M, {
    createPlant: (x, y, z, scale, kind) => new Plant(g, M, train.geometry, x, y, z, scale, kind),
  });
  train.plantPots = result.plantPots;
  train.tuck(g.getObjectByName('living-interior'));
  for (const plant of result.plantPots) train.tuck(plant.group);
  train.wateringCan = result.can;
  train.chairX = CAR_CENTERS[2] - 3.6;
  const sheet = train.weathered(M.roofGreen);
  curvedRoof(16.1, 6.1, 0.65, sheet, train.fadingMat('car2', sheet), -0.65, 5.05, g, { soot: [-5.4, -1.55, 0.9] });
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
  const fascia = train.weathered(M.woodDark);
  curvedRoof(0.2, 4.55, 0.15, fascia, train.fadingMat('car2', fascia), -8.55, 4.91, g);
  const lantern = new THREE.Group();
  lantern.name = 'veranda-lantern';
  lantern.position.set(-7.05, 4.1, 2.5);
  profiledBox(0.28, 0.42, 0.28, 0.04, train.fadingMat('car2', M.glow), 0, -0.65, 0, lantern);
  instancedDetails([[0, -0.41, 0, 0.38, 0.08, 0.38], [0, -0.88, 0, 0.36, 0.08, 0.36], [0, -0.2, 0, 0.045, 0.4, 0.045]],
    train.geometry.detail, train.fadingMat('car2', M.iron), lantern);
  g.add(lantern);
  train.swingers.push({ object: lantern, rate: 2.3, phase: 0.4, reach: 0.1 });
  const seams = [];
  for (let x = -7.8; x < 7.3; x += 2.2) seams.push([x, 5.06, -0.6, 0.04, 0.02, 0.55]);
  instancedDetails(seams, train.geometry.detail, M.sage, g);
  buildRoofFurniture(train, g);
}

// Duckboards down the walking line; the stovepipe, luggage and vents keep to the far side.
function buildRoofFurniture(train, g) {
  const M = train.materials;
  const fine = getLookTier() !== 'low';
  if (fine) {
    const slats = [];
    for (let x = -8.1; x < 6.9; x += 0.5) slats.push([x, 5.068, 0.35, 0.05, 0.012, 0.98]);
    instancedDetails(slats, train.geometry.detail, M.wood, g);
  }

  const k = exteriorKit(g, 'living-roof');
  const { block, round } = k;
  block(15.3, 0.03, 1.0, M.woodDark, -0.65, 5.05, 0.35);

  round(0.21, 0.1, 0.21, M.iron, -5.4, 5.03, -1.55);
  round(0.12, 1.3, 0.12, M.iron, -5.4, 5.68, -1.55);
  if (fine) {
    round(0.15, 0.07, 0.15, M.brass, -5.4, 5.95, -1.55);
    round(0.025, 0.2, 0.025, M.iron, -5.4, 6.4, -1.55);
  }
  k.mesh(new THREE.ConeGeometry(0.3, 0.2, 14), M.iron, -5.4, 6.52, -1.55);

  if (fine) {
    for (const x of [-1.95, 2.35]) {
      for (const z of [-2.1, -1.05]) round(0.03, 0.34, 0.03, M.brass, x, 5.17, z);
      block(0.035, 0.035, 1.05, M.brass, x, 5.34, -1.575);
    }
    for (const z of [-2.1, -1.05]) block(4.3, 0.035, 0.035, M.brass, 0.2, 5.34, z);
  }
  block(1.5, 0.6, 0.86, M.woodDark, -0.95, 5.32, -1.58);
  block(1.54, 0.05, 0.9, M.wood, -0.95, 5.5, -1.58);
  for (const x of [-1.4, -0.5]) block(0.1, 0.63, 0.89, M.wine, x, 5.325, -1.58);
  block(0.2, 0.12, 0.03, M.brass, -0.95, 5.4, -1.14);
  block(1.0, 0.34, 0.7, M.teal, 0.72, 5.2, -1.6).rotation.y = 0.1;
  block(0.82, 0.26, 0.56, M.hull, 0.68, 5.5, -1.6).rotation.y = -0.18;
  block(0.16, 0.05, 0.03, M.brass, 0.68, 5.5, -1.31).rotation.y = -0.18;
  round(0.22, 1.0, 0.22, M.linen, 1.8, 5.24, -1.57).rotation.x = Math.PI / 2;
  if (fine) for (const z of [-1.85, -1.3]) round(0.235, 0.09, 0.235, M.wine, 1.8, 5.24, z).rotation.x = Math.PI / 2;

  round(0.13, 0.24, 0.13, M.iron, 3.8, 5.12, -1.5);
  const cap = k.mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.brass, 3.8, 5.22, -1.5);
  cap.scale.y = 0.6;
  round(0.16, 0.3, 0.16, M.iron, 6.0, 5.15, -1.5);
  const roofKit = k.finish();
  if (!fine) roofKit.traverse((object) => { object.castShadow = false; });

  const cowl = new THREE.Group();
  cowl.name = 'roof-cowl';
  cowl.position.set(6.0, 5.48, -1.5);
  const fins = [];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    fins.push([Math.cos(a) * 0.23, 0, Math.sin(a) * 0.23, 0.035, 0.32, 0.13, 0, -a + 0.5, 0]);
  }
  instancedDetails(fins, train.geometry.detail, M.copper, cowl, true);
  instancedDetails([[0, 0.19, 0, 0.29, 0.05, 0.29], [0, -0.17, 0, 0.29, 0.04, 0.29]], train.geometry.drum, M.brass, cowl);
  g.add(cowl);
  train.spinners.push({ object: cowl, idle: 0.5, rate: 0.7 });
}
