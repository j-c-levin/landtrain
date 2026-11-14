# AES-004 - Train Interior Stations

**Status:** in_progress
**Owner:** Kilo (primary, visual implementation and judgment)
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

**Last updated:** 2026-09-15T08:36:00Z
**Branch:** aesthetic/aes-004
**Worktree:** /Users/joshuajosai-levin/Code/landtrain-aes-004
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** Claimed from local main `03c1c3f`, including redesign `4876a49`; AES-003 dependency is done. Existing furniture, flywheel and lighting are baseline work, not AES-004 completion.
**Remaining:** Current-main runtime audit and matched evidence; interior redesign; verification, review and integration.
**Decisions/deviations:** User requests a first-principles station redesign rather than additive detailing. Primary model owns visual construction. No interaction wiring changes.
**Risks/blockers:** Remote fetch refused by SSH agent; proceeding from explicitly requested current local main. Git invoked with Command Line Tools to avoid unrelated Xcode license setup. Physical mobile hardware is not available.
**Verification results:** not run
**Evidence:** none
