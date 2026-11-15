import * as THREE from 'three';
import { TRAIN_LOOK, painted, getLookTier } from '../look.js';
import { box, profiledBox, curvedRoof, instancedDetails } from './parts.js';
import { cabinSides, paintedFloor } from './shell.js';
import { interiorKit, exteriorKit } from './interior-kit.js';
import { buildBunkInterior } from './interiors.js';

// Front car: cargo vestibule at deck level, raised driver's cab perched
// on the rooftop — its floor IS the roof storey, walked straight into.
export function buildFrontCar(train, g) {
  const M = train.materials;
  const bowShape = new THREE.Shape();
  bowShape.moveTo(8.2, 1.78);
  bowShape.lineTo(8.8, 2.05);
  bowShape.quadraticCurveTo(9.6, 2.8, 9.1, 4.0);
  bowShape.quadraticCurveTo(8.7, 4.9, 8.2, 5.02);
  bowShape.closePath();
  const bowGeo = new THREE.ExtrudeGeometry(bowShape, { depth: 4.05, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, steps: 1, curveSegments: 10 });
  bowGeo.translate(0, 0, -2.025);
  const bow = new THREE.Mesh(bowGeo, M.hull);
  bow.castShadow = true;
  bow.receiveShadow = true;
  g.add(bow);
  profiledBox(1.25, 0.24, 4.7, 0.1, M.wood, 7.5, 1.66, 0, g);
  profiledBox(0.38, 0.44, 4.8, 0.17, M.iron, 8.9, 1.45, 0, g);
  const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.61, 0.32, 16), M.iron);
  lampHousing.rotation.z = -Math.PI / 2;
  lampHousing.position.set(9.27, 3.75, 0);
  g.add(lampHousing);
  const headlamp = new THREE.Mesh(new THREE.SphereGeometry(0.39, 16, 10), M.headlamp);
  headlamp.scale.x = 0.35;
  headlamp.position.set(9.45, 3.75, 0);
  g.add(headlamp);
  const grille = [];
  for (let z = -1.5; z <= 1.5; z += 0.5) grille.push([9.22, 2.83, z, 0.09, 0.72, 0.12, 0, 0, 0.12]);
  // pilot: a slatted wedge under the buffer beam
  for (let z = -1.8; z <= 1.81; z += 0.45) grille.push([9.42, 0.8, z, 1.16, 0.07, 0.1, 0, 0, -Math.PI / 4]);
  grille.push([9.84, 0.38, 0, 0.1, 0.1, 4.3], [9.0, 1.22, 0, 0.1, 0.1, 4.3]);
  for (const z of [-2.1, 2.1]) grille.push([9.42, 0.38, z, 0.9, 0.09, 0.09], [9.0, 0.8, z, 0.09, 0.85, 0.09], [9.42, 0.8, z, 1.16, 0.09, 0.09, 0, 0, -Math.PI / 4]);
  instancedDetails(grille, train.geometry.detail, M.iron, g);
  const lampRing = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.05, 6, 20), M.brass);
  lampRing.rotation.y = Math.PI / 2;
  lampRing.position.set(9.44, 3.75, 0);
  g.add(lampRing);

  buildBunkInterior(g, M);
  for (const name of ['bunk-interior', 'vestibule']) train.tuck(g.getObjectByName(name));
  profiledBox(2.6, 1.05, 1.3, 0.12, painted(M.wood), -3.7, 2.305, -1.55, g);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 1.15, 12), painted(M.woodDark));
  barrel.position.set(-1.3, 2.355, -1.65);
  barrel.castShadow = true;
  g.add(barrel);

  box(12.0, 0.14, 1.275, M.wood, 2, 4.98, -1.5875, g);
  box(12.0, 0.14, 1.275, train.fadingMat('car0', M.wood), 2, 4.98, 1.5875, g);
  cabinSides(train, g, 'cab', 2.075, 12.15, 5.05, 7.61, M.cream, [[-1.65, 3.5], [4, 5.6]], 2.13, { stripe: M.hull, studs: M.brass });
  paintedFloor(train, g, 2.075, 11.9, 5.05, -1.12, 1.9);
  paintedFloor(train, g, 2.075, 11.9, 5.05, 0.96, 2.2, train.fadingMat('car0', painted(M.wood)));
  for (const side of [-1, 1]) {
    const mat = side > 0 ? train.fadingMat('cab', M.hull) : M.hull;
    profiledBox(0.26, 0.83, 2.18, 0.12, mat, 8.15, 5.465, side * 1.09, g);
    const post = box(0.18, 1.5, 0.18, side > 0 ? train.fadingMat('cab', M.woodDark) : M.woodDark, 8.06, 6.56, side * 2.05, g);
    post.rotation.z = 0.12;
  }
  box(0.23, 0.38, 4.3, M.woodDark, 7.96, 7.44, 0, g);
  box(0.18, 0.3, 4.4, M.woodDark, -4, 7.46, 0, g);
  const sheet = train.weathered(M.copper);
  curvedRoof(13.3, 5.55, 0.72, sheet, train.fadingMat('cab', sheet), 2, 7.92, g, { patina: true });
  const seams = [];
  for (const x of [-3.7, -1.2, 1.3, 3.8, 6.3]) seams.push([x, 7.935, 0, 0.045, 0.035, 1.85]);
  instancedDetails(seams, train.geometry.detail, M.hullDark, g);

  buildRoofFurniture(train, g);

  const k = interiorKit(g, 'cab-interior');
  const { block, round, cushion, pipe, ring } = k;
  cushion(4.2, 0.75, 1.43, M.teal, 4.71, 5.49, -1.27);
  cushion(4.47, 0.15, 1.58, M.wood, 4.71, 5.93, -1.24);
  for (const x of [2.96, 4.09, 5.32, 6.48]) block(0.055, 0.52, 0.035, M.wood, x, 5.51, -0.532);
  block(4.0, 0.045, 0.04, M.brass, 4.71, 5.8, -0.51);
  pipe([[2.88, 5.26, -0.39], [3.12, 5.27, -0.35], [6.25, 5.27, -0.35], [6.51, 5.44, -0.43]], 0.035, M.brass);
  const dash = interiorKit(g, 'cab-instrument-cluster');
  dash.root.position.set(5.57, 6.41, -1.05);
  dash.root.rotation.y = -0.35;
  dash.cushion(2.37, 1.05, 0.24, M.woodDark, 0, 0, 0);
  dash.cushion(2.22, 0.9, 0.05, M.iron, 0, 0, 0.137);
  train.headingNeedle = dash.dial(0.36, 0.14, 0.08, 0.18, M, 'heading-needle');
  train.speedNeedle = dash.dial(0.22, -0.73, 0.03, 0.18, M, 'speed-needle');
  dash.block(0.36, 0.08, 0.04, M.brass, 0.14, -0.39, 0.18);
  for (let i = 0; i < 3; i++) dash.round(0.039, 0.036, 0.039, i === 0 ? M.glow : M.copper,
    0.81, -0.17 + i * 0.18, 0.18).rotation.x = Math.PI / 2;
  dash.finish(M.paintBase);

  train.cabWheel = k.pivot('cab-wheel', 3.11, 6.22, -1.02);
  train.cabWheel.rotation.y = Math.PI / 2;
  train.cabWheel.add(ring(0.49, 0.055, M.woodDark, 0, 0, 0, true));
  train.cabWheel.add(ring(0.45, 0.018, M.brass, 0, 0, 0.024, true));
  for (let i = 0; i < 3; i++) {
    const spoke = block(0.88, 0.045, 0.04, M.brass, 0, 0, 0, true);
    spoke.rotation.z = i * Math.PI / 3;
    train.cabWheel.add(spoke);
  }
  pipe([[3.18, 6.22, -1.02], [3.6, 5.87, -1.02]], 0.075, M.iron);
  train.cabLevers = [];
  for (let i = 0; i < 2; i++) {
    const x = 4.1 + i * 0.42;
    cushion(0.25, 0.1, 0.45, M.iron, x, 6.035, -0.6);
    const lever = k.pivot(`cab-lever-${i}`, x, 6.07, -0.65);
    lever.add(block(0.048, 0.43, 0.048, M.brass, 0, 0.215, 0, true));
    lever.add(k.mesh(new THREE.SphereGeometry(0.095, 12, 8), i ? M.wine : M.woodDark, 0, 0.46, 0, true));
    train.cabLevers.push(lever);
  }
  round(0.27, 0.08, 0.27, M.iron, 1.73, 5.095, -1.13);
  round(0.07, 0.62, 0.07, M.brass, 1.73, 5.4, -1.13);
  cushion(1.16, 0.28, 1.1, M.wine, 1.73, 5.85, -1.13);
  cushion(0.26, 0.92, 1.15, M.wine, 1.17, 6.17, -1.13).rotation.z = 0.12;
  const chart = interiorKit(g, 'route-chart');
  chart.root.position.set(0.04, 6.01, -1.59);
  chart.root.rotation.x = 0.3;
  chart.block(1.64, 0.1, 0.99, M.woodDark, 0, 0, 0);
  chart.block(1.48, 0.017, 0.89, M.pages, 0, 0.065, 0);
  for (let i = -2; i <= 2; i++) chart.block(1.39, 0.006, 0.012, M.sage, 0, 0.078, i * 0.16);
  for (let i = -3; i <= 3; i++) chart.block(0.012, 0.006, 0.81, M.sage, i * 0.2, 0.078, 0);
  chart.pipe([[-0.6, 0.087, 0.29], [-0.31, 0.087, 0.2], [-0.17, 0.087, -0.09], [0.21, 0.087, 0.02], [0.57, 0.087, -0.31]], 0.022, M.hull);
  chart.round(0.052, 0.013, 0.052, M.brass, 0.57, 0.086, -0.31);
  chart.finish(M.paintBase);
  for (const x of [-0.7, 0.77]) block(0.09, 0.94, 0.09, M.woodDark, x, 5.52, -1.67);
  for (const z of [-1.05, 1.05]) block(0.012, 1.3, 1.95, train.zoneGlass('cab', true), 8.045, 6.59, z).rotation.z = 0.1;
  block(0.08, 1.46, 0.075, M.woodDark, 8.04, 6.59, 0).rotation.z = 0.1;
  pipe([[5.87, 7.38, -1.85], [6.23, 7.28, -1.55], [6.24, 7.12, -1.24]], 0.025, M.brass);
  k.mesh(new THREE.CylinderGeometry(0.1, 0.3, 0.22, 24, 1, true), M.teal, 6.24, 7.07, -1.24);
  round(0.14, 0.025, 0.14, M.glow, 6.24, 6.97, -1.24);
  k.finish(M.paintBase);
  const light = new THREE.PointLight(TRAIN_LOOK.cabLight, 12, 8, 2);
  light.position.set(3.8, 7.3, -0.6);
  g.add(light);
  train.cabLight = light;
}

