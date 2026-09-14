# Land Train Aesthetic Roadmap

**Status:** approved
**Approved:** 2026-09-14
**Goal:** Strengthen Land Train's handmade storybook identity across models, environments, animation, UI, camera, sound, and rendering while preserving reliable mobile play.
**Architecture:** This manifest defines shared direction, sequencing, and completion rules. Each task has a separate file, branch, and Git worktree so an isolated agent can own and update its task without sharing an index, working directory, or uncommitted state with another agent.

## Product North Star

The game should feel like a warm, handmade home crossing an immense storybook wilderness. Improvements should come primarily from stronger silhouettes, composed scenery, tactile materials, expressive motion, and synchronized sound rather than photorealism, high polygon counts, or expensive full-screen effects.

The existing identity remains authoritative:

- Cozy low-poly geometry with selective flat shading.
- Rust, cream, dark wood, iron, brass, parchment, plum, and sage train language.
- Painterly day/night atmosphere and warm windows.
- One continuous world shared by inhabit, cab, map, and book cameras.
- Gentle stakes: maintenance slows the train but never strands the player.
- Procedural, deterministic construction and a compact offline build.

## Non-Negotiable Constraints

- Mobile remains a first-class platform in landscape and portrait orientations.
- Do not add a visual feature without a low-cost fallback or a measured reason it is safe.
- Preserve deterministic world generation. Use the existing seeded PRNG, never `Math.random()` for world placement.
- Prefer shared geometry, shared materials, merged static geometry, `InstancedMesh`, pooled effects, and shader/vertex-color variation.
- Avoid new allocations in per-frame update paths.
- Dispose all geometries, materials, render targets, and textures owned by unloadable content.
- Do not introduce network-required assets. New shipped assets must work through the existing offline precache.
- Preserve current game mechanics, route planning, collision, save-free progression, camera continuity, and input behavior unless a task explicitly changes them.
- Treat accessibility, safe areas, reduced motion, legibility, and touch discoverability as part of visual quality.
- Existing speed-responsive train movement audio already works. Audio work must preserve it and refine its character, spatial placement, and surface-specific layers rather than reimplementing the same feature.
- Use almost no source comments. Add a one-line comment only for a non-obvious trap.

## Performance Budgets

Task `AES-001` establishes measured baselines and final tier values. Until then, agents must observe these provisional limits:

| Area | Provisional constraint |
|---|---|
| Low-tier DPR | 1.0 |
| Medium-tier DPR | At most 1.5 |
| High-tier DPR | At most 2.0 |
| Low-tier shadow map | At most 1024 square |
| New dynamic shadow-casting lights | None without profiling evidence |
| Repeated objects above 40 instances | Instance or merge them |
| Continuous particles | Fixed-size pools only |
| Post-processing | Off on low and medium tiers |
| Touch targets | At least 44 by 44 CSS pixels |
| Runtime assets | Offline-compatible and size-accounted |

## Status Protocol

Allowed task states are `proposed`, `ready`, `in_progress`, `blocked`, `review`, `done`, and `superseded`.

An agent beginning work must:

1. Read this manifest and the assigned task file.
2. Confirm it is operating in the task's dedicated worktree and task branch, not the primary `main` worktree.
3. Check dependencies in the task file and inspect the current code rather than trusting old line numbers.
4. Change the task status to `in_progress`, set `Owner`, branch, worktree path, and handoff timestamp before implementation.
5. Stay inside the declared exclusive file scope. Shared files require coordination through the listed integration task.
6. Record discoveries, deviations, and verification results in the task file before handing off.

A task can be marked `done` only when:

- Every acceptance criterion is checked or explicitly superseded with rationale.
- Focused tests and `npm run build` pass.
- Required manual visual checks are complete at desktop and mobile viewport sizes.
- Performance-sensitive changes have before/after evidence.
- All intended task changes are committed on the task branch; no task is handed off with required uncommitted changes.
- The task file records its branch, worktree, and implementation commit SHA.
- The handoff section contains visual evidence paths for visual work.

A leaf agent finishes at `review`, not `done`. The integrating agent marks it `done` on `main` only after the branch is merged and post-merge verification passes. Do not mark a task done merely because implementation code exists. Do not update status rows in this manifest during leaf-task work; the task files are authoritative and this summary is reconciled by `AES-016` to avoid merge conflicts.

## Worktree and Merge Protocol

The roadmap itself must be committed to `main` before the first task worktree is created. Never create task branches from uncommitted roadmap files, and never copy uncommitted changes between worktrees.

### Coordinator: create a task worktree

From the primary repository, verify that the requested task is `ready`, its dependencies are `done` on `main`, and the primary worktree has no conflicting operation in progress. Fetch remote state when a GitHub remote is configured, then update `main` using a fast-forward-only operation if appropriate for the repository.

Create one stable branch and one sibling worktree per task:

```bash
git switch main
git worktree add ../landtrain-aes-000 -b aesthetic/aes-000 main
```

