# Grassland Art Pass — Implementation Plan

**Status:** Approved (user approved the full critique proposal, 2026-07-09)
**Builds on:** `docs/superpowers/specs/2026-06-16-grassland-second-map-design.md` (§5 aesthetics)
**Branch:** `grassland-art-pass`

The grassland (map 2, `src/grassland.js`) works mechanically but reads flat and
toy-like next to the prairie's art pass. This plan implements the approved
critique: activate the dead grassland sky palette, de-tile the water, meander
the rivers, reskin reeds/palette, restyle bridges as causeways, dress the
finale tree, and fix floating willows + the ring-water UV bug.

## Global Constraints

- **Aesthetic:** cozy low-poly flat-shaded look. Match the prairie's idioms:
  `MeshStandardMaterial`, canvas-generated textures only, `flatShading` on
  chunky shapes, HSL-jittered instance colors.
- **Determinism:** all placement randomness comes from the existing `mulberry`
  PRNG (`rand`). NEVER use `Math.random()` or `Date.now()`.
- **One shared sky/sun:** `grassland.js` must not add lights and must not touch
  `scene.fog`. Only Task 1 (inside `SkyCycle`) may change atmosphere.
- **Mobile WebGL budget:** keep object counts in the same order of magnitude.
  Prefer `InstancedMesh` for anything repeated more than ~40 times. No new
  per-frame allocations in any `update()` path (reuse scratch objects).
- **Teardown:** everything added under the grassland `root` must be freed by
  the existing `dispose()` walk (geometry + material + material textures).
  Shared geometries between meshes are fine (double-dispose is harmless).
- **Tests:** `npm test` must pass after every task. New pure helpers (e.g. the
  gap-mapping in Task 2) get unit tests in `test/`.
- **Verification:** `npm test` and `npx vite build` must both succeed.

---

## Task 1 — Activate the grassland sky as a positional crossfade

**Files:** `src/sky.js` (main), `src/constants.js` (two new exports).

`KEYS_GRASSLAND` (`sky.js:50`) and `setBiome()` (`sky.js:358`) are dead code —
nothing calls `setBiome`, so the grassland renders under the prairie's warm
dusty sky forever. The fade-to-black transition that `setBiome`'s comment
assumes was replaced by seamless streaming; a hard swap would pop. Replace it
with a positional crossfade.

1. In `constants.js` add:
   ```js
   // The sky palette crossfades from prairie to grassland over this x-band
   // (starts at the prairie tree, completes shortly into the grassland).
   export const BIOME_FADE = { startX: 2450, endX: 3000 };
   ```
2. In `SkyCycle`:
   - Add `this.biomeBlend = 0` (0 = prairie palette, 1 = grassland palette).
   - In `update(dt, elapsed, camera, trainPos, sceneFog)` set
     `this.biomeBlend = smootherstep((trainPos.x - BIOME_FADE.startX) / (BIOME_FADE.endX - BIOME_FADE.startX))`
     (import `smootherstep` from constants; it already clamps).
   - Change `#sample(phase, out)` to sample **both** palette tables and lerp
     every channel by `biomeBlend`: colors via `out.c.copy(a).lerp(b, t)`
     idiom, scalars via `lerp`. When `biomeBlend` is exactly 0 or 1, skip the
     second sample (fast path). Reuse persistent scratch objects
     (`this._kA`, `this._kB`) — zero per-frame allocation. Both tables share
     identical `t` keyframes, so the same bracketing index works for both.
   - Delete `setBiome()` and the `PALETTES` lookup / `this.biome` field; the
     blend is now purely positional. Update the comments accordingly
     (`this.keys` becomes the two tables `KEYS` / `KEYS_GRASSLAND` used by the
     blend).
3. Grep for other `sky.setBiome` / `.biome` consumers before deleting (only
   `main.js:379` calls `audio.setBiome`, which stays).

**Acceptance:** with the train at x ≤ 2450 the rendered sky is bit-identical
to today; at x ≥ 3000 it is the full `KEYS_GRASSLAND` mood; smooth in between;
no allocation in the frame path; `npm test` and `npx vite build` pass.

