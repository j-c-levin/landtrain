# Fog of War Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make unrevealed fog fully opaque, reveal a forward-fanning "flashlight" cone as the train travels, and add off-screen edge markers pointing to the destination tree and the train.

**Architecture:** Fog is a 2D canvas texture on a `y=75` plane (`src/fog.js`); we raise its full-blend opacity to 1.0 and add a heading-aware cone reveal that stamps expanding soft circles forward. A new pure module (`src/markers.js`) computes off-screen edge placement from projected NDC coordinates; `src/main.js` projects targets each frame and `src/ui.js` positions DOM markers inside the `#hud` overlay.

**Tech Stack:** Three.js 0.170, Vite, vanilla DOM/CSS. No test framework installed — pure logic is tested with Node's built-in test runner (`node --test`), and rendering changes are verified visually via `npm run dev` and the `window.__game` debug handle.

---

### Task 1: Make unrevealed fog fully opaque

Removes the 2% translucency that lets rock/ridge geometry bleed through as dots in map view.

**Files:**
- Modify: `src/constants.js` (add a tunable)
- Modify: `src/fog.js:83-86` (`setBlend`)

- [ ] **Step 1: Add the opacity tunable**

In `src/constants.js`, inside the `TUNING` object, after the `revealEvery` line (`src/constants.js:65`) add:

```js
  fogOpacity: 1.0, // full-blend shroud opacity; <1 leaks hazard geometry through
```

- [ ] **Step 2: Use it in setBlend**

In `src/fog.js`, change the `setBlend` method (`src/fog.js:83-86`). First add the import at the top of the file (`src/fog.js:2` currently imports `WORLD`):

```js
import { WORLD, TUNING } from './constants.js';
```

Then replace the opacity line:

```js
  setBlend(blend) {
    this.material.opacity = Math.min(1, blend / 0.35) * TUNING.fogOpacity;
    this.mesh.visible = blend > 0.01;
  }
```

- [ ] **Step 3: Visual verification**

Run: `npm run dev` and open the shown URL. Enter map view (drive to the cab, plot nothing, switch to overhead). Pan to an unexplored area away from the revealed disc.
Expected: the unrevealed fog is a solid dark plum with noise texture — **no faint darker rock/ridge dots visible anywhere**. Compare against the revealed area where terrain shows normally.

- [ ] **Step 4: Commit**

```bash
git add src/constants.js src/fog.js
git commit -m "Fog: make unrevealed shroud fully opaque (no hazard bleed-through)"
```

---

### Task 2: Forward "flashlight" cone reveal in fog.js

Adds a heading-aware reveal that keeps the side circle and fans a soft cone forward — narrow at the train, widest at the far end.

**Files:**
- Modify: `src/constants.js` (add cone tunables)
- Modify: `src/fog.js` (refactor stamp helper; add `revealCone`)

- [ ] **Step 1: Add cone tunables**

In `src/constants.js`, inside `TUNING`, directly after the `revealRadius: 112,` line (`src/constants.js:64`) add:

```js
    revealForwardMult: 2.5, // forward reach as a multiple of revealRadius (~280u)
    revealConeEndRadius: 150, // half-width of the cone at its far end
    revealConeNearRadius: 40, // half-width where the cone leaves the train
    revealConeSteps: 18, // overlapping circle stamps along the heading
```

- [ ] **Step 2: Extract the single-circle stamp into a private helper**

In `src/fog.js`, refactor `reveal` (`src/fog.js:61-77`) so the gradient-circle paint is reusable. Replace the whole `reveal` method with:

```js
  // Paint one soft radial hole (world space). Caller manages texture.needsUpdate.
  #stamp(wx, wz, radius) {
    const cx = (wx - WORLD.minX) * this.scale;
    const cy = (wz - WORLD.minZ) * this.scale;
    const r = radius * this.scale;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  reveal(wx, wz, radius) {
    this.#stamp(wx, wz, radius);
    this.texture.needsUpdate = true;
  }
```

- [ ] **Step 3: Add the cone reveal**

In `src/fog.js`, add this method below `reveal`:

