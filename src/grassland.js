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
  const S = 256;
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
    { fx: 4, fy: -3, a: 0.3, p: 4.4 },
    { fx: -1, fy: 4, a: 0.25, p: 2.2 },
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

// Approximate a meandering river with a chain of `nSegs` straight collision
// segs. Endpoints sample `centerXAt` at nSegs+1 evenly-spaced z values (shared
// joints, so no pinholes; gentle bends mean seg width covers the kinks).
//
// A river carries GLOBAL bridge gaps `def.gaps: [{t0,t1}]` measured over the
// full z-run (t=0 at zMin, t=1 at zMin+zSpan). Each seg only spans a slice of
// that run, so we remap every global gap into the seg's own local t-space,
// working in z: the global window [t0,t1] is the z-band
// [zMin + t0*zSpan, zMin + t1*zSpan]; intersect it with the seg's z-range and
// convert the overlap to that seg's local t fractions. (Because z varies
// linearly along a seg, z↔local-t is exact along the seg; mapping the gap's
// z-window is the intended approximation — the closest point's z on a gently
// tilted seg is ~its query z.) Segs the window misses get no gaps.
export function chainRiverSegs(def, zMin, zSpan, centerXAt, nSegs = 12) {
  const zNode = (k) => zMin + (k / nSegs) * zSpan;
  const segs = [];
  for (let k = 0; k < nSegs; k++) {
    const za = zNode(k), zb = zNode(k + 1); // south -> north, zb > za
    const seg = { type: 'seg', x1: centerXAt(za), z1: za, x2: centerXAt(zb), z2: zb, w: def.w };
    const localGaps = [];
    for (const g of def.gaps || []) {
      const gz0 = zMin + g.t0 * zSpan;
      const gz1 = zMin + g.t1 * zSpan;
      const lo = Math.max(gz0, za);
      const hi = Math.min(gz1, zb);
      if (lo < hi) localGaps.push({ t0: (lo - za) / (zb - za), t1: (hi - za) / (zb - za) });
    }
    if (localGaps.length) seg.gaps = localGaps;
    segs.push(seg);
  }
  return segs;
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
  const RIVER_W = 18;         // river flat-floor half-width (shared w)
  const FOOT = RIVER_W + BANK; // river channel footprint half-width (w + BANK)
  const smooth = (t) => t * t * (3 - 2 * t); // smoothstep 0..1
  // height as a function of distance `d` from the channel centre line,
  // given flat-floor half-width `w` and slope width `bank`.
  const channelY = (d, w, bank) => {
    if (d <= w) return -DEPTH;
    if (d >= w + bank) return 0;
    return -DEPTH * (1 - smooth((d - w) / bank));
  };
  const WATER_Y = -DEPTH + 0.6; // water surface: 0.6 above the channel floor
  const groundMat = () => new THREE.MeshStandardMaterial({ color: 0x6a9148, roughness: 1 });
  // Shore treatment palette for the vertex-colored channel strips: lip green ->
  // wet-mud floor, with a pale highlight right at the waterline. Baked per
  // vertex below (MeshStandardMaterial multiplies vertex colors by
  // material.color, so the strip material's base color is set to white).
  const shoreLip = new THREE.Color(0x6a9148);
  const shoreMud = new THREE.Color(0x4f5a34);
  const shorePale = new THREE.Color(0x79a35b);

  // --- river definitions + centerline ------------------------------------
  // Each river meanders as a gentle sine wave around its base x. `amp` is the
  // peak side-to-side swing, `waves` the number of half-cycles over the N-S
  // run, `phase` the starting offset. Defined up here (ahead of the ground
  // panels) because the panel cuts, onWater(), the channel/water geometry and
  // the collision chain all derive from the same centerline — routing them
  // through riverCenterX keeps every dependent locked to the true river path.
  const riverDefs = [
    { x: xMin + 420, w: RIVER_W, amp: 45, waves: 2.0, phase: 0.4, gaps: [{ t0: 0.58, t1: 0.62 }] }, // A ≈3120, bridge just N of centre
    { x: xMin + 1180, w: RIVER_W, amp: 60, waves: 1.5, phase: 2.1, gaps: [{ t0: 0.29, t1: 0.33 }] }, // B ≈3880, bridge down south
    { x: xMin + 1980, w: RIVER_W, amp: 40, waves: 2.5, phase: 5.0, gaps: [{ t0: 0.52, t1: 0.56 }] }, // C ≈4680, near centre
  ];
  const riverCenterX = (def, z) =>
    def.x + def.amp * Math.sin(((z - zMin) / zSpan) * Math.PI * def.waves + def.phase);

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
  // Panel x-spans: [west .. riverA-cut], between consecutive rivers, and the
  // big east panel from riverC+cut to the east edge. The cut widens from FOOT
  // to FOOT + amp because the meandering valley swings ±amp about the base x
  // and must stay inside its straight-edged strip. Derived from riverDefs so
  // the cut positions can never drift from the centerline.
  const edges = [groundWestX];
  for (const def of riverDefs) { edges.push(def.x - (FOOT + def.amp), def.x + (FOOT + def.amp)); }
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

  // Is (x,z) over a sunken water channel? Scatter (grass, bushes, flowers,
  // patches, willows) is placed at y≈0, so anything landing on a channel would
  // hover above the recessed water. Used to reject/re-roll those positions.
  const onWater = (x, z) => {
    for (const def of riverDefs) if (Math.abs(x - riverCenterX(def, z)) < FOOT + 3) return true;
    const dr = Math.hypot(x - GRASS_LANDMARK.x, z - GRASS_LANDMARK.z);
    return dr > 150 - 3 && dr < 230 + 3; // the ring channel annulus
  };
  // a random ground position that isn't over a channel (re-roll, capped)
  const randClearXZ = () => {
    let x = randX(), z = randZ(), n = 0;
    while (onWater(x, z) && ++n < 10) { x = randX(); z = randZ(); }
    return { x, z };
  };

  // Meadow patches — big soft tinted green discs break up the plain. These are
  // translucent and (intentionally) overlap each other and the ground, all
  // near y=0. Relying on a tiny per-disc y-lift to order them z-fights badly in
  // the far/high map view where depth precision collapses (the same problem the
  // river water solves below). So: depthWrite:false to stop the discs fighting
  // each other (they blend in stable render order instead), and polygonOffset to
  // pull them cleanly in front of the ground plane at any zoom.
  const patchGeo = new THREE.CircleGeometry(1, 20);
  const patchColors = [0x7fae5c, 0x55803c, 0x8fbc6e, 0x4a7136, 0x9cc078];
  const patches = new THREE.Group();
  for (let i = 0; i < 150; i++) {
    const m = new THREE.Mesh(
      patchGeo,
      new THREE.MeshStandardMaterial({
        color: patchColors[Math.floor(rand() * patchColors.length)],
        roughness: 1,
        transparent: true,
        opacity: 0.35 + rand() * 0.35,
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
    const pp = randClearXZ();
    m.position.set(pp.x, 0.04, pp.z);
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
    const { x, z } = randClearXZ();
    o.position.set(x, 0, z);
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
      c.setHSL(0.26 + rand() * 0.06, 0.35 + rand() * 0.15, 0.34 + rand() * 0.10);
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
  // Each river meanders as a sine wave (riverCenterX, defined above) around its
  // base x over the full N-S extent, running from south (minZ, t=0) to north
  // (maxZ, t=1) so gap t-values read intuitively. One bridge gap per river; the
  // gap side escalates so the player must scout the bank to find each crossing.
  const riverColor = new THREE.Color(0x5b93a8);
  const waters = []; // { mat, axis, dir } for animated flow in update(); dir
  // flips the scroll direction (the dense overlay layer scrolls opposite the
  // base layer so their tiling never lines up into a visible lattice)

  // Cattail clumps: one InstancedMesh for every stalk across all three rivers
  // and one for every seed head, so the whole biome pays for two draw calls
  // instead of ~90 individual reed meshes. Two-pass build: the per-river loop
  // below only pushes placements (matrix + color) into these arrays in
  // deterministic rand order; the InstancedMeshes are sized from the final
  // array lengths and filled once, after all rivers have contributed (see
  // "cattail InstancedMesh build" after the loop).
  const cattailStalkMatrices = [];
  const cattailStalkColors = [];
  const cattailHeadMatrices = [];
  const CLUMPS_PER_RIVER = 28;

  for (const def of riverDefs) {
    // collision: the meander approximated by a chain of 12 straight segs whose
    // endpoints sample the centerline; the bridge gap is remapped into each
    // sub-seg's local t-space (see chainRiverSegs).
    for (const s of chainRiverSegs(def, zMin, zSpan, (z) => riverCenterX(def, z))) obstacles.push(s);

    // sunken channel strip: a straight-edged plane wide enough to hold the
    // meandering valley (FOOT + amp each side of the base x), its vertices
    // displaced down into the valley profile keyed off distance from the
    // centerline. The strip is subdivided finely along z (96) so the meander
    // reads as a smooth curved trench; the outer edges stay at y=0 and meet the
    // flat panels exactly (there the centerline is at most `amp` away, so the
    // distance is >= FOOT and channelY returns 0). After rotateX(-PI/2) the
    // plane's local x is the world x-offset and the position z is world z.
    {
      const cgeo = new THREE.PlaneGeometry((FOOT + def.amp) * 2, planeD, 48, 96);
      cgeo.rotateX(-Math.PI / 2); // local x -> world x, local y -> world -z
      const cpos = cgeo.attributes.position;
      // shore treatment: bake a lip-green -> wet-mud vertex color keyed off the
      // same depth just displaced, with a pale highlight right at the waterline
      const ccolor = new Float32Array(cpos.count * 3);
      const tmpColor = new THREE.Color();
      for (let i = 0; i < cpos.count; i++) {
        const xWorld = def.x + cpos.getX(i);
        const zWorld = cpos.getZ(i);
        const y = channelY(Math.abs(xWorld - riverCenterX(def, zWorld)), def.w, BANK);
        cpos.setY(i, y);
        const depthFrac = clamp(-y / DEPTH, 0, 1);
        tmpColor.copy(shoreLip).lerp(shoreMud, depthFrac);
        if (depthFrac < 0.12) tmpColor.lerp(shorePale, 0.25);
        ccolor[i * 3] = tmpColor.r;
        ccolor[i * 3 + 1] = tmpColor.g;
        ccolor[i * 3 + 2] = tmpColor.b;
      }
      cpos.needsUpdate = true;
      cgeo.setAttribute('color', new THREE.BufferAttribute(ccolor, 3));
      cgeo.computeVertexNormals();
      // base color white — MeshStandardMaterial multiplies vertex colors by
      // material.color, so white lets the baked-in green/mud show true. A
      // dedicated instance per river (not the shared groundMat()) so the flat
      // panels elsewhere keep their plain green.
      const chanMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true });
      const chan = new THREE.Mesh(cgeo, chanMat);
      chan.position.set(def.x, 0, 0);
      chan.receiveShadow = true;
      root.add(chan);
    }

    // water surface — a long thin translucent plane laid over the river line,
    // sitting just above ground. A tiling ripple normal map is scrolled along
    // its length to suggest flow.
    const ripple = waterNormalTexture();
    // Tile to ~square world cells so ripples stay round, not smeared. The plane
    // (below) has its U along the width (def.w*2) and V down the length (world
    // Z, planeD — the plane's actual length, not the region-only zSpan). Same
    // world-units-per-tile (TILE) on both axes => isotropic ripples; flow
    // scrolls V (down the river).
    const TILE = 30;
    ripple.repeat.set((def.w * 2.0) / TILE, planeD / TILE);
    const waterMat = new THREE.MeshStandardMaterial({
      color: riverColor,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.7,
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
    // A thin plane subdivided down its length; each vertex sheared in x onto
    // the centerline so the water ribbon follows the meander. Long axis (planeD)
    // is the plane's height -> world z after rotateX; width is def.w*2.
    const wgeo = new THREE.PlaneGeometry(def.w * 2.0, planeD, 1, 96);
    wgeo.rotateX(-Math.PI / 2); // local x -> world x-offset, local y -> world z
    const wpos = wgeo.attributes.position;
    for (let i = 0; i < wpos.count; i++) {
      const zWorld = wpos.getZ(i);
      wpos.setX(i, wpos.getX(i) + (riverCenterX(def, zWorld) - def.x));
    }
    wpos.needsUpdate = true;
    const water = new THREE.Mesh(wgeo, waterMat);
    water.position.set(def.x, WATER_Y, 0); // on the channel floor
    root.add(water);
    waters.push({ mat: waterMat, axis: 'y' }); // flow scrolls V (down the river)

    // second, denser ripple layer scrolling the OPPOSITE direction — two
    // overlapping tilings almost never line up, which is what actually kills
    // the visible repeating lattice (one layer alone always shows its tile).
    // Shares the same sheared geometry as the base layer (same mesh shape,
    // just nudged up) rather than re-shearing a duplicate.
    const ripple2 = waterNormalTexture();
    ripple2.repeat.set(((def.w * 2.0) / TILE) * 2.6, (planeD / TILE) * 2.6);
    const waterMat2 = new THREE.MeshStandardMaterial({
      color: riverColor,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      normalMap: ripple2,
      normalScale: new THREE.Vector2(0.4, 0.4),
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const water2 = new THREE.Mesh(wgeo, waterMat2);
    water2.position.set(def.x, WATER_Y + 0.06, 0);
    root.add(water2);
    waters.push({ mat: waterMat2, axis: 'y', dir: -1 }); // opposite scroll direction

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
    // full banked channel along X (footprint FOOT each side + a little onto the
    // grass lips), and the path is as wide as the gap (Z).
    const deckW = FOOT * 2 + 8; // spans the sunken channel bank-to-bank (X)
    const pathZ = gapLen;       // crossing-path width along the river's length (Z)
    const deckCx = riverCenterX(def, gapMidZ); // deck centres on the meandering channel
    const planks = 9;
    for (let i = 0; i < planks; i++) {
      const t = i / (planks - 1);
      const arch = Math.sin(t * Math.PI) * 0.8; // shallow arc, peak mid-river
      const plank = new THREE.Mesh(new THREE.BoxGeometry(deckW / planks + 1.2, 0.5, pathZ), deckMat);
      plank.position.set(deckCx - deckW / 2 + deckW * t, 0.3 + arch, gapMidZ);
      plank.castShadow = true;
      deckGroup.add(plank);
    }
    // low side rails — run bank-to-bank (along X) on the up/down-river edges
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(deckW + 2, 1.0, 0.5), railMat);
      rail.position.set(deckCx, 1.1, gapMidZ + side * pathZ * 0.5);
      deckGroup.add(rail);
    }
    root.add(deckGroup);

    // Cattail clumps: 28 clump sites along the bank slope near the waterline,
    // skipping the bridge crossing. Each clump is 3-6 leaning stalks with 1-2
    // seed heads riding the tips of the tallest ones. Only placements (matrix +
    // color) are pushed here — see the InstancedMesh build after this loop.
    for (let i = 0; i < CLUMPS_PER_RIVER; i++) {
      const t = rand();
      if (t >= g.t0 - 0.03 && t <= g.t1 + 0.03) continue; // keep the crossing clear
      const z = zMin + zSpan * t;
      const side = rand() < 0.5 ? -1 : 1;
      const dist = RIVER_W + 3 + rand() * 10; // on the bank slope near the waterline
      const baseX = riverCenterX(def, z) + side * dist;
      const baseY = channelY(dist, def.w, BANK) - 0.1; // sink stalk bases into the bank
      const stalkCount = 3 + Math.floor(rand() * 4); // 3-6 stalks per clump
      const headCount = Math.min(stalkCount, 1 + Math.floor(rand() * 2)); // 1-2 heads
      for (let s = 0; s < stalkCount; s++) {
        const a = rand() * Math.PI * 2;
        const r = rand() * 1.2; // tight jitter so stalks read as one clump
        const height = 1.6 + rand() * 1.0;
        dummy.position.set(baseX + Math.cos(a) * r, baseY + height / 2, z + Math.sin(a) * r);
        // spin about a random compass heading, then lean ±0.25 rad off vertical
        // — together these tip the stalk toward a random horizontal direction.
        dummy.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, 0);
        dummy.scale.set(1, height, 1); // CylinderGeometry is unit-height; stretch to 1.6-2.6
        dummy.updateMatrix();
        cattailStalkMatrices.push(dummy.matrix.clone());
        cattailStalkColors.push(
          new THREE.Color().setHSL(
            0.26 + (rand() - 0.5) * 0.06,
            0.45 + (rand() - 0.5) * 0.2,
            0.35 + (rand() - 0.5) * 0.16
          )
        );
        if (s < headCount) {
          // The seed head inherits the stalk's full transform: apply the
          // stalk's matrix to the local top of the unit-height cylinder
          // (y=0.5) to get the tip in world space, then nudge along the same
          // lean's up-axis by half the capsule's height so it sits ON the
          // tip rather than centred through it.
          const tip = new THREE.Vector3(0, 0.5, 0).applyMatrix4(dummy.matrix);
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(dummy.quaternion);
          const head = new THREE.Object3D();
          head.position.copy(tip).addScaledVector(up, 0.32);
          head.quaternion.copy(dummy.quaternion);
          head.updateMatrix();
          cattailHeadMatrices.push(head.matrix.clone());
        }
      }
    }

    // lily pads cluster into pools rather than scattering uniformly across the
    // whole river — 4 pool sites per river, each a loose cluster of 5-9 pads
    // within a small radius, centred on the meandering centerline at that z.
    const padGeo = new THREE.CircleGeometry(1, 10);
    const POOLS_PER_RIVER = 4;
    for (let p = 0; p < POOLS_PER_RIVER; p++) {
      let t = rand(), n = 0;
      // re-roll (capped, like randClearXZ) if the site lands near the bridge gap
      while (t >= g.t0 - 0.05 && t <= g.t1 + 0.05 && ++n < 10) t = rand();
      const poolZ = zMin + zSpan * t;
      const poolCx = riverCenterX(def, poolZ);
      const poolR = 6 + rand() * 4; // 6-10u pool radius
      const padsN = 5 + Math.floor(rand() * 5); // 5-9 pads per pool
      for (let i = 0; i < padsN; i++) {
        const a = rand() * Math.PI * 2;
        const d = rand() * poolR;
        const dx = clamp(Math.cos(a) * d, -def.w * 0.8, def.w * 0.8); // keep pads over water
        const pad = new THREE.Mesh(
          padGeo,
          new THREE.MeshStandardMaterial({
            // jitter each pad's color around a lily-pad green
            color: new THREE.Color().setHSL(
              0.3 + (rand() - 0.5) * 0.08,
              0.4 + (rand() - 0.5) * 0.2,
              0.35 + (rand() - 0.5) * 0.16
            ),
            roughness: 0.85,
            side: THREE.DoubleSide,
          })
        );
        pad.rotation.x = -Math.PI / 2;
        const s = 1.4 + rand() * 2.2;
        pad.scale.set(s, s, 1);
        pad.position.set(poolCx + dx, WATER_Y + 0.04, poolZ + Math.sin(a) * d); // on WATER_Y
        root.add(pad);
      }
    }
  }

  // --- cattail InstancedMesh build ----------------------------------------
  // Size and fill the two InstancedMeshes from the placements the river loop
  // above pushed into cattailStalkMatrices/Colors and cattailHeadMatrices.
  {
    const stalkGeo = new THREE.CylinderGeometry(0.06, 0.11, 1, 5);
    const stalkMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
    const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, cattailStalkMatrices.length);
    for (let i = 0; i < cattailStalkMatrices.length; i++) {
      stalks.setMatrixAt(i, cattailStalkMatrices[i]);
      stalks.setColorAt(i, cattailStalkColors[i]);
    }
    stalks.instanceMatrix.needsUpdate = true;
    if (stalks.instanceColor) stalks.instanceColor.needsUpdate = true;
    root.add(stalks);

    // Seed heads are a uniform tan, so no per-instance color is needed —
    // the material's own color carries it.
    const headGeo = new THREE.CapsuleGeometry(0.09, 0.45, 3, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, cattailHeadMatrices.length);
    for (let i = 0; i < cattailHeadMatrices.length; i++) heads.setMatrixAt(i, cattailHeadMatrices[i]);
    heads.instanceMatrix.needsUpdate = true;
    root.add(heads);
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

  // ring water — a flat annulus sitting on the channel floor, sunken below the
  // banks; same scrolling-ripple trick as the rivers.
  {
    const ripple = waterNormalTexture();
    ripple.repeat.set(54, 4);
    const deltaMat = new THREE.MeshStandardMaterial({
      color: riverColor, roughness: 0.25, metalness: 0.1,
      transparent: true, opacity: 0.7,
      normalMap: ripple, normalScale: new THREE.Vector2(0.55, 0.55),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    waters.push({ mat: deltaMat, axis: 'y' }); // radial flow across the annulus
    // fill the flat floor band (R_MID +/- W_RING = 172..208)
    const ring = new THREE.Mesh(new THREE.RingGeometry(172, 208, 48), deltaMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(GRASS_LANDMARK.x, WATER_Y, GRASS_LANDMARK.z); // WATER_Y
    root.add(ring);
  }

  // ring collision: impassable annulus with two bridge gaps (north +z, south -z)
  {
    const GAP_A = 0.16; // angular half-gap
    obstacles.push({
      type: 'ring', x: GRASS_LANDMARK.x, z: GRASS_LANDMARK.z, rInner: 150, rOuter: 230,
      gaps: [
        { a0: Math.PI / 2 - GAP_A, a1: Math.PI / 2 + GAP_A },   // north (+z)
        { a0: -Math.PI / 2 - GAP_A, a1: -Math.PI / 2 + GAP_A }, // south (-z)
      ],
    });

    // two bridge decks crossing the channel radially at north and south, at the
    // train's level. Each runs from the island edge (r=150) to outer (r=230)
    // along z, planks stepping across that span, long axis along x.
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.85, flatShading: true });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9, flatShading: true });
    const rIn = 150, rOut = 230, span = rOut - rIn; // 80
    const deckW = 30;   // path width (tangential, along x)
    const planks = 9;
    for (const dir of [1, -1]) { // +1 = north (+z), -1 = south (-z)
      const deck = new THREE.Group();
      for (let i = 0; i < planks; i++) {
        const t = i / (planks - 1);
        const r = rIn + span * t;                 // distance from centre
        const arch = Math.sin(t * Math.PI) * 0.8; // shallow arc, peak mid-span
        const plank = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.5, span / planks + 1.2), deckMat);
        plank.position.set(GRASS_LANDMARK.x, 0.3 + arch, GRASS_LANDMARK.z + dir * r);
        plank.castShadow = true;
        deck.add(plank);
      }
      for (const side of [-1, 1]) { // side rails along the path (offset in x)
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, span + 2), railMat);
        rail.position.set(GRASS_LANDMARK.x + side * deckW * 0.5, 1.1, GRASS_LANDMARK.z + dir * (rIn + span / 2));
        deck.add(rail);
      }
      root.add(deck);
    }
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
    // keep willows off the channels and off the landmark knoll
    let wx = randX(), wz = randZ(), n = 0;
    while (n++ < 12 && (onWater(wx, wz) ||
           Math.hypot(wx - GRASS_LANDMARK.x, wz - GRASS_LANDMARK.z) < 130)) {
      wx = randX(); wz = randZ();
    }
    t.position.set(wx, 0, wz);
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
    // Keep the green hills east of the prairie border. Their wide scatter
    // (±~2600) otherwise overflows west onto the prairie and its tree, which now
    // coexist in the streamed world — those big green domes were the "floating
    // mountain" over the prairie knoll. (−s so a large hill body can't reach
    // across either.) West of here the player sees the real prairie, not a
    // backdrop, so dropping the western few hills costs nothing.
    if (cx - s < GRASSLAND.minX) continue;
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
      // along each water's own axis ('x' = down-river, 'y' = radial for the ring).
      // `dir` (default 1) flips the scroll for the dense overlay layer so its
      // tiling drifts opposite the base layer instead of lining up with it.
      for (const w of waters) {
        const dir = w.dir || 1;
        const off = (time * 0.04 * dir) % 1;
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
