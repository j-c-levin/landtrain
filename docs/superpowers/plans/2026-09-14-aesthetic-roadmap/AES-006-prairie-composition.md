# AES-006 - Prairie Composition

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-000, AES-001
**Blocks:** AES-014, AES-015
**Exclusive scope:** `src/world.js`, prairie-focused tests or modules introduced here
**Shared scope:** do not edit `src/constants.js` while another hotspot owner is active

## Objective

Replace uniform procedural scatter and visible translucent circles with authored mid-scale landscape composition that frames travel, route choices, and the Great Tree.

## Work

- Introduce long wind-shaped grass and color bands, dry swales, flower drifts, and clustered shrub/stone ecologies.
- Replace most circular meadow overlays with vertex color, irregular low-poly patches, or opaque clustered dressing.
- Add a sparse vocabulary of story props such as weathered route posts, fence fragments, or standing stones.
- Compose denser framing around route decisions and the destination approach while preserving clear traversable corridors.
- Retain seeded determinism, obstacle validity, western-chunk disposal, and landmark visibility.
- Prefer instancing or merged geometry for every repeated motif.

## Acceptance Criteria

- [ ] Prairie has clear foreground, mid-ground, and distant composition in inhabit, map, and book views.
- [ ] Translucent circular patch shapes no longer dominate map or orbit views.
- [ ] Added props do not create accidental route blockers.
- [ ] Identical seeds produce identical placement.
- [ ] Western terrain still unloads and disposes all new owned resources.
- [ ] Low-tier frame time and draw calls remain within AES-001 thresholds.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: travel the full prairie route by day, dusk, and night; inspect map readability and destination reveal.
- Performance: baseline comparison before and after western terrain disposal.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** `softDiscTexture` is shared by other modules; avoid breaking its exports while reducing meadow overlays.
**Verification results:** not run
**Evidence:** none
