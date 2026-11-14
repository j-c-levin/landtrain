import * as THREE from 'three';
import { TRAIN_LOOK, painted, getLookTier } from '../look.js';
import { interiorKit } from './interior-kit.js';

export function buildLivingInterior(g, M, { createPlant }) {
  const k = interiorKit(g, 'living-interior');
  const { block, round, cushion, pipe, ring, cloth, curtain } = k;

  block(5.75, 0.024, 2.04, M.wine, -3.3, 1.796, -1.12);
  block(5.48, 0.007, 1.8, M.linen, -3.3, 1.812, -1.12);
  block(5.18, 0.007, 1.53, M.teal, -3.3, 1.818, -1.12);
  for (const x of [-5.15, -3.35, -1.55]) {
    block(0.62, 0.006, 0.62, M.pillow, x, 1.824, -1.12).rotation.y = Math.PI / 4;
    block(0.32, 0.006, 0.32, M.wine, x, 1.83, -1.12).rotation.y = Math.PI / 4;
  }
  for (let z = -2.04; z < -0.18; z += 0.12) {
    for (const x of [-6.22, -0.38]) block(0.12, 0.01, 0.027, M.linen, x, 1.803, z);
  }

  block(1.38, 2.37, 0.38, M.woodDark, -5.92, 3.0, -1.95);
  block(1.13, 2.14, 0.035, M.teal, -5.92, 3.02, -1.74);
  k.arch(1.48, 0.22, 0.1, 0.49, M.wood, -5.92, 4.16, -1.89);
  for (const y of [1.92, 2.58, 3.23, 3.91]) {
    block(1.48, 0.075, 0.53, M.wood, -5.92, y, -1.82);
    for (let i = 0; i < 6 && y < 3.8; i++) {
      const x = -6.41 + i * 0.19;
      const h = 0.38 + (i % 3) * 0.065;
      const book = block(0.13, h, 0.32, [M.wine, M.book, M.sage, M.pillow][i % 4], x, y + h / 2 + 0.05, -1.66);
      book.rotation.z = i === 5 ? -0.1 : 0;
      block(0.1, 0.018, 0.012, M.linen, x, y + 0.15, -1.493);
    }
  }

  for (const x of [-4.25, -2.95]) {
    for (const z of [-1.56, -0.46]) block(0.13, 0.4, 0.13, M.woodDark, x, 1.99, z).rotation.z = x < -3.6 ? 0.1 : -0.1;
  }
  cushion(1.86, 0.31, 1.4, M.woodDark, -3.6, 2.13, -1.0);
  cushion(1.57, 0.3, 1.14, M.upholstery, -3.6, 2.23, -0.97);
  cushion(1.78, 1.62, 0.38, M.upholstery, -3.6, 3.09, -1.67).rotation.x = -0.06;
  for (const side of [-1, 1]) {
    cushion(0.34, 1.35, 0.62, M.upholstery, -3.6 + side * 0.77, 3.12, -1.42).rotation.z = side * -0.1;
    cushion(0.35, 0.58, 1.24, M.upholstery, -3.6 + side * 0.79, 2.56, -0.98);
    pipe([[-3.6 + side * 0.75, 2.48, -0.37], [-3.6 + side * 0.77, 2.86, -1.07],
      [-3.6 + side * 0.72, 3.71, -1.41], [-3.6 + side * 0.49, 3.89, -1.5]], 0.018, M.pillow);
  }
  cushion(0.76, 0.55, 0.24, M.pillow, -3.87, 2.83, -1.36).rotation.z = -0.18;
  for (const x of [-3.95, -3.3]) {
    for (const y of [3.13, 3.57]) round(0.035, 0.024, 0.035, M.hullDark, x, y, -1.456).rotation.x = Math.PI / 2;
  }
  cloth(0.57, [[-1.88, 3.9], [-1.48, 3.86], [-1.34, 3.25], [-0.98, 2.89], [-0.4, 2.87], [-0.3, 2.57], [-0.31, 1.98]], M.linen, -2.95);
  for (const x of [-3.12, -2.87]) cloth(0.045, [[-1.88, 3.908], [-1.48, 3.868], [-1.33, 3.26], [-0.98, 2.9], [-0.39, 2.88], [-0.29, 2.57], [-0.3, 1.98]], M.wine, x);

  round(0.67, 0.11, 0.57, M.wood, -1.7, 2.67, -1.03);
  round(0.09, 0.83, 0.09, M.woodDark, -1.7, 2.23, -1.03);
  for (const dx of [-0.42, 0.42]) pipe([[-1.7, 2.23, -1.03], [-1.7 + dx, 1.92, -1.03], [-1.7 + dx * 1.18, 1.83, -0.84]], 0.052, M.woodDark);
  for (const side of [-1, 1]) {
    const cover = block(0.42, 0.035, 0.61, M.wine, -1.8 + side * 0.21, 2.784, -1.04);
    cover.rotation.z = side * 0.18;
    cover.rotation.x = 0.15;
    const pages = block(0.39, 0.053, 0.56, M.pages, -1.8 + side * 0.195, 2.817, -1.04);
    pages.rotation.copy(cover.rotation);
    for (let line = 0; line < 5; line++) block(0.25, 0.008, 0.012, M.wood,
      -1.8 + side * 0.2, 2.86 + (line - 2) * 0.011, -1.22 + line * 0.078).rotation.z = side * 0.18;
  }
  block(0.042, 0.008, 0.7, M.sage, -1.79, 2.855, -0.98).rotation.x = 0.15;
  round(0.115, 0.19, 0.115, M.cream, -1.24, 2.827, -0.84);
  round(0.094, 0.009, 0.094, M.woodDark, -1.24, 2.925, -0.84);
  ring(0.085, 0.019, M.cream, -1.095, 2.84, -0.84);

  round(0.28, 0.085, 0.28, M.brass, -2.11, 1.835, -1.79);
  pipe([[-2.11, 1.84, -1.79], [-2.11, 3.64, -1.79], [-1.98, 3.99, -1.62], [-1.65, 4.06, -1.4]], 0.026, M.brass);
  k.mesh(new THREE.CylinderGeometry(0.23, 0.49, 0.44, 32, 1, true), M.lampshade, -1.65, 3.82, -1.4);
  for (const [r, y] of [[0.49, 3.6], [0.23, 4.04]]) ring(r, 0.022, M.brass, -1.65, y, -1.4).rotation.x = Math.PI / 2;
  round(0.23, 0.015, 0.23, M.glow, -1.65, 3.61, -1.4);
  round(0.56, 0.004, 0.47, M.lightPool, -1.7, 2.731, -1.03);
  const readingLight = new THREE.PointLight(TRAIN_LOOK.readingLight, 15, 9, 2);
  readingLight.position.set(-0.6, 3.8, 0.3);
  k.root.add(readingLight);

  block(2.6, 0.67, 0.61, M.woodDark, 0.58, 2.135, -1.88);
  block(2.72, 0.12, 0.76, M.wood, 0.58, 2.52, -1.8);
  for (const x of [-0.1, 1.22]) {
    cushion(1.15, 0.53, 0.055, M.sage, x, 2.15, -1.546);
    ring(0.065, 0.013, M.brass, x, 2.19, -1.495);
  }

  block(3.55, 0.55, 0.92, M.teal, 4.23, 2.105, -1.64);
  block(3.72, 0.13, 1.04, M.wood, 4.23, 2.43, -1.62);
  for (const x of [2.67, 4.05, 5.52]) block(0.07, 0.46, 0.03, M.wood, x, 2.12, -1.16);
  for (const x of [3.05, 4.92]) ring(0.065, 0.015, M.brass, x, 2.12, -1.112);
  block(0.82, 0.44, 0.73, M.woodDark, 5.43, 2.71, -1.63);
  block(0.92, 0.08, 0.83, M.wood, 5.43, 2.95, -1.63);
  const plantPots = [
    createPlant(3.05, 2.5, -1.56, 1.0, 1),
    createPlant(4.33, 2.5, -1.76, 1.04, 0),
    createPlant(5.43, 3.0, -1.64, 0.85, 2),
  ];
  const can = k.pivot('watering-can', 2.36, 2.9, -1.53);
  block(0.74, 0.08, 0.77, M.wood, 2.23, 2.68, -1.53);
  can.add(k.mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.36, 20), M.copper, 0, 0, 0, true));
  can.add(ring(0.19, 0.03, M.copper, -0.25, 0.06, 0, true));
  const spout = k.mesh(new THREE.CylinderGeometry(0.04, 0.075, 0.48, 12), M.copper, 0.32, 0.06, 0, true);
  spout.rotation.z = -0.9;
  can.add(spout);
  const rose = round(0.092, 0.038, 0.092, M.brass, 0.51, 0.21, 0, true);
  rose.rotation.z = -0.9;
  can.add(rose);

  for (const windowX of [-3.9, 0, 3.9]) {
    round(0.026, 2.86, 0.026, M.woodDark, windowX, 4.18, -2.03).rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) {
      curtain(0.49, 1.48, M.linen, windowX + side * 1.2, 3.36, -2.01);
      block(0.23, 0.06, 0.05, M.wine, windowX + side * 1.2, 3.1, -1.94);
    }
  }
  k.finish(M.paintBase);
  return { plantPots, can };
}

