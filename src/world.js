import * as THREE from 'three';
import { PRAIRIE, SPLIT_X, LANDMARK, ARRIVE_RADIUS, TRAIN_HALF, clamp } from './constants.js';

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

function bigRockCluster(rand, cx, cz, r, root, obstacles) {
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
  root.add(group);
  obstacles.push({ type: 'circle', x: cx, z: cz, r });
}

function ridge(rand, x1, z1, x2, z2, root, obstacles) {
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
  root.add(group);
  obstacles.push({ type: 'seg', x1, z1, x2, z2, w: 16 });
}

function buildLandmark(root) {
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

  root.add(group);
  return group;
}

export function createWorld(scene) {
  const rand = mulberry(20260612);
  const obstacles = [];

  // Single root so the whole biome can be torn down (dispose) in one move —
  // only one biome is ever held in memory on mobile WebGL.
  const root = new THREE.Group();
  scene.add(root);

  // Two sub-chunks partitioned by x against SPLIT_X. The western chunk
  // (x < SPLIT_X) can be unloaded (disposeBefore) once the train passes the
  // mountains; the eastern chunk (x >= SPLIT_X) — mountains, tree, eastern
  // ground/scatter — stays loaded as a backtrack barrier.
  const chunkBefore = new THREE.Group();
  const chunkAfter = new THREE.Group();
  root.add(chunkBefore, chunkAfter);
  const chunkFor = (x) => (x < SPLIT_X ? chunkBefore : chunkAfter);

  // --- fog (colour is driven per-frame by the SkyCycle) -----------------
  // Stays global (not under root): the next biome installs its own fog.
  scene.fog = new THREE.Fog(0xdfe9df, 130, 560);

  // --- lights ------------------------------------------------------------
  // The hemisphere light lives in sky.js with the rest of the atmosphere;
  // this directional is the sun/moon key light — SkyCycle recolours it,
  // while the shadow box keeps following the train from here.
  const dir = new THREE.DirectionalLight(0xfff1d6, 2.25);
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
  root.add(dir);
  root.add(dir.target);

  // --- ground ----------------------------------------------------------
  // Two coplanar planes abutting at SPLIT_X so the western half can be
  // unloaded. They share the exact edge x (overlapping by a unit, kept
  // coplanar) so they meet with no visible gap and no z-fighting.
  // Both prairie grounds sit a hair below y=0 (GROUND_Y) so the grassland
  // ground (y=0) wins the depth test where they overlap at the seam, killing
  // the sand/grass flicker without a visible step. The east plane stops AT the
  // seam (PRAIRIE.maxX) rather than overrunning east into the grassland: the
  // grassland owns all ground east of the seam, and an overrunning opaque plane
  // would float over the grassland's sunken river channels and hide the water.
  const GROUND_Y = -0.05;
  const groundMargin = 1300; // half of the old +2600 generous margin
  const groundDepth = PRAIRIE.maxZ - PRAIRIE.minZ + 2600;
  // Separate materials per plane so disposeBefore() can free the west plane's
  // material without affecting the still-live east plane.
  const groundColor = 0xc9af72;

  // Positive polygonOffset pushes both prairie planes *back* in the depth
  // buffer (slope-scaled, so it holds at any zoom) — the grassland ground wins
  // their coplanar overlap with no checkerboard z-fighting, while leaving the
  // grass at neutral depth so the rivers (pulled forward) still sit on top.
  const groundOffset = { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 };

  const westW = SPLIT_X - PRAIRIE.minX + groundMargin + 1;
  const groundWest = new THREE.Mesh(
    new THREE.PlaneGeometry(westW, groundDepth),
    new THREE.MeshStandardMaterial({ color: groundColor, roughness: 1, ...groundOffset })
  );
  groundWest.rotation.x = -Math.PI / 2;
  groundWest.position.set((PRAIRIE.minX - groundMargin + SPLIT_X) / 2, GROUND_Y, 0);
  groundWest.receiveShadow = true;
  chunkBefore.add(groundWest);

  // No east skirt: stop at the seam (PRAIRIE.maxX) with a 1u overlap so the
  // grassland's ground takes over east of here without this plane occluding the
  // grassland's sunken channels.
  const eastW = PRAIRIE.maxX - SPLIT_X + 1;
  const groundEast = new THREE.Mesh(
    new THREE.PlaneGeometry(eastW, groundDepth),
    new THREE.MeshStandardMaterial({ color: groundColor, roughness: 1, ...groundOffset })
  );
  groundEast.rotation.x = -Math.PI / 2;
  groundEast.position.set((SPLIT_X + PRAIRIE.maxX + 1) / 2, GROUND_Y, 0);
  groundEast.receiveShadow = true;
  chunkAfter.add(groundEast);

  // Meadow patches — big soft tinted discs break up the plain. Each owns its
  // geometry so a west patch can be freed without touching east patches.
  const patchColors = [0xb8a868, 0xa9a673, 0x9d9c66, 0xd0b376, 0xbfa05f];
  for (let i = 0; i < 150; i++) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshStandardMaterial({
        color: patchColors[Math.floor(rand() * patchColors.length)],
        roughness: 1,
        transparent: true,
        opacity: 0.4 + rand() * 0.3,
        // translucent discs near y=0 z-fight each other and the ground in the
        // far/high map view (depth precision collapses there). depthWrite:false
        // lets them blend in stable render order; polygonOffset pulls them
        // cleanly in front of the ground at any zoom.
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    m.rotation.x = -Math.PI / 2;
    const s = 26 + rand() * 90;
    m.scale.set(s, s * (0.6 + rand() * 0.7), 1);
    m.rotation.z = rand() * Math.PI;
    m.position.set(
      PRAIRIE.minX + rand() * (PRAIRIE.maxX - PRAIRIE.minX),
      0.04,
      PRAIRIE.minZ + rand() * (PRAIRIE.maxZ - PRAIRIE.minZ)
    );
    chunkFor(m.position.x).add(m);
  }

  // --- instanced scatter ------------------------------------------------
  const dummy = new THREE.Object3D();

  // Generate every placement exactly as before (same mulberry order), then
  // bucket each instance by its x into a west / east InstancedMesh. The two
  // buckets get their own geometry+material clones so disposeBefore() can free
  // the west bucket without touching the live east one.
  function scatter(geo, mat, count, place) {
    const color = new THREE.Color();
    const before = []; // { matrix, color }
    const after = [];
    for (let i = 0; i < count; i++) {
      place(dummy, color, i);
      dummy.updateMatrix();
      const entry = { matrix: dummy.matrix.clone(), color: color.clone() };
      (dummy.position.x < SPLIT_X ? before : after).push(entry);
    }

    const buildBucket = (entries, parent, g, m) => {
      const inst = new THREE.InstancedMesh(g, m, entries.length);
      for (let i = 0; i < entries.length; i++) {
        inst.setMatrixAt(i, entries[i].matrix);
        inst.setColorAt(i, entries[i].color);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      parent.add(inst);
      return inst;
    };

    buildBucket(before, chunkBefore, geo, mat);
    buildBucket(after, chunkAfter, geo.clone(), mat.clone());
  }

  const randPos = (o) => {
    o.position.set(
      PRAIRIE.minX + rand() * (PRAIRIE.maxX - PRAIRIE.minX),
      0,
      PRAIRIE.minZ + rand() * (PRAIRIE.maxZ - PRAIRIE.minZ)
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
      PRAIRIE.minX + rand() * (PRAIRIE.maxX - PRAIRIE.minX),
      0,
      PRAIRIE.minZ + rand() * (PRAIRIE.maxZ - PRAIRIE.minZ)
    );
    // keep trees off the landmark mesa
    if (Math.hypot(t.position.x - LANDMARK.x, t.position.z - LANDMARK.z) < 110) {
      t.position.x -= 200;
    }
    chunkFor(t.position.x).add(t);
    trees.push({ group: t, mats: [trunkMat, leafMat] });
  }

  // --- distant hills -----------------------------------------------------
  // Each hill owns its geometry+material so a west hill can be freed without
  // touching the east ones.
  const hillColor = 0xb3a584;
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = 1150 + rand() * 700;
    const cx = (PRAIRIE.minX + PRAIRIE.maxX) / 2 + Math.cos(a) * d * 1.4;
    const cz = Math.sin(a) * d;
    const s = 120 + rand() * 240;
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(s, 10, 7),
      new THREE.MeshStandardMaterial({ color: hillColor, roughness: 1, flatShading: true })
    );
    hill.scale.y = 0.22 + rand() * 0.16;
    hill.position.set(cx, -6, cz);
    chunkFor(cx).add(hill);
  }

  // --- obstacle layout: scattered rocks, then the two ridge walls ---------
  // Rock clusters (x≈350–1660) are all west of SPLIT_X → chunkBefore.
  bigRockCluster(rand, 350, 70, 40, chunkBefore, obstacles);
  bigRockCluster(rand, 565, -150, 46, chunkBefore, obstacles);
  bigRockCluster(rand, 790, 95, 42, chunkBefore, obstacles);
  bigRockCluster(rand, 1010, -55, 52, chunkBefore, obstacles);
  bigRockCluster(rand, 1255, 170, 44, chunkBefore, obstacles);
  bigRockCluster(rand, 1460, -185, 50, chunkBefore, obstacles);
  bigRockCluster(rand, 1660, 45, 46, chunkBefore, obstacles);

  // Ridge A blocks the south + centre (pass to the north),
  // Ridge B then blocks the north + centre (pass back south): a gentle S.
  // Both ridges (x≈1900, 2130) are east of SPLIT_X → chunkAfter; they stay
  // loaded as the natural backtrack barrier.
  ridge(rand, 1900, -760, 1900, 130, chunkAfter, obstacles);
  ridge(rand, 2130, 760, 2130, -50, chunkAfter, obstacles);

  // The prairie landmark tree (x=2450) lives in chunkAfter.
  const landmark = buildLandmark(chunkAfter);

  // Walk a subtree, releasing every GPU buffer it owns (geometry, materials,
  // material textures, instanceColor). Handles material arrays and dedupes
  // textures so a shared texture is only released once.
  function disposeSubtree(rootObj) {
    const seenTex = new Set();
    const disposeMat = (mat) => {
      if (!mat) return;
      for (const key of Object.keys(mat)) {
        const val = mat[key];
        if (val && val.isTexture && !seenTex.has(val)) {
          seenTex.add(val);
          val.dispose();
        }
      }
      mat.dispose();
    };
    rootObj.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh || obj.isSprite) {
        if (obj.geometry) obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach(disposeMat);
        else disposeMat(mat);
        if (obj.instanceColor) obj.instanceColor.dispose?.();
      }
    });
  }

  // Frees the whole biome (both chunks + lights) and detaches root. No biome
  // geometry/material/texture should survive a transition.
  function dispose() {
    disposeSubtree(root);
    scene.remove(root);
  }

  // Unloads ONLY the western prairie chunk once the train has passed the
  // mountains: frees every GPU buffer chunkBefore owns, detaches it from root,
  // and prunes the western obstacles (center/segment x < SPLIT_X) from the
  // obstacles array in place so the caller's reference stays valid. After this,
  // only the mountains + tree + eastern ground/scatter remain.
  function disposeBefore() {
    disposeSubtree(chunkBefore);
    root.remove(chunkBefore);
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      const ox = o.type === 'circle' ? o.x : Math.min(o.x1, o.x2);
      if (ox < SPLIT_X) obstacles.splice(i, 1);
    }
  }

  return {
    obstacles,
    landmark,
    sunLight: dir,
    root,
    dispose,
    disposeBefore,
    landmarkPos: { x: LANDMARK.x, z: LANDMARK.z },
    arriveRadius: ARRIVE_RADIUS,
    start: { x: TRAIN_HALF, z: 0, heading: 0 },
    update(_dt, _time, trainPos, cameraPos) {
      // shadow box follows the train
      dir.position.set(trainPos.x - 110, 170, trainPos.z + 90);
      dir.target.position.copy(trainPos);
      dir.target.updateMatrixWorld();

      // trees fade out when they'd block the side-on camera
      for (const t of trees) {
        const d = Math.hypot(t.group.position.x - cameraPos.x, t.group.position.z - cameraPos.z);
        const o = clamp((d - 12) / 16, 0.08, 1);
        for (const m of t.mats) m.opacity = o;
      }
    },
  };
}