For another task, replace both occurrences of `aes-000` with its lowercase ID. Worktree paths use `../landtrain-aes-NNN`; branches use `aesthetic/aes-NNN`. Do not reuse one task branch or worktree for another task.

If a task branch already exists, attach it without `-b`:

```bash
git worktree add ../landtrain-aes-000 aesthetic/aes-000
```

The coordinator records the absolute worktree path and branch in the task file before delegation, or instructs the leaf agent to do so as its first commit.

### Leaf agent: implement and hand off

The leaf agent must:

1. Run `git branch --show-current` and `git status --short` before editing.
2. Refuse to work if the branch is `main` or does not match the assigned task.
3. Claim the task in its own task file and commit that claim with the implementation, or as a small first commit.
4. Implement only the assigned scope and never merge other roadmap branches into its branch.
5. Rebase on the latest `main` only when the coordinator requests it. Never force-push.
6. Run focused tests, the full Node suite, the production build, and required visual checks.
7. Set the task to `review`, complete its handoff and evidence, commit all intended files, and report the branch plus commit SHA.
8. Push `aesthetic/aes-NNN` to GitHub when an authenticated `origin` is available and the coordinator requested remote review.

Leaf agents do not check out or merge into `main`. This prevents concurrent agents from racing in the primary worktree.

### Coordinator: merge serially into main

The coordinator merges only one reviewed task at a time from the primary worktree:

```bash
git switch main
git merge --no-ff aesthetic/aes-000
node --test test/*.test.js
npm run build
```

Before merging, inspect the branch diff, task evidence, dependency state, and working-tree status. After merging, run post-merge verification and perform any required browser checks. If validation passes, update the task file on `main` from `review` to `done`, record the merge commit and results, and commit that status update. Push `main` only when explicitly requested and authenticated.

If validation fails, do not mark the task done. Fix it on the same task branch/worktree, or revert the merge only through a normal non-destructive revert commit when appropriate and authorized. Never use `git reset --hard` or force-push.

### Coordinator: clean up after integration

After the merge is verified and the task is `done` on `main`:

```bash
git worktree remove ../landtrain-aes-000
git branch -d aesthetic/aes-000
```

Delete a remote task branch only after confirming it is merged and no review reference needs it. Never remove a worktree containing uncommitted changes.

### Parallel work rules

- Agents may run concurrently only in separate task worktrees with non-overlapping scopes.
- Every branch starts from the latest `main` containing all declared dependencies.
- A dependent task worktree is not created from an unmerged dependency branch; merge the dependency to `main` first.
- Independent tasks in the same wave may branch from the same `main` commit.
- Merges to `main` are serialized by one coordinator, even when implementation ran concurrently.
- If two ready tasks unexpectedly need the same hotspot, pause the later task and update dependencies rather than resolving the conflict independently.
- The task branch carries its own task-file status changes. Agents do not edit the master manifest status table.

## Verification Commands

There is currently no `npm test` script. Use the commands that exist:

```bash
node --test test/*.test.js
npm run build
```

If no matching test files exist, record that fact and run `npm run build`. Browser-only visual work must also be checked manually in inhabit, cab, map, and book modes where relevant.

Recommended viewport set:

| Class | Viewport |
|---|---|
| Small portrait phone | 390 x 844 |
| Small landscape phone | 844 x 390 |
| Tablet | 1024 x 768 |
| Desktop | 1440 x 900 |

## Shared Hotspots

These files must not receive concurrent edits from separate tasks:

| Hotspot | Ownership rule |
|---|---|
| `src/main.js` | `AES-001`, then `AES-015`, then `AES-016` |
| `src/constants.js` | `AES-001`, then `AES-014`, then `AES-016` |
| `src/train.js` | `AES-002`, then `AES-003`, then `AES-004`, then `AES-010` |
| `src/grassland.js` | `AES-007`, then `AES-008`, then `AES-009` |
| `src/style.css`, `src/ui.js`, `index.html` | `AES-011`, then `AES-016` |
| `src/camera.js` | `AES-012`, then `AES-016` |

If earlier work extracts a hotspot into focused modules, later tasks may adopt those modules, but must document the deviation and preserve the dependency order.

## Dependency Graph

```text
AES-000 Baseline and art bible
  -> AES-001 Adaptive quality foundation
  -> AES-002 Train visual language
       -> AES-003 Train exterior
            -> AES-004 Train interiors
                 -> AES-005 Character and interaction animation
                 -> AES-010 Cartographic map treatment
  -> AES-006 Prairie composition
  -> AES-007 Grassland extraction
       -> AES-008 Grassland composition and flora
            -> AES-009 Water and bridge readability
  -> AES-011 Mobile UI and accessibility
  -> AES-012 Responsive camera composition
  -> AES-013 Spatial and interaction audio
  -> AES-014 Atmosphere and travel VFX

AES-001 + AES-003 + AES-006 + AES-009 + AES-010 + AES-011 + AES-012 + AES-013 + AES-014
  -> AES-015 Selective high-tier finishing
       -> AES-016 Integration, optimization, and release review
```