```js
  // Reveal a forward-fanning cone plus the lateral side circle. (dirX, dirZ)
  // is the (not necessarily normalized) heading; if it's ~zero we fall back to
  // a plain circle. The cone is narrow at the train and widest at the far end:
  // overlapping soft stamps grow from nearR to endR over `steps` along heading.
  revealCone(wx, wz, dirX, dirZ, sideRadius, forwardLen, endR, nearR, steps) {
    this.#stamp(wx, wz, sideRadius); // lateral/near vision, unchanged feel
    const len = Math.hypot(dirX, dirZ);
    if (len > 1e-4) {
      const ux = dirX / len;
      const uz = dirZ / len;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = wx + ux * forwardLen * t;
        const pz = wz + uz * forwardLen * t;
        const r = nearR + (endR - nearR) * t;
        this.#stamp(px, pz, r);
      }
    }
    this.texture.needsUpdate = true;
  }
```

- [ ] **Step 4: Verification (manual, via debug handle)**

Run: `npm run dev`, open the URL, dismiss the intro. In the browser devtools console run:

```js
const f = window.__game.fog;
f.revealCone(900, 0, 1, 0, 112, 280, 150, 40, 18); // cone pointing +X
```

Then switch to map view and pan to ~`(900,0)`.
Expected: a teardrop/flashlight hole — a round patch around `(900,0)` with a fan that narrows where it leaves the patch and widens toward `(1180,0)`. Edges are soft, not hard-lined.

- [ ] **Step 5: Commit**

```bash
git add src/constants.js src/fog.js
git commit -m "Fog: add forward-fanning cone reveal (revealCone)"
```

---

### Task 3: Drive the cone from train heading in main.js

Wires the travel-reveal loop to compute heading and call `revealCone`.

**Files:**
- Modify: `src/main.js` (spawn reveal area + reveal loop)

- [ ] **Step 1: Track the last reveal position**

In `src/main.js`, the spawn reveal is at lines 69-71. Replace:

```js
// first reveal around the spawn point
fog.reveal(train.pos.x, train.pos.z, TUNING.revealRadius * 1.3);
state.lastRevealAt = 0;
```

with:

```js
// first reveal around the spawn point
fog.reveal(train.pos.x, train.pos.z, TUNING.revealRadius * 1.3);
state.lastRevealAt = 0;
state.lastRevealPos = { x: train.pos.x, z: train.pos.z };
```

Also add `lastRevealPos` to the `state` object literal (`src/main.js:59-63`) for clarity — change it to:

```js
const state = {
  arrived: false,
  lastRevealAt: -999,
  lastRevealPos: { x: 0, z: 0 },
  started: false,
};
```

- [ ] **Step 2: Use heading in the travel-reveal loop**

In `src/main.js`, replace the reveal block (`src/main.js:285-289`):

```js
    // fog peels back as the train travels
    if (train.distanceTraveled - state.lastRevealAt >= TUNING.revealEvery) {
      state.lastRevealAt = train.distanceTraveled;
      fog.reveal(train.pos.x, train.pos.z, TUNING.revealRadius);
    }
```

with:

```js
    // fog peels back as the train travels — a forward-fanning cone aimed
    // along the direction of travel, so we reveal as far ahead as the cutaway
    // view can actually see, while the side radius stays as before.
    if (train.distanceTraveled - state.lastRevealAt >= TUNING.revealEvery) {
      state.lastRevealAt = train.distanceTraveled;
      const dx = train.pos.x - state.lastRevealPos.x;
      const dz = train.pos.z - state.lastRevealPos.z;
      fog.revealCone(
        train.pos.x,
        train.pos.z,
        dx,
        dz,
        TUNING.revealRadius,
        TUNING.revealRadius * TUNING.revealForwardMult,
        TUNING.revealConeEndRadius,
        TUNING.revealConeNearRadius,
        TUNING.revealConeSteps
      );
      state.lastRevealPos = { x: train.pos.x, z: train.pos.z };
    }
```

- [ ] **Step 3: Visual verification**

Run: `npm run dev`. Plot a straight route, let the train drive, then enter map view.
Expected: the cleared corridor reaches noticeably further ahead of the train than to its sides, fanning outward in the direction of travel. A rock visible out the front in driving view is revealed on the map. Around curves the cone swings to follow the heading. Lateral clearance looks the same as before.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "Fog: aim travel reveal forward along train heading"
```

---

### Task 4: Pure edge-marker placement math (TDD)

A dependency-free module that turns a projected target into an on/off-screen decision plus edge position and pointing angle. Tested with Node's built-in runner.

**Files:**
- Create: `src/markers.js`
- Test: `test/markers.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/markers.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgePlacement } from '../src/markers.js';

