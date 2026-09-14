# AES-009 - Water and Bridge Readability

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-008
**Blocks:** AES-010, AES-014, AES-015
**Exclusive scope:** grassland water and bridge modules produced by AES-007
**Shared scope:** grassland terrain interfaces are read-only unless coordinated

## Objective

Make rivers, depth, currents, and safe crossings readable from side, orbit, and map views using inexpensive authored cues.

## Work

- Add shallow-to-deep value variation and stronger bank/channel separation.
- Add sparse current lines, bank highlights, foam at selected bends/supports, and a sun-aligned sparkle band without real-time reflections.
- Add bridge approach wear through flattened vegetation, dirt, and wheel tracks.
- Strengthen bridge silhouette with restrained flags, posts, or lantern housings that survive mobile resolution.
- Animate lantern breathing at night while keeping a readable daytime signal.
- Add bridge response hooks for audio and subtle train/environment vibration.
- Merge deck detail and share materials rather than adding per-plank draw calls.

## Acceptance Criteria

- [ ] Water depth and flow are readable without screen-space reflections.
- [ ] Every required crossing can be found in day, dusk, and night conditions.
- [ ] Bridge dressing remains outside the train collision/traversal lane.
- [ ] Water seams, tiling, polygon offset, and disposal remain correct.
- [ ] Low tier disables or reduces optional sparkle/foam while retaining route clarity.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: inspect and cross every river and ring bridge in inhabit, map, and book modes at all tiers.
- Performance: record water/bridge draw calls and frame time from the river baseline scene.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Transparent layers are already depth-sensitive; preserve render order and map-height behavior.
**Verification results:** not run
**Evidence:** none
