# AES-011 - Mobile UI and Accessibility

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-000, AES-001
**Blocks:** AES-015, AES-016
**Exclusive scope:** `index.html`, `src/style.css`, `src/ui.js`, touch-control UI modules and focused tests
**Shared scope:** `src/main.js` wiring must be exposed as a small integration request for AES-016 unless ownership is explicitly transferred

## Objective

Make touch input discoverable, mode-aware, responsive, safe-area-correct, and accessible without adding generic virtual joysticks.

## Work

- Add subtle storybook edge chevrons for walk controls during onboarding.
- Show climb guidance only near ladders and an interaction hold ring only near available stations.
- Replace the keyboard `E` badge with touch-specific affordance on coarse pointers.
- Replace HTML entities with authored station icons consistent with parchment/plum styling.
- Apply safe-area insets to every fixed control and ensure 44 by 44 CSS-pixel targets.
- Add compact short-screen cards, overflow safety, portrait layout, and responsive HUD density.
- Add reduced-motion, stronger contrast, keyboard focus, semantic labels, and screen-reader names.
- Preserve mouse/keyboard presentation and all existing control actions.

## Acceptance Criteria

- [ ] A first-time touch player can discover walk, climb, interact, map pan, pinch, undo, clear, orbit, and exit.
- [ ] No touch UI shows a keyboard-only key badge.
- [ ] Controls avoid notches and home indicators using safe-area variables.
- [ ] Cards and prompts do not clip at any roadmap viewport.
- [ ] Touch targets meet the minimum size and have visible focus states.
- [ ] Reduced-motion preference is available to camera, animation, and VFX consumers.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: touch, mouse, and keyboard flows at all roadmap viewports; portrait and landscape; reduced-motion and keyboard-only passes.
- Accessibility: inspect names, focus order, contrast, and hidden-state semantics.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Input logic is currently concentrated in `main.js`; keep the integration boundary narrow.
**Verification results:** not run
**Evidence:** none
