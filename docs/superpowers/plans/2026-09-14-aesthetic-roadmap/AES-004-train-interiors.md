# AES-004 - Train Interior Stations

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-003
**Blocks:** AES-005
**Exclusive scope:** `src/train.js` and train modules created by earlier train tasks
**Shared scope:** interaction state may be read from `src/interactions.js`, but wiring edits belong to AES-005

## Objective

Make the cab, engine, plant area, reading chair, and bunk feel like distinct lived-in miniature scenes centered on the existing gameplay stations.

## Work

- Cab: framed glazing, instrument cluster, heading needle, route-chart prop, responsive levers.
- Engine: pressure needle, valve wheel, moving rod/flywheel, hanging tools, soot zone, stronger firebox response.
- Plants: varied silhouettes and pots, watering can, damp-soil and recovery states.
- Reading area: open book, lamp pool, blanket, cup or keepsake, restrained table clutter.
- Bunk: curtain, fuller bedding silhouette, shelf or hanging keepsake, calmer local light.
- Group props by station and animate transforms/emissive values instead of adding shadow-casting lights.
- Preserve station positions, prompts, interaction hold durations, wall fading, and player traversal.

## Acceptance Criteria

- [ ] Every station is identifiable without its prompt.
- [ ] Animated instruments reflect actual game state where an appropriate value exists.
- [ ] Plant-health visuals remain readable and never imply plant death.
- [ ] Night interiors have a clear warm-light hierarchy without additional shadow-casting point lights.
- [ ] Props do not obscure the player at 390 x 844 or 844 x 390.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: visit and activate every station at day and night in inhabit and book modes.
- Performance: compare interior close-up draw calls and lights with AES-000.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Station state interfaces may need minimal exports; defer broader interaction changes to AES-005.
**Verification results:** not run
**Evidence:** none