---

## Task 2 — Meander the rivers (structural)

**Files:** `src/grassland.js` (main), `test/collision.test.js` or a new test
file for the exported helper.

Each river is currently one dead-straight 1,560-unit seg. Give each a gentle
sine meander. Everything that references a river's x must go through a
centerline function.

1. Extend `riverDefs`:
   ```js
   const riverDefs = [
     { x: xMin + 420,  w: RIVER_W, amp: 45, waves: 2.0, phase: 0.4, gaps: [{ t0: 0.58, t1: 0.62 }] },
     { x: xMin + 1180, w: RIVER_W, amp: 60, waves: 1.5, phase: 2.1, gaps: [{ t0: 0.29, t1: 0.33 }] },
     { x: xMin + 1980, w: RIVER_W, amp: 40, waves: 2.5, phase: 5.0, gaps: [{ t0: 0.52, t1: 0.56 }] },
   ];
   const riverCenterX = (def, z) =>
     def.x + def.amp * Math.sin(((z - zMin) / zSpan) * Math.PI * def.waves + def.phase);
   ```
2. **Ground panels:** the panel cut for each river widens from
   `def.x ± FOOT` to `def.x ± (FOOT + def.amp)` (the meandering valley lives
   inside a straight-edged strip). Update `riverXs`-based `edges` accordingly
   (make `edges` derive from `riverDefs` so the values can't drift apart).
3. **Channel strip:** for each river build
   `PlaneGeometry((FOOT + def.amp) * 2, planeD, 48, 96)` (was 24×1), rotate
   flat as now, then displace each vertex:
   `y = channelY(Math.abs(xWorld - riverCenterX(def, zWorld)), def.w, BANK)`
   where `xWorld = def.x + localX`, `zWorld = -localY-after-rotation` (keep
   the existing rotate-then-displace pattern; after `rotateX(-PI/2)` the
   plane's local x is world x-offset and the position attribute's z is world
   z). The strip's outer edges stay at y = 0 and meet the flat panels exactly.
   `computeVertexNormals()` after displacement, as now.
4. **Water plane:** replace the single unsubdivided plane with
   `PlaneGeometry(def.w * 2, planeD, 1, 96)`, `rotateX(-PI/2)`, then shear
   each vertex's x by `riverCenterX(def, zWorld) - def.x`; mesh positioned at
   `(def.x, WATER_Y, 0)`. Set the ripple repeat so tiles stay ~square with
   V running down the length: `ripple.repeat.set((def.w * 2) / TILE, zSpan / TILE)`
   and change that river's `waters` entry to `axis: 'y'` (flow scrolls V).
5. **Collision:** replace each river's single seg with a chain of 12 segs
   whose endpoints sample `riverCenterX` at 13 evenly spaced z values
   (shared endpoints, no pinholes; bends are gentle so seg width covers
   joints). Export a pure helper from `grassland.js`:
   ```js
   export function chainRiverSegs(def, zMin, zSpan, centerXAt, nSegs = 12)
   ```
   returning the seg objects **with the global gap windows remapped into each
   sub-seg's local t-space** (a global gap [t0,t1] over the full z-run maps to
   the overlapping sub-seg(s); segs outside the window get no gaps). Unit-test
   this helper: gap fully inside one sub-seg; gap straddling two sub-segs;
   `blockedAt` returns false at the gap centre and true just outside it, for
   a chained meandering river.
6. **Dependents (keep working, styling comes later):**
   - `onWater(x, z)`: `Math.abs(x - riverCenterX(def, z)) < FOOT + 3`.
   - Bridge deck group: centre the deck at
     `x = riverCenterX(def, gapMidZ)` (deck still spans `FOOT * 2 + 8`).
   - Reeds: `offX = riverCenterX(def, z) + side * (FOOT + 2 + rand() * 6)`.
   - Lily pads: `x = riverCenterX(def, z) + (rand() - 0.5) * def.w * 1.6`.

