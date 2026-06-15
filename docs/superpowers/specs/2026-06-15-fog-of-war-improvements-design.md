# Fog of War Improvements — Design

Date: 2026-06-15
Status: Approved

## Goal

Improve the Land Train fog of war so players can't cheat the route by spotting
hazards through the shroud, can see meaningfully further forward than sideways,
and always have a navigational cue toward the destination (and back to the train).

## Problems

1. **Hazards bleed through fog.** In map view the darker rock/ridge geometry is
   faintly visible through unrevealed fog, letting players plot a course around
   obstacles they shouldn't be able to see.
2. **Reveal is a symmetric circle.** The cutaway/driving view lets you see far out
   the front of the train, but the fog only reveals a small disc — so a rock
   visible through the windscreen isn't revealed on the map. Lateral radius is fine.
3. **No goal cue.** It isn't clear where to go. Nothing points toward the
   destination (the Great Tree), and once the train scrolls off-screen in map view
   there's nothing pointing back to it.

## Root Causes (from exploration)

- Fog is a 2D canvas texture on a plane at `y=75` (`src/fog.js`), above all rocks
  (~55u) and ridges (~28u). Its material opacity caps at `0.98` (`fog.js:84`) — the
  2% translucency is what lets darker geometry show through as dots.
- `fog.reveal(x, z, radius)` paints a *radial* gradient only (`fog.js:61-77`); it
  has no notion of heading, so revealed area is always a symmetric disc.
- The HUD is pure DOM (`src/ui.js`) with no world→screen projection, so there are
  no edge-of-screen indicators.

## Design

### 1. Opaque unrevealed fog (`src/fog.js`)

- Make the fog material fully opaque (`1.0`) at full map blend so unrevealed areas
  completely hide the geometry beneath. The painted procedural noise stays (it is
  opaque-on-opaque, so it keeps the weathered look without leaking geometry).
- The transition blend (`setBlend`) still fades fog in/out during view changes; only
  the fully-blended (map) state needs to reach a true `1.0`.
- Acceptance: in map view, no rock/ridge dots are visible anywhere in unrevealed
  fog. Verify visually.

### 2. Forward "flashlight" reveal cone (`src/fog.js`, `src/main.js`)

- Add a heading-aware reveal that paints, in one call:
  1. The existing side-radius circle (~112u) for near/lateral vision — unchanged feel.
  2. A sequence of expanding soft-gradient circles stamped along the heading, from a
     small radius near the train growing to a larger end radius at the forward reach.
     The union is a soft-edged cone: **narrow at the train, widest at the far end.**
- Reuses the existing radial-gradient erase primitive (`destination-out`) so all
  edges stay feathered. No hard triangle fill.
- Forward reach ≈ **2.5× the side radius** (~280u), tunable.
- `src/main.js` continuous-reveal loop computes heading from
  `normalize(currentPos − lastRevealPos)` (movement direction) and passes it in.
  The initial spawn reveal and the destination-arrival reveal stay plain circles.
- Acceptance: a hazard visible out the front of the train in driving view is also
  revealed on the map; lateral reveal distance is unchanged.

### 3. Edge-of-screen markers (`src/ui.js`, `src/main.js`)

- Two DOM markers in the HUD overlay: a stylized **tree** (destination) and a
  stylized **train** (home).
- Each frame, project the target world position through the camera:
  - On-screen (in front of camera and within viewport): hide the marker.
  - Off-screen or behind camera: pin the marker to the screen edge in the target's
    direction, rotated to point outward toward the target.
- **Off-screen only, no distance label.** Minimal, clean.
- Works in all views. In driving view the train marker naturally stays hidden (the
  train is on-screen/centered); the tree marker points toward the goal.
- Standard off-screen-indicator math: project to NDC; if behind camera, invert
  direction; clamp to a rectangle inset from the screen edges by a margin.

## Tunables (`src/constants.js` `TUNING`)

- Forward reach multiplier (default `2.5`).
- Beam end radius (or half-angle) controlling how wide the far end fans out.
- Edge-marker inset margin (px from screen edge).

## Out of Scope

- Changing lateral reveal radius or reveal cadence.
- Re-rendering hazards on a separate layer / depth tricks (the opacity fix is
  sufficient).
- Distance labels or on-screen (non-edge) markers.
- Minimap, compass rose, or any new view.

## Files Touched

- `src/fog.js` — opaque material; heading-aware cone reveal.
- `src/main.js` — pass heading to reveal; per-frame marker projection updates.
- `src/ui.js` — tree/train edge markers (DOM + positioning).
- `src/constants.js` — new tunables.
