# AES-007 - Grassland Module Extraction

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-000, AES-001
**Blocks:** AES-008
**Exclusive scope:** `src/grassland.js`, new `src/grassland/` modules, focused tests
**Shared scope:** none

## Objective

Split the current grassland hotspot into coherent modules before further art work, without intentionally changing rendering or gameplay.

## Work

- Extract focused responsibilities for terrain/channels, water, flora, bridges, landmark, and shared deterministic helpers where the current structure supports it.
- Keep the public `createGrassland` contract stable.
- Make resource ownership and disposal explicit.
- Preserve PRNG call order or record and approve any unavoidable deterministic layout change before proceeding.
- Preserve collision helpers and test their extracted pure behavior.
- Avoid abstraction layers that do not reduce ownership conflicts or improve disposal/testing.

## Acceptance Criteria

- [ ] Before/after screenshots are visually equivalent within expected animation differences.
- [ ] Existing obstacle and bridge crossing behavior is unchanged.
- [ ] Public imports require no broad caller changes.
- [ ] Deterministic placement is unchanged, or the approved deviation is documented with new evidence.
- [ ] All extracted resources are disposed exactly once or safely through the existing ownership walk.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Automated: existing collision and grassland helper tests plus new extraction-focused pure tests.
- Manual: map, bank, bridge, destination, and biome-transition comparisons.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Seeded output depends on random-call order; extraction must not casually reorder construction.
**Verification results:** not run
**Evidence:** none
