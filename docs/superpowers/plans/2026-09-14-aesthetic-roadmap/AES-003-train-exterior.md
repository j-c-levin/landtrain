# AES-003 - Train Exterior Hero Pass

**Status:** done
**Owner:** Kilo (primary)
**Depends on:** AES-001, AES-002
**Blocks:** AES-004, AES-010, AES-015
**Exclusive scope:** `src/train.js` and train modules created by AES-002
**Shared scope:** none

## Objective

Give the train a distinctive hero silhouette and authored surface detail in every camera mode without changing its gameplay footprint.

## Work

- Refine roof, nose, hull skirt, balcony, window, and car-end profiles.
- Differentiate the cab, engine, and living cars at a glance.
- Add merged or instanced ribs, seams, corner plates, axle housings, springs, coupler chains/hoses, and selective rivet strips.
- Add cab canopy and lamp housing, engine vents/pipes/flywheel silhouettes, and living-car awning/planters/roof cargo.
- Make railings, ladders, and key trim thick enough for mobile legibility.
- Apply restrained wear, soot, and warm window variation through the AES-002 language.
- Preserve route overlays and map-only train markers for AES-010.

## Acceptance Criteria

- [x] All three cars are distinguishable in silhouette from side and three-quarter views.
- [x] No new exterior detail blocks traversal, ladders, cab entry, or station interaction.
- [x] Near-wall transparency and full exterior book mode still work.
- [x] Added repeated detail is merged, shared, or instanced.
- [x] Low tier stays within the AES-001 performance threshold.
- [x] Day and night visual evidence exists at desktop and landscape-phone sizes.
- [x] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: traverse underside, deck, roof, and cab; orbit around all cars; inspect articulation on turns.
- Performance: compare train close-up draw calls, triangles, and frame time with AES-000.

## Handoff

**Last updated:** 2026-09-14T21:39:09Z
**Branch:** aesthetic/aes-003
**Worktree:** /Users/joshuajosai-levin/Code/landtrain-aes-003
**Implementation commit:** db243a2
**Merge commit:** 8780c1c
**Completed:** Reassessed rather than propagated the AES-002 prototype; added role-specific silhouettes with a pitched raised-cab canopy, working pilot and lamp housing, low mechanical engine roof with enlarged stack/dome/vents/flywheel, and a domestic living car with hipped cream roof, sage awnings, window planters, and asymmetrical roof cargo. Added selective ribs, seams, corner plates, rivets, axle housings, spring blocks, grime bands, and coupler hoses; thickened railings and ladders while moving broad trim from brass to iron. Consolidated repeated additions into articulated per-car instanced batches. Independent review findings were resolved by lifting the pilot above suspension clearance, fading near-side facade detail with its occupied zone, and disposing every `InstancedMesh` buffer.
**Remaining:** none
**Decisions/deviations:** Large silhouette hierarchy replaced AES-002's detail-first rear-face prototype. Ribs vary by role instead of repeating uniformly; brass is reserved for the flywheel join and roof-cargo strap while railings, ladders, pipes, and broad engine trim use iron. Near-side additions remain open framing so the occupied room still reads when its wall fades. No new train module or runtime asset was needed.
**Risks/blockers:** Chrome emulation retains the M1 Pro GPU and does not replace physical low-end mobile profiling. Renderer samples are VSync-bound and prove threshold retention on this host, not spare GPU headroom. The existing production chunk-size warning and two dependency audit findings are unchanged.
**Verification results:** Primary visual inspection passed all 16 matched before/after book captures: side and three-quarter views, day and night, at 1440x900 high tier and 844x390 low tier; the final inhabit capture confirms facade details fade out of the occupied living-car cutaway. Chrome 152.0.7977.83 with ANGLE Metal held both before and after at 16.666 ms mean; desktop calls/triangles changed 436/85,362 -> 468/89,200 and landscape 497/87,138 -> 529/90,976. Train materials changed 28 -> 36 for zone-fading exterior variants, while repeated detail instances increased 15 -> 136. Browser probes passed under-to-deck-to-roof traversal, roof walk, cab entry, engine interaction, car articulation (three distinct yaws), focused wall opacity 0.0600 and book restoration above 0.9999, route Y=0 with render orders 59/60/61, 3 car groups, 24 wheels, the 36-sprite smoke pool, complete root disposal, and disposal events for all 24 instanced-mesh buffers. Pre-merge and post-merge `node --test test/*.test.js` passed 28/28 and `npm run build` passed with the pre-existing >500 kB warning.
**Evidence:** `docs/aesthetic-baseline/AES-003/before-measurements.json`; `docs/aesthetic-baseline/AES-003/after-measurements.json`; `docs/aesthetic-baseline/AES-003/verification.json`; `docs/aesthetic-baseline/AES-003/before/` (8 PNGs); `docs/aesthetic-baseline/AES-003/after/` (11 PNGs, including book day/night at both required viewports plus inhabit, cab, and map checks).
