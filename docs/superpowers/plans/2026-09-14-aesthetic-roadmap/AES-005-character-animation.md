# AES-005 - Character and Interaction Animation

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-004
**Blocks:** AES-016
**Exclusive scope:** `src/player.js`, `src/interactions.js`, focused tests
**Shared scope:** minimal animation hooks in train modules require coordination with completed AES-004 work

## Objective

Give the player and maintenance interactions expressive procedural poses and secondary motion without introducing a skeletal asset pipeline.

## Work

- Add simple articulated arms and separated legs while preserving the tiny readable silhouette.
- Add walking anticipation/settle, hand-over-hand climbing, engine/tread work lean, watering arc, reading pose, resting breath, and cab look-out pose.
- Let the scarf react subtly to travel speed and movement direction.
- Add restrained lamp, hanging plant, fabric, machinery, and coupler secondary motion through existing train hooks.
- Tie poses to actual interaction progress and transition smoothly when interrupted.
- Honor reduced-motion state introduced through UI/integration work.

## Acceptance Criteria

- [ ] Walk, climb, maintenance, watering, reading, resting, and cab states have distinct silhouettes.
- [ ] Interrupted hold interactions return smoothly to locomotion.
- [ ] Animation does not move the gameplay collision position or break car-local placement.
- [ ] Motion remains readable but calm at landscape-phone size.
- [ ] No frame-path object allocations are introduced.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: exercise every movement and interaction across articulated turns and all camera transitions.
- Accessibility: confirm reduced-motion mode removes nonessential secondary motion while retaining state feedback.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Player poses and near-wall fading must remain correct in each car's local frame.
**Verification results:** not run
**Evidence:** none
