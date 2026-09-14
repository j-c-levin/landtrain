# AES-002 - Train Visual Language

**Status:** in_progress
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

- [ ] One representative car section demonstrates the agreed silhouette and material language.
- [ ] Repeated materials are shared where animation does not require uniqueness.
- [ ] Brass remains an accent tied to craft or interaction, not a general-purpose decoration.
- [ ] The prototype reads in inhabit and book modes at 844 x 390.
- [ ] Draw calls and material count are recorded before and after.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: day/night inhabit, cab, and close book-orbit comparisons.
- Performance: renderer info comparison using AES-000 scene.

## Handoff

**Last updated:** 2026-09-14T20:30:11Z
**Branch:** aesthetic/aes-002
**Worktree:** /Users/joshuajosai-levin/Code/landtrain-aes-002
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Per-wheel wear currently changes material color; preserve that behavior without multiplying materials unnecessarily.
**Verification results:** not run
**Evidence:** none
