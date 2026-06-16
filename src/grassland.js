import * as THREE from 'three';
import { GRASSLAND, clamp } from './constants.js';
import { softDiscTexture } from './world.js';

// The grassland is the eastern region of the seamless continuous world. It sits
// EAST of the prairie (beyond the old map edge at x=2700) and shares ONE sky
// and ONE sun with the prairie. It does NOT create its own directional light
// and does NOT touch scene.fog — the shared SkyCycle drives both globally.
//
// It mirrors world.js's structure (mulberry PRNG, InstancedMesh scatter, the
// root-Group + dispose() teardown) with the dials flipped to green + water.
// Everything is placed within the GRASSLAND region so its west edge abuts the
// prairie's east ground cleanly at x=2700.

// Grassland-specific landmark (the second magic tree) and arrival ring, in the
// far east of the region so the player drives toward it from the west.
const GRASS_LANDMARK = { x: GRASSLAND.maxX - 250, z: 0 }; // ≈ 5400
const GRASS_ARRIVE_RADIUS = 95;

// Deterministic PRNG so the grassland looks the same every run. Seed differs
// from the prairie's so the two lands don't share scatter patterns.
function mulberry(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A tileable water-ripple NORMAL map. Heights come from a few integer-frequency
// sine waves (periodic over the tile, so it repeats seamlessly); the per-pixel
// gradient becomes the surface normal. Tiled to ~square world cells (see the
// repeat() calls below) so ripples stay round instead of smearing down the long
// thin channel, and scrolled in update() to suggest flow. This is the standard
// three.js water trick — scroll a tiling normal map over a flat surface (what
// THREE.Water does, minus the planar reflections).
function waterNormalTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const TAU = Math.PI * 2;
  // periodic wave components — integer (fx, fy) guarantees a seamless tile
  const waves = [
    { fx: 1, fy: 2, a: 1.0, p: 0.0 },
    { fx: 2, fy: -1, a: 0.7, p: 1.7 },
    { fx: 3, fy: 2, a: 0.5, p: 3.1 },
    { fx: -2, fy: 3, a: 0.4, p: 0.6 },
  ];
  const height = (x, y) => {
    let h = 0;
    for (const w of waves) h += w.a * Math.sin((TAU * (w.fx * x + w.fy * y)) / S + w.p);
    return h;
  };
  const strength = 2.2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // central differences with wrap -> normals stay seamless across the seam
      let nx = (height((x - 1 + S) % S, y) - height((x + 1) % S, y)) * strength;
      let ny = (height(x, (y - 1 + S) % S) - height(x, (y + 1) % S)) * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv;
      ny *= inv;
      const i = (y * S + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = inv * 255; // nz * 255, and nz = 1 * inv
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // normal maps are linear data, not colour — keep them out of sRGB
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

// Mossy boulder cluster — the grassland's answer to world.js's bigRockCluster.
// Green-tinted stone domes that read as overgrown rocks. Pushes a circle.
function mossyBoulders(rand, cx, cz, r, root, obstacles) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6f7a5c, roughness: 0.96, flatShading: true });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x586349, roughness: 0.96, flatShading: true });
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = r * (0.32 + rand() * 0.45);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rand() > 0.5 ? mat : matDark);
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.55;
    rock.position.set(cx + Math.cos(a) * d, s * 0.4, cz + Math.sin(a) * d);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.scale.y = 0.55 + rand() * 0.4;
    rock.castShadow = true;
    group.add(rock);
  }
  root.add(group);
  obstacles.push({ type: 'circle', x: cx, z: cz, r });
}

// The second magic tree — a re-skin of world.js's buildLandmark. Same
// silhouette family (knoll + trunk + leaf blobs + glowing accents + halo) but
// cooler: a green grassy knoll, silver/blue blossom, cool glowing accents. All
// fog:false so it reads as a far silhouette on the horizon when approaching
// from the west.
function buildGrassLandmark(root) {
  const group = new THREE.Group();
  group.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);

  const knollMat = new THREE.MeshStandardMaterial({ color: 0x5f8a4c, roughness: 0.95, fog: false, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a5340, roughness: 0.9, fog: false });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0xc6d6e8, roughness: 0.7, fog: false, emissive: 0x9fb6d8, emissiveIntensity: 0.4, flatShading: true,
  });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xbfe6ff, emissive: 0x7fc4ff, emissiveIntensity: 2.2, fog: false,
  });

  // Grassy knoll instead of the prairie's red mesa.
  const knoll = new THREE.Mesh(new THREE.CylinderGeometry(46, 64, 16, 9), knollMat);
  knoll.position.y = 8;
  group.add(knoll);

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

  // A cool halo sprite so it glows even as a far silhouette.
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softDiscTexture('rgba(150,200,255,0.55)', 'rgba(150,200,255,0)'),
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

