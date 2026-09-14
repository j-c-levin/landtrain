# AES-000 - Baseline and Art Bible

**Status:** in_progress
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

- [ ] Baseline images use stable names and list exact URL/query parameters and game state.
- [ ] Performance measurements include hardware/browser or emulation details.
- [ ] The art bible preserves the current rust/cream/parchment identity.
- [ ] Palette and material guidance is specific enough to prevent independent agents from drifting stylistically.
- [ ] Existing speed-reactive audio behavior is documented accurately.
- [ ] No runtime behavior is changed.

## Verification

- Automated: not applicable.
- Build: `npm run build` if any shipped documentation index is changed.
- Manual: compare captured scenes with `docs/screenshots/` and current runtime.
- Evidence: record paths below.

## Handoff

**Last updated:** 2026-09-14T20:00:36Z
**Branch:** aesthetic/aes-000
**Worktree:** /Users/joshuajosai-levin/Code/landtrain-aes-000
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** Task claimed in the dedicated worktree; no runtime files will be changed.
**Risks/blockers:** Physical mobile hardware may not be available; document emulation honestly.
**Verification results:** not run
**Evidence:** none
