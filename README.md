# Land Train — First Journey

A cozy vertical-slice prototype: live aboard a self-driving land train,
plot its route from the cab, and tend to it (or just read) while the
plains roll by. Built per `docs/superpowers/specs/2026-06-12-land-train-first-journey-design.md`.

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL (usually http://localhost:5173).

## How to play

Drive your land train to the **Great Tree** on the horizon, and look
after it along the way.

The driver's cab is perched **up top at the front** — climb a ladder to
the rooftop and walk straight in.

| Input | Action |
|---|---|
| `A` / `D` (or ←/→) | Walk along the train |
| `W` / `S` (or ↑/↓) | Climb ladders (roof ↔ deck ↔ underside) |
| `E` | Interact / hold to tend |
| In the cab — click | Lay a waypoint on the map |
| `Z` / `C` | Undo / clear the route |
| Drag / scroll | Pan / zoom the map |
| Resting — drag / scroll | Orbit the camera / zoom from inside the car to a wide shot (the view sticks) |
| Resting — `O` | Recenter to the travel angle and resume the gentle auto-orbit |
| `M` | Toggle sound |

The train only ever slows — it never strands you. Plants only ever
droop — they never die.

## Dev notes

- One shared 3D world; the cutaway view and the overhead map are two
  framings of a single camera, tweened continuously (`src/camera/camera.js`).
- Cars are articulated: the lead tractor point records its travelled
  trail and each car samples it at its arc-length offset, so every car
  turns where the car ahead turned (`TrailPath` in `src/train/trail.js`).
- Walls are see-through per zone: the car you occupy fades out; the
  others stay opaque except their window openings. Book mode seals
  everything and hands you a free orbit camera.
- Fog of war is a canvas texture with soft holes punched along the
  travelled path (`src/map/fog-of-war.js`).
- Append `?ts=4` to the URL to speed up time for tuning/testing.
- `window.__game` exposes live state in the console.

## Performance

- `?perf=1` shows a corner panel: fps, frame ms (average and worst over the
  last second), JS ms per frame, tier, device pixel ratio and the ratio
  actually rendered, drawing-buffer size, draw calls and triangles (main +
  shadow pass), shader programs and lights.
- `?tier=low|medium|high` forces a quality tier and switches off the
  adaptive downgrade (`?quality=` is the older spelling).
- With `?perf=1`, three more switches narrow a problem down on the device
  itself: `?pr=1.5` overrides the render pixel ratio, `?aa=0` drops MSAA,
  and `?off=a,b` hides things. Names: `shadows`, `interiorShadows`,
  `trainShadows`, `bounce`, `fill`, `points`, `hemi`, `env`, `interiors`,
  `train`, `figure`, `cover`, `scenery`, `ground`, `water`, `smoke`, `sky`,
  `shroud`, `transparent`, `overlays`, `tonemap`, `shading`.
  Example: `?perf=1&tier=low&off=shadows,points`.
- `npm run bench` renders six fixed scenes in headless Chrome on SwiftShader
  (CPU rasteriser) at 390x844 @3x and reports median frame ms, calls,
  triangles, lights and pixels: `npm run bench -- --tier low --compare
  perf/baseline-low.json`. `--ablate` re-measures each scene with one thing
  off at a time; `--diff a.json b.json` compares two saved runs. SwiftShader
  shades vertices on the CPU, so it overstates geometry cost next to a
  phone GPU: read the `fixed` and `ms/Mpx` columns separately.