**Acceptance:** `npm test` passes including new helper tests; the three
rivers meander visibly in the map view; the train can still be routed across
each bridge gap (blockedAt false at each gap centre); panels/channel meet with
no holes at any zoom.

---

## Task 3 — Water: de-tile, lighten, shore treatment, lily pools

**Files:** `src/grassland.js`.

Depends on Task 2 (water geometry is the sheared plane; channel strip is the
displaced 48×96 grid).

1. **Richer, larger ripple tile:** in `waterNormalTexture()` raise the canvas
   to `S = 256`, extend `waves` with two more components
   (`{fx: 4, fy: -3, a: 0.3, p: 4.4}, {fx: -1, fy: 4, a: 0.25, p: 2.2}`), and
   change `TILE` from 22 to 30 everywhere it's used.
2. **Two-layer scroll (kills the visible repeat):** per river, add a second
   water mesh sharing the same sheared geometry, 0.06 above the first, with
   its own `waterNormalTexture()`: `repeat` 2.6× denser than the base layer,
   `opacity 0.18`, `depthWrite: false`, `normalScale (0.4, 0.4)`, same
   polygonOffset. Register it in `waters` with the opposite scroll direction
   (negate its offset each frame — extend the `waters` entry with a
   `dir: -1` field and use `tex.offset[axis] = off * w.dir` — keep `% 1`
   semantics; `(time * 0.04 * w.dir) % 1` is fine, negative offsets wrap).
3. **Color/translucency:** `riverColor` `0x3f78a8` → `0x5b93a8`; base layer
   `opacity 0.7`, `roughness 0.25`, `metalness 0.1`. Apply to the ring water
   material too.
4. **Shore treatment (vertex colors on the channel strip):** enable
   `vertexColors: true` on each channel strip's material and per vertex lerp
   from the ground green `#5a8a44` at the lip (y = 0) to wet mud `#4f5a34` at
   the channel floor (y = -DEPTH), by depth fraction `-y / DEPTH`. Add a
   subtle pale lip highlight: vertices with depth fraction < 0.12 lerp 25%
   toward `#79a35b`. (MeshStandardMaterial multiplies vertexColors by
   `material.color` — set the strip material's base color to white when
   vertexColors are on, and bake the green into the vertex colors.)
5. **Lily pools:** replace the 30 uniformly scattered pads per river with 4
   pool sites per river (rand z, re-roll if within ±0.05 of the gap window),
   each pool 5–9 pads within a 6–10 u radius, pads still on `WATER_Y + 0.04`,
   x centred on `riverCenterX(def, poolZ)` and clamped inside `±def.w * 0.8`.
   Jitter pad color: `HSL(0.30 ± 0.04, 0.4 ± 0.1, 0.35 ± 0.08)`.
6. **Ring water:** apply the same material changes (color, opacity,
   roughness); leave its UV bug alone — Task 7 fixes it.

**Acceptance:** no visible repeating lattice from map height or bank height;
water reads translucent blue-green with a darker floor visible through it;
mud band + pale lip read along both banks; pads cluster in pools; dispose
still frees every texture (each layer owns its texture); tests + build pass.

---

## Task 4 — Cattail clumps + calmer scatter palette

**Files:** `src/grassland.js`.

Depends on Task 2 (`riverCenterX`, `channelY`).

1. **Delete the lamp-post reeds** (the 90 single 4.5u cones with brown tops).
2. **Cattail clumps, instanced:** per river, 28 clump sites: `t = rand()`,
   skip if within ±0.03 of the gap window; side = rand sign;
   `dist = RIVER_W + 3 + rand() * 10` (on the bank slope near the waterline);
   `baseX = riverCenterX(def, z) + side * dist`;
   `baseY = channelY(dist, def.w, BANK)` (sink stalk bases 0.1 into the bank).
   Each clump has 3–6 stalks. Build ONE `InstancedMesh` for all stalks across
   all rivers and ONE for all seed heads (count the placements first, then
   fill):
   - stalk: `CylinderGeometry(0.06, 0.11, 1, 5)` scaled per instance to
     height 1.6–2.6, color `HSL(0.26 ± 0.03, 0.45 ± 0.10, 0.35 ± 0.08)`;
     lean each stalk by rotating ±0.25 rad about a random horizontal axis.
   - seed head on 1–2 stalks per clump: `CapsuleGeometry(0.09, 0.45, 3, 6)`
     (or a small cylinder if capsule reads badly at this scale), color
     `#8a6a42`, positioned at that stalk's tip, inheriting its lean.
