# AES-014 - Atmosphere and Travel VFX

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-001, AES-006, AES-009
**Blocks:** AES-015, AES-016
**Exclusive scope:** `src/sky.js`, a new pooled VFX module, VFX-focused tests
**Shared scope:** `src/constants.js` only while this task is active; integration hooks in `src/main.js` belong to AES-016

## Objective

Strengthen dawn, day, dusk, night, weathered travel, and destination moments with sparse low-cost atmosphere and pooled world effects.

## Work

- Tune time-of-day value separation using the AES-000 palettes while preserving biome crossfade.
- Throttle tiny sky-canvas uploads when sampled colors have not materially changed.
- Add tier-scaled vegetation wind interfaces and pooled dust, wet spray, leaf/seed, and rare arrival particles.
- Cluster fireflies near water and vegetation instead of distributing them uniformly.
- Add subtle travel-linked lamp/particle response without routine camera shake.
- Make reduced-motion and low tier suppress nonessential movement while preserving interaction feedback.
- Keep glows sprite-based unless AES-015 proves bloom safe.

## Acceptance Criteria

- [ ] Dawn, day, dusk, and night each have clear foreground/background separation.
- [ ] Effects are sparse, deterministic where placement matters, pooled, and tier-scaled.
- [ ] No new dynamic shadow-casting lights are added.
- [ ] Sky updates avoid unnecessary texture uploads without visible stepping.
- [ ] Reduced-motion mode removes decorative motion while retaining state cues.
- [ ] Low tier stays within AES-001 performance thresholds.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: complete accelerated day cycle using the existing time-scale query, both biomes, each mode, every quality tier, reduced motion.
- Performance: compare particle counts, texture uploads, and frame time with AES-000.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Sky and fog values are tightly coupled; preserve map fog coordination and landmark visibility.
**Verification results:** not run
**Evidence:** none
