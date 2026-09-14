# AES-000 Visual and Performance Baseline

Captured 2026-09-14 from commit `ba0f3e1` plus documentation-only AES-000 work. The runtime URL was `http://127.0.0.1:5173/landtrain/?ts=1`, served with `npm run dev -- --host 127.0.0.1`. Existing files in `docs/screenshots/` were used as the historical comparison set.

## Capture Environment

- Host: 14-inch MacBook Pro (`MacBookPro18,3`), Apple M1 Pro with 8 CPU cores and 14 GPU cores, 16 GB RAM.
- Displays: mirrored 3840 x 2160 Dell S2721QSA (1920 x 1080 logical, 60 Hz) and 3024 x 1964 built-in Liquid Retina XDR.
- Browser: headless Google Chrome 152.0.7977.82, WebGL 2 through `ANGLE Metal Renderer: Apple M1 Pro`.
- Desktop profile: native CPU speed, DPR 1, 1440 x 900 CSS/drawing buffer.
- Mobile-class profile: Chrome emulation, 390 x 844 CSS pixels, DPR 2 (780 x 1688 drawing buffer), touch/mobile context, 4x CPU throttle. This is not physical mobile hardware and retains the M1 Pro GPU.
- Frame samples: 300 consecutive `requestAnimationFrame` intervals with the first 30 discarded. Results are VSync-bound; 60 fps means only that these scenes met the host's 60 Hz cadence during this sample, not that GPU headroom was measured.
- Renderer counters: live `WebGLRenderer.info` values from the rendered scene. Counts are camera/frustum dependent. `memory.geometries` and `memory.textures` are renderer-managed allocations, not byte totals.

Full machine-readable measurements are in [`performance.json`](performance.json).

| Profile/state | Mean / median / p95 frame | FPS | Calls | Triangles | Points | Geometries | Textures |
|---|---:|---:|---:|---:|---:|---:|---:|
| Desktop, prairie inhabit/day | 16.666 / 16.7 / 16.7 ms | 60.0 | 182 | 57,342 | 2,370 | 642 | 8 |
| Desktop, grassland book/river/day | 16.666 / 16.7 / 16.7 ms | 60.0 | 407 | 202,470 | 2,370 | 529 | 16 |
| Mobile-class emulation, prairie inhabit/day | 16.666 / 16.7 / 16.7 ms | 60.0 | 82 | 54,864 | 2,370 | 156 | 3 |

The grassland representative frame is the present worst case in this set by calls and triangles. A physical low-tier device and GPU-time capture remain required before setting quality tiers in AES-001.

## Reproduction

1. Run `npm ci` and `npm run dev -- --host 127.0.0.1`.
2. Open `http://127.0.0.1:5173/landtrain/?ts=1` at the listed CSS viewport and DPR.
3. Dismiss the intro with Space. Use normal controls for player-facing checks.
4. For stable atmosphere checks, set `__game.sky.timeOffset` in the console to `14.4` (day), `52.8` (dusk), or `79.2` (night). These target phases 0.12, 0.44, and 0.66 of the 120-second cycle; elapsed runtime is added, so reload immediately before exact comparisons.
5. Reach the prairie arrival reproducibly with `__game.driveToTree()`. Dismiss the arrival card after the grassland streams.
6. Reproduce the river frame with `__game.train.reset({ x: 3100, z: 156, heading: 0 })`. The capture used book mode at its default wide orbit.
7. Reproduce the grassland destination with `__game.train.reset({ x: 5240, z: 0, heading: 0 })`, then use book mode at a wide orbit.
8. Reach the ending with `__game.driveToTree()` after grassland has loaded.

The committed runtime intentionally does not expose the renderer. Renderer counters were read during capture using temporary local instrumentation, removed before verification and commit.

## Evidence Index

All images are PNGs in [`screenshots/`](screenshots/). The URL is `?ts=1` for every image. `day`, `dusk`, and `night` correspond to the time offsets above.