export function buildBunkInterior(g, M) {
  const k = interiorKit(g, 'bunk-interior');
  const { block, cushion, round, ring, cloth, curtain } = k;
  cushion(4.1, 0.49, 1.64, M.woodDark, 3.5, 2.075, -1.35);
  for (const x of [2.43, 4.54]) {
    cushion(1.77, 0.32, 0.06, M.teal, x, 2.07, -0.5);
    ring(0.07, 0.015, M.brass, x, 2.1, -0.454);
  }
  cushion(3.95, 0.3, 1.58, M.linen, 3.5, 2.435, -1.35);
  cushion(0.72, 0.43, 1.2, M.linen, 4.91, 2.77, -1.36).rotation.z = 0.14;
  cushion(0.62, 0.4, 0.9, M.pillow, 4.71, 2.82, -1.31).rotation.z = 0.12;
  const drape = [[-2.09, 2.6], [-1.8, 2.73], [-1.36, 2.8], [-0.85, 2.72], [-0.51, 2.58], [-0.46, 2.26], [-0.48, 2.04]];
  for (let i = 0; i < 5; i++) cloth(0.52, drape, [M.teal, M.sage, M.teal, M.linen, M.teal][i], 2.19 + i * 0.52, 0.027);
  cloth(2.63, [[-1.06, 2.79], [-0.8, 2.73]], M.wine, 3.23, 0.025);
  cloth(2.63, [[-1.85, 2.74], [-1.66, 2.8]], M.wine, 3.23, 0.025);
  cloth(2.65, [[-2.03, 2.68], [-1.85, 2.78], [-1.58, 2.79]], M.linen, 3.23, 0.035);

  for (const x of [1.28, 5.72]) {
    block(0.15, 2.35, 0.15, M.woodDark, x, 2.97, -2.04);
    cushion(0.2, 0.77, 1.57, M.teal, x, 2.76, -1.37);
  }
  k.arch(4.62, 0.44, 0.13, 1.58, M.woodDark, 3.5, 4.08, -1.34);
  k.arch(4.57, 0.43, 0.18, 0.08, M.linen, 3.5, 4.04, -0.51);
  k.arch(4.62, 0.44, 0.055, 0.1, M.wood, 3.5, 4.105, -0.48);
  for (const side of [-1, 1]) {
    curtain(0.82, 1.87, M.wine, 3.5 + side * 1.92, 3.17, -0.56);
    block(0.32, 0.08, 0.1, M.pillow, 3.5 + side * 1.92, 2.92, -0.465);
  }
  block(0.7, 0.1, 0.63, M.wood, 6.07, 3.13, -1.75);
  block(0.19, 0.45, 0.3, M.book, 5.87, 3.4, -1.77).rotation.z = -0.12;
  block(0.16, 0.37, 0.3, M.wine, 6.1, 3.36, -1.77);
  k.pipe([[5.62, 3.98, -1.75], [5.62, 3.65, -1.75], [5.9, 3.65, -1.66]], 0.025, M.brass);
  k.mesh(new THREE.CylinderGeometry(0.12, 0.27, 0.2, 24, 1, true), M.teal, 5.9, 3.6, -1.65);
  round(0.13, 0.03, 0.13, M.glow, 5.9, 3.5, -1.65);
  const light = new THREE.PointLight(TRAIN_LOOK.bunkLight, 8, 8.5, 2);
  light.position.set(1.7, 3.9, -0.3);
  k.root.add(light);
  k.finish(M.paintBase);
  buildVestibule(g, M);
}

