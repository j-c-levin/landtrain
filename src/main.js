import * as THREE from 'three';
import { createWorld } from './world.js';
import { createGrassland } from './grassland.js';
import { SkyCycle } from './sky.js';
import { Train } from './train.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { FogOfWar } from './fog.js';
import { Interactions } from './interactions.js';
import { UI } from './ui.js';
import { AudioFX } from './audio.js';
import { TUNING, WORLD, CAB_FROM_X, clamp } from './constants.js';
import { edgePlacement } from './markers.js';
import { registerServiceWorker } from './sw-register.js';

registerServiceWorker();

// ----------------------------------------------------------------- input
const keys = new Set();
const pressedThisFrame = new Set();
const input = {
  down: (code) => keys.has(code),
  pressed: (code) => pressedThisFrame.has(code),
};
// fed to the player while it shouldn't be driving (mid-transition, map, book)
// so its rig still re-syncs onto the train each frame without taking input
const NEUTRAL_INPUT = { down: () => false, pressed: () => false };

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressedThisFrame.add(e.code);
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ----------------------------------------------------------------- setup
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 9000);
const markerVec = new THREE.Vector3();
const fwdDir = new THREE.Vector3();

const world = createWorld(scene);
const sky = new SkyCycle(scene, renderer, world.sunLight);
const fog = new FogOfWar(scene);
const train = new Train(scene);
const player = new Player(train, scene);
const rig = new CameraRig(camera, train, player);
const ui = new UI();
const audio = new AudioFX();
const interactions = new Interactions({ train, player, rig, ui, audio });

// --- seamless world streaming state ---
// The grassland is built lazily when the prairie tree is reached; until then
// it's null and only the prairie exists.
let grassland = null;
// The LIVE obstacle list the train routes against. Starts as the prairie's;
// becomes (kept prairie) + grassland once the grassland streams in.
let obstacles = world.obstacles;
// The current objective — the prairie tree first, then the grassland tree.
let goalPos = world.landmarkPos;
// Progression: 'prairie' (driving to the first tree) → 'grassland' (driving to
// the second) → 'done' (end beat shown). Each goal arrival fires exactly once.
let stage = 'prairie';

// Build the grassland (the second "level") behind the arrival card. By the time
// this runs the card is already painted over the whole screen, so the one-frame
// hitch from generating a biome's worth of geometry — and freeing the western
// prairie — is hidden: it lands on the text the player is reading, not on live
// gameplay. Two rAFs so the browser has actually painted the card before the
// main thread blocks; the card locks its own dismiss for 600ms, well past this.
function streamGrassland() {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      grassland = createGrassland(scene);
      world.disposeBefore(); // unload the western prairie (prunes obstacles in place)
      obstacles = world.obstacles.concat(grassland.obstacles); // kept prairie + grassland
      goalPos = grassland.landmarkPos; // now carry the journey on to the new tree
      stage = 'grassland';
    })
  );
}

train.onEvent = (name) => {
  if (name === 'blocked') {
    audio.chime('soft');
    ui.toast('The way ahead is blocked — head to the cab and plot a way around.');
  } else if (name === 'route-finished' && stage !== 'done') {
    ui.toast('End of the plotted route. The train rests — extend it from the cab.');
  }
};

const state = {
  started: false,
  // distance travelled at the last fog reveal, so the travel loop fires on
  // distance rather than time.
  lastRevealAt: 0,
};

// Reveal a forward-fanning cone at the train, aimed along where it FACES (not
// where it has been) — so the cone is there from the first frame at spawn, even
// before the train moves, and always points the way the cab view looks.
function revealAhead() {
  train.forwardDir(fwdDir);
  fog.revealCone(
    train.pos.x,
    train.pos.z,
    fwdDir.x,
    fwdDir.z,
    TUNING.revealRadius,
    TUNING.revealRadius * TUNING.revealForwardMult,
    TUNING.revealConeEndRadius,
    TUNING.revealConeNearRadius,
    TUNING.revealConeSteps
  );
}