3. **Calm the grass tufts:** `c.setHSL(0.26 + rand() * 0.06, 0.35 + rand() * 0.15, 0.34 + rand() * 0.10)`.
4. **Meadow ground + wider patch range:** ground color `0x5a8a44` →
   `0x6a9148` (all `groundMat()` uses — note Task 3's vertex-colored channel
   strips bake the ground green into vertex colors; update that base green to
   match). Patch colors → `[0x7fae5c, 0x55803c, 0x8fbc6e, 0x4a7136, 0x9cc078]`
   with opacity `0.35 + rand() * 0.35`.

**Acceptance:** banks read as clumped green cattails with occasional tan
heads, not fence posts; tufts sit tonally in the ground instead of popping
mint; patches visibly mottle the plain from map height; two new InstancedMesh
total; tests + build pass.

---

## Task 5 — Bridges become low lantern causeways

**Files:** `src/grassland.js` (river decks AND the two ring decks).

Depends on Task 2 (deck centres on `riverCenterX`). The old "arch" was 0.8u
over a 92u span (invisible) and the planks sat 0.3–1.35u high — the train
clips through them.

1. **Flush deck:** planks become flat strips, centre y = 0.12, thickness
   0.24 (top ≈ 0.24 — nothing in the train's lane may exceed y ≈ 0.3). Kill
   the arch. Keep plank count 9 across the span, warm wood `0x9c6b3f` with
   per-plank HSL jitter ±0.02 lightness. Deck still spans the channel
   bank-to-bank (`(FOOT + 4) * 2` along the crossing).
2. **Narrow the visual path:** the deck's width along the river
   (`pathZ`) becomes `Math.min(gapLen, 34)` centred on `gapMidZ`. The
   collision gap is untouched.
3. **Lantern posts (the long-range signal):** four posts per bridge at the
   deck corners, OUTSIDE the train lane:
   `(riverCenterX(def, gapMidZ) ± (FOOT + 4), gapMidZ ± (pathZ / 2 + 1.5))`.
   Post: `CylinderGeometry(0.35, 0.45, 3.2, 6)` color `0x7a5230`. Lantern on
   top: `SphereGeometry(0.5, 8, 8)` color `0xffd9a0`, emissive `0xffc46a`,
   intensity 1.6, plus a `softDiscTexture('rgba(255,196,110,0.5)', 'rgba(255,196,110,0)')`
   sprite (scale ~6, depthWrite false) so the crossing glows at bank-scouting
   distance.
4. **Rope rails:** two thin runs per bridge along the crossing direction at
   the path edges, y = 0.9, `BoxGeometry(span, 0.12, 0.15)` color `0x6a4a2e`,
   sitting on the posts' line — outside the lane, so no clipping.
5. **Ring decks:** same treatment, radial: flush planks island-edge to outer
   bank, posts + lanterns at both ends of each of the two decks, rails along
   the radial edges at `x = GRASS_LANDMARK.x ± deckW/2` equivalents.

**Acceptance:** side view shows a thin warm deck line over sunken water with
four glowing lantern posts; the train crosses without intersecting anything
above y ≈ 0.3; the map-view slab shrinks to a narrow band with corner glows;
tests + build pass.

---

## Task 6 — Dress the finale: tree, knoll, island, reflection

**Files:** `src/grassland.js` (`buildGrassLandmark` + island/ring area).

1. **Blossom with structure:** leaf blobs base color `0xc6d6e8` → `0xa9c0dc`,
   emissive intensity 0.4 → 0.18. Add 3 accent blobs
   (`IcosahedronGeometry(10–14, 1)`, color `0xe8f0fa`, emissive `0xcfe0f2`
   @ 0.25) placed on the crown's surface (e.g. offsets `[14, 92, 10]`,
   `[-24, 80, -6]`, `[8, 68, 20]`).
