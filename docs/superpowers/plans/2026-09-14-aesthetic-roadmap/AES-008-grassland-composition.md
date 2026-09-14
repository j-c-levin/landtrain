# AES-008 - Grassland Composition and Flora

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-007
**Blocks:** AES-009
**Exclusive scope:** grassland terrain and flora modules produced by AES-007
**Shared scope:** no simultaneous edits to grassland water, bridge, or landmark modules

## Objective

Give the grassland authored mid-scale composition through river-following ecologies, groves, irregular ground color, and destination framing.

## Work

- Arrange reeds in belts following channel curvature instead of even scatter.
- Group willows into groves separated by readable open fields.
- Add gravel shelves, mud bars, wet depressions, and erosion shapes.
- Cluster lily pads into intentional pools with occasional flowers and raised leaves.
- Replace dominant circular meadow overlays with irregular opaque or vertex-colored treatment.
- Create denser visual framing around bridge approaches and the destination island.
- Preserve route clearance, collisions, seeded determinism, tree fading, and disposal.

## Acceptance Criteria

- [ ] Grassland reads as a different ecology from prairie at every camera height.
- [ ] Rivers organize nearby vegetation and ground treatment.
- [ ] Willows read as groves, not uniform independent props.
- [ ] Large translucent circles no longer dominate the map.
- [ ] Route corridors and bridge approaches remain mechanically clear.
- [ ] Repeated flora is instanced or merged and respects tier densities.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: biome seam, each river, bridge approaches, open meadow, destination island, and map overview at all tiers.
- Performance: compare grassland draw calls, triangles, textures, and frame time with AES-000.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Preserve water and collision geometry interfaces for AES-009.
**Verification results:** not run
**Evidence:** none
