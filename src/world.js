import * as THREE from 'three';
import { WORLD, LANDMARK, clamp } from './constants.js';

// Deterministic PRNG so the prairie looks the same every run.
function mulberry(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#7fb2c4'); // soft teal zenith
  g.addColorStop(0.45, '#cfd3b2');
  g.addColorStop(0.68, '#f4cd95'); // honey band
  g.addColorStop(0.82, '#f0b083'); // peach horizon
  g.addColorStop(1.0, '#e8a87c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function softDiscTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export { softDiscTexture };

function bigRockCluster(rand, cx, cz, r, scene, obstacles) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8d7f72, roughness: 0.95, flatShading: true });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x6f6258, roughness: 0.95, flatShading: true });
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = r * (0.32 + rand() * 0.45);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rand() > 0.5 ? mat : matDark);
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.55;
    rock.position.set(cx + Math.cos(a) * d, s * 0.45, cz + Math.sin(a) * d);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.scale.y = 0.6 + rand() * 0.5;
    group.add(rock);
  }
  scene.add(group);
  obstacles.push({ type: 'circle', x: cx, z: cz, r });
}

function ridge(rand, x1, z1, x2, z2, scene, obstacles) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7d6e63, roughness: 0.95, flatShading: true });
  const matWarm = new THREE.MeshStandardMaterial({ color: 0x94806c, roughness: 0.95, flatShading: true });
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const steps = Math.ceil(len / 24);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = 13 + rand() * 11;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(s, s * (2.1 + rand() * 0.9), 5), rand() > 0.5 ? mat : matWarm);
    rock.position.set(
      x1 + dx * t + (rand() - 0.5) * 10,
      s * 0.7,
      z1 + dz * t + (rand() - 0.5) * 10
    );
    rock.rotation.y = rand() * Math.PI;
    rock.rotation.x = (rand() - 0.5) * 0.14;
    group.add(rock);
  }
  scene.add(group);
  obstacles.push({ type: 'seg', x1, z1, x2, z2, w: 16 });
}

function buildLandmark(scene) {
  const group = new THREE.Group();
  group.position.set(LANDMARK.x, 0, LANDMARK.z);

  // Materials ignore scene fog so the Tree reads on the horizon from the start.
  const mesaMat = new THREE.MeshStandardMaterial({ color: 0xa5765a, roughness: 0.95, fog: false, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4a33, roughness: 0.9, fog: false });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x9fae5e, roughness: 0.85, fog: false, emissive: 0x33401a, emissiveIntensity: 0.45, flatShading: true,
  });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffd27c, emissive: 0xffaa44, emissiveIntensity: 2.2, fog: false,
  });

  const mesa = new THREE.Mesh(new THREE.CylinderGeometry(46, 64, 16, 9), mesaMat);
  mesa.position.y = 8;
  group.add(mesa);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(5, 9, 62, 7), trunkMat);
  trunk.position.y = 16 + 31;
  group.add(trunk);

  const blobs = [
    [0, 86, 0, 36],
    [-20, 72, 8, 24],
    [18, 74, -10, 22],
  ];
  for (const [bx, by, bz, br] of blobs) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(br, 1), leafMat);
    blob.position.set(bx, by, bz);
    group.add(blob);
  }

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), lanternMat);
    lantern.position.set(Math.cos(a) * 26, 56 + Math.sin(i * 2.7) * 10, Math.sin(a) * 26);
    group.add(lantern);
  }

  // A warm halo sprite so it glows even as a far silhouette.
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softDiscTexture('rgba(255,196,110,0.55)', 'rgba(255,196,110,0)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  halo.scale.setScalar(160);
  halo.position.y = 78;
  group.add(halo);

  scene.add(group);
  return group;
}