// --- collision helpers ------------------------------------------------------

// Distance from a point to a segment, plus the clamped parameter t (0..1) of
// the closest point along (x1,z1)->(x2,z2). The t lets callers test bridge
// gaps without recomputing the projection.
export function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (pz - z1) * dz) / len2;
  t = clamp(t, 0, 1);
  const cx = x1 + dx * t;
  const cz = z1 + dz * t;
  return { dist: Math.hypot(px - cx, pz - cz), t };
}

// Is angle `ang` inside the window [a0, a1] (radians), handling wrap past ±PI?
function angleInWindow(ang, a0, a1) {
  const TAU = Math.PI * 2;
  const norm = (x) => ((x % TAU) + TAU) % TAU;
  const a = norm(ang), lo = norm(a0), hi = norm(a1);
  return lo <= hi ? a >= lo && a <= hi : a >= lo || a <= hi;
}

export function blockedAt(obstacles, x, z, pad) {
  for (const o of obstacles) {
    if (o.type === 'circle') {
      if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
    } else if (o.type === 'ring') {
      const d = Math.hypot(x - o.x, z - o.z);
      if (d > o.rInner - pad && d < o.rOuter + pad) {
        const ang = Math.atan2(z - o.z, x - o.x);
        // a gap window (angular) marks a bridge: skip blocking there
        if (o.gaps && o.gaps.some((g) => angleInWindow(ang, g.a0, g.a1))) continue;
        return true;
      }
    } else {
      const { dist, t } = segDist(x, z, o.x1, o.z1, o.x2, o.z2);
      if (dist < o.w + pad) {
        // A `gaps: [{t0, t1}]` window marks a bridge — the closest point on
        // the seg falling inside any gap means this seg does not block here.
        if (o.gaps && o.gaps.some((g) => t >= g.t0 && t <= g.t1)) continue;
        return true;
      }
    }
  }
  return false;
}
