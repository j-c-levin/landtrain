# AES-013 - Spatial and Interaction Audio

**Status:** proposed
**Owner:** unassigned
**Depends on:** AES-000
**Blocks:** AES-015, AES-016
**Exclusive scope:** `src/audio.js`, audio-focused tests or generated audio assets approved by this task
**Shared scope:** event hooks from interactions/train/bridges require narrow interfaces coordinated with owning tasks or AES-016

## Objective

Deepen the sense of a living machine and distinct interior/exterior spaces while preserving the existing procedural ambience and speed-responsive train sound.

## Existing Behavior to Preserve

- Train movement sound already responds to speed through gain/filter behavior.
- Prairie wind and grassland wetland ambience already crossfade by biome.
- Audio begins only after a user gesture and supports muting.

## Work

- Refine the existing speed-responsive movement layer rather than duplicating it.
- Add offset wheel/coupler/suspension detail, engine crackle and pressure hiss, and bridge/surface character tied to actual state.
- Add ladder, footsteps, tools, watering, leaf recovery, chair/bunk settle, page turn, and control sounds.
- Spatialize station and car-local sounds with stereo panning or panner nodes appropriate to camera mode.
- Apply restrained interior/exterior filtering and mode-aware mix changes.
- Add sparse generative tonal moments at dawn, dusk, or destination beats only if they improve the quiet atmosphere.
- Bound oscillator/node lifetimes and pause scheduling while hidden.

## Acceptance Criteria

- [ ] Existing speed response remains audible and mechanically synchronized.
- [ ] New movement layers avoid rapid retriggering, phase buildup, and fatigue.
- [ ] Every interaction has distinct tactile feedback.
- [ ] Interior, exterior, wide orbit, and map mixes are perceptibly different but cohesive.
- [ ] Audio starts and resumes only through valid browser gesture rules.
- [ ] Mute stops all new schedulers and no nodes leak after repeated mode changes.
- [ ] `node --test test/*.test.js` and `npm run build` pass.

## Verification

- Manual: headphones and phone speaker; zero, low, and high speed; each station; each biome; bridge crossing; mute/resume/background cycle.
- Performance: inspect active node counts and scheduler behavior over a long journey.

## Handoff

**Last updated:** 2026-09-14
**Branch:** unassigned
**Worktree:** unassigned
**Implementation commit:** not started
**Merge commit:** not merged
**Completed:** none
**Remaining:** all work
**Decisions/deviations:** The roadmap explicitly corrects the earlier suggestion that speed response was absent.
**Risks/blockers:** Procedural layers can become harsh on phone speakers; tune at low playback volume and limit dense high frequencies.
**Verification results:** not run
**Evidence:** none