// The front car's other half: where coats, boots, stores and the kettle live.
function buildVestibule(g, M) {
  const k = interiorKit(g, 'vestibule', painted, true);
  const fine = getLookTier() !== 'low';
  const { block, round, cushion, ring, pipe, curtain } = k;
  const HALF_PI = Math.PI / 2;
  const wall = -2.245;

  block(7.99, 0.85, 0.03, M.wood, -2.795, 2.205, wall);
  block(7.99, 0.07, 0.07, M.woodDark, -2.795, 2.63, wall + 0.02);
  block(7.99, 0.12, 0.06, M.woodDark, -2.795, 1.84, wall + 0.02);
  if (fine) for (let x = -6.5; x < 1.1; x += 0.5) block(0.02, 0.72, 0.012, M.woodDark, x, 2.22, wall + 0.018);

  block(6.7, 0.02, 1.5, M.teal, -2.7, 1.794, -0.3);
  block(6.44, 0.006, 1.24, M.pillow, -2.7, 1.807, -0.3);
  block(6.2, 0.006, 1.0, M.wine, -2.7, 1.812, -0.3);
  for (const x of [-5.1, -3.5, -1.9, -0.3]) block(0.5, 0.006, 0.5, M.linen, x, 1.818, -0.3).rotation.y = Math.PI / 4;
  if (fine) {
    for (let z = -0.99; z < 0.42; z += 0.12) {
      for (const x of [-6.11, 0.71]) block(0.12, 0.01, 0.027, M.linen, x, 1.8, z);
    }
  }

  block(0.95, 0.1, 0.05, M.woodDark, -6.3, 3.9, wall + 0.03);
  if (fine) for (const x of [-6.6, -6.3, -6.0]) round(0.025, 0.14, 0.025, M.brass, x, 3.9, wall + 0.1).rotation.x = HALF_PI;
  cushion(0.56, 1.36, 0.22, M.wine, -6.52, 3.18, wall + 0.16);
  if (fine) cushion(0.42, 0.17, 0.25, M.pillow, -6.52, 3.84, wall + 0.17);
  if (fine) for (const y of [3.5, 3.2, 2.9]) round(0.028, 0.02, 0.028, M.brass, -6.52, y, wall + 0.275).rotation.x = HALF_PI;
  block(0.11, 1.05, 0.04, M.teal, -6.05, 3.36, wall + 0.1).rotation.z = 0.04;
  block(0.11, 0.78, 0.04, M.teal, -5.93, 3.5, wall + 0.12).rotation.z = -0.05;
  for (const y of [2.9, 3.05]) block(0.115, 0.05, 0.045, M.pillow, -6.07, y, wall + 0.102);
  round(0.11, 0.36, 0.11, M.woodDark, -6.55, 1.97, -1.95);
  round(0.11, 0.36, 0.11, M.woodDark, -6.27, 1.97, -1.9);
  if (fine) for (const x of [-6.55, -6.27]) cushion(0.2, 0.14, 0.34, M.woodDark, x, 1.86, -1.8);

  for (const x of [-4.5, -2.9]) block(0.11, 1.07, 1.32, M.iron, x, 2.305, -1.55);
  block(0.24, 0.2, 0.04, M.brass, -3.7, 2.52, -0.885);
  cushion(1.0, 0.2, 0.82, M.sage, -4.3, 2.93, -1.6);
  if (fine) {
    cushion(0.92, 0.18, 0.74, M.pillow, -4.28, 3.08, -1.6);
    cushion(0.86, 0.16, 0.7, M.wine, -4.31, 3.21, -1.6);
  }
  round(0.12, 0.05, 0.12, M.iron, -3.0, 2.86, -1.5);
  round(0.085, 0.22, 0.085, M.glow, -3.0, 2.99, -1.5);
  round(0.12, 0.05, 0.12, M.brass, -3.0, 3.12, -1.5);
  if (fine) ring(0.09, 0.012, M.brass, -3.0, 3.2, -1.5);

  block(1.05, 0.8, 0.05, M.woodDark, -2.7, 3.42, wall + 0.03);
  block(0.9, 0.65, 0.02, M.pages, -2.7, 3.42, wall + 0.06);
  if (fine) {
    for (const dy of [-0.2, 0, 0.2]) block(0.84, 0.01, 0.006, M.sage, -2.7, 3.42 + dy, wall + 0.072);
    for (const dx of [-0.28, 0, 0.28]) block(0.01, 0.6, 0.006, M.sage, -2.7 + dx, 3.42, wall + 0.072);
  }
  pipe([[-3.05, 3.26, wall + 0.08], [-2.82, 3.48, wall + 0.08], [-2.6, 3.36, wall + 0.08], [-2.38, 3.6, wall + 0.08]], 0.016, M.hull);
  round(0.03, 0.02, 0.03, M.brass, -2.38, 3.6, wall + 0.085).rotation.x = HALF_PI;

  if (fine) {
    for (const [y, r] of [[2.05, 0.475], [2.66, 0.445]]) ring(r, 0.022, M.iron, -1.3, y, -1.65).rotation.x = HALF_PI;
    ring(0.27, 0.06, M.pillow, -1.3, 2.97, -1.65).rotation.x = HALF_PI;
    ring(0.16, 0.055, M.pillow, -1.3, 3.03, -1.65).rotation.x = HALF_PI;
  }
  cushion(0.72, 0.84, 0.6, M.linen, -2.08, 2.17, -1.78);
  block(0.3, 0.05, 0.3, M.wine, -2.08, 2.5, -1.78);

  block(1.5, 0.78, 0.72, M.teal, 0.3, 2.19, -1.85);
  block(1.62, 0.08, 0.84, M.wood, 0.3, 2.62, -1.82);
  block(0.03, 0.62, 0.02, M.woodDark, 0.3, 2.19, -1.485);
  if (fine) for (const x of [0.18, 0.42]) ring(0.05, 0.012, M.brass, x, 2.22, -1.47);
  const kettle = k.mesh(new THREE.SphereGeometry(0.19, 14, 10), M.copper, -0.05, 2.82, -1.8);
  kettle.scale.y = 0.8;
  round(0.07, 0.04, 0.07, M.brass, -0.05, 2.985, -1.8);
  if (fine) ring(0.14, 0.018, M.iron, -0.05, 2.97, -1.8);
  pipe([[0.1, 2.82, -1.8], [0.24, 2.9, -1.8], [0.3, 3.0, -1.8]], 0.026, M.copper);
  for (const [x, z] of [[0.55, -1.66], [0.74, -1.9]]) {
    round(0.075, 0.14, 0.075, M.cream, x, 2.73, z);
    if (fine) ring(0.055, 0.014, M.cream, x + 0.09, 2.73, z);
  }
  round(0.1, 0.22, 0.1, M.sage, 0.95, 2.77, -2.0);
  round(0.105, 0.03, 0.105, M.brass, 0.95, 2.895, -2.0);

  for (const y of [3.42, 3.92]) {
    block(0.78, 0.05, 0.3, M.wood, 0.8, y, wall + 0.17);
    for (const x of [0.5, 1.1]) block(0.04, 0.16, 0.24, M.woodDark, x, y - 0.1, wall + 0.14);
  }
  for (const [i, mat] of [M.wine, M.pillow, M.sage].entries()) {
    round(0.085, 0.2, 0.085, mat, 0.55 + i * 0.25, 3.545, wall + 0.17);
    if (fine) round(0.09, 0.025, 0.09, M.brass, 0.55 + i * 0.25, 3.655, wall + 0.17);
  }
  block(0.13, 0.3, 0.22, M.book, 0.56, 4.095, wall + 0.17);
  block(0.11, 0.26, 0.22, M.wine, 0.69, 4.075, wall + 0.17).rotation.z = -0.14;
  round(0.11, 0.16, 0.11, M.copper, 1.0, 4.025, wall + 0.17);

  for (const wx of [-4.6, -0.8]) {
    round(0.026, 2.74, 0.026, M.woodDark, wx, 4.18, -2.03).rotation.z = HALF_PI;
    for (const side of [-1, 1]) {
      curtain(0.46, 1.48, M.linen, wx + side * 1.02, 3.36, -2.01);
      block(0.22, 0.06, 0.05, M.teal, wx + side * 1.02, 3.1, -1.94);
    }
  }

  pipe([[-2.7, 4.86, -0.9], [-2.7, 4.56, -0.9]], 0.018, M.iron);
  round(0.14, 0.05, 0.14, M.brass, -2.7, 4.54, -0.9);
  round(0.1, 0.24, 0.1, M.glow, -2.7, 4.39, -0.9);
  round(0.13, 0.05, 0.13, M.brass, -2.7, 4.25, -0.9);
  k.finish(M.paintBase).traverse((object) => { object.castShadow = false; });
}