// time scale for tuning/testing: ?ts=4
const params = new URLSearchParams(location.search);
const timeScale = clamp(parseFloat(params.get('ts') || '1') || 1, 0.1, 20);

// first reveal at the spawn point — a forward cone along the train's facing,
// so the way ahead is already partly lit before you drive a single unit.
revealAhead();

// ------------------------------------------------------------- map input
const raycaster = new THREE.Raycaster();
// Map clicks land on this plane (y=0). The route overlay in train.js must be
// drawn at the same height (ROUTE_Y) or the tilted map camera shows parallax.
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

// One finger (or the mouse) pans the map / orbits the book view; two
// fingers pinch-zoom. Pointers are tracked per-id so a second finger
// can't double-feed the drag.
const scenePointers = new Map(); // pointerId -> last position
let dragMoved = 0;
let pinchGap = 0;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function pinchGapNow() {
  const [a, b] = [...scenePointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

canvas.addEventListener('pointerdown', (e) => {
  if ((rig.mode !== 'map' && rig.mode !== 'book') || rig.busy) return;
  if (scenePointers.size === 0) dragMoved = 0;
  scenePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (scenePointers.size === 2) {
    pinchGap = pinchGapNow();
    dragMoved += 999; // a pinch is never a waypoint tap
  }
});

canvas.addEventListener('pointermove', (e) => {
  const prev = scenePointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  prev.x = e.clientX;
  prev.y = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);

  if (scenePointers.size >= 2) {
    // pinch — fingers apart pulls the view closer
    const gap = pinchGapNow();
    if (pinchGap > 0 && gap > 0) {
      const factor = pinchGap / gap;
      if (rig.mode === 'map') rig.zoomMap(factor);
      else rig.orbitZoom(factor);
    }
    pinchGap = gap;
  } else if (rig.mode === 'map' && dragMoved > 6) {
    rig.panMap(dx, dy, window.innerHeight);
  } else if (rig.mode === 'book') {
    rig.orbitDrag(dx, dy);
  }
});

window.addEventListener('pointerup', (e) => {
  const wasTracked = scenePointers.delete(e.pointerId);
  if (scenePointers.size < 2) pinchGap = 0;
  if (!wasTracked) return;
  if (scenePointers.size > 0) return; // other fingers still down
  if (rig.mode !== 'map' || rig.busy) return;
  if (dragMoved > 6 || e.button === 2) return; // it was a pan/pinch, not a click

  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(groundPlane, hit)) {
    if (train.addWaypoint(hit.x, hit.z)) audio.chime('waypoint');
  }
});
window.addEventListener('pointercancel', (e) => {
  scenePointers.delete(e.pointerId);
  if (scenePointers.size < 2) pinchGap = 0;
});

// ----------------------------------------------------------- touch zones
// Phone/tablet controls, synthesized into the same virtual key set the
// keyboard feeds — player & interaction logic stay unchanged. Left/right
// thirds walk; the middle column climbs (top) or descends (bottom) at
// ladders; the centre is E — tap to interact, keep a finger down to tend.
// Walk modes only (inhabit + cabin): map taps lay waypoints and book drags
// orbit, so zone-keys would fight them there.
const touchHolds = new Map(); // pointerId -> synthesized key code

function zoneCode(x, y) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (x < w / 3) return 'ArrowLeft';
  if (x > (2 * w) / 3) return 'ArrowRight';
  if (y < h / 3) return 'ArrowUp';
  if (y > (2 * h) / 3) return 'ArrowDown';
  return 'KeyE';
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  if ((rig.mode !== 'inhabit' && rig.mode !== 'cabin') || rig.busy) return;
  const code = zoneCode(e.clientX, e.clientY);
  touchHolds.set(e.pointerId, code);
  if (!keys.has(code)) pressedThisFrame.add(code);
  keys.add(code);
});

function releaseTouch(e) {
  const code = touchHolds.get(e.pointerId);
  if (code === undefined) return;
  touchHolds.delete(e.pointerId);
  // lift the key only when no other finger is holding the same zone
  if (![...touchHolds.values()].includes(code)) keys.delete(code);
}
window.addEventListener('pointerup', releaseTouch);
window.addEventListener('pointercancel', releaseTouch);

