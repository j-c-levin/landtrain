# AES-010 - Cartographic Map Treatment

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-003, AES-009
**Blocks:** AES-015, AES-016
**Exclusive scope:** `src/fog.js`, `src/markers.js`, a new map-presentation module, focused tests
**Shared scope:** serialized final map-overlay edits in `src/train.js`; UI labels must use interfaces rather than edit AES-011 hotspot files concurrently

## Objective

Make map mode look intentionally cartographic while preserving the seamless camera transition into the same 3D world.

## Work

- Desaturate or flatten unexplored terrain and give the reveal edge a restrained paper/ink wash.
- Distinguish planned route, completed trail, final waypoint, intermediate waypoints, and blocked segments.
- Give the train marker a heading and stable screen-space readability.
- Mark discovered bridges and major landmarks with restrained symbols and Fraunces labels.
- Add a small compass/eastward orientation cue through an interface consumed by AES-011 or AES-016.
- Scale route width, dashes, and waypoint size with camera height or move them to a stable overlay approach.
- Increase river-edge contrast and reduce ground-patch competition as map blend rises.
- Reduce fog texture upload cost if baseline profiling confirms it is significant.

## Acceptance Criteria

- [ ] Planned, completed, blocked, and destination states are distinguishable without relying only on hue.
- [ ] Route and markers remain legible at minimum and maximum map zoom on phone and desktop.
- [ ] Hidden terrain never flashes during camera transitions.
- [ ] Labels are sparse and do not collide with primary controls at roadmap viewports.
- [ ] Pointer projection, route placement, undo, clear, pan, and pinch remain correct.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Automated: projection, fog reveal, and pure route-style tests where practical.
- Manual: complete route workflow in prairie and grassland at every viewport and quality tier.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** none
**Risks/blockers:** Map route geometry and pointer plane depend on exact heights and render order.
**Verification results:** not run
**Evidence:** none
