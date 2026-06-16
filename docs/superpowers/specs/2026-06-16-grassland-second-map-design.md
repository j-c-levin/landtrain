# Grassland — The Second Map

**Status:** Approved for implementation
**Date:** 2026-06-16
**Builds on:** `2026-06-12-land-train-first-journey-design.md` (the prairie vertical slice)

---

## 1. Purpose

Extend Land Train with a **future goal**: reaching the first magic tree (the
prairie's Great Tree) unlocks a **second magic tree across a new land** — a
**grassland laced with rivers**. Land trains cannot cross rivers, so the new
navigation verb is **finding bridges**.

This is built as a **concrete second map (map 2)**, not a general framework.
A reusable biome-config system is explicitly out of scope; we'll revisit that
if/when a map 3 is wanted (YAGNI).

The work must stay true to the original pillars: **cozy, never punishing, no
fail states, the train only ever slows.** The grassland adds gentle navigation
friction (rivers), never danger.

---

> **Revision 2026-06-16 (after first playtest):** the discrete fade-to-black
> *teleport* below was replaced by a **seamless continuous world**. The
> grassland is now placed EAST of the prairie (beyond the old map edge); the
> world is split at the zig-zag mountains (`SPLIT_X`) into chunks. Reaching the
> prairie tree streams the grassland in, unloads the western prairie
> (`world.disposeBefore()`), and switches the goal marker to the new tree — no
> fade, no teleport; you just drive on into it. The mountains stay loaded as the
> natural backtrack barrier. Consequence: a single continuous world means **one
> shared sky and sun** — the grassland differs by ground, water, flora, and its
> tree rather than a separate cool sky. Sections 4–6 still hold; section 2's
> teleport mechanic is superseded.

## 2. Progression & the transition

Reaching the prairie tree triggers a one-way move into the grassland. Because
this runs on mobile WebGL, **only one biome is ever held in memory.**

### 2.1 Teardownable worlds

Today `createWorld` dumps objects straight into `scene` and returns. Both
worlds must instead:

- Parent all their objects under a single **root `THREE.Group`** added to the
  scene.
- Expose **`dispose()`** that walks the root, calling `.dispose()` on every
  geometry, material, and texture it owns, then removes the root from the
  scene. This frees GPU buffers so two biomes never coexist in memory.

Shared/cached resources (e.g. a soft-disc texture used by both) must be
disposed only by their owner, or recreated per-world to keep ownership clean.

### 2.2 The transition sequence

On arrival at the prairie tree (existing `state.arrived` detection):

1. Clear the route; pause normal play.
2. **Cutscene:** ease the camera to a framed two-shot of the train + the
   glowing tree and hold a beat (reuse the book-mode pan-back style in
   `camera.js`). Keep it short and warm — no long set-piece.
3. **Fade to black** via a full-screen CSS overlay (cheap, reliable; lives
   alongside the other UI in `ui.js` / `style.css`).
4. **Under black:** `prairie.dispose()` → build the grassland → reset the
   train to the grassland start position/heading → reset/clear the fog →
   reset gauges to a fresh-journey state.
5. **Fade in** on the grassland; a soft chime; resume the loop.

**Forward-only is an accepted constraint** — there is no walking back to the
prairie. The transition presumes forward progress, which matches "the next
*unlocked* map."

---

## 3. Rivers & bridges

### 3.1 Data model (reuses the existing obstacle system)

The prairie's collision model has two obstacle types: `circle` and `seg` (a
line with width `w`), checked by `blockedAt`. Rivers and bridges extend this:

- A **river** is one or more `seg` obstacles. `blockedAt` already refuses
  routing within a seg's width, so **impassability is free.**
- A **bridge** is a **gap** in a river seg. Add an optional
  `gaps: [{ t0, t1 }]` to `seg` obstacles, where `t0`/`t1` are normalized
  positions (0–1) along the segment. `blockedAt` returns *not blocked* when
  the nearest point on the seg falls inside a gap.
- A low **arched bridge deck** mesh is placed at each gap so a crossing reads
  visually.

### 3.2 Finding crossings — "Scout"

- Bridges are **fogged like all other terrain** — no glow-through-fog beacon.
- The reveal cone aims forward along the train's heading. Because rivers run
  roughly **N–S** across the **W–E** journey, hitting a river forces the
  player to **turn and drive along the bank**; the cone then uncovers where a
  bridge gap actually is. Return to the cab, see the now-revealed bridge on
  the map, route across.
- This is a gentle exploration beat, never a fail: the river just makes you
  look. **No decoy/dead-end crossings.**