// ----------------------------------------------------------- view buttons
// Clear hit targets for the views a phone can't E/Escape out of.
function toggleOrbitView() {
  if (rig.mode !== 'book' || rig.busy) return;
  const on = rig.toggleAutoOrbit();
  ui.toast(on ? 'gentle orbit' : 'view held', 1600);
}

ui.bindViewButtons({
  onOrbit: toggleOrbitView,
  onUndo: () => {
    if (rig.mode === 'map' && !rig.busy) train.undoWaypoint();
  },
  onClear: () => {
    if (rig.mode === 'map' && !rig.busy) train.clearRoute();
  },
  onExit: () => {
    if (rig.busy) return;
    if (rig.mode === 'book') {
      player.stand();
      rig.exitBook();
    } else if (rig.mode === 'map') {
      rig.exitMap();
      audio.chime('soft');
    }
  },
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (rig.mode === 'map') {
      e.preventDefault();
      rig.zoomMap(Math.exp(e.deltaY * 0.0011));
    } else if (rig.mode === 'book') {
      e.preventDefault();
      rig.orbitZoom(Math.exp(e.deltaY * 0.0011));
    }
  },
  { passive: false }
);

// ------------------------------------------------------------- intro card
ui.intro(() => {
  audio.start();
  state.started = true;
});

// ----------------------------------------------------------------- resize
// Reconciled every frame instead of trusting resize events: CSS keeps the
// canvas at 100% of the viewport, and we match the drawing buffer to its
// actual on-screen size × devicePixelRatio. This survives fullscreen
// transitions, browser zoom, and moving between displays with different
// pixel ratios — all cases where a one-shot 'resize' listener misses.
function syncRendererSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false); // false: leave CSS sizing alone
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
syncRendererSize();

// ------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let elapsed = 0;

// Project a world point (ground height) and decide its edge-marker placement.
function placeMarker(tx, tz) {
  markerVec.set(tx, 0, tz).project(camera);
  const behind = markerVec.z > 1; // point is behind the camera
  return edgePlacement(markerVec.x, markerVec.y, behind, 0.9); // 0.9 = ride 5% in from each edge
}

