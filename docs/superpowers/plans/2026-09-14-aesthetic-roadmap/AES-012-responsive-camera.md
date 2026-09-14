# AES-012 - Responsive Camera Composition

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-000, AES-001
**Blocks:** AES-015, AES-016
**Exclusive scope:** `src/camera.js`, camera-focused tests
**Shared scope:** resize/aspect inputs from `src/main.js` must use an existing interface or be deferred to AES-016

## Objective

Preserve the camera system's continuous embodiment changes while improving composition across phone, tablet, desktop, portrait, and landscape formats.

## Work

- Define mode-specific FOV and aspect-aware offsets for inhabit, cab, map, and book modes.
- Give the direction of travel appropriate lead room.
- Add dedicated portrait composition rather than relying on crop alone.
- Add restrained bridge/destination response and optional train-motion influence.
- Add collision or obstruction avoidance where orbit/cab framing intersects major scenery.
- Honor reduced motion by shortening or simplifying nonessential transitions and disabling automatic orbit.
- Remove known frame-path vector/quaternion allocations.

## Acceptance Criteria

- [ ] The player, active station, train silhouette, and travel direction remain readable at every roadmap viewport.
- [ ] Camera transitions remain continuous while the train moves.
- [ ] Portrait framing is usable rather than merely unbroken.
- [ ] Map projection and click placement remain exact after any FOV changes.
- [ ] Reduced-motion behavior retains orientation and gameplay context.
- [ ] No per-frame allocations are introduced.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: all transitions, modes, zoom limits, panning/orbiting, turns, bridges, and landmarks at every viewport.
- Performance: allocation/profile comparison with AES-000.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** One perspective camera is shared by map projection and world views; validate every projection-dependent change.
**Verification results:** not run
**Evidence:** none
