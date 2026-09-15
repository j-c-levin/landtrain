import * as THREE from 'three';

export function buildLivingInterior(g, M, { box, profiledBox, createPlant }) {
  const teal = new THREE.MeshStandardMaterial({ color: 0x537b73, roughness: 0.96 });
  const burgundy = new THREE.MeshStandardMaterial({ color: 0x793e49, roughness: 0.96 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xe6ceb0, roughness: 1, side: THREE.DoubleSide });
  const dyed = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const sage = M.sage.clone();
  sage.side = THREE.DoubleSide;

  function mesh(geometry, material, x, y, z) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    g.add(object);
    return object;
  }

  function soft(w, h, d, radius, material, x, y, z) {
    const shape = new THREE.Shape();
    const a = w / 2 - radius;
    const b = h / 2 - radius;
    shape.moveTo(-a, -h / 2);
    shape.lineTo(a, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -b);
    shape.lineTo(w / 2, b);
    shape.quadraticCurveTo(w / 2, h / 2, a, h / 2);
    shape.lineTo(-a, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, b);
    shape.lineTo(-w / 2, -b);
    shape.quadraticCurveTo(-w / 2, -h / 2, -a, -h / 2);
    const bevel = Math.min(radius * 0.35, d * 0.2);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: d - bevel * 2, bevelEnabled: true,
      bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
      steps: 1, curveSegments: 5,
    });
    geometry.translate(0, 0, -d / 2 + bevel);
    return mesh(geometry, material, x, y, z);
  }

  function batch(geometry, material, items, colors) {
    const object = new THREE.InstancedMesh(geometry, material, items.length);
    const transform = new THREE.Object3D();
    items.forEach(([x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0], i) => {
      transform.position.set(x, y, z);
      transform.scale.set(sx, sy, sz);
      transform.rotation.set(rx, ry, rz);
      transform.updateMatrix();
      object.setMatrixAt(i, transform.matrix);
      if (colors) object.setColorAt(i, colors[i % colors.length]);
    });
    object.instanceMatrix.needsUpdate = true;
    object.receiveShadow = true;
    g.add(object);
    return object;
  }

  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);

  // The rug stays below furniture feet and stops short of the walking lane.
  profiledBox(5.15, 0.018, 1.94, 0.008, burgundy, -2.95, 1.789, -1.06, g);
  box(4.91, 0.006, 1.7, linen, -2.95, 1.801, -1.06, g, false);
  box(4.64, 0.004, 1.43, teal, -2.95, 1.806, -1.06, g, false);
  const weave = [];
  const weaveColors = [M.pillow.color, burgundy.color, linen.color];
  for (let i = 0; i < 9; i++) {
    weave.push([-5.04 + i * 0.52, 1.811, -1.06, 0.3, 0.005, 0.3, 0, Math.PI / 4]);
  }
  for (let i = 0; i < 26; i++) {
    for (const z of [-1.84, -0.28]) {
      weave.push([-5.26 + i * 0.185, 1.811, z, 0.055, 0.005, 0.11]);
    }
  }
  for (let i = 0; i < 14; i++) {
    for (const x of [-5.57, -0.33]) {
      weave.push([x, 1.792, -1.88 + i * 0.126, 0.1, 0.008, 0.025]);
    }
  }
  batch(cube, dyed, weave, weaveColors);

  const feet = [];
  for (const x of [-4.13, -3.07]) {
    for (const z of [-1.14, -0.3]) feet.push([x, 1.99, z, 0.12, 0.42, 0.12, 0, 0, x < -3.6 ? 0.07 : -0.07]);
  }
  for (const x of [-6.2, -4.68]) {
    for (const z of [-1.77, -0.91]) feet.push([x, 1.94, z, 0.13, 0.32, 0.13]);
  }
  batch(cube, M.woodDark, feet);
  profiledBox(1.55, 0.23, 1.24, 0.09, M.hullDark, -3.6, 2.2, -0.7, g);
  const seat = profiledBox(1.3, 0.3, 1.12, 0.12, M.upholstery, -3.6, 2.33, -0.7, g);
  seat.name = 'reading-seat';
  soft(1.52, 1.15, 0.3, 0.24, M.upholstery, -3.6, 2.91, -1.23).rotation.x = -0.08;
  for (const x of [-4.29, -2.91]) {
    soft(0.25, 0.5, 1.13, 0.12, M.upholstery, x, 2.54, -0.69);
  }
  soft(0.59, 0.46, 0.21, 0.12, M.pillow, -3.84, 2.81, -1.01).rotation.z = -0.16;

  const throwGeometry = new THREE.PlaneGeometry(0.45, 1, 10, 18);
  const throwPositions = throwGeometry.attributes.position;
  const drape = [[-1.39, 3.44], [-1.05, 3.34], [-0.9, 2.85], [-0.62, 2.82], [-0.2, 2.8], [-0.06, 2.61], [-0.07, 2.13]];
  for (let i = 0; i < throwPositions.count; i++) {
    const u = throwPositions.getX(i);
    const t = (0.5 - throwPositions.getY(i)) * (drape.length - 1);
    const index = Math.min(Math.floor(t), drape.length - 2);
    const f = t - index;
    throwPositions.setXYZ(i, -2.99 + u,
      THREE.MathUtils.lerp(drape[index][1], drape[index + 1][1], f) + Math.cos(u * 45) * 0.018,
      THREE.MathUtils.lerp(drape[index][0], drape[index + 1][0], f));
  }
  throwGeometry.computeVertexNormals();
  mesh(throwGeometry, sage, 0, 0, 0);

  profiledBox(2.03, 0.24, 1.26, 0.1, M.woodDark, -5.44, 2.08, -1.35, g);
  soft(1.96, 0.26, 1.2, 0.1, teal, -5.44, 2.29, -1.35);
  soft(2.06, 0.63, 0.23, 0.17, teal, -5.44, 2.54, -1.91);
  soft(0.4, 0.52, 0.8, 0.16, burgundy, -6.19, 2.54, -1.39).rotation.z = 0.13;
  soft(0.57, 0.43, 0.2, 0.12, linen, -5.05, 2.55, -1.68).rotation.z = -0.19;

  profiledBox(4.7, 0.64, 0.52, 0.04, M.woodDark, 0.2, 2.12, -1.89, g);
  box(4.53, 0.48, 0.025, M.iron, 0.2, 2.13, -1.615, g);
  profiledBox(4.86, 0.1, 0.64, 0.035, M.wood, 0.2, 2.5, -1.87, g);
  const joinery = [];
  for (const x of [-2.11, -0.95, 0.22, 1.39, 2.51]) joinery.push([x, 2.13, -1.57, 0.065, 0.55, 0.12]);
  joinery.push([0.2, 1.873, -1.58, 4.7, 0.07, 0.12]);
  batch(cube, M.wood, joinery);
  const books = [];
  const bands = [];
  for (let bay = 0; bay < 4; bay++) {
    for (let i = 0; i < 6; i++) {
      const x = -1.95 + bay * 1.17 + i * 0.15;
      const h = 0.29 + ((i * 3 + bay) % 5) * 0.025;
      books.push([x, 1.92 + h / 2, -1.55, 0.105, h, 0.24]);
      bands.push([x, 1.99, -1.425, 0.083, 0.018, 0.008]);
    }
  }
  batch(cube, dyed, books,
    [burgundy.color, M.book.color, M.sage.color, M.pillow.color, M.hull.color]);
  batch(cube, M.cream, bands);

  mesh(new THREE.CylinderGeometry(0.46, 0.49, 0.105, 32), M.wood, -1.95, 2.47, -0.67);
  mesh(new THREE.CylinderGeometry(0.065, 0.1, 0.59, 16), M.brass, -1.95, 2.13, -0.67);
  mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.065, 24), M.woodDark, -1.95, 1.824, -0.67);
  for (const side of [-1, 1]) {
    const cover = box(0.205, 0.018, 0.28, burgundy, -2.08 + side * 0.105, 2.547, -0.67, g);
    cover.rotation.z = side * 0.13;
    const pages = box(0.185, 0.025, 0.25, M.cream, -2.08 + side * 0.097, 2.567, -0.67, g);
    pages.rotation.z = side * 0.13;
  }
  mesh(new THREE.CylinderGeometry(0.072, 0.057, 0.13, 20), M.cream, -1.73, 2.588, -0.65);
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.005, 20), M.woodDark, -1.73, 2.654, -0.65);
  mesh(new THREE.TorusGeometry(0.049, 0.013, 8, 16), M.cream, -1.646, 2.599, -0.65);

  mesh(new THREE.CylinderGeometry(0.23, 0.27, 0.07, 24), M.brass, -2.53, 1.824, -1.49);
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.65, 12), M.brass, -2.53, 2.675, -1.49);
  mesh(new THREE.CylinderGeometry(0.22, 0.39, 0.43, 32, 1, true), linen, -2.53, 3.49, -1.49);
  for (const [radius, y] of [[0.39, 3.275], [0.22, 3.705]]) {
    mesh(new THREE.TorusGeometry(radius, 0.014, 8, 32), M.brass, -2.53, y, -1.49).rotation.x = Math.PI / 2;
  }
  mesh(new THREE.SphereGeometry(0.075, 12, 8), M.glow, -2.53, 3.29, -1.49);
  const readingLight = new THREE.PointLight(0xffce93, 17, 7, 2);
  readingLight.position.set(-2.53, 3.5, 0.1);
  g.add(readingLight);

  profiledBox(1.42, 0.76, 0.89, 0.06, teal, 6.08, 2.19, -1.57, g);
  profiledBox(1.51, 0.1, 0.98, 0.035, M.cream, 6.08, 2.62, -1.57, g);
  for (const x of [5.74, 6.42]) soft(0.61, 0.59, 0.035, 0.055, M.sage, x, 2.19, -1.109);
  batch(cylinder, M.brass, [[5.93, 2.28, -1.065, 0.033, 0.04, 0.033, Math.PI / 2], [6.23, 2.28, -1.065, 0.033, 0.04, 0.033, Math.PI / 2]]);
  mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.014, 24), M.iron, 6.24, 2.678, -1.57);
  const kettle = mesh(new THREE.SphereGeometry(0.17, 20, 12), M.brass, 6.24, 2.83, -1.57);
  kettle.scale.y = 0.85;
  mesh(new THREE.TorusGeometry(0.125, 0.02, 8, 20, Math.PI), M.iron, 6.24, 2.93, -1.57);
  mesh(new THREE.CylinderGeometry(0.033, 0.065, 0.18, 12), M.brass, 6.43, 2.86, -1.57).rotation.z = -0.9;

  batch(cylinder, M.cream, [[3.4, 1.796, -1.48, 0.31, 0.03, 0.31], [4.2, 1.796, -1.65, 0.38, 0.03, 0.38], [5, 1.796, -1.46, 0.3, 0.03, 0.3]]);
  const plantPots = [createPlant(3.4, -1.48, 0.9), createPlant(4.2, -1.65, 1.2), createPlant(5, -1.46, 0.85)];

  const curtainGeometry = new THREE.PlaneGeometry(0.39, 1.43, 12, 18);
  const curtainPositions = curtainGeometry.attributes.position;
  for (let i = 0; i < curtainPositions.count; i++) {
    const x = curtainPositions.getX(i);
    const y = curtainPositions.getY(i);
    const gather = 1 - 0.38 * Math.exp(-(((y + 0.2) / 0.2) ** 2));
    curtainPositions.setXYZ(i, x * gather, y, Math.cos(x * 65) * 0.046);
  }
  curtainGeometry.computeVertexNormals();
  const rods = [];
  const ties = [];
  for (const windowX of [-3.9, 0, 3.9]) {
    rods.push([windowX, 4.08, -2.08, 0.024, 2.75, 0.024, 0, 0, Math.PI / 2]);
    for (const side of [-1, 1]) {
      const x = windowX + side * 1.17;
      mesh(curtainGeometry, sage, x, 3.32, -2.08);
      ties.push([x, 3.12, -2.016, 0.26, 0.045, 0.025]);
    }
  }
  batch(cylinder, M.brass, rods);
  batch(cube, M.pillow, ties);

  mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.36, 8), M.iron, 0.7, 4.21, -0.8);
  mesh(new THREE.CylinderGeometry(0.14, 0.43, 0.23, 32, 1, true), M.brass, 0.7, 3.925, -0.8);
  mesh(new THREE.SphereGeometry(0.085, 12, 8), M.glow, 0.7, 3.84, -0.8);

  return { plantPots };
}