export function createGrassland(scene) {
  const rand = mulberry(20260616);
  const obstacles = [];

  // Single root so the whole biome can be torn down (dispose) in one move —
  // only one biome is ever held in memory on mobile WebGL.
  const root = new THREE.Group();
  scene.add(root);

  // NOTE: no scene.fog assignment and no DirectionalLight here. In the seamless
  // continuous world there is ONE sun (the prairie's) and ONE fog (the shared
  // SkyCycle's); the grassland is lit by that shared sun and must not stomp the
  // global atmosphere.

  // Region extents — everything is placed inside the GRASSLAND region so the
  // west edge abuts the prairie's east ground at x=GRASSLAND.minX (2700).
  const xMin = GRASSLAND.minX;
  const xMax = GRASSLAND.maxX;
  const zMin = GRASSLAND.minZ;
  const zMax = GRASSLAND.maxZ;
  const xSpan = xMax - xMin;
  const zSpan = zMax - zMin;
  const cxRegion = (xMin + xMax) / 2;

  const randX = () => xMin + rand() * xSpan;
  const randZ = () => zMin + rand() * zSpan;

  // --- channel cross-section ---------------------------------------------
  // Sunken-riverbed profile, shared by straight rivers and the tree ring.
  const DEPTH = 7;            // channel floor sits at y = -DEPTH
  const BANK = 24;            // bank slope width (lip -> floor) for rivers
  const FOOT = 18 + BANK;     // river channel footprint half-width (w + BANK)
  const smooth = (t) => t * t * (3 - 2 * t); // smoothstep 0..1
  // height as a function of distance `d` from the channel centre line,
  // given flat-floor half-width `w` and slope width `bank`.
  const channelY = (d, w, bank) => {
    if (d <= w) return -DEPTH;
    if (d >= w + bank) return 0;
    return -DEPTH * (1 - smooth((d - w) / bank));
  };
  const groundMat = () => new THREE.MeshStandardMaterial({ color: 0x5a8a44, roughness: 1 });

  // --- ground (lush green, replacing the prairie's dry gold) -------------
  // Sized to the region with a small east/south/north overscan, but the WEST
  // edge is pinned to xMin (2700) so it meets the prairie ground coplanar with
  // a ~1u overlap rather than leaving a gap or z-fighting seam.
  // --- ground: flat panels split by the river channels --------------------
  // A channel below y=0 would be hidden by a flat ground plane, so the ground
  // is built as flat panels (y=0) with the river channels filling the gaps
  // between them. The east panel carries the tree and gets a circular hole for
  // the sunken ring channel.
  const overEast = 2600;
  const overlapW = 1;
  const groundWestX = xMin - overlapW;              // 2699
  const groundEastX = xMax + overEast;              // 8250
  const planeD = zSpan + overEast;                  // full N/S depth (4160)
  const riverXs = [xMin + 420, xMin + 1180, xMin + 1980];
  // Panel x-spans: [west .. riverA-FOOT], between consecutive rivers, and the
  // big east panel from riverC+FOOT to the east edge.
  const edges = [groundWestX];
  for (const rx of riverXs) { edges.push(rx - FOOT, rx + FOOT); }
  edges.push(groundEastX);
  // edges = [west, A-, A+, B-, B+, C-, C+, east]; panels are pairs (0,1)(2,3)(4,5)(6,7)
  const treeHoleR = 230; // = ring R_OUTER; the ring channel fills this hole
  for (let p = 0; p < edges.length; p += 2) {
    const x0 = edges[p], x1 = edges[p + 1];
    const w = x1 - x0;
    const isEast = p + 2 >= edges.length; // last panel holds the tree
    let mesh;
    if (isEast) {
      // east panel: rectangle with a circular hole around the landmark
      const shape = new THREE.Shape();
      shape.moveTo(x0, -planeD / 2);
      shape.lineTo(x1, -planeD / 2);
      shape.lineTo(x1, planeD / 2);
      shape.lineTo(x0, planeD / 2);
      shape.lineTo(x0, -planeD / 2);
      const hole = new THREE.Path();
      hole.absarc(GRASS_LANDMARK.x, GRASS_LANDMARK.z, treeHoleR, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geo = new THREE.ShapeGeometry(shape, 64);
      geo.rotateX(-Math.PI / 2); // shape is in XY -> lay flat into XZ
      mesh = new THREE.Mesh(geo, groundMat());
      // after rotateX, shape-Y maps to world -Z; flip Z back to keep orientation
      mesh.scale.z = -1;
    } else {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, planeD), groundMat());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((x0 + x1) / 2, 0, 0);
    }
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  // island disc under the knoll (flat at y=0), filling the hole's centre
  {
    const island = new THREE.Mesh(new THREE.CircleGeometry(150, 48), groundMat());
    island.rotation.x = -Math.PI / 2;
    island.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);
    island.receiveShadow = true;
    root.add(island);
  }

  // Meadow patches — big soft tinted green discs break up the plain.
  const patchGeo = new THREE.CircleGeometry(1, 20);
  const patchColors = [0x6fa050, 0x528a3e, 0x77a85a, 0x4f7d3c, 0x82b066];
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
    m.position.set(randX(), 0.04 + i * 0.0004, randZ());
    patches.add(m);
  }
  root.add(patches);

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
    root.add(inst);
    return inst;
  }

  const randPos = (o) => {
    o.position.set(randX(), 0, randZ());
  };

  // grass tufts — fresh green (hue ~0.28) instead of the prairie's olive ~0.13
  scatter(
    new THREE.ConeGeometry(0.5, 1.2, 5),
    new THREE.MeshStandardMaterial({ roughness: 1 }),
    2000,
    (o, c) => {
      randPos(o);
      const s = 0.6 + rand() * 1.2;
      o.scale.set(s, s * (0.8 + rand() * 0.9), s);
      o.position.y = (o.scale.y * 1.2) / 2 - 0.05;
      o.rotation.y = rand() * Math.PI;
      c.setHSL(0.28 + rand() * 0.07, 0.45 + rand() * 0.22, 0.4 + rand() * 0.16);
    }
  );

  // bushes — green
  scatter(
    new THREE.IcosahedronGeometry(0.9, 1),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    360,
    (o, c) => {
      randPos(o);
      const s = 0.9 + rand() * 1.7;
      o.scale.set(s, s * 0.65, s);
      o.position.y = s * 0.4;
      o.rotation.y = rand() * Math.PI;
      c.setHSL(0.27 + rand() * 0.06, 0.34 + rand() * 0.18, 0.3 + rand() * 0.12);
    }
  );

  // grassy hummocks — low green-tinted domes (replace the desert stones)
  scatter(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    220,
    (o, c) => {
      randPos(o);
      const s = 1.2 + rand() * 2.6;
      o.scale.set(s, s * (0.32 + rand() * 0.2), s);
      o.position.y = o.scale.y * 0.5 - 0.2;
      o.rotation.y = rand() * Math.PI;
      c.setHSL(0.28 + rand() * 0.05, 0.4 + rand() * 0.15, 0.32 + rand() * 0.1);
    }
  );

  // wildflowers — brighter and denser than the prairie
  scatter(
    new THREE.SphereGeometry(0.16, 6, 5),
    new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    700,
    (o, c) => {
      randPos(o);
      o.scale.setScalar(0.9 + rand() * 1.3);
      o.position.y = 0.35;
      const pick = rand();
      const hue = pick < 0.34 ? 0.0 : pick < 0.67 ? 0.13 : 0.78; // red, gold, violet
      c.setHSL(hue, 0.9, 0.65 + rand() * 0.12);
    }
  );

  // --- rivers + water + bridges ----------------------------------------
  // Each river is one vertical seg spanning the full N-S extent of the region,
  // running from south (minZ, t=0) to north (maxZ, t=1) so gap t-values read
  // intuitively. One bridge gap per river; the gap side escalates so the player
  // must scout the bank to find each crossing.
  const riverColor = new THREE.Color(0x3f78a8);
  const waters = []; // { mat } for animated flow in update()

  const riverDefs = [
    { x: xMin + 420, w: 18, gaps: [{ t0: 0.58, t1: 0.62 }] }, // A ≈3120, bridge just N of centre
    { x: xMin + 1180, w: 18, gaps: [{ t0: 0.29, t1: 0.33 }] }, // B ≈3880, bridge down south
    { x: xMin + 1980, w: 18, gaps: [{ t0: 0.52, t1: 0.56 }] }, // C ≈4680, near centre
  ];

  const waterGeo = new THREE.PlaneGeometry(1, 1);

  for (const def of riverDefs) {
    // collision: impassable seg with a bridge gap (south -> north)
    obstacles.push({ type: 'seg', x1: def.x, z1: zMin, x2: def.x, z2: zMax, w: def.w, gaps: def.gaps });

    // sunken channel strip: a plane across the river width, vertices displaced
    // down into the valley profile (flat lip at y=0 meets the panel edges).
    {
      const cgeo = new THREE.PlaneGeometry(FOOT * 2, planeD, 24, 1);
      cgeo.rotateX(-Math.PI / 2); // local x -> world x, local y -> world -z
      const cpos = cgeo.attributes.position;
      for (let i = 0; i < cpos.count; i++) {
        cpos.setY(i, channelY(Math.abs(cpos.getX(i)), def.w, BANK));
      }
      cpos.needsUpdate = true;
      cgeo.computeVertexNormals();
      const chan = new THREE.Mesh(cgeo, groundMat());
      chan.position.set(def.x, 0, 0);
      chan.receiveShadow = true;
      root.add(chan);
    }

    // water surface — a long thin translucent plane laid over the river line,
    // sitting just above ground. A tiling ripple normal map is scrolled along
    // its length to suggest flow.
    const ripple = waterNormalTexture();
    // Tile to ~square world cells so ripples stay round, not smeared: U runs
    // down the river's length (world Z, = zSpan), V across its width (def.w*2).
    // Same world-units-per-tile (TILE) on both axes => isotropic ripples.
    const TILE = 22;
    ripple.repeat.set(zSpan / TILE, (def.w * 2.0) / TILE);
    const waterMat = new THREE.MeshStandardMaterial({
      color: riverColor,
      roughness: 0.3,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85,
      normalMap: ripple,
      normalScale: new THREE.Vector2(0.55, 0.55),
      fog: true,
      // pull the water forward in the depth buffer so it stays on top of the
      // grass ground at any zoom (the small world-space y=0.12 lift alone
      // vanishes in the far/high map view where depth precision collapses).
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.rotation.z = Math.PI / 2; // align the plane's long axis with N-S (z)
    water.scale.set(zSpan, def.w * 2.0, 1);
    water.position.set(def.x, 0.12, (zMin + zMax) / 2);
    root.add(water);
    waters.push({ mat: waterMat, axis: 'x' }); // flows down-river (along U)

    // bridge deck — a low arched plank/stone deck across each gap, in warm
    // wood tones to contrast the cool water. Built from a few short raised
    // planks following a shallow arc.
    const g = def.gaps[0];
    const gapZ0 = zMin + zSpan * g.t0;
    const gapZ1 = zMin + zSpan * g.t1;
    const gapMidZ = (gapZ0 + gapZ1) / 2;
    const gapLen = gapZ1 - gapZ0;
    const deckGroup = new THREE.Group();
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.85, flatShading: true });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9, flatShading: true });
    // The river runs N-S (Z), so the crossing goes E-W (X): the deck spans the
    // river width bank-to-bank along X, and the path is as wide as the gap (Z).
    const deckW = def.w * 2.6; // spans the river width (X), bank to bank
    const pathZ = gapLen;      // crossing-path width along the river's length (Z)
    const planks = 7;
    for (let i = 0; i < planks; i++) {
      const t = i / (planks - 1);
      const arch = Math.sin(t * Math.PI) * 1.6; // shallow arc, peak mid-river
      const plank = new THREE.Mesh(new THREE.BoxGeometry(deckW / planks + 1.2, 0.5, pathZ), deckMat);
      plank.position.set(def.x - deckW / 2 + deckW * t, 0.9 + arch, gapMidZ);
      plank.castShadow = true;
      deckGroup.add(plank);
    }
    // low side rails — run bank-to-bank (along X) on the up/down-river edges
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(deckW + 2, 1.0, 0.5), railMat);
      rail.position.set(def.x, 1.8, gapMidZ + side * pathZ * 0.5);
      deckGroup.add(rail);
    }
    root.add(deckGroup);

    // reedy/cattail clusters along the banks (thin cones), skipping the gap
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x4f6b3a, roughness: 1, flatShading: true });
    const reedTopMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1, flatShading: true });
    const reedGeo = new THREE.ConeGeometry(0.3, 4.5, 4);
    const reedTopGeo = new THREE.ConeGeometry(0.5, 1.4, 5);
    for (let i = 0; i < 90; i++) {
      const t = rand();
      const z = zMin + zSpan * t;
      if (t >= g.t0 - 0.02 && t <= g.t1 + 0.02) continue; // keep the crossing clear
      const side = rand() > 0.5 ? 1 : -1;
      const offX = def.x + side * (def.w + 2 + rand() * 6);
      const offZ = z + (rand() - 0.5) * 8;
      const reed = new THREE.Mesh(reedGeo, reedMat);
      reed.position.set(offX, 2.2, offZ);
      reed.rotation.z = (rand() - 0.5) * 0.18;
      root.add(reed);
      const top = new THREE.Mesh(reedTopGeo, reedTopMat);
      top.position.set(offX, 4.2, offZ);
      root.add(top);
    }

    // lily-pad discs floating on the water, skipping the gap
    const padMat = new THREE.MeshStandardMaterial({ color: 0x4f8a4e, roughness: 0.85, side: THREE.DoubleSide });
    const padGeo = new THREE.CircleGeometry(1, 10);
    for (let i = 0; i < 30; i++) {
      const t = rand();
      if (t >= g.t0 - 0.02 && t <= g.t1 + 0.02) continue;
      const z = zMin + zSpan * t;
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.rotation.x = -Math.PI / 2;
      const s = 1.4 + rand() * 2.2;
      pad.scale.set(s, s, 1);
      pad.position.set(def.x + (rand() - 0.5) * def.w * 1.4, 0.14, z);
      root.add(pad);
    }
  }

  // --- ring channel terrain (sunken annulus around the tree) --------------
  // Grassy banks slope from the island edge (r=150) and outer ground (r=230)
  // down to the channel floor near r=190. The water + bridges are added later.
  {
    const R_INNER = 150, R_OUTER = 230, R_MID = 190, W_RING = 18, BANK_RING = 22;
    const rgeo = new THREE.RingGeometry(R_INNER, R_OUTER, 72, 14);
    rgeo.rotateX(-Math.PI / 2); // ring lies in XZ
    const rpos = rgeo.attributes.position;
    for (let i = 0; i < rpos.count; i++) {
      const r = Math.hypot(rpos.getX(i), rpos.getZ(i)); // distance from centre
      rpos.setY(i, channelY(Math.abs(r - R_MID), W_RING, BANK_RING));
    }
    rpos.needsUpdate = true;
    rgeo.computeVertexNormals();
    const ringTerrain = new THREE.Mesh(rgeo, groundMat());
    ringTerrain.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);
    ringTerrain.receiveShadow = true;
    root.add(ringTerrain);
  }

  // Cosmetic-only delta water ringing the tree island (NO obstacle) so the
  // tree reads as sitting on a delta island. Kept thin and well clear of the
  // open approach so it never blocks reaching the tree.
  {
    const ripple = waterNormalTexture();
    ripple.repeat.set(54, 4); // ~square cells around (U=angle) and across (V=radial)
    const deltaMat = new THREE.MeshStandardMaterial({
      color: riverColor, roughness: 0.3, metalness: 0.15,
      transparent: true, opacity: 0.72,
      normalMap: ripple, normalScale: new THREE.Vector2(0.55, 0.55),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    waters.push({ mat: deltaMat, axis: 'y' }); // radial flow across the annulus
    // a flat ring (annulus) of water around the knoll, raised just above ground
    const ring = new THREE.Mesh(new THREE.RingGeometry(150, 230, 48), deltaMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(GRASS_LANDMARK.x, 0.1, GRASS_LANDMARK.z);
    root.add(ring);
  }

  // --- willows (individual, so they can fade near the camera) -----------
  // Drooping, vertically-stretched icosahedron crowns over slim trunks.
  const trees = [];
  const treeGroup = new THREE.Group();
  for (let i = 0; i < 70; i++) {
    const t = new THREE.Group();
    const h = 5 + rand() * 6;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a5236, roughness: 1, transparent: true });
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, transparent: true });
    leafMat.color.setHSL(0.27 + rand() * 0.06, 0.36 + rand() * 0.16, 0.32 + rand() * 0.12);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, h, 6), trunkMat);
    trunk.position.y = h / 2;
    // drooping willow crown: stretched downward, wider than tall at the skirt
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.5, 1), leafMat);
    crown.position.y = h + h * 0.05;
    crown.scale.set(1.25, 1.7, 1.25); // vertically stretched (drooping)
    const skirt = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.38, 1), leafMat);
    skirt.position.y = h * 0.7;
    skirt.scale.set(1.5, 1.9, 1.5);
    t.add(trunk, crown, skirt);
    t.position.set(randX(), 0, randZ());
    // keep willows off the landmark knoll
    if (Math.hypot(t.position.x - GRASS_LANDMARK.x, t.position.z - GRASS_LANDMARK.z) < 130) {
      t.position.x -= 240;
    }
    treeGroup.add(t);
    trees.push({ group: t, mats: [trunkMat, leafMat] });
  }
  root.add(treeGroup);

  // --- distant hills (green) --------------------------------------------
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x6f9655, roughness: 1, flatShading: true });
  const hills = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = 1150 + rand() * 700;
    const cx = cxRegion + Math.cos(a) * d * 1.4;
    const cz = Math.sin(a) * d;
    const s = 120 + rand() * 240;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 7), hillMat);
    hill.scale.y = 0.22 + rand() * 0.16;
    hill.position.set(cx, -6, cz);
    hills.add(hill);
  }
  root.add(hills);

  // --- mossy-boulder clusters between rivers (kept clear of bridge lanes) --
  // Bridge lanes: River A gap ~z+156, River B ~z-296, River C ~z+62. These
  // clusters sit between adjacent rivers and well off those lanes and off the
  // straight east-bound path to each gap.
  mossyBoulders(rand, xMin + 800, -180, 46, root, obstacles); // between A & B, north of B's lane
  mossyBoulders(rand, xMin + 1580, 380, 50, root, obstacles); // between B & C, north of C's lane

  const landmark = buildGrassLandmark(root);

  // Walk the root, releasing every GPU buffer it owns, then detach it. No
  // biome geometry/material/texture should survive a transition.
  function dispose() {
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
    root.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh || obj.isSprite) {
        if (obj.geometry) obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach(disposeMat);
        else disposeMat(mat);
        if (obj.instanceColor) obj.instanceColor.dispose?.();
      }
    });
    scene.remove(root);
  }

  return {
    root,
    dispose,
    obstacles,
    landmark,
    landmarkPos: { x: GRASS_LANDMARK.x, z: GRASS_LANDMARK.z },
    arriveRadius: GRASS_ARRIVE_RADIUS,
    update(_dt, time, trainPos, cameraPos) {
      // No directional light here — the shared world sun lights the grassland,
      // and world.update() already follows the train everywhere. We only
      // animate water and fade willows near the side-on camera.

      // animate water flow: slow-scroll the ripple normal map's offset over time
      // along each water's own axis ('x' = down-river, 'y' = radial for the ring)
      for (const w of waters) {
        const off = (time * 0.04) % 1;
        const axis = w.axis || 'y';
        const tex = w.mat.normalMap || w.mat.map;
        if (tex) tex.offset[axis] = off;
      }

      // willows/trees fade out when they'd block the side-on camera
      for (const t of trees) {
        const d = Math.hypot(t.group.position.x - cameraPos.x, t.group.position.z - cameraPos.z);
        const o = clamp((d - 12) / 16, 0.08, 1);
        for (const m of t.mats) m.opacity = o;
      }
    },
  };
}
