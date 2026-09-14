# AES-016 - Integration, Optimization, and Release Review

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-001 through AES-015
**Blocks:** none
**Exclusive scope:** `src/main.js`, `src/constants.js`, final shared wiring, integration tests, roadmap reconciliation
**Shared scope:** all source files for reviewed fixes after leaf owners have handed off

## Objective

Integrate leaf-task interfaces, resolve cross-system issues, validate the complete journey on mobile and desktop, and reconcile durable task status for release.

## Work

- Read every task handoff and verify evidence rather than trusting status alone.
- Wire touch affordances, reduced motion, camera aspect state, interaction animation events, audio events, bridge hooks, quality controls, and VFX through minimal interfaces.
- Profile and reduce draw calls, transparent overdraw, allocations, texture uploads, active audio nodes, and hidden-tab work.
- Validate service-worker precaching for any new runtime assets and confirm offline start.
- Exercise the complete journey from intro through both arrival cards and destination states.
- Perform regression checks for route planning, collision, train articulation, station maintenance, camera transitions, biome unloading, audio gesture rules, and resize/orientation changes.
- Reconcile the master manifest's initial statuses with authoritative task files.
- Record deferred issues explicitly; do not silently mark incomplete work done.

## Acceptance Criteria

- [ ] Every dependency is `done` or explicitly `superseded` with approved rationale.
- [ ] The full journey completes with keyboard/mouse and touch input.
- [ ] All roadmap viewports are usable in day and night scenes.
- [ ] Low tier meets the AES-001 performance budget in the heaviest measured scene.
- [ ] No significant resource growth occurs across biome transition, repeated mode changes, or audio mute/resume.
- [ ] Offline reload works after first successful load.
- [ ] Reduced motion, safe areas, focus states, and contrast receive a final pass.
- [ ] `node --test test/*.test.js` and `npm run build` pass.
- [ ] Final visual evidence and performance comparison are recorded.
- [ ] Independent code review has no unresolved high-severity findings.

## Verification

- Automated: complete Node test suite and production build.
- Manual: full-journey matrix across quality tiers and roadmap viewports.
- Performance: compare final evidence against AES-000 baseline and document tradeoffs.
- Review: inspect all roadmap changes against the pre-roadmap base, not only the final integration diff.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** This task is intentionally serialized after all leaf work and must not become a substitute for incomplete leaf verification.
**Verification results:** not run
**Evidence:** none