test('target centered in front is on-screen', () => {
  const p = edgePlacement(0, 0, false, 0.9);
  assert.equal(p.onScreen, true);
});

test('target far to the right is off-screen, pinned right, points right', () => {
  const p = edgePlacement(2, 0, false, 0.9);
  assert.equal(p.onScreen, false);
  assert.ok(p.sx > 0.9, `sx ${p.sx} should be near right edge`);
  assert.ok(Math.abs(p.sy - 0.5) < 1e-9, 'sy centered');
  assert.ok(Math.abs(p.angle) < 1e-9, 'angle ~0 (right)');
});

test('target above is pinned to the top of the screen', () => {
  const p = edgePlacement(0, 2, false, 0.9);
  assert.equal(p.onScreen, false);
  assert.ok(p.sy < 0.1, `sy ${p.sy} should be near top`);
});

test('target behind the camera is off-screen and direction is flipped', () => {
  const p = edgePlacement(0.5, 0, true, 0.9);
  assert.equal(p.onScreen, false);
  assert.ok(p.sx < 0.1, `sx ${p.sx} should be flipped to the left`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/markers.test.js`
Expected: FAIL — `Cannot find module '../src/markers.js'`.

- [ ] **Step 3: Implement the module**

Create `src/markers.js`:

```js
// Pure screen-projection math for off-screen edge indicators.
// Inputs are normalized device coordinates from THREE.Vector3.project():
// ndcX, ndcY in [-1,1] with y up. `behind` is true when the target is behind
// the camera (project() mirrors such points, so we flip them). `inset` is the
// fraction of the half-extent at which markers ride the edge (0.9 ≈ 10% in).
// Returns screen fractions sx, sy in [0,1] with y DOWN (CSS convention) and the
// pointing angle in radians (0 = right, measured for a y-down screen).
export function edgePlacement(ndcX, ndcY, behind, inset = 0.9) {
  let x = ndcX;
  let y = ndcY;
  if (behind) {
    x = -x;
    y = -y;
  }
  const onScreen = !behind && Math.abs(x) <= inset && Math.abs(y) <= inset;

  // push the direction vector out to the inset rectangle edge
  const scale = inset / Math.max(Math.abs(x), Math.abs(y), 1e-6);
  const ex = Math.max(-inset, Math.min(inset, x * scale));
  const ey = Math.max(-inset, Math.min(inset, y * scale));

  // NDC (y up) -> screen fraction (y down)
  const sx = ex * 0.5 + 0.5;
  const sy = -ey * 0.5 + 0.5;
  // angle for a y-down screen: up is -y
  const angle = Math.atan2(-y, x);
  return { onScreen, sx, sy, angle };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/markers.test.js`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/markers.js test/markers.test.js
git commit -m "Markers: pure edge-placement projection math + tests"
```

---

### Task 5: Edge-marker DOM, styles, and UI methods

Adds the two marker elements, on-brand styling, and a UI method to position them.

**Files:**
- Modify: `index.html` (markers inside `#hud`)
- Modify: `src/style.css` (marker styles)
- Modify: `src/ui.js` (refs + `setEdgeMarker`)

- [ ] **Step 1: Add marker DOM**

In `index.html`, inside `#hud`, immediately after the `#mute-hint` div (`index.html:65`) add:

```html
      <div id="edge-markers">
        <div class="edge-marker" id="marker-tree" hidden>
          <span class="edge-arrow"></span>
          <svg class="edge-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2c3 0 5 2.4 5 5.2 0 1-.3 1.9-.8 2.6 1.4.6 2.3 2 2.3 3.6 0 2.2-1.9 4-4.2 4H9.7C7.4 17.4 5.5 15.6 5.5 13.4c0-1.6.9-3 2.3-3.6-.5-.7-.8-1.6-.8-2.6C7 4.4 9 2 12 2z" fill="#8a9a6b"/>
            <rect x="11" y="15" width="2" height="7" rx="1" fill="#6b5640"/>
          </svg>
        </div>
        <div class="edge-marker" id="marker-train" hidden>
          <span class="edge-arrow"></span>
          <svg class="edge-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="7" width="13" height="8" rx="1.5" fill="#b5573c"/>
            <rect x="14" y="4" width="5" height="6" rx="1" fill="#c9913e"/>
            <circle cx="8" cy="17" r="2" fill="#3d2f28"/>
            <circle cx="14" cy="17" r="2" fill="#3d2f28"/>
          </svg>
        </div>
      </div>
```

- [ ] **Step 2: Add marker styles**

In `src/style.css`, append at the end of the file:

```css
/* ---------- edge markers (off-screen destination / train) ---------- */
#edge-markers {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.edge-marker {
  position: absolute;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px; /* center on its left/top point */
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(36, 29, 46, 0.66);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
}
.edge-marker[hidden] {
  display: none;
}
.edge-marker .edge-icon {
  width: 24px;
  height: 24px;
}
.edge-marker .edge-arrow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  /* a triangle pointing right at angle 0; rotated to face the target */
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 9px solid var(--cream);
  transform-origin: -22px center; /* orbit outside the badge */
  transform: translate(0, -50%) rotate(0rad);
}
```

- [ ] **Step 3: Add UI refs and method**

In `src/ui.js` constructor, after `this.btnClear = ...` (`src/ui.js:18`) add:

```js
    this.markerTree = document.getElementById('marker-tree');
    this.markerTrain = document.getElementById('marker-train');
```

Then add this method to the `UI` class (e.g. after `setOrbitActive`, `src/ui.js:83`):

```js
  // placement = { onScreen, sx, sy, angle } from edgePlacement(); w,h = viewport px.
  setEdgeMarker(name, placement, w, h) {
    const el = name === 'tree' ? this.markerTree : this.markerTrain;
    if (!el) return;
    if (placement.onScreen) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.style.left = `${placement.sx * w}px`;
    el.style.top = `${placement.sy * h}px`;
    const arrow = el.querySelector('.edge-arrow');
    arrow.style.transform = `translate(0, -50%) rotate(${placement.angle}rad)`;
  }
```

- [ ] **Step 4: Commit**

```bash
git add index.html src/style.css src/ui.js
git commit -m "Markers: add tree/train edge-marker DOM, styles, and UI setter"
```

---

### Task 6: Project targets each frame in main.js

Wires per-frame projection so markers track the tree and train.

**Files:**
- Modify: `src/main.js` (import; per-frame update)

- [ ] **Step 1: Import the helper and add a scratch vector**

In `src/main.js`, add to the imports near the top (after line 11):

```js
import { edgePlacement } from './markers.js';
```

And after the camera is created (`src/main.js:38`) add a reusable projection vector:

```js
const markerVec = new THREE.Vector3();
```

- [ ] **Step 2: Add a placement helper**

In `src/main.js`, just above `function tick()` (`src/main.js:259`) add:

```js
// Project a world point (ground height) and decide its edge-marker placement.
function placeMarker(tx, tz) {
  markerVec.set(tx, 0, tz).project(camera);
  const behind = markerVec.z > 1; // point is behind the camera
  return edgePlacement(markerVec.x, markerVec.y, behind, 0.9);
}
```

- [ ] **Step 3: Update markers every frame**

In `src/main.js`, inside `tick()`, after `ui.setOrbitActive(rig.autoOrbit);` (`src/main.js:318`) add:

```js
    if (state.started) {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ui.setEdgeMarker('tree', placeMarker(LANDMARK.x, LANDMARK.z), W, H);
      ui.setEdgeMarker('train', placeMarker(train.pos.x, train.pos.z), W, H);
    }
```

- [ ] **Step 4: Visual verification**

Run: `npm run dev`. In driving view facing roughly toward the tree: a tree marker rides the screen edge pointing toward the goal; turn away and it swings to the correct edge. The train marker stays hidden (you're on the train). In map view, pan/zoom so the train scrolls off-screen: a train marker appears at the edge pointing back toward it; pan so the tree is off-screen and its marker points toward it. Markers disappear when their target is on-screen.

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "Markers: project tree and train to edge markers each frame"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `node --test test/markers.test.js`
Expected: PASS.

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: builds with no errors.

- [ ] **Step 3: End-to-end visual check**

Run: `npm run dev`. Confirm all three improvements together:
1. Map view: no hazard dots in unrevealed fog.
2. Travel reveals a forward-fanning corridor that follows heading; lateral feel unchanged.
3. Edge markers: tree points to goal when off-screen; train points home when off-screen; both hide when on-screen; no distance labels.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "Fog-of-war improvements: verification pass"
```