// Vents, a bell that swings with the road and a wind gauge on the cab roof, which nobody walks.
function buildRoofFurniture(train, g) {
  const M = train.materials;
  const k = exteriorKit(g, 'cab-roof');
  const { block, round } = k;
  for (const x of [0.2, 4.6]) {
    round(0.14, 0.24, 0.14, M.iron, x, 8.02, 0);
    const cap = k.mesh(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.brass, x, 8.12, 0);
    cap.scale.y = 0.6;
  }
  for (const z of [-0.26, 0.26]) block(0.07, 0.62, 0.07, M.iron, 7.3, 8.2, z);
  block(0.09, 0.07, 0.66, M.iron, 7.3, 8.5, 0);
  round(0.03, 1.1, 0.03, M.iron, -3.9, 8.45, -0.6);
  round(0.07, 0.05, 0.07, M.brass, -3.9, 7.93, -0.6);
  const roofKit = k.finish();
  if (getLookTier() === 'low') roofKit.traverse((object) => { object.castShadow = false; });

  const bell = new THREE.Group();
  bell.name = 'cab-bell';
  bell.position.set(7.3, 8.47, 0);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.brass);
  crown.position.y = -0.2;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.16, 12, 1, true), M.brass);
  skirt.position.y = -0.28;
  const clapper = new THREE.Mesh(train.geometry.drum, M.iron);
  clapper.scale.set(0.04, 0.3, 0.04);
  clapper.position.y = -0.24;
  bell.add(crown, skirt, clapper);
  g.add(bell);
  train.swingers.push({ object: bell, rate: 3.1, phase: 1.2, reach: 0.28 });

  const vane = new THREE.Group();
  vane.name = 'cab-anemometer';
  vane.position.set(-3.9, 9.0, -0.6);
  const arms = [];
  const cups = [];
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    arms.push([Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17, 0.34, 0.022, 0.022, 0, -a, 0]);
    cups.push([Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36, 0.085, 0.11, 0.085, 0, -a, Math.PI / 2]);
  }
  instancedDetails(arms, train.geometry.detail, M.iron, vane);
  instancedDetails(cups, train.geometry.drum, M.brass, vane);
  g.add(vane);
  train.spinners.push({ object: vane, idle: 1.4, rate: 0.5 });
}
