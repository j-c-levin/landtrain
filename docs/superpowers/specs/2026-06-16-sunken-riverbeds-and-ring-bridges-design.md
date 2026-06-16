# Sunken riverbeds + impassable tree-ring with two bridges

Date: 2026-06-16
Branch: grassland-second-map

## Problem

In the grassland (`src/grassland.js`) the water ring around the second magic
tree is **cosmetic-only** — it is never pushed to `obstacles`, so collision
ignores it and the train drives straight over the "river". Separately, every
water body in the grassland is a flat translucent plane laid on a flat ground
plane at `y=0`. With no depth, the water and the bridges sit at the same level,
so a bridge reads as a pointless flat strip and the train appears to "drive
along the water".

## Goals

1. Make the ring around tree #2 **impassable**, with **two bridges**: one from
   the north bank to the tree island, one from the tree island to the south
   bank.
2. Give every grassland water body a **sunken bed with banks**: the water sits
   in a channel recessed below ground level, banks slope from ground down to the
   channel floor and back up, and bridges span the channel at ground level so
   the train rolls across the lip naturally.

Scope (confirmed with user): applies to **all three straight rivers AND the
tree ring**. Channel depth: **moderate, floor ≈ y = -7**.

## Background — current systems

- **Collision** (`src/world.js` `blockedAt`, line ~495): purely analytic. Two
  shape types — `circle` (`{type,x,z,r}`, distance test) and `seg`
  (`{type,x1,z1,x2,z2,w,gaps}`, distance-to-segment with `gaps:[{t0,t1}]`
  parametric windows that punch bridge openings). Padding `pad` is added to the
  obstacle extent. Tested in `test/collision.test.js`.
- **Grassland ground** (`src/grassland.js` ~201-221): a single flat opaque
  `PlaneGeometry` at `y=0`, west edge pinned to `GRASSLAND.minX` (2700) with an
  east/N/S overscan skirt (`overEast = 2600`).
- **Rivers** (`src/grassland.js` ~328-448): three N-S `seg` obstacles at
  `x = xMin + {420, 1180, 1980}`, width `w=18`, each with one bridge `gap`.
  Water is a thin `PlaneGeometry` at `y=0.12` with a scrolling ripple normal
  map; a low arched plank deck spans each gap at `y≈0.9`.
- **Tree ring** (`src/grassland.js` ~450-468): `RingGeometry(150, 230)` at the
  landmark (`x≈5400, z=0`), `y=0.1`, **not** added to `obstacles`.
- **Train** stays at a fixed `y` (no terrain-height following); it uses
  `blockedAt` only for XZ collision. So a bridge deck near `y≈0` lines up with
  the train regardless of the channel depth below it.

## Design

### Core decision: panels + carve patches (not whole-ground displacement)

A channel below `y=0` is hidden by any flat ground plane covering it, so the
ground can no longer be one unbroken plane where water runs. Rebuilding the
entire ground as a fine displaced grid is rejected (resolving an 18-wide channel
across a ~5000-unit plane needs ~700k vertices — too heavy for the mobile-WebGL
budget). Instead:

- The three rivers are straight, constant-`x`, full-depth lines, so they split
  the grassland ground into **4 flat vertical panels** at `y=0`.
- Each river gap between panels is filled by a **channel strip** mesh,
  subdivided across X and displaced into a valley.
- The east panel (which holds the tree) is built with `THREE.Shape` + a circular
  **hole** of radius `rOuter` around the tree. The ring channel is a displaced
  `RingGeometry` annulus filling that hole, with a flat island disc beneath the
  knoll.

Every flat panel lip meets a channel's top edge exactly at `y=0`: no z-fighting,
no occlusion, geometry stays cheap (a few panels + 4 carve meshes).

### Shared channel cross-section

```
 ___                       ___   ground lip   y = 0
    \                     /
     \___________________/        channel floor y ≈ -7
      [====== water  y ≈ -6.4 ======]
```

- `DEPTH = 7` (floor at `y = -DEPTH`).
- Water half-width `w` (rivers: 18; ring: radial 150..230).
- `bankW ≈ 24`: banks slope from the floor edge (`±w`) up to the lip (`y=0`) at
  `±(w + bankW)`. Channel footprint half-width ≈ `w + bankW ≈ 42`.
