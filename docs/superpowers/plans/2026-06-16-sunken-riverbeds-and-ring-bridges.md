# Sunken riverbeds + impassable tree-ring with two bridges — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the grassland tree-ring impassable with two bridges, and give every grassland water body a sunken bed with grassy banks so bridges span the channel at ground level.

**Architecture:** Collision gets a new analytic `ring` shape (annulus + angular gaps) alongside `circle`/`seg`. The grassland ground stops being one flat plane: the three straight rivers split it into 4 flat panels with displaced channel-strip meshes between them, and the east panel is built with a circular hole that an annular ring-channel mesh fills. Water surfaces drop to the channel floor (y≈-6.4); bridge decks sit near the train's level (y≈0).

**Tech Stack:** three.js (r0.16x), Vite, Node's built-in test runner (`node --test`).

**Delegation (subagents, isolated context):**
- **Agent A** → Task 1 only (`src/world.js` + `test/collision.test.js`). Separate file, runs in **parallel**.
- **Agent B** → Tasks 2 and 3 (both in `src/grassland.js`, one agent so there's no intra-file edit conflict). Runs in parallel with Agent A.

**Shared constants** (use these exact values across tasks):
- `DEPTH = 7` — channel floor at `y = -7`.
- `WATER_Y = -6.4` — water surface (just below the lip).
- River water half-width `W_RIVER = 18` (existing `def.w`), bank slope width `BANK = 24` → channel footprint half-width `FOOT = 42`.
- Ring: `R_INNER = 150`, `R_OUTER = 230`, mid-radius `R_MID = 190`, ring flat-floor half-band `W_RING = 18`, slope band `BANK_RING = 22`.
- Ring bridge angular half-gap `GAP_A = 0.16` rad; north gap centered `+π/2` (`+z`), south gap centered `−π/2` (`−z`).

---

## Task 1: `ring` collision type (`src/world.js`) + tests

**Files:**
- Modify: `src/world.js` (function `blockedAt`, ~line 495)
- Test: `test/collision.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/collision.test.js`:

```js
// A ring (annulus) centered at origin, band r=150..230, with one bridge gap
// centered on +z (angle +PI/2), half-width 0.16 rad.
const ringObs = () => [{
  type: 'ring', x: 0, z: 0, rInner: 150, rOuter: 230,
  gaps: [{ a0: Math.PI / 2 - 0.16, a1: Math.PI / 2 + 0.16 }],
}];

test('point inside the ring band off-gap is blocked', () => {
  // due east (angle 0), radius 190 -> inside band, not in the +z gap
  assert.equal(blockedAt(ringObs(), 190, 0, 0), true);
});

test('point inside the ring band within the gap is not blocked', () => {
  // due north (+z, angle +PI/2), radius 190 -> inside the bridge gap
  assert.equal(blockedAt(ringObs(), 0, 190, 0), false);
});

test('point inside the inner radius (island) is not blocked', () => {
  assert.equal(blockedAt(ringObs(), 100, 0, 0), false);
});

test('point outside the outer radius is not blocked', () => {
  assert.equal(blockedAt(ringObs(), 300, 0, 0), false);
});

test('a ring gap window that wraps past PI is handled', () => {
  // gap centered on PI (due west). A point due west should be in the gap.
  const o = [{ type: 'ring', x: 0, z: 0, rInner: 150, rOuter: 230,
    gaps: [{ a0: Math.PI - 0.16, a1: -Math.PI + 0.16 }] }];
  assert.equal(blockedAt(o, -190, 0, 0), false); // due west, in wrapped gap
  assert.equal(blockedAt(o, 190, 0, 0), true);   // due east, blocked
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test test/collision.test.js`
Expected: the 5 new tests FAIL (the `ring` branch doesn't exist yet, so `blockedAt` returns `false` for the band points and the "blocked" assertions fail).

- [ ] **Step 3: Implement the `ring` branch**

In `src/world.js`, add this helper just above `export function blockedAt`:

```js
// Is angle `ang` inside the window [a0, a1] (radians), handling wrap past ±PI?
function angleInWindow(ang, a0, a1) {
  const TAU = Math.PI * 2;
  const norm = (x) => ((x % TAU) + TAU) % TAU;
  const a = norm(ang), lo = norm(a0), hi = norm(a1);
  return lo <= hi ? a >= lo && a <= hi : a >= lo || a <= hi;
}
```

Then extend `blockedAt`. Replace the `if (o.type === 'circle') { ... } else { ... }` body so there are three branches:

```js
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
        if (o.gaps && o.gaps.some((g) => t >= g.t0 && t <= g.t1)) continue;
        return true;
      }
    }
  }
  return false;
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `node --test test/collision.test.js`
Expected: PASS (all original + 5 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/world.js test/collision.test.js
git commit -m "Collision: add ring (annulus + angular gaps) obstacle type"
```

---

## Task 2: Grassland terrain — panels, river channels, holed east panel, island, ring channel (`src/grassland.js`)

No node unit test (this code needs `document`/WebGL; it runs only in the browser). Verification is `npm run build` success + the visual check in Task 3.

**Files:**
- Modify: `src/grassland.js` — the ground block (~201-221), and add a shared profile helper + a channel builder near the top of `createGrassland`.

- [ ] **Step 1: Add the shared cross-section helpers**

Inside `createGrassland`, after the `randX`/`randZ` definitions (~line 195), add:

```js
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
```

- [ ] **Step 2: Replace the single ground plane with 4 panels + island + holed east panel**

The current ground block (the `{ ... }` from `const overEast = 2600;` through `root.add(ground);`, ~lines 201-221) must be REPLACED with the following. River centre-lines are `xMin + {420, 1180, 1980}`; panels are split at each river's `±FOOT`.

```js
  // --- ground: flat panels split by the river channels --------------------
  // A channel below y=0 would be hidden by a flat ground plane, so the ground
  // is built as flat panels (y=0) with the river channels (Task: river strips)
  // filling the gaps between them. The east panel carries the tree and gets a
  // circular hole for the sunken ring channel.
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
  const treeHoleR = 230; // = R_OUTER; the ring channel fills this hole
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
      // ShapeGeometry uses shape coords as-is; after rotateX the Y becomes -Z,
      // so flip Z back so the panel keeps world orientation.
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
```

NOTE on the `ShapeGeometry` orientation: after `geo.rotateX(-Math.PI/2)`, shape-Y maps to world `-Z`. Setting `mesh.scale.z = -1` restores world Z. If, on visual inspection, the hole appears mirrored N/S (it is radially symmetric so this is cosmetic only), the `scale.z = -1` line can be dropped — but keep it for consistency with reed/pad Z placement done in Task 3.

- [ ] **Step 3: Add the three river channel strips**

Inside the existing `for (const def of riverDefs)` loop, right after the `obstacles.push({ type: 'seg', ... })` line (~line 346), insert a channel-strip mesh:

```js
    // sunken channel strip: a plane across the river width, vertices displaced
    // down into the valley profile (flat lip at y=0 meets the panel edges).
    {
      const cgeo = new THREE.PlaneGeometry(FOOT * 2, planeD, 24, 1);
      cgeo.rotateX(-Math.PI / 2); // local x -> world x, local y -> world -z
      const pos = cgeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, channelY(Math.abs(pos.getX(i)), def.w, BANK));
      }
      pos.needsUpdate = true;
      cgeo.computeVertexNormals();
      const chan = new THREE.Mesh(cgeo, groundMat());
      chan.position.set(def.x, 0, 0);
      chan.receiveShadow = true;
      root.add(chan);
    }
```

- [ ] **Step 4: Add the ring channel annulus**

Replace the cosmetic ring block (~lines 450-468, the `// Cosmetic-only delta water...` `{ ... }`). For THIS task, replace ONLY the ground/terrain part: build the sunken annulus terrain here. (The water surface + flow registration are rebuilt in Task 3, immediately after.) Replace the whole block's body with:

```js
  // --- ring channel terrain (sunken annulus around the tree) --------------
  // Grassy banks slope from the island edge (r=150) and outer ground (r=230)
  // down to the channel floor near r=190. The water + bridges are added next.
  {
    const R_INNER = 150, R_OUTER = 230, R_MID = 190, W_RING = 18, BANK_RING = 22;
    const rgeo = new THREE.RingGeometry(R_INNER, R_OUTER, 72, 14);
    rgeo.rotateX(-Math.PI / 2); // ring lies in XZ
    const pos = rgeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i)); // distance from centre
      pos.setY(i, channelY(Math.abs(r - R_MID), W_RING, BANK_RING));
    }
    pos.needsUpdate = true;
    rgeo.computeVertexNormals();
    const ringTerrain = new THREE.Mesh(rgeo, groundMat());
    ringTerrain.position.set(GRASS_LANDMARK.x, 0, GRASS_LANDMARK.z);
    ringTerrain.receiveShadow = true;
    root.add(ringTerrain);
  }
```

- [ ] **Step 5: Build and verify no errors**

Run: `npm run build`
Expected: build succeeds (Vite emits `dist/` with no errors). This confirms the THREE API calls (`ShapeGeometry`, `RingGeometry`, attribute mutation) are valid.

- [ ] **Step 6: Commit**

```bash
git add src/grassland.js
git commit -m "Grassland: carve sunken channels + ring valley into the ground"
```

---

## Task 3: Grassland water depth, lowered decks, ring water + two bridges + collision (`src/grassland.js`)

**Files:**
- Modify: `src/grassland.js` — river water/deck/reed/pad placement inside the river loop; ring water + bridges + obstacle after the ring-terrain block.

- [ ] **Step 1: Sink the river water surface**

In the river loop, change the water mesh position from `water.position.set(def.x, 0.12, (zMin + zMax) / 2);` to:

```js
    water.position.set(def.x, -6.4, (zMin + zMax) / 2); // WATER_Y: channel floor
```

- [ ] **Step 2: Lower the river bridge decks toward the lip**

In the river loop's deck section, change the plank arch/height and the rails so the deck sits at the train's level. Replace:

```js
      const arch = Math.sin(t * Math.PI) * 1.6; // shallow arc, peak mid-river
      const plank = new THREE.Mesh(new THREE.BoxGeometry(deckW / planks + 1.2, 0.5, pathZ), deckMat);
      plank.position.set(def.x - deckW / 2 + deckW * t, 0.9 + arch, gapMidZ);
```

with:

```js
      const arch = Math.sin(t * Math.PI) * 0.8; // shallow arc, peak mid-river
      const plank = new THREE.Mesh(new THREE.BoxGeometry(deckW / planks + 1.2, 0.5, pathZ), deckMat);
      plank.position.set(def.x - deckW / 2 + deckW * t, 0.3 + arch, gapMidZ);
```

and change the rail height from `rail.position.set(def.x, 1.8, gapMidZ + side * pathZ * 0.5);` to:

```js
      rail.position.set(def.x, 1.1, gapMidZ + side * pathZ * 0.5);
```

- [ ] **Step 3: Keep reeds on the lip, pads on the water**

In the river loop, reeds are placed at `offX = def.x + side * (def.w + 2 + rand() * 6);` — that lands them on the slope. Move them just outside the channel footprint so they stand on flat ground, and lily pads onto the sunken water surface.

Change the reed offset line to:

```js
      const offX = def.x + side * (FOOT + 2 + rand() * 6); // stand on the flat lip
```

Change the reed base/top heights `reed.position.set(offX, 2.2, offZ);` and `top.position.set(offX, 4.2, offZ);` — these stay at y=0-relative heights (the lip is y=0), so they are unchanged.

Change the lily-pad placement so pads sit on the sunken water within the flat floor:

```js
      pad.position.set(def.x + (rand() - 0.5) * def.w * 1.6, -6.36, z); // on WATER_Y
```

(replacing the existing `pad.position.set(def.x + (rand() - 0.5) * def.w * 1.4, 0.14, z);`)

- [ ] **Step 4: Add the sunken ring water surface + flow registration**

Immediately AFTER the ring-terrain block added in Task 2 Step 4, add the ring water (a flat annulus on the channel floor) and register it for flow animation:

```js
  // ring water — a flat annulus sitting on the channel floor, sunken below the
  // banks; same scrolling-ripple trick as the rivers.
  {
    const ripple = waterNormalTexture();
    ripple.repeat.set(54, 4);
    const deltaMat = new THREE.MeshStandardMaterial({
      color: riverColor, roughness: 0.3, metalness: 0.15,
      transparent: true, opacity: 0.85,
      normalMap: ripple, normalScale: new THREE.Vector2(0.55, 0.55),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    waters.push({ mat: deltaMat, axis: 'y' }); // radial flow across the annulus
    // fill the flat floor band (R_MID ± W_RING = 172..208)
    const ring = new THREE.Mesh(new THREE.RingGeometry(172, 208, 48), deltaMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(GRASS_LANDMARK.x, -6.4, GRASS_LANDMARK.z); // WATER_Y
    root.add(ring);
  }
```

- [ ] **Step 5: Make the ring impassable + add the two bridges**

Add, right after the ring water block:

```js
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
```

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Visual verification (run the app)**

Start the dev server (`npm run dev`) and open the grassland. Use the debug hooks (`window.__game`, `?ts=` time-scrub) to drive to tree #2. Confirm:
- The train CANNOT cross the ring water except on the north and south bridges.
- The train CANNOT cross the three rivers except on their bridges.
- The channels read as sunken, with grassy banks sloping down to the water.
- Bridge decks sit at the train's level (the train rolls across, not over flat water).

- [ ] **Step 8: Commit**

```bash
git add src/grassland.js
git commit -m "Grassland: sink water into channels, impassable ring + 2 bridges"
```

---

## Self-review notes

- **Spec coverage:** ring impassable + 2 bridges (Task 3 Step 5) ✓; sunken beds with banks for rivers (Task 2 Step 3, Task 3 Steps 1-3) ✓ and ring (Task 2 Step 4, Task 3 Step 4) ✓; bridges at ground level (Task 3 Steps 2 & 5, y≈0.3+arch) ✓; new `ring` collision type + tests (Task 1) ✓.
- **Type consistency:** obstacle shape `{type:'ring', x, z, rInner, rOuter, gaps:[{a0,a1}]}` is identical in the Task 1 test, the Task 1 implementation, and the Task 3 push. `channelY(d, w, bank)` signature is consistent across river and ring use.
- **Depth constants:** `WATER_Y = -6.4` is hard-coded in the water positions (Task 3 Steps 1, 4); `DEPTH = 7` drives the terrain floor (Task 2). These differ by 0.6 by design (water sits just below the lip-to-floor, above the -7 floor).
- **Known cosmetic risk:** `ShapeGeometry` hole orientation (`mesh.scale.z = -1`) — radially symmetric, so only matters for consistency; flagged inline in Task 2 Step 2.