function tick() {
  requestAnimationFrame(tick);
  syncRendererSize();
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale;
  elapsed += dt;

  if (state.started) {
    // global keys
    if (pressedThisFrame.has('KeyM')) ui.setMuted(audio.toggleMute());
    if (rig.mode === 'map' && !rig.busy) {
      if (pressedThisFrame.has('KeyZ') || pressedThisFrame.has('Backspace')) train.undoWaypoint();
      if (pressedThisFrame.has('KeyC')) train.clearRoute();
    }
    if (pressedThisFrame.has('KeyO')) toggleOrbitView();

    interactions.update(dt, input);

    // Always update so the player rig re-syncs onto the (still-moving) train
    // every frame — otherwise it goes stale in world space during camera
    // transitions, e.g. standing from a rest leaves it behind the train for
    // the length of the tween. Only feed real input when it's drivable.
    const controllable = (rig.mode === 'inhabit' || rig.mode === 'cabin') && !rig.busy;
    player.update(dt, controllable ? input : NEUTRAL_INPUT, elapsed);
    // Bolt the player rigidly into the car it occupies while the camera is locked
    // close (cab + seated views) so it rides the car's sway instead of hanging
    // static above a wobbling floor. Self-healing: derives dock state from the
    // current camera mode every frame, so every path into the cab is covered.
    player.syncDock(rig.mode);

    train.paused = rig.mapEngaged;
    train.update(dt, elapsed, obstacles);

    // fog peels back as the train travels — re-stamp the forward cone every
    // few units so it reveals as far ahead as the cutaway view can see.
    if (train.distanceTraveled - state.lastRevealAt >= TUNING.revealEvery) {
      state.lastRevealAt = train.distanceTraveled;
      revealAhead();
    }

    // arrival at the current goal — gentle, fires once per goal via the stage
    // machine (each branch advances `stage` so the test can never re-fire).
    // 'streaming' is the brief gap while the grassland builds behind the card.
    if (stage !== 'done' && stage !== 'streaming') {
      const d = Math.hypot(train.pos.x - goalPos.x, train.pos.z - goalPos.z);
      if (d < world.arriveRadius) {
        if (stage === 'prairie') {
          // reached the first tree. Pull up here: clearing the route empties the
          // waypoint queue and coasts the train to a stop (update() damps speed
          // to 0 with no route), so you rest at the tree rather than rolling on.
          train.clearRoute();
          // Put the full-screen card up FIRST, then build the grassland a paint
          // later (streamGrassland) so its hitch is hidden behind the card while
          // the player reads — never mid-gameplay.
          audio.chime('arrive');
          audio.setBiome('grassland'); // water/birds as you enter the wetland
          ui.arrival(); // the big "you've arrived" card — rest here, or roll on
          stage = 'streaming'; // freeze arrival logic until the build lands
          streamGrassland();
        } else {
          // reached the grassland tree — the end beat
          train.clearRoute();
          audio.chime('arrive');
          fog.reveal(goalPos.x, goalPos.z, 220);
          setTimeout(() => ui.endBeat(), 1400);
          stage = 'done';
        }
      }
    }
  }

  rig.update(dt, elapsed);
  rig.applySceneFog(scene.fog);
  fog.setBlend(rig.mapBlend);

  // see-through walls follow the player; book mode seals the whole train
  const zone =
    player.level === 'roof' && player.x > CAB_FROM_X
      ? 'cab'
      : 'car' + (player.x > 8.3 ? 0 : player.x < -8.3 ? 2 : 1);
  train.setFocus(zone, rig.mode === 'book' || rig.transitionTarget === 'book', dt);

  train.updateRouteDisplay(rig.mapBlend, elapsed);
  ui.setGauges(train.eff, train.wear);
  ui.setMode(rig.busy ? (rig.mapEngaged ? 'map' : 'transition') : rig.mode);
  ui.setOrbitActive(rig.autoOrbit);
  // Edge markers are a map-view aid only — point to the tree (and back to the
  // train) along the map's borders, hidden in the inhabit and book views.
  if (state.started && rig.mapEngaged) {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    ui.setEdgeMarker('tree', placeMarker(goalPos.x, goalPos.z), W, H);
    ui.setEdgeMarker('train', placeMarker(train.pos.x, train.pos.z), W, H);
  } else {
    ui.hideEdgeMarkers();
  }
  world.update(dt, elapsed, train.pos, camera.position);
  if (grassland) grassland.update(dt, elapsed, train.pos, camera.position);
  sky.update(dt, elapsed, camera, train.pos, scene.fog);
  audio.update(dt, train.speed / TUNING.baseSpeed);

  pressedThisFrame.clear();
  renderer.render(scene, camera);
}

tick();

// debug / verification handle. grassland/obstacles/goalPos are getters so they
// always reflect the live progression state.
window.__game = {
  train, player, rig, fog, state, sky, camera, WORLD,
  get grassland() { return grassland; },
  get obstacles() { return obstacles; },
  get goalPos() { return goalPos; },
  // warp the train ~150u SHORT of the active goal so you can drive into it and
  // watch the streaming / end beat happen. Returns a status line (reset itself
  // returns nothing) — then drive in from the cab, or use driveToTree().
  warpToTree: () => {
    train.reset({ x: goalPos.x - 150, z: goalPos.z, heading: 0 });
    return `warped to (${Math.round(train.pos.x)}, ${Math.round(train.pos.z)}); goal at (${goalPos.x}, ${goalPos.z}). Route cleared — drive in from the cab, or run __game.driveToTree().`;
  },
  // warp short AND auto-route into the goal so it drives in on its own.
  driveToTree: () => {
    train.reset({ x: goalPos.x - 150, z: goalPos.z, heading: 0 });
    train.addWaypoint(goalPos.x, goalPos.z);
    return `driving into goal at (${goalPos.x}, ${goalPos.z})…`;
  },
};