### 3.3 Water surface

Rivers need a **translucent, faintly reflective water plane** with slow
slow-scrolling UVs (or a gently animated normal) to suggest flow. This is the
one genuinely new visual asset. Reedy banks frame it (see §5).

---

## 4. The map / maze

Same WORLD bounds and east-bound journey as the prairie. Train starts west,
the second tree sits on a **delta island** at the east. Three rivers,
escalating, none with decoys:

```
  N▲              start                                    delta island
   │              ▼                                         ╱‾‾‾‾‾‾‾╲
   │      ~~~~~~~~~~~~~~~     ~~~~~~~~~~~~~~~      ~~~~~~~~~~╱  ✦TREE✦ ╲
   │      ~~~~~~~~~~~~~~~     ~~~~~~~~~~~~~~~      ~river C N-arm~~~    │
   │           river A            river B        ~~~~~~~~~~╲         ╱
TRAIN▶ · · · · · ═╪═ · · · · · · · · · · · · · · · · · ═╪═ ╲_______╱
   │            bridge1          ═╪═                  bridge3  river C
   │         (just N of      bridge2                  (final     S-arm
   │          centre)      (down south)               approach)
   │      ~~~~~~~~~~~~~~~     ~~~~~~~~~~~~~~~      ~~~~~~~~~~~~~~~~~~~~~
        x≈600              x≈1300                 x≈1950      tree x≈2450
```

- **River A (~x600)** — tutorial crossing. One bridge just north of centre;
  a short bank-scout teaches the verb "hit river → drive bank → find gap →
  cross."
- **River B (~x1300)** — bridge down south, the opposite side, so the player
  commits to a longer bank-run. Reinforces the verb.
- **River C (~x1950)** — forks into a **north arm and a south arm that
  enclose the delta island** where the tree sits. One bridge over the near
  (west) arm is the final approach. Arriving at the tree triggers the **end
  beat** (§6).

Rivers span most of the N–S extent so rounding the end is not the easy answer
— the bridge is. Exact coordinates/widths are the implementer's to tune toward
the prairie's cadence (return to the cab every few minutes); the layout above
is the intent, not literal gospel.

---

## 5. Aesthetic differentiation

Same engine and systems, dials flipped, so the grassland is unmistakably a new
biome:

- **Palette:** ground `0xc9af72` (dry gold) → lush green; grass-tuft HSL hue
  ~0.13 (olive) → ~0.28 (fresh green); flowers brighter and denser.
- **Water:** translucent, faintly reflective blue plane with slow-scrolling
  flow (the new asset).
- **Sky/fog:** `SkyCycle` shifts cool — blue-green fog, a lower softer sun,
  and **morning mist hugging the water** instead of the prairie's dry dusty
  haze.
- **Flora silhouettes:** willows (drooping, stretched icosahedron crowns),
  cattail/reed clusters on the banks, lily-pad discs on the water; the desert
  dodecahedron rocks/mesa become **mossy boulders and grassy hummocks.**
- **The second tree:** a re-skin of `buildLandmark` — silver/blue blossom on
  a green knoll ringed by water, its glow reflected in the river. The same
  *kind* of landmark, clearly a different land.
- **Audio:** add a soft burbling-water layer plus birds/frogs over (or
  replacing) the prairie's dry wind, via the existing synthesised `audio.js`.

---

## 6. End beat

Reaching the grassland tree gives a gentle **"the road goes on" /
to-be-continued** payoff — a re-skin of the existing arrival card. No map 3,
no further transition. The player may keep pottering afterward; no hard game
over.

---

## 7. Out of scope

- A reusable biome-config / data-driven world framework (revisit for map 3).
- Map 3 and beyond.
- Decoy / dead-end crossings.
- Walking back to the prairie (progression is forward-only).
- Any new upkeep mechanics, resources, or fail states.
- New control schemes (mobile tilt, etc. — still future).

---

## 8. Success criteria

1. Reaching the prairie tree plays a short cutscene, fades, and lands the
   player in a visibly different grassland — with the prairie fully unloaded
   (no memory growth from holding two biomes).
2. Routing the train into a river is refused; the train cannot cross open
   water.
3. The player can scout a riverbank, reveal a bridge in the fog, route across
   it, and continue east.
4. The three rivers escalate the bank-scout beat and lead to the delta tree.
5. The grassland reads as a distinct, cozy biome (green, watery, misty) while
   reusing the prairie's systems.
6. Reaching the grassland tree gives a gentle "to be continued" payoff.
7. It runs acceptably on a mid-range phone (one biome in memory at a time).