export function createWorld(scene) {
  const rand = mulberry(20260612);
  const obstacles = [];

  // --- sky dome + fog -------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4200, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xf2c694, 130, 560);

  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softDiscTexture('rgba(255,238,200,0.95)', 'rgba(255,210,140,0)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  sun.scale.setScalar(900);
  sun.position.set(1400, 480, -3400);
  scene.add(sun);

  // --- lights ----------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffe1bb, 0x70805d, 1.05);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffd9a8, 2.1);
  dir.position.set(-110, 170, 90);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.left = -75;
  dir.shadow.camera.right = 75;
  dir.shadow.camera.top = 75;
  dir.shadow.camera.bottom = -75;
  dir.shadow.camera.near = 20;
  dir.shadow.camera.far = 600;
  dir.shadow.bias = -0.0008;
  scene.add(dir);
  scene.add(dir.target);

  // --- ground ----------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.maxX - WORLD.minX + 2600, WORLD.maxZ - WORLD.minZ + 2600),
    new THREE.MeshStandardMaterial({ color: 0xc9af72, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((WORLD.minX + WORLD.maxX) / 2, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // Meadow patches — big soft tinted discs break up the plain.
  const patchGeo = new THREE.CircleGeometry(1, 20);
  const patchColors = [0xb8a868, 0xa9a673, 0x9d9c66, 0xd0b376, 0xbfa05f];
  const patches = new THREE.Group();
  for (let i = 0; i < 150; i++) {
    const m = new THREE.Mesh(
      patchGeo,
      new THREE.MeshStandardMaterial({
        color: patchColors[Math.floor(rand() * patchColors.length)],
        roughness: 1,
        transparent: true,
        opacity: 0.4 + rand() * 0.3,
      })
    );
    m.rotation.x = -Math.PI / 2;
    const s = 26 + rand() * 90;
    m.scale.set(s, s * (0.6 + rand() * 0.7), 1);
    m.rotation.z = rand() * Math.PI;
    m.position.set(
      WORLD.minX + rand() * (WORLD.maxX - WORLD.minX),
      0.04 + i * 0.0004,
      WORLD.minZ + rand() * (WORLD.maxZ - WORLD.minZ)
    );
    patches.add(m);
  }
  scene.add(patches);

  // --- instanced scatter ------------------------------------------------
  const dummy = new THREE.Object3D();

  function scatter(geo, mat, count, place) {
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      place(dummy, color, i);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, color);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    scene.add(inst);
    return inst;
  }

  const randPos = (o) => {
    o.position.set(
      WORLD.minX + rand() * (WORLD.maxX - WORLD.minX),
      0,
      WORLD.minZ + rand() * (WORLD.maxZ - WORLD.minZ)
    );
  };

  // grass tufts
  scatter(
    new THREE.ConeGeometry(0.5, 1.2, 5),
    new THREE.MeshStandardMaterial({ roughness: 1 }),
    1700,
    (o, c) => {
      randPos(o);
      const s = 0.6 + rand() * 1.2;
      o.scale.set(s, s * (0.8 + rand() * 0.9), s);
      o.position.y = (o.scale.y * 1.2) / 2 - 0.05;
      o.rotation.y = rand() * Math.PI;
      c.setHSL(0.13 + rand() * 0.1, 0.38 + rand() * 0.2, 0.42 + rand() * 0.16);
    }
  );

  // bushes
  scatter(
    new THREE.IcosahedronGeometry(0.9, 1),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    320,
    (o, c) => {
      randPos(o);
      const s = 0.9 + rand() * 1.7;
      o.scale.set(s, s * 0.65, s);
      o.position.y = s * 0.4;
      o.rotation.y = rand() * Math.PI;
      c.setHSL(0.21 + rand() * 0.07, 0.3 + rand() * 0.18, 0.34 + rand() * 0.12);
    }
  );

  // small stones
  scatter(
    new THREE.DodecahedronGeometry(0.55, 0),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    240,
    (o, c) => {
      randPos(o);
      const s = 0.5 + rand() * 1.4;
      o.scale.setScalar(s);
      o.position.y = s * 0.28;
      o.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
      c.setHSL(0.08, 0.1 + rand() * 0.1, 0.45 + rand() * 0.15);
    }
  );

  // little flowers — bright accents
  scatter(
    new THREE.SphereGeometry(0.16, 6, 5),
    new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    420,
    (o, c) => {
      randPos(o);
      o.scale.setScalar(0.8 + rand() * 1.2);
      o.position.y = 0.35;
      c.setHSL(rand() > 0.5 ? 0.04 : 0.12, 0.85, 0.62 + rand() * 0.1);
    }
  );

  // --- trees (individual, so they can fade near the camera) -------------
  const trees = [];
  const treeGroup = new THREE.Group();
  for (let i = 0; i < 64; i++) {
    const t = new THREE.Group();
    const h = 4 + rand() * 5;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5337, roughness: 1, transparent: true });
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, transparent: true });
    leafMat.color.setHSL(0.18 + rand() * 0.1, 0.32 + rand() * 0.2, 0.34 + rand() * 0.14);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, h, 6), trunkMat);
    trunk.position.y = h / 2;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.55, 1), leafMat);
    crown.position.y = h + h * 0.2;
    crown.scale.y = 1.15;
    t.add(trunk, crown);
    t.position.set(
      WORLD.minX + rand() * (WORLD.maxX - WORLD.minX),
      0,
      WORLD.minZ + rand() * (WORLD.maxZ - WORLD.minZ)
    );
    // keep trees off the landmark mesa
    if (Math.hypot(t.position.x - LANDMARK.x, t.position.z - LANDMARK.z) < 110) {
      t.position.x -= 200;
    }
    treeGroup.add(t);
    trees.push({ group: t, mats: [trunkMat, leafMat] });
  }
  scene.add(treeGroup);

  // --- distant hills -----------------------------------------------------
  const hillMat = new THREE.MeshStandardMaterial({ color: 0xb3a584, roughness: 1, flatShading: true });
  const hills = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = 1150 + rand() * 700;
    const cx = (WORLD.minX + WORLD.maxX) / 2 + Math.cos(a) * d * 1.4;
    const cz = Math.sin(a) * d;
    const s = 120 + rand() * 240;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 7), hillMat);
    hill.scale.y = 0.22 + rand() * 0.16;
    hill.position.set(cx, -6, cz);
    hills.add(hill);
  }
  scene.add(hills);

  // --- clouds -------------------------------------------------------------
  const cloudTex = softDiscTexture('rgba(255,250,240,0.85)', 'rgba(255,250,240,0)');
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const cl = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.5 + rand() * 0.25, depthWrite: false, fog: false })
    );
    cl.scale.set(220 + rand() * 260, 60 + rand() * 60, 1);
    cl.position.set(
      WORLD.minX + rand() * (WORLD.maxX - WORLD.minX),
      170 + rand() * 120,
      WORLD.minZ + rand() * (WORLD.maxZ - WORLD.minZ)
    );
    scene.add(cl);
    clouds.push({ sprite: cl, speed: 1.2 + rand() * 1.6 });
  }

  // --- obstacle layout: scattered rocks, then the two ridge walls ---------
  bigRockCluster(rand, 350, 70, 40, scene, obstacles);
  bigRockCluster(rand, 565, -150, 46, scene, obstacles);
  bigRockCluster(rand, 790, 95, 42, scene, obstacles);
  bigRockCluster(rand, 1010, -55, 52, scene, obstacles);
  bigRockCluster(rand, 1255, 170, 44, scene, obstacles);
  bigRockCluster(rand, 1460, -185, 50, scene, obstacles);
  bigRockCluster(rand, 1660, 45, 46, scene, obstacles);

  // Ridge A blocks the south + centre (pass to the north),
  // Ridge B then blocks the north + centre (pass back south): a gentle S.
  ridge(rand, 1900, -760, 1900, 130, scene, obstacles);
  ridge(rand, 2130, 760, 2130, -50, scene, obstacles);

  const landmark = buildLandmark(scene);

  return {
    obstacles,
    landmark,
    sunLight: dir,
    update(dt, time, trainPos, cameraPos) {
      // shadow box follows the train
      dir.position.set(trainPos.x - 110, 170, trainPos.z + 90);
      dir.target.position.copy(trainPos);
      dir.target.updateMatrixWorld();

      // clouds drift
      for (const c of clouds) {
        c.sprite.position.x += c.speed * dt;
        if (c.sprite.position.x > WORLD.maxX + 500) c.sprite.position.x = WORLD.minX - 500;
      }

      // trees fade out when they'd block the side-on camera
      for (const t of trees) {
        const d = Math.hypot(t.group.position.x - cameraPos.x, t.group.position.z - cameraPos.z);
        const o = clamp((d - 12) / 16, 0.08, 1);
        for (const m of t.mats) m.opacity = o;
      }

      // sky follows so the dome never ends
      sky.position.set(cameraPos.x, 0, cameraPos.z);
    },
  };
}

// --- collision helpers ------------------------------------------------------

function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (pz - z1) * dz) / len2;
  t = clamp(t, 0, 1);
  const cx = x1 + dx * t;
  const cz = z1 + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

export function blockedAt(obstacles, x, z, pad) {
  for (const o of obstacles) {
    if (o.type === 'circle') {
      if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
    } else {
      if (segDist(x, z, o.x1, o.z1, o.x2, o.z2) < o.w + pad) return true;
    }
  }
  return false;
}
