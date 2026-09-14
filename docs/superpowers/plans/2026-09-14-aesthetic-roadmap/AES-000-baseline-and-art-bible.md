# AES-000 - Baseline and Art Bible

**Status:** done
**Owner:** Kilo (openai/gpt-5.6-sol-discounted)
**Depends on:** none
**Blocks:** AES-001 through AES-016
**Exclusive scope:** visual evidence files created by this task
**Shared scope:** none

## Objective

Create reproducible visual and performance baselines, then record concrete palette, silhouette, material, composition, and motion rules that later agents can evaluate against.

## Work

- Capture inhabit, cab, map, and book views at day, dusk, and night where available.
- Capture prairie, river crossing, grassland destination, intro, arrival, and ending states.
- Capture the four roadmap viewport sizes listed in the manifest.
- Record FPS/frame-time behavior, DPR, draw calls, triangles, textures, and renderer memory on at least one desktop and one available mobile-class profile.
- Define train, prairie, grassland, map, and time-of-day palette swatches using sampled existing colors as the starting point.
- Define silhouette rules, minimum readable detail size, roughness/metalness ranges, brass usage, glow hierarchy, and motion amplitude limits.
- Record existing audio behavior, including the already speed-responsive train movement sound, before later sound work.

## Acceptance Criteria

- [x] Baseline images use stable names and list exact URL/query parameters and game state.
- [x] Performance measurements include hardware/browser or emulation details.
- [x] The art bible preserves the current rust/cream/parchment identity.
- [x] Palette and material guidance is specific enough to prevent independent agents from drifting stylistically.
- [x] Existing speed-reactive audio behavior is documented accurately.
- [x] No runtime behavior is changed.

## Verification

- Automated: not applicable.
- Build: `npm run build` if any shipped documentation index is changed.
- Manual: compare captured scenes with `docs/screenshots/` and current runtime.
- Evidence: record paths below.

## Handoff

**Last updated:** 2026-09-14T20:29:17Z
**Branch:** aesthetic/aes-000
**Worktree:** /Users/joshuajosai-levin/Code/landtrain-aes-000
**Implementation commit:** 8ccb8c3
**Merge commit:** 130e424
**Completed:** Added a reproducible capture index, 21 stable PNG baselines spanning all four roadmap viewports, all four camera modes at day/dusk/night, intro, prairie arrival, grassland river crossing/destination, and ending; recorded live desktop and mobile-class renderer/frame measurements; documented existing audio; established sampled palette, silhouette, screen-space detail, material, brass, glow, composition, and motion rules.
**Remaining:** Physical low-tier mobile profiling is carried into AES-001; no AES-000 work remains.
**Decisions/deviations:** Used current runtime colors as binding anchors. Mobile-class evidence uses Chrome touch/DPR/4x-CPU emulation on the M1 Pro because physical mobile hardware was unavailable. Temporary renderer exposure was used only while collecting live `WebGLRenderer.info` and was removed before verification and commit. No runtime file differs from the task base.
**Risks/blockers:** The 60 fps samples are VSync-bound and do not quantify spare GPU headroom. Emulation retains the desktop M1 Pro GPU and cannot establish low-tier physical-device limits. The grassland representative frame is substantially heavier (407 calls, 202,470 triangles) than prairie and should drive AES-001 profiling.
**Verification results:** Branch verification and post-merge verification both passed: `node --test test/*.test.js` passed 21/21 and `npm run build` passed with the existing >500 kB chunk warning. Manual browser capture completed in Chrome 152 at 390x844, 844x390, 1024x768, and 1440x900; captures compared against `docs/screenshots/`; final diff is documentation/evidence only.
**Evidence:** `docs/aesthetic-baseline/AES-000/README.md`; `docs/aesthetic-baseline/AES-000/art-bible.md`; `docs/aesthetic-baseline/AES-000/performance.json`; `docs/aesthetic-baseline/AES-000/screenshots/` (21 PNGs).
