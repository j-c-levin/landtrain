# AES-015 - Selective High-Tier Finishing

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-001, AES-003, AES-006, AES-009, AES-010, AES-011, AES-012, AES-013, AES-014
**Blocks:** AES-016
**Exclusive scope:** `src/main.js`, optional finishing module/shaders, `src/style.css` only after AES-011 is done
**Shared scope:** renderer initialization must preserve AES-001 tier selection

## Objective

Evaluate restrained high-tier finishing only after authored art, composition, motion, UI, and sound are complete.

## Work

- Prototype half-resolution selective bloom for windows, firebox, landmark lanterns, bright stars, and rare water highlights.
- Measure the prototype against the same high-tier scenes with sprite glows only.
- Keep bloom entirely disabled on low and medium tiers.
- Tune CSS vignette and grain by quality tier and reduced-motion preference.
- Reject bloom if it harms clarity, color hierarchy, battery use, or frame-time budgets.
- Do not add SSAO, depth of field, motion blur, screen-space reflection, chromatic aberration, or a broad color LUT without a separately approved measured case.

## Acceptance Criteria

- [ ] High-tier finishing has recorded before/after visual and frame-time evidence.
- [ ] Low and medium output remains unaffected by optional WebGL passes.
- [ ] Bloom, if retained, does not wash out map overlays, UI, stars, or pale destination foliage.
- [ ] Context loss, resize, DPR changes, and disposal remain safe.
- [ ] Reduced motion disables animated grain where appropriate.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: day/night train, destination, river, map, intro, and book views at every tier and viewport.
- Performance: GPU/frame-time comparison on desktop and mobile-class profile; record the keep/reject decision.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** Bloom is optional and evidence-gated, not a required outcome.
**Risks/blockers:** Renderer construction and service-worker asset paths are shared integration concerns.
**Verification results:** not run
**Evidence:** none