| File | Viewport / DPR | Camera or state | Game state |
|---|---|---|---|
| `desktop-1440x900-intro-prairie-day.png` | 1440 x 900 / 1 | intro | Fresh load, intro card visible, prairie spawn |
| `desktop-1440x900-inhabit-prairie-day.png` | 1440 x 900 / 1 | inhabit | Started, prairie spawn, day |
| `desktop-1440x900-inhabit-prairie-dusk.png` | 1440 x 900 / 1 | inhabit | Started, prairie spawn, dusk |
| `desktop-1440x900-inhabit-prairie-night.png` | 1440 x 900 / 1 | inhabit | Started, prairie spawn, night |
| `desktop-1440x900-cabin-prairie-day.png` | 1440 x 900 / 1 | cab/cabin | Player on cab roof level, day |
| `desktop-1440x900-cabin-prairie-dusk.png` | 1440 x 900 / 1 | cab/cabin | Player on cab roof level, dusk |
| `desktop-1440x900-cabin-prairie-night.png` | 1440 x 900 / 1 | cab/cabin | Player on cab roof level, night |
| `desktop-1440x900-map-prairie-day.png` | 1440 x 900 / 1 | map | Prairie spawn, default map height, day |
| `desktop-1440x900-map-prairie-dusk.png` | 1440 x 900 / 1 | map | Prairie spawn, default map height, dusk |
| `desktop-1440x900-map-prairie-night.png` | 1440 x 900 / 1 | map | Prairie spawn, default map height, night |
| `desktop-1440x900-book-prairie-day.png` | 1440 x 900 / 1 | book | Reading pose, default orbit, day |
| `desktop-1440x900-book-prairie-dusk.png` | 1440 x 900 / 1 | book | Reading pose, default orbit, dusk |
| `desktop-1440x900-book-prairie-night.png` | 1440 x 900 / 1 | book | Reading pose, default orbit, night |
| `desktop-1440x900-arrival-prairie-day.png` | 1440 x 900 / 1 | arrival | First Great Tree arrival card; grassland streamed behind card |
| `desktop-1440x900-book-grassland-river-crossing-day.png` | 1440 x 900 / 1 | book | Train at x 3100, z 156 near first river bridge |
| `desktop-1440x900-book-grassland-destination-day.png` | 1440 x 900 / 1 | book | Train at x 5240, z 0 approaching second tree, wide orbit |
| `desktop-1440x900-ending-grassland-day.png` | 1440 x 900 / 1 | ending | Second-tree end card visible |
| `portrait-390x844-map-prairie-day.png` | 390 x 844 / 1 | map | Portrait phone viewport, prairie spawn |
| `landscape-844x390-cabin-prairie-dusk.png` | 844 x 390 / 1 | cab/cabin | Landscape phone viewport, dusk |
| `tablet-1024x768-book-prairie-night.png` | 1024 x 768 / 1 | book | Tablet viewport, night |
| `mobile-profile-390x844@2x-inhabit-prairie-day.png` | 390 x 844 / 2 | inhabit | Mobile-class performance profile, 4x CPU throttle |

## Baseline Observations

- The inhabit cutaway communicates the home clearly, with warm practical lights and readable room zoning, but the train extends beyond narrow portrait framing.
- The portrait map help overlaps and wraps densely at the top. This is baseline evidence for AES-011, not a change in AES-000.
- Prairie depth currently relies on fog, sparse scatter, and distant low hills; close composition is comparatively empty outside the train.
- Grassland has stronger layer density and landmarks but is substantially heavier in the representative book frame.
- The train remains recognizable in map view through its long three-car rust/cream block and bright selection ring.
- Night preserves warm train windows against a cool sky, the strongest current expression of the “warm home in immense wilderness” north star.

## Audio Baseline

Existing train movement audio is already speed-responsive and must not be reimplemented:

- `src/main.js` passes `train.speed / TUNING.baseSpeed` to `AudioFX.update()` every frame.
- `src/audio.js` maps that normalized speed to trundle gain `0.03 + speed01 * 0.34` and low-pass cutoff `60 + speed01 * 90` Hz, each smoothed with a 0.4-second target time constant.
- The procedural movement bed is looping brown noise. Wind is a separate band-passed layer with a slow 0.06 Hz gain LFO.
- Prairie is the default ambience. Grassland lowers wind and fades in water burble plus occasional procedural bird, cricket, and frog chirps.
- Chimes cover waypoint, arrival, tending completion, and view transitions. Tending and watering use throttled procedural ticks.
- Audio starts only after intro dismissal due to browser autoplay rules; `M` toggles the master gain. Current sound is non-spatial and synthesized locally with no network assets.

AES-013 should preserve the gain/filter response to speed while refining timbre, placement, and biome/surface layers.