2. **Lanterns:** 6 → 10, color `0xd6ecff`, emissive `0x9fd4ff`, intensity
   2.6, orbit radius varying 22–30 (keep the sine-height stagger).
3. **Knoll base:** add a stepped foot — `CylinderGeometry(52, 58, 5, 9)`,
   color `0x54793f`, y = 2.5, flatShading — and a ring of 8 decorative mossy
   boulders (Dodecahedron 4–8u, the `mossyBoulders` palette, NO obstacle
   push) around the base at r ≈ 52–60.
4. **Island dressing:** the island disc (r = 150) is bare. Add a dedicated
   scatter pass, placements within r 40–140 of the landmark (skip r < 70 so
   the knoll foot stays clear): 60 grass tufts + 20 wildflowers + 6 bushes,
   same geometries/palettes as the main scatter (post-Task-4 values). Include
   a flower ring: 40 wildflowers at r 66–80.
5. **Glow reflection on the ring water:** four flat discs
   (`CircleGeometry(1, 24)` scaled ~40, `MeshBasicMaterial` with
   `softDiscTexture('rgba(140,190,255,0.5)', 'rgba(140,190,255,0)')` as map,
   `transparent`, `depthWrite: false`, polygonOffset -3) lying on the ring
   water (y = WATER_Y + 0.05) at the four compass points, r = 190 from the
   landmark. They read as the tree's glow caught in the moat.

**Acceptance:** the tree reads silver-blue (not paper-white) with visible
crown structure and a lantern glow that carries at distance; the knoll reads
dressed rock/moss, not a plastic tier; the island has flora; the moat shows
soft glow pools; tests + build pass.

---

## Task 7 — Willow silhouettes + ring-water polar UVs

**Files:** `src/grassland.js`.

1. **Willows must touch the ground:** thicken trunks
   (`CylinderGeometry(0.3, 0.5, h, 6)`), lower the crown to y = h * 0.9, and
   enlarge/lower the skirt so its bottom reaches y ≈ 0.2:
   `IcosahedronGeometry(h * 0.45, 1)` at y = h * 0.55 with scale
   `(1.6, 1.35, 1.6)`. The far silhouette must be a droop-to-the-grass
   teardrop with no air gap under the crown.
2. **Ring-water polar UV fix:** `RingGeometry` UVs are planar, so the ripple
   repeat `(54, 4)` smears anisotropically and the "radial flow" scroll slides
   the pattern linearly across the whole ring. Rewrite the ring's `uv`
   attribute to polar: U = theta fraction around the ring, V = radial fraction
   across the band. Derive U from the vertex grid column index (RingGeometry
   duplicates the seam column — the last column must get U = 1.0 exactly, not
   wrap to 0; verify the vertex ordering against three.js's RingGeometry
   source rather than assuming). Then set
   `ripple.repeat.set(Math.round((2 * Math.PI * 190) / TILE), (208 - 172) / TILE)`
   (with Task 3's TILE = 30 → repeat ≈ (40, 1.2); the U repeat must stay an
   integer so the seam tiles cleanly) and change the ring's `waters` entry to
   `axis: 'x'` so the moat flows AROUND the island.
3. Willows keep their camera-fade behaviour (`trees` array wiring unchanged).

**Acceptance:** no floating crowns at any distance; the moat's ripples are
round and flow around the ring with no seam; tests + build pass.

---

## Verification (whole branch)

1. `npm test` and `npx vite build` green.
2. Visual pass (controller does this with Playwright): map view, bank view,
   bridge crossing, delta approach, and the seam drive-in (sky crossfade) —
   compared against the critique's before-screenshots in `.playwright-mcp/`.
3. Final whole-branch code review.
