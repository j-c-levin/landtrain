# AES-001 - Adaptive Quality Foundation

**Status:** in_progress
**Owner:** Kilo (openai/gpt-5.6-sol-discounted)
**Depends on:** AES-000
**Blocks:** AES-003, AES-006, AES-007, AES-011, AES-012, AES-014, AES-015
**Exclusive scope:** `src/main.js`, quality-focused tests or modules introduced by this task
**Shared scope:** `src/constants.js` only while this task is active

## Objective

Establish low, medium, and high rendering tiers before increasing visual complexity, with automatic conservative selection and a stable runtime downgrade path.

## Work

- Centralize DPR, antialiasing, shadow map, shadow type, particle density, slow-update frequency, and optional finishing flags.
- Select a conservative initial tier from device capabilities without user-agent sniffing.
- Sample sustained frame time and step down with hysteresis; do not oscillate or automatically step up during play.
- Pause rendering, simulation, and procedural audio scheduling while the document is hidden, then resume safely.
- Remove avoidable frame-path allocations found during baseline profiling.
- Expose current tier and metrics through the existing debug surface.
- Preserve resize behavior, service worker behavior, and all camera modes.

## Acceptance Criteria

- [ ] Low tier uses DPR 1 and shadows no larger than 1024 square.
- [ ] Medium and high tiers respect manifest caps.
- [ ] Sustained poor frame time triggers one stable downgrade.
- [ ] Hidden tabs stop rendering and resume without a large simulation jump.
- [ ] Quality decisions are testable outside WebGL where practical.
- [ ] Baseline scenes remain mechanically identical.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Automated: focused tests for tier selection and downgrade hysteresis.
- Manual: force each tier at all roadmap viewport sizes; inspect shadows, DPR, resize, and visibility resume.
- Performance: compare each tier against AES-000 evidence.

## Handoff

**Last updated:** 2026-09-14T20:30:11Z
**Branch:** aesthetic/aes-001
**Worktree:** /Users/joshuajosai-levin/Code/landtrain-aes-001
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Renderer antialiasing cannot be toggled after construction; choose initialization behavior deliberately.
**Verification results:** not run
**Evidence:** none
