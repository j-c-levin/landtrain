# AES-001 - Adaptive Quality Foundation

**Status:** review
**Owner:** Kilo primary context (stalled-agent takeover)
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

- [x] Low tier uses DPR 1 and shadows no larger than 1024 square.
- [x] Medium and high tiers respect manifest caps.
- [x] Sustained poor frame time triggers one stable downgrade.
- [x] Hidden tabs stop rendering and resume without a large simulation jump.
- [x] Quality decisions are testable outside WebGL where practical.
- [x] Baseline scenes remain mechanically identical.
- [x] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Automated: focused tests for tier selection and downgrade hysteresis.
- Manual: force each tier at all roadmap viewport sizes; inspect shadows, DPR, resize, and visibility resume.
- Performance: compare each tier against AES-000 evidence.

## Handoff

**Last updated:** 2026-09-14T21:01:08Z
**Branch:** aesthetic/aes-001
**Worktree:** /Users/joshuajosai-levin/Code/landtrain-aes-001
**Implementation commit:** 30cc440
**Merge commit:** not merged
**Completed:** Added centralized immutable low/medium/high policies for DPR, startup antialiasing, shadow size/type, particle-density guidance, slow UI refresh frequency, and finishing flags; conservative capability selection with `?quality=low|medium|high` overrides; sustained-frame downgrade monitoring with grace, recovery hysteresis, cooldown, ignored long gaps, and no automatic upgrades; visibility-driven RAF/simulation/audio suspension with safe timing reset; renderer resizing and shadow-map recreation on tier changes; tier, policy, frame metrics, renderer counters, drawing-buffer size, and manual tier control under `__game.quality`; removed temporary array allocations from pinch and touch-release paths; added seven pure policy/selection/hysteresis tests; captured all forced tiers at all roadmap viewports plus all camera modes.
**Remaining:** Integration review and physical-device profiling only. Existing fixed smoke/meteor pools retain their current counts; `particleDensity` is the shared policy input for later particle/VFX tasks rather than changing current visual density in this foundation task.
**Decisions/deviations:** Unknown capability data selects medium; low is selected for at most 4 GB memory, at most 4 logical cores, or more than 5 million physical viewport pixels; high requires at least 8 GB, at least 8 logical cores, and at most 3 million physical pixels. Automatic downgrade uses a 5-second grace, 4 seconds of sustained pressure, 1.5 seconds of sustained recovery hysteresis, and a 10-second post-change cooldown. Forced URL tiers disable automatic downgrade to keep evidence deterministic. Antialiasing is selected only at renderer construction because WebGL cannot toggle it later; runtime downgrade still applies DPR, shadow, and slow-update policy safely. No `src/constants.js` change was needed.
**Risks/blockers:** Chrome emulation retains the desktop M1 Pro GPU, so these measurements do not establish physical low-end mobile GPU headroom. A runtime downgrade to low cannot disable an already-created antialiased WebGL context. The production bundle retains the existing greater-than-500-kB warning. `npm ci` reports two existing high-severity dependency audit findings; dependencies were not changed in this task.
**Verification results:** Primary-context takeover review confirmed the implementation and reran `node --test test/*.test.js` (28/28 passed) and `npm run build` (passed with the existing chunk-size warning). Earlier Chrome 152 checks forced low, medium, and high at 390x844, 844x390, 1024x768, and 1440x900 with DPR 2 input; observed drawing buffers matched tier caps and every 150-frame sample remained VSync-bound at 60 fps. Inhabit, cabin, map, and book rendered correctly; live resize to 1024x768 produced a 2048x1536 high-tier buffer and 1.3333 camera aspect; production preview registered an active scoped service worker. Backgrounding for 1.2 seconds produced zero rendered frames and zero train movement; movement over the first 120 ms after resume was 0.67 units, with no catch-up jump. Compared with AES-000, portrait inhabit retained 82 calls and 54,864 triangles exactly; desktop inhabit measured 196 calls and 57,678 triangles versus 182 and 57,342 in the baseline, consistent with time/frustum-dependent counters, while frame time remained 16.666 ms.
**Evidence:** `docs/aesthetic-baseline/AES-001/performance.json`; `docs/aesthetic-baseline/AES-001/screenshots/` (15 PNGs covering every forced tier/roadmap viewport and all four camera modes); comparison source `docs/aesthetic-baseline/AES-000/performance.json`.