Tasks in separate worktrees may run in parallel only when their file scopes do not overlap and all dependencies have already been merged to `main` and marked done.

## Task Manifest

| ID | Task | Initial status | Depends on | Primary scope |
|---|---|---|---|---|
| [AES-000](2026-09-14-aesthetic-roadmap/AES-000-baseline-and-art-bible.md) | Baseline and art bible | ready | none | evidence and direction |
| [AES-001](2026-09-14-aesthetic-roadmap/AES-001-adaptive-quality.md) | Adaptive quality foundation | proposed | AES-000 | renderer and performance |
| [AES-002](2026-09-14-aesthetic-roadmap/AES-002-train-visual-language.md) | Train visual language | proposed | AES-000 | train materials and prototypes |
| [AES-003](2026-09-14-aesthetic-roadmap/AES-003-train-exterior.md) | Train exterior hero pass | proposed | AES-001, AES-002 | train exterior |
| [AES-004](2026-09-14-aesthetic-roadmap/AES-004-train-interiors.md) | Train interior stations | proposed | AES-003 | train interiors |
| [AES-005](2026-09-14-aesthetic-roadmap/AES-005-character-animation.md) | Character and interaction animation | proposed | AES-004 | player and interactions |
| [AES-006](2026-09-14-aesthetic-roadmap/AES-006-prairie-composition.md) | Prairie composition | proposed | AES-000, AES-001 | prairie world |
| [AES-007](2026-09-14-aesthetic-roadmap/AES-007-grassland-extraction.md) | Grassland module extraction | proposed | AES-000, AES-001 | grassland architecture |
| [AES-008](2026-09-14-aesthetic-roadmap/AES-008-grassland-composition.md) | Grassland composition and flora | proposed | AES-007 | grassland terrain and flora |
| [AES-009](2026-09-14-aesthetic-roadmap/AES-009-water-and-bridges.md) | Water and bridge readability | proposed | AES-008 | water and crossings |
| [AES-010](2026-09-14-aesthetic-roadmap/AES-010-map-cartography.md) | Cartographic map treatment | proposed | AES-003, AES-009 | route, fog, markers |
| [AES-011](2026-09-14-aesthetic-roadmap/AES-011-mobile-ui.md) | Mobile UI and accessibility | proposed | AES-000, AES-001 | DOM UI and touch |
| [AES-012](2026-09-14-aesthetic-roadmap/AES-012-responsive-camera.md) | Responsive camera composition | proposed | AES-000, AES-001 | camera |
| [AES-013](2026-09-14-aesthetic-roadmap/AES-013-spatial-audio.md) | Spatial and interaction audio | proposed | AES-000 | audio |
| [AES-014](2026-09-14-aesthetic-roadmap/AES-014-atmosphere-and-vfx.md) | Atmosphere and travel VFX | proposed | AES-001, AES-006, AES-009 | sky and pooled VFX |
| [AES-015](2026-09-14-aesthetic-roadmap/AES-015-high-tier-finishing.md) | Selective high-tier finishing | proposed | listed in graph | renderer finishing |
| [AES-016](2026-09-14-aesthetic-roadmap/AES-016-integration-and-release.md) | Integration and release review | proposed | all implementation tasks | shared integration |

## Suggested Parallel Waves

| Wave | Safe concurrent work |
|---|---|
| 1 | AES-000 only |
| 2 | AES-001 and AES-002 after baseline approval |
| 3 | AES-003, AES-006, AES-007, AES-011, AES-012, AES-013 |
| 4 | AES-004, AES-008 |
| 5 | AES-005, AES-009 |
| 6 | AES-010 and AES-014 |
| 7 | AES-015 |
| 8 | AES-016 |

## Starting Work in a Clean Context

Use one of these instructions:

```text
Continue the aesthetic roadmap as coordinator. Read docs/superpowers/plans/2026-09-14-aesthetic-roadmap.md, select the earliest ready unowned task whose dependencies are done on main, create its dedicated aesthetic/aes-NNN branch and sibling Git worktree from current main, delegate or implement only inside that worktree, verify it, merge it serially back to main, run post-merge verification, mark it done, and safely remove the worktree.
```

```text
Pick up AES-009 as a leaf agent. Work only in the coordinator-provided ../landtrain-aes-009 worktree on branch aesthetic/aes-009. Read the aesthetic roadmap and AES-009 task file, verify the branch and dependencies, claim the task, complete only its declared scope, run verification, set it to review, commit all intended work, and report the commit SHA and evidence. Do not merge to main yourself.
```

An orchestrating agent should assign whole task files and worktrees to subagents while retaining branch review, serialized main merges, post-merge browser verification, and hotspot conflict resolution in the primary context.
