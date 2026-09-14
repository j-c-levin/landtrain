# AES-002 - Train Visual Language

**Status:** review
**Owner:** Kilo (sonnet)
**Depends on:** AES-000
**Blocks:** AES-003
**Exclusive scope:** `src/train.js`, optional train-focused material/geometry module introduced here
**Shared scope:** none

## Objective

Turn the approved art direction into reusable train geometry and material idioms before the full exterior pass.

## Work

- Consolidate train palette and material creation so repeated wheels and trim do not receive unnecessary unique materials.
- Prototype inexpensive bevel/profile treatments for roofs, hull skirts, corners, and window frames.
- Define structural rhythms for ribs, seams, corner plates, rivets, and brass accents.
- Define wear zones for soot, lower-hull grime, wheel rust, polished controls, and warm window variation using vertex color, merged geometry, or a compact generated texture.
- Confirm the minimum detail dimensions that remain visible at small landscape-phone resolution.
- Preserve near-wall fading, car articulation, interaction coordinates, collision assumptions, and disposal.

## Acceptance Criteria

- [x] One representative car section demonstrates the agreed silhouette and material language.
- [x] Repeated materials are shared where animation does not require uniqueness.
- [x] Brass remains an accent tied to craft or interaction, not a general-purpose decoration.
- [x] The prototype reads in inhabit and book modes at 844 x 390.
- [x] Draw calls and material count are recorded before and after.
- [x] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: day/night inhabit, cab, and close book-orbit comparisons.
- Performance: renderer info comparison using AES-000 scene.

## Handoff

**Last updated:** 2026-09-14T20:42:47Z
**Branch:** aesthetic/aes-002
**Worktree:** /Users/joshuajosai-levin/Code/landtrain-aes-002
**Implementation commit:** 78cc71d
**Merge commit:** not merged
**Completed:** Centralized train colors and owned materials; shared animated wheel material and repeated wheel/hub/leaf geometry; retained wheel wear through one shared color update; added a chamfered roof and skirt, instanced ribs/seam/corner plates/rivets, lower-hull grime, and stack soot to the rear living-car prototype; moved broad window sills and wheel hubs from brass to dark wood/iron; added deduplicated train disposal.
**Remaining:** AES-003 should apply or revise these idioms across the full exterior, including authored variation per car; integration must mark this task done after merge and post-merge verification.
**Decisions/deviations:** Kept the prototype to one rear-car face and two profile substitutions. Decorative ribs are 0.22 world units wide and rivets are 0.28 world units across so they survive the 844 x 390 book view; smaller marks should become material variation rather than geometry. Brass remains on handrails, ladders, controls, lamps, and mechanical joins rather than broad window trim. Temporary renderer instrumentation used for measurement was removed before commit.
**Risks/blockers:** The representative detail adds one measured inhabit draw call; AES-003 must avoid multiplying that cost across every face without further instancing or merging. Visual checks used headless Chrome on an M1 Pro, not physical mobile hardware. Existing book/cab instructional overlays can cover part of the train at this short landscape viewport.
**Verification results:** `node --test test/*.test.js` passed 21/21; `npm run build` passed with the pre-existing chunk-size warning. Headless Chrome checks at 844 x 390 passed for day/night inhabit, day/night default and close book, day/night cab, and map route. Near-wall car-2 opacity reached 0.089 while damping toward the unchanged 0.06 target; route positions remained at y=0; all 3 articulated car groups and 24 wheels remained; shared wheel wear reached `#c29776` at wear 100; disposal detached cars, route display, and all smoke sprites. At 1440 x 900 inhabit, train materials changed 52 -> 28, draw calls 196 -> 197, uploaded geometries 238 -> 205, and triangles 57,678 -> 57,718.
**Evidence:** `docs/aesthetic-baseline/AES-002/measurements.json`; `docs/aesthetic-baseline/AES-002/screenshots/landscape-844x390-inhabit-prairie-day.png`; `docs/aesthetic-baseline/AES-002/screenshots/landscape-844x390-inhabit-prairie-night.png`; `docs/aesthetic-baseline/AES-002/screenshots/landscape-844x390-book-prairie-day.png`; `docs/aesthetic-baseline/AES-002/screenshots/landscape-844x390-book-prairie-night.png`; `docs/aesthetic-baseline/AES-002/screenshots/landscape-844x390-book-close-prairie-day.png`; `docs/aesthetic-baseline/AES-002/screenshots/landscape-844x390-book-close-prairie-night.png`; `docs/aesthetic-baseline/AES-002/screenshots/landscape-844x390-cabin-prairie-day.png`; `docs/aesthetic-baseline/AES-002/screenshots/landscape-844x390-cabin-prairie-night.png`; `docs/aesthetic-baseline/AES-002/screenshots/landscape-844x390-map-route-prairie-day.png`.