- Water surface plane moves to `y ≈ -(DEPTH) + 0.6 ≈ -6.4` (just below the lip),
  keeping the existing ripple material/animation. Lily pads / reeds keep their
  positions but follow the new water/ bank heights where relevant (reeds on the
  bank lip, pads on the water surface).
- Bridge decks stay near the train's level (`y ≈ 0`, shallow arch) so the train
  rolls across the lip. River decks are lowered from `y≈0.9` toward the lip.

### Component 1 — `ring` collision type (`src/world.js`)

Add a third branch to `blockedAt`:

```js
// o = { type:'ring', x, z, rInner, rOuter, gaps:[{a0,a1}] }
// blocked when the point lies in the annular band AND its angle is not in a gap.
const d = Math.hypot(x - o.x, z - o.z);
if (d > o.rInner - pad && d < o.rOuter + pad) {
  const ang = Math.atan2(z - o.z, x - o.x); // [-PI, PI]
  if (o.gaps && o.gaps.some((g) => angleInWindow(ang, g.a0, g.a1))) continue;
  return true;
}
```

`gaps` are **angular** windows (radians), mirroring the `seg` parametric `gaps`
idiom. Windows must handle wrap-around at ±π. North gap centered on `+π/2`
(`+z`), south on `−π/2` (`−z`), each ~±14° (±0.25 rad).

Add a unit test in `test/collision.test.js`: a point inside the band off-gap is
blocked; a point inside a gap angle is not; a point inside `rInner` (the island)
or outside `rOuter` is not.

### Component 2 — grassland ground panels + 3 river channels (`src/grassland.js`)

- Replace the single ground plane with **4 flat panels** spanning full ground
  depth, split at each river's channel edges (`x = riverX ± (w + bankW)`).
  Panels keep the existing material/`receiveShadow` and the west-edge pin.
- For each river, build a **channel strip**: a plane spanning `2*(w+bankW)` in X
  and the full ground depth in Z, subdivided across X (enough segments to render
  the slope smoothly, e.g. ~16), vertices displaced by the cross-section profile
  above. Same green ground material (banks are grassy), floor may use a slightly
  darker/wetter tint.
- Move each river's water plane down to the channel floor level; lower the plank
  deck toward `y≈0` with a reduced arch.

### Component 3 — ring channel + impassable ring + two bridges (`src/grassland.js`)

- Rebuild the **east panel** (the one containing the tree) using `THREE.Shape`
  (panel rectangle) with a circular **hole** of radius `rOuter=230` centered on
  the landmark → `ShapeGeometry`, flat at `y=0`.
- Add an **island disc** (`CircleGeometry`, radius `rInner=150`) at `y=0` under
  the knoll, and a **ring channel** (`RingGeometry(rInner, rOuter)` subdivided
  radially) displaced into the valley cross-section (floor mid-annulus).
- Move the ring water to the channel floor (sunken annulus).
- Push an obstacle `{ type:'ring', x:GRASS_LANDMARK.x, z:GRASS_LANDMARK.z,
  rInner:150, rOuter:230, gaps:[northGap, southGap] }`.
- Add **two bridge decks**: radial strips crossing the channel at north (`+z`)
  and south (`−z`), at `y≈0` with a shallow arch, matching the river-deck wood
  style. Each spans `rInner..rOuter` radially and the gap arc tangentially.

### Delegation plan (subagents, isolated context)

- **Agent 1** — `world.js` `ring` collision type + `test/collision.test.js`
  case. Independent of grassland; runs in **parallel**.
- **Agent 2** — `grassland.js` ground panels + 3 river channel carves + sunken
  river water + lowered river decks.
- **Agent 3** — `grassland.js` ring channel (holed east panel + island +
  annulus) + impassable `ring` obstacle + 2 ring bridges.

Agents 2 and 3 both edit `grassland.js`, so they run **sequentially** (2 then 3)
to avoid edit conflicts. Agent 1 runs in parallel with them.

## Testing / verification

- `npm test` (node test runner) — existing + new collision tests pass.
- Run the app (`vite`) and visually confirm via the debug hooks (`?ts=`,
  `window.__game`): the train can no longer cross the ring or rivers except on
  bridges; the channels read as sunken with banks; bridges sit at ground level.

## Out of scope

- Terrain-height following for the train (not needed; train stays at fixed `y`).
- Re-shaping the prairie rivers/ground (`world.js` ridges) — grassland only.
- Reworking the ripple/normal-map water shader.
