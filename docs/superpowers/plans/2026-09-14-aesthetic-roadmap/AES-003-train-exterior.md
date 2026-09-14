# AES-003 - Train Exterior Hero Pass

**Status:** proposed
**Owner:** unassigned
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

- [ ] All three cars are distinguishable in silhouette from side and three-quarter views.
- [ ] No new exterior detail blocks traversal, ladders, cab entry, or station interaction.
- [ ] Near-wall transparency and full exterior book mode still work.
- [ ] Added repeated detail is merged, shared, or instanced.
- [ ] Low tier stays within the AES-001 performance threshold.
- [ ] Day and night visual evidence exists at desktop and landscape-phone sizes.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: traverse underside, deck, roof, and cab; orbit around all cars; inspect articulation on turns.
- Performance: compare train close-up draw calls, triangles, and frame time with AES-000.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Keep thin detail out of the train's traversal lanes and map-overlay render ordering.
**Verification results:** not run
**Evidence:** none
